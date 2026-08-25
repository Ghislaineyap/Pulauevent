import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function Login() {
  const [params] = useSearchParams()
  const intendedRole = params.get('role') === 'organizer' ? 'organizer' : 'freelancer'
  const [mode, setMode] = useState('signup') // 'signup' | 'signin'
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
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
        if (signUpError) throw signUpError
        const userId = data.user?.id
        if (userId) {
          const { error: profileError } = await supabase
            .from('profiles')
            .insert({ id: userId, role: intendedRole })
          if (profileError) throw profileError
        }
        // If email confirmation is on in the Supabase project, there's no
        // session yet — send them to a "check your email" notice instead.
        if (!data.session) {
          navigate('/check-email')
          return
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
      }
      navigate('/')
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
          <h1>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h1>
          <p className="subtitle">
            Signing up as{' '}
            <strong>{intendedRole === 'freelancer' ? 'a Freelancer' : 'an Event Organizer'}</strong>.{' '}
            <Link to={`/login?role=${intendedRole === 'freelancer' ? 'organizer' : 'freelancer'}`}>
              Not you? Switch
            </Link>
          </p>
        </div>

        <form className="card stack" onSubmit={handleSubmit}>
          <div className="field">
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
          <div className="field">
            <label htmlFor="password">Password</label>
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
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="subtitle" style={{ textAlign: 'center' }}>
          {mode === 'signup' ? 'Already have an account?' : "Don't have an account yet?"}{' '}
          <button
            className="link"
            style={{ background: 'none', border: 'none', color: 'var(--coral)', cursor: 'pointer', fontWeight: 700 }}
            onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
            type="button"
          >
            {mode === 'signup' ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  )
}
