-- Vendor Connect — core schema (v1: profiles, job postings, applications, likes, matches)
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query > paste > Run).
-- Safe to re-run: uses "if not exists" / "or replace" where possible, but on a second run
-- the sample skills insert will just no-op on the unique constraint conflict.

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Curated skill list, drives the multi-select on the freelancer profile form.
-- Freelancer profiles store their chosen skills as a text[] referencing these
-- labels (plus a free-typed "Other: ..." entry), not a foreign key — keeps
-- the UI simple while still giving organizers a consistent set to filter by.
-- ---------------------------------------------------------------------------
create table if not exists public.skills (
  id serial primary key,
  label text not null unique,
  sort_order int not null default 0
);

insert into public.skills (label, sort_order) values
  ('Runner', 1), ('Stage Manager', 2), ('Liaison Officer (LO)', 3), ('Usher', 4),
  ('MC', 5), ('Photographer', 6), ('Videographer', 7), ('Decorator', 8),
  ('Caterer', 9), ('Security', 10), ('Sound Engineer', 11), ('Lighting Technician', 12),
  ('Talent Coordinator', 13), ('Logistics', 14)
on conflict (label) do nothing;

-- ---------------------------------------------------------------------------
-- Curated location list, same pattern as skills — freelancers and job
-- postings pick from this instead of free-typing a city, so location filters
-- on Discover/Job Feed actually match reliably.
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

-- ---------------------------------------------------------------------------
-- One row per authenticated user (auth.users), holds just the role.
-- Freelancer/organizer/vendor detail lives in its own table below.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('freelancer', 'organizer', 'vendor')),
  created_at timestamptz not null default now()
);

create table if not exists public.freelancer_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  name text not null,
  gender text check (gender in ('male', 'female', 'prefer_not_to_say')),
  locations text[] not null default '{}', -- freelancer can cover more than one city/area; no extra cost to organizers either way
  avatar_key text not null default 'prefer_not_to_say', -- see src/lib/avatars.js — mirrors gender, fallback when no photo is uploaded
  photo_urls text[] not null default '{}', -- up to 3 public URLs in the "avatars" storage bucket; empty means "use the preset avatar instead"
  pitch text,
  rate_amount numeric,
  rate_type text check (rate_type in ('hourly', 'daily')),
  skills text[] not null default '{}',
  work_history text,
  experience_band text check (experience_band in ('0-1', '2-5', '6-10', '10+')),
  instagram_handle text, -- optional, visible legitimacy signal — not verification
  updated_at timestamptz not null default now()
);

