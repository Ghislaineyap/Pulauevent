import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, VendorTabbar } from '../../components/Layout'
import { Modal } from '../../components/Modal'
import { formatEventDates } from '../../lib/date'
import { downloadICS, eventsFromJobSchedule } from '../../lib/ics'
import { DocumentsView } from '../../components/DocumentsView'
import { TasksView } from '../../components/TasksView'
import { fetchUnreadCounts, subscribeUnreadIncrements } from '../../lib/chatReads'

const todayISO = () => new Date().toISOString().slice(0, 10)

// Vendor counterpart of freelancer/MyEvents.jsx — every vendor_applications
// row (applied or invited), same accept/decline-an-invite and "once
// accepted, get straight into the event's tools" shape, just against
// vendor_slots instead of job_divisions.
export default function VendorMyEvents() {
  const { user } = useAuth()
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [respondingId, setRespondingId] = useState(null)
  const [eventTool, setEventTool] = useState(null) // { jobId, title, type: 'documents' | 'tasks' } | null
  const [eventUnread, setEventUnread] = useState(new Map())

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('vendor_applications')
      .select(
        'id, status, vendor_slots(id, category, job_id, job_postings(id, title, location, event_start_date, event_end_date, chat_opened_at, organizer_profiles(org_name)))'
      )
      .eq('vendor_id', user.id)
    if (error) console.error(error)
    setApplications((data || []).filter((a) => a.vendor_slots?.job_postings))
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const ids = applications
      .filter((a) => a.status === 'accepted' && a.vendor_slots.job_postings.chat_opened_at)
      .map((a) => a.vendor_slots.job_postings.id)
    if (ids.length === 0) {
      setEventUnread(new Map())
      return
    }
    fetchUnreadCounts({ userId: user.id, chatType: 'event', ids }).then(setEventUnread)
  }, [user.id, applications])

  useEffect(() => {
    const unsubscribe = subscribeUnreadIncrements('event', user.id, (chatId) => {
      setEventUnread((m) => new Map(m).set(chatId, (m.get(chatId) || 0) + 1))
    })
    return unsubscribe
  }, [user.id])

  async function respondInvite(applicationId, status) {
    setRespondingId(applicationId)
    const { error } = await supabase.from('vendor_applications').update({ status }).eq('id', applicationId)
    setRespondingId(null)
    if (error) {
      console.error(error)
      return
    }
    load()
  }

  function addToCalendar(job) {
    downloadICS(job.title, eventsFromJobSchedule(job, [], []))
  }

  const invited = applications.filter((a) => a.status === 'invited')
  const active = applications.filter((a) => a.status !== 'invited' && a.vendor_slots.job_postings.event_end_date >= todayISO())
  const past = applications.filter((a) => a.status !== 'invited' && a.vendor_slots.job_postings.event_end_date < todayISO())

  function renderCard(a, { past: isPast = false } = {}) {
    const job = a.vendor_slots.job_postings
    return (
      <div key={a.id} className="card stack" style={isPast ? { opacity: 0.75 } : undefined}>
        <div>
          <h2 style={{ margin: 0 }}>{job.title}</h2>
          <p className="subtitle" style={{ margin: '4px 0 0' }}>
            {job.organizer_profiles.org_name} · 📍 {job.location} · {formatEventDates(job.event_start_date, job.event_end_date)}
          </p>
          <p className="subtitle" style={{ margin: '4px 0 0' }}>
            Booked as <strong>{a.vendor_slots.category}</strong> ·{' '}
            <span className={`chip chip-outline`} style={{ fontSize: 11 }}>
              {a.status}
            </span>
          </p>
        </div>

        {a.status === 'invited' && (
          <div className="row">
            <button className="btn btn-outline" style={{ flex: 1 }} disabled={respondingId === a.id} onClick={() => respondInvite(a.id, 'declined')}>
              Decline
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={respondingId === a.id} onClick={() => respondInvite(a.id, 'accepted')}>
              Accept
            </button>
          </div>
        )}

        {a.status === 'accepted' && (
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {job.chat_opened_at ? (
              <Link to={`/event-chat/${job.id}`} className="btn btn-outline" style={{ flex: '1 1 45%', padding: '8px 10px', fontSize: 12.5, textDecoration: 'none', position: 'relative' }}>
                💬 Open event chat
                {eventUnread.get(job.id) > 0 && (
                  <span className="badge" style={{ position: 'absolute', top: -8, right: -8 }}>
                    {eventUnread.get(job.id)}
                  </span>
                )}
              </Link>
            ) : (
              <p className="helper-text" style={{ margin: 0, flex: '1 1 100%' }}>The organizer hasn't started this event's group chat yet.</p>
            )}
            <button
              type="button"
              className="btn btn-outline"
              style={{ flex: '1 1 45%', padding: '8px 10px', fontSize: 12.5 }}
              onClick={() => setEventTool({ jobId: job.id, title: job.title, type: 'documents' })}
            >
              View documents
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ flex: '1 1 45%', padding: '8px 10px', fontSize: 12.5 }}
              onClick={() => setEventTool({ jobId: job.id, title: job.title, type: 'tasks' })}
            >
              My tasks
            </button>
            <button type="button" className="btn btn-outline btn-block" style={{ padding: '8px 10px', fontSize: 12.5 }} onClick={() => addToCalendar(job)}>
              Add to calendar
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Topbar title="My Event" />
      <div className="page">
        {loading && <p className="subtitle">Loading…</p>}

        {!loading && invited.length > 0 && (
          <>
            <h2>Invited — needs your response</h2>
            <div className="stack">{invited.map((a) => renderCard(a))}</div>
          </>
        )}

        <h2>Your bookings</h2>
        {!loading && active.length === 0 && <div className="empty-state">No bookings yet — browse Opportunities to apply.</div>}
        <div className="stack">{active.map((a) => renderCard(a))}</div>

        {past.length > 0 && (
          <>
            <h2>Past events ({past.length})</h2>
            <div className="stack">{past.map((a) => renderCard(a, { past: true }))}</div>
          </>
        )}
      </div>

      {eventTool && (
        <Modal title={`${eventTool.type === 'documents' ? 'Documents' : 'Tasks'} — ${eventTool.title}`} onClose={() => setEventTool(null)}>
          {eventTool.type === 'documents' && <DocumentsView jobId={eventTool.jobId} canEdit={false} />}
          {eventTool.type === 'tasks' && <TasksView jobId={eventTool.jobId} canManage={false} currentUserId={user.id} teamMembers={[{ id: user.id, name: 'You' }]} />}
        </Modal>
      )}

      <VendorTabbar myEventCount={invited.length} />
    </div>
  )
}
