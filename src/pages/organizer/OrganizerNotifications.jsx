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
          .select('id, title, job_divisions(id)')
          .eq('organizer_id', user.id),
      ])
      if (matchError) console.error(matchError)
      if (jobsError) console.error(jobsError)
      setLikeMatches(matchRows || [])

      const divisionIds = (jobRows || []).flatMap((j) => j.job_divisions.map((d) => d.id))
      const jobIdByDivision = new Map((jobRows || []).flatMap((j) => j.job_divisions.map((d) => [d.id, j.id])))
      const titleByJob = new Map((jobRows || []).map((j) => [j.id, j.title]))
      let teamJobIds = new Set()
      if (divisionIds.length > 0) {
        const { data: apps, error: appsError } = await supabase
          .from('applications')
          .select('division_id')
          .in('division_id', divisionIds)
          .eq('status', 'accepted')
        if (appsError) console.error(appsError)
        teamJobIds = new Set((apps || []).map((a) => jobIdByDivision.get(a.division_id)))
      }
      setEventTeams([...teamJobIds].map((id) => ({ id, title: titleByJob.get(id) })))
      setLoading(false)
    }
    load()
  }, [user.id])

  return (
    <div className="app-shell">
      <Topbar title="Connect" />
      <div className="page">
        {loading && <p className="subtitle">Loading…</p>}

        <h2>Your events</h2>
        {!loading && eventTeams.length === 0 && (
          <p className="subtitle">No confirmed team yet — accept an applicant or invite someone.</p>
        )}
        <div className="stack">
          {eventTeams.map((job) => (
            <div key={job.id} className="card stack">
              <strong>{job.title}</strong>
              <Link to={`/event-chat/${job.id}`} className="btn btn-primary btn-block" style={{ textDecoration: 'none' }}>
                💬 Open event chat
              </Link>
            </div>
          ))}
        </div>

        <h2>From Discover</h2>
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
