import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { avatarFor } from '../../lib/avatars'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'

export default function OrganizerNotifications() {
  const { user } = useAuth()
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('matches')
      .select('id, source, created_at, freelancer_profiles(name, location, avatar_key, pitch, skills)')
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
            const avatar = avatarFor(f.avatar_key)
            return (
              <div key={m.id} className="card row" style={{ alignItems: 'center' }}>
                <span className="avatar" style={{ background: avatar.gradient }}>
                  {avatar.emoji}
                </span>
                <div>
                  <strong>{f.name}</strong>
                  <p className="subtitle" style={{ margin: '4px 0 0' }}>
                    📍 {f.location} · Matched via {m.source === 'application' ? 'their application' : 'your like'}
                  </p>
                  <p className="helper-text">In-app chat is coming in the next update — for now, coordinate the booking details together directly.</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <OrganizerTabbar />
    </div>
  )
}
