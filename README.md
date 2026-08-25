# Vendor Connect

Event-services freelancers, and the organizers who hire them — swipe, apply, match.
Built with React + Vite, Supabase (database, auth), deployed on Netlify.

**Status: v1 core flow.** Profiles, job postings with divisions, browse/apply/match on
both paths. Photo uploads, in-app chat, and push-style notifications are intentionally
not in this pass — see "What's next" below.

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
- **Path B — profile-browse driven.** An organizer browses freelancer profiles
  directly (filterable by location) and swipes/likes one. The freelancer sees it as
  a pending like in their Activity tab and accepts or declines.

Either path converging on an "accepted" status triggers a Postgres trigger
(`supabase/schema.sql`) that creates a row in `matches` automatically — the client
never inserts matches directly, which keeps that logic in one trustworthy place.

If an organizer chose to stay anonymous during onboarding, their real name is hidden
from freelancers (shown as "Event Organizer") until a match exists, at which point the
frontend reveals it. **Known v1 simplification:** this hiding is enforced by the
frontend, not the database — see the comment above the RLS policies in
`supabase/schema.sql` for the honest caveat and how to harden it later.

## What's next (deliberately out of v1)

- **Real photo uploads.** Freelancers currently pick from 8 preset avatars
  (`src/lib/avatars.js`) instead of uploading real photos — needs Supabase Storage
  wired up plus upload UI.
- **In-app chat.** Matches currently show a "coming in the next update" note instead
  of real messaging — needs a `messages` table plus Supabase Realtime subscriptions.
- **Real push notifications.** "Notified" today means a badge that appears next time
  they open the app — a phone push notification needs a native app or web push setup.
- **True location/radius search.** Location is currently a free-typed string matched
  with a simple text filter, not GPS-distance search.
- **Profile editing after onboarding**, ratings/reviews, and swipe-gesture (drag)
  interactions instead of tap buttons are also not in this pass.
