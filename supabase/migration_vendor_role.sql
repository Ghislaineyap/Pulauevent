-- Migration: a third account type — Vendor (venues, caterers, decor, AV,
-- etc.) alongside Freelancer and Organizer. A vendor has its own profile
-- (name, logo, portfolio images, a link to their site, location, an
-- optional price range) and applies to / gets booked onto specific events,
-- the same two-path model (apply to an open call, or get invited directly)
-- freelancers already use — just against its own parallel set of tables
-- (vendor_slots/vendor_applications) rather than job_divisions/applications,
-- since a vendor booking doesn't carry a jobdesk/rate-negotiation the same
-- way a freelancer role does.
--
-- Run this once in Supabase's SQL Editor, on top of the existing schema.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- profiles.role gains 'vendor'. Postgres can't ALTER a check constraint in
-- place, so drop and recreate it under the same auto-generated name Postgres
-- would have given the original (the "profiles_role_check" default from
-- "check (role in (...))" in schema.sql).
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('freelancer', 'organizer', 'vendor'));

create table if not exists public.vendor_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  vendor_name text not null,
  category text, -- free text, same vocabulary as VENDOR_CATEGORIES in VendorRoster.jsx — not a foreign key, same reasoning
  logo_url text, -- public URL in the "avatars" storage bucket, same pattern as freelancer/organizer logos
  portfolio_urls text[] not null default '{}', -- public URLs in the "vendor-portfolio" bucket
  website_url text, -- "Details" field from the spec — a link to their site/portfolio, not a free-text bio
  locations text[] not null default '{}', -- same multi-location convention as freelancer_profiles
  price_range text, -- free text ("Rp 5jt–15jt", "Contact for quote") — deliberately not a number, ranges vary too much to force into one, and it's optional
  created_at timestamptz not null default now()
);

alter table public.vendor_profiles enable row level security;

create policy "vendor profiles are browsable by signed-in users" on public.vendor_profiles
  for select using (auth.role() = 'authenticated');
create policy "a vendor can insert their own profile" on public.vendor_profiles
  for insert with check (auth.uid() = id);
create policy "a vendor can update their own profile" on public.vendor_profiles
  for update using (auth.uid() = id);

grant select, insert, update, delete on public.vendor_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- vendor_slots: an organizer's open call for a vendor category on a specific
-- event (mirrors job_divisions). vendor_applications: a vendor applying to
-- one, or an organizer inviting a specific vendor directly (mirrors
-- applications).
-- ---------------------------------------------------------------------------
create table if not exists public.vendor_slots (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  category text not null,
  quantity integer not null default 1,
  notes text, -- what the organizer needs from this vendor, shown to applicants
  budget_amount numeric,
  budget_type text check (budget_type in ('hourly', 'daily', 'flat')),
  filled_count integer not null default 0,
  open_recruit boolean not null default true, -- private (invite-only) until opened up to public applicants, same as job_divisions
  created_at timestamptz not null default now()
);

create index if not exists vendor_slots_job_id_idx on public.vendor_slots (job_id);

create table if not exists public.vendor_applications (
  id uuid primary key default uuid_generate_v4(),
  slot_id uuid not null references public.vendor_slots(id) on delete cascade,
  vendor_id uuid not null references public.vendor_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'invited', 'cancelled')),
  source text not null default 'applied' check (source in ('applied', 'invited')),
  created_at timestamptz not null default now(),
  unique (slot_id, vendor_id)
);

create index if not exists vendor_applications_vendor_id_idx on public.vendor_applications (vendor_id);

alter table public.vendor_slots enable row level security;
alter table public.vendor_applications enable row level security;

drop policy if exists "organizer manages their own vendor slots" on public.vendor_slots;
create policy "organizer manages their own vendor slots" on public.vendor_slots
  for all using (public.is_job_organizer(job_id)) with check (public.is_job_organizer(job_id));

drop policy if exists "vendors can browse open vendor slots" on public.vendor_slots;
create policy "vendors can browse open vendor slots" on public.vendor_slots
  for select using (open_recruit = true);

drop policy if exists "organizer manages applications on their own vendor slots" on public.vendor_applications;
create policy "organizer manages applications on their own vendor slots" on public.vendor_applications
  for all using (
    exists (select 1 from public.vendor_slots s where s.id = slot_id and public.is_job_organizer(s.job_id))
  ) with check (
    exists (select 1 from public.vendor_slots s where s.id = slot_id and public.is_job_organizer(s.job_id))
  );

drop policy if exists "a vendor can read their own applications" on public.vendor_applications;
create policy "a vendor can read their own applications" on public.vendor_applications
  for select using (auth.uid() = vendor_id);

