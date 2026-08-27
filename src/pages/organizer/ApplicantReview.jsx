import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { PhotoFrame } from '../../components/PhotoFrame'
import { formatEventDates } from '../../lib/date'
import { experienceBandLabel, EXPERIENCE_BANDS } from '../../lib/experience'
import { GENDERS } from '../../lib/gender'

const emptyFilters = { genders: [], experienceBands: [], locations: [] }

// A division can need more than one person — this is a compare view of every
// pending applicant for the selected role, not a one-at-a-time swipe deck, so
// the organizer can actually weigh them against each other before deciding.
// Once enough people are accepted to fill the role, the remaining pending
// applicants for that division are auto-declined (enforced in the database).
export default function ApplicantReview() {
  const { jobId } = useParams()
  const [job, setJob] = useState(null)
  const [divisions, setDivisions] = useState([])
  const [activeDivisionId, setActiveDivisionId] = useState(null)
  const [applicants, setApplicants] = useState([])
  const [loading, setLoading] = useState(true)
  const [justMatched, setJustMatched] = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState(emptyFilters)

  const loadJob = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('job_postings')
      .select('id, title, location, event_start_date, event_end_date, job_divisions(id, skill, quantity, filled_count, budget_amount, budget_type)')
      .eq('id', jobId)
      .single()
    if (error) console.error(error)
    setJob(data)
    setDivisions(data?.job_divisions || [])
    setActiveDivisionId((prev) => prev || data?.job_divisions?.[0]?.id || null)
    setLoading(false)
  }, [jobId])

  const loadApplicants = useCallback(async () => {
    if (!activeDivisionId) {
      setApplicants([])
      return
    }
    const { data, error } = await supabase
      .from('applications')
      .select('id, status, freelancer_profiles(id, name, gender, locations, avatar_key, photo_urls, pitch, rate_amount, rate_type, skills, experience_band, work_history)')
      .eq('division_id', activeDivisionId)
      .eq('status', 'pending')
    if (error) console.error(error)
    setApplicants(data || [])
  }, [activeDivisionId])

  useEffect(() => {
    loadJob()
  }, [loadJob])

  useEffect(() => {
    setFilters(emptyFilters)
    loadApplicants()
  }, [loadApplicants])

  const locationOptions = useMemo(() => {
    const set = new Set()
    applicants.forEach((a) => (a.freelancer_profiles.locations || []).forEach((l) => set.add(l)))
    return [...set].sort()
  }, [applicants])

  const filteredApplicants = useMemo(() => {
    return applicants.filter((a) => {
      const f = a.freelancer_profiles
      if (filters.genders.length && !filters.genders.includes(f.gender)) return false
      if (filters.experienceBands.length && !filters.experienceBands.includes(f.experience_band)) return false
      if (filters.locations.length && !(f.locations || []).some((l) => filters.locations.includes(l))) return false
      return true
    })
  }, [applicants, filters])

  function toggleFilter(category, value) {
    setFilters((f) => ({
      ...f,
      [category]: f[category].includes(value) ? f[category].filter((v) => v !== value) : [...f[category], value],
    }))
  }

  const activeFilterCount = Object.values(filters).reduce((n, arr) => n + arr.length, 0)

  async function respond(applicationId, freelancer, status) {
    const { error } = await supabase.from('applications').update({ status }).eq('id', applicationId)
    if (error) {
      console.error(error)
      return
    }
    if (status === 'accepted') setJustMatched(freelancer)
    loadJob()
    loadApplicants()
  }

  if (loading) return <div className="center-page">Loading…</div>
  if (!job) return <div className="center-page">Job not found.</div>

  const activeDivision = divisions.find((d) => d.id === activeDivisionId)

  return (
    <div className="app-shell">
      <Topbar title={job.title} />
      <div className="page">
        <Link to="/organizer/dashboard" className="subtitle">
          ← Back to posts
        </Link>
        <p className="subtitle">
          📍 {job.location} · {formatEventDates(job.event_start_date, job.event_end_date)}
        </p>

        <div className="chip-row">
          {divisions.map((d) => (
            <span
              key={d.id}
              className={`chip chip-toggle ${activeDivisionId === d.id ? 'active' : ''}`}
              onClick={() => setActiveDivisionId(d.id)}
            >
              {d.skill} ({d.filled_count}/{d.quantity})
            </span>
          ))}
        </div>

        {activeDivision && activeDivision.filled_count >= activeDivision.quantity && (
          <p className="helper-text">
            This role is fully staffed — any remaining pending applicants were automatically declined.
          </p>
        )}

        {justMatched && (
          <div className="match-banner">
            <div style={{ fontSize: 30 }}>🎉 You're connected!</div>
            <p style={{ marginTop: 8 }}>
              You and <strong>{justMatched.name}</strong> can now chat in the Connect tab.
            </p>
            <button className="btn btn-outline" style={{ marginTop: 12, background: 'white' }} onClick={() => setJustMatched(null)}>
              Keep reviewing
            </button>
          </div>
        )}

        {!justMatched && (
          <>
            <button
              className="btn btn-outline btn-block"
              style={{ justifyContent: 'space-between' }}
              onClick={() => setShowFilters((s) => !s)}
            >
              <span>
                Filter applicants
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
                {activeFilterCount > 0 && (
                  <button type="button" className="btn btn-outline" onClick={() => setFilters(emptyFilters)}>
                    Clear filters
                  </button>
                )}
              </div>
            )}

            {applicants.length === 0 && <div className="empty-state">No pending applicants for this division yet.</div>}
            {applicants.length > 0 && filteredApplicants.length === 0 && (
              <div className="empty-state">No applicants match these filters.</div>
            )}

            <div className="stack">
              {filteredApplicants.map((app) => (
                <ApplicantCard
                  key={app.id}
                  app={app}
                  onPass={() => respond(app.id, app.freelancer_profiles, 'declined')}
                  onLike={() => respond(app.id, app.freelancer_profiles, 'accepted')}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <OrganizerTabbar />
    </div>
  )
}

function ApplicantCard({ app, onPass, onLike }) {
  const f = app.freelancer_profiles
  return (
    <div className="swipe-card">
      <PhotoFrame photoUrl={(f.photo_urls || [])[0]} gender={f.gender} dotCount={(f.photo_urls || []).length}>
        <div className="photo-scrim">
          <h2>{f.name}</h2>
          <p>
            📍 {(f.locations || []).join(', ')}
            {f.experience_band && ` · ${experienceBandLabel(f.experience_band)} experience`}
          </p>
        </div>
      </PhotoFrame>
      <div className="photo-card-body">
        {f.pitch && <p style={{ margin: 0, fontSize: 14 }}>{f.pitch}</p>}
        <div className="chip-row">
          {(f.skills || []).map((s) => (
            <span key={s} className="chip chip-outline">
              {s}
            </span>
          ))}
        </div>
        {f.rate_amount && (
          <p className="subtitle">
            Rate: Rp {Number(f.rate_amount).toLocaleString('id-ID')} / {f.rate_type}
          </p>
        )}
        {f.work_history && <p className="subtitle">{f.work_history}</p>}
      </div>
      <div className="swipe-actions" style={{ padding: '0 16px 16px' }}>
        <button className="btn btn-outline" onClick={onPass}>
          Decline
        </button>
        <button className="btn btn-primary" onClick={onLike}>
          Accept
        </button>
      </div>
    </div>
  )
}
