-- Migration: unified locations, fee/transport disclosure, the team roster +
-- direct-invite feature, and group event chat. Run this once in Supabase's
-- SQL Editor, on top of your existing database.

-- ---------------------------------------------------------------------------
-- 1. Curated locations, same pattern as the skills table — lets freelancers
--    and job postings pick from a consistent list instead of free-typing a
--    city name, so Discover/Job Feed location filters actually match.
-- ---------------------------------------------------------------------------
create table if not exists public.locations (
  id serial primary key,
  label text not null unique,
  sort_order int not null default 0
);

insert into public.locations (label, sort_order) values
  ('Jakarta', 1), ('Bandung', 2), ('Surabaya', 3), ('Bali (Denpasar)', 4), ('Yogyakarta', 5),
  ('Semarang', 6), ('Medan', 7), ('Makassar', 8), ('Palembang', 9), ('Malang', 10),
  ('Bogor', 11), ('Depok', 12), ('Tangerang', 13), ('Bekasi', 14), ('Batam', 15),
  ('Balikpapan', 16), ('Solo (Surakarta)', 17), ('Manado', 18)
on conflict (label) do nothing;

alter table public.locations enable row level security;
drop policy if exists "locations are readable by anyone signed in" on public.locations;
create policy "locations are readable by anyone signed in" on public.locations
  for select using (auth.role() = 'authenticated');

grant select on public.locations to authenticated;
grant select on public.locations to anon;

-- ---------------------------------------------------------------------------
-- 2. Fee/transport disclosure per division — shown on the job post so
--    applicants know upfront whether the fee is all-in or transport gets
--    reimbursed separately (and up to how much, if capped).
-- ---------------------------------------------------------------------------
alter table public.job_divisions add column if not exists fee_type text not null default 'all_in';
alter table public.job_divisions drop constraint if exists job_divisions_fee_type_check;
alter table public.job_divisions add constraint job_divisions_fee_type_check
  check (fee_type in ('all_in', 'plus_transport'));
alter table public.job_divisions add column if not exists transport_max_amount numeric;

-- ---------------------------------------------------------------------------
-- 3. Applications gain a "source" (organizer-invited vs freelancer-applied)
--    and an "invited" status, so an organizer can put a known team member
--    directly into a division — the freelancer still has to confirm.
-- ---------------------------------------------------------------------------
alter table public.applications add column if not exists source text not null default 'applied';
alter table public.applications drop constraint if exists applications_source_check;
alter table public.applications add constraint applications_source_check
  check (source in ('applied', 'invited'));

do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'public.applications'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%pending%accepted%declined%';
  if con_name is not null then
    execute format('alter table public.applications drop constraint %I', con_name);
  end if;
end $$;
alter table public.applications add constraint applications_status_check
  check (status in ('pending', 'accepted', 'declined', 'invited'));

drop policy if exists "an organizer can invite a team member into their own division" on public.applications;
create policy "an organizer can invite a team member into their own division" on public.applications
  for insert with check (
    source = 'invited'
    and status = 'invited'
    and exists (
      select 1 from public.job_divisions jd
      join public.job_postings jp on jp.id = jd.job_id
      where jd.id = division_id and jp.organizer_id = auth.uid()
    )
  );

drop policy if exists "a freelancer can respond to an invitation" on public.applications;
create policy "a freelancer can respond to an invitation" on public.applications
  for update using (auth.uid() = freelancer_id and source = 'invited');

-- ---------------------------------------------------------------------------
-- 4. Team roster: an organizer's list of freelancers they've worked with or
--    added directly. Auto-added on any match; manually addable from a
--    freelancer's profile page.
-- ---------------------------------------------------------------------------
create table if not exists public.team_members (
  id uuid primary key default uuid_generate_v4(),
  organizer_id uuid not null references public.organizer_profiles(id) on delete cascade,
  freelancer_id uuid not null references public.freelancer_profiles(id) on delete cascade,
  source text not null default 'manual' check (source in ('connection', 'manual')),
  created_at timestamptz not null default now(),
  unique (organizer_id, freelancer_id)
);

alter table public.team_members enable row level security;

