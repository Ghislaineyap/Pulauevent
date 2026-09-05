import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { formatEventDates } from '../../lib/date'
import { EventCalendar } from '../../components/EventCalendar'

const todayISO = () => new Date().toISOString().slice(0, 10)

// "My Event" — an operational view of the organizer's own events: who's
// actually confirmed in each division, at a glance. Creating/editing a
// posting still happens in the Post tab; this is where you check on staffing,
// and once an event's end date has passed, rate/recommend the people on it.
export default function MyEvents() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])
  const [ratedKeys, setRatedKeys] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list') // 'list' | 'calendar'

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: jobRows, error: jobsError }, { data: myRatings }] = await Promise.all([
      supabase
        .from('job_postings')
        .select(
          'id, title, location, event_start_date, event_end_date, status, chat_opened_at, job_divisions(id, skill, quantity, filled_count)'
        )
        .eq('organizer_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('ratings').select('job_id, freelancer_id').eq('organizer_id', user.id),
    ])
    if (jobsError) console.error(jobsError)
    setRatedKeys(new Set((myRatings || []).map((r) => `${r.job_id}:${r.freelancer_id}`)))

    const divisionIds = (jobRows || []).flatMap((j) => j.job_divisions.map((d) => d.id))
    const namesByDivision = new Map()
    const confirmedByJob = new Map()
    if (divisionIds.length > 0) {
      const { data: apps, error: appsError } = await supabase
        .from('applications')
        .select('division_id, job_divisions(job_id), freelancer_profiles(id, name)')
        .in('division_id', divisionIds)
        .eq('status', 'accepted')
      if (appsError) console.error(appsError)
      ;(apps || []).forEach((a) => {
        const list = namesByDivision.get(a.division_id) || []
        list.push(a.freelancer_profiles.name)
        namesByDivision.set(a.division_id, list)

        const jobId = a.job_divisions.job_id
        const confirmed = confirmedByJob.get(jobId) || []
        if (!confirmed.some((p) => p.id === a.freelancer_profiles.id)) confirmed.push(a.freelancer_profiles)
        confirmedByJob.set(jobId, confirmed)
      })
    }

    setJobs(
      (jobRows || []).map((j) => ({
        ...j,
        job_divisions: j.job_divisions.map((d) => ({ ...d, names: namesByDivision.get(d.id) || [] })),
        confirmedTeam: confirmedByJob.get(j.id) || [],
      }))
    )
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  async function openEventChat(jobId) {
    const { error } = await supabase.from('job_postings').update({ chat_opened_at: new Date().toISOString() }).eq('id', jobId)
    if (error) {
      console.error(error)
      return
    }
    setJobs((js) => js.map((j) => (j.id === jobId ? { ...j, chat_opened_at: new Date().toISOString() } : j)))
  }

  async function submitRating(jobId, freelancerId, rating, recommendation) {
    const { error } = await supabase.from('ratings').insert({
      job_id: jobId,
      organizer_id: user.id,
      freelancer_id: freelancerId,
      rating,
      recommendation: recommendation.trim() || null,
    })
    if (error) {
      console.error(error)
      return false
    }
    setRatedKeys((s) => new Set(s).add(`${jobId}:${freelancerId}`))
    return true
  }

  return (
    <div className="app-shell">
      <Topbar title="My Event" />
      <div className="page">
        <div className="segmented">
          <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
            List
          </button>
          <button type="button" className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}>
            Calendar
          </button>
        </div>

        {view === 'calendar' && <EventCalendar events={jobs} />}

        {loading && <p className="subtitle">Loading…</p>}
        {view === 'list' && !loading && jobs.length === 0 && (
          <div className="empty-state">No events yet — post a job from the Post tab to get started.</div>
        )}
        {view === 'list' && (
        <div className="stack">
          {jobs.map((job) => {
            const isPast = job.event_end_date < todayISO()
            const toRate = isPast ? job.confirmedTeam.filter((f) => !ratedKeys.has(`${job.id}:${f.id}`)) : []
            return (
              <div key={job.id} className="card stack">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h2 style={{ margin: 0 }}>{job.title}</h2>
                    <p className="subtitle" style={{ margin: '4px 0 0' }}>
                      📍 {job.location} · {formatEventDates(job.event_start_date, job.event_end_date)}
                    </p>
                  </div>
                  <span className="chip chip-outline">{job.status}</span>
                </div>
                <div className="stack" style={{ gap: 8 }}>
                  {job.job_divisions.map((d) => (
                    <div key={d.id} className="division-row">
                      <div>
                        <strong>{d.skill}</strong>
                        <p className="subtitle" style={{ margin: '4px 0 0' }}>
                          {d.filled_count}/{d.quantity} filled
                          {d.names.length > 0 && ` · ${d.names.join(', ')}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <Link to={`/organizer/jobs/${job.id}/applicants`} className="btn btn-outline btn-block" style={{ textDecoration: 'none' }}>
                  Manage applicants
                </Link>

                {job.confirmedTeam.length > 0 && (
                  <div className="stack" style={{ gap: 6 }}>
                    {job.chat_opened_at ? (
                      <Link to={`/event-chat/${job.id}`} className="btn btn-primary btn-block" style={{ textDecoration: 'none' }}>
                        💬 Open event chat · {job.confirmedTeam.length + 1} people
                      </Link>
                    ) : (
                      <>
                        <button type="button" className="btn btn-accent btn-block" onClick={() => openEventChat(job.id)}>
                          Start event chat for this team
                        </button>
                        <p className="helper-text" style={{ margin: 0, textAlign: 'center' }}>
                          Opens a group chat for you + {job.confirmedTeam.length} confirmed{' '}
                          {job.confirmedTeam.length === 1 ? 'person' : 'people'}. Wait until you're sure — this also
                          gives you room to swap someone out first if a cancellation comes up.
                        </p>
                      </>
                    )}
                  </div>
                )}

                {isPast && job.confirmedTeam.length > 0 && (
                  <div className="stack" style={{ borderTop: '1px solid var(--border)', paddingTop: 10, gap: 10 }}>
                    <strong style={{ fontSize: 13 }}>Rate your team — this event has wrapped up</strong>
                    {toRate.length === 0 && <p className="subtitle" style={{ margin: 0 }}>You've rated everyone on this event. 🎉</p>}
                    {toRate.map((f) => (
                      <RateForm key={f.id} freelancer={f} onSubmit={(rating, text) => submitRating(job.id, f.id, rating, text)} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        )}
      </div>
      <OrganizerTabbar />
    </div>
  )
}

function RateForm({ freelancer, onSubmit }) {
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit() {
    if (rating === 0) return
    setBusy(true)
    const ok = await onSubmit(rating, text)
    setBusy(false)
    if (ok) setDone(true)
  }

  if (done) return <p className="subtitle" style={{ margin: 0 }}>✓ Rated {freelancer.name}</p>

  return (
    <div className="card" style={{ padding: 12 }}>
      <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{freelancer.name}</p>
      <div className="row" style={{ gap: 2, marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            onClick={() => setRating(n)}
            style={{ cursor: 'pointer', fontSize: 22, color: n <= rating ? 'var(--sunset-dark)' : 'var(--border)' }}
          >
            ★
          </span>
        ))}
      </div>
      <textarea
        placeholder="Optional: a short recommendation for their profile"
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <button type="button" className="btn btn-primary" disabled={rating === 0 || busy} onClick={submit}>
        {busy ? 'Saving…' : 'Submit rating'}
      </button>
    </div>
  )
}
