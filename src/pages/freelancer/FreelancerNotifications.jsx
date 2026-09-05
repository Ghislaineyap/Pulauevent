import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, FreelancerTabbar } from '../../components/Layout'

export default function FreelancerNotifications() {
  const { user } = useAuth()
  const [tab, setTab] = useState('chats') // 'chats' | 'requests'
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
        .select('job_divisions(job_id, job_postings(id, title, chat_opened_at, organizer_profiles(org_name, hide_name)))')
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

  async function respondInvite(applicationId, status) {
    await supabase.from('applications').update({ status }).eq('id', applicationId)
    load()
  }

  const pendingCount = pendingLikes.length + invites.length

  return (
    <div className="app-shell">
      <Topbar title="Connect" />
      <div className="page">
        <div className="segmented">
          <button type="button" className={tab === 'chats' ? 'active' : ''} onClick={() => setTab('chats')}>
            Chats
          </button>
          <button type="button" className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>
            Requests
            {pendingCount > 0 && <span className="badge" style={{ marginLeft: 6 }}>{pendingCount}</span>}
          </button>
        </div>

        {loading && <p className="subtitle">Loading…</p>}

        {tab === 'requests' && (
          <>
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
          </>
        )}

        {tab === 'chats' && (
          <>
            <h2>Event chats</h2>
            <p className="helper-text" style={{ margin: '-4px 0 0' }}>
              One group thread per event you're confirmed on — everyone on the team, named after the event.
            </p>
            {!loading && eventTeams.length === 0 && (
              <p className="subtitle">No confirmed events yet — apply to jobs to get started.</p>
            )}
            <div className="stack">
              {eventTeams.map((job) => (
                <div key={job.id} className="card">
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{job.title}</strong>
                    {job.chat_opened_at && <span className="chip chip-outline">{job.memberCount} in chat</span>}
                  </div>
                  <p className="subtitle" style={{ margin: '4px 0 0' }}>
                    {job.organizer_profiles.hide_name ? 'Event Organizer' : job.organizer_profiles.org_name} · confirmed on
                    this event
                  </p>
                  {job.chat_opened_at ? (
                    <Link to={`/event-chat/${job.id}`} className="btn btn-primary btn-block" style={{ marginTop: 10, textDecoration: 'none' }}>
                      💬 Open event chat
                    </Link>
                  ) : (
                    <p className="helper-text" style={{ margin: '10px 0 0' }}>
                      The organizer hasn't started this event's group chat yet.
                    </p>
                  )}
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
                <div key={m.id} className="card">
                  <strong>{m.organizer_profiles.org_name}</strong>
                  <p className="subtitle" style={{ margin: '4px 0 0' }}>Connected via their interest</p>
                  <Link to={`/chat/${m.id}`} className="btn btn-primary btn-block" style={{ marginTop: 10, textDecoration: 'none' }}>
                    💬 Open chat
                  </Link>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <FreelancerTabbar pendingCount={pendingCount} />
    </div>
  )
}
