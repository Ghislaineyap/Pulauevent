import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

function Stars({ value }) {
  const rounded = Math.round(value)
  return (
    <span aria-hidden="true" style={{ color: 'var(--sunset-dark)', letterSpacing: 1 }}>
      {'★'.repeat(rounded)}
      {'☆'.repeat(5 - rounded)}
    </span>
  )
}

// Read-only ratings + skill-endorsement summary, shown on a freelancer's own
// profile and on the full profile detail an organizer sees. Ratings come
// from organizers after an event wraps up; endorsements come from other
// freelancers they've actually worked an event with.
export function RatingsSummary({ freelancerId, emptyText }) {
  const [ratings, setRatings] = useState([])
  const [endorsementCounts, setEndorsementCounts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [{ data: ratingRows }, { data: endorsementRows }] = await Promise.all([
        supabase
          .from('ratings')
          .select('rating, recommendation, created_at, organizer_profiles(org_name, hide_name)')
          .eq('freelancer_id', freelancerId)
          .order('created_at', { ascending: false }),
        supabase.from('skill_endorsements').select('skill').eq('freelancer_id', freelancerId),
      ])
      if (cancelled) return
      setRatings(ratingRows || [])
      const counts = new Map()
      ;(endorsementRows || []).forEach((e) => counts.set(e.skill, (counts.get(e.skill) || 0) + 1))
      setEndorsementCounts([...counts.entries()].sort((a, b) => b[1] - a[1]))
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [freelancerId])

  if (loading) return null
  if (ratings.length === 0 && endorsementCounts.length === 0) {
    return emptyText ? <p className="subtitle">{emptyText}</p> : null
  }

  const avg = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length : 0

  return (
    <div className="card stack">
      {ratings.length > 0 && (
        <div>
          <div className="row" style={{ alignItems: 'center', gap: 8 }}>
            <Stars value={avg} />
            <strong>{avg.toFixed(1)}</strong>
            <span className="subtitle" style={{ margin: 0 }}>
              ({ratings.length} event{ratings.length === 1 ? '' : 's'})
            </span>
          </div>
          <div className="stack" style={{ marginTop: 10, gap: 10 }}>
            {ratings
              .filter((r) => r.recommendation)
              .slice(0, 3)
              .map((r, i) => (
                <div key={i} style={{ borderLeft: '3px solid var(--border)', paddingLeft: 10 }}>
                  <p style={{ margin: 0, fontSize: 14 }}>"{r.recommendation}"</p>
                  <p className="subtitle" style={{ margin: '4px 0 0', fontSize: 12 }}>
                    — {r.organizer_profiles.hide_name ? 'Event Organizer' : r.organizer_profiles.org_name}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}
      {endorsementCounts.length > 0 && (
        <div>
          <strong style={{ fontSize: 13 }}>Endorsed by teammates</strong>
          <div className="chip-row" style={{ marginTop: 6 }}>
            {endorsementCounts.map(([skill, count]) => (
              <span key={skill} className="chip chip-outline">
                {skill} · {count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
