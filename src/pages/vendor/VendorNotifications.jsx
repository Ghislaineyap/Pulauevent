import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, VendorTabbar } from '../../components/Layout'
import { InfoButton } from '../../components/InfoButton'
import { fetchUnreadCounts, subscribeUnreadIncrements } from '../../lib/chatReads'

const todayISO = () => new Date().toISOString().slice(0, 10)

// Lighter than FreelancerNotifications — vendors don't have a Discover/likes
// system yet (that's item 8's territory), so "Connect" for a vendor is just
// their event group chats for now.
export default function VendorNotifications() {
  const { user } = useAuth()
  const [eventTeams, setEventTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [eventUnread, setEventUnread] = useState(new Map())

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('vendor_applications')
      .select('vendor_slots(job_id, job_postings(id, title, event_end_date, chat_opened_at, organizer_profiles(org_name)))')
      .eq('vendor_id', user.id)
      .eq('status', 'accepted')
    if (error) console.error(error)
    const byJob = new Map()
    ;(data || [])
      .filter((a) => a.vendor_slots?.job_postings)
      .forEach((a) => {
        const job = a.vendor_slots.job_postings
        if (!byJob.has(job.id)) byJob.set(job.id, job)
      })
    setEventTeams([...byJob.values()])
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const ids = eventTeams.filter((j) => j.chat_opened_at).map((j) => j.id)
    if (ids.length === 0) {
      setEventUnread(new Map())
      return
    }
    fetchUnreadCounts({ userId: user.id, chatType: 'event', ids }).then(setEventUnread)
  }, [user.id, eventTeams])

  useEffect(() => {
    const unsubscribe = subscribeUnreadIncrements('event', user.id, (chatId) => {
      setEventUnread((m) => new Map(m).set(chatId, (m.get(chatId) || 0) + 1))
    })
    return unsubscribe
  }, [user.id])

  const activeEvents = eventTeams.filter((j) => !j.event_end_date || j.event_end_date >= todayISO())
  const archivedEvents = eventTeams.filter((j) => j.event_end_date && j.event_end_date < todayISO())
  const totalUnread = [...eventUnread.values()].reduce((s, n) => s + n, 0)

  return (
    <div className="app-shell">
      <Topbar title="Connect" />
      <div className="page">
        <h2 style={{ display: 'flex', alignItems: 'center' }}>
          Event chats
          <InfoButton title="Event chats">One group thread per event you're booked on — everyone on the team, named after the event.</InfoButton>
        </h2>
        {loading && <p className="subtitle">Loading…</p>}
        {!loading && activeEvents.length === 0 && <p className="subtitle">No confirmed bookings yet — apply from Opportunities to get started.</p>}
        <div className="stack">
          {activeEvents.map((job) => (
            <div key={job.id} className="card">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong>{job.title}</strong>
                  <p className="subtitle" style={{ margin: '2px 0 0' }}>{job.organizer_profiles.org_name}</p>
                </div>
                {job.chat_opened_at ? (
                  <Link to={`/event-chat/${job.id}`} className="chip" style={{ textDecoration: 'none', position: 'relative' }} aria-label="Open event chat">
                    💬
                    {eventUnread.get(job.id) > 0 && (
                      <span className="badge" style={{ position: 'absolute', top: -6, right: -6 }}>
                        {eventUnread.get(job.id)}
                      </span>
                    )}
                  </Link>
                ) : (
                  <span className="chip chip-outline" style={{ fontSize: 11 }}>Not started</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {archivedEvents.length > 0 && (
          <>
            <button type="button" className="btn btn-outline btn-block" onClick={() => setShowArchived((s) => !s)}>
              {showArchived ? 'Hide' : 'Show'} past events ({archivedEvents.length})
            </button>
            {showArchived && (
              <div className="stack">
                {archivedEvents.map((job) => (
                  <div key={job.id} className="card" style={{ opacity: 0.75 }}>
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>{job.title}</strong>
                        <p className="subtitle" style={{ margin: '2px 0 0' }}>{job.organizer_profiles.org_name}</p>
                      </div>
                      {job.chat_opened_at ? (
                        <Link to={`/event-chat/${job.id}`} className="chip chip-outline" style={{ textDecoration: 'none' }} aria-label="View chat history">
                          💬
                        </Link>
                      ) : (
                        <span className="chip chip-outline">Past event</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <VendorTabbar connectCount={totalUnread} />
    </div>
  )
}
