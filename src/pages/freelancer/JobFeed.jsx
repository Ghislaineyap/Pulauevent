import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { Topbar, FreelancerTabbar } from '../../components/Layout'
import { useAuth } from '../../context/AuthProvider'
import { formatEventDates } from '../../lib/date'

export default function JobFeed() {
  const { roleProfile } = useAuth()
  const [rawJobs, setRawJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  // Defaults to the freelancer's own saved locations — automatic, but still
  // adjustable: they can add more cities or narrow down from here.
  const [selectedLocations, setSelectedLocations] = useState(roleProfile?.locations || [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('job_postings')
        .select(
          'id, title, location, event_start_date, event_end_date, organizer_profiles(org_name, hide_name), job_divisions(id, skill, quantity, filled_count, open_recruit)'
        )
        .eq('status', 'open')
        .order('created_at', { ascending: false })
      if (error) console.error(error)
      // Only divisions the organizer has opened to public recruiting belong
      // in the feed — a team-invite-only division stays private. A job with
      // no recruiting divisions at all shouldn't appear here either.
      const recruiting = (data || [])
        .map((j) => ({ ...j, job_divisions: j.job_divisions.filter((d) => d.open_recruit) }))
        .filter((j) => j.job_divisions.length > 0)
      setRawJobs(recruiting)
      setLoading(false)
    }
    load()
  }, [])

  const locationOptions = useMemo(() => {
    const set = new Set(rawJobs.map((j) => j.location))
    return [...set].sort()
  }, [rawJobs])

  const jobs = useMemo(() => {
    if (selectedLocations.length === 0) return rawJobs
    return rawJobs.filter((j) => selectedLocations.includes(j.location))
  }, [rawJobs, selectedLocations])

  function toggleLocation(loc) {
    setSelectedLocations((locs) => (locs.includes(loc) ? locs.filter((l) => l !== loc) : [...locs, loc]))
  }

  return (
    <div className="app-shell">
      <Topbar title="Open jobs" />
      <div className="page">
        <button
          className="btn btn-outline btn-block"
          style={{ justifyContent: 'space-between' }}
          onClick={() => setShowFilters((s) => !s)}
        >
          <span>
            Location
            {selectedLocations.length > 0 && <span className="badge" style={{ marginLeft: 6 }}>{selectedLocations.length}</span>}
          </span>
          <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{showFilters ? '▴' : '▾'}</span>
        </button>

        {showFilters && (
          <div className="card stack">
            {locationOptions.length === 0 && <p className="subtitle">No open postings yet to filter by.</p>}
            <div className="chip-row">
              {locationOptions.map((loc) => (
                <span
                  key={loc}
                  className={`chip chip-toggle ${selectedLocations.includes(loc) ? 'active' : ''}`}
                  onClick={() => toggleLocation(loc)}
                >
                  {loc}
                </span>
              ))}
            </div>
            {selectedLocations.length > 0 && (
              <button type="button" className="btn btn-outline" onClick={() => setSelectedLocations([])}>
                Clear — show all locations
              </button>
            )}
          </div>
        )}

        {!showFilters && selectedLocations.length > 0 && (
          <p className="helper-text" style={{ margin: 0 }}>
            Pre-selected from your saved locations — tap Location to add more or clear it.
          </p>
        )}

        {loading && <p className="subtitle">Loading…</p>}
        {!loading && jobs.length === 0 && (
          <div className="empty-state">
            {selectedLocations.length > 0 ? 'No open postings in these locations yet.' : 'No open postings yet.'}
          </div>
        )}

        <div className="stack">
          {jobs.map((job) => {
            const openDivisions = job.job_divisions.filter((d) => d.filled_count < d.quantity)
            return (
              <Link key={job.id} to={`/freelancer/jobs/${job.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <h2>{job.title}</h2>
                <p className="subtitle">
                  {job.organizer_profiles.hide_name ? 'Event Organizer' : job.organizer_profiles.org_name} · 📍{' '}
                  {job.location} · {formatEventDates(job.event_start_date, job.event_end_date)}
                </p>
                <div className="chip-row" style={{ marginTop: 8 }}>
                  {openDivisions.length === 0 && <span className="chip chip-outline">Fully staffed</span>}
                  {openDivisions.map((d) => (
                    <span key={d.id} className="chip">
                      {d.skill} · {d.quantity - d.filled_count} spot{d.quantity - d.filled_count === 1 ? '' : 's'} left
                    </span>
                  ))}
                </div>
              </Link>
            )
          })}
        </div>
      </div>
      <FreelancerTabbar />
    </div>
  )
}
