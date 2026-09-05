import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { formatEventDates } from '../../lib/date'

// "Post" — the Job Board. A read-only status view of what you've posted and
// what's actually public right now (an "Open recruit" division shows up in
// freelancers' Job Feed; a "Private" one only fills via a direct team
// invite). Creating and editing a posting happens in My Event — this tab is
// just for checking what's live at a glance, without a form taking over
// the screen.
export default function OrganizerDashboard() {
  const { user } = useAuth()
  const [postings, setPostings] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('job_postings')
        .select(
          'id, title, location, event_start_date, event_end_date, status, job_divisions(id, skill, quantity, filled_count, open_recruit)'
        )
        .eq('organizer_id', user.id)
        .order('created_at', { ascending: false })
      if (error) console.error(error)
      setPostings(data || [])
      setLoading(false)
    }
    load()
  }, [user.id])

  return (
    <div className="app-shell">
      <Topbar title="Job Board" />
      <div className="page">
        <Link to="/organizer/my-events?new=1" className="btn btn-primary btn-block" style={{ textDecoration: 'none' }}>
          + Post a new job
        </Link>

        <div className="stack">
          {loading && <p className="subtitle">Loading your postings…</p>}
          {!loading && postings.length === 0 && <div className="empty-state">You haven't posted any jobs yet.</div>}
          {postings.map((job) => (
            <div key={job.id} className="card">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: 0 }}>{job.title}</h2>
                  <p className="subtitle">
                    {job.location} · {formatEventDates(job.event_start_date, job.event_end_date)}
                  </p>
                </div>
                <div className="stack" style={{ alignItems: 'flex-end', gap: 6, width: 'auto' }}>
                  <span className="chip chip-outline">{job.status}</span>
                  <Link
                    to={`/organizer/my-events?edit=${job.id}`}
                    className="btn btn-outline"
                    style={{ padding: '4px 10px', fontSize: 12, textDecoration: 'none' }}
                  >
                    Edit
                  </Link>
                </div>
              </div>
              <Link to={`/organizer/jobs/${job.id}/applicants`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="chip-row" style={{ marginTop: 10 }}>
                  {job.job_divisions.map((d) => (
                    <span key={d.id} className={`chip ${d.open_recruit ? '' : 'chip-outline'}`}>
                      {d.skill} {d.filled_count}/{d.quantity}{!d.open_recruit && ' · Private'}
                    </span>
                  ))}
                </div>
              </Link>
            </div>
          ))}
        </div>
      </div>
      <OrganizerTabbar />
    </div>
  )
}
