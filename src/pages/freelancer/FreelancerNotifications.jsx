import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, FreelancerTabbar } from '../../components/Layout'
import { OrganizerAboutModal } from '../../components/OrganizerAboutModal'

const todayISO = () => new Date().toISOString().slice(0, 10)

// "Chat" is personal, 1:1 stuff — conversations plus a straightforward
// yes/no on someone interested in you. Job invites live in My Event now
// (they come with a jobdesk and a fee to weigh, not just a chat request).
// "Event Chat" is the group threads, one per event, kept separate.
export default function FreelancerNotifications() {
  const { user } = useAuth()
  const [tab, setTab] = useState('chat') // 'chat' | 'event'
  const [pendingLikes, setPendingLikes] = useState([])
  const [likeMatches, setLikeMatches] = useState([])
  const [eventTeams, setEventTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [aboutOrganizer, setAboutOrganizer] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: likes }, { data: matchRows }, { data: acceptedApps }] = await Promise.all([
      supabase
        .from('likes')
        .select('id, organizer_profiles(org_name, location, about, instagram_handle, logo_url)')
        .eq('freelancer_id', user.id)
        .eq('status', 'pending'),
      supabase
        .from('matches')
        .select('id, source, created_at, organizer_profiles(org_name)')
        .eq('freelancer_id', user.id)
        .eq('source', 'like')
        .order('created_at', { ascending: false }),
      supabase
        .from('applications')
        .select('job_divisions(job_id, job_postings(id, title, event_end_date, chat_opened_at, organizer_profiles(org_name)))')
        .eq('freelancer_id', user.id)
        .eq('status', 'accepted'),
    ])
    setPendingLikes(likes || [])
    setLikeMatches(matchRows || [])

    const byJob = new Map()
    ;(acceptedApps || [])
      .filter((a) => a.job_divisions?.job_postings)
      .forEach((a) => {
        const job = a.job_divisions.job_postings
        if (!byJob.has(job.id)) byJob.set(job.id, job)
      })

    // Member count for each confirmed event — how many people (+1 for the
    // organizer) are actually in that group chat, shown so it's clear at a
    // glance which thread is which before opening it.
    const jobIds = [...byJob.keys()]
    let countByJob = new Map()
    if (jobIds.length > 0) {
      const { data: divisionRows } = await supabase.from('job_divisions').select('id, job_id').in('job_id', jobIds)
      const divisionIds = (divisionRows || []).map((d) => d.id)
      const jobIdByDivision = new Map((divisionRows || []).map((d) => [d.id, d.job_id]))
      if (divisionIds.length > 0) {
        const { data: teamApps } = await supabase
          .from('applications')
          .select('division_id')
          .in('division_id', divisionIds)
          .eq('status', 'accepted')
        ;(teamApps || []).forEach((a) => {
          const jobId = jobIdByDivision.get(a.division_id)
          countByJob.set(jobId, (countByJob.get(jobId) || 0) + 1)
        })
      }
    }

    setEventTeams([...byJob.values()].map((job) => ({ ...job, memberCount: (countByJob.get(job.id) || 0) + 1 })))
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  async function respondLike(likeId, status) {
    await supabase.from('likes').update({ status }).eq('id', likeId)
    load()
  }

  const pendingCount = pendingLikes.length

  // Keep finished events out of the way once they've wrapped up, so the
  // chat list stays about what's current instead of growing forever.
  const activeEvents = useMemo(() => eventTeams.filter((j) => !j.event_end_date || j.event_end_date >= todayISO()), [eventTeams])
  const archivedEvents = useMemo(() => eventTeams.filter((j) => j.event_end_date && j.event_end_date < todayISO()), [eventTeams])

  return (
    <div className="app-shell">
      <Topbar title="Connect" />
      <div className="page">
        <div className="segmented">
          <button type="button" className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
            Chat
            {pendingCount > 0 && <span className="badge" style={{ marginLeft: 6 }}>{pendingCount}</span>}
          </button>
          <button type="button" className={tab === 'event' ? 'active' : ''} onClick={() => setTab('event')}>
            Event Chat
          </button>
        </div>

        {loading && <p className="subtitle">Loading…</p>}

        {tab === 'chat' && (
          <>
            <h2>Interested in you</h2>
            <p className="helper-text" style={{ margin: '-4px 0 0' }}>
              Accepting just opens a 1:1 chat with them — no commitment beyond that. Check their profile first if
              you're not sure.
            </p>
            {!loading && pendingLikes.length === 0 && <p className="subtitle">No new interest right now — check back later.</p>}
            <div className="stack">
              {pendingLikes.map((l) => (
                <div key={l.id} className="card row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <button
                      type="button"
                      className="subtitle"
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--primary-dark)', fontWeight: 600, textAlign: 'left' }}
                      onClick={() => setAboutOrganizer(l.organizer_profiles)}
                    >
                      {l.organizer_profiles.org_name}
                    </button>
                    <p className="subtitle" style={{ margin: '4px 0 0' }}>wants to start a chat with you</p>
                  </div>
                  <div className="row">
                    <button className="btn btn-outline" onClick={() => respondLike(l.id, 'declined')}>
                      Decline
                    </button>
                    <button className="btn btn-primary" onClick={() => respondLike(l.id, 'accepted')}>
                      Accept chat
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <h2>Personal chats</h2>
            <p className="helper-text" style={{ margin: '-4px 0 0' }}>
              1:1 conversations from an organizer's Discover interest — not tied to a specific job.
            </p>
            {!loading && likeMatches.length === 0 && <p className="subtitle">No personal chats yet.</p>}
            <div className="stack">
              {likeMatches.map((m) => (
                <div key={m.id} className="card row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{m.organizer_profiles.org_name}</strong>
                  <Link to={`/chat/${m.id}`} className="chip" style={{ textDecoration: 'none' }} aria-label="Open chat">
                    💬
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'event' && (
          <>
            <h2>Event chats</h2>
            <p className="helper-text" style={{ margin: '-4px 0 0' }}>
              One group thread per event you're confirmed on — everyone on the team, named after the event.
            </p>
            {!loading && activeEvents.length === 0 && (
              <p className="subtitle">No confirmed events yet — apply to jobs to get started.</p>
            )}
            <div className="stack">
              {activeEvents.map((job) => (
                <div key={job.id} className="card">
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{job.title}</strong>
                      <p className="subtitle" style={{ margin: '2px 0 0' }}>
                        {job.organizer_profiles.org_name}
                        {job.chat_opened_at && ` · ${job.memberCount} in chat`}
                      </p>
                    </div>
                    {job.chat_opened_at ? (
                      <Link to={`/event-chat/${job.id}`} className="chip" style={{ textDecoration: 'none' }} aria-label="Open event chat">
                        💬
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
                <button
                  type="button"
                  className="btn btn-outline btn-block"
                  onClick={() => setShowArchived((s) => !s)}
                >
                  {showArchived ? 'Hide' : 'Show'} past events ({archivedEvents.length})
                </button>
                {showArchived && (
                  <div className="stack">
                    {archivedEvents.map((job) => (
                      <div key={job.id} className="card" style={{ opacity: 0.75 }}>
                        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong>{job.title}</strong>
                            <p className="subtitle" style={{ margin: '2px 0 0' }}>
                              {job.organizer_profiles.org_name}
                            </p>
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

      {aboutOrganizer && <OrganizerAboutModal organizer={aboutOrganizer} onClose={() => setAboutOrganizer(null)} />}

      <FreelancerTabbar connectCount={pendingCount} />
    </div>
  )
}