drop policy if exists "a vendor can apply to an open slot" on public.vendor_applications;
create policy "a vendor can apply to an open slot" on public.vendor_applications
  for insert with check (
    auth.uid() = vendor_id
    and status = 'pending'
    and exists (select 1 from public.vendor_slots s where s.id = slot_id and s.open_recruit = true)
  );

-- A vendor can only withdraw (cancel) — accepting/declining an invite is a
-- separate, deliberately narrower update than "any field, any status" so a
-- vendor can't self-accept a booking.
drop policy if exists "a vendor can respond to their own applications" on public.vendor_applications;
create policy "a vendor can respond to their own applications" on public.vendor_applications
  for update using (auth.uid() = vendor_id) with check (auth.uid() = vendor_id and status in ('accepted', 'declined', 'cancelled'));

grant select, insert, update, delete on public.vendor_slots to authenticated;
grant select, insert, update, delete on public.vendor_applications to authenticated;

-- ---------------------------------------------------------------------------
-- Same effects as handle_application_accepted() (migration_auto_open_chat.sql)
-- but for vendor_applications/vendor_slots: open the event's team chat, fill
-- the slot, auto-decline the rest once it's full.
-- ---------------------------------------------------------------------------
create or replace function public.handle_vendor_application_accepted()
returns trigger as $$
declare
  v_job_id uuid;
  v_quantity integer;
  v_filled_count integer;
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    select s.job_id, s.quantity into v_job_id, v_quantity
    from public.vendor_slots s
    where s.id = new.slot_id;

    update public.job_postings
    set chat_opened_at = coalesce(chat_opened_at, now())
    where id = v_job_id;

    update public.vendor_slots
    set filled_count = filled_count + 1
    where id = new.slot_id
    returning filled_count into v_filled_count;

    if v_filled_count >= v_quantity then
      update public.vendor_applications
      set status = 'declined'
      where slot_id = new.slot_id and status in ('pending', 'invited') and id <> new.id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_vendor_application_accepted on public.vendor_applications;
create trigger on_vendor_application_accepted
  after update on public.vendor_applications
  for each row execute function public.handle_vendor_application_accepted();

-- ---------------------------------------------------------------------------
-- Team-scoped access (event_documents, event_tasks, and the event group
-- chat) now covers an accepted vendor the same way it already covers an
-- accepted freelancer — extending this one helper is enough for Documents
-- and Tasks (both already call it); job_chat_messages' two policies get
-- switched from their inlined freelancer-only check to this helper too, so
-- there's exactly one definition of "is this person on the team."
-- ---------------------------------------------------------------------------
create or replace function public.is_confirmed_on_job(p_job_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.applications a
    join public.job_divisions jd on jd.id = a.division_id
    where jd.job_id = p_job_id
      and a.freelancer_id = auth.uid()
      and a.status = 'accepted'
  ) or exists (
    select 1 from public.vendor_applications va
    join public.vendor_slots vs on vs.id = va.slot_id
    where vs.job_id = p_job_id
      and va.vendor_id = auth.uid()
      and va.status = 'accepted'
  );
$$;

drop policy if exists "job team members can read the event chat" on public.job_chat_messages;
create policy "job team members can read the event chat" on public.job_chat_messages
  for select using (
    exists (
      select 1 from public.job_postings jp
      where jp.id = job_chat_messages.job_id and jp.organizer_id = auth.uid() and jp.chat_opened_at is not null
    )
    or (public.is_confirmed_on_job(job_chat_messages.job_id) and exists (
      select 1 from public.job_postings jp where jp.id = job_chat_messages.job_id and jp.chat_opened_at is not null
    ))
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
      or (public.is_confirmed_on_job(job_chat_messages.job_id) and exists (
        select 1 from public.job_postings jp where jp.id = job_chat_messages.job_id and jp.chat_opened_at is not null
      ))
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: vendor logo reuses the existing "avatars" bucket (same shape as a
-- freelancer/organizer logo — public read, write locked to the user's own
-- folder). Portfolio images get their own public bucket since there can be
-- several per vendor.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vendor-portfolio', 'vendor-portfolio', true)
on conflict (id) do nothing;

drop policy if exists "vendor portfolio images are publicly readable" on storage.objects;
create policy "vendor portfolio images are publicly readable" on storage.objects
  for select using (bucket_id = 'vendor-portfolio');

drop policy if exists "a vendor can upload their own portfolio images" on storage.objects;
create policy "a vendor can upload their own portfolio images" on storage.objects
  for insert with check (bucket_id = 'vendor-portfolio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "a vendor can replace their own portfolio images" on storage.objects;
create policy "a vendor can replace their own portfolio images" on storage.objects
  for update using (bucket_id = 'vendor-portfolio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "a vendor can delete their own portfolio images" on storage.objects;
create policy "a vendor can delete their own portfolio images" on storage.objects
  for delete using (bucket_id = 'vendor-portfolio' and (storage.foldername(name))[1] = auth.uid()::text);
