import { useEffect, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { formatEventDates } from '../../lib/date'
import { EventCalendar } from '../../components/EventCalendar'
import { Switch } from '../../components/Switch'
import { InfoButton } from '../../components/InfoButton'
import { Modal } from '../../components/Modal'

const OTHER_SKILL = '__other__'
const OTHER_LOCATION = '__other__'

// Creating an event only asks for the basics — who you need and how many.
// Deciding WHO fills each spot (your own team, or the public) happens
// afterward, per division, from the event's card — see "Select team" and
// "Open recruit" below.
const emptyDivision = () => ({ skill: '', customSkill: '', quantity: 1 })
const emptyForm = () => ({ title: '', description: '', location: '', customLocation: '', locationDetail: '', eventStartDate: '', eventEndDate: '' })
const todayISO = () => new Date().toISOString().slice(0, 10)

// "My Event" — everything about an organizer's own events lives here now:
// creating/editing a posting, assigning team members, opening recruiting,
// staffing status, the team chat, and post-event ratings. The Post tab is
// gone — it only ever duplicated what's here.
export default function MyEvents() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [jobs, setJobs] = useState([])
  const [ratedKeys, setRatedKeys] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list') // 'list' | 'calendar'

  const [skillOptions, setSkillOptions] = useState([])
  const [locationOptions, setLocationOptions] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingJobId, setEditingJobId] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [divisions, setDivisions] = useState([emptyDivision()])
  const [removedDivisionIds, setRemovedDivisionIds] = useState([])
  const [lockedDivisionIds, setLockedDivisionIds] = useState(new Set())
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  const [teamModal, setTeamModal] = useState(null) // { jobId, divisionId }
  const [recruitModal, setRecruitModal] = useState(null) // { jobId, divisionId }

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: jobRows, error: jobsError }, { data: myRatings }] = await Promise.all([
      supabase
        .from('job_postings')
        .select(
          'id, title, description, location, location_detail, event_start_date, event_end_date, status, chat_opened_at, job_divisions(id, skill, quantity, filled_count, budget_amount, budget_type, fee_type, transport_max_amount, open_recruit)'
        )
        .eq('organizer_id', user.id)
        .order('created_at', { ascending: false }),
      supabase.from('ratings').select('job_id, freelancer_id').eq('organizer_id', user.id),
    ])
    if (jobsError) console.error(jobsError)
    setRatedKeys(new Set((myRatings || []).map((r) => `${r.job_id}:${r.freelancer_id}`)))

    const divisionIds = (jobRows || []).flatMap((j) => j.job_divisions.map((d) => d.id))
    const teamByDivision = new Map()
    const confirmedByJob = new Map()
    const pendingCountByJob = new Map()
    if (divisionIds.length > 0) {
      const { data: apps, error: appsError } = await supabase
        .from('applications')
        .select('id, status, division_id, job_divisions(job_id), freelancer_profiles(id, name)')
        .in('division_id', divisionIds)
        .in('status', ['accepted', 'invited', 'pending'])
      if (appsError) console.error(appsError)
      ;(apps || []).forEach((a) => {
        const jobId = a.job_divisions.job_id
        if (a.status === 'pending') {
          pendingCountByJob.set(jobId, (pendingCountByJob.get(jobId) || 0) + 1)
          return
        }
        const entry = teamByDivision.get(a.division_id) || { accepted: [], invited: [] }
        const person = { appId: a.id, freelancerId: a.freelancer_profiles.id, name: a.freelancer_profiles.name }
        if (a.status === 'accepted') {
          entry.accepted.push(person)
          const confirmed = confirmedByJob.get(jobId) || []
          if (!confirmed.some((p) => p.id === person.freelancerId)) confirmed.push({ id: person.freelancerId, name: person.name })
          confirmedByJob.set(jobId, confirmed)
        } else {
          entry.invited.push(person)
        }
        teamByDivision.set(a.division_id, entry)
      })
    }

    setJobs(
      (jobRows || []).map((j) => ({
        ...j,
        job_divisions: j.job_divisions.map((d) => ({ ...d, team: teamByDivision.get(d.id) || { accepted: [], invited: [] } })),
        confirmedTeam: confirmedByJob.get(j.id) || [],
        pendingApplicantCount: pendingCountByJob.get(j.id) || 0,
      }))
    )
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
    supabase
      .from('team_members')
      .select('freelancer_id, freelancer_profiles(id, name, skills)')
      .eq('organizer_id', user.id)
      .then(({ data, error: teamError }) => {
        if (teamError) console.error(teamError)
        setTeamMembers((data || []).map((t) => t.freelancer_profiles).filter(Boolean))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Deep-linked from an old Post bookmark or link: ?new=1 opens a blank
  // form, ?edit=<jobId> opens that job pre-filled — cleared from the URL
  // right after so a refresh doesn't re-trigger it.
  useEffect(() => {
    if (jobs.length === 0) return
    const editId = searchParams.get('edit')
    const isNew = searchParams.get('new')
    if (editId) {
      const job = jobs.find((j) => j.id === editId)
      if (job) startEdit(job)
      setSearchParams({}, { replace: true })
    } else if (isNew) {
      startCreate()
      setSearchParams({}, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs])

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
      // into public recruiting deliberately, from its "Open recruit" button.
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
        // are all managed separately now (see "Open recruit"), so saving this
        // form never overwrites them.
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

  // Event chat is a plain on/off now — flip it back off any time (e.g. a
  // last-minute cancellation) rather than a one-way "start" button.
  async function toggleEventChat(jobId, nextOpen) {
    const { error } = await supabase
      .from('job_postings')
      .update({ chat_opened_at: nextOpen ? new Date().toISOString() : null })
      .eq('id', jobId)
    if (error) {
      console.error(error)
      return
    }
    setJobs((js) => js.map((j) => (j.id === jobId ? { ...j, chat_opened_at: nextOpen ? new Date().toISOString() : null } : j)))
  }

  // Adding someone from your team roster into a division. Upsert (not plain
  // insert) so re-inviting someone who was previously cancelled/withdrawn
  // from this same division works instead of hitting the unique constraint.
  async function addToTeam(freelancerId, divisionId) {
    const { error } = await supabase
      .from('applications')
      .upsert(
        { division_id: divisionId, freelancer_id: freelancerId, status: 'invited', source: 'invited' },
        { onConflict: 'division_id,freelancer_id' }
      )
    if (error) {
      console.error(error)
      return
    }
    load()
  }

  // Removing a confirmed team member frees their slot automatically (a
  // database trigger drops the division's filled count) — it can be filled
  // again right away, by someone else on your team or publicly.
  async function removeFromTeam(applicationId) {
    const { error } = await supabase.from('applications').update({ status: 'cancelled' }).eq('id', applicationId)
    if (error) {
      console.error(error)
      return
    }
    load()
  }

  async function withdrawInvite(applicationId) {
    const { error } = await supabase.from('applications').update({ status: 'declined' }).eq('id', applicationId)
    if (error) {
      console.error(error)
      return
    }
    load()
  }

  async function saveRecruit(divisionId, payload) {
    const { error } = await supabase.from('job_divisions').update(payload).eq('id', divisionId)
    if (error) {
      console.error(error)
      return
    }
    setRecruitModal(null)
    load()
  }

  async function submitRating(jobId, freelancerId, rating, recommendation) {
    const { error } = await supabase.from('ratings').insert({
      job_id: jobId,
      organizer_id: user.id,
      freelancer_id: freelancerId,
      rating,
      recommendation: recommendation.trim() || null,
    })
    if (error) {
      console.error(error)
      return false
    }
    setRatedKeys((s) => new Set(s).add(`${jobId}:${freelancerId}`))
    return true
  }

  const totalPending = jobs.reduce((n, j) => n + (j.pendingApplicantCount || 0), 0)
  const teamModalJob = teamModal && jobs.find((j) => j.id === teamModal.jobId)
  const teamModalDivision = teamModalJob && teamModalJob.job_divisions.find((d) => d.id === teamModal.divisionId)
  const recruitModalJob = recruitModal && jobs.find((j) => j.id === recruitModal.jobId)
  const recruitModalDivision = recruitModalJob && recruitModalJob.job_divisions.find((d) => d.id === recruitModal.divisionId)

  return (
    <div className="app-shell">
      <Topbar title="My Event" />
      <div className="page">
        {showForm ? (
          <form className="card stack" onSubmit={handleSubmit}>
            <h2>{editingJobId ? 'Edit event' : 'New event'}</h2>
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
                  Just the role and headcount for now. Once you save, use "Select team" and "Open recruit" on each
                  division (from the event's card) to decide who fills the spots and what they'll be paid.
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
                {busy ? 'Saving…' : editingJobId ? 'Save changes' : 'Create event'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <button className="btn btn-primary btn-block" onClick={startCreate}>
              + Create a new event
            </button>

            <div className="segmented">
              <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
                List
              </button>
              <button type="button" className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}>
                Calendar
              </button>
            </div>

            {view === 'calendar' && <EventCalendar events={jobs} />}

            {loading && <p className="subtitle">Loading…</p>}
            {view === 'list' && !loading && jobs.length === 0 && (
              <div className="empty-state">No events yet — create one to get started.</div>
            )}
            {view === 'list' && (
              <div className="stack">
                {jobs.map((job) => {
                  const isPast = job.event_end_date < todayISO()
                  const toRate = isPast ? job.confirmedTeam.filter((f) => !ratedKeys.has(`${job.id}:${f.id}`)) : []
                  return (
                    <div key={job.id} className="card stack">
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h2 style={{ margin: 0 }}>{job.title}</h2>
                          <p className="subtitle" style={{ margin: '4px 0 0' }}>
                            📍 {job.location}
                            {job.location_detail && ` — ${job.location_detail}`} · {formatEventDates(job.event_start_date, job.event_end_date)}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn btn-outline"
                          style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => startEdit(job)}
                        >
                          Edit
                        </button>
                      </div>

                      <div className="stack" style={{ gap: 8 }}>
                        {job.job_divisions.map((d) => (
                          <div key={d.id} className="card" style={{ padding: 10, background: 'var(--surface-alt, rgba(0,0,0,0.02))' }}>
                            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <strong>{d.skill}</strong>
                                <p className="subtitle" style={{ margin: '4px 0 0' }}>
                                  {d.filled_count}/{d.quantity} filled
                                  {d.team.accepted.length > 0 && ` · ${d.team.accepted.map((p) => p.name).join(', ')}`}
                                  {d.team.invited.length > 0 && ` · ${d.team.invited.length} invited (pending)`}
                                </p>
                              </div>
                              <span className={`chip ${d.open_recruit ? '' : 'chip-outline'}`} style={{ fontSize: 11 }}>
                                {d.open_recruit ? 'Open recruit' : 'Private'}
                              </span>
                            </div>
                            <div className="row" style={{ marginTop: 8 }}>
                              <button
                                type="button"
                                className="btn btn-outline"
                                style={{ flex: 1, padding: '6px 10px', fontSize: 12 }}
                                onClick={() => setTeamModal({ jobId: job.id, divisionId: d.id })}
                              >
                                Select team
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline"
                                style={{ flex: 1, padding: '6px 10px', fontSize: 12 }}
                                onClick={() => setRecruitModal({ jobId: job.id, divisionId: d.id })}
                              >
                                Open recruit
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <Link to={`/organizer/jobs/${job.id}/applicants`} className="btn btn-outline btn-block" style={{ textDecoration: 'none' }}>
                        Manage applicants
                        {job.pendingApplicantCount > 0 && <span className="badge" style={{ marginLeft: 6 }}>{job.pendingApplicantCount}</span>}
                      </Link>

                      {job.confirmedTeam.length > 0 && (
                        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                          <span style={{ display: 'flex', alignItems: 'center' }}>
                            <Switch checked={Boolean(job.chat_opened_at)} onChange={(v) => toggleEventChat(job.id, v)} label="Event chat" />
                            <InfoButton title="Event chat">
                              Turning this on opens a group chat for you + everyone confirmed on this event. Turn it
                              back off any time — handy if a cancellation means you need to swap someone out first.
                            </InfoButton>
                          </span>
                          {job.chat_opened_at ? (
                            <Link to={`/event-chat/${job.id}`} className="chip" style={{ textDecoration: 'none' }}>
                              💬 {job.confirmedTeam.length + 1} people
                            </Link>
                          ) : (
                            <span className="chip chip-outline">Off</span>
                          )}
                        </div>
                      )}

                      {isPast && job.confirmedTeam.length > 0 && (
                        <div className="stack" style={{ borderTop: '1px solid var(--border)', paddingTop: 10, gap: 10 }}>
                          <strong style={{ fontSize: 13 }}>Rate your team — this event has wrapped up</strong>
                          {toRate.length === 0 && <p className="subtitle" style={{ margin: 0 }}>You've rated everyone on this event. 🎉</p>}
                          {toRate.map((f) => (
                            <RateForm key={f.id} freelancer={f} onSubmit={(rating, text) => submitRating(job.id, f.id, rating, text)} />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {teamModal && teamModalDivision && (
        <Modal title={`Select team — ${teamModalDivision.skill}`} onClose={() => setTeamModal(null)}>
          <div className="stack">
            <p className="subtitle" style={{ margin: 0 }}>
              {teamModalDivision.filled_count}/{teamModalDivision.quantity} filled
            </p>
            {teamModalDivision.team.accepted.length > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                <strong style={{ fontSize: 12 }}>Confirmed</strong>
                {teamModalDivision.team.accepted.map((p) => (
                  <div key={p.appId} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{p.name}</span>
                    <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => removeFromTeam(p.appId)}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            {teamModalDivision.team.invited.length > 0 && (
              <div className="stack" style={{ gap: 6 }}>
                <strong style={{ fontSize: 12 }}>Invited — waiting for response</strong>
                {teamModalDivision.team.invited.map((p) => (
                  <div key={p.appId} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{p.name}</span>
                    <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => withdrawInvite(p.appId)}>
                      Withdraw
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="stack" style={{ gap: 6 }}>
              <strong style={{ fontSize: 12 }}>Add from your team</strong>
              {(() => {
                const takenIds = new Set([...teamModalDivision.team.accepted, ...teamModalDivision.team.invited].map((p) => p.freelancerId))
                const candidates = teamMembers.filter((t) => !takenIds.has(t.id))
                if (candidates.length === 0) {
                  return <p className="subtitle" style={{ margin: 0 }}>Everyone on your team is already in this role, or you have no team yet.</p>
                }
                return (
                  <div className="chip-row">
                    {candidates.map((t) => (
                      <span key={t.id} className="chip chip-toggle" onClick={() => addToTeam(t.id, teamModalDivision.id)}>
                        {t.name}
                      </span>
                    ))}
                  </div>
                )
              })()}
            </div>
          </div>
        </Modal>
      )}

      {recruitModal && recruitModalDivision && (
        <Modal title={`Open recruit — ${recruitModalDivision.skill}`} onClose={() => setRecruitModal(null)}>
          <RecruitForm key={recruitModalDivision.id} division={recruitModalDivision} onSave={(payload) => saveRecruit(recruitModalDivision.id, payload)} />
        </Modal>
      )}

      <OrganizerTabbar pendingCount={totalPending} />
    </div>
  )
}

function RecruitForm({ division, onSave }) {
  const [budgetAmount, setBudgetAmount] = useState(division.budget_amount != null ? String(division.budget_amount) : '')
  const [budgetType, setBudgetType] = useState(division.budget_type || 'flat')
  const [feeType, setFeeType] = useState(division.fee_type || 'all_in')
  const [transportMax, setTransportMax] = useState(division.transport_max_amount != null ? String(division.transport_max_amount) : '')
  const [openRecruit, setOpenRecruit] = useState(Boolean(division.open_recruit))
  const [busy, setBusy] = useState(false)

  const remaining = Math.max(division.quantity - division.filled_count, 0)

  async function submit() {
    setBusy(true)
    await onSave({
      budget_amount: budgetAmount ? Number(budgetAmount) : null,
      budget_type: budgetType,
      fee_type: feeType,
      transport_max_amount: feeType === 'plus_transport' && transportMax ? Number(transportMax) : null,
      open_recruit: openRecruit,
    })
    setBusy(false)
  }

  return (
    <div className="stack">
      <p className="subtitle" style={{ margin: 0 }}>
        {remaining > 0
          ? `${remaining} of ${division.quantity} spot${division.quantity === 1 ? '' : 's'} not yet filled by your team.`
          : 'Every spot in this role is already filled.'}
      </p>
      <div className="row">
        <input
          style={{ flex: 1 }}
          type="number"
          min="0"
          placeholder="Budget (IDR)"
          value={budgetAmount}
          onChange={(e) => setBudgetAmount(e.target.value)}
        />
        <select style={{ flex: 1 }} value={budgetType} onChange={(e) => setBudgetType(e.target.value)}>
          <option value="flat">flat total</option>
          <option value="hourly">per hour</option>
          <option value="daily">per day</option>
        </select>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label style={{ fontSize: 12 }}>Fee covers</label>
        <select value={feeType} onChange={(e) => setFeeType(e.target.value)}>
          <option value="all_in">All-in (no separate reimbursement)</option>
          <option value="plus_transport">+ Transport reimbursed separately</option>
        </select>
        {feeType === 'plus_transport' && (
          <input
            style={{ marginTop: 8 }}
            type="number"
            min="0"
            placeholder="Max transport reimbursement (optional)"
            value={transportMax}
            onChange={(e) => setTransportMax(e.target.value)}
          />
        )}
      </div>
      <Switch checked={openRecruit} onChange={setOpenRecruit} label="Open recruit" />
      <p className="helper-text" style={{ margin: 0 }}>
        On: the {remaining} remaining spot{remaining === 1 ? '' : 's'} post to the public Job Feed for anyone to
        apply. Off: only people you invite from "Select team" can fill this role.
      </p>
      <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={submit}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

function RateForm({ freelancer, onSubmit }) {
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit() {
    if (rating === 0) return
    setBusy(true)
    const ok = await onSubmit(rating, text)
    setBusy(false)
    if (ok) setDone(true)
  }

  if (done) return <p className="subtitle" style={{ margin: 0 }}>✓ Rated {freelancer.name}</p>

  return (
    <div className="card" style={{ padding: 12 }}>
      <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{freelancer.name}</p>
      <div className="row" style={{ gap: 2, marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            onClick={() => setRating(n)}
            style={{ cursor: 'pointer', fontSize: 22, color: n <= rating ? 'var(--sunset-dark)' : 'var(--border)' }}
          >
            ★
          </span>
        ))}
      </div>
      <textarea
        placeholder="Optional: a short recommendation for their profile"
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <button type="button" className="btn btn-primary" disabled={rating === 0 || busy} onClick={submit}>
        {busy ? 'Saving…' : 'Submit rating'}
      </button>
    </div>
  )
}
