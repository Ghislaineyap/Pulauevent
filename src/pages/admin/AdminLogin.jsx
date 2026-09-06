import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

// Deliberately separate from the freelancer/organizer Login.jsx — there is
// no sign-up here, and a non-admin account (even a genuine freelancer or
// organizer login) is rejected right after auth, not just hidden behind a
// route guard, so this page never doubles as a "log in as anyone" screen.
export default function AdminLogin() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle()
      if (profileError) throw profileError

      if (profile?.role !== 'admin') {
        await supabase.auth.signOut()
        throw new Error('That account is not an admin account.')
      }
      navigate('/admin')
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page" style={{ justifyContent: 'center', minHeight: '100vh' }}>
      <div className="stack">
        <div>
          <h1>Admin sign in</h1>
          <p className="subtitle">Pulau Event platform dashboard.</p>
        </div>
        <form className="card stack" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="subtitle" style={{ textAlign: 'center' }}>
          <Link to="/login">Back to the regular app</Link>
        </p>
      </div>
    </div>
  )
}
