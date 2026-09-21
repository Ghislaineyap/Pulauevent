-- Catch-up migration: combines what were previously two separate migrations
-- (multi-day job dates / gender / experience bands, and up-to-3 photos) into
-- one script, since neither has been run yet. Run this ONCE in Supabase's
-- SQL Editor, on top of your existing database (the one from migration_002).
-- Do NOT re-run the full schema.sql.

-- ---------------------------------------------------------------------------
-- 1. Job postings can now span multiple days: event_date -> event_start_date
--    + event_end_date. Existing single-day postings become a 1-day range.
-- ---------------------------------------------------------------------------
alter table public.job_postings add column if not exists event_start_date date;
alter table public.job_postings add column if not exists event_end_date date;

-- Only a database that started from the OLD single-event_date schema has
-- this column to backfill from — a fresh install built from the current
-- schema.sql went straight to event_start_date/event_end_date and never had
-- it, so referencing event_date unconditionally fails on those installs.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'job_postings' and column_name = 'event_date'
  ) then
    update public.job_postings
    set event_start_date = coalesce(event_start_date, event_date),
        event_end_date = coalesce(event_end_date, event_date)
    where event_date is not null;
  end if;
end $$;

alter table public.job_postings alter column event_start_date set not null;
alter table public.job_postings alter column event_end_date set not null;

alter table public.job_postings drop column if exists event_date;

alter table public.job_postings drop constraint if exists job_postings_date_range;
alter table public.job_postings add constraint job_postings_date_range check (event_end_date >= event_start_date);

-- ---------------------------------------------------------------------------
-- 2. Freelancer gender (drives the simplified 3-icon fallback avatar) and
--    years-of-experience as a band instead of an exact number.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. Freelancers can now upload up to 3 photos instead of 1.
-- ---------------------------------------------------------------------------
alter table public.freelancer_profiles add column if not exists photo_urls text[] not null default '{}';

-- Same reasoning as event_date above — photo_url (singular) only exists on
-- a database that started from the OLD one-photo schema.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'freelancer_profiles' and column_name = 'photo_url'
  ) then
    update public.freelancer_profiles
    set photo_urls = array[photo_url]
    where photo_url is not null and photo_urls = '{}';
  end if;
end $$;

alter table public.freelancer_profiles drop column if exists photo_url;
