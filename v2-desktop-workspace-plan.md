# Pulau Event v2 — Desktop Workspace for Organizers ("Notion × Slack, one event at a time")

## The idea in one line

Today, running an event on Pulau Event means bouncing between Post, My Event, Discover, and Connect — each a separate mobile tab, several things (chat, budget, team) buried in popups. V2 gives the organizer one desktop screen per event: a sidebar to jump between events and conversations, and a workspace pane that holds everything about the selected event — overview, team, budget, docs/checklist, and its chat — the way Notion holds a project's pages and Slack holds a team's channels, merged into one.

## What's already true (reuse, don't rebuild)

- **Data already there**: `job_postings` + `job_divisions` (the event and its roles/budget/fee), `team_members` (roster), `applications` (who's confirmed), `job_chat_messages` + realtime (the event's group chat), `matches`/`messages` (1:1 chat), `ratings`, `skill_endorsements`.
- **A real budgeting model already exists, just not wired into the app**: the `universal-event-budget-template.md` work (spreadsheet + shared Artifact) has a proven 12-category ledger — item/vendor/unit cost/qty/deposit/actual/variance, contingency %, category rollups. Today's per-division `budget_amount`/`budget_type`/`fee_type` is just "what we pay this role," not a whole-event budget. V2's Budget tab should adopt that same 12-category model as a per-event ledger, not invent a new one.
- **Chat plumbing already works** (Supabase Realtime, two tables) — the Slack-like part of v2 is mostly a UI change (a persistent sidebar instead of full-page navigation per thread), not new backend.
- **Nothing exists yet for**: freeform notes/docs per event, a task/checklist list, or file attachments beyond profile/logo photos. These are the genuinely new pieces.

## Information architecture

**Below a desktop breakpoint (~900px)**: nothing changes. The current mobile app-shell + bottom tabbar stays exactly as-is — this is additive, not a replacement.

**At/above the breakpoint**, organizers (and later freelancers) get a new shell:

```
┌─────────────┬──────────────────────────────────────────┬────────────────┐
│  Sidebar    │  Event workspace (tabbed)                 │  Chat rail     │
│             │                                            │  (collapsible) │
│  + New event│  [Overview] [Team] [Budget] [Docs] [Tasks] │                │
│             │                                            │  Event chat    │
│  Riverside  │  <content for the active tab>              │  ─ or ─        │
│  Launch  ●3 │                                            │  1:1 threads   │
│             │                                            │                │
│  Bali Gath. │                                            │                │
│             │                                            │                │
│  ─────────  │                                            │                │
│  Discover   │                                            │                │
│  All chats  │                                            │                │
└─────────────┴──────────────────────────────────────────┴────────────────┘
```

- **Sidebar**: every event the organizer owns (open ones first, ● unread/pending count), plus persistent links to Discover and "All chats" (everything Connect does today, just always one click away instead of its own tab).
- **Workspace pane**: replaces today's "Manage event" modal with a real page, tabbed:
  - **Overview** — what My Event's dashboard shows today (dates, location, stats) plus the event at a glance.
  - **Team** — today's per-division "Select team" + roster, unified into one view instead of per-division popups.
  - **Budget** — the 12-category ledger, scoped to this event, replacing/augmenting the simple per-division fee fields.
  - **Docs** — freeform notes pages (run-of-show, vendor contacts, brief) — the actual "Notion" part.
  - **Tasks** — a checklist, optionally assigned to a team member, with due dates — the other "Notion" part.
- **Chat rail**: this event's group chat by default; switchable to any 1:1 thread without leaving the workspace. This is the "Slack" part — always visible, not a separate tab you navigate away to.

## New data model (additive — nothing existing changes shape)

```sql
-- Freeform notes, Notion-page-style. One event can have several (brief,
-- run-of-show, vendor contacts, ...) or just one — organizer's call.
create table event_docs (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references job_postings(id) on delete cascade,
  title text not null,
  body text not null default '',       -- markdown; render with a lightweight renderer
  created_by uuid not null references profiles(id),
  updated_at timestamptz not null default now()
);

-- Checklist items, optionally assigned to a confirmed team member.
create table event_tasks (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references job_postings(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  assigned_to uuid references profiles(id),   -- must be organizer or a confirmed freelancer on this job
  due_date date,
  created_at timestamptz not null default now()
);
```

Budget gets its own table too (rather than overloading `job_divisions`), modeled directly on the proven spreadsheet/Artifact categories:

```sql
create table event_budget_items (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references job_postings(id) on delete cascade,
  category text not null,              -- the 12 universal categories, or a custom one
  item text not null,
  vendor text,
  unit_cost numeric,
  quantity numeric not null default 1,
  scales_with_guests boolean not null default false,
  deposit_pct numeric,
  actual_cost numeric,
  payment_status text not null default 'not_started'
    check (payment_status in ('not_started', 'deposit_paid', 'paid_in_full')),
  notes text
);
```

RLS on all three: organizer of the `job_postings` row can do everything; a freelancer confirmed on that job can read (and, for `event_tasks`, update only rows assigned to them) — same ownership pattern already used throughout `schema.sql`.

## Phased rollout (each phase ships something usable on its own)

1. **Desktop shell only.** Sidebar + breakpoint, wrapping the *existing* Post/My Event/Discover/Connect screens with no new data or features. Lowest risk, immediately makes the app usable on a laptop, and validates the navigation shape before building on top of it.
2. **Event workspace page.** Turn today's "Manage event" modal into a real tabbed page (Overview/Team/Budget-as-is/Chat rail). Still no new tables — just re-laying out what's already there. This is where the chat rail replaces full-page chat navigation.
3. **Docs + Tasks.** The two new tables above, as new tabs in the workspace. This is the first genuinely new "Notion" surface.
4. **Budget upgrade.** Swap the simple per-division fee display for the full `event_budget_items` ledger (reusing the Artifact's proven layout/logic), so budgeting, pitch decks, and the live app are finally the same model instead of three.
5. **Freelancer desktop.** Extend the same shell to freelancers: their sidebar lists events they're on, workspace shows Overview/Tasks-assigned-to-them/Docs (read-only unless the organizer opens editing)/Chat — same shell, scoped permissions.

## Recommended starting point

Phase 1. It touches no database, can't break anything freelancers rely on (mobile is untouched), and gives you something to open on a laptop and react to within a day or two of work — before committing to the Docs/Tasks/Budget data model in phases 3–4.

## Open questions before Phase 3+

- **Docs**: plain markdown text area is fastest to ship; a block-based editor (closer to real Notion) is a much bigger lift. Recommend starting plain and upgrading only if it's actually limiting.
- **Budget**: keep the standalone shared Artifact ledger as the "quick, no-login, share-a-link" tool for one-off client collaboration, and add the in-app `event_budget_items` version for events already living in Pulau Event — not necessarily a replacement for one or the other.
