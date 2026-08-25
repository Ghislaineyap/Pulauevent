import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, FreelancerTabbar } from '../../components/Layout'

export default function JobDetail() {
  const { jobId } = useParams()
  const { user } = useAuth()
  const [job, setJob] = useState(null)
  const [myApplications, setMyApplications] = useState([]) // division_ids I've applied to
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('job_postings')
      .select(
        'id, title, description, location, event_date, organizer_profiles(org_name, hide_name), job_divisions(id, skill, quantity, filled_count, budget_amount, budget_type)'
      )
      .eq('id', jobId)
      .single()
    if (error) console.error(error)
    setJob(data)

    const { data: apps } = await supabase.from('applications').select('division_id, status').eq('freelancer_id', user.id)
    setMyApplications(apps || [])
    setLoading(false)
  }, [jobId, user.id])

  useEffect(() => {
    load()
  }, [load])

  async function apply(divisionId) {
    setApplying(divisionId)
    setError('')
    const { error } = await supabase.from('applications').insert({ division_id: divisionId, freelancer_id: user.id })
    setApplying(null)
    if (error) {
      setError(error.message)
      return
    }
    load()
  }

  if (loading) return <div className="center-page">Loading…</div>
  if (!job) return <div className="center-page">Job not found.</div>

  return (
    <div className="app-shell">
      <Topbar title="Job details" />
      <div className="page">
        <Link to="/freelancer/jobs" className="subtitle">
          ← Back to jobs
        </Link>

        <div className="card stack">
          <h1>{job.title}</h1>
          <p className="subtitle">
            {job.organizer_profiles.hide_name ? 'Event Organizer' : job.organizer_profiles.org_name} · 📍 {job.location} ·{' '}
            {job.event_date}
          </p>
          {job.description && <p>{job.description}</p>}
        </div>

        <h2>Divisions</h2>
        <div className="stack">
          {job.job_divisions.map((d) => {
            const mine = myApplications.find((a) => a.division_id === d.id)
            const full = d.filled_count >= d.quantity
            return (
              <div key={d.id} className="division-row">
                <div>
                  <strong>{d.skill}</strong>
                  <p className="subtitle" style={{ margin: '4px 0 0' }}>
                    {d.filled_count}/{d.quantity} filled
                    {d.budget_amount && ` · Rp ${Number(d.budget_amount).toLocaleString('id-ID')} ${d.budget_type === 'flat' ? 'flat' : `/ ${d.budget_type}`}`}
                  </p>
                </div>
                {mine ? (
                  <span className="chip chip-outline">{mine.status === 'pending' ? 'Applied' : mine.status}</span>
                ) : full ? (
                  <span className="chip chip-outline">Full</span>
                ) : (
                  <button className="btn btn-primary" disabled={applying === d.id} onClick={() => apply(d.id)}>
                    {applying === d.id ? 'Applying…' : 'Apply'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {error && <p className="error-text">{error}</p>}
      </div>
      <FreelancerTabbar />
    </div>
  )
}
