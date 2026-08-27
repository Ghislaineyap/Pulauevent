# Pulau Event

Event-services freelancers, and the organizers who hire them — browse, apply, connect.
Built with React + Vite, Supabase (database, auth), deployed on Netlify.

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com), create a free project.
2. Open **SQL Editor > New query**, paste the entire contents of `supabase/schema.sql`
   from this repo, and click **Run**. This creates every table, the auto-match triggers,
   and row-level security policies in one go.
3. Open **Project Settings > API** and copy the **Project URL** and the **anon public**
   key — you'll need both in step 3 below.
4. Optional but recommended while testing: **Authentication > Providers > Email** —
   turn **off** "Confirm email" so test accounts can sign in immediately instead of
   waiting on a confirmation email. Turn it back on before any real public launch.

## 2. Run it locally

```bash
npm install
cp .env.example .env
# edit .env and paste in your Supabase URL + anon key
npm run dev
```

## 3. Deploy on Netlify

1. Push this repo to GitHub (already done if you're reading this from the repo).
2. In Netlify: **Add new site > Import an existing project**, pick this repo.
3. Build settings (should auto-detect from `netlify.toml`, but to confirm):
   - Build command: `npm run build`
   - Publish directory: `dist`
4. **Site configuration > Environment variables**, add:
   - `VITE_SUPABASE_URL` — your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` — your Supabase anon public key
5. Deploy. That's it — no server to manage, Netlify rebuilds on every push to `main`.

## How it works

Two roles, two paths to a match:

- **Path A — job-post driven.** An organizer posts a job with one or more divisions
  (e.g. 1 Runner, 2 Stage Managers, 3 LOs, each with its own budget). Freelancers
  browse open postings, open one, and apply to a specific division.
- **Path B — profile-browse driven (Discover).** An organizer browses freelancer
  profiles directly (filterable by gender, location, experience, and skill) and
  shortlists one. The freelancer sees it as pending interest in their Connect tab
  and accepts or declines.

Either path converging on an "accepted" status triggers a Postgres trigger
(`supabase/schema.sql`) that creates a row in `matches` automatically — the client
never inserts matches directly, which keeps that logic in one trustworthy place.

If an organizer chose to stay anonymous during onboarding, their real name is hidden
from freelancers (shown as "Event Organizer") until a match exists, at which point the
frontend reveals it. **Known v1 simplification:** this hiding is enforced by the
frontend, not the database — see the comment above the RLS policies in
`supabase/schema.sql` for the honest caveat and how to harden it later.

## What's shipped since v1

- **Multiple locations per freelancer.** `freelancer_profiles.locations` is a
  `text[]` — freelancers can list every city/area they're willing to work in, at no
  extra cost to organizers (their rate stays the same regardless).
- **Profile editing.** Both onboarding forms now pre-fill from the saved profile and
  double as edit screens — reachable via the "Profile" tab.
- **Job listing editing.** Organizers can edit a posting's details anytime; a
  division can only be edited or removed while it has zero applicants (once someone's
  applied, that division locks to keep things consistent for them).
- **Real photo uploads.** Freelancers can upload a real photo (Supabase Storage,
  auto-resized/compressed client-side to 640px JPEG) — a simple fallback avatar is
  shown when no photo is set.
- **In-app chat.** Connected pairs get a real chat thread (`messages` table +
  Supabase Realtime for live delivery) via the "Open chat" button — no more
  "coming soon" placeholder.
- **"Connections", not "matches".** All user-facing copy was reworded away from
  dating-app language ("matched" → "connected", "Your matches" → "Your
  connections", "Swipe, apply, match" → "Browse, apply, connect"). This is a
  professional marketplace, and the copy now says so.
- **Multi-day job postings.** `job_postings` now has `event_start_date` +
  `event_end_date` instead of a single date — organizers pick a range, and a
  single-day event just has the same start and end date.
- **Gender field + simplified avatar.** Freelancers pick Male / Female / Prefer
  not to say. The old 8-emoji avatar picker is gone — the fallback avatar (shown
  when there's no real photo) is now just 3 simple options tied directly to
  gender, no separate picker needed.
- **Years of experience as a band**, not an exact number (0–1 / 2–5 / 6–10 / 10+)
  — easier to pick, and easier to filter on.
- **Multi-select filters on Browse.** Organizers can filter freelancers by any
  combination of gender, location, experience band, and skill.
- **Bumble-style browse cards.** The browse card is now a compact preview (photo,
  name, location, one-line pitch) — tapping it opens a full profile page with
  everything else (full skills, rate, work history) before deciding to like or
  pass.

- **Branded as Pulau Event**, with a new visual identity: sky-blue + sunset-orange
  palette, Poppins throughout (replacing the old navy/coral scheme and system font).
- **Big photos, up to 3 per freelancer.** The old single small avatar is gone —
  freelancers upload up to 3 real photos (`freelancer_profiles.photo_urls`), shown
  as a large hero photo on the Discover card and a swipeable gallery on the full
  profile page. Still falls back to a simple gender-colored silhouette if they skip it.
- **No more hearts.** "Like/Pass" is now "Shortlist/Skip" (Discover), and
  "Pass/Accept" is now "Decline/Accept" (reviewing applicants) — plain pill
  buttons instead of ✕/♥ circles.
- **Navigation renamed and reordered, Profile first.** Organizer: Profile · Post ·
  Discover · Connect. Freelancer: Profile · Job · Connect.
- **Job feed location filter, automatic and adjustable.** Defaults to the
  freelancer's own saved location(s), shown as toggleable chips so they can add
  more cities or clear the filter entirely.
- **New "My Event" tab, both sides.** For freelancers, it's the jobs they've
  actually landed (accepted applications) — separate from the Job tab, which is
  for browsing/applying. For organizers, it's an at-a-glance staffing view of
  their own events (who's confirmed in each division), separate from Post,
  which is for creating/editing postings.
- **Outline-only tab icons.** The emoji tab icons are gone — every tab bar icon
  is now a simple line-style SVG (`src/components/TabIcons.jsx`) for a
  cleaner, less "app-store-emoji" look.
- **Compare applicants, don't just swipe one.** A division can need more than
  one person — `ApplicantReview` now shows every pending applicant for a role
  at once (filterable by gender/experience/location), instead of a one-at-a-
  time swipe deck. Accepting enough people to fill a role auto-declines
  everyone else still pending for it, enforced in the database.
- **Friendlier application status.** A freelancer's "My Event" tab now shows
  every application (not just accepted ones), labeled Pending review /
  Confirmed / Not selected this time — no "rejected".
- **Post-event ratings.** Once a job's event end date has passed, the
  organizer's "My Event" tab prompts them to rate (1–5 stars) and optionally
  recommend everyone who was confirmed on it. Shows up as an average rating +
  written recommendations on the freelancer's profile.
- **Coworker skill endorsements.** A freelancer can endorse another
  freelancer's specific skill, LinkedIn-style, directly from "My Event" — but
  only for people they were actually confirmed on the same job with. No
  separate "friend" system; it rides entirely on real job history.
- **Bug fixes.** Profile pages (both roles) were missing their tab bar
  entirely — fixed. Editing a job posting no longer shows the full postings
  list duplicated underneath the edit form. A new posting's start date can't
  be set in the past.
- **Fee/transport disclosure per division.** An organizer marks each division
  as all-in or "+ transport reimbursed" (with an optional cap), and it shows
  right on the job post so applicants know upfront.
- **Unified locations.** Freelancer locations and job posting locations now
  pick from one curated list (`locations` table, same pattern as skills)
  instead of free-typing a city — so Discover and Job Feed location filters
  actually match reliably. A "type your own" escape hatch still exists for
  anywhere not listed.
- **Custom division roles + an "Other" skill filter.** A job division's role
  can be typed freehand if it's not in the curated skill list. Discover's
  skill filter gained an "Other" chip that catches freelancers with a custom
  (non-curated) skill.
- **Team roster + direct invites.** An organizer's "team" — everyone they've
  been confirmed with before, plus anyone they add manually from a
  freelancer's profile — can be invited straight into a new division when
  posting a job. The freelancer still has to confirm (an "invited" status)
  before it counts as booked.
- **Group chat per event.** Everyone confirmed on a job (the organizer + every
  accepted freelancer, across all its divisions) now shares one chat thread
  named after the event, reachable from "My Event" and Connect. This replaces
  the 1:1 chat for job-based connections; a Discover-sourced ("like")
  connection still gets its own 1:1 chat since there's no job attached to it.

## What's next (deliberately out of v1)

- **Real push notifications.** "Notified" today means a badge that appears next time
  they open the app — a phone push notification needs a native app or web push setup.
- **True location/radius search.** Location is currently free-typed strings matched
  as exact chips, not GPS-distance search.
- **Ratings/reviews**, read receipts / typing indicators in chat, and swipe-gesture
  (drag) interactions instead of tap buttons are also not in this pass.
