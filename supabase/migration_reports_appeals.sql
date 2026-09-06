-- Migration: profile reports + suspension appeals. Run this once in
-- Supabase's SQL Editor, on top of your existing database. Requires
-- migration_admin.sql to already be applied (uses public.is_admin()).
-- Safe to re-run.
--
-- What this adds:
--   1. profiles.status — 'active' | 'suspended', plus who/why/when.
--   2. public.reports — a freelancer or organizer flagging another profile
--      for the admin dashboard to review.
--   3. public.appeals — a suspended profile's request to be reinstated.
--
-- v1 simplification worth knowing (same spirit as the "organizer name
-- hiding" note in schema.sql): suspension is enforced by the FRONTEND
-- (Guard/Landing redirect the person to /suspended) once profiles.status
-- flips, not by RLS on every other table. A suspended person's existing
-- session token still technically satisfies "auth.uid() = ..." on
-- applications/messages/likes/etc. A determined suspended user could keep
-- writing via direct API calls until their session expires. Fine for a v1
-- launch; a hardening fast-follow would be adding "and (select status from
-- public.profiles where id = auth.uid()) = 'active'" to the write policies
-- that matter most (applications, messages, job_chat_messages, likes).

-- ---------------------------------------------------------------------------
-- 1. Suspension state lives on profiles (shared by both roles) rather than
--    on freelancer_profiles/organizer_profiles, so a single check in
--    Guard/Landing covers both without caring which role it is.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists status text not null default 'active';
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('active', 'suspended'));
alter table public.profiles add column if not exists suspended_reason text;
alter table public.profiles add column if not exists suspended_at timestamptz;

-- Admins can already read every profile (migration_admin.sql). They also
-- need to be able to suspend/reinstate one.
drop policy if exists "admins can update any profile" on public.profiles;
create policy "admins can update any profile" on public.profiles
  for update using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. Reports: either role can flag the other (or same-role misconduct, e.g.
--    an organizer reporting another organizer they crossed paths with via a
--    shared event) — reported_id is just "some profile", not role-specific.
--    Reporters can see their own filed reports (so the UI can say "already
--    reported"); only admins see the full queue.
-- ---------------------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  details text,
  -- 'open' = new, unreviewed. 'resolved' = admin took action (e.g.
  -- suspended the profile). 'dismissed' = admin looked and decided no
  -- action was needed. No separate "reviewing" state — keeps the queue
  -- binary: needs a decision, or already decided.
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  admin_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  check (reporter_id <> reported_id)
);

create index if not exists reports_status_idx on public.reports (status);
create index if not exists reports_reported_id_idx on public.reports (reported_id);

alter table public.reports enable row level security;

drop policy if exists "a signed-in user can file a report" on public.reports;
create policy "a signed-in user can file a report" on public.reports
  for insert with check (auth.uid() = reporter_id);

drop policy if exists "a user can read reports they filed" on public.reports;
create policy "a user can read reports they filed" on public.reports
  for select using (auth.uid() = reporter_id);

drop policy if exists "admins can read every report" on public.reports;
create policy "admins can read every report" on public.reports
  for select using (public.is_admin());

drop policy if exists "admins can update any report" on public.reports;
create policy "admins can update any report" on public.reports
  for update using (public.is_admin());

grant select, insert, update, delete on public.reports to authenticated;
grant select on public.reports to anon;

-- ---------------------------------------------------------------------------
-- 3. Appeals: only a currently-suspended profile can file one (checked in
--    the insert policy, not just the UI), and only against their own
--    account. Approving an appeal is a separate admin action (updates
--    profiles.status back to 'active') — inserting/updating an appeal row
--    never itself changes suspension state.
-- ---------------------------------------------------------------------------
create table if not exists public.appeals (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(trim(message)) > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  admin_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);

create index if not exists appeals_status_idx on public.appeals (status);
create index if not exists appeals_profile_id_idx on public.appeals (profile_id);

alter table public.appeals enable row level security;

drop policy if exists "a suspended user can file their own appeal" on public.appeals;
create policy "a suspended user can file their own appeal" on public.appeals
  for insert with check (
    auth.uid() = profile_id
    and exists (select 1 from public.profiles where id = auth.uid() and status = 'suspended')
  );

drop policy if exists "a user can read their own appeals" on public.appeals;
create policy "a user can read their own appeals" on public.appeals
  for select using (auth.uid() = profile_id);

drop policy if exists "admins can read every appeal" on public.appeals;
create policy "admins can read every appeal" on public.appeals
  for select using (public.is_admin());

drop policy if exists "admins can update any appeal" on public.appeals;
create policy "admins can update any appeal" on public.appeals
  for update using (public.is_admin());

grant select, insert, update, delete on public.appeals to authenticated;
grant select on public.appeals to anon;
