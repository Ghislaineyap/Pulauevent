import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { formatEventDates } from '../../lib/date'
import { InfoButton } from '../../components/InfoButton'

const OTHER_SKILL = '__other__'
const OTHER_LOCATION = '__other__'

// Creating an event only asks for the basics — who you need and how many.
// Deciding WHO fills each spot (your own team, or the public) and what
// they're paid happens afterward, in My Event's "Manage event" — kept
// separate here on purpose, so Post stays about defining the posting and
// My Event stays about running it.
const emptyDivision = () => ({ skill: '', customSkill: '', quantity: 1 })
const emptyForm = () => ({ title: '', description: '', location: '', customLocation: '', locationDetail: '', eventStartDate: '', eventEndDate: '' })
const todayISO = () => new Date().toISOString().slice(0, 10)

// "Post" — where a job posting itself gets created and edited (name,
// details, location, dates, and the roles you need). Staffing, recruiting,
// the team chat, and ratings all live in My Event instead — kept apart so
// each tab tracks one thing.
export default function OrganizerDashboard() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  const [skillOptions, setSkillOptions] = useState([])
  const [locationOptions, setLocationOptions] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingJobId, setEditingJobId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [divisions, setDivisions] = useState([emptyDivision()])
  const [removedDivisionIds, setRemovedDivisionIds] = useState([])
  const [lockedDivisionIds, setLockedDivisionIds] = useState(new Set())
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('job_postings')
      .select(
        'id, title, description, location, location_detail, event_start_date, event_end_date, status, job_divisions(id, skill, quantity, filled_count, open_recruit)'
      )
      .eq('organizer_id', user.id)
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    setJobs(data || [])
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
    supabase
      .from('locations')
      .select('label')
      .order('sort_order')
      .then(({ data }) => setLocationOptions((data || []).map((l) => l.label)))
  }, [])

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
    setFormError('')
    setShowForm(true)
  }

  async function startEdit(job) {
    setEditingJobId(job.id)
    const knownLocation = job.location && locationOptions.includes(job.location)
    setForm({
      title: job.title,
      description: job.description || '',
      location: knownLocation ? job.location : OTHER_LOCATION,
      customLocation: knownLocation ? '' : job.location,
      locationDetail: job.location_detail || '',
      eventStartDate: job.event_start_date,
      eventEndDate: job.event_end_date,
    })
    setDivisions(
      job.job_divisions.map((d) => {
        const knownSkill = skillOptions.includes(d.skill)
        return {
          id: d.id,
          skill: knownSkill ? d.skill : OTHER_SKILL,
          customSkill: knownSkill ? '' : d.skill,
          quantity: d.quantity,
        }
      })
    )
    setRemovedDivisionIds([])
    setFormError('')

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
    setFormError('')
  }

  function divisionPayload(d) {
    return {
      skill: d.skill === OTHER_SKILL ? d.customSkill.trim() : d.skill,
      quantity: Number(d.quantity) || 1,
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    const resolvedLocation = form.location === OTHER_LOCATION ? form.customLocation.trim() : form.location
    if (!form.title.trim() || !resolvedLocation || !form.eventStartDate || !form.eventEndDate) {
      setFormError('Title, location, and start/end dates are required.')
      return
    }
    if (!editingJobId && form.eventStartDate < todayISO()) {
      setFormError("Start date can't be in the past.")
      return
    }
    if (form.eventEndDate < form.eventStartDate) {
      setFormError("End date can't be before the start date.")
      return
    }
    const cleanDivisions = divisions.filter((d) => (d.skill === OTHER_SKILL ? d.customSkill.trim() : d.skill))
    if (cleanDivisions.length === 0) {
      setFormError('Add at least one division (role you need to hire).')
      return
    }

    setBusy(true)

    const basePayload = {
      title: form.title.trim(),
      description: form.description.trim(),
      location: resolvedLocation,
      location_detail: form.locationDetail.trim() || null,
      event_start_date: form.eventStartDate,
      event_end_date: form.eventEndDate,
    }

    if (!editingJobId) {
      const { data: job, error: jobError } = await supabase
        .from('job_postings')
        .insert({ organizer_id: user.id, ...basePayload })
        .select()
        .single()

      if (jobError) {
        setFormError(jobError.message)
        setBusy(false)
        return
      }

      // New divisions always start private — the organizer opts a division
      // into public recruiting deliberately, from My Event's "Open recruit".
      const { error: divError } = await supabase
        .from('job_divisions')
        .insert(cleanDivisions.map((d) => ({ job_id: job.id, ...divisionPayload(d), open_recruit: false })))
      if (divError) {
        setFormError(divError.message)
        setBusy(false)
        return
      }
      setBusy(false)
    } else {
      const { error: jobError } = await supabase.from('job_postings').update(basePayload).eq('id', editingJobId)

      if (jobError) {
        setFormError(jobError.message)
        setBusy(false)
        return
      }

      const newDivisions = cleanDivisions.filter((d) => !d.id)
      const editedDivisions = cleanDivisions.filter((d) => d.id && !lockedDivisionIds.has(d.id))

      if (newDivisions.length > 0) {
        const { error: insError } = await supabase
          .from('job_divisions')
          .insert(newDivisions.map((d) => ({ job_id: editingJobId, ...divisionPayload(d), open_recruit: false })))
        if (insError) {
          setFormError(insError.message)
          setBusy(false)
          return
        }
      }

      for (const d of editedDivisions) {
        // Only skill/quantity are touched here — budget, fee, and open-recruit
        // are all managed from My Event, so saving this form never overwrites them.
        const { error: updError } = await supabase.from('job_divisions').update(divisionPayload(d)).eq('id', d.id)
        if (updError) {
          setFormError(updError.message)
          setBusy(false)
          return
        }
      }

      const removableIds = removedDivisionIds.filter((id) => !lockedDivisionIds.has(id))
      if (removableIds.length > 0) {
        const { error: delError } = await supabase.from('job_divisions').delete().in('id', removableIds)
        if (delError) {
          setFormError(delError.message)
          setBusy(false)
          return
        }
      }
      setBusy(false)
    }

    cancelForm()
    load()
  }

  return (
    <div className="app-shell">
      <Topbar title="Post" />
      <div className="page">
        {showForm ? (
          <form className="card stack" onSubmit={handleSubmit}>
            <h2>{editingJobId ? 'Edit posting' : 'New posting'}</h2>
            <div className="field">
              <label htmlFor="title">Event name</label>
              <input id="title" type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="desc">Details</label>
              <textarea id="desc" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="loc">Location</label>
              <select id="loc" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}>
                <option value="">Select location…</option>
                {locationOptions.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
                <option value={OTHER_LOCATION}>Other (type your own)</option>
              </select>
              {form.location === OTHER_LOCATION && (
                <input
                  style={{ marginTop: 8 }}
                  type="text"
                  placeholder="Type the city/area"
                  value={form.customLocation}
                  onChange={(e) => setForm((f) => ({ ...f, customLocation: e.target.value }))}
                />
              )}
            </div>
            <div className="field">
              <label htmlFor="locDetail">Detailed location (optional)</label>
              <input
                id="locDetail"
                type="text"
                placeholder="Venue name, street address…"
                value={form.locationDetail}
                onChange={(e) => setForm((f) => ({ ...f, locationDetail: e.target.value }))}
              />
            </div>
            <div className="row">
              <div className="field" style={{ flex: 1 }}>
                <label htmlFor="startDate">Start date</label>
                <input
                  id="startDate"
                  type="date"
                  min={editingJobId ? undefined : todayISO()}
                  value={form.eventStartDate}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      eventStartDate: e.target.value,
                      eventEndDate: f.eventEndDate && f.eventEndDate < e.target.value ? e.target.value : f.eventEndDate,
                    }))
                  }
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label style={{ display: 'flex', alignItems: 'center' }} htmlFor="endDate">
                  End date
                  <InfoButton title="Multi-day events">Just set an end date later than the start date.</InfoButton>
                </label>
                <input
                  id="endDate"
                  type="date"
                  min={form.eventStartDate || undefined}
                  value={form.eventEndDate}
                  onChange={(e) => setForm((f) => ({ ...f, eventEndDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center' }}>
                Divisions — who do you need, and how many?
                <InfoButton title="Divisions">
                  Just the role and headcount for now. Once you save, go to My Event and use "Select team" and "Open
                  recruit" on each division to decide who fills the spots and what they'll be paid.
                </InfoButton>
              </label>
              <div className="stack">
                {divisions.map((d, i) => {
                  const locked = Boolean(d.id) && lockedDivisionIds.has(d.id)
                  return (
                    <div key={d.id || `new-${i}`} className="card" style={{ padding: 12, opacity: locked ? 0.6 : 1 }}>
                      {locked && (
                        <p className="helper-text" style={{ marginTop: 0 }}>
                          Already has applicants — can't be edited or removed here.
                        </p>
                      )}
                      <div className="row">
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
                          <option value={OTHER_SKILL}>Other (type your own)</option>
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
                        {divisions.length > 1 && !locked && (
                          <button type="button" className="btn btn-outline" onClick={() => removeDivisionAt(i)}>
                            ✕
                          </button>
                        )}
                      </div>
                      {d.skill === OTHER_SKILL && (
                        <input
                          style={{ marginTop: 8 }}
                          type="text"
                          placeholder="Type the role you need"
                          value={d.customSkill}
                          disabled={locked}
                          onChange={(e) => updateDivision(i, { customSkill: e.target.value })}
                        />
                      )}
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

            {formError && <p className="error-text">{formError}</p>}
            <div className="row">
              <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={cancelForm}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
                {busy ? 'Saving…' : editingJobId ? 'Save changes' : 'Post job'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <button className="btn btn-primary btn-block" onClick={startCreate}>
              + Post a new job
            </button>

            {loading && <p className="subtitle">Loading your postings…</p>}
            {!loading && jobs.length === 0 && <div className="empty-state">You haven't posted any jobs yet.</div>}

            <div className="stack">
              {jobs.map((job) => (
                <div key={job.id} className="card">
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <h2 style={{ margin: 0 }}>{job.title}</h2>
                      <p className="subtitle">
                        📍 {job.location}
                        {job.location_detail && ` — ${job.location_detail}`} · {formatEventDates(job.event_start_date, job.event_end_date)}
                      </p>
                    </div>
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
                  <div className="chip-row" style={{ marginTop: 10 }}>
                    {job.job_divisions.map((d) => (
                      <span key={d.id} className={`chip ${d.open_recruit ? '' : 'chip-outline'}`}>
                        {d.skill} {d.filled_count}/{d.quantity}
                        {!d.open_recruit && ' · Private'}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <OrganizerTabbar />
    </div>
  )
}
