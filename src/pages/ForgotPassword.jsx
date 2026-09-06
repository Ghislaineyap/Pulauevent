import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

// Step 1 of the reset flow — request the email. Step 2 (actually choosing a
// new password) happens on /reset-password, which Supabase sends the user
// to once they click the link in that email.
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    // Show the same confirmation either way — don't reveal whether an email
    // is actually registered.
    if (resetError) console.error(resetError)
    setSent(true)
  }

  if (sent) {
    return (
      <div className="center-page">
        <div style={{ fontSize: 40 }}>📬</div>
        <h1>Check your email</h1>
        <p className="subtitle">
          If <strong>{email}</strong> has an account, we just sent a link to reset the password. Click it, choose a
          new password, and you're back in.
        </p>
        <Link to="/login" className="btn btn-outline" style={{ marginTop: 12 }}>
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="page" style={{ justifyContent: 'center', minHeight: '100vh' }}>
      <div className="stack">
        <div>
          <h1>Reset your password</h1>
          <p className="subtitle">Enter the email on your account and we'll send you a link to set a new password.</p>
        </div>
        <form className="card stack" onSubmit={handleSubmit}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <p className="subtitle" style={{ textAlign: 'center' }}>
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}
