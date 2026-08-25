import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { avatarFor } from '../../lib/avatars'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'

export default function FreelancerBrowse() {
  const { user } = useAuth()
  const [locationFilter, setLocationFilter] = useState('')
  const [freelancers, setFreelancers] = useState([])
  const [loading, setLoading] = useState(true)
  const [justLiked, setJustLiked] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: likes } = await supabase.from('likes').select('freelancer_id').eq('organizer_id', user.id)
    const acted = new Set((likes || []).map((l) => l.freelancer_id))

    let query = supabase.from('freelancer_profiles').select('*')
    if (locationFilter.trim()) query = query.ilike('location', `%${locationFilter.trim()}%`)
    const { data, error } = await query
    if (error) console.error(error)
    setFreelancers((data || []).filter((f) => !acted.has(f.id)))
    setLoading(false)
  }, [user.id, locationFilter])

  useEffect(() => {
    load()
  }, [load])

  async function act(freelancer, status) {
    const { error } = await supabase.from('likes').insert({
      organizer_id: user.id,
      freelancer_id: freelancer.id,
      status: status === 'like' ? 'pending' : 'declined',
    })
    if (error) {
      console.error(error)
      return
    }
    if (status === 'like') setJustLiked(freelancer)
    setFreelancers((fs) => fs.filter((f) => f.id !== freelancer.id))
  }

  const top = freelancers[0]

  return (
    <div className="app-shell">
      <Topbar title="Browse freelancers" />
      <div className="page">
        <input
          type="text"
          placeholder="Filter by location…"
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
        />

        {justLiked && (
          <div className="card" style={{ textAlign: 'center' }}>
            <p style={{ margin: 0 }}>
              👋 <strong>{justLiked.name}</strong> has been notified. They'll accept or decline from their end.
            </p>
            <button className="btn btn-outline" style={{ marginTop: 10 }} onClick={() => setJustLiked(null)}>
              Keep browsing
            </button>
          </div>
        )}

        {!justLiked && (
          <div className="swipe-stack">
            {loading && <p className="subtitle">Loading…</p>}
            {!loading && !top && <div className="empty-state">No more freelancers to show right now.</div>}
            {top && (
              <div className="swipe-card">
                <span className="avatar" style={{ background: avatarFor(top.avatar_key).gradient }}>
                  {avatarFor(top.avatar_key).emoji}
                </span>
                <h2 style={{ textAlign: 'center' }}>{top.name}</h2>
                <p className="subtitle" style={{ textAlign: 'center' }}>
                  📍 {top.location} {top.years_experience != null && `· ${top.years_experience} yrs experience`}
                </p>
                {top.pitch && <p style={{ textAlign: 'center' }}>{top.pitch}</p>}
                <div className="chip-row" style={{ justifyContent: 'center' }}>
                  {(top.skills || []).map((s) => (
                    <span key={s} className="chip chip-outline">
                      {s}
                    </span>
                  ))}
                </div>
                {top.rate_amount && (
                  <p className="subtitle" style={{ textAlign: 'center' }}>
                    Rate: Rp {Number(top.rate_amount).toLocaleString('id-ID')} / {top.rate_type}
                  </p>
                )}
                <div className="swipe-actions">
                  <button className="swipe-btn pass" onClick={() => act(top, 'pass')} aria-label="Pass">
                    ✕
                  </button>
                  <button className="swipe-btn like" onClick={() => act(top, 'like')} aria-label="Like">
                    ♥
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <OrganizerTabbar />
    </div>
  )
}
