import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, FreelancerTabbar } from '../../components/Layout'
import { formatEventDates, datesOverlap } from '../../lib/date'
import { applicationStatusLabel, applicationStatusChipClass } from '../../lib/applicationStatus'

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

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('job_postings')
      .select(
        'id, title, description, location, event_start_date, event_end_date, organizer_id, organizer_profiles(org_name, hide_name, instagram_handle), job_divisions(id, skill, quantity, filled_count, budget_amount, budget_type, fee_type, transport_max_amount)'
      )
      .eq('id', jobId)
      .single()
    if (error) console.error(error)
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
          {job.description && <p>{job.description}</p>}
        </div>

        <div className="card stack" style={{ gap: 6 }}>
          <strong style={{ fontSize: 13 }}>About the organizer</strong>
          <p style={{ margin: 0 }}>{job.organizer_profiles.hide_name ? 'Event Organizer' : job.organizer_profiles.org_name}</p>
          <p className="subtitle" style={{ margin: 0 }}>
            {organizerStats ? `Posted ${organizerStats.jobCount} event${organizerStats.jobCount === 1 ? '' : 's'} on Pulau Event` : 'Loading history…'}
          </p>
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

        <h2>Divisions</h2>
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
                    <p className="subtitle" style={{ margin: '2px 0 0' }}>
                      {d.fee_type === 'plus_transport'
                        ? d.transport_max_amount
                          ? `+ Transport reimbursed, up to Rp ${Number(d.transport_max_amount).toLocaleString('id-ID')}`
                          : '+ Transport reimbursed separately'
                        : 'All-in rate — no separate reimbursement'}
                    </p>
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