create table if not exists public.organizer_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  org_name text not null,
  hide_name boolean not null default false, -- unused: organizer identity is never hidden from freelancers (kept only for backward compatibility, no longer read or written by the app)
  instagram_handle text, -- optional, visible legitimacy signal — not verification
  location text, -- where they're based, from the same curated `locations` list
  about text, -- short blurb: what kind of events they run
  logo_url text, -- public URL in the "avatars" storage bucket, same pattern as freelancer photos
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Path A: organizer posts a job with one or more divisions (roles needed),
-- each with its own headcount and budget. Freelancers apply to one division.
-- ---------------------------------------------------------------------------
create table if not exists public.job_postings (
  id uuid primary key default uuid_generate_v4(),
  organizer_id uuid not null references public.organizer_profiles(id) on delete cascade,
  title text not null,
  description text,
  location text not null,
  location_detail text, -- free-text venue/address detail, separate from the curated location above
  event_start_date date not null,
  event_end_date date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  constraint job_postings_date_range check (event_end_date >= event_start_date),
  -- Group event chat only appears once the organizer explicitly opens it
  -- (an "Event Manager" control) — not automatically on first acceptance.
  chat_opened_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.job_divisions (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  skill text not null,
  quantity integer not null default 1,
  -- What someone in this role actually does — shown to applicants so they
  -- understand the job before applying, not just the role title.
  jobdesk text,
  budget_amount numeric,
  budget_type text check (budget_type in ('hourly', 'daily', 'flat')),
  filled_count integer not null default 0,
  -- Whether the fee is all-in or transport gets reimbursed separately (and
  -- up to how much, if capped) — shown on the job post so applicants know
  -- upfront.
  fee_type text not null default 'all_in' check (fee_type in ('all_in', 'plus_transport')),
  transport_max_amount numeric,
  -- Private (team-invite-only) until the organizer explicitly opens this
  -- role up to public applicants in the Job Feed.
  open_recruit boolean not null default true
);

create table if not exists public.applications (
  id uuid primary key default uuid_generate_v4(),
  division_id uuid not null references public.job_divisions(id) on delete cascade,
  freelancer_id uuid not null references public.freelancer_profiles(id) on delete cascade,
  -- 'invited' = an organizer put a known team member directly into this
  -- division; the freelancer still has to confirm (transitions to accepted
  -- or declined), same as a freelancer-initiated ('applied') application.
  -- 'cancelled' = was accepted, then removed (dropped out / swapped out) —
  -- distinct from 'declined' (never accepted in the first place) so the
  -- freelancer sees an honest label, and it's what the trigger below keys
  -- off of to free the slot back up.
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'invited', 'cancelled')),
  source text not null default 'applied' check (source in ('applied', 'invited')),
  created_at timestamptz not null default now(),
  unique (division_id, freelancer_id)
);

-- ---------------------------------------------------------------------------
-- Two small security-definer helpers — they only ever check auth.uid()
-- against a job_id the caller supplies, so it's safe to let them bypass RLS
-- on job_postings/job_divisions/applications/vendor_slots/vendor_applications
-- to answer "does this person belong to this job, and how." Defined here
-- (rather than down by event_documents, where they were first introduced)
-- since job_chat_messages and vendor_slots/vendor_applications below also
-- need them, and both come before event_documents in the file.
-- ---------------------------------------------------------------------------
create or replace function public.is_job_organizer(p_job_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.job_postings jp
    where jp.id = p_job_id and jp.organizer_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Vendor account type: its own profile (name, logo, portfolio images, a
-- link to their site, location, an optional price range) plus its own
-- parallel apply/get-booked tables (vendor_slots/vendor_applications,
-- mirroring job_divisions/applications) since a vendor booking doesn't
-- carry a jobdesk/rate-negotiation the same way a freelancer role does.
-- ---------------------------------------------------------------------------
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

alter table public.vendor_slots enable row level security;

create policy "organizer manages their own vendor slots" on public.vendor_slots
  for all using (public.is_job_organizer(job_id)) with check (public.is_job_organizer(job_id));
create policy "vendors can browse open vendor slots" on public.vendor_slots
  for select using (open_recruit = true);

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

alter table public.vendor_applications enable row level security;

create policy "organizer manages applications on their own vendor slots" on public.vendor_applications
  for all using (
    exists (select 1 from public.vendor_slots s where s.id = slot_id and public.is_job_organizer(s.job_id))
  ) with check (
    exists (select 1 from public.vendor_slots s where s.id = slot_id and public.is_job_organizer(s.job_id))
  );
create policy "a vendor can read their own applications" on public.vendor_applications
  for select using (auth.uid() = vendor_id);
create policy "a vendor can apply to an open slot" on public.vendor_applications
  for insert with check (
    auth.uid() = vendor_id
    and status = 'pending'
    and exists (select 1 from public.vendor_slots s where s.id = slot_id and s.open_recruit = true)
  );
-- A vendor can only withdraw (cancel) — accepting/declining an invite is a
-- separate, deliberately narrower update than "any field, any status" so a
-- vendor can't self-accept a booking.
create policy "a vendor can respond to their own applications" on public.vendor_applications
  for update using (auth.uid() = vendor_id) with check (auth.uid() = vendor_id and status in ('accepted', 'declined', 'cancelled'));

-- Depends on vendor_slots/vendor_applications above, so it's defined here
-- rather than alongside is_job_organizer.
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

-- Same effects as handle_application_accepted() below, but for
-- vendor_applications/vendor_slots: open the event's team chat, fill the
-- slot, auto-decline the rest once it's full.
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

grant select, insert, update, delete on public.vendor_profiles to authenticated;
grant select, insert, update, delete on public.vendor_slots to authenticated;
grant select, insert, update, delete on public.vendor_applications to authenticated;

-- ---------------------------------------------------------------------------
-- Path B: organizer browses freelancer profiles directly and "likes" one.
-- The freelancer sees it as a pending like and accepts or declines.
-- ---------------------------------------------------------------------------
create table if not exists public.likes (
  id uuid primary key default uuid_generate_v4(),
  organizer_id uuid not null references public.organizer_profiles(id) on delete cascade,
  freelancer_id uuid not null references public.freelancer_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (organizer_id, freelancer_id)
);

-- ---------------------------------------------------------------------------
-- A match is created automatically (see triggers below) whenever an
-- application or a like transitions to 'accepted'. Never insert into this
-- table directly from the client.
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default uuid_generate_v4(),
  organizer_id uuid not null references public.organizer_profiles(id) on delete cascade,
  freelancer_id uuid not null references public.freelancer_profiles(id) on delete cascade,
  source text not null check (source in ('application', 'like')),
  source_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organizer_id, freelancer_id)
);

