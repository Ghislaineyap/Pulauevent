# Deploying `admin-delete-user`

This function needs the Supabase CLI — it can't be deployed by pasting code
into the dashboard the way the SQL migrations can.

1. Install the CLI (once): `npm install -g supabase`
2. From the project root (this folder's parent), log in and link your project:
   ```
   supabase login
   supabase link --project-ref <your-project-ref>
   ```
   Your project ref is the subdomain in your Supabase project URL —
   `https://<project-ref>.supabase.co`.
3. Deploy:
   ```
   supabase functions deploy admin-delete-user
   ```

That's it — no secrets to configure. Supabase automatically gives every
deployed function its own project's URL, anon key, and service role key as
environment variables, which is what `admin-delete-user/index.ts` reads.

You can redeploy any time you change the function's code by re-running step 3.
