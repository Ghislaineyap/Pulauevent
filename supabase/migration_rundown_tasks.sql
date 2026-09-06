-- Migration: per-event Rundown (multiple, ordered, time-sequenced schedules)
-- and Tasks (a simple checklist, optionally assigned to a confirmed team
-- member). Run this once in Supabase's SQL Editor, on top of the existing
-- schema. Safe to re-run.
--
-- These are two of the "genuinely new" surfaces sketched in
-- v2-desktop-workspace-plan.md (event_docs/event_tasks/event_budget_items),
-- pulled forward and shipped on mobile first — they don't depend on the
-- desktop shell existing. Rundown especially: the person who most needs
-- "what time do I need to be there" is a freelancer on their phone at the
-- venue, not an organizer at a desk, so this is mobile-first by design.
--
-- Not included here: event_docs (freeform notes) and event_budget_items
-- (the 12-category ledger) — still desktop-first candidates for later,
-- since long-form writing and a full budget table are both awkward on a
-- phone. See v2-desktop-workspace-plan.md and the Pulau Event v2 Workspace
-- design canvas for the fuller picture these two tables are part of.

-- ---------------------------------------------------------------------------
-- Two small security-definer helpers, same pattern as public.is_admin() in
-- migration_admin.sql — they only ever check auth.uid() against a job_id
-- the caller supplies, so it's safe to let them bypass RLS on
-- job_postings/job_divisions/applications to answer "does this person
-- belong to this job, and how." Every policy below is built on these two
-- instead of repeating the same three-table join in every policy.
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
  );
$$;

