import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { PhotoFrame } from '../../components/PhotoFrame'
import { formatEventDates } from '../../lib/date'
import { experienceBandLabel } from '../../lib/experience'

export default function ApplicantReview() {
  const { jobId } = useParams()
  const [job, setJob] = useState(null)
  const [divisions, setDivisions] = useState([])
  const [activeDivisionId, setActiveDivisionId] = useState(null)
  const [applicants, setApplicants] = useState([])
  const [loading, setLoading] = useState(true)
  const [justMatched, setJustMatched] = useState(null)

  const loadJob = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('job_postings')
      .select('id, title, location, event_start_date, event_end_date, job_divisions(id, skill, quantity, filled_count, budget_amount, budget_type)')
      .eq('id', jobId)
      .single()
    if (error) console.error(error)
    setJob(data)
    setDivisions(data?.job_divisions || [])
    setActiveDivisionId((prev) => prev || data?.job_divisions?.[0]?.id || null)
    setLoading(false)
  }, [jobId])

  const loadApplicants = useCallback(async () => {
    if (!activeDivisionId) {
      setApplicants([])
      return
    }
    const { data, error } = await supabase
      .from('applications')
      .select('id, status, freelancer_profiles(id, name, gender, locations, avatar_key, photo_urls, pitch, rate_amount, rate_type, skills, experience_band, work_history)')
      .eq('division_id', activeDivisionId)
      .eq('status', 'pending')
    if (error) console.error(error)
    setApplicants(data || [])
  }, [activeDivisionId])

  useEffect(() => {
    loadJob()
  }, [loadJob])

  useEffect(() => {
    loadApplicants()
  }, [loadApplicants])

  async function respond(applicationId, freelancer, status) {
    const { error } = await supabase.from('applications').update({ status }).eq('id', applicationId)
    if (error) {
      console.error(error)
      return
    }
    if (status === 'accepted') setJustMatched(freelancer)
    setApplicants((apps) => apps.filter((a) => a.id !== applicationId))
    loadJob()
  }

  if (loading) return <div className="center-page">Loading…</div>
  if (!job) return <div className="center-page">Job not found.</div>

  const top = applicants[0]

  return (
    <div className="app-shell">
      <Topbar title={job.title} />
      <div className="page">
        <Link to="/organizer/dashboard" className="subtitle">
          ← Back to posts
        </Link>
        <p className="subtitle">
          📍 {job.location} · {formatEventDates(job.event_start_date, job.event_end_date)}
        </p>

        <div className="chip-row">
          {divisions.map((d) => (
            <span
              key={d.id}
              className={`chip chip-toggle ${activeDivisionId === d.id ? 'active' : ''}`}
              onClick={() => setActiveDivisionId(d.id)}
            >
              {d.skill} ({d.filled_count}/{d.quantity})
            </span>
          ))}
        </div>

        {justMatched && (
          <div className="match-banner">
            <div style={{ fontSize: 30 }}>🎉 You're connected!</div>
            <p style={{ marginTop: 8 }}>
              You and <strong>{justMatched.name}</strong> can now chat in the Connect tab.
            </p>
            <button className="btn btn-outline" style={{ marginTop: 12, background: 'white' }} onClick={() => setJustMatched(null)}>
              Keep reviewing
            </button>
          </div>
        )}

        {!justMatched && (
          <div className="swipe-stack">
            {applicants.length === 0 && (
              <div className="empty-state">No pending applicants for this division yet.</div>
            )}
            {top && (
              <ApplicantCard
                key={top.id}
                app={top}
                onPass={() => respond(top.id, top.freelancer_profiles, 'declined')}
                onLike={() => respond(top.id, top.freelancer_profiles, 'accepted')}
              />
            )}
          </div>
        )}
        {applicants.length > 1 && <p className="subtitle">{applicants.length - 1} more waiting after this one</p>}
      </div>
      <OrganizerTabbar />
    </div>
  )
}

function ApplicantCard({ app, onPass, onLike }) {
  const f = app.freelancer_profiles
  return (
    <div className="swipe-card">
      <PhotoFrame photoUrl={(f.photo_urls || [])[0]} gender={f.gender} dotCount={(f.photo_urls || []).length}>
        <div className="photo-scrim">
          <h2>{f.name}</h2>
          <p>
            📍 {(f.locations || []).join(', ')}
            {f.experience_band && ` · ${experienceBandLabel(f.experience_band)} experience`}
          </p>
        </div>
      </PhotoFrame>
      <div className="photo-card-body">
        {f.pitch && <p style={{ margin: 0, fontSize: 14 }}>{f.pitch}</p>}
        <div className="chip-row">
          {(f.skills || []).map((s) => (
            <span key={s} className="chip chip-outline">
              {s}
            </span>
          ))}
        </div>
        {f.rate_amount && (
          <p className="subtitle">
            Rate: Rp {Number(f.rate_amount).toLocaleString('id-ID')} / {f.rate_type}
          </p>
        )}
        {f.work_history && <p className="subtitle">{f.work_history}</p>}
      </div>
      <div className="swipe-actions" style={{ padding: '0 16px 16px' }}>
        <button className="btn btn-outline" onClick={onPass}>
          Decline
        </button>
        <button className="btn btn-primary" onClick={onLike}>
          Accept
        </button>
      </div>
    </div>
  )
}
