import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, FreelancerTabbar } from '../../components/Layout'

export default function FreelancerNotifications() {
  const { user } = useAuth()
  const [pendingLikes, setPendingLikes] = useState([])
  const [invites, setInvites] = useState([])
  const [likeMatches, setLikeMatches] = useState([])
  const [eventTeams, setEventTeams] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: likes }, { data: invitedApps }, { data: matchRows }, { data: acceptedApps }] = await Promise.all([
      supabase
        .from('likes')
        .select('id, organizer_profiles(org_name, hide_name)')
        .eq('freelancer_id', user.id)
        .eq('status', 'pending'),
      supabase
        .from('applications')
        .select('id, job_divisions(skill, job_postings(id, title, organizer_profiles(org_name, hide_name)))')
        .eq('freelancer_id', user.id)
        .eq('status', 'invited'),
      supabase
        .from('matches')
        .select('id, source, created_at, organizer_profiles(org_name)')
        .eq('freelancer_id', user.id)
        .eq('source', 'like')
        .order('created_at', { ascending: false }),
      supabase
        .from('applications')
        .select('job_divisions(job_postings(id, title, organizer_profiles(org_name, hide_name)))')
        .eq('freelancer_id', user.id)
        .eq('status', 'accepted'),
    ])
    setPendingLikes(likes || [])
    setInvites((invitedApps || []).filter((a) => a.job_divisions?.job_postings))
    setLikeMatches(matchRows || [])

    const byJob = new Map()
    ;(acceptedApps || [])
      .filter((a) => a.job_divisions?.job_postings)
      .forEach((a) => {
        const job = a.job_divisions.job_postings
        if (!byJob.has(job.id)) byJob.set(job.id, job)
      })
    setEventTeams([...byJob.values()])
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  async function respondLike(likeId, status) {
    await supabase.from('likes').update({ status }).eq('id', likeId)
    load()
  }

  async function respondInvite(applicationId, status) {
    await supabase.from('applications').update({ status }).eq('id', applicationId)
    load()
  }

  const pendingCount = pendingLikes.length + invites.length

  return (
    <div className="app-shell">
      <Topbar title="Connect" />
      <div className="page">
        {loading && <p className="subtitle">Loading…</p>}

        {invites.length > 0 && (
          <>
            <h2>Invited to a role</h2>
            <div className="stack">
              {invites.map((inv) => {
                const job = inv.job_divisions.job_postings
                return (
                  <div key={inv.id} className="card row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{job.title}</strong>
                      <p className="subtitle" style={{ margin: '4px 0 0' }}>
                        {job.organizer_profiles.hide_name ? 'An Event Organizer' : job.organizer_profiles.org_name} invited
                        you as {inv.job_divisions.skill}
                      </p>
                    </div>
                    <div className="row">
                      <button className="btn btn-outline" onClick={() => respondInvite(inv.id, 'declined')}>
                        Decline
                      </button>
                      <button className="btn btn-primary" onClick={() => respondInvite(inv.id, 'accepted')}>
                        Accept
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <h2>Interested in you</h2>
        {!loading && pendingLikes.length === 0 && <p className="subtitle">No new interest right now — check back later.</p>}
        <div className="stack">
          {pendingLikes.map((l) => (
            <div key={l.id} className="card row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{l.organizer_profiles.hide_name ? 'An Event Organizer' : l.organizer_profiles.org_name}</strong>
                <p className="subtitle" style={{ margin: '4px 0 0' }}>liked your profile</p>
              </div>
              <div className="row">
                <button className="btn btn-outline" onClick={() => respondLike(l.id, 'declined')}>
                  Decline
                </button>
                <button className="btn btn-primary" onClick={() => respondLike(l.id, 'accepted')}>
                  Accept
                </button>
              </div>
            </div>
          ))}
        </div>

        <h2>Your events</h2>
        {!loading && eventTeams.length === 0 && likeMatches.length === 0 && (
          <p className="subtitle">No connections yet — apply to jobs or wait for interest.</p>
        )}
        <div className="stack">
          {eventTeams.map((job) => (
            <div key={job.id} className="card">
              <strong>{job.title}</strong>
              <p className="subtitle" style={{ margin: '4px 0 0' }}>
                {job.organizer_profiles.hide_name ? 'Event Organizer' : job.organizer_profiles.org_name} · confirmed on
                this event
              </p>
              <Link to={`/event-chat/${job.id}`} className="btn btn-primary btn-block" style={{ marginTop: 10, textDecoration: 'none' }}>
                💬 Open event chat
              </Link>
            </div>
          ))}
          {likeMatches.map((m) => (
            <div key={m.id} className="card">
              <strong>{m.organizer_profiles.org_name}</strong>
              <p className="subtitle" style={{ margin: '4px 0 0' }}>Connected via their interest</p>
              <Link to={`/chat/${m.id}`} className="btn btn-primary btn-block" style={{ marginTop: 10, textDecoration: 'none' }}>
                💬 Open chat
              </Link>
            </div>
          ))}
        </div>
      </div>
      <FreelancerTabbar pendingCount={pendingCount} />
    </div>
  )
}
