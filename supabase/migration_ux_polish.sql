-- Migration: UX-polish round — Instagram/social handle on both profile
-- types (so people can sanity-check who they're dealing with), and an
-- organizer-controlled "open the event chat" switch (so the group chat
-- doesn't appear until the organizer has actually locked in the team,
-- giving them a beat to handle a last-minute cancellation first).
-- Run this once in Supabase's SQL Editor, on top of your existing database.

-- ---------------------------------------------------------------------------
-- 1. Instagram/social handle — optional, shown on both sides so freelancers
--    can sanity-check an organizer (and organizers a freelancer) beyond just
--    a display name. Not verification — just a visible, checkable signal.
-- ---------------------------------------------------------------------------
alter table public.organizer_profiles add column if not exists instagram_handle text;
alter table public.freelancer_profiles add column if not exists instagram_handle text;

-- ---------------------------------------------------------------------------
-- 2. Event Manager: the organizer decides when a job's group chat opens,
--    instead of it appearing automatically as soon as the first person is
--    accepted. Typically pressed once every division is filled, but nothing
--    stops them pressing it earlier if that's how they want to run it — and
--    it gives them room to swap someone out before the team is talking to
--    each other, in case of a cancellation.
-- ---------------------------------------------------------------------------
alter table public.job_postings add column if not exists chat_opened_at timestamptz;

-- Defense in depth: even if a client tried to read/write job_chat_messages
-- directly, RLS itself now refuses until the organizer has opened the chat.
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
