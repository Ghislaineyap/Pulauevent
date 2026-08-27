import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { formatEventDates } from '../../lib/date'

const emptyDivision = () => ({ skill: '', quantity: 1, budgetAmount: '', budgetType: 'flat' })
const emptyForm = () => ({ title: '', description: '', location: '', eventStartDate: '', eventEndDate: '' })

export default function OrganizerDashboard() {
  const { user } = useAuth()
  const [skillOptions, setSkillOptions] = useState([])
  const [postings, setPostings] = useState([])
  const [loadingPostings, setLoadingPostings] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingJobId, setEditingJobId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [divisions, setDivisions] = useState([emptyDivision()])
  const [removedDivisionIds, setRemovedDivisionIds] = useState([])
  const [lockedDivisionIds, setLockedDivisionIds] = useState(new Set())
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
      .select(
        'id, title, description, location, event_start_date, event_end_date, status, job_divisions(id, skill, quantity, filled_count, budget_amount, budget_type)'
      )
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

  function removeDivisionAt(i) {
    const target = divisions[i]
    if (target.id) setRemovedDivisionIds((ids) => [...ids, target.id])
    setDivisions((ds) => ds.filter((_, idx) => idx !== i))
  }

  function startCreate() {
    setEditingJobId(null)
    setForm(emptyForm())
    setDivisions([emptyDivision()])
    setRemovedDivisionIds([])
    setLockedDivisionIds(new Set())
    setError('')
    setShowForm(true)
  }

  async function startEdit(job) {
    setEditingJobId(job.id)
    setForm({
      title: job.title,
      description: job.description || '',
      location: job.location,
      eventStartDate: job.event_start_date,
      eventEndDate: job.event_end_date,
    })
    setDivisions(
      job.job_divisions.map((d) => ({
        id: d.id,
        skill: d.skill,
        quantity: d.quantity,
        budgetAmount: d.budget_amount != null ? String(d.budget_amount) : '',
        budgetType: d.budget_type,
      }))
    )
    setRemovedDivisionIds([])
    setError('')

    const divisionIds = job.job_divisions.map((d) => d.id)
    if (divisionIds.length > 0) {
      const { data: apps, error: appsError } = await supabase
        .from('applications')
        .select('division_id')
        .in('division_id', divisionIds)
      if (appsError) console.error(appsError)
      setLockedDivisionIds(new Set((apps || []).map((a) => a.division_id)))
    } else {
      setLockedDivisionIds(new Set())
    }
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingJobId(null)
    setForm(emptyForm())
    setDivisions([emptyDivision()])
    setRemovedDivisionIds([])
    setLockedDivisionIds(new Set())
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.title.trim() || !form.location.trim() || !form.eventStartDate || !form.eventEndDate) {
      setError('Title, location, and start/end dates are required.')
      return
    }
    if (form.eventEndDate < form.eventStartDate) {
      setError('End date can\'t be before the start date.')
      return
    }
    const cleanDivisions = divisions.filter((d) => d.skill)
    if (cleanDivisions.length === 0) {
      setError('Add at least one division (role you need to hire).')
      return
    }

    setBusy(true)

    if (!editingJobId) {
      // Create a new posting.
      const { data: job, error: jobError } = await supabase
        .from('job_postings')
        .insert({
          organizer_id: user.id,
          title: form.title.trim(),
          description: form.description.trim(),
          location: form.location.trim(),
          event_start_date: form.eventStartDate,
          event_end_date: form.eventEndDate,
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
    } else {
      // Update an existing posting's top-level details.
      const { error: jobError } = await supabase
        .from('job_postings')
        .update({
          title: form.title.trim(),
          description: form.description.trim(),
          location: form.location.trim(),
          event_start_date: form.eventStartDate,
          event_end_date: form.eventEndDate,
        })
        .eq('id', editingJobId)

      if (jobError) {
        setError(jobError.message)
        setBusy(false)
        return
      }

      // Divisions that already have applicants are locked in the UI, so any
      // edit here is either a brand-new division (no id yet) or an
      // unlocked existing one — safe to write straight through.
      const newDivisions = cleanDivisions.filter((d) => !d.id)
      const editedDivisions = cleanDivisions.filter((d) => d.id && !lockedDivisionIds.has(d.id))

      if (newDivisions.length > 0) {
        const { error: insError } = await supabase.from('job_divisions').insert(
          newDivisions.map((d) => ({
            job_id: editingJobId,
            skill: d.skill,
            quantity: Number(d.quantity) || 1,
            budget_amount: d.budgetAmount ? Number(d.budgetAmount) : null,
            budget_type: d.budgetType,
          }))
        )
        if (insError) {
          setError(insError.message)
          setBusy(false)
          return
        }
      }

      for (const d of editedDivisions) {
        const { error: updError } = await supabase
          .from('job_divisions')
          .update({
            skill: d.skill,
            quantity: Number(d.quantity) || 1,
            budget_amount: d.budgetAmount ? Number(d.budgetAmount) : null,
            budget_type: d.budgetType,
          })
          .eq('id', d.id)
        if (updError) {
          setError(updError.message)
          setBusy(false)
          return
        }
      }

      const removableIds = removedDivisionIds.filter((id) => !lockedDivisionIds.has(id))
      if (removableIds.length > 0) {
        const { error: delError } = await supabase.from('job_divisions').delete().in('id', removableIds)
        if (delError) {
          setError(delError.message)
          setBusy(false)
          return
        }
      }
      setBusy(false)
    }

    cancelForm()
    loadPostings()
  }

  return (
    <div className="app-shell">
      <Topbar title="Your posts" />
      <div className="page">
        {!showForm && (
          <button className="btn btn-primary btn-block" onClick={startCreate}>
            + Post a new job
          </button>
        )}

        {showForm && (
          <form className="card stack" onSubmit={handleSubmit}>
            <h2>{editingJobId ? 'Edit job posting' : 'New job posting'}</h2>
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
            </div>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="startDate">Start date</label>
                <input
                  id="startDate"
                  type="date"
                  value={form.eventStartDate}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      eventStartDate: e.target.value,
                      // keep the range valid as the user picks — bump end date forward with it
                      eventEndDate: f.eventEndDate && f.eventEndDate < e.target.value ? e.target.value : f.eventEndDate,
                    }))
                  }
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="endDate">End date</label>
                <input
                  id="endDate"
                  type="date"
                  min={form.eventStartDate || undefined}
                  value={form.eventEndDate}
                  onChange={(e) => setForm((f) => ({ ...f, eventEndDate: e.target.value }))}
                />
              </div>
            </div>
            <p className="helper-text" style={{ marginTop: -8 }}>
              Multi-day event? Just set an end date later than the start date.
            </p>

            <div className="field">
              <label>Divisions — who do you need, and how many?</label>
              <div className="stack">
                {divisions.map((d, i) => {
                  const locked = Boolean(d.id) && lockedDivisionIds.has(d.id)
                  return (
                    <div key={d.id || `new-${i}`} className="card" style={{ padding: 12, opacity: locked ? 0.6 : 1 }}>
                      {locked && (
                        <p className="helper-text" style={{ marginTop: 0 }}>
                          Already has applicants — can't be edited or removed.
                        </p>
                      )}
                      <div className="row" style={{ marginBottom: 8 }}>
                        <select
                          style={{ flex: 2 }}
                          value={d.skill}
                          disabled={locked}
                          onChange={(e) => updateDivision(i, { skill: e.target.value })}
                        >
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
                          disabled={locked}
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
                          disabled={locked}
                          onChange={(e) => updateDivision(i, { budgetAmount: e.target.value })}
                        />
                        <select
                          style={{ flex: 1 }}
                          value={d.budgetType}
                          disabled={locked}
                          onChange={(e) => updateDivision(i, { budgetType: e.target.value })}
                        >
                          <option value="flat">flat total</option>
                          <option value="hourly">per hour</option>
                          <option value="daily">per day</option>
                        </select>
                        {divisions.length > 1 && !locked && (
                          <button type="button" className="btn btn-outline" onClick={() => removeDivisionAt(i)}>
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
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
              <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={cancelForm}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
                {busy ? 'Saving…' : editingJobId ? 'Save changes' : 'Post job'}
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
            <div key={job.id} className="card">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Link to={`/organizer/jobs/${job.id}/applicants`} style={{ textDecoration: 'none', color: 'inherit', flex: 1 }}>
                  <h2>{job.title}</h2>
                  <p className="subtitle">
                    {job.location} · {formatEventDates(job.event_start_date, job.event_end_date)}
                  </p>
                </Link>
                <div className="stack" style={{ alignItems: 'flex-end', gap: 6, width: 'auto' }}>
                  <span className="chip chip-outline">{job.status}</span>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ padding: '4px 10px', fontSize: 12 }}
                    onClick={() => startEdit(job)}
                  >
                    Edit
                  </button>
                </div>
              </div>
              <Link to={`/organizer/jobs/${job.id}/applicants`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="chip-row" style={{ marginTop: 10 }}>
                  {job.job_divisions.map((d) => (
                    <span key={d.id} className="chip">
                      {d.skill} {d.filled_count}/{d.quantity}
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
