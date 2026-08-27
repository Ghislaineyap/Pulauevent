import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'

export default function OrganizerOnboarding() {
  const { user, roleProfile, isOnboarded, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [orgName, setOrgName] = useState('')
  const [hideName, setHideName] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (hydrated || !roleProfile) return
    setOrgName(roleProfile.org_name || '')
    setHideName(Boolean(roleProfile.hide_name))
    setHydrated(true)
  }, [roleProfile, hydrated])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!orgName.trim()) {
      setError('Tell us your name or organization name.')
      return
    }
    setBusy(true)
    const { error: upsertError } = await supabase.from('organizer_profiles').upsert({
      id: user.id,
      org_name: orgName.trim(),
      hide_name: hideName,
    })
    setBusy(false)
    if (upsertError) {
      setError(upsertError.message)
      return
    }
    await refreshProfile()
    navigate('/organizer/dashboard')
  }

  return (
    <div className="app-shell">
      <Topbar title={isOnboarded ? 'Edit your organizer profile' : 'Set up your organizer profile'} />
      <div className="page">
        <p className="subtitle">Freelancers see this once you connect. Until then, you can choose to stay anonymous.</p>
        <form className="card stack" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="orgName">Your name or organization</label>
            <input id="orgName" type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </div>
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={hideName}
                onChange={(e) => setHideName(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Keep my name hidden from freelancers until we connect
            </label>
            <p className="helper-text">
              Before you connect, freelancers see you as "Event Organizer." Once connected, your real name is
              revealed to them.
            </p>
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? 'Saving…' : isOnboarded ? 'Save changes' : 'Continue'}
          </button>
        </form>
      </div>
      <OrganizerTabbar />
    </div>
  )
}
