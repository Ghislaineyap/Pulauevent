import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, FreelancerTabbar } from '../../components/Layout'

export default function FreelancerNotifications() {
  const { user } = useAuth()
  const [pendingLikes, setPendingLikes] = useState([])
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: likes }, { data: matchRows }] = await Promise.all([
      supabase
        .from('likes')
        .select('id, organizer_profiles(org_name, hide_name)')
        .eq('freelancer_id', user.id)
        .eq('status', 'pending'),
      supabase
        .from('matches')
        .select('id, source, created_at, organizer_profiles(org_name)')
        .eq('freelancer_id', user.id)
        .order('created_at', { ascending: false }),
    ])
    setPendingLikes(likes || [])
    setMatches(matchRows || [])
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  async function respond(likeId, status) {
    await supabase.from('likes').update({ status }).eq('id', likeId)
    load()
  }

  return (
    <div className="app-shell">
      <Topbar title="Activity" />
      <div className="page">
        {loading && <p className="subtitle">Loading…</p>}

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
                <button className="btn btn-outline" onClick={() => respond(l.id, 'declined')}>
                  Decline
                </button>
                <button className="btn btn-primary" onClick={() => respond(l.id, 'accepted')}>
                  Accept
                </button>
              </div>
            </div>
          ))}
        </div>

        <h2>Your matches</h2>
        {!loading && matches.length === 0 && <p className="subtitle">No matches yet — apply to jobs or wait for interest.</p>}
        <div className="stack">
          {matches.map((m) => (
            <div key={m.id} className="card">
              <strong>{m.organizer_profiles.org_name}</strong>
              <p className="subtitle" style={{ margin: '4px 0 0' }}>
                Matched via {m.source === 'application' ? 'your job application' : 'their like'}
              </p>
              <Link to={`/chat/${m.id}`} className="btn btn-primary btn-block" style={{ marginTop: 10, textDecoration: 'none' }}>
                💬 Open chat
              </Link>
            </div>
          ))}
        </div>
      </div>
      <FreelancerTabbar pendingCount={pendingLikes.length} />
    </div>
  )
}
