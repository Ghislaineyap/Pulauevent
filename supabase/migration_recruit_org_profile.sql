-- Migration: organizer profile detail (location + about), and the
-- "Open recruit" flow for job divisions — an organizer's team-invited slots
-- stay private by default; a division only appears in the public Job Feed
-- once the organizer explicitly turns recruiting on for it.
-- Run this once in Supabase's SQL Editor, on top of your existing database.

-- ---------------------------------------------------------------------------
-- 1. Organizer profile detail: where they're based + a short About blurb,
--    so freelancers have more than just a name (and Instagram) to go on.
-- ---------------------------------------------------------------------------
alter table public.organizer_profiles add column if not exists location text;
alter table public.organizer_profiles add column if not exists about text;

-- ---------------------------------------------------------------------------
-- 2. Open recruit: a division is private (team-invite-only, not shown to the
--    public) unless this is true. IMPORTANT: defaults to TRUE here so every
--    *existing* division keeps behaving exactly as it does today (visible in
--    the Job Feed) — nothing currently live disappears because of this
--    migration. The app's "create a new job" form separately defaults new
--    divisions to OFF, so going forward an organizer opts in deliberately
--    after they've added whichever team members they already know.
-- ---------------------------------------------------------------------------
alter table public.job_divisions add column if not exists open_recruit boolean not null default true;
