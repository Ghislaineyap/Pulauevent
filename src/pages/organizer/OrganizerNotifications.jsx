import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { ProfileAvatar } from '../../components/ProfileAvatar'
import { InfoButton } from '../../components/InfoButton'
import { fetchUnreadCounts, subscribeUnreadIncrements } from '../../lib/chatReads'

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function OrganizerNotifications() {
  const { user } = useAuth()
  const [tab, setTab] = useState('event') // 'event' | 'team'
  const [likeMatches, setLikeMatches] = useState([])
  const [eventTeams, setEventTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [personalUnread, setPersonalUnread] = useState(new Map())
  const [eventUnread, setEventUnread] = useState(new Map())
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: matchRows, error: matchError }, { data: jobRows, error: jobsError }] = await Promise.all([
      supabase
        .from('matches')
        .select('id, source, created_at, freelancer_profiles(id, name, locations, avatar_key, photo_urls, pitch, skills)')
        .eq('organizer_id', user.id)
        .eq('source', 'like')
        .order('created_at', { ascending: false }),
      supabase
        .from('job_postings')
        .select('id, title, event_end_date, chat_opened_at, job_divisions(id)')
        .eq('organizer_id', user.id),
    ])
    if (matchError) console.error(matchError)
    if (jobsError) console.error(jobsError)
    setLikeMatches(matchRows || [])

    const divisionIds = (jobRows || []).flatMap((j) => j.job_divisions.map((d) => d.id))
    const jobIdByDivision = new Map((jobRows || []).flatMap((j) => j.job_divisions.map((d) => [d.id, j.id])))
    const jobById = new Map((jobRows || []).map((j) => [j.id, j]))
    let teamCountByJob = new Map()
    if (divisionIds.length > 0) {
      const { data: apps, error: appsError } = await supabase
        .from('applications')
        .select('division_id')
        .in('division_id', divisionIds)
        .eq('status', 'accepted')
      if (appsError) console.error(appsError)
      ;(apps || []).forEach((a) => {
        const jobId = jobIdByDivision.get(a.division_id)
        teamCountByJob.set(jobId, (teamCountByJob.get(jobId) || 0) + 1)
      })
    }
    setEventTeams(
      [...teamCountByJob.entries()].map(([id, count]) => ({
        id,
        title: jobById.get(id)?.title,
        eventEndDate: jobById.get(id)?.event_end_date,
        chatOpened: Boolean(jobById.get(id)?.chat_opened_at),
        memberCount: count + 1,
      }))
    )
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  // Unread badges for both chat lists — see the freelancer side's
  // FreelancerNotifications.jsx for the same pattern.
  useEffect(() => {
    const ids = likeMatches.map((m) => m.id)
    if (ids.length === 0) {
      setPersonalUnread(new Map())
      return
    }
    fetchUnreadCounts({ userId: user.id, chatType: 'personal', ids }).then(setPersonalUnread)
  }, [user.id, likeMatches])

  useEffect(() => {
    const ids = eventTeams.filter((j) => j.chatOpened).map((j) => j.id)
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

  // Keep finished events out of the way once they've wrapped up, so this
  // list stays about what's current instead of growing forever.
  const activeEvents = useMemo(() => eventTeams.filter((j) => !j.eventEndDate || j.eventEndDate >= todayISO()), [eventTeams])
  const archivedEvents = useMemo(() => eventTeams.filter((j) => j.eventEndDate && j.eventEndDate < todayISO()), [eventTeams])
  const totalUnreadMessages = [...personalUnread.values(), ...eventUnread.values()].reduce((sum, n) => sum + n, 0)

  // Client-side, by name/title only for now — searching message content
  // would mean querying job_chat_messages/messages themselves, a bigger
  // follow-up than this pass's name search.
  const q = search.trim().toLowerCase()
  const visibleActiveEvents = q ? activeEvents.filter((j) => j.title?.toLowerCase().includes(q)) : activeEvents
  const visibleArchivedEvents = q ? archivedEvents.filter((j) => j.title?.toLowerCase().includes(q)) : archivedEvents
  const visibleLikeMatches = q ? likeMatches.filter((m) => m.freelancer_profiles?.name?.toLowerCase().includes(q)) : likeMatches

  return (
    <div className="app-shell">
      <Topbar title="Connect" />
      <div className="page">
        <div className="row" style={{ alignItems: 'center', gap: 0 }}>
          <div className="segmented" style={{ flex: 1 }}>
            <button type="button" className={tab === 'event' ? 'active' : ''} onClick={() => setTab('event')}>
              Event chat
              {[...eventUnread.values()].reduce((s, n) => s + n, 0) > 0 && (
                <span className="badge" style={{ marginLeft: 6 }}>{[...eventUnread.values()].reduce((s, n) => s + n, 0)}</span>
              )}
            </button>
            <button type="button" className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>
              My team chat
              {[...personalUnread.values()].reduce((s, n) => s + n, 0) > 0 && (
                <span className="badge" style={{ marginLeft: 6 }}>{[...personalUnread.values()].reduce((s, n) => s + n, 0)}</span>
              )}
            </button>
          </div>
          <InfoButton title={tab === 'event' ? 'Event chat' : 'My team chat'}>
            {tab === 'event'
              ? 'One group thread per event, for everyone confirmed on it — named after the event, not a person.'
              : "1:1 chats with people you've connected with via Discover — tap their name to revisit their profile."}
          </InfoButton>
        </div>

        <input
          type="text"
          placeholder={tab === 'event' ? 'Search events…' : 'Search by name…'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {loading && <p className="subtitle">Loading…</p>}

        {tab === 'event' && (
          <>
            {!loading && visibleActiveEvents.length === 0 && (
              <p className="subtitle">
                {q ? 'No events match that search.' : 'No confirmed team yet — accept an applicant or invite someone.'}
              </p>
            )}
            <div className="stack">
              {visibleActiveEvents.map((job) => (
                <div key={job.id} className="row-card">
                  <div className="avatar-chip square" style={{ width: 40, height: 40, background: 'var(--mint)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{job.title}</strong>
                    <p className="subtitle" style={{ margin: '2px 0 0' }}>{job.memberCount} in chat</p>
                  </div>
                  {job.chatOpened ? (
                    <Link to={`/event-chat/${job.id}`} className="circle-icon-btn" style={{ textDecoration: 'none', position: 'relative' }} aria-label="Open event chat">
                      <ChatIcon />
                      {eventUnread.get(job.id) > 0 && (
                        <span className="badge" style={{ position: 'absolute', top: -6, right: -6 }}>
                          {eventUnread.get(job.id)}
                        </span>
                      )}
                    </Link>
                  ) : (
                    <span className="chip chip-outline" style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}>
                      Not started
                    </span>
                  )}
                </div>
              ))}
            </div>

            {visibleArchivedEvents.length > 0 && (
              <>
                <button type="button" className="btn btn-outline btn-block" onClick={() => setShowArchived((s) => !s)}>
                  {showArchived ? 'Hide' : 'Show'} past events ({visibleArchivedEvents.length})
                </button>
                {showArchived && (
                  <div className="stack">
                    {visibleArchivedEvents.map((job) => (
                      <div key={job.id} className="row-card" style={{ opacity: 0.75, cursor: 'default' }}>
                        <div className="avatar-chip square" style={{ width: 40, height: 40, background: 'var(--muted)' }} />
                        <strong style={{ flex: 1 }}>{job.title}</strong>
                        {job.chatOpened ? (
                          <Link to={`/event-chat/${job.id}`} className="chip chip-outline" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }} aria-label="View chat history">
                            View chat
                          </Link>
                        ) : (
                          <span className="chip chip-outline" style={{ whiteSpace: 'nowrap' }}>Past event</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === 'team' && (
          <>
            {!loading && visibleLikeMatches.length === 0 && (
              <p className="subtitle">{q ? 'No connections match that search.' : 'No connections yet — browse freelancers in Discover.'}</p>
            )}
            <div className="stack">
              {visibleLikeMatches.map((m) => {
                const f = m.freelancer_profiles
                return (
                  <div key={m.id} className="row-card">
                    <Link
                      to={`/organizer/freelancers/${f.id}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}
                    >
                      <ProfileAvatar avatarKey={f.avatar_key} photoUrl={(f.photo_urls || [])[0]} />
                      <div>
                        <strong>{f.name}</strong>
                        <p className="subtitle" style={{ margin: '2px 0 0' }}>📍 {(f.locations || []).join(', ')}</p>
                      </div>
                    </Link>
                    <Link to={`/chat/${m.id}`} className="circle-icon-btn" style={{ textDecoration: 'none', position: 'relative' }} aria-label="Open chat">
                      <ChatIcon />
                      {personalUnread.get(m.id) > 0 && (
                        <span className="badge" style={{ position: 'absolute', top: -6, right: -6 }}>
                          {personalUnread.get(m.id)}
                        </span>
                      )}
                    </Link>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
      <OrganizerTabbar connectCount={totalUnreadMessages} />
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
