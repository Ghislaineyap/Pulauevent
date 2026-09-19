import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { uploadProfilePhoto } from '../../lib/uploadPhoto'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { InfoButton } from '../../components/InfoButton'
import { EventDashboard } from './MyEvents'

export default function OrganizerOnboarding() {
  const { user, roleProfile, isOnboarded, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [dashLoading, setDashLoading] = useState(true)
  const [orgName, setOrgName] = useState('')
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

  // Profile now doubles as the dashboard (My Event's old "Home" segment) —
  // its own lightweight load, since routes don't share state with MyEvents.
  // Only what EventDashboard's tiles actually need: no ratings, no per-
  // division team roster beyond confirmedTeam/open-recruit counts.
  const loadDashboard = useCallback(async () => {
    setDashLoading(true)
    const { data: jobRows, error: jobsError } = await supabase
      .from('job_postings')
      .select('id, title, location, event_start_date, event_end_date, job_divisions(id, skill, quantity, filled_count, open_recruit)')
      .eq('organizer_id', user.id)
      .order('created_at', { ascending: false })
    if (jobsError) console.error(jobsError)

    const divisionIds = (jobRows || []).flatMap((j) => j.job_divisions.map((d) => d.id))
    const confirmedByJob = new Map()
    const openRecruitDivisionIds = []
    if (divisionIds.length > 0) {
      const { data: apps, error: appsError } = await supabase
        .from('applications')
        .select('id, status, division_id, job_divisions(job_id, open_recruit), freelancer_profiles(id, name)')
        .in('division_id', divisionIds)
        .eq('status', 'accepted')
      if (appsError) console.error(appsError)
      ;(apps || []).forEach((a) => {
        const jobId = a.job_divisions.job_id
        const confirmed = confirmedByJob.get(jobId) || []
        if (!confirmed.some((p) => p.id === a.freelancer_profiles.id)) confirmed.push({ id: a.freelancer_profiles.id, name: a.freelancer_profiles.name })
        confirmedByJob.set(jobId, confirmed)
      })
      ;(jobRows || []).forEach((j) => j.job_divisions.filter((d) => d.open_recruit).forEach((d) => openRecruitDivisionIds.push(d.id)))
    }

    setJobs((jobRows || []).map((j) => ({ ...j, confirmedTeam: confirmedByJob.get(j.id) || [] })))

    // Same count the Team roster tile and My Event's Post tab badge track —
    // applicants waiting on a decision across every open-recruit division.
    if (openRecruitDivisionIds.length > 0) {
      const { count, error: pendingError } = await supabase
        .from('applications')
        .select('id', { count: 'exact', head: true })
        .in('division_id', openRecruitDivisionIds)
        .eq('status', 'pending')
      if (pendingError) console.error(pendingError)
      setPendingCount(count || 0)
    } else {
      setPendingCount(0)
    }

    setDashLoading(false)
  }, [user.id])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  useEffect(() => {
    supabase
      .from('team_members')
      .select('freelancer_id, freelancer_profiles(id, name, skills)')
      .eq('organizer_id', user.id)
      .then(({ data, error: teamError }) => {
        if (teamError) console.error(teamError)
        setTeamMembers((data || []).map((t) => t.freelancer_profiles).filter(Boolean))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <Topbar title="Profile" />
      <div className="page">
        {isOnboarded && (
          <>
            {dashLoading ? (
              <p className="subtitle">Loading…</p>
            ) : (
              <EventDashboard jobs={jobs} teamMembers={teamMembers} pendingCount={pendingCount} orgName={orgName} onCreate={() => navigate('/organizer/my-events', { state: { openCreate: true } })} />
            )}
            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '18px 0' }} />
          </>
        )}

        <p className="subtitle" style={{ display: 'flex', alignItems: 'center' }}>
          Your public profile
          <InfoButton title="Your public profile">
            This is what freelancers see everywhere — your name is never hidden, so make it a good first impression.
          </InfoButton>
        </p>
        <form className="card stack" onSubmit={handleSubmit}>
          <div className="field" style={{ textAlign: 'center' }}>
            <label style={{ textAlign: 'left' }}>Logo (optional)</label>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <label
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: 18,
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

        <button type="button" className="btn btn-outline btn-block" style={{ marginTop: 12 }} onClick={signOut}>
          Sign out
        </button>
      </div>
      <OrganizerTabbar />
    </div>
  )
}
