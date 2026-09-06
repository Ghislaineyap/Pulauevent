import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { formatEventDates } from '../../lib/date'
import { downloadICS, eventsFromJobSchedule } from '../../lib/ics'
import { RundownView } from '../../components/RundownView'
import { TasksView } from '../../components/TasksView'

// Desktop-only, read-scoped counterpart to organizer/EventWorkspace — a
// freelancer confirmed on this job gets the same Rundown/Tasks views, just
// without the edit/manage affordances (RundownView/TasksView already know
// how to render themselves read-only via canEdit/canManage=false).
export default function EventWorkspace() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [job, setJob] = useState(null)
  const [teammates, setTeammates] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview') // 'overview' | 'rundown' | 'tasks'

  const load = useCallback(async () => {
    setLoading(true)
    const { data: apps, error } = await supabase
      .from('applications')
      .select(
        'id, status, division_id, job_divisions(id, job_id, skill, jobdesk, job_postings(id, title, location, location_detail, event_start_date, event_end_date, chat_opened_at))'
      )
      .eq('freelancer_id', user.id)
      .eq('status', 'accepted')
    if (error) console.error(error)
    const match = (apps || []).find((a) => a.job_divisions?.job_id === jobId)
    if (!match) {
      setJob(null)
      setLoading(false)
      return
    }
    setJob({ ...match.job_divisions.job_postings, jobdesk: match.job_divisions.jobdesk, skill: match.job_divisions.skill })

    const { data: divisionRows } = await supabase.from('job_divisions').select('id').eq('job_id', jobId)
    const divisionIds = (divisionRows || []).map((d) => d.id)
    if (divisionIds.length > 0) {
      const { data: teammateApps } = await supabase
        .from('applications')
        .select('freelancer_profiles(id, name)')
        .in('division_id', divisionIds)
        .eq('status', 'accepted')
      setTeammates(
        (teammateApps || [])
          .map((t) => t.freelancer_profiles)
          .filter((p) => p && p.id !== user.id)
      )
    }
    setLoading(false)
  }, [jobId, user.id])

  useEffect(() => {
    load()
  }, [load])

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
        <p className="subtitle">You're not confirmed on this event (or it doesn't exist).</p>
        <Link to="/freelancer/my-events" className="btn btn-outline" style={{ textDecoration: 'none', display: 'inline-flex', marginTop: 10 }}>
          ← Back to My Event
        </Link>
      </div>
    )
  }

  return (
    <div className="desktop-workspace stack" style={{ gap: 18 }}>
      <div>
        <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 12, marginBottom: 10 }} onClick={() => navigate('/freelancer/my-events')}>
          ← My Event
        </button>
        <h1 style={{ margin: 0 }}>{job.title}</h1>
        <p className="subtitle" style={{ margin: '4px 0 0' }}>
          📍 {job.location}
          {job.location_detail && ` — ${job.location_detail}`} · {formatEventDates(job.event_start_date, job.event_end_date)}
        </p>
      </div>

      <div className="segmented" style={{ maxWidth: 420 }}>
        <button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
          Overview
        </button>
        <button type="button" className={tab === 'rundown' ? 'active' : ''} onClick={() => setTab('rundown')}>
          Rundown
        </button>
        <button type="button" className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
          Tasks
        </button>
      </div>

      <div className="card" style={{ maxWidth: 680 }}>
        {tab === 'overview' && (
          <div className="stack">
            <div>
              <strong>Your role: {job.skill}</strong>
              {job.jobdesk && <p className="subtitle" style={{ margin: '4px 0 0' }}>{job.jobdesk}</p>}
            </div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {job.chat_opened_at && (
                <Link to={`/event-chat/${jobId}`} className="btn btn-primary" style={{ flex: '1 1 45%', textDecoration: 'none' }}>
                  💬 Open event chat
                </Link>
              )}
              <button type="button" className="btn btn-outline" style={{ flex: '1 1 45%' }} onClick={addToCalendar}>
                Add to calendar
              </button>
            </div>
            {teammates.length > 0 && (
              <div className="stack" style={{ borderTop: '1px solid var(--border)', paddingTop: 10, gap: 6 }}>
                <strong style={{ fontSize: 13 }}>Your teammates on this event</strong>
                {teammates.map((t) => (
                  <p key={t.id} className="subtitle" style={{ margin: 0 }}>
                    {t.name}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
        {tab === 'rundown' && <RundownView jobId={jobId} canEdit={false} />}
        {tab === 'tasks' && <TasksView jobId={jobId} canManage={false} currentUserId={user.id} teamMembers={[...teammates, { id: user.id, name: 'You' }]} />}
      </div>
    </div>
  )
}
