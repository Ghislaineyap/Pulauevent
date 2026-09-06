-- Wipe all test data before real users start using Pulau Event.
-- Run this ONCE in Supabase: Project → SQL Editor → New query → paste → Run.
-- This is irreversible — there is no undo, so only run it when you're sure
-- there's nothing in the app you still need.
--
-- What this does NOT touch: the "skills" and "locations" tables. Those are
-- app configuration (the dropdown option lists), not test data — deleting
-- them would break the sign-up/event forms for real users too.
--
-- Why one line is enough for almost everything: every data table in this
-- schema (profiles, freelancer_profiles, organizer_profiles, job_postings,
-- job_divisions, applications, likes, matches, team_members, messages,
-- job_chat_messages, ratings, skill_endorsements) was built with
-- "on delete cascade" back to auth.users. Deleting a user deletes every row
-- anywhere in the app that belongs to them, automatically, in the right
-- order — so wiping every account wipes every event, application, chat,
-- match, and rating along with it.

-- 1. Delete uploaded photos/logos from storage — these live in a storage
--    bucket, not a regular table, so they don't get swept up by the cascade
--    above and need deleting separately.
delete from storage.objects where bucket_id = 'avatars';

-- 2. Delete every account. Cascades through the entire schema (see above).
delete from auth.users;

-- 3. Verify — every count below should read 0. (skills/locations aren't
--    listed here on purpose; leave those alone.)
select
  (select count(*) from auth.users)                 as auth_users,
  (select count(*) from public.profiles)             as profiles,
  (select count(*) from public.job_postings)         as job_postings,
  (select count(*) from public.applications)         as applications,
  (select count(*) from public.matches)              as matches,
  (select count(*) from public.messages)             as messages,
  (select count(*) from public.job_chat_messages)    as job_chat_messages,
  (select count(*) from public.ratings)              as ratings,
  (select count(*) from storage.objects where bucket_id = 'avatars') as avatar_files;
