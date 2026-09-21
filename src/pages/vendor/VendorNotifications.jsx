import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, VendorTabbar } from '../../components/Layout'
import { InfoButton } from '../../components/InfoButton'
import { fetchUnreadCounts, subscribeUnreadIncrements } from '../../lib/chatReads'

const todayISO = () => new Date().toISOString().slice(0, 10)

// "My chat" mirrors the organizer side's Connect tab (OrganizerNotifications
// "team" tab) — 1:1 threads from an organizer messaging this vendor straight
// from Discover, see migration_vendor_messaging.sql. "Event chats" is the
// pre-existing per-event group thread list.
export default function VendorNotifications() {
  const { user } = useAuth()
  const [tab, setTab] = useState('chat') // 'chat' | 'event'
  const [matches, setMatches] = useState([])
  const [eventTeams, setEventTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [personalUnread, setPersonalUnread] = useState(new Map())
  const [eventUnread, setEventUnread] = useState(new Map())

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: matchRows, error: matchError }, { data, error }] = await Promise.all([
      supabase
        .from('matches')
        .select('id, created_at, organizer_profiles(org_name)')
        .eq('vendor_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('vendor_applications')
        .select('vendor_slots(job_id, job_postings(id, title, event_end_date, chat_opened_at, organizer_profiles(org_name)))')
        .eq('vendor_id', user.id)
        .eq('status', 'accepted'),
    ])
    if (matchError) console.error(matchError)
    setMatches(matchRows || [])
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
    const ids = matches.map((m) => m.id)
    if (ids.length === 0) {
      setPersonalUnread(new Map())
      return
    }
    fetchUnreadCounts({ userId: user.id, chatType: 'personal', ids }).then(setPersonalUnread)
  }, [user.id, matches])

  useEffect(() => {
    const ids = eventTeams.filter((j) => j.chat_opened_at).map((j) => j.id)
    if (ids.length === 0) {
      setEventUnread(new Map())
      return
    }
    fetchUnreadCounts({ userId: user.id, chatType: 'event', ids }).then(setEventUnread)
  }, [user.id, eventTeams])

  useEffect(() => {
    const unsubscribe = subscribeUnreadIncrements('personal', user.id, (chatId) => {
      setPersonalUnread((m) => new Map(m).set(chatId, (m.get(chatId) || 0) + 1))
    })
    return unsubscribe
  }, [user.id])

  useEffect(() => {
    const unsubscribe = subscribeUnreadIncrements('event', user.id, (chatId) => {
      setEventUnread((m) => new Map(m).set(chatId, (m.get(chatId) || 0) + 1))
    })
    return unsubscribe
  }, [user.id])

  const activeEvents = useMemo(() => eventTeams.filter((j) => !j.event_end_date || j.event_end_date >= todayISO()), [eventTeams])
  const archivedEvents = useMemo(() => eventTeams.filter((j) => j.event_end_date && j.event_end_date < todayISO()), [eventTeams])
  const totalUnread = [...personalUnread.values(), ...eventUnread.values()].reduce((s, n) => s + n, 0)

  return (
    <div className="app-shell">
      <Topbar title="Connect" />
      <div className="page">
        <div className="row" style={{ alignItems: 'center', gap: 0 }}>
          <div className="segmented" style={{ flex: 1 }}>
            <button type="button" className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
              My chat
              {[...personalUnread.values()].reduce((s, n) => s + n, 0) > 0 && (
                <span className="badge" style={{ marginLeft: 6 }}>{[...personalUnread.values()].reduce((s, n) => s + n, 0)}</span>
              )}
            </button>
            <button type="button" className={tab === 'event' ? 'active' : ''} onClick={() => setTab('event')}>
              Event chat
              {[...eventUnread.values()].reduce((s, n) => s + n, 0) > 0 && (
                <span className="badge" style={{ marginLeft: 6 }}>{[...eventUnread.values()].reduce((s, n) => s + n, 0)}</span>
              )}
            </button>
          </div>
          <InfoButton title={tab === 'event' ? 'Event chat' : 'My chat'}>
            {tab === 'event'
              ? "One group thread per event you're booked on — everyone on the team, named after the event."
              : "1:1 chats with organizers who've messaged you from your Discover profile."}
          </InfoButton>
        </div>

        {loading && <p className="subtitle">Loading…</p>}

        {tab === 'chat' && (
          <>
            {!loading && matches.length === 0 && (
              <p className="subtitle">No messages yet — organizers can message you straight from your Discover profile.</p>
            )}
            <div className="stack">
              {matches.map((m) => (
                <div key={m.id} className="row-card">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{m.organizer_profiles.org_name}</strong>
                  </div>
                  <Link to={`/chat/${m.id}`} className="circle-icon-btn" style={{ textDecoration: 'none', position: 'relative' }} aria-label="Open chat">
                    <ChatIcon />
                    {personalUnread.get(m.id) > 0 && (
                      <span className="badge" style={{ position: 'absolute', top: -6, right: -6 }}>
                        {personalUnread.get(m.id)}
                      </span>
                    )}
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'event' && (
          <>
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
          </>
        )}
      </div>
      <VendorTabbar connectCount={totalUnread} />
    </div>
  )
}

function ChatIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5h16v11H9.5L5 20.5v-4H4z" />
    </svg>
  )
}
