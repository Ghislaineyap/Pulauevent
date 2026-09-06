// Returns { id, email, createdAt } for every account. Emails live in
// auth.users, which the browser can never query directly (Supabase doesn't
// expose the auth schema to the client library at all) — so, same as
// admin-delete-user, this has to run server-side with the service role key.
//
// The admin dashboard merges this with public.profiles /
// freelancer_profiles / organizer_profiles (fetched directly from the
// browser — RLS already grants an admin account read access to those) to
// build the full "manage users" table. Nothing else lives in this function
// on purpose: nothing here can be done without the service role key stays
// out of it.
//
// Deploy with the Supabase CLI — see supabase/functions/README.md.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Missing Authorization header.' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser()
    if (callerError || !caller) {
      return json({ error: 'Not signed in.' }, 401)
    }

    const { data: isAdmin, error: adminCheckError } = await callerClient.rpc('is_admin')
    if (adminCheckError) return json({ error: adminCheckError.message }, 500)
    if (!isAdmin) return json({ error: 'Not an admin account.' }, 403)

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // Paginated under the hood — 1000 per page comfortably covers an early-
    // stage platform. If you outgrow that, loop `page` here until a page
    // comes back with fewer than perPage users.
    const { data, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (listError) return json({ error: listError.message }, 500)

    const users = data.users.map((u) => ({ id: u.id, email: u.email, createdAt: u.created_at }))
    return json({ users })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500)
  }
})

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
