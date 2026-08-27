import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, FreelancerTabbar } from '../../components/Layout'
import { formatEventDates } from '../../lib/date'
import { applicationStatusLabel, applicationStatusChipClass } from '../../lib/applicationStatus'

// "My Event" — every job this freelancer has applied to, so they can see at a
// glance whether each one is still pending, confirmed, or didn't work out
// this time. Confirmed events also surface teammates from the same job so
// people who actually worked together can endorse each other's skills.
export default function MyEvents() {
  const { user } = useAuth()
  const [events, setEvents] = useState([])
  const [teammatesByJob, setTeammatesByJob] = useState(new Map())
  const [endorsed, setEndorsed] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: apps, error: appsError }, { data: myEndorsements }] = await Promise.all([
      supabase
        .from('applications')
        .select(
          'id, status, job_divisions(id, skill, budget_amount, budget_type, job_id, job_postings(id, title, location, event_start_date, event_end_date, organizer_profiles(org_name, hide_name)))'
        )
        .eq('freelancer_id', user.id),
      supabase.from('skill_endorsements').select('freelancer_id, skill').eq('endorser_id', user.id),
    ])
    if (appsError) console.error(appsError)
    const clean = (apps || [])
      .filter((a) => a.job_divisions?.job_postings)
      .sort((a, b) => (a.status === b.status ? 0 : a.status === 'accepted' ? -1 : b.status === 'accepted' ? 1 : 0))
    setEvents(clean)
    setEndorsed(new Set((myEndorsements || []).map((e) => `${e.freelancer_id}:${e.skill}`)))

    // For every event this freelancer is confirmed on, pull the other
    // confirmed people on that same job (any division) so they can be
    // endorsed — this is what makes an endorsement mean something: you
    // actually worked the same event together.
    const confirmedJobIds = [...new Set(clean.filter((a) => a.status === 'accepted').map((a) => a.job_divisions.job_id))]
    const map = new Map()
    if (confirmedJobIds.length > 0) {
      const { data: divisionRows } = await supabase.from('job_divisions').select('id, job_id').in('job_id', confirmedJobIds)
      const divisionIds = (divisionRows || []).map((d) => d.id)
      const jobIdByDivision = new Map((divisionRows || []).map((d) => [d.id, d.job_id]))
      if (divisionIds.length > 0) {
        const { data: teammateApps } = await supabase
          .from('applications')
          .select('division_id, freelancer_profiles(id, name, skills)')
          .in('division_id', divisionIds)
          .eq('status', 'accepted')
        ;(teammateApps || []).forEach((t) => {
          if (t.freelancer_profiles.id === user.id) return
          const jobId = jobIdByDivision.get(t.division_id)
          const list = map.get(jobId) || []
          if (!list.some((p) => p.id === t.freelancer_profiles.id)) list.push(t.freelancer_profiles)
          map.set(jobId, list)
        })
      }
    }
    setTeammatesByJob(map)
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  async function endorse(freelancerId, skill) {
    const key = `${freelancerId}:${skill}`
    if (endorsed.has(key)) return
    setBusyKey(key)
    const { error } = await supabase.from('skill_endorsements').insert({
      freelancer_id: freelancerId,
      endorser_id: user.id,
      skill,
    })
    setBusyKey(null)
    if (error) {
      console.error(error)
      return
    }
    setEndorsed((s) => new Set(s).add(key))
  }

  return (
    <div className="app-shell">
      <Topbar title="My Event" />
      <div className="page">
        {loading && <p className="subtitle">Loading…</p>}
        {!loading && events.length === 0 && (
          <div className="empty-state">No applications yet — jobs you apply to will show up here.</div>
        )}
        <div className="stack">
          {events.map((a) => {
            const div = a.job_divisions
            const job = div.job_postings
            const teammates = teammatesByJob.get(div.job_id) || []
            return (
              <div key={a.id} className="card stack">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h2 style={{ margin: 0 }}>{job.title}</h2>
                    <p className="subtitle" style={{ margin: '4px 0 0' }}>
                      {job.organizer_profiles.hide_name ? 'Event Organizer' : job.organizer_profiles.org_name} · 📍{' '}
                      {job.location} · {formatEventDates(job.event_start_date, job.event_end_date)}
                    </p>
                  </div>
                  <span className={applicationStatusChipClass(a.status)}>{applicationStatusLabel(a.status)}</span>
                </div>
                <div className="chip-row">
                  <span className="chip chip-outline">Role: {div.skill}</span>
                  {div.budget_amount && (
                    <span className="chip chip-outline">
                      Rp {Number(div.budget_amount).toLocaleString('id-ID')}{' '}
                      {div.budget_type === 'flat' ? 'flat' : `/ ${div.budget_type}`}
                    </span>
                  )}
                </div>
                {a.status === 'accepted' && (
                  <Link to={`/event-chat/${div.job_id}`} className="btn btn-primary btn-block" style={{ textDecoration: 'none' }}>
                    💬 Open event chat
                  </Link>
                )}

                {a.status === 'accepted' && teammates.length > 0 && (
                  <div className="stack" style={{ borderTop: '1px solid var(--border)', paddingTop: 10, gap: 8 }}>
                    <strong style={{ fontSize: 13 }}>Your teammates on this event</strong>
                    {teammates.map((t) => (
                      <div key={t.id} className="stack" style={{ gap: 4 }}>
                        <p className="subtitle" style={{ margin: 0 }}>{t.name}</p>
                        <div className="chip-row">
                          {(t.skills || []).map((s) => {
                            const key = `${t.id}:${s}`
                            const done = endorsed.has(key)
                            return (
                              <span
                                key={s}
                                className={`chip chip-toggle ${done ? 'active' : ''}`}
                                style={{ cursor: done ? 'default' : 'pointer', opacity: busyKey === key ? 0.6 : 1 }}
                                onClick={() => endorse(t.id, s)}
                              >
                                {done ? '✓ ' : '+ '}
                                {s}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <FreelancerTabbar />
    </div>
  )
}
