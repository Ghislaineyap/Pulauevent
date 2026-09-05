import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, FreelancerTabbar } from '../../components/Layout'
import { Modal } from '../../components/Modal'
import { formatEventDates, datesOverlap } from '../../lib/date'
import { applicationStatusLabel, applicationStatusChipClass } from '../../lib/applicationStatus'

function feeSummary(d) {
  if (d.fee_type !== 'plus_transport') return 'All-in rate'
  return d.transport_max_amount ? `+ Transport, up to Rp ${Number(d.transport_max_amount).toLocaleString('id-ID')}` : '+ Transport reimbursed'
}

export default function JobDetail() {
  const { jobId } = useParams()
  const { user } = useAuth()
  const [job, setJob] = useState(null)
  const [myApplications, setMyApplications] = useState([]) // division_ids I've applied to
  const [bookedEvents, setBookedEvents] = useState([]) // other events I'm already accepted on, for the date-conflict check
  const [organizerStats, setOrganizerStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(null)
  const [conflictDivisionId, setConflictDivisionId] = useState(null)
  const [error, setError] = useState('')
  const [showDetails, setShowDetails] = useState(false)
  const [showOrganizer, setShowOrganizer] = useState(false)
  const [feePopupDivisionId, setFeePopupDivisionId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('job_postings')
      .select(
        'id, title, description, location, event_start_date, event_end_date, organizer_id, organizer_profiles(org_name, hide_name, instagram_handle, location, about, logo_url), job_divisions(id, skill, quantity, filled_count, budget_amount, budget_type, fee_type, transport_max_amount, open_recruit)'
      )
      .eq('id', jobId)
      .single()
    if (error) console.error(error)
    if (data) data.job_divisions = data.job_divisions.filter((d) => d.open_recruit)
    setJob(data)

    const { data: apps } = await supabase.from('applications').select('division_id, status').eq('freelancer_id', user.id)
    setMyApplications(apps || [])

    const { data: accepted } = await supabase
      .from('applications')
      .select('job_divisions(job_id, job_postings(id, title, event_start_date, event_end_date))')
      .eq('freelancer_id', user.id)
      .eq('status', 'accepted')
    setBookedEvents(
      (accepted || [])
        .map((a) => a.job_divisions?.job_postings)
        .filter((j) => j && j.id !== jobId)
    )

    if (data) {
      const { count } = await supabase
        .from('job_postings')
        .select('id', { count: 'exact', head: true })
        .eq('organizer_id', data.organizer_id)
      setOrganizerStats({ jobCount: count || 0 })
    }
    setLoading(false)
  }, [jobId, user.id])

  useEffect(() => {
    load()
  }, [load])

  async function apply(divisionId) {
    setError('')
    // Warn (but don't block) if this event's dates overlap something the
    // freelancer is already confirmed on — unless they've already seen the
    // warning and clicked "Apply anyway" for this exact division.
    if (conflictDivisionId !== divisionId) {
      const conflict = bookedEvents.find((ev) => datesOverlap(job.event_start_date, job.event_end_date, ev.event_start_date, ev.event_end_date))
      if (conflict) {
        setConflictDivisionId(divisionId)
        return
      }
    }
    setApplying(divisionId)
    const { error } = await supabase.from('applications').insert({ division_id: divisionId, freelancer_id: user.id })
    setApplying(null)
    setConflictDivisionId(null)
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  const conflictEvent =
    conflictDivisionId &&
    job &&
    bookedEvents.find((ev) => datesOverlap(job.event_start_date, job.event_end_date, ev.event_start_date, ev.event_end_date))

  if (loading) return <div className="center-page">Loading…</div>
  if (!job) return <div className="center-page">Job not found.</div>

  const feePopupDivision = feePopupDivisionId && job.job_divisions.find((d) => d.id === feePopupDivisionId)

  return (
    <div className="app-shell">
      <Topbar title="Job details" />
      <div className="page">
        <Link to="/freelancer/jobs" className="subtitle">
          ← Back to jobs
        </Link>

        <div className="card stack">
          <h1>{job.title}</h1>
          <p className="subtitle">
            📍 {job.location} · {formatEventDates(job.event_start_date, job.event_end_date)}
          </p>
          {job.description && (
            <button type="button" className="btn btn-outline" style={{ alignSelf: 'flex-start', padding: '6px 12px', fontSize: 12 }} onClick={() => setShowDetails(true)}>
              View event details
            </button>
          )}
          <button
            type="button"
            className="subtitle"
            style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'var(--primary-dark)', fontWeight: 600 }}
            onClick={() => setShowOrganizer(true)}
          >
            {job.organizer_profiles.hide_name ? 'Event Organizer' : job.organizer_profiles.org_name} — About the organizer →
          </button>
        </div>

        {showDetails && (
          <Modal title={job.title} onClose={() => setShowDetails(false)}>
            <p className="subtitle" style={{ marginBottom: 10 }}>
              📍 {job.location} · {formatEventDates(job.event_start_date, job.event_end_date)}
            </p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{job.description}</p>
          </Modal>
        )}

        {showOrganizer && (
          <Modal title="About the organizer" onClose={() => setShowOrganizer(false)}>
            <div className="stack">
              {job.organizer_profiles.logo_url && !job.organizer_profiles.hide_name && (
                <img
                  src={job.organizer_profiles.logo_url}
                  alt=""
                  style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }}
                />
              )}
              <p style={{ margin: 0, fontWeight: 600 }}>
                {job.organizer_profiles.hide_name ? 'Event Organizer' : job.organizer_profiles.org_name}
              </p>
              {job.organizer_profiles.location && <p className="subtitle" style={{ margin: 0 }}>📍 Based in {job.organizer_profiles.location}</p>}
              <p className="subtitle" style={{ margin: 0 }}>
                {organizerStats ? `Posted ${organizerStats.jobCount} event${organizerStats.jobCount === 1 ? '' : 's'} on Pulau Event` : 'Loading history…'}
              </p>
              {job.organizer_profiles.about && <p style={{ margin: 0 }}>{job.organizer_profiles.about}</p>}
              {job.organizer_profiles.instagram_handle ? (
                <a
                  href={`https://instagram.com/${job.organizer_profiles.instagram_handle.replace(/^@/, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="subtitle"
                  style={{ color: 'var(--primary-dark)', fontWeight: 600 }}
                >
                  📷 @{job.organizer_profiles.instagram_handle.replace(/^@/, '')}
                </a>
              ) : (
                <p className="helper-text" style={{ margin: 0 }}>No social profile linked yet.</p>
              )}
            </div>
          </Modal>
        )}

        {feePopupDivision && (
          <Modal title={`${feePopupDivision.skill} — fee details`} onClose={() => setFeePopupDivisionId(null)}>
            <p style={{ margin: 0 }}>
              {feePopupDivision.budget_amount &&
                `Rp ${Number(feePopupDivision.budget_amount).toLocaleString('id-ID')} ${feePopupDivision.budget_type === 'flat' ? 'flat' : `/ ${feePopupDivision.budget_type}`}`}
            </p>
            <p className="subtitle" style={{ marginTop: 8 }}>
              {feePopupDivision.fee_type === 'plus_transport'
                ? feePopupDivision.transport_max_amount
                  ? `Transport is reimbursed separately, up to Rp ${Number(feePopupDivision.transport_max_amount).toLocaleString('id-ID')}.`
                  : 'Transport is reimbursed separately (actual cost).'
                : 'This rate is all-in — no separate transport reimbursement.'}
            </p>
          </Modal>
        )}

        <h2>Divisions</h2>
        {job.job_divisions.length === 0 && <p className="subtitle">No public roles open on this event right now.</p>}
        <div className="stack">
          {job.job_divisions.map((d) => {
            const mine = myApplications.find((a) => a.division_id === d.id)
            const full = d.filled_count >= d.quantity
            const showConflict = conflictDivisionId === d.id && conflictEvent
            return (
              <div key={d.id} className="stack" style={{ gap: 0 }}>
                <div className="division-row">
                  <div>
                    <strong>{d.skill}</strong>
                    <p className="subtitle" style={{ margin: '4px 0 0' }}>
                      {d.filled_count}/{d.quantity} filled
                      {d.budget_amount && ` · Rp ${Number(d.budget_amount).toLocaleString('id-ID')} ${d.budget_type === 'flat' ? 'flat' : `/ ${d.budget_type}`}`}
                    </p>
                    <button
                      type="button"
                      className="subtitle"
                      style={{ background: 'none', border: 'none', padding: 0, margin: '2px 0 0', cursor: 'pointer', color: 'var(--primary-dark)', textAlign: 'left' }}
                      onClick={() => setFeePopupDivisionId(d.id)}
                    >
                      ⓘ {feeSummary(d)}
                    </button>
                  </div>
                  {mine ? (
                    <span className={applicationStatusChipClass(mine.status)}>{applicationStatusLabel(mine.status)}</span>
                  ) : full ? (
                    <span className="chip chip-outline">Full</span>
                  ) : (
                    <button className="btn btn-primary" disabled={applying === d.id} onClick={() => apply(d.id)}>
                      {applying === d.id ? 'Applying…' : showConflict ? 'Apply anyway' : 'Apply'}
                    </button>
                  )}
                </div>
                {showConflict && (
                  <p className="error-text" style={{ margin: '6px 2px 0' }}>
                    ⚠️ You're already confirmed on "{conflictEvent.title}" during an overlapping date
                    ({formatEventDates(conflictEvent.event_start_date, conflictEvent.event_end_date)}). You can still
                    apply if you can cover both.
                  </p>
                )}
              </div>
            )
          })}
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>
      <FreelancerTabbar />
    </div>
  )
}
