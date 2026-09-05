import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { uploadProfilePhoto } from '../../lib/uploadPhoto'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { InfoButton } from '../../components/InfoButton'

export default function OrganizerOnboarding() {
  const { user, roleProfile, isOnboarded, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [orgName, setOrgName] = useState('')
  const [hideName, setHideName] = useState(true)
  const [instagramHandle, setInstagramHandle] = useState('')
  const [location, setLocation] = useState('')
  const [about, setAbout] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoError, setLogoError] = useState('')
  const [locationOptions, setLocationOptions] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (hydrated || !roleProfile) return
    setOrgName(roleProfile.org_name || '')
    setHideName(Boolean(roleProfile.hide_name))
    setInstagramHandle(roleProfile.instagram_handle || '')
    setLocation(roleProfile.location || '')
    setAbout(roleProfile.about || '')
    setLogoUrl(roleProfile.logo_url || '')
    setHydrated(true)
  }, [roleProfile, hydrated])

  useEffect(() => {
    supabase
      .from('locations')
      .select('label')
      .order('sort_order')
      .then(({ data, error: locError }) => {
        if (locError) console.error(locError)
        setLocationOptions((data || []).map((l) => l.label))
      })
  }, [])

  async function handleLogoChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLogoError('')
    setUploadingLogo(true)
    try {
      const url = await uploadProfilePhoto(user.id, file, 1)
      setLogoUrl(url)
    } catch (err) {
      setLogoError(err.message || 'Could not upload that image — try a different one.')
    } finally {
      setUploadingLogo(false)
    }
  }

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
      instagram_handle: instagramHandle.trim().replace(/^@/, '') || null,
      location: location || null,
      about: about.trim() || null,
      logo_url: logoUrl || null,
    })
    setBusy(false)
    if (upsertError) {
      setError(upsertError.message)
      return
    }
    await refreshProfile()
    navigate('/organizer/my-events')
  }

  return (
    <div className="app-shell">
      <Topbar title={isOnboarded ? 'Edit your organizer profile' : 'Set up your organizer profile'} />
      <div className="page">
        <p className="subtitle">Freelancers see this once you connect. Until then, you can choose to stay anonymous.</p>
        <form className="card stack" onSubmit={handleSubmit}>
          <div className="field" style={{ textAlign: 'center' }}>
            <label style={{ textAlign: 'left' }}>Logo (optional)</label>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <label
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 12,
                  border: '1px dashed var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: 4,
                  cursor: uploadingLogo ? 'default' : 'pointer',
                  color: 'var(--muted)',
                  fontSize: 11,
                  textAlign: 'center',
                  overflow: 'hidden',
                  backgroundImage: logoUrl ? `url(${logoUrl})` : 'none',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                {!logoUrl && (uploadingLogo ? 'Uploading…' : (
                  <>
                    <span style={{ fontSize: 20, lineHeight: 1 }}>+</span>
                    Add logo
                  </>
                ))}
                <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingLogo} onChange={handleLogoChange} />
              </label>
            </div>
            {logoUrl && (
              <button type="button" className="btn btn-outline" style={{ marginTop: 8, padding: '4px 10px', fontSize: 12 }} onClick={() => setLogoUrl('')}>
                Remove logo
              </button>
            )}
            {logoError && <p className="error-text">{logoError}</p>}
          </div>

          <div className="field">
            <label htmlFor="orgName">Your name or organization</label>
            <input id="orgName" type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </div>
          <div className="field">
            <label style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={hideName}
                onChange={(e) => setHideName(e.target.checked)}
                style={{ marginRight: 8 }}
              />
              Keep my name hidden until connected
              <InfoButton title="Hiding your name">
                Before you connect with a freelancer, they see you as "Event Organizer" instead of your real name.
                Once connected, your real name is revealed to them.
              </InfoButton>
            </label>
          </div>
          <div className="field">
            <label htmlFor="orgLocation">Based in</label>
            <select id="orgLocation" value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="">Select location…</option>
              {locationOptions.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="about">About (optional)</label>
            <textarea
              id="about"
              placeholder="What kind of events do you run? e.g. corporate conferences and weddings across Java"
              value={about}
              onChange={(e) => setAbout(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label style={{ display: 'flex', alignItems: 'center' }} htmlFor="instagram">
              Instagram (optional)
              <InfoButton title="Why add these?">
                Logo, location, About and Instagram all show up in a freelancer's "About the organizer" popup on your
                job posts — helps them trust you're legit before applying.
              </InfoButton>
            </label>
            <input
              id="instagram"
              type="text"
              placeholder="@yourorganization"
              value={instagramHandle}
              onChange={(e) => setInstagramHandle(e.target.value)}
            />
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
