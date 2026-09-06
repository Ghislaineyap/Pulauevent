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
    <div className="desktop-workspace stack" style={{ gap: 20 }}>
      <div>
        <button type="button" className="ws-back" onClick={() => navigate('/freelancer/my-events')}>
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
        </div>
      </div>

      <nav className="ws-tabs">
        <button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
          Overview
        </button>
        <button type="button" className={tab === 'rundown' ? 'active' : ''} onClick={() => setTab('rundown')}>
          Rundown
        </button>
        <button type="button" className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
          Tasks
        </button>
      </nav>

      {tab === 'overview' && (
        <div className="stack" style={{ gap: 20 }}>
          <div className="ws-stat-grid" style={{ maxWidth: 460 }}>
            <div className="stat-tile">
              <span className="subtitle">Your role</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{job.skill}</span>
            </div>
            <div className="stat-tile">
              <span className="subtitle">Teammates confirmed</span>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{teammates.length}</span>
            </div>
          </div>

          <div className="ws-panel stack" style={{ gap: 14, maxWidth: 640 }}>
            <p className="ws-section-title">Event tools</p>
            {job.jobdesk && <p className="subtitle" style={{ margin: 0 }}>{job.jobdesk}</p>}
            <div className="ws-tools-row">
              <button type="button" className="ws-icon-btn" onClick={addToCalendar}>
                <span className="ws-icon-dot" style={{ background: 'var(--sunset-dark)' }} />
                Add to calendar
              </button>
              {job.chat_opened_at && (
                <Link to={`/event-chat/${jobId}`} className="ws-icon-btn" style={{ textDecoration: 'none' }}>
                  <span className="ws-icon-dot" style={{ background: 'var(--mint)' }} />
                  Open event chat
                </Link>
              )}
            </div>
          </div>

          {teammates.length > 0 && (
            <div className="ws-panel stack" style={{ gap: 8, maxWidth: 640 }}>
              <p className="ws-section-title">Your teammates on this event</p>
              {teammates.map((t) => (
                <p key={t.id} className="subtitle" style={{ margin: 0 }}>
                  {t.name}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'rundown' && (
        <div className="ws-panel" style={{ maxWidth: 700 }}>
          <RundownView jobId={jobId} canEdit={false} />
        </div>
      )}
      {tab === 'tasks' && (
        <div className="ws-panel" style={{ maxWidth: 700 }}>
          <TasksView jobId={jobId} canManage={false} currentUserId={user.id} teamMembers={[...teammates, { id: user.id, name: 'You' }]} />
        </div>
      )}
    </div>
  )
}
