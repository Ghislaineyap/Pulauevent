import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { PhotoFrame } from '../../components/PhotoFrame'
import { GENDERS } from '../../lib/gender'
import { EXPERIENCE_BANDS, experienceBandLabel } from '../../lib/experience'

const emptyFilters = { genders: [], locations: [], experienceBands: [], skills: [] }

export default function FreelancerBrowse() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rawFreelancers, setRawFreelancers] = useState([])
  const [skillOptions, setSkillOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [justLiked, setJustLiked] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState(emptyFilters)

  const load = useCallback(async () => {
    setLoading(true)
    // Exclude anyone already acted on via Discover (liked/skipped) AND anyone
    // already connected through any path — a job-application acceptance
    // creates a `matches` row too, with no `likes` row involved, so both
    // need checking or a connected freelancer would confusingly reappear here.
    const [{ data: likes }, { data: matches }] = await Promise.all([
      supabase.from('likes').select('freelancer_id').eq('organizer_id', user.id),
      supabase.from('matches').select('freelancer_id').eq('organizer_id', user.id),
    ])
    const acted = new Set([...(likes || []).map((l) => l.freelancer_id), ...(matches || []).map((m) => m.freelancer_id)])

    const { data, error } = await supabase.from('freelancer_profiles').select('*')
    if (error) console.error(error)
    setRawFreelancers((data || []).filter((f) => !acted.has(f.id)))
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    supabase
      .from('skills')
      .select('label')
      .order('sort_order')
      .then(({ data }) => setSkillOptions((data || []).map((s) => s.label)))
  }, [])

  const locationOptions = useMemo(() => {
    const set = new Set()
    rawFreelancers.forEach((f) => (f.locations || []).forEach((l) => set.add(l)))
    return [...set].sort()
  }, [rawFreelancers])

  const freelancers = useMemo(() => {
    return rawFreelancers.filter((f) => {
      if (filters.genders.length && !filters.genders.includes(f.gender)) return false
      if (filters.locations.length && !(f.locations || []).some((l) => filters.locations.includes(l))) return false
      if (filters.experienceBands.length && !filters.experienceBands.includes(f.experience_band)) return false
      if (filters.skills.length) {
        const wantsOther = filters.skills.includes('Other')
        const curatedWanted = filters.skills.filter((s) => s !== 'Other')
        const skills = f.skills || []
        const matchesCurated = curatedWanted.length > 0 && skills.some((s) => curatedWanted.includes(s))
        const matchesOther = wantsOther && skills.some((s) => s.startsWith('Other: '))
        if (!matchesCurated && !matchesOther) return false
      }
      return true
    })
  }, [rawFreelancers, filters])

  function toggleFilter(category, value) {
    setFilters((f) => ({
      ...f,
      [category]: f[category].includes(value) ? f[category].filter((v) => v !== value) : [...f[category], value],
    }))
  }

  const activeFilterCount = Object.values(filters).reduce((n, arr) => n + arr.length, 0)

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
    setRawFreelancers((fs) => fs.filter((f) => f.id !== freelancer.id))
  }

  const top = freelancers[0]

  return (
    <div className="app-shell">
      <Topbar title="Discover" />
      <div className="page">
        <button
          className="btn btn-outline btn-block"
          style={{ justifyContent: 'space-between' }}
          onClick={() => setShowFilters((s) => !s)}
        >
          <span>
            Filters
            {activeFilterCount > 0 && <span className="badge" style={{ marginLeft: 6 }}>{activeFilterCount}</span>}
          </span>
          <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{showFilters ? '▴' : '▾'}</span>
        </button>

        {showFilters && (
          <div className="card stack">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Gender</label>
              <div className="chip-row">
                {GENDERS.map((g) => (
                  <span
                    key={g.value}
                    className={`chip chip-toggle ${filters.genders.includes(g.value) ? 'active' : ''}`}
                    onClick={() => toggleFilter('genders', g.value)}
                  >
                    {g.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label>Experience</label>
              <div className="chip-row">
                {EXPERIENCE_BANDS.map((b) => (
                  <span
                    key={b.value}
                    className={`chip chip-toggle ${filters.experienceBands.includes(b.value) ? 'active' : ''}`}
                    onClick={() => toggleFilter('experienceBands', b.value)}
                  >
                    {b.label}
                  </span>
                ))}
              </div>
            </div>

            {locationOptions.length > 0 && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Location</label>
                <div className="chip-row">
                  {locationOptions.map((loc) => (
                    <span
                      key={loc}
                      className={`chip chip-toggle ${filters.locations.includes(loc) ? 'active' : ''}`}
                      onClick={() => toggleFilter('locations', loc)}
                    >
                      {loc}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {skillOptions.length > 0 && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Skill</label>
                <div className="chip-row">
                  {skillOptions.map((s) => (
                    <span
                      key={s}
                      className={`chip chip-toggle ${filters.skills.includes(s) ? 'active' : ''}`}
                      onClick={() => toggleFilter('skills', s)}
                    >
                      {s}
                    </span>
                  ))}
                  <span
                    className={`chip chip-toggle ${filters.skills.includes('Other') ? 'active' : ''}`}
                    onClick={() => toggleFilter('skills', 'Other')}
                  >
                    Other
                  </span>
                </div>
              </div>
            )}

            {activeFilterCount > 0 && (
              <button type="button" className="btn btn-outline" onClick={() => setFilters(emptyFilters)}>
                Clear filters
              </button>
            )}
          </div>
        )}

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
            {!loading && !top && (
              <div className="empty-state">
                {activeFilterCount > 0 ? 'No freelancers match these filters right now.' : 'No more freelancers to show right now.'}
              </div>
            )}
            {top && (
              <div className="swipe-card">
                <div
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/organizer/freelancers/${top.id}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/organizer/freelancers/${top.id}`)}
                >
                  <PhotoFrame
                    photoUrl={(top.photo_urls || [])[0]}
                    gender={top.gender}
                    dotCount={(top.photo_urls || []).length}
                  >
                    <div className="photo-scrim">
                      <h2>{top.name}</h2>
                      <p>
                        📍 {(top.locations || []).join(', ')}
                        {top.experience_band && ` · ${experienceBandLabel(top.experience_band)} experience`}
                      </p>
                    </div>
                  </PhotoFrame>
                  <div className="photo-card-body">
                    {top.pitch && <p style={{ margin: 0, fontSize: 14 }}>{top.pitch}</p>}
                    <div className="chip-row">
                      {(top.skills || []).slice(0, 4).map((s) => (
                        <span key={s} className="chip chip-outline">
                          {s}
                        </span>
                      ))}
                      {(top.skills || []).length > 4 && (
                        <span className="chip chip-outline">+{top.skills.length - 4} more</span>
                      )}
                    </div>
                    <p className="subtitle" style={{ fontWeight: 600, color: 'var(--primary-dark)' }}>
                      View full profile →
                    </p>
                  </div>
                </div>
                <div className="swipe-actions" style={{ padding: '0 16px 16px' }}>
                  <button className="btn btn-outline" onClick={() => act(top, 'pass')}>
                    Skip
                  </button>
                  <button className="btn btn-primary" onClick={() => act(top, 'like')}>
                    Shortlist
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
