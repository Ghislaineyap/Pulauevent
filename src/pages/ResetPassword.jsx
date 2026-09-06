import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

// Landing spot for the link Supabase emails from ForgotPassword. Supabase's
// client reads the recovery token straight out of the URL and fires a
// PASSWORD_RECOVERY auth event once it's set up a (short-lived) session for
// it — that's the signal this page waits for before showing the form, so a
// stale/reused/expired link shows a clear "expired" state instead of a
// broken form.
export default function ResetPassword() {
  const [status, setStatus] = useState('checking') // 'checking' | 'ready' | 'invalid' | 'done'
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setStatus('ready')
    })
    // Covers a page refresh after the recovery session is already live.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setStatus((s) => (s === 'checking' ? 'ready' : s))
    })
    const timer = setTimeout(() => {
      setStatus((s) => (s === 'checking' ? 'invalid' : s))
    }, 4000)
    return () => {
      listener.subscription.unsubscribe()
      clearTimeout(timer)
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setStatus('done')
  }

  if (status === 'checking') {
    return (
      <div className="center-page">
        <p className="subtitle">Checking your link…</p>
      </div>
    )
  }

  if (status === 'invalid') {
    return (
      <div className="center-page">
        <h1>This link has expired</h1>
        <p className="subtitle">Reset links only work once and expire after a while — request a new one.</p>
        <Link to="/forgot-password" className="btn btn-primary" style={{ marginTop: 12 }}>
          Request a new link
        </Link>
      </div>
    )
  }

  if (status === 'done') {
    return (
      <div className="center-page">
        <div style={{ fontSize: 40 }}>✅</div>
        <h1>Password updated</h1>
        <p className="subtitle">You're signed in with your new password.</p>
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => navigate('/')}>
          Continue
        </button>
      </div>
    )
  }

  return (
    <div className="page" style={{ justifyContent: 'center', minHeight: '100vh' }}>
      <div className="stack">
        <div>
          <h1>Choose a new password</h1>
          <p className="subtitle">This link is single-use — set a password you'll remember.</p>
        </div>
        <form className="card stack" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="password">New password</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