drop policy if exists "an organizer can read their own team" on public.team_members;
create policy "an organizer can read their own team" on public.team_members
  for select using (auth.uid() = organizer_id);

drop policy if exists "an organizer can add to their own team" on public.team_members;
create policy "an organizer can add to their own team" on public.team_members
  for insert with check (auth.uid() = organizer_id);

grant select, insert, update, delete on public.team_members to authenticated;
grant select on public.team_members to anon;

-- ---------------------------------------------------------------------------
-- 5. Update the two match-creating trigger functions: auto-decline now also
--    covers outstanding invites (not just pending applications), and both
--    paths auto-add the freelancer to the organizer's team roster.
-- ---------------------------------------------------------------------------
create or replace function public.handle_application_accepted()
returns trigger as $$
declare
  v_organizer_id uuid;
  v_quantity integer;
  v_filled_count integer;
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    select jp.organizer_id, jd.quantity into v_organizer_id, v_quantity
    from public.job_divisions jd
    join public.job_postings jp on jp.id = jd.job_id
    where jd.id = new.division_id;

    insert into public.matches (organizer_id, freelancer_id, source, source_id)
    values (v_organizer_id, new.freelancer_id, 'application', new.id)
    on conflict (organizer_id, freelancer_id) do nothing;

    insert into public.team_members (organizer_id, freelancer_id, source)
    values (v_organizer_id, new.freelancer_id, 'connection')
    on conflict (organizer_id, freelancer_id) do nothing;

    update public.job_divisions
    set filled_count = filled_count + 1
    where id = new.division_id
    returning filled_count into v_filled_count;

    -- A division can need more than one person. Once enough are accepted to
    -- fill it, auto-decline everyone else still pending OR invited for the
    -- same role so the organizer doesn't have to clean up manually.
    if v_filled_count >= v_quantity then
      update public.applications
      set status = 'declined'
      where division_id = new.division_id and status in ('pending', 'invited') and id <> new.id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create or replace function public.handle_like_accepted()
returns trigger as $$
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    insert into public.matches (organizer_id, freelancer_id, source, source_id)
    values (new.organizer_id, new.freelancer_id, 'like', new.id)
    on conflict (organizer_id, freelancer_id) do nothing;

    insert into public.team_members (organizer_id, freelancer_id, source)
    values (new.organizer_id, new.freelancer_id, 'connection')
    on conflict (organizer_id, freelancer_id) do nothing;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 6. Group event chat: everyone confirmed on a job (the organizer + every
--    freelancer accepted into any of its divisions) shares one thread, named
--    after the event. Replaces the 1:1 chat for job-based connections; a
--    Discover-sourced ("like") connection keeps its existing 1:1 chat since
--    there's no specific job attached to it.
-- ---------------------------------------------------------------------------
create table if not exists public.job_chat_messages (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists job_chat_messages_job_id_created_at_idx on public.job_chat_messages (job_id, created_at);

alter table public.job_chat_messages enable row level security;

drop policy if exists "job team members can read the event chat" on public.job_chat_messages;
create policy "job team members can read the event chat" on public.job_chat_messages
  for select using (
    exists (select 1 from public.job_postings jp where jp.id = job_id and jp.organizer_id = auth.uid())
    or exists (
      select 1 from public.applications a
      join public.job_divisions jd on jd.id = a.division_id
      where jd.job_id = job_chat_messages.job_id and a.freelancer_id = auth.uid() and a.status = 'accepted'
    )
  );

drop policy if exists "job team members can send an event chat message" on public.job_chat_messages;
create policy "job team members can send an event chat message" on public.job_chat_messages
  for insert with check (
    auth.uid() = sender_id
    and (
      exists (select 1 from public.job_postings jp where jp.id = job_id and jp.organizer_id = auth.uid())
      or exists (
        select 1 from public.applications a
        join public.job_divisions jd on jd.id = a.division_id
        where jd.job_id = job_chat_messages.job_id and a.freelancer_id = auth.uid() and a.status = 'accepted'
      )
    )
  );

grant select, insert, update, delete on public.job_chat_messages to authenticated;
grant select on public.job_chat_messages to anon;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'job_chat_messages'
  ) then
    alter publication supabase_realtime add table public.job_chat_messages;
  end if;
end $$;
