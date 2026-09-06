# Branded auth emails

Two ready-to-paste templates, styled to match the app (warm palette, the
logo on a mint badge) instead of Supabase's plain default. These are
dashboard configuration, not app code — there's nothing to deploy, just
copy-paste.

## How to install them

1. Supabase Dashboard → **Authentication** → **Email Templates**.
2. Click **Confirm signup**. Set:
   - Subject: `Confirm your Pulau Event account`
   - Body: paste the full contents of `confirm-signup.html`
3. Click **Reset Password**. Set:
   - Subject: `Reset your Pulau Event password`
   - Body: paste the full contents of `reset-password.html`
4. Save each one — Supabase shows a live preview so you can sanity-check it
   before saving.

## Two things worth checking while you're in there

- **The logo needs a real deploy first.** The template points at
  `https://pulauevent.com/logo-mark.png` — that file is now in the `public/`
  folder in this codebase (see the app-fixes bundle), but it only exists at
  that URL once you've pulled that bundle in and Netlify has redeployed.
  Until then the logo will show as a broken image in the email. Send
  yourself a test signup once it's live to confirm it renders.
- **Site URL** (Authentication → URL Configuration) should be
  `https://pulauevent.com` now that your domain is connected — that's where
  Supabase sends someone after they click the confirm-signup link. If it's
  still set to the `.netlify.app` address, confirmed sign-ups will land
  there instead. The Reset Password link doesn't use this — it already goes
  straight to `/reset-password` on whatever domain the app was running on
  when the reset was requested, since that's wired directly into
  `ForgotPassword.jsx`.

## Both use the same two placeholders

- `{{ .ConfirmationURL }}` — the actual action link (Supabase fills this in)
- `{{ .Email }}` — the recipient's email, used for the "this confirms
  you@example.com" / "for you@example.com" line

Don't rename or remove either — Supabase's email templating looks for these
exact tokens.
