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
import { ManageEventView, TeamSelectView, RecruitForm, EventForm } from './MyEvents'

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

  return (
    <div className="desktop-workspace stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 12, marginBottom: 10 }} onClick={() => navigate('/organizer/my-events')}>
            ← My Event
          </button>
          <h1 style={{ margin: 0 }}>{job.title}</h1>
          <p className="subtitle" style={{ margin: '4px 0 0' }}>
            📍 {job.location}
            {job.location_detail && ` — ${job.location_detail}`} · {formatEventDates(job.event_start_date, job.event_end_date)}
          </p>
        </div>
      </div>

      <div className="segmented" style={{ maxWidth: 520 }}>
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
      </div>

      <div className="card" style={{ maxWidth: 720 }}>
        {tab === 'overview' &&
          (editing ? (
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
          ) : (
            <ManageEventView
              job={job}
              ratedKeys={ratedKeys}
              onEdit={() => setEditing(true)}
              onOpenTeam={(divisionId) => {
                setTab('team')
                setDivSub({ type: 'team', divisionId })
              }}
              onOpenRecruit={(divisionId) => {
                setTab('team')
                setDivSub({ type: 'recruit', divisionId })
              }}
              onAddToCalendar={addToCalendar}
              onToggleChat={(_jobId, nextOpen) => toggleEventChat(nextOpen)}
              onSubmitRating={submitRating}
            />
          ))}

        {tab === 'team' && (
          <div className="stack">
            {!divSub && (
              <div className="stack" style={{ gap: 10 }}>
                <p className="subtitle" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                  Confirmed: {job.confirmedTeam.length}
                  <InfoButton title="Team">"Select team" adds your own roster to a role. "Recruiting" sets budget/fee and whether the remaining spots show up publicly on Post.</InfoButton>
                </p>
                {job.job_divisions.map((d) => (
                  <div key={d.id} className="card" style={{ padding: 12 }}>
                    <strong>{d.skill}</strong>
                    <p className="subtitle" style={{ margin: '4px 0 8px' }}>
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
            )}
            {divSub?.type === 'team' && divisionForSub && (
              <div className="stack">
                <button type="button" className="btn btn-outline" style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12 }} onClick={() => setDivSub(null)}>
                  ← Back
                </button>
                <TeamSelectView job={job} division={divisionForSub} teamMembers={teamMembers} onAdd={addToTeam} onRemove={removeFromTeam} onWithdraw={withdrawInvite} />
              </div>
            )}
            {divSub?.type === 'recruit' && divisionForSub && (
              <div className="stack">
                <button type="button" className="btn btn-outline" style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12 }} onClick={() => setDivSub(null)}>
                  ← Back
                </button>
                <RecruitForm key={divisionForSub.id} division={divisionForSub} onSave={(payload) => saveRecruit(divisionForSub.id, payload)} />
              </div>
            )}
          </div>
        )}

        {tab === 'rundown' && <RundownView jobId={job.id} canEdit />}
        {tab === 'tasks' && <TasksView jobId={job.id} canManage currentUserId={user.id} teamMembers={job.confirmedTeam} />}
        {tab === 'share' && <ShareView jobId={job.id} eventTitle={job.title} />}
      </div>
    </div>
  )
}
