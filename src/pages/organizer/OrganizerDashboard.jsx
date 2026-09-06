import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { formatEventDates } from '../../lib/date'

// "Post" — a read-only board of whatever's currently open to public
// recruiting (set from My Event → Manage event → Recruiting). Private
// divisions never appear here at all. Tapping a division goes straight to
// its applicants; a badge shows up the moment someone applies.
export default function OrganizerDashboard() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: jobRows, error } = await supabase
      .from('job_postings')
      .select(
        'id, title, location, event_start_date, event_end_date, job_divisions(id, skill, quantity, filled_count, open_recruit)'
      )
      .eq('organizer_id', user.id)
      .order('created_at', { ascending: false })
    if (error) console.error(error)

    const openJobs = (jobRows || [])
      .map((j) => ({ ...j, job_divisions: j.job_divisions.filter((d) => d.open_recruit) }))
      .filter((j) => j.job_divisions.length > 0)

    const divisionIds = openJobs.flatMap((j) => j.job_divisions.map((d) => d.id))
    const pendingByDivision = new Map()
    if (divisionIds.length > 0) {
      const { data: apps, error: appsError } = await supabase
        .from('applications')
        .select('division_id')
        .in('division_id', divisionIds)
        .eq('status', 'pending')
      if (appsError) console.error(appsError)
      ;(apps || []).forEach((a) => {
        pendingByDivision.set(a.division_id, (pendingByDivision.get(a.division_id) || 0) + 1)
      })
    }

    setJobs(
      openJobs.map((j) => ({
        ...j,
        job_divisions: j.job_divisions.map((d) => ({ ...d, pendingCount: pendingByDivision.get(d.id) || 0 })),
      }))
    )
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  const totalPending = jobs.reduce((n, j) => n + j.job_divisions.reduce((m, d) => m + d.pendingCount, 0), 0)

  return (
    <div className="app-shell">
      <Topbar title="Post" />
      <div className="page">
        <p className="subtitle" style={{ margin: 0 }}>
          Every division you've opened to public recruiting, in one place. Tap one to review whoever's applied.
        </p>

        {loading && <p className="subtitle">Loading…</p>}
        {!loading && jobs.length === 0 && (
          <div className="empty-state">
            Nothing open right now — turn on "Recruiting" for a role from My Event → Manage event when you want it to
            show up here.
          </div>
        )}

        <div className="stack">
          {jobs.map((job) => (
            <div key={job.id} className="card stack">
              <div>
                <h2 style={{ margin: 0 }}>{job.title}</h2>
                <p className="subtitle" style={{ margin: '4px 0 0' }}>
                  📍 {job.location} · {formatEventDates(job.event_start_date, job.event_end_date)}
                </p>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {job.job_divisions.map((d) => (
                  <Link
                    key={d.id}
                    to={`/organizer/jobs/${job.id}/applicants`}
                    className="row"
                    style={{ justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}
                  >
                    <div>
                      <strong>{d.skill}</strong>
                      <p className="subtitle" style={{ margin: '2px 0 0' }}>
                        {d.filled_count}/{d.quantity} filled · Open recruit
                      </p>
                    </div>
                    <span className="row" style={{ gap: 6, alignItems: 'center' }}>
                      {d.pendingCount > 0 && <span className="badge">{d.pendingCount}</span>}
                      <span className="chip chip-outline">Manage applicants →</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <OrganizerTabbar pendingCount={totalPending} />
    </div>
  )
}
