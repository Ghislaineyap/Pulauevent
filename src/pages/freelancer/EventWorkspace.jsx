import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { formatEventDates } from '../../lib/date'
import { downloadICS, eventsFromJobSchedule } from '../../lib/ics'
import { DocumentsView } from '../../components/DocumentsView'
import { listEventDocuments } from '../../lib/eventDocs'
import { TasksView } from '../../components/TasksView'
import { ChatRail } from '../../components/ChatRail'

const todayISO = () => new Date().toISOString().slice(0, 10)

// Same idea as the organizer workspace: Tasks/Documents are the data-dense/
// scoped tabs, so their chat rail defaults collapsed; Overview keeps it open.
const CHAT_COLLAPSED_BY_DEFAULT = { overview: false, documents: true, tasks: true }

function daysLabel(startDate, endDate) {
  const today = todayISO()
  if (endDate < today) return 'Completed'
  if (startDate <= today && endDate >= today) return 'Happening now'
  const days = Math.round((new Date(`${startDate}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000)
  return `In ${days} day${days === 1 ? '' : 's'}`
}

function formatFee(d) {
  if (!d.budget_amount) return null
  return `Rp ${Number(d.budget_amount).toLocaleString('id-ID')} ${d.budget_type === 'flat' ? 'flat' : `/ ${d.budget_type}`}`
}

// Desktop-only, read-scoped counterpart to organizer/EventWorkspace — a
// freelancer confirmed on this job gets the same Documents/Tasks views,
// just without the edit/manage affordances (DocumentsView/TasksView already
// know how to render themselves read-only via canEdit/canManage=false).
export default function EventWorkspace() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [job, setJob] = useState(null)
  const [teammates, setTeammates] = useState([])
  const [docCount, setDocCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview') // 'overview' | 'documents' | 'tasks'
  const [chatCollapsed, setChatCollapsed] = useState(CHAT_COLLAPSED_BY_DEFAULT.overview)
  const [chatTabSeen, setChatTabSeen] = useState('overview')
  // See organizer/EventWorkspace.jsx: reset to the new tab's default only
  // when the tab actually changes, adjusted during render rather than in
  // an effect.
  if (tab !== chatTabSeen) {
    setChatTabSeen(tab)
    setChatCollapsed(CHAT_COLLAPSED_BY_DEFAULT[tab] ?? false)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const { data: apps, error } = await supabase
      .from('applications')
      .select(
        'id, status, division_id, job_divisions(id, job_id, skill, jobdesk, budget_amount, budget_type, fee_type, transport_max_amount, job_postings(id, title, description, location, location_detail, event_start_date, event_end_date, chat_opened_at))'
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
    setJob({
      ...match.job_divisions.job_postings,
      jobdesk: match.job_divisions.jobdesk,
      skill: match.job_divisions.skill,
      budget_amount: match.job_divisions.budget_amount,
      budget_type: match.job_divisions.budget_type,
      fee_type: match.job_divisions.fee_type,
      transport_max_amount: match.job_divisions.transport_max_amount,
    })

    const { data: divisionRows } = await supabase.from('job_divisions').select('id, skill').eq('job_id', jobId)
    const divisionIds = (divisionRows || []).map((d) => d.id)
    const skillByDivision = new Map((divisionRows || []).map((d) => [d.id, d.skill]))
    if (divisionIds.length > 0) {
      const { data: teammateApps } = await supabase
        .from('applications')
        .select('division_id, freelancer_profiles(id, name)')
        .in('division_id', divisionIds)
        .eq('status', 'accepted')
      setTeammates(
        (teammateApps || [])
          .filter((t) => t.freelancer_profiles && t.freelancer_profiles.id !== user.id)
          .map((t) => ({ ...t.freelancer_profiles, skill: skillByDivision.get(t.division_id) }))
      )
    }
    setLoading(false)
  }, [jobId, user.id])

  useEffect(() => {
    load()
  }, [load])

  // Refetched whenever Overview is the active tab, so a doc the organizer
  // just uploaded shows up here without needing a full page reload.
  useEffect(() => {
    if (tab !== 'overview') return
    listEventDocuments(jobId)
      .then((docs) => setDocCount(docs.length))
      .catch((err) => console.error(err))
  }, [jobId, tab])

  function addToCalendar() {
    downloadICS(job.title, eventsFromJobSchedule(job, [], []))
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

  const fee = formatFee(job)

  return (
    <div className="desktop-workspace">
      <p className="ws-crumb">Your events / {job.title}</p>
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
        <span className="chip chip-outline">You're booked as {job.skill}</span>
      </div>

      <div className="ws-tabs-row" style={{ marginTop: 18 }}>
        <nav className="ws-tabs">
          <button type="button" className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
            Overview
          </button>
          <button type="button" className={tab === 'documents' ? 'active' : ''} onClick={() => setTab('documents')}>
            Documents
          </button>
          <button type="button" className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
            Tasks
          </button>
        </nav>
        <button type="button" className="chat-toggle-btn" onClick={() => setChatCollapsed((c) => !c)}>
          💬 {chatCollapsed ? 'Open chat' : 'Hide chat'}
        </button>
      </div>

      <div className="ws-body-row" style={{ marginTop: 20 }}>
        <div className="ws-main-col">
          {tab === 'overview' && (
            <div className="stack" style={{ gap: 20 }}>
              <div className="ws-stat-row">
                <div className="ws-stat-tile">
                  <span className="ws-stat-label">Status</span>
                  <span className="ws-stat-value" style={{ fontSize: 16 }}>
                    {daysLabel(job.event_start_date, job.event_end_date)}
                  </span>
                </div>
                <div className="ws-stat-tile">
                  <span className="ws-stat-label">Your role</span>
                  <span className="ws-stat-value" style={{ fontSize: 16 }}>
                    {job.skill}
                  </span>
                </div>
                <div className="ws-stat-tile">
                  <span className="ws-stat-label">Your fee</span>
                  <span className="ws-stat-value good" style={{ fontSize: fee ? 15 : 21 }}>
                    {fee || '—'}
                  </span>
                </div>
                <div className="ws-stat-tile">
                  <span className="ws-stat-label">Teammates confirmed</span>
                  <span className="ws-stat-value">{teammates.length}</span>
                </div>
              </div>

              <div className="ws-two-col">
                <div className="ws-col-main">
                  <div className="ws-panel">
                    <p className="ws-section-title" style={{ marginBottom: 10 }}>
                      About this event
                    </p>
                    <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink)', margin: 0 }}>
                      {job.description || 'No description added yet.'}
                    </p>
                  </div>

                  <div className="ws-panel">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p className="ws-section-title" style={{ margin: 0 }}>
                        Documents
                      </p>
                      <button type="button" className="ws-icon-btn" onClick={addToCalendar}>
                        <span className="ws-icon-dot" style={{ background: 'var(--sunset-dark)' }} />
                        Add to calendar
                      </button>
                    </div>
                    {job.jobdesk && (
                      <p className="subtitle" style={{ margin: '6px 0 0' }}>
                        {job.jobdesk}
                      </p>
                    )}
                    <p className="subtitle" style={{ marginTop: 10 }}>
                      {docCount > 0
                        ? `${docCount} document${docCount === 1 ? '' : 's'} shared for this event.`
                        : "The organizer hasn't shared any documents yet."}{' '}
                      {docCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setTab('documents')}
                          style={{ background: 'none', border: 'none', padding: 0, color: 'var(--primary-dark)', fontWeight: 700, cursor: 'pointer', font: 'inherit' }}
                        >
                          Open Documents
                        </button>
                      )}
                    </p>
                  </div>
                </div>

                <div className="ws-col-side">
                  <div className="ws-panel">
                    <p className="ws-section-title" style={{ marginBottom: 10 }}>
                      Who else is on this event
                    </p>
                    {teammates.length === 0 ? (
                      <p className="subtitle" style={{ margin: 0 }}>
                        No one else confirmed yet.
                      </p>
                    ) : (
                      <div className="stack" style={{ gap: 10 }}>
                        {teammates.map((t) => (
                          <div key={t.id} className="ws-kv-row">
                            <span>{t.name}</span>
                            {t.skill && <span className="chip chip-outline">{t.skill}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="ws-panel">
                    <p className="ws-section-title" style={{ marginBottom: 10 }}>
                      Your booking
                    </p>
                    <div className="stack" style={{ gap: 8 }}>
                      <div className="ws-kv-row" style={{ fontSize: 12 }}>
                        <span style={{ color: 'var(--muted)' }}>Role</span>
                        <span style={{ fontWeight: 700 }}>{job.skill}</span>
                      </div>
                      <div className="ws-kv-row" style={{ fontSize: 12 }}>
                        <span style={{ color: 'var(--muted)' }}>Fee</span>
                        <span style={{ fontWeight: 700 }}>{fee || 'Not set'}</span>
                      </div>
                      {job.fee_type === 'plus_transport' && job.transport_max_amount != null && (
                        <div className="ws-kv-row" style={{ fontSize: 12 }}>
                          <span style={{ color: 'var(--muted)' }}>Transport</span>
                          <span style={{ fontWeight: 700 }}>Up to Rp {Number(job.transport_max_amount).toLocaleString('id-ID')}</span>
                        </div>
                      )}
                      <div className="ws-kv-row" style={{ fontSize: 12 }}>
                        <span style={{ color: 'var(--muted)' }}>Status</span>
                        <span className="chip chip-mint">Confirmed</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'documents' && (
            <div className="ws-panel">
              <DocumentsView jobId={jobId} canEdit={false} />
            </div>
          )}
          {tab === 'tasks' && (
            <div className="ws-panel">
              <TasksView jobId={jobId} canManage={false} currentUserId={user.id} teamMembers={[...teammates, { id: user.id, name: 'You' }]} />
            </div>
          )}
        </div>

        <ChatRail jobId={jobId} eventTitle={job.title} currentUserId={user.id} canOpenChat={false} collapsed={chatCollapsed} />
      </div>
    </div>
  )
}
