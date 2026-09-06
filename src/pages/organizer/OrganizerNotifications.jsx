import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { ProfileAvatar } from '../../components/ProfileAvatar'
import { InfoButton } from '../../components/InfoButton'

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function OrganizerNotifications() {
  const { user } = useAuth()
  const [tab, setTab] = useState('event') // 'event' | 'team'
  const [likeMatches, setLikeMatches] = useState([])
  const [eventTeams, setEventTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)

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

  // Keep finished events out of the way once they've wrapped up, so this
  // list stays about what's current instead of growing forever.
  const activeEvents = useMemo(() => eventTeams.filter((j) => !j.eventEndDate || j.eventEndDate >= todayISO()), [eventTeams])
  const archivedEvents = useMemo(() => eventTeams.filter((j) => j.eventEndDate && j.eventEndDate < todayISO()), [eventTeams])

  return (
    <div className="app-shell">
      <Topbar title="Connect" />
      <div className="page">
        <div className="row" style={{ alignItems: 'center', gap: 0 }}>
          <div className="segmented" style={{ flex: 1 }}>
            <button type="button" className={tab === 'event' ? 'active' : ''} onClick={() => setTab('event')}>
              Event chat
            </button>
            <button type="button" className={tab === 'team' ? 'active' : ''} onClick={() => setTab('team')}>
              My team chat
            </button>
          </div>
          <InfoButton title={tab === 'event' ? 'Event chat' : 'My team chat'}>
            {tab === 'event'
              ? 'One group thread per event, for everyone confirmed on it — named after the event, not a person.'
              : "1:1 chats with people you've connected with via Discover — tap their name to revisit their profile."}
          </InfoButton>
        </div>

        {loading && <p className="subtitle">Loading…</p>}

        {tab === 'event' && (
          <>
            {!loading && activeEvents.length === 0 && (
              <p className="subtitle">No confirmed team yet — accept an applicant or invite someone.</p>
            )}
            <div className="stack">
              {activeEvents.map((job) => (
                <div key={job.id} className="row-card">
                  <div className="avatar-chip square" style={{ width: 40, height: 40, background: 'var(--mint)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong>{job.title}</strong>
                    <p className="subtitle" style={{ margin: '2px 0 0' }}>{job.memberCount} in chat</p>
                  </div>
                  {job.chatOpened ? (
                    <Link to={`/event-chat/${job.id}`} className="circle-icon-btn" style={{ textDecoration: 'none' }} aria-label="Open event chat">
                      <ChatIcon />
                    </Link>
                  ) : (
                    <span className="chip chip-outline" style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}>
                      Not started
                    </span>
                  )}
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
            {!loading && likeMatches.length === 0 && <p className="subtitle">No connections yet — browse freelancers in Discover.</p>}
            <div className="stack">
              {likeMatches.map((m) => {
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
                    <Link to={`/chat/${m.id}`} className="circle-icon-btn" style={{ textDecoration: 'none' }} aria-label="Open chat">
                      <ChatIcon />
                    </Link>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
      <OrganizerTabbar />
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
