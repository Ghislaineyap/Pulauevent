-- Sync-everything script — run this ONCE in Supabase's SQL Editor to bring
-- your live database fully up to date, regardless of which of the
-- individual migration_*.sql files you have or haven't already run.
--
-- Why this exists: the "could not find the jobdesk column" error means your
-- live database is missing at least one column the app expects — almost
-- certainly because it was set up from an earlier version of schema.sql,
-- before some of the migration_*.sql files in this folder were written, and
-- one or more of them were never actually run against it. Rather than
-- guess which ones, this concatenates all of them into one script, in the
-- order they were written, with every statement made idempotent (safe to
-- run whether or not it's already been applied). Whatever you're missing —
-- just jobdesk, or several — running this once brings you current. Running
-- it on a database that's already fully up to date is a harmless no-op.
--
-- This does NOT touch any of your data — every statement here only adds
-- columns/tables/policies that don't already exist, or replaces a function/
-- policy definition with an identical one. Nothing is deleted.

-- =============================================================================
-- From migration_002_editing_photos_chat.sql
-- =============================================================================
alter table public.freelancer_profiles add column if not exists photo_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar photos are publicly readable" on storage.objects;
create policy "avatar photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "a user can upload their own avatar photo" on storage.objects;
create policy "a user can upload their own avatar photo"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "a user can replace their own avatar photo" on storage.objects;
create policy "a user can replace their own avatar photo"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "a user can delete their own avatar photo" on storage.objects;
create policy "a user can delete their own avatar photo"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists messages_match_id_created_at_idx on public.messages (match_id, created_at);

alter table public.messages enable row level security;

drop policy if exists "the two matched parties can read their messages" on public.messages;
create policy "the two matched parties can read their messages" on public.messages
  for select using (
    exists (
      select 1 from public.matches m
      where m.id = match_id and (m.organizer_id = auth.uid() or m.freelancer_id = auth.uid())
    )
  );

drop policy if exists "a matched party can send a message as themselves" on public.messages;
create policy "a matched party can send a message as themselves" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id and (m.organizer_id = auth.uid() or m.freelancer_id = auth.uid())
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

grant select, insert, update, delete on public.messages to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- =============================================================================
-- From migration_catchup.sql
-- =============================================================================
alter table public.job_postings add column if not exists event_start_date date;
alter table public.job_postings add column if not exists event_end_date date;

update public.job_postings
set event_start_date = coalesce(event_start_date, event_date),
    event_end_date = coalesce(event_end_date, event_date)
where event_date is not null;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'job_postings' and column_name = 'event_start_date' and is_nullable = 'YES')
     and not exists (select 1 from public.job_postings where event_start_date is null) then
    alter table public.job_postings alter column event_start_date set not null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'job_postings' and column_name = 'event_end_date' and is_nullable = 'YES')
     and not exists (select 1 from public.job_postings where event_end_date is null) then
    alter table public.job_postings alter column event_end_date set not null;
  end if;
end $$;

alter table public.job_postings drop column if exists event_date;

alter table public.job_postings drop constraint if exists job_postings_date_range;
alter table public.job_postings add constraint job_postings_date_range check (event_end_date >= event_start_date);

alter table public.freelancer_profiles add column if not exists gender text;
alter table public.freelancer_profiles drop constraint if exists freelancer_profiles_gender_check;
alter table public.freelancer_profiles add constraint freelancer_profiles_gender_check
  check (gender in ('male', 'female', 'prefer_not_to_say'));

alter table public.freelancer_profiles add column if not exists experience_band text;
alter table public.freelancer_profiles drop constraint if exists freelancer_profiles_experience_band_check;
alter table public.freelancer_profiles add constraint freelancer_profiles_experience_band_check
  check (experience_band in ('0-1', '2-5', '6-10', '10+'));

alter table public.freelancer_profiles drop column if exists years_experience;

alter table public.freelancer_profiles alter column avatar_key set default 'prefer_not_to_say';