-- ---------------------------------------------------------------------------
-- Auto-create a match when an application is accepted by the organizer.
-- ---------------------------------------------------------------------------
create or replace function public.handle_application_accepted()
returns trigger as $$
declare
  v_organizer_id uuid;
  v_job_id uuid;
  v_quantity integer;
  v_filled_count integer;
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    select jp.organizer_id, jp.id, jd.quantity into v_organizer_id, v_job_id, v_quantity
    from public.job_divisions jd
    join public.job_postings jp on jp.id = jd.job_id
    where jd.id = new.division_id;

    insert into public.matches (organizer_id, freelancer_id, source, source_id)
    values (v_organizer_id, new.freelancer_id, 'application', new.id)
    on conflict (organizer_id, freelancer_id) do nothing;

    insert into public.team_members (organizer_id, freelancer_id, source)
    values (v_organizer_id, new.freelancer_id, 'connection')
    on conflict (organizer_id, freelancer_id) do nothing;

    -- Being accepted means you're on the team — get straight into the group
    -- chat instead of waiting on the organizer to remember to switch it on.
    update public.job_postings
    set chat_opened_at = coalesce(chat_opened_at, now())
    where id = v_job_id;

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

drop trigger if exists on_application_accepted on public.applications;
create trigger on_application_accepted
  after update on public.applications
  for each row execute function public.handle_application_accepted();

-- ---------------------------------------------------------------------------
-- Removing a confirmed team member frees their slot — automatically, so it
-- can be re-filled (another team invite, or publicly if "Open recruit" is
-- on) without the organizer having to touch anything else.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Auto-create a match when a like is accepted by the freelancer.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- v1 simplification worth knowing: freelancer_profiles and organizer_profiles
-- are readable in full by any signed-in user (that's what makes browsing/
-- discovery work). The "hide organizer name until match" behavior is
-- enforced by the FRONTEND, not the database — a technically determined user
-- could query organizer_profiles directly and see org_name pre-match. Fine
-- for a v1 prototype; hardening this properly means moving the read behind a
-- Postgres view or RPC function that redacts org_name when no match exists,
-- which is a reasonable fast-follow, not a launch blocker.
-- ---------------------------------------------------------------------------
alter table public.skills enable row level security;
alter table public.profiles enable row level security;
alter table public.freelancer_profiles enable row level security;
alter table public.organizer_profiles enable row level security;
alter table public.job_postings enable row level security;
alter table public.job_divisions enable row level security;
alter table public.applications enable row level security;
alter table public.likes enable row level security;
alter table public.matches enable row level security;

