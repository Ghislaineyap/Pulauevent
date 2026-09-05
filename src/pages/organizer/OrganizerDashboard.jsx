import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { formatEventDates } from '../../lib/date'

const OTHER_SKILL = '__other__'
const OTHER_LOCATION = '__other__'

const emptyDivision = () => ({
  skill: '',
  customSkill: '',
  quantity: 1,
  budgetAmount: '',
  budgetType: 'flat',
  feeType: 'all_in',
  transportMax: '',
  inviteIds: [],
  // Private by default — an organizer adds the team members they already
  // know first, then deliberately opts this role into the public Job Feed
  // once they know how many spots (if any) are still open.
  openRecruit: false,
})
const emptyForm = () => ({ title: '', description: '', location: '', customLocation: '', eventStartDate: '', eventEndDate: '' })
const todayISO = () => new Date().toISOString().slice(0, 10)

export default function OrganizerDashboard() {
  const { user } = useAuth()
  const [skillOptions, setSkillOptions] = useState([])
  const [locationOptions, setLocationOptions] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
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

  async function loadPostings() {
    setLoadingPostings(true)
    const { data, error } = await supabase
      .from('job_postings')
      .select(
        'id, title, description, location, event_start_date, event_end_date, status, job_divisions(id, skill, quantity, filled_count, budget_amount, budget_type, fee_type, transport_max_amount, open_recruit)'
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

  function toggleInvite(i, freelancerId) {
    setDivisions((ds) =>
      ds.map((d, idx) =>
        idx === i
          ? {
              ...d,
              inviteIds: d.inviteIds.includes(freelancerId)
                ? d.inviteIds.filter((id) => id !== freelancerId)
                : [...d.inviteIds, freelancerId],
            }
          : d
      )
    )
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
    const knownLocation = job.location && locationOptions.includes(job.location)
    setForm({
      title: job.title,
      description: job.description || '',
      location: knownLocation ? job.location : OTHER_LOCATION,
      customLocation: knownLocation ? '' : job.location,
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
          budgetAmount: d.budget_amount != null ? String(d.budget_amount) : '',
          budgetType: d.budget_type,
          feeType: d.fee_type || 'all_in',
          transportMax: d.transport_max_amount != null ? String(d.transport_max_amount) : '',
          inviteIds: [],
          openRecruit: Boolean(d.open_recruit),
        }
      })
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

  function divisionPayload(d) {
    return {
      skill: d.skill === OTHER_SKILL ? d.customSkill.trim() : d.skill,
      quantity: Number(d.quantity) || 1,
      budget_amount: d.budgetAmount ? Number(d.budgetAmount) : null,
      budget_type: d.budgetType,
      fee_type: d.feeType,
      transport_max_amount: d.feeType === 'plus_transport' && d.transportMax ? Number(d.transportMax) : null,
      open_recruit: Boolean(d.openRecruit),
    }
  }

  async function inviteTeamMembers(divisionId, inviteIds) {
    if (!inviteIds || inviteIds.length === 0) return
    const { error: inviteError } = await supabase.from('applications').insert(
      inviteIds.map((freelancerId) => ({
        division_id: divisionId,
        freelancer_id: freelancerId,
        status: 'invited',
        source: 'invited',
      }))
    )
    if (inviteError) console.error(inviteError)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const resolvedLocation = form.location === OTHER_LOCATION ? form.customLocation.trim() : form.location
    if (!form.title.trim() || !resolvedLocation || !form.eventStartDate || !form.eventEndDate) {
      setError('Title, location, and start/end dates are required.')
      return
    }
    if (!editingJobId && form.eventStartDate < todayISO()) {
      setError("Start date can't be in the past.")
      return
    }
    if (form.eventEndDate < form.eventStartDate) {
      setError('End date can\'t be before the start date.')
      return
    }
    const cleanDivisions = divisions.filter((d) => (d.skill === OTHER_SKILL ? d.customSkill.trim() : d.skill))
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
          location: resolvedLocation,
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

      const { data: insertedDivisions, error: divError } = await supabase
        .from('job_divisions')
        .insert(cleanDivisions.map((d) => ({ job_id: job.id, ...divisionPayload(d) })))
        .select()
      if (divError) {
        setError(divError.message)
        setBusy(false)
        return
      }
      for (let i = 0; i < insertedDivisions.length; i++) {
        await inviteTeamMembers(insertedDivisions[i].id, cleanDivisions[i].inviteIds)
      }
      setBusy(false)
    } else {
      // Update an existing posting's top-level details.
      const { error: jobError } = await supabase
        .from('job_postings')
        .update({
          title: form.title.trim(),
          description: form.description.trim(),
          location: resolvedLocation,
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
        const { data: insertedDivisions, error: insError } = await supabase
          .from('job_divisions')
          .insert(newDivisions.map((d) => ({ job_id: editingJobId, ...divisionPayload(d) })))
          .select()
        if (insError) {
          setError(insError.message)
          setBusy(false)
          return
        }
        for (let i = 0; i < insertedDivisions.length; i++) {
          await inviteTeamMembers(insertedDivisions[i].id, newDivisions[i].inviteIds)
        }
      }

      for (const d of editedDivisions) {
        const { error: updError } = await supabase.from('job_divisions').update(divisionPayload(d)).eq('id', d.id)
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
                <p className="helper-text">
                  Picking from the list (instead of typing) keeps this consistent with what freelancers filter by.
                </p>
              </div>
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
                      </div>
                      {d.skill === OTHER_SKILL && (
                        <input
                          style={{ marginBottom: 8 }}
                          type="text"
                          placeholder="Type the role you need"
                          value={d.customSkill}
                          disabled={locked}
                          onChange={(e) => updateDivision(i, { customSkill: e.target.value })}
                        />
                      )}
                      <div className="row" style={{ marginBottom: 8 }}>
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

                      <div className="field" style={{ marginBottom: locked ? 0 : 8 }}>
                        <label style={{ fontSize: 12 }}>Fee covers</label>
                        <select
                          value={d.feeType}
                          disabled={locked}
                          onChange={(e) => updateDivision(i, { feeType: e.target.value })}
                        >
                          <option value="all_in">All-in (no separate reimbursement)</option>
                          <option value="plus_transport">+ Transport reimbursed separately</option>
                        </select>
                        {d.feeType === 'plus_transport' && (
                          <input
                            style={{ marginTop: 8 }}
                            type="number"
                            min="0"
                            placeholder="Max transport reimbursement (optional — leave blank for actual cost)"
                            value={d.transportMax}
                            disabled={locked}
                            onChange={(e) => updateDivision(i, { transportMax: e.target.value })}
                          />
                        )}
                        <p className="helper-text">This shows on the job post so applicants know upfront.</p>
                      </div>

                      {!locked && teamMembers.length > 0 && (
                        <div className="field" style={{ marginBottom: 8 }}>
                          <label style={{ fontSize: 12 }}>Invite from your team (optional)</label>
                          <div className="chip-row">
                            {teamMembers.map((t) => (
                              <span
                                key={t.id}
                                className={`chip chip-toggle ${d.inviteIds.includes(t.id) ? 'active' : ''}`}
                                onClick={() => toggleInvite(i, t.id)}
                              >
                                {t.name}
                              </span>
                            ))}
                          </div>
                          <p className="helper-text">
                            They'll be asked to confirm before they're booked into this role — it doesn't skip the
                            rest of the quantity if you need more people than you invite.
                          </p>
                        </div>
                      )}

                      <div className="field" style={{ marginBottom: 0, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600 }}>
                          <input
                            type="checkbox"
                            checked={d.openRecruit}
                            onChange={(e) => updateDivision(i, { openRecruit: e.target.checked })}
                          />
                          Open recruit — post this role to the public Job Feed
                        </label>
                        <p className="helper-text">
                          {d.openRecruit
                            ? 'Anyone can apply for spots not already filled by a team invite.'
                            : "Off = private. Only people you've invited above can fill this role — it won't show up in freelancers' Job Feed."}
                        </p>
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

        {!showForm && (
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
                      <span key={d.id} className={`chip ${d.open_recruit ? '' : 'chip-outline'}`}>
                        {d.skill} {d.filled_count}/{d.quantity}{!d.open_recruit && ' · Private'}
                      </span>
                    ))}
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
      <OrganizerTabbar />
    </div>
  )
}
