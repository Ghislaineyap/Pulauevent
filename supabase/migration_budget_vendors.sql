-- Migration: internal event Budget (a 12-category ledger per event) and
-- Vendors (a reusable, organizer-wide roster + which vendor is booked on
-- which event, optionally tied to a Budget line item). Run this once in
-- Supabase's SQL Editor, on top of the existing schema + migration_rundown_
-- tasks.sql (this reuses its public.is_job_organizer() helper). Safe to
-- re-run.
--
-- Both tabs are organizer-only — see the "freelancer-note" annotation on the
-- Pulau Event v2 Workspace design canvas: a freelancer's desktop workspace
-- deliberately has no Team, Budget, or Vendors tab. So unlike
-- event_rundowns/event_tasks, there is no "confirmed team can read" policy
-- here at all — every policy below is is_job_organizer() only, or, for the
-- organizer-wide vendor roster, a plain organizer_id = auth.uid() check.
--
-- Currency: the app already shows freelancer fees in Rupiah (IDR) — see
-- formatFee() in src/pages/organizer/EventWorkspace.jsx — so the internal
-- Budget tab follows that convention (a currency column exists per-event in
-- case that ever needs to change, but the UI defaults every new event to
-- IDR). This is deliberately different from the mockup's USD placeholder
-- numbers, which mirror the separate client-facing Universal Event Budget
-- Template artifact instead.

-- ---------------------------------------------------------------------------
-- Budget: one settings row per event (target + contingency) plus an ordered
-- list of line items. Matches the "Budget (internal)" tab on the design
-- canvas — category / item / vendor / est. cost / actual cost / payment
-- status, with an auto-computed ledger summary the app computes client-side
-- from these rows (no stored totals).
-- ---------------------------------------------------------------------------
create table if not exists public.event_budget_meta (
  job_id uuid primary key references public.job_postings(id) on delete cascade,
  target_amount numeric,
  contingency_pct numeric not null default 10,
  currency text not null default 'IDR',
  updated_at timestamptz not null default now()
);

create table if not exists public.event_budget_items (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  category text not null,
  item text,
  vendor text,
  est_cost numeric not null default 0,
  actual_cost numeric,
  status text not null default 'not_started' check (status in ('not_started', 'deposit_paid', 'paid_in_full')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists event_budget_items_job_id_idx on public.event_budget_items (job_id, sort_order);

alter table public.event_budget_meta enable row level security;
alter table public.event_budget_items enable row level security;

drop policy if exists "organizer manages their event budget meta" on public.event_budget_meta;
create policy "organizer manages their event budget meta" on public.event_budget_meta
  for all using (public.is_job_organizer(job_id)) with check (public.is_job_organizer(job_id));

drop policy if exists "organizer manages their event budget items" on public.event_budget_items;
create policy "organizer manages their event budget items" on public.event_budget_items
  for all using (public.is_job_organizer(job_id)) with check (public.is_job_organizer(job_id));

grant select, insert, update, delete on public.event_budget_meta to authenticated;
grant select, insert, update, delete on public.event_budget_items to authenticated;

-- ---------------------------------------------------------------------------
-- Vendors, two levels (see the "vendors-note" annotation on the design
-- canvas): vendor_roster is organizer-wide and reused across every event
-- (same idea as the existing team_members table for freelancers);
-- event_vendors links one roster entry onto one event, optionally against a
-- specific Budget line item so "who's providing this line" is one click
-- away instead of a free-text vendor name.
-- ---------------------------------------------------------------------------
create table if not exists public.vendor_roster (
  id uuid primary key default uuid_generate_v4(),
  organizer_id uuid not null references public.organizer_profiles(id) on delete cascade,
  name text not null,
  category text,
  contact_name text,
  contact_phone text,
  contact_email text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists vendor_roster_organizer_id_idx on public.vendor_roster (organizer_id);

create table if not exists public.event_vendors (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.job_postings(id) on delete cascade,
  vendor_roster_id uuid not null references public.vendor_roster(id) on delete cascade,
  budget_item_id uuid references public.event_budget_items(id) on delete set null,
  status text not null default 'booked' check (status in ('booked', 'confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (job_id, vendor_roster_id)
);

create index if not exists event_vendors_job_id_idx on public.event_vendors (job_id);

alter table public.vendor_roster enable row level security;
alter table public.event_vendors enable row level security;

drop policy if exists "organizer manages their own vendor roster" on public.vendor_roster;
create policy "organizer manages their own vendor roster" on public.vendor_roster
  for all using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());

drop policy if exists "organizer manages their event vendors" on public.event_vendors;
create policy "organizer manages their event vendors" on public.event_vendors
  for all using (public.is_job_organizer(job_id)) with check (public.is_job_organizer(job_id));

grant select, insert, update, delete on public.vendor_roster to authenticated;
grant select, insert, update, delete on public.event_vendors to authenticated;