create policy "skills are readable by anyone signed in" on public.skills
  for select using (auth.role() = 'authenticated');

create policy "a user can read own profile row" on public.profiles
  for select using (auth.uid() = id);
create policy "a user can insert own profile row" on public.profiles
  for insert with check (auth.uid() = id);

create policy "freelancer profiles are browsable by signed-in users" on public.freelancer_profiles
  for select using (auth.role() = 'authenticated');
create policy "a freelancer can insert their own profile" on public.freelancer_profiles
  for insert with check (auth.uid() = id);
create policy "a freelancer can update their own profile" on public.freelancer_profiles
  for update using (auth.uid() = id);

create policy "organizer profiles are browsable by signed-in users" on public.organizer_profiles
  for select using (auth.role() = 'authenticated');
create policy "an organizer can insert their own profile" on public.organizer_profiles
  for insert with check (auth.uid() = id);
create policy "an organizer can update their own profile" on public.organizer_profiles
  for update using (auth.uid() = id);

create policy "job postings are browsable by signed-in users" on public.job_postings
  for select using (auth.role() = 'authenticated');
create policy "an organizer can insert their own job postings" on public.job_postings
  for insert with check (auth.uid() = organizer_id);
create policy "an organizer can update their own job postings" on public.job_postings
  for update using (auth.uid() = organizer_id);
create policy "an organizer can delete their own job postings" on public.job_postings
  for delete using (auth.uid() = organizer_id);

create policy "job divisions are browsable by signed-in users" on public.job_divisions
  for select using (auth.role() = 'authenticated');
create policy "an organizer can manage divisions on their own postings" on public.job_divisions
  for all using (
    exists (select 1 from public.job_postings jp where jp.id = job_id and jp.organizer_id = auth.uid())
  );

create policy "a freelancer can read their own applications" on public.applications
  for select using (auth.uid() = freelancer_id);
create policy "an organizer can read applications on their own postings" on public.applications
  for select using (
    exists (
      select 1 from public.job_divisions jd
      join public.job_postings jp on jp.id = jd.job_id
      where jd.id = division_id and jp.organizer_id = auth.uid()
    )
  );
create policy "a freelancer can apply to a division" on public.applications
  for insert with check (auth.uid() = freelancer_id);
create policy "an organizer can update application status on their own postings" on public.applications
  for update using (
    exists (
      select 1 from public.job_divisions jd
      join public.job_postings jp on jp.id = jd.job_id
      where jd.id = division_id and jp.organizer_id = auth.uid()
    )
  );
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
create policy "a freelancer can respond to an invitation" on public.applications
  for update using (auth.uid() = freelancer_id and source = 'invited');

create policy "an organizer can read their own likes" on public.likes
  for select using (auth.uid() = organizer_id);
create policy "a freelancer can read likes sent to them" on public.likes
  for select using (auth.uid() = freelancer_id);
create policy "an organizer can send a like" on public.likes
  for insert with check (auth.uid() = organizer_id);
create policy "a freelancer can respond to a like" on public.likes
  for update using (auth.uid() = freelancer_id);

create policy "the two matched parties can read a match" on public.matches
  for select using (auth.uid() = organizer_id or auth.uid() = freelancer_id);
-- No insert/update/delete policy for matches: rows are created only by the
-- security-definer trigger functions above, never directly by a client.

-- ---------------------------------------------------------------------------
-- Team roster: an organizer's list of freelancers they've worked with or
-- added directly. Auto-added by the trigger functions above on any match;
-- manually addable from a freelancer's profile page.
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

create policy "an organizer can read their own team" on public.team_members
  for select using (auth.uid() = organizer_id);
create policy "an organizer can add to their own team" on public.team_members
  for insert with check (auth.uid() = organizer_id);