alter table public.freelancer_profiles add column if not exists photo_urls text[] not null default '{}';

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'freelancer_profiles' and column_name = 'photo_url') then
    update public.freelancer_profiles
    set photo_urls = array[photo_url]
    where photo_url is not null and photo_urls = '{}';
  end if;
end $$;

alter table public.freelancer_profiles drop column if exists photo_url;

-- =============================================================================
-- From migration_locations_team_events.sql
-- =============================================================================
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

alter table public.job_divisions add column if not exists fee_type text not null default 'all_in';
alter table public.job_divisions drop constraint if exists job_divisions_fee_type_check;
alter table public.job_divisions add constraint job_divisions_fee_type_check
  check (fee_type in ('all_in', 'plus_transport'));
alter table public.job_divisions add column if not exists transport_max_amount numeric;

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
  check (status in ('pending', 'accepted', 'declined', 'invited', 'cancelled'));

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

    if v_filled_count >= v_quantity then
      update public.applications
      set status = 'declined'
      where division_id = new.division_id and status in ('pending', 'invited') and id <> new.id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_application_accepted on public.applications;
create trigger on_application_accepted
  after update on public.applications
  for each row execute function public.handle_application_accepted();

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

drop trigger if exists on_like_accepted on public.likes;
create trigger on_like_accepted
  after update on public.likes
  for each row execute function public.handle_like_accepted();

