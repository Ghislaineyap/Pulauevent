import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, FreelancerTabbar } from '../../components/Layout'
import { formatEventDates } from '../../lib/date'
import { applicationStatusLabel, applicationStatusChipClass } from '../../lib/applicationStatus'
import { EventCalendar } from '../../components/EventCalendar'
import { OrganizerAboutModal } from '../../components/OrganizerAboutModal'

// "My Event" — every job this freelancer has applied to or been invited to,
// so they can see at a glance whether each one needs a response, is still
// pending, confirmed, or didn't work out this time. A direct invite from an
// organizer shows the jobdesk and fee right here so they can decide and
// respond without hunting elsewhere. Confirmed events also surface
// teammates from the same job so people who actually worked together can
// endorse each other's skills.
export default function MyEvents() {
  const { user } = useAuth()
  const [events, setEvents] = useState([])
  const [teammatesByJob, setTeammatesByJob] = useState(new Map())
  const [endorsed, setEndorsed] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [busyKey, setBusyKey] = useState(null)
  const [respondingId, setRespondingId] = useState(null)
  const [view, setView] = useState('list') // 'list' | 'calendar'
  const [aboutOrganizer, setAboutOrganizer] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: apps, error: appsError }, { data: myEndorsements }] = await Promise.all([
      supabase
        .from('applications')
        .select(
          'id, status, job_divisions(id, skill, jobdesk, budget_amount, budget_type, fee_type, transport_max_amount, job_id, job_postings(id, title, location, location_detail, event_start_date, event_end_date, chat_opened_at, organizer_profiles(org_name, location, about, instagram_handle, logo_url)))'
        )
        .eq('freelancer_id', user.id),
      supabase.from('skill_endorsements').select('freelancer_id, skill').eq('endorser_id', user.id),
    ])
    if (appsError) console.error(appsError)
    // Invited (needs a response) first, then confirmed, then the rest.
    const rank = { invited: 0, accepted: 1 }
    const clean = (apps || [])
      .filter((a) => a.job_divisions?.job_postings)
      .sort((a, b) => (rank[a.status] ?? 2) - (rank[b.status] ?? 2))
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

  const confirmedEvents = useMemo(
    () =>
      events
        .filter((a) => a.status === 'accepted')
        .map((a) => ({ id: a.job_divisions.job_postings.id, title: a.job_divisions.job_postings.title, ...a.job_divisions.job_postings })),
    [events]
  )

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

  async function respondInvite(applicationId, status) {
    setRespondingId(applicationId)
    const { error } = await supabase.from('applications').update({ status }).eq('id', applicationId)
    setRespondingId(null)
    if (error) {
      console.error(error)
      return
    }
    load()
  }

  const invitedCount = events.filter((a) => a.status === 'invited').length

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

        {view === 'calendar' && <EventCalendar events={confirmedEvents} />}

        {loading && <p className="subtitle">Loading…</p>}
        {view === 'list' && !loading && events.length === 0 && (
          <div className="empty-state">Nothing here yet — jobs you apply to, or get invited to, will show up here.</div>
        )}
        {view === 'list' && (
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
                    <button
                      type="button"
                      className="subtitle"
                      style={{ background: 'none', border: 'none', padding: 0, margin: '4px 0 0', cursor: 'pointer', color: 'var(--primary-dark)', fontWeight: 600, textAlign: 'left' }}
                      onClick={() => setAboutOrganizer(job.organizer_profiles)}
                    >
                      {job.organizer_profiles.org_name}
                    </button>
                    <p className="subtitle" style={{ margin: '2px 0 0' }}>
                      📍 {job.location}
                      {a.status === 'accepted' && job.location_detail && ` — ${job.location_detail}`} ·{' '}
                      {formatEventDates(job.event_start_date, job.event_end_date)}
                    </p>
                  </div>
                  <span className={applicationStatusChipClass(a.status)}>{applicationStatusLabel(a.status)}</span>
                </div>
                {div.jobdesk && (
                  <p className="subtitle" style={{ margin: 0 }}>
                    {div.jobdesk}
                  </p>
                )}
                <div className="chip-row">
                  <span className="chip chip-outline">Role: {div.skill}</span>
                  {div.budget_amount && (
                    <span className="chip chip-outline">
                      Rp {Number(div.budget_amount).toLocaleString('id-ID')}{' '}
                      {div.budget_type === 'flat' ? 'flat' : `/ ${div.budget_type}`}
                    </span>
                  )}
                  {div.fee_type === 'plus_transport' && (
                    <span className="chip chip-outline">
                      + Transport{div.transport_max_amount ? `, up to Rp ${Number(div.transport_max_amount).toLocaleString('id-ID')}` : ' reimbursed'}
                    </span>
                  )}
                </div>
                {a.status === 'invited' && (
                  <div className="row">
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ flex: 1 }}
                      disabled={respondingId === a.id}
                      onClick={() => respondInvite(a.id, 'declined')}
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      disabled={respondingId === a.id}
                      onClick={() => respondInvite(a.id, 'accepted')}
                    >
                      {respondingId === a.id ? 'Saving…' : 'Accept'}
                    </button>
                  </div>
                )}
                {a.status === 'accepted' && job.chat_opened_at && (
                  <Link to={`/event-chat/${div.job_id}`} className="btn btn-primary btn-block" style={{ textDecoration: 'none' }}>
                    💬 Open event chat
                  </Link>
                )}
                {a.status === 'accepted' && !job.chat_opened_at && (
                  <p className="helper-text" style={{ margin: 0 }}>The organizer hasn't started this event's group chat yet.</p>
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
        )}
      </div>

      {aboutOrganizer && <OrganizerAboutModal organizer={aboutOrganizer} onClose={() => setAboutOrganizer(null)} />}

      <FreelancerTabbar myEventCount={invitedCount} />
    </div>
  )
}
