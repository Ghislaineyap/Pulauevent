import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { ProfileAvatar } from '../../components/ProfileAvatar'

export default function OrganizerNotifications() {
  const { user } = useAuth()
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('matches')
      .select('id, source, created_at, freelancer_profiles(name, locations, avatar_key, photo_url, pitch, skills)')
      .eq('organizer_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error)
        setMatches(data || [])
        setLoading(false)
      })
  }, [user.id])

  return (
    <div className="app-shell">
      <Topbar title="Activity" />
      <div className="page">
        <h2>Your matches</h2>
        {loading && <p className="subtitle">Loading…</p>}
        {!loading && matches.length === 0 && <p className="subtitle">No matches yet — post a job or browse freelancers.</p>}
        <div className="stack">
          {matches.map((m) => {
            const f = m.freelancer_profiles
            return (
              <div key={m.id} className="card stack">
                <div className="row" style={{ alignItems: 'center' }}>
                  <ProfileAvatar avatarKey={f.avatar_key} photoUrl={f.photo_url} />
                  <div>
                    <strong>{f.name}</strong>
                    <p className="subtitle" style={{ margin: '4px 0 0' }}>
                      📍 {(f.locations || []).join(', ')} · Matched via {m.source === 'application' ? 'their application' : 'your like'}
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
