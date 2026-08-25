import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = still loading
  const [profile, setProfile] = useState(null) // { id, role } or null once we know there's none yet
  const [roleProfile, setRoleProfile] = useState(null) // freelancer_profiles or organizer_profiles row, or null
  const [loadingProfile, setLoadingProfile] = useState(true)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      setRoleProfile(null)
      setLoadingProfile(false)
      return
    }
    setLoadingProfile(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', userId)
      .maybeSingle()
    if (error) console.error('loadProfile error', error)
    setProfile(data || null)

    if (data?.role) {
      const table = data.role === 'freelancer' ? 'freelancer_profiles' : 'organizer_profiles'
      const { data: detail, error: detailErr } = await supabase
        .from(table)
        .select('*')
        .eq('id', userId)
        .maybeSingle()
      if (detailErr) console.error('loadProfile detail error', detailErr)
      setRoleProfile(detail || null)
    } else {
      setRoleProfile(null)
    }
    setLoadingProfile(false)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      loadProfile(session?.user?.id)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      loadProfile(session?.user?.id)
    })
    return () => listener.subscription.unsubscribe()
  }, [loadProfile])

  const refreshProfile = useCallback(() => loadProfile(session?.user?.id), [loadProfile, session])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    roleProfile,
    isOnboarded: Boolean(roleProfile),
    loading: session === undefined || loadingProfile,
    refreshProfile,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