-- ---------------------------------------------------------------------------
-- In-app chat, scoped to one match. Only the two matched people can ever
-- read or write here — enforced below, not just by the UI routing to it.
-- ---------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default uuid_generate_v4(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists messages_match_id_created_at_idx on public.messages (match_id, created_at);

alter table public.messages enable row level security;

create policy "the two matched parties can read their messages" on public.messages
  for select using (
    exists (
      select 1 from public.matches m
      where m.id = match_id and (m.organizer_id = auth.uid() or m.freelancer_id = auth.uid())
    )
  );

create policy "a matched party can send a message as themselves" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id and (m.organizer_id = auth.uid() or m.freelancer_id = auth.uid())
    )
  );

-- Live delivery: add messages to Supabase's realtime publication so the chat
-- UI gets new rows pushed to it instead of needing to poll. Wrapped in a
-- check so re-running this script doesn't error if it's already added.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Group event chat: everyone confirmed on a job (the organizer + every
-- freelancer accepted into any of its divisions) shares one thread, named
-- after the event. This is what a job-based connection uses instead of the
-- 1:1 chat above; a Discover-sourced ("like") connection still uses the 1:1
-- chat since there's no specific job attached to it.
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

-- Reading/sending is gated on chat_opened_at — the organizer's "Event
-- Manager" control — not just on being organizer/accepted-team. This keeps
-- the chat from appearing before the organizer has actually locked in the
-- team (giving room for a last-minute swap first). is_confirmed_on_job
-- covers both an accepted freelancer and an accepted vendor.
create policy "job team members can read the event chat" on public.job_chat_messages
  for select using (
    exists (
      select 1 from public.job_postings jp
      where jp.id = job_chat_messages.job_id and jp.organizer_id = auth.uid() and jp.chat_opened_at is not null
    )
    or (
      public.is_confirmed_on_job(job_chat_messages.job_id)
      and exists (select 1 from public.job_postings jp where jp.id = job_chat_messages.job_id and jp.chat_opened_at is not null)
    )
  );

create policy "job team members can send an event chat message" on public.job_chat_messages
  for insert with check (
    auth.uid() = sender_id
    and (
      exists (
        select 1 from public.job_postings jp
        where jp.id = job_chat_messages.job_id and jp.organizer_id = auth.uid() and jp.chat_opened_at is not null
      )
      or (
        public.is_confirmed_on_job(job_chat_messages.job_id)
        and exists (select 1 from public.job_postings jp where jp.id = job_chat_messages.job_id and jp.chat_opened_at is not null)
      )
    )
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'job_chat_messages'
  ) then
    alter publication supabase_realtime add table public.job_chat_messages;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- One row per (user, chat) pair recording when that user last opened it —
-- powers unread-message badges in Connect's chat lists and per-event chat
-- buttons. Covers both chat kinds with one table: 'personal' rows point at
-- a matches.id, 'event' rows point at a job_postings.id. A missing row means
-- "never opened" — unread count then counts every message in that chat.
-- ---------------------------------------------------------------------------
create table if not exists public.chat_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_type text not null check (chat_type in ('personal', 'event')),
  chat_id uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, chat_type, chat_id)
);

alter table public.chat_reads enable row level security;

create policy "a user can read their own chat_reads" on public.chat_reads
  for select using (auth.uid() = user_id);
create policy "a user can upsert their own chat_reads" on public.chat_reads
  for insert with check (auth.uid() = user_id);
create policy "a user can update their own chat_reads" on public.chat_reads
  for update using (auth.uid() = user_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_reads'
  ) then
    alter publication supabase_realtime add table public.chat_reads;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Ratings: an organizer can rate + recommend a freelancer once the event's
-- end date has passed, for anyone who was actually confirmed on it. Unlocks
-- automatically — no manual "mark as done" step needed.
-- ---------------------------------------------------------------------------
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

