-- Lets an organizer message a vendor directly from a vendor's Discover
-- profile — no accept/decline step, unlike the freelancer "like" flow.
-- Vendor contact is meant to work like a business directory: open a
-- profile, start chatting straight away. Also links a "+ Add to vendor
-- management" roster entry back to the real vendor_profiles account it
-- came from, so it can't be added twice and the profile can show it's
-- already there.
--
-- Reuses the existing 1:1 matches/messages tables (Chat.jsx) rather than a
-- parallel vendor-only chat system: freelancer_id becomes optional, a new
-- nullable vendor_id takes its place for vendor-initiated matches, and
-- exactly one of the two must be set on any row.
--
-- Run this once in Supabase: Project → SQL Editor → New query → paste →
-- Run. Safe to re-run.

alter table public.matches alter column freelancer_id drop not null;
alter table public.matches add column if not exists vendor_id uuid references public.vendor_profiles(id) on delete cascade;

alter table public.matches drop constraint if exists matches_party_check;
alter table public.matches add constraint matches_party_check
  check ((freelancer_id is not null) <> (vendor_id is not null));

alter table public.matches drop constraint if exists matches_source_check;
alter table public.matches add constraint matches_source_check
  check (source in ('application', 'like', 'direct'));

-- The table-level unique(organizer_id, freelancer_id) only dedupes
-- freelancer matches (two nulls never conflict in Postgres) — a separate
-- partial index stops an organizer from messaging the same vendor twice.
create unique index if not exists matches_organizer_vendor_unique
  on public.matches (organizer_id, vendor_id) where vendor_id is not null;

drop policy if exists "the two matched parties can read a match" on public.matches;
create policy "the two matched parties can read a match" on public.matches
  for select using (auth.uid() = organizer_id or auth.uid() = freelancer_id or auth.uid() = vendor_id);

-- Unlike a freelancer match (only ever created by the on_like_accepted /
-- on_application_accepted triggers, never directly by a client — see
-- schema.sql), a vendor match IS created directly by the organizer
-- clicking "Message": there's no accept/decline step for vendors.
drop policy if exists "an organizer can start a vendor conversation" on public.matches;
create policy "an organizer can start a vendor conversation" on public.matches
  for insert with check (
    auth.uid() = organizer_id and vendor_id is not null and freelancer_id is null and source = 'direct'
  );

drop policy if exists "the two matched parties can read their messages" on public.messages;
create policy "the two matched parties can read their messages" on public.messages
  for select using (
    exists (
      select 1 from public.matches m
      where m.id = match_id and (m.organizer_id = auth.uid() or m.freelancer_id = auth.uid() or m.vendor_id = auth.uid())
    )
  );

drop policy if exists "a matched party can send a message as themselves" on public.messages;
create policy "a matched party can send a message as themselves" on public.messages
  for insert with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.matches m
      where m.id = match_id and (m.organizer_id = auth.uid() or m.freelancer_id = auth.uid() or m.vendor_id = auth.uid())
    )
  );

-- Nullable — existing manual roster entries have no linked account.
alter table public.vendor_roster add column if not exists vendor_id uuid references public.vendor_profiles(id) on delete set null;
create unique index if not exists vendor_roster_organizer_vendor_unique
  on public.vendor_roster (organizer_id, vendor_id) where vendor_id is not null;
