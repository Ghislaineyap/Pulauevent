import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'

const emptyDivision = () => ({ skill: '', quantity: 1, budgetAmount: '', budgetType: 'flat' })

export default function OrganizerDashboard() {
  const { user } = useAuth()
  const [skillOptions, setSkillOptions] = useState([])
  const [postings, setPostings] = useState([])
  const [loadingPostings, setLoadingPostings] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', location: '', eventDate: '' })
  const [divisions, setDivisions] = useState([emptyDivision()])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase
      .from('skills')
      .select('label')
      .order('sort_order')
      .then(({ data }) => setSkillOptions((data || []).map((s) => s.label)))
  }, [])

  async function loadPostings() {
    setLoadingPostings(true)
    const { data, error } = await supabase
      .from('job_postings')
      .select('id, title, location, event_date, status, job_divisions(id, skill, quantity, filled_count)')
      .eq('organizer_id', user.id)
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    setPostings(data || [])
    setLoadingPostings(false)
  }

  useEffect(() => {
    loadPostings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  function updateDivision(i, patch) {
    setDivisions((ds) => ds.map((d, idx) => (idx === i ? { ...d, ...patch } : d)))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.title.trim() || !form.location.trim() || !form.eventDate) {
      setError('Title, location and event date are required.')
      return
    }
    const cleanDivisions = divisions.filter((d) => d.skill)
    if (cleanDivisions.length === 0) {
      setError('Add at least one division (role you need to hire).')
      return
    }

    setBusy(true)
    const { data: job, error: jobError } = await supabase
      .from('job_postings')
      .insert({
        organizer_id: user.id,
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        event_date: form.eventDate,
      })
      .select()
      .single()

    if (jobError) {
      setError(jobError.message)
      setBusy(false)
      return
    }

    const { error: divError } = await supabase.from('job_divisions').insert(
      cleanDivisions.map((d) => ({
        job_id: job.id,
        skill: d.skill,
        quantity: Number(d.quantity) || 1,
        budget_amount: d.budgetAmount ? Number(d.budgetAmount) : null,
        budget_type: d.budgetType,
      }))
    )
    setBusy(false)
    if (divError) {
      setError(divError.message)
      return
    }

    setForm({ title: '', description: '', location: '', eventDate: '' })
    setDivisions([emptyDivision()])
    setShowForm(false)
    loadPostings()
  }

  return (
    <div className="app-shell">
      <Topbar title="Your postings" />
      <div className="page">
        {!showForm && (
          <button className="btn btn-primary btn-block" onClick={() => setShowForm(true)}>
            + Post a new job
          </button>
        )}

        {showForm && (
          <form className="card stack" onSubmit={handleSubmit}>
            <h2>New job posting</h2>
            <div className="field">
              <label htmlFor="title">Event / job title</label>
              <input id="title" type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="desc">Details</label>
              <textarea id="desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="loc">Location</label>
                <input id="loc" type="text" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="date">Event date</label>
                <input id="date" type="date" value={form.eventDate} onChange={(e) => setForm((f) => ({ ...f, eventDate: e.target.value }))} />
              </div>
            </div>

            <div className="field">
              <label>Divisions — who do you need, and how many?</label>
              <div className="stack">
                {divisions.map((d, i) => (
                  <div key={i} className="card" style={{ padding: 12 }}>
                    <div className="row" style={{ marginBottom: 8 }}>
                      <select style={{ flex: 2 }} value={d.skill} onChange={(e) => updateDivision(i, { skill: e.target.value })}>
                        <option value="">Select role…</option>
                        {skillOptions.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <input
                        style={{ flex: 1 }}
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={d.quantity}
                        onChange={(e) => updateDivision(i, { quantity: e.target.value })}
                      />
                    </div>
                    <div className="row">
                      <input
                        style={{ flex: 1 }}
                        type="number"
                        min="0"
                        placeholder="Budget (IDR)"
                        value={d.budgetAmount}
                        onChange={(e) => updateDivision(i, { budgetAmount: e.target.value })}
                      />
                      <select style={{ flex: 1 }} value={d.budgetType} onChange={(e) => updateDivision(i, { budgetType: e.target.value })}>
                        <option value="flat">flat total</option>
                        <option value="hourly">per hour</option>
                        <option value="daily">per day</option>
                      </select>
                      {divisions.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => setDivisions((ds) => ds.filter((_, idx) => idx !== i))}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-outline"
                style={{ marginTop: 8 }}
                onClick={() => setDivisions((ds) => [...ds, emptyDivision()])}
              >
                + Add another division
              </button>
            </div>

            {error && <p className="error-text">{error}</p>}
            <div className="row">
              <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
                {busy ? 'Posting…' : 'Post job'}
              </button>
            </div>
          </form>
        )}

        <div className="stack">
          {loadingPostings && <p className="subtitle">Loading your postings…</p>}
          {!loadingPostings && postings.length === 0 && (
            <div className="empty-state">You haven't posted any jobs yet.</div>
          )}
          {postings.map((job) => (
            <Link key={job.id} to={`/organizer/jobs/${job.id}/applicants`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2>{job.title}</h2>
                  <p className="subtitle">
                    {job.location} · {job.event_date}
                  </p>
                </div>
                <span className="chip chip-outline">{job.status}</span>
              </div>
              <div className="chip-row" style={{ marginTop: 10 }}>
                {job.job_divisions.map((d) => (
                  <span key={d.id} className="chip">
                    {d.skill} {d.filled_count}/{d.quantity}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </div>
      <OrganizerTabbar />
    </div>
  )
}
