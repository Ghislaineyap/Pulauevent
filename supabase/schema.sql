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
-- One row per authenticated user (auth.users), holds just the role.
-- Freelancer/organizer detail lives in its own table below.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('freelancer', 'organizer')),
  created_at timestamptz not null default now()
);

create table if not exists public.freelancer_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  name text not null,
  location text not null,
  avatar_key text not null default 'avatar-1', -- preset avatar id, see src/lib/avatars.js — no photo uploads in v1
  pitch text,
  rate_amount numeric,
  rate_type text check (rate_type in ('hourly', 'daily')),
  skills text[] not null default '{}',
  work_history text,
  years_experience integer,
  updated_at timestamptz not null default now()
);

create table if not exists public.organizer_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  org_name text not null,
  hide_name boolean not null default false, -- if true, freelancers see "Event Organizer" until matched
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
  event_date date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.job_divisions (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  skill text not null,
  quantity integer not null default 1,
  budget_amount numeric,
  budget_type text check (budget_type in ('hourly', 'daily', 'flat')),
  filled_count integer not null default 0
);

create table if not exists public.applications (
  id uuid primary key default uuid_generate_v4(),
  division_id uuid not null references public.job_divisions(id) on delete cascade,
  freelancer_id uuid not null references public.freelancer_profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (division_id, freelancer_id)
);

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
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    select jp.organizer_id into v_organizer_id
    from public.job_divisions jd
    join public.job_postings jp on jp.id = jd.job_id
    where jd.id = new.division_id;

    insert into public.matches (organizer_id, freelancer_id, source, source_id)
    values (v_organizer_id, new.freelancer_id, 'application', new.id)
    on conflict (organizer_id, freelancer_id) do nothing;

    update public.job_divisions set filled_count = filled_count + 1 where id = new.division_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_application_accepted on public.applications;
create trigger on_application_accepted
  after update on public.applications
  for each row execute function public.handle_application_accepted();

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
