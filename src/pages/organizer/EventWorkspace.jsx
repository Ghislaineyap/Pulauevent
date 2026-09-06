import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { formatEventDates } from '../../lib/date'
import { downloadICS, eventsFromJobSchedule } from '../../lib/ics'
import { RundownView } from '../../components/RundownView'
import { TasksView } from '../../components/TasksView'
import { ShareView } from '../../components/ShareView'
import { InfoButton } from '../../components/InfoButton'
import { Switch } from '../../components/Switch'
import { SkillIcon } from '../../components/SkillIcon'
import { TeamSelectView, RecruitForm, EventForm, RateForm } from './MyEvents'

const ROLE_COLORS = ['var(--primary)', 'var(--sunset-dark)', 'var(--mint)', 'var(--primary-dark)', 'var(--sunset)']
const todayISO = () => new Date().toISOString().slice(0, 10)

function daysLabel(startDate, endDate) {
  const today = todayISO()
  if (endDate < today) return 'Completed'
  if (startDate <= today && endDate >= today) return 'Happening now'
  const days = Math.round((new Date(`${startDate}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000)
  return `In ${days} day${days === 1 ? '' : 's'}`
}

// The desktop-only event workspace — a wider, tabbed alternative to the
// mobile "Manage event" bottom sheet, reached from the sidebar rather than
// the My Event list. Team/Recruiting reuse the exact same components the
// mobile modal uses (ManageEventView, TeamSelectView, RecruitForm,
// EventForm — exported from organizer/MyEvents.jsx) so there's exactly one
// implementation of that logic, just mounted in a different shell.
export default function EventWorkspace() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [job, setJob] = useState(null)
  const [ratedKeys, setRatedKeys] = useState(new Set())
  const [teamMembers, setTeamMembers] = useState([])
  const [skillOptions, setSkillOptions] = useState([])
  const [locationOptions, setLocationOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview') // 'overview' | 'team' | 'rundown' | 'tasks' | 'share'
  const [editing, setEditing] = useState(false)
  const [divSub, setDivSub] = useState(null) // { type: 'team' | 'recruit', divisionId } | null

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: jobRow, error: jobError }, { data: myRatings }] = await Promise.all([
      supabase
        .from('job_postings')
        .select(
          'id, title, description, location, location_detail, event_start_date, event_end_date, status, chat_opened_at, organizer_id, job_divisions(id, skill, quantity, filled_count, budget_amount, budget_type, fee_type, transport_max_amount, open_recruit, jobdesk)'
        )
        .eq('id', jobId)
        .maybeSingle(),
      supabase.from('ratings').select('job_id, freelancer_id').eq('organizer_id', user.id).eq('job_id', jobId),
    ])
    if (jobError) console.error(jobError)
    setRatedKeys(new Set((myRatings || []).map((r) => `${r.job_id}:${r.freelancer_id}`)))

    if (!jobRow) {
      setJob(null)
      setLoading(false)
      return
    }

    const divisionIds = jobRow.job_divisions.map((d) => d.id)
    const teamByDivision = new Map()
    const confirmedTeam = []
    if (divisionIds.length > 0) {
      const { data: apps, error: appsError } = await supabase
        .from('applications')
        .select('id, status, division_id, freelancer_profiles(id, name)')
        .in('division_id', divisionIds)
        .in('status', ['accepted', 'invited'])
      if (appsError) console.error(appsError)
      ;(apps || []).forEach((a) => {
        const entry = teamByDivision.get(a.division_id) || { accepted: [], invited: [] }
        const person = { appId: a.id, freelancerId: a.freelancer_profiles.id, name: a.freelancer_profiles.name }
        if (a.status === 'accepted') {
          entry.accepted.push(person)
          if (!confirmedTeam.some((p) => p.id === person.freelancerId)) confirmedTeam.push({ id: person.freelancerId, name: person.name })
        } else {
          entry.invited.push(person)
        }
        teamByDivision.set(a.division_id, entry)
      })
    }

    setJob({
      ...jobRow,
      job_divisions: jobRow.job_divisions.map((d) => ({ ...d, team: teamByDivision.get(d.id) || { accepted: [], invited: [] } })),
      confirmedTeam,
    })
    setLoading(false)
  }, [jobId, user.id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    supabase.from('skills').select('label').order('sort_order').then(({ data }) => setSkillOptions((data || []).map((s) => s.label)))
    supabase.from('locations').select('label').order('sort_order').then(({ data }) => setLocationOptions((data || []).map((l) => l.label)))
    supabase
      .from('team_members')
      .select('freelancer_id, freelancer_profiles(id, name, skills)')
      .eq('organizer_id', user.id)
      .then(({ data, error }) => {
        if (error) console.error(error)
        setTeamMembers((data || []).map((t) => t.freelancer_profiles).filter(Boolean))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function toggleEventChat(nextOpen) {
    const { error } = await supabase
      .from('job_postings')
      .update({ chat_opened_at: nextOpen ? new Date().toISOString() : null })
      .eq('id', jobId)
    if (error) {
      console.error(error)
      return
    }
    setJob((j) => ({ ...j, chat_opened_at: nextOpen ? new Date().toISOString() : null }))
  }

  async function addToTeam(freelancerId, divisionId) {
    const { error } = await supabase
      .from('applications')
      .upsert({ division_id: divisionId, freelancer_id: freelancerId, status: 'invited', source: 'invited' }, { onConflict: 'division_id,freelancer_id' })
    if (error) {
      console.error(error)
      return
    }
    load()
  }

  async function removeFromTeam(applicationId) {
    const { error } = await supabase.from('applications').update({ status: 'cancelled' }).eq('id', applicationId)
    if (error) {
      console.error(error)
      return
    }
    load()
  }

  async function withdrawInvite(applicationId) {
    const { error } = await supabase.from('applications').update({ status: 'declined' }).eq('id', applicationId)
    if (error) {
      console.error(error)
      return
    }
    load()
  }

  async function saveRecruit(divisionId, payload) {
    const { error } = await supabase.from('job_divisions').update(payload).eq('id', divisionId)
    if (error) {
      console.error(error)
      return
    }
    setDivSub(null)
    load()
  }

  async function submitRating(jobIdArg, freelancerId, rating, recommendation) {
    const { error } = await supabase
      .from('ratings')
      .insert({ job_id: jobIdArg, organizer_id: user.id, freelancer_id: freelancerId, rating, recommendation: recommendation.trim() || null })
    if (error) {
      console.error(error)
      return false
    }
    setRatedKeys((s) => new Set(s).add(`${jobIdArg}:${freelancerId}`))
    return true
  }

  async function addToCalendar() {
    const { data: rundowns } = await supabase.from('event_rundowns').select('id, title, event_date').eq('job_id', jobId)
    let items = []
    const rundownIds = (rundowns || []).map((r) => r.id)
    if (rundownIds.length > 0) {
      const { data: itemRows } = await supabase
        .from('event_rundown_items')
        .select('rundown_id, sort_order, start_time, duration_minutes')
        .in('rundown_id', rundownIds)
      items = itemRows || []
    }
    downloadICS(job.title, eventsFromJobSchedule(job, rundowns || [], items))
  }

  if (loading) {
    return (
      <div className="desktop-workspace">
        <p className="subtitle">Loading…</p>
      </div>
    )
  }

  if (!job) {
    return (
      <div className="desktop-workspace">
        <p className="subtitle">Event not found, or it's not one of yours.</p>
        <Link to="/organizer/my-events" className="btn btn-outline" style={{ textDecoration: 'none', display: 'inline-flex', marginTop: 10 }}>
          ← Back to My Event
        </Link>
      </div>
    )
  }

  const divisionForSub = divSub ? job.job_divisions.find((d) => d.id === divSub.divisionId) : null
  const isPast = job.event_end_date < todayISO()
  const toRate = isPast ? job.confirmedTeam.filter((f) => !ratedKeys.has(`${job.id}:${f.id}`)) : []
  const openRecruitSlots = job.job_divisions.reduce((n, d) => n + (d.open_recruit ? Math.max(d.quantity - d.filled_count, 0) : 0), 0)

  return (
    <div className="desktop-workspace stack" style={{ gap: 20 }}>
      <div>
        <button type="button" className="ws-back" onClick={() => navigate('/organizer/my-events')}>
          ← My Event
        </button>
        <div className="ws-header">
          <div>
            <h1>{job.title}</h1>
            <p className="ws-meta">
              📍 {job.location}
              {job.location_detail && ` — ${job.location_detail}`} · {formatEventDates(job.event_start_date, job.event_end_date)}
            </p>
          </div>
          <button type="button" className="btn btn-outline" style={{ padding: '7px 14px', fontSize: 12.5 }} onClick={() => setEditing(true)}>
            Edit event
          </button>
        </div>
      </div>

      <nav className="ws-tabs">
        <button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
          Overview
        </button>
        <button type="button" className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>
          Team
        </button>
        <button type="button" className={tab === 'rundown' ? 'active' : ''} onClick={() => setTab('rundown')}>
          Rundown
        </button>
        <button type="button" className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
          Tasks
        </button>
        <button type="button" className={tab === 'share' ? 'active' : ''} onClick={() => setTab('share')}>
          Share
        </button>
      </nav>

      {tab === 'overview' &&
        (editing ? (
          <div className="ws-panel" style={{ maxWidth: 640 }}>
            <EventForm
              bare
              job={job}
              organizerId={user.id}
              skillOptions={skillOptions}
              locationOptions={locationOptions}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false)
                load()
              }}
            />
          </div>
        ) : (
          <div className="stack" style={{ gap: 20 }}>
            <div className="ws-stat-grid">
              <div className="stat-tile">
                <span className="subtitle">Status</span>
                <span style={{ fontSize: 18, fontWeight: 700 }}>{daysLabel(job.event_start_date, job.event_end_date)}</span>
              </div>
              <div className="stat-tile">
                <span className="subtitle">Confirmed team</span>
                <span style={{ fontSize: 22, fontWeight: 700 }}>{job.confirmedTeam.length}</span>
              </div>
              <div className="stat-tile">
                <span className="subtitle">Open recruit spots</span>
                <span style={{ fontSize: 22, fontWeight: 700 }}>{openRecruitSlots}</span>
              </div>
              <div className="stat-tile">
                <span className="subtitle">Divisions</span>
                <span style={{ fontSize: 22, fontWeight: 700 }}>{job.job_divisions.length}</span>
              </div>
            </div>

            <div className="ws-panel stack" style={{ gap: 14 }}>
              <p className="ws-section-title">Event tools</p>
              <div className="ws-tools-row">
                <button type="button" className="ws-icon-btn" onClick={addToCalendar}>
                  <span className="ws-icon-dot" style={{ background: 'var(--sunset-dark)' }} />
                  Add to calendar
                </button>
                <span className="ws-icon-btn" style={{ cursor: 'default' }}>
                  <Switch checked={Boolean(job.chat_opened_at)} onChange={(v) => toggleEventChat(v)} label="Event chat" />
                  <InfoButton title="Event chat">
                    Turning this on opens a group chat for you + everyone confirmed on this event.
                  </InfoButton>
                </span>
                {job.chat_opened_at && (
                  <Link to={`/event-chat/${job.id}`} className="ws-icon-btn" style={{ textDecoration: 'none' }}>
                    <span className="ws-icon-dot" style={{ background: 'var(--mint)' }} />
                    Open event chat · {job.confirmedTeam.length + 1}
                  </Link>
                )}
              </div>
            </div>

            <div className="stack" style={{ gap: 10 }}>
              <p className="ws-section-title">Roles</p>
              <div className="ws-role-grid">
                {job.job_divisions.map((d, i) => (
                  <div key={d.id} className="ws-role-card" style={{ '--role-color': ROLE_COLORS[i % ROLE_COLORS.length] }}>
                    <div className="ws-role-head">
                      <span className="ws-role-icon">
                        <SkillIcon skill={d.skill} color={ROLE_COLORS[i % ROLE_COLORS.length]} />
                      </span>
                      <div>
                        <strong style={{ fontSize: 13.5 }}>{d.skill}</strong>
                        <p className="subtitle" style={{ margin: '2px 0 0' }}>
                          {d.filled_count}/{d.quantity} filled{d.open_recruit && ' · Open recruit'}
                        </p>
                      </div>
                    </div>
                    {d.jobdesk && (
                      <p className="subtitle" style={{ margin: 0 }}>
                        {d.jobdesk}
                      </p>
                    )}
                    {d.team.accepted.length > 0 && (
                      <p className="subtitle" style={{ margin: 0 }}>
                        {d.team.accepted.map((p) => p.name).join(', ')}
                      </p>
                    )}
                    <div className="row">
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ flex: 1, padding: '6px 10px', fontSize: 12 }}
                        onClick={() => {
                          setTab('team')
                          setDivSub({ type: 'team', divisionId: d.id })
                        }}
                      >
                        Select team
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ flex: 1, padding: '6px 10px', fontSize: 12 }}
                        onClick={() => {
                          setTab('team')
                          setDivSub({ type: 'recruit', divisionId: d.id })
                        }}
                      >
                        Recruiting
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {isPast && job.confirmedTeam.length > 0 && (
              <div className="ws-panel stack" style={{ gap: 12, maxWidth: 640 }}>
                <p className="ws-section-title">Rate your team — this event has wrapped up</p>
                {toRate.length === 0 && (
                  <p className="subtitle" style={{ margin: 0 }}>
                    You've rated everyone on this event.
                  </p>
                )}
                {toRate.map((f) => (
                  <RateForm key={f.id} freelancer={f} onSubmit={(rating, text) => submitRating(job.id, f.id, rating, text)} />
                ))}
              </div>
            )}
          </div>
        ))}

      {tab === 'team' && (
        <div className="ws-panel" style={{ maxWidth: 980 }}>
          {!divSub && (
            <div className="stack" style={{ gap: 14 }}>
              <p className="subtitle" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                Confirmed: {job.confirmedTeam.length}
                <InfoButton title="Team">"Select team" adds your own roster to a role. "Recruiting" sets budget/fee and whether the remaining spots show up publicly on Post.</InfoButton>
              </p>
              <div className="ws-role-grid">
                {job.job_divisions.map((d, i) => (
                  <div key={d.id} className="ws-role-card" style={{ '--role-color': ROLE_COLORS[i % ROLE_COLORS.length] }}>
                    <div className="ws-role-head">
                      <span className="ws-role-icon">
                        <SkillIcon skill={d.skill} color={ROLE_COLORS[i % ROLE_COLORS.length]} />
                      </span>
                      <strong style={{ fontSize: 13.5 }}>{d.skill}</strong>
                    </div>
                    <p className="subtitle" style={{ margin: 0 }}>
                      {d.filled_count}/{d.quantity} filled
                      {d.team.accepted.length > 0 && ` · ${d.team.accepted.map((p) => p.name).join(', ')}`}
                      {d.open_recruit && ' · Open recruit'}
                    </p>
                    <div className="row">
                      <button type="button" className="btn btn-outline" style={{ flex: 1, padding: '6px 10px', fontSize: 12 }} onClick={() => setDivSub({ type: 'team', divisionId: d.id })}>
                        Select team
                      </button>
                      <button type="button" className="btn btn-outline" style={{ flex: 1, padding: '6px 10px', fontSize: 12 }} onClick={() => setDivSub({ type: 'recruit', divisionId: d.id })}>
                        Recruiting
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {divSub?.type === 'team' && divisionForSub && (
            <div className="stack" style={{ maxWidth: 480 }}>
              <button type="button" className="btn btn-outline" style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12 }} onClick={() => setDivSub(null)}>
                ← Back
              </button>
              <TeamSelectView job={job} division={divisionForSub} teamMembers={teamMembers} onAdd={addToTeam} onRemove={removeFromTeam} onWithdraw={withdrawInvite} />
            </div>
          )}
          {divSub?.type === 'recruit' && divisionForSub && (
            <div className="stack" style={{ maxWidth: 480 }}>
              <button type="button" className="btn btn-outline" style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12 }} onClick={() => setDivSub(null)}>
                ← Back
              </button>
              <RecruitForm key={divisionForSub.id} division={divisionForSub} onSave={(payload) => saveRecruit(divisionForSub.id, payload)} />
            </div>
          )}
        </div>
      )}

      {tab === 'rundown' && (
        <div className="ws-panel" style={{ maxWidth: 700 }}>
          <RundownView jobId={job.id} canEdit />
        </div>
      )}
      {tab === 'tasks' && (
        <div className="ws-panel" style={{ maxWidth: 700 }}>
          <TasksView jobId={job.id} canManage currentUserId={user.id} teamMembers={job.confirmedTeam} />
        </div>
      )}
      {tab === 'share' && (
        <div className="ws-panel" style={{ maxWidth: 700 }}>
          <ShareView jobId={job.id} eventTitle={job.title} />
        </div>
      )}
    </div>
  )
}
