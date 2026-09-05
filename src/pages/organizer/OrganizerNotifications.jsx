import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { ProfileAvatar } from '../../components/ProfileAvatar'

export default function OrganizerNotifications() {
  const { user } = useAuth()
  const [likeMatches, setLikeMatches] = useState([])
  const [eventTeams, setEventTeams] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: matchRows, error: matchError }, { data: jobRows, error: jobsError }] = await Promise.all([
        supabase
          .from('matches')
          .select('id, source, created_at, freelancer_profiles(name, locations, avatar_key, photo_urls, pitch, skills)')
          .eq('organizer_id', user.id)
          .eq('source', 'like')
          .order('created_at', { ascending: false }),
        supabase
          .from('job_postings')
          .select('id, title, chat_opened_at, job_divisions(id)')
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
          chatOpened: Boolean(jobById.get(id)?.chat_opened_at),
          memberCount: count + 1,
        }))
      )
      setLoading(false)
    }
    load()
  }, [user.id])

  return (
    <div className="app-shell">
      <Topbar title="Connect" />
      <div className="page">
        {loading && <p className="subtitle">Loading…</p>}

        <h2>Event chats</h2>
        <p className="helper-text" style={{ margin: '-4px 0 0' }}>
          One group thread per event, for everyone confirmed on it — named after the event, not a person.
        </p>
        {!loading && eventTeams.length === 0 && (
          <p className="subtitle">No confirmed team yet — accept an applicant or invite someone.</p>
        )}
        <div className="stack">
          {eventTeams.map((job) => (
            <div key={job.id} className="card stack">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{job.title}</strong>
                <span className="chip chip-outline">{job.memberCount} in chat</span>
              </div>
              {job.chatOpened ? (
                <Link to={`/event-chat/${job.id}`} className="btn btn-primary btn-block" style={{ textDecoration: 'none' }}>
                  💬 Open event chat
                </Link>
              ) : (
                <p className="subtitle" style={{ margin: 0 }}>
                  Not started yet — open it from this event's card in My Event when you're ready.
                </p>
              )}
            </div>
          ))}
        </div>

        <h2>Personal chats</h2>
        <p className="helper-text" style={{ margin: '-4px 0 0' }}>
          1:1 conversations from Discover interest — separate from any event's group chat.
        </p>
        {!loading && likeMatches.length === 0 && <p className="subtitle">No connections yet — browse freelancers in Discover.</p>}
        <div className="stack">
          {likeMatches.map((m) => {
            const f = m.freelancer_profiles
            return (
              <div key={m.id} className="card stack">
                <div className="row" style={{ alignItems: 'center' }}>
                  <ProfileAvatar avatarKey={f.avatar_key} photoUrl={(f.photo_urls || [])[0]} />
                  <div>
                    <strong>{f.name}</strong>
                    <p className="subtitle" style={{ margin: '4px 0 0' }}>
                      📍 {(f.locations || []).join(', ')} · Connected via your interest
                    </p>
                  </div>
                </div>
                <Link to={`/chat/${m.id}`} className="btn btn-primary btn-block" style={{ textDecoration: 'none' }}>
                  💬 Open chat
                </Link>
              </div>
            )
          })}
        </div>
      </div>
      <OrganizerTabbar />
    </div>
  )
}