create policy "ratings are readable by anyone signed in" on public.ratings
  for select using (auth.role() = 'authenticated');

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

-- ---------------------------------------------------------------------------
-- Skill endorsements: a freelancer can endorse another freelancer's specific
-- skill, LinkedIn-style — but only if they were both confirmed on the same
-- job at some point. No separate "friend" system; the endorsement rides
-- entirely on job history that already exists, so it can't be gamed by
-- strangers endorsing each other.
-- ---------------------------------------------------------------------------
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

create policy "endorsements are readable by anyone signed in" on public.skill_endorsements
  for select using (auth.role() = 'authenticated');

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

-- ---------------------------------------------------------------------------
-- Base table-level grants. RLS policies above decide which *rows* a role can
-- touch, but Postgres also requires a baseline grant on the *table* itself —
-- normally set up automatically by Supabase, but included here so re-running
-- this whole script on a fresh or reset project never hits a bare
-- "permission denied for table ..." with no RLS message to explain it.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant select on tables to anon;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

-- ---------------------------------------------------------------------------
-- Storage bucket for freelancer profile photos. Public read (so an <img> tag
-- just works with no signed URL), but writes are locked to a user's own
-- folder — uploaded as "{auth.uid()}/photo.jpg" by src/lib/uploadPhoto.js.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatar photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "a user can upload their own avatar photo"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "a user can replace their own avatar photo"
  on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "a user can delete their own avatar photo"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Event documents (organizer uploads, confirmed team can view/download —
-- see migration_event_documents.sql). Uses is_job_organizer/
-- is_confirmed_on_job, both already defined earlier in this file (right
-- after job_divisions/applications, since job_chat_messages and the vendor
-- tables need them too).
-- ---------------------------------------------------------------------------
create table if not exists public.event_documents (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  storage_path text not null unique, -- "{job_id}/{uuid}-{filename}" in the "event-docs" bucket
  file_name text not null, -- original filename, for display
  mime_type text,
  file_size bigint,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists event_documents_job_id_idx on public.event_documents (job_id);

alter table public.event_documents enable row level security;

create policy "organizer manages their event documents" on public.event_documents
  for all using (public.is_job_organizer(job_id)) with check (public.is_job_organizer(job_id));

create policy "confirmed team can read event documents" on public.event_documents
  for select using (public.is_confirmed_on_job(job_id));

grant select, insert, update, delete on public.event_documents to authenticated;

-- Private bucket — unlike "avatars", these can be contracts/invoices/floor
-- plans, so access is via short-lived signed URLs, only issued if the
-- requesting user's storage policy below grants them select on the object.
insert into storage.buckets (id, name, public)
values ('event-docs', 'event-docs', false)
on conflict (id) do nothing;

create policy "organizer manages their event document files" on storage.objects
  for all
  using (bucket_id = 'event-docs' and public.is_job_organizer(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'event-docs' and public.is_job_organizer(((storage.foldername(name))[1])::uuid));

create policy "confirmed team can read event document files" on storage.objects
  for select
  using (bucket_id = 'event-docs' and public.is_confirmed_on_job(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------------------
-- Vendor portfolio images — vendor logo reuses the "avatars" bucket above
-- (same shape as a freelancer/organizer logo); portfolio images get their
-- own public bucket since there can be several per vendor.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('vendor-portfolio', 'vendor-portfolio', true)
on conflict (id) do nothing;

create policy "vendor portfolio images are publicly readable" on storage.objects
  for select using (bucket_id = 'vendor-portfolio');

create policy "a vendor can upload their own portfolio images" on storage.objects
  for insert with check (bucket_id = 'vendor-portfolio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "a vendor can replace their own portfolio images" on storage.objects
  for update using (bucket_id = 'vendor-portfolio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "a vendor can delete their own portfolio images" on storage.objects
  for delete using (bucket_id = 'vendor-portfolio' and (storage.foldername(name))[1] = auth.uid()::text);
