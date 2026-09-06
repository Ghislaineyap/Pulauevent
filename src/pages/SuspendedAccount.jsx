import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthProvider'

// Reached only through Guard/Landing's isSuspended redirect (see
// migration_reports_appeals.sql — profiles.status). Shows why, and lets the
// person file an appeal for an admin to review from the dashboard's Appeals
// tab. Not wrapped in <Guard> itself — a suspended user must still be able
// to reach this one screen, which is exactly what Guard would otherwise
// route them away from.
export default function SuspendedAccount() {
  const { user, loading: authLoading, isSuspended, suspendedReason, refreshProfile, signOut } = useAuth()
  const [appeals, setAppeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data, error: loadError } = await supabase
      .from('appeals')
      .select('*')
      .eq('profile_id', user.id)
      .order('created_at', { ascending: false })
    if (loadError) console.error(loadError)
    setAppeals(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  const latestAppeal = appeals[0]

  // If an admin approved the appeal while this was open, pick that up and
  // let the redirect below take over instead of leaving them stuck here.
  useEffect(() => {
    if (!loading && latestAppeal?.status === 'approved') {
      refreshProfile()
    }
  }, [loading, latestAppeal, refreshProfile])

  if (authLoading) return <div className="center-page">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (!isSuspended) return <Navigate to="/" replace />

  const canSubmitNew = !latestAppeal || latestAppeal.status === 'denied'

  async function handleSubmit(e) {
    e.preventDefault()
    if (!message.trim()) return
    setBusy(true)
    setError('')
    const { error: insertError } = await supabase
      .from('appeals')
      .insert({ profile_id: user.id, message: message.trim() })
    setBusy(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setMessage('')
    load()
  }

  return (
    <div className="page" style={{ justifyContent: 'center', minHeight: '100vh' }}>
      <div className="stack" style={{ maxWidth: 420, width: '100%', margin: '0 auto' }}>
        <div>
          <h1>Account suspended</h1>
          <p className="subtitle">
            Your Pulau Event account has been suspended by our team.
            {suspendedReason && <> Reason given: <strong style={{ color: 'var(--ink)' }}>{suspendedReason}</strong>.</>}
          </p>
        </div>

        {loading && <p className="subtitle">Loading…</p>}

        {!loading && latestAppeal?.status === 'pending' && (
          <div className="card">
            <p style={{ margin: 0, fontWeight: 700 }}>Your appeal is under review</p>
            <p className="subtitle" style={{ margin: '4px 0 0' }}>
              Submitted {new Date(latestAppeal.created_at).toLocaleDateString()}. We'll let you know once it's been decided —
              come back and check this page anytime.
            </p>
          </div>
        )}

        {!loading && latestAppeal?.status === 'denied' && (
          <div className="card">
            <p style={{ margin: 0, fontWeight: 700 }}>Your last appeal was denied</p>
            {latestAppeal.admin_notes && (
              <p className="subtitle" style={{ margin: '4px 0 0' }}>{latestAppeal.admin_notes}</p>
            )}
          </div>
        )}

        {!loading && canSubmitNew && (
          <form className="card stack" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="appeal-message">
                {latestAppeal ? 'Submit another appeal' : 'Think this was a mistake?'}
              </label>
              <textarea
                id="appeal-message"
                rows={5}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Explain why you think your account should be reinstated…"
              />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="btn btn-primary btn-block" disabled={busy} type="submit">
              {busy ? 'Sending…' : 'Submit appeal'}
            </button>
          </form>
        )}

        <button className="btn btn-outline btn-block" onClick={signOut} type="button">
          Sign out
        </button>
      </div>
    </div>
  )
}