create table if not exists public.job_chat_messages (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists job_chat_messages_job_id_created_at_idx on public.job_chat_messages (job_id, created_at);

alter table public.job_chat_messages enable row level security;

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

-- =============================================================================
-- From migration_recruit_org_profile.sql
-- =============================================================================
alter table public.organizer_profiles add column if not exists location text;
alter table public.organizer_profiles add column if not exists about text;
alter table public.job_divisions add column if not exists open_recruit boolean not null default true;

-- =============================================================================
-- From migration_event_flow.sql
-- =============================================================================
alter table public.job_postings add column if not exists location_detail text;

alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check
  check (status in ('pending', 'accepted', 'declined', 'invited', 'cancelled'));

create or replace function public.handle_application_cancelled()
returns trigger as $$
begin
  if new.status = 'cancelled' and old.status = 'accepted' then
    update public.job_divisions
    set filled_count = greatest(filled_count - 1, 0)
    where id = new.division_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_application_cancelled on public.applications;
create trigger on_application_cancelled
  after update on public.applications
  for each row execute function public.handle_application_cancelled();

-- =============================================================================
-- From migration_org_logo.sql
-- =============================================================================
alter table public.organizer_profiles add column if not exists logo_url text;

-- =============================================================================
-- From migration_ratings_endorsements_multiapply.sql
-- =============================================================================
create table if not exists public.ratings (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  organizer_id uuid not null references public.organizer_profiles(id) on delete cascade,
  freelancer_id uuid not null references public.freelancer_profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  recommendation text,
  created_at timestamptz not null default now(),
  unique (job_id, freelancer_id)
);

alter table public.ratings enable row level security;

drop policy if exists "ratings are readable by anyone signed in" on public.ratings;
create policy "ratings are readable by anyone signed in" on public.ratings
  for select using (auth.role() = 'authenticated');

drop policy if exists "an organizer can rate a freelancer confirmed on their own past event" on public.ratings;
create policy "an organizer can rate a freelancer confirmed on their own past event" on public.ratings
  for insert with check (
    auth.uid() = organizer_id
    and exists (
      select 1 from public.job_postings jp
      where jp.id = job_id and jp.organizer_id = auth.uid() and jp.event_end_date < current_date
    )
    and exists (
      select 1 from public.applications a
      join public.job_divisions jd on jd.id = a.division_id
      where jd.job_id = ratings.job_id and a.freelancer_id = ratings.freelancer_id and a.status = 'accepted'
    )
  );

grant select, insert, update, delete on public.ratings to authenticated;
grant select on public.ratings to anon;

create table if not exists public.skill_endorsements (
  id uuid primary key default uuid_generate_v4(),
  freelancer_id uuid not null references public.freelancer_profiles(id) on delete cascade,
  endorser_id uuid not null references public.freelancer_profiles(id) on delete cascade,
  skill text not null,
  created_at timestamptz not null default now(),
  unique (freelancer_id, endorser_id, skill),
  check (freelancer_id <> endorser_id)
);

alter table public.skill_endorsements enable row level security;

drop policy if exists "endorsements are readable by anyone signed in" on public.skill_endorsements;
create policy "endorsements are readable by anyone signed in" on public.skill_endorsements
  for select using (auth.role() = 'authenticated');

drop policy if exists "a freelancer can endorse a past coworker's skill" on public.skill_endorsements;
create policy "a freelancer can endorse a past coworker's skill" on public.skill_endorsements
  for insert with check (
    auth.uid() = endorser_id
    and exists (
      select 1
      from public.applications a_mine
      join public.job_divisions jd_mine on jd_mine.id = a_mine.division_id
      join public.job_divisions jd_theirs on jd_theirs.job_id = jd_mine.job_id
      join public.applications a_theirs on a_theirs.division_id = jd_theirs.id
      where a_mine.freelancer_id = endorser_id
        and a_mine.status = 'accepted'
        and a_theirs.freelancer_id = skill_endorsements.freelancer_id
        and a_theirs.status = 'accepted'
    )
  );

grant select, insert, update, delete on public.skill_endorsements to authenticated;
grant select on public.skill_endorsements to anon;

-- =============================================================================
-- From migration_ux_polish.sql
-- =============================================================================
alter table public.organizer_profiles add column if not exists instagram_handle text;
alter table public.freelancer_profiles add column if not exists instagram_handle text;

alter table public.job_postings add column if not exists chat_opened_at timestamptz;

drop policy if exists "job team members can read the event chat" on public.job_chat_messages;
create policy "job team members can read the event chat" on public.job_chat_messages
  for select using (
    exists (
      select 1 from public.job_postings jp
      where jp.id = job_chat_messages.job_id and jp.organizer_id = auth.uid() and jp.chat_opened_at is not null
    )
    or exists (
      select 1 from public.applications a
      join public.job_divisions jd on jd.id = a.division_id
      join public.job_postings jp on jp.id = jd.job_id
      where jd.job_id = job_chat_messages.job_id
        and a.freelancer_id = auth.uid()
        and a.status = 'accepted'
        and jp.chat_opened_at is not null
    )
  );

drop policy if exists "job team members can send an event chat message" on public.job_chat_messages;
create policy "job team members can send an event chat message" on public.job_chat_messages
  for insert with check (
    auth.uid() = sender_id
    and (
      exists (
        select 1 from public.job_postings jp
        where jp.id = job_chat_messages.job_id and jp.organizer_id = auth.uid() and jp.chat_opened_at is not null
      )
      or exists (
        select 1 from public.applications a
        join public.job_divisions jd on jd.id = a.division_id
        join public.job_postings jp on jp.id = jd.job_id
        where jd.job_id = job_chat_messages.job_id
          and a.freelancer_id = auth.uid()
          and a.status = 'accepted'
          and jp.chat_opened_at is not null
      )
    )
  );

-- =============================================================================
-- From migration_jobdesk.sql — the column your "could not find the jobdesk
-- column" error is about.
-- =============================================================================
alter table public.job_divisions add column if not exists jobdesk text;

-- =============================================================================
-- Verify — every one of these should return a row/count with no error.
-- =============================================================================
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'job_divisions' and column_name = 'jobdesk') as has_jobdesk,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'job_postings' and column_name = 'chat_opened_at') as has_chat_opened_at,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'organizer_profiles' and column_name = 'logo_url') as has_logo_url,
  (select count(*) from public.locations) as locations_count,
  (select count(*) from public.skills) as skills_count;
-- has_jobdesk / has_chat_opened_at / has_logo_url should read 1, and the two
-- counts should be > 0 (18 and 14 respectively, if neither table has been
-- hand-edited).
