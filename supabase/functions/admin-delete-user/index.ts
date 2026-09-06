// Deletes a person's account entirely — auth.users row and, via the
// "on delete cascade" chain already set up in schema.sql, every profile,
// event, application, chat, match, and rating that belongs to them.
//
// This has to be a server-side function, not a plain client-side delete:
// removing an auth.users row requires the service role key, which must
// never be shipped to the browser (it bypasses every RLS policy in the
// app). So the admin dashboard calls this function instead, and the
// function is the only thing that ever touches the service role key.
//
// Deploy with the Supabase CLI (see supabase/functions/README.md for the
// exact commands) — nothing here runs until you do.

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

    // Scoped to the CALLER's own JWT — RLS applies as normal, so this can
    // only ever confirm "is the person calling me actually an admin?", not
    // read or change anything else.
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
    if (adminCheckError) {
      return json({ error: adminCheckError.message }, 500)
    }
    if (!isAdmin) {
      return json({ error: 'Not an admin account.' }, 403)
    }

    const { userId } = await req.json()
    if (!userId || typeof userId !== 'string') {
      return json({ error: 'Missing userId.' }, 400)
    }
    if (userId === caller.id) {
      return json({ error: "You can't delete your own admin account from here." }, 400)
    }

    // Only NOW, after confirming the caller is really an admin, do we touch
    // the service role key.
    const adminClient = createClient(supabaseUrl, serviceRoleKey)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
    if (deleteError) {
      return json({ error: deleteError.message }, 500)
    }

    return json({ ok: true })
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
