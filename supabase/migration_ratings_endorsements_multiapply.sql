-- Migration: multi-applicant auto-decline, post-event organizer ratings, and
-- coworker skill endorsements. Run this once in Supabase's SQL Editor, on top
-- of your existing database (the one from migration_catchup.sql).

-- ---------------------------------------------------------------------------
-- 1. When accepting an applicant fills a division's headcount, automatically
--    decline everyone else still pending for that same division — an
--    organizer reviewing 8 applicants for 2 spots shouldn't have to manually
--    clean up the other 6 once they've picked their 2.
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

    update public.job_divisions
    set filled_count = filled_count + 1
    where id = new.division_id
    returning filled_count into v_filled_count;

    if v_filled_count >= v_quantity then
      update public.applications
      set status = 'declined'
      where division_id = new.division_id and status = 'pending' and id <> new.id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;
-- The trigger itself (on_application_accepted) already exists from
-- schema.sql and points at this function by name, so replacing the function
-- body here is all that's needed — no need to re-create the trigger.

-- ---------------------------------------------------------------------------
-- 2. Ratings: an organizer can rate + recommend a freelancer once the
--    event's end date has passed, for anyone who was actually confirmed on
--    it. Unlocks automatically — no manual "mark as done" step needed.
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

-- ---------------------------------------------------------------------------
-- 3. Skill endorsements: a freelancer can endorse another freelancer's
--    specific skill, LinkedIn-style — but only if they were both confirmed
--    on the same job at some point. No separate "friend" system; the
--    endorsement rides entirely on job history that already exists, so it
--    can't be gamed by strangers endorsing each other.
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
