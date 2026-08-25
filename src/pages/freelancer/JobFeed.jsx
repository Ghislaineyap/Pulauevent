import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { Topbar, FreelancerTabbar } from '../../components/Layout'
import { useAuth } from '../../context/AuthProvider'

export default function JobFeed() {
  const { roleProfile } = useAuth()
  const [jobs, setJobs] = useState([])
  const [locationFilter, setLocationFilter] = useState(roleProfile?.location || '')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      let query = supabase
        .from('job_postings')
        .select('id, title, location, event_date, organizer_profiles(org_name, hide_name), job_divisions(id, skill, quantity, filled_count)')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
      if (locationFilter.trim()) query = query.ilike('location', `%${locationFilter.trim()}%`)
      const { data, error } = await query
      if (error) console.error(error)
      setJobs(data || [])
      setLoading(false)
    }
    load()
  }, [locationFilter])

  return (
    <div className="app-shell">
      <Topbar title="Open jobs" />
      <div className="page">
        <input
          type="text"
          placeholder="Filter by location…"
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
        />

        {loading && <p className="subtitle">Loading…</p>}
        {!loading && jobs.length === 0 && <div className="empty-state">No open postings match that location yet.</div>}

        <div className="stack">
          {jobs.map((job) => {
            const openDivisions = job.job_divisions.filter((d) => d.filled_count < d.quantity)
            return (
              <Link key={job.id} to={`/freelancer/jobs/${job.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <h2>{job.title}</h2>
                <p className="subtitle">
                  {job.organizer_profiles.hide_name ? 'Event Organizer' : job.organizer_profiles.org_name} · 📍{' '}
                  {job.location} · {job.event_date}
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
