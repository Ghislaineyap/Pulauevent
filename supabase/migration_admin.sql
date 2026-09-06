-- Adds an "admin" role for the platform-overview / user-and-event-management
-- dashboard. Run this once in Supabase: Project → SQL Editor → New query →
-- paste → Run. Safe to re-run.
--
-- Admin accounts are NOT self-serve — there is no public sign-up for one.
-- See the bottom of this file for how to create your own admin login.

-- ---------------------------------------------------------------------------
-- Let profiles.role also be 'admin'.
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('freelancer', 'organizer', 'admin'));

-- ---------------------------------------------------------------------------
-- is_admin() — security definer so it can check the CALLER's own profiles
-- row regardless of RLS on other people's rows. It only ever looks up
-- auth.uid() (never attacker-supplied input), so this is safe to bypass RLS
-- for. Every "admin can see/manage everything" policy below is built on it.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Read access for the dashboard's overview + management views. These are
-- ADDITIONAL (permissive) policies — they only ever grant more, never take
-- away what freelancers/organizers can already see.
-- ---------------------------------------------------------------------------
create policy "admins can read every profile" on public.profiles
  for select using (public.is_admin());

create policy "admins can read every application" on public.applications
  for select using (public.is_admin());

create policy "admins can read every like" on public.likes
  for select using (public.is_admin());

create policy "admins can read every match" on public.matches
  for select using (public.is_admin());

create policy "admins can read every team roster" on public.team_members
  for select using (public.is_admin());

create policy "admins can read every 1:1 message" on public.messages
  for select using (public.is_admin());

create policy "admins can read every event chat message" on public.job_chat_messages
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Delete access for the "remove an event" action. job_postings already
-- cascades down to job_divisions, applications, job_chat_messages, and
-- ratings for that event, so deleting the posting is enough to remove it
-- entirely.
-- ---------------------------------------------------------------------------
create policy "admins can delete any event" on public.job_postings
  for delete using (public.is_admin());

-- Deliberately NOT added here: a client-side delete policy on profiles /
-- freelancer_profiles / organizer_profiles. Deleting only the public.profiles
-- row would leave a phantom auth.users login with no profile behind (broken,
-- not actually removed). Removing a PERSON is done through the
-- admin-delete-user Edge Function instead, which deletes the auth.users row
-- itself (via the service role) and lets the existing "on delete cascade"
-- chain in schema.sql clean up everything else, exactly like the full-wipe
-- script does.

-- ---------------------------------------------------------------------------
-- Create your own admin login (do this once, after running the SQL above):
--
-- 1. Supabase Dashboard → Authentication → Users → "Add user".
--    Enter an email + a password you choose, toggle "Auto Confirm User" on,
--    then Create. This is deliberately NOT done through the app's own
--    sign-up form — there's no public admin sign-up.
-- 2. Copy the new user's UUID from that Users list.
-- 3. Run this, with that UUID pasted in:
--
--    insert into public.profiles (id, role) values ('paste-the-uuid-here', 'admin');
--
-- 4. Sign in at /admin/login with that email + password.
