import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { PhotoFrame } from '../../components/PhotoFrame'
import { RatingsSummary } from '../../components/RatingsSummary'
import { experienceBandLabel } from '../../lib/experience'

// Full-detail view reached by tapping a freelancer's browse card — the
// compact card only shows a name, location, and one-line pitch; everything
// else (full skill list, rate, work history, all photos) lives here instead.
export default function FreelancerProfileDetail() {
  const { freelancerId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [freelancer, setFreelancer] = useState(null)
  const [activePhoto, setActivePhoto] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [inTeam, setInTeam] = useState(false)
  const [teamBusy, setTeamBusy] = useState(false)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('freelancer_profiles')
      .select('*')
      .eq('id', freelancerId)
      .single()
      .then(({ data, error: loadError }) => {
        if (loadError) setError("Couldn't load this profile.")
        setFreelancer(data)
        setLoading(false)
      })
    supabase
      .from('team_members')
      .select('id')
      .eq('organizer_id', user.id)
      .eq('freelancer_id', freelancerId)
      .maybeSingle()
      .then(({ data }) => setInTeam(Boolean(data)))
  }, [freelancerId, user.id])

  async function addToTeam() {
    setTeamBusy(true)
    const { error: teamError } = await supabase
      .from('team_members')
      .upsert({ organizer_id: user.id, freelancer_id: freelancerId, source: 'manual' }, { onConflict: 'organizer_id,freelancer_id', ignoreDuplicates: true })
    setTeamBusy(false)
    if (teamError) {
      console.error(teamError)
      return
    }
    setInTeam(true)
  }

  async function act(status) {
    setBusy(true)
    const { error: actError } = await supabase.from('likes').insert({
      organizer_id: user.id,
      freelancer_id: freelancerId,
      status: status === 'like' ? 'pending' : 'declined',
    })
    setBusy(false)
    if (actError) {
      setError(actError.message)
      return
    }
    setDone(status)
  }

  if (loading) {
    return (
      <div className="app-shell">
        <Topbar title="Freelancer profile" />
        <div className="page">
          <div className="skeleton" style={{ aspectRatio: '4 / 5', borderRadius: 18 }} />
          <div className="skeleton" style={{ height: 20, width: '60%', margin: '0 auto', borderRadius: 6 }} />
          <div className="skeleton" style={{ height: 14, width: '40%', margin: '0 auto', borderRadius: 6 }} />
          <div className="skeleton" style={{ height: 90, borderRadius: 14 }} />
        </div>
        <OrganizerTabbar />
      </div>
    )
  }
  if (!freelancer) {
    return (
      <div className="center-page">
        <p className="error-text">{error || 'Profile not found.'}</p>
        <button className="btn btn-outline" onClick={() => navigate(-1)}>
          Go back
        </button>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Topbar title="Freelancer profile" />
      <div className="page">
        <Link to="/organizer/browse" className="subtitle">
          ← Back to Discover
        </Link>

        <PhotoFrame
          photoUrl={(freelancer.photo_urls || [])[activePhoto]}
          gender={freelancer.gender}
          style={{ borderRadius: 18 }}
        />

        {freelancer.photo_urls?.length > 1 && (
          <div className="gallery-thumbs">
            {freelancer.photo_urls.map((url, i) => (
              <div
                key={url}
                className={`thumb ${i === activePhoto ? 'active' : ''}`}
                style={{ backgroundImage: `url(${url})` }}
                role="button"
                tabIndex={0}
                onClick={() => setActivePhoto(i)}
                onKeyDown={(e) => e.key === 'Enter' && setActivePhoto(i)}
              />
            ))}
          </div>
        )}

        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <h1 style={{ margin: 0 }}>{freelancer.name}</h1>
          <p className="subtitle">
            📍 {(freelancer.locations || []).join(', ')}
            {freelancer.experience_band && ` · ${experienceBandLabel(freelancer.experience_band)} experience`}
          </p>
          {freelancer.pitch && <p>{freelancer.pitch}</p>}
          {freelancer.instagram_handle && (
            <a
              href={`https://instagram.com/${freelancer.instagram_handle.replace(/^@/, '')}`}
              target="_blank"
              rel="noreferrer"
              className="subtitle"
              style={{ color: 'var(--primary-dark)', fontWeight: 600 }}
            >
              📷 @{freelancer.instagram_handle.replace(/^@/, '')}
            </a>
          )}
          <button
            className="btn btn-outline"
            disabled={inTeam || teamBusy}
            onClick={addToTeam}
            style={{ marginTop: 4 }}
          >
            {inTeam ? '✓ In your team' : teamBusy ? 'Adding…' : '+ Add to my team'}
          </button>
          <p className="helper-text" style={{ margin: 0 }}>
            Team members can be invited directly into a division next time you post a job.
          </p>
        </div>

        <RatingsSummary freelancerId={freelancer.id} />

        {freelancer.skills?.length > 0 && (
          <div className="stack">
            <h2>Skills</h2>
            <div className="chip-row">
              {freelancer.skills.map((s) => (
                <span key={s} className="chip chip-outline">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {freelancer.rate_amount && (
          <div className="card">
            <strong>Rate</strong>
            <p className="subtitle" style={{ margin: '4px 0 0' }}>
              Rp {Number(freelancer.rate_amount).toLocaleString('id-ID')} / {freelancer.rate_type}
            </p>
          </div>
        )}

        {freelancer.work_history && (
          <div className="card">
            <strong>Work history</strong>
            <p style={{ margin: '4px 0 0' }}>{freelancer.work_history}</p>
          </div>
        )}

        {error && <p className="error-text">{error}</p>}

        {done ? (
          <div className="card" style={{ textAlign: 'center' }}>
            <p style={{ margin: 0 }}>
              {done === 'like'
                ? `👋 ${freelancer.name} has been notified. They'll accept or decline from their end.`
                : 'Skipped — you can keep browsing.'}
            </p>
            <button className="btn btn-outline" style={{ marginTop: 10 }} onClick={() => navigate('/organizer/browse')}>
              Back to Discover
            </button>
          </div>
        ) : (
          <div className="row">
            <button className="btn btn-outline" style={{ flex: 1 }} disabled={busy} onClick={() => act('pass')}>
              Skip
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={() => act('like')}>
              Shortlist
            </button>
          </div>
        )}
      </div>
      <OrganizerTabbar />
    </div>
  )
}