-- ---------------------------------------------------------------------------
-- Rundown: one event can have several (Day 1, Day 2, a crew-only load-in/
-- load-out schedule, ...) — event_rundowns is the list, event_rundown_items
-- is each one's ordered, time-sequenced rows.
--
-- Timing model: each item stores its own start_time + duration_minutes
-- (not a computed column). Reordering is a CLIENT-side operation — same
-- style as EventForm's division edits in MyEvents.jsx (loop over changed
-- rows, update each) — not a database trigger: on drag-drop, the app
-- recalculates start_time for every item between the old and new position
-- (shifted by the moved item's own duration; items outside that range keep
-- their time, since the total elapsed time before them hasn't changed) and
-- writes the updated sort_order + start_time back in one batch. See the
-- "Rundown" tab on the Pulau Event v2 Workspace design canvas for exactly
-- this behavior worked through on a concrete example.
-- ---------------------------------------------------------------------------
create table if not exists public.event_rundowns (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  title text not null,
  event_date date, -- which day of the event this rundown is for; null = applies to the whole event (e.g. a crew-only load-in/out list spanning both days)
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists event_rundowns_job_id_idx on public.event_rundowns (job_id);

create table if not exists public.event_rundown_items (
  id uuid primary key default uuid_generate_v4(),
  rundown_id uuid not null references public.event_rundowns(id) on delete cascade,
  sort_order integer not null,
  start_time time not null,
  duration_minutes integer not null check (duration_minutes > 0),
  segment text not null,
  owner_label text, -- free text, e.g. "Event Crew" or "MC / Host" — a role, not necessarily one named person
  note text
);

create index if not exists event_rundown_items_rundown_id_sort_idx on public.event_rundown_items (rundown_id, sort_order);

alter table public.event_rundowns enable row level security;
alter table public.event_rundown_items enable row level security;

drop policy if exists "organizer manages their event rundowns" on public.event_rundowns;
create policy "organizer manages their event rundowns" on public.event_rundowns
  for all using (public.is_job_organizer(job_id)) with check (public.is_job_organizer(job_id));

drop policy if exists "confirmed team can read event rundowns" on public.event_rundowns;
create policy "confirmed team can read event rundowns" on public.event_rundowns
  for select using (public.is_confirmed_on_job(job_id));

drop policy if exists "organizer manages their event rundown items" on public.event_rundown_items;
create policy "organizer manages their event rundown items" on public.event_rundown_items
  for all using (
    exists (select 1 from public.event_rundowns r where r.id = rundown_id and public.is_job_organizer(r.job_id))
  ) with check (
    exists (select 1 from public.event_rundowns r where r.id = rundown_id and public.is_job_organizer(r.job_id))
  );

drop policy if exists "confirmed team can read event rundown items" on public.event_rundown_items;
create policy "confirmed team can read event rundown items" on public.event_rundown_items
  for select using (
    exists (select 1 from public.event_rundowns r where r.id = rundown_id and public.is_confirmed_on_job(r.job_id))
  );

grant select, insert, update, delete on public.event_rundowns to authenticated;
grant select, insert, update, delete on public.event_rundown_items to authenticated;

-- ---------------------------------------------------------------------------
-- Tasks: a simple checklist per event, optionally assigned to a confirmed
-- team member. Read access is shared (the whole confirmed team can see the
-- full list — useful for coordination, "what's still outstanding") but
-- WRITE is scoped: the organizer can do anything, a freelancer can only
-- flip done/undone on a row assigned to them. The mobile freelancer view
-- defaults to showing "your tasks" first (see the Pulau Event v2 Workspace
-- canvas's Freelancer Tasks tab) but isn't restricted from seeing the rest
-- of the list, unlike that mock — a deliberate refinement over the design
-- canvas, matching the RLS model v2-desktop-workspace-plan.md sketched.
-- ---------------------------------------------------------------------------
create table if not exists public.event_tasks (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  assigned_to uuid references public.profiles(id) on delete set null,
  due_date date,
  created_at timestamptz not null default now()
);

create index if not exists event_tasks_job_id_idx on public.event_tasks (job_id);
create index if not exists event_tasks_assigned_to_idx on public.event_tasks (assigned_to);

alter table public.event_tasks enable row level security;

drop policy if exists "organizer manages their event tasks" on public.event_tasks;
create policy "organizer manages their event tasks" on public.event_tasks
  for all using (public.is_job_organizer(job_id)) with check (public.is_job_organizer(job_id));

drop policy if exists "confirmed team can read event tasks" on public.event_tasks;
create policy "confirmed team can read event tasks" on public.event_tasks
  for select using (public.is_confirmed_on_job(job_id));

drop policy if exists "assignee can update their own task" on public.event_tasks;
create policy "assignee can update their own task" on public.event_tasks
  for update using (auth.uid() = assigned_to) with check (auth.uid() = assigned_to);

grant select, insert, update, delete on public.event_tasks to authenticated;

-- ---------------------------------------------------------------------------
-- Note on assigned_to: it references profiles(id) generically (organizer OR
-- freelancer) rather than freelancer_profiles specifically, since an
-- organizer might assign a task to themselves ("confirm final headcount").
-- The app layer should still only offer the organizer + confirmed
-- freelancers on THIS job as assignment options — same "who can this be
-- assigned to" constraint the plan doc noted for event_tasks originally,
-- enforced in the UI rather than the database, consistent with how e.g.
-- job_divisions.skill isn't constrained to the `skills` table either.

-- ---------------------------------------------------------------------------
-- Client sharing: which rundown items are safe to show a client, and the
-- token-based public link that shows them. One link per EVENT (not per
-- rundown) — it covers every rundown on the job at once, grouped by day, so
-- a multi-day event never needs more than one link. See the "Share" flow on
-- the Pulau Event mobile/desktop mockups for the picker this powers.
-- ---------------------------------------------------------------------------
alter table public.event_rundown_items
  add column if not exists client_visible boolean not null default false;

create table if not exists public.event_share_links (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  token text not null unique,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists event_share_links_job_id_idx on public.event_share_links (job_id);

alter table public.event_share_links enable row level security;

drop policy if exists "organizer manages their event share links" on public.event_share_links;
create policy "organizer manages their event share links" on public.event_share_links
  for all using (public.is_job_organizer(job_id)) with check (public.is_job_organizer(job_id));

grant select, insert, update, delete on public.event_share_links to authenticated;

-- The ONLY public (anon) surface for any of this: a narrow, security-definer
-- RPC keyed by token, not a relaxed RLS policy on the tables themselves.
-- It reads past RLS deliberately (that's what security definer is for) but
-- the column list is hand-picked — no owner_label, no notes, no internal
-- rundowns (the crew-only one simply has no client_visible rows, so it
-- contributes nothing here), and no other event's data, since job_id is
-- derived from the token rather than accepted as a parameter.
create or replace function public.get_public_schedule(p_token text)
returns table (
  event_title text,
  event_start_date date,
  event_end_date date,
  event_location text,
  rundown_title text,
  rundown_date date,
  start_time time,
  duration_minutes integer,
  segment text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    jp.title,
    jp.event_start_date,
    jp.event_end_date,
    jp.location,
    r.title,
    r.event_date,
    ri.start_time,
    ri.duration_minutes,
    ri.segment
  from public.event_share_links sl
  join public.job_postings jp on jp.id = sl.job_id
  join public.event_rundowns r on r.job_id = sl.job_id
  join public.event_rundown_items ri on ri.rundown_id = r.id
  where sl.token = p_token
    and ri.client_visible = true
  order by r.event_date nulls last, ri.sort_order;
$$;

-- anon = Supabase's unauthenticated role. This is the one function anyone
-- with a link, logged in or not, can call — everything else in this
-- migration stays behind normal RLS.
grant execute on function public.get_public_schedule(text) to anon, authenticated;
