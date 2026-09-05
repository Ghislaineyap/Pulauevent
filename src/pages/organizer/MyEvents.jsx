import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
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
const emptyDivision = () => ({ skill: '', customSkill: '', quantity: 1 })
const emptyForm = () => ({ title: '', description: '', location: '', customLocation: '', locationDetail: '', eventStartDate: '', eventEndDate: '' })
const todayISO = () => new Date().toISOString().slice(0, 10)

// "My Event" — create an event here, and run it here: crew (per-division
// "Select team"), event details (editable any time from "Manage event"),
// the team chat, "Manage applicants," and post-event ratings. Recruiting
// publicly is Post's job — that's where "Open recruit" and its budget/fee
// live, kept separate so each tab tracks one thing.
export default function MyEvents() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])
  const [ratedKeys, setRatedKeys] = useState(new Set())
  const [teamMembers, setTeamMembers] = useState([])
  const [skillOptions, setSkillOptions] = useState([])
  const [locationOptions, setLocationOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list') // 'list' | 'calendar'
  const [showCreateForm, setShowCreateForm] = useState(false)

  // { jobId, sub: null | { type: 'edit' } | { type: 'team', divisionId } }
  const [manageModal, setManageModal] = useState(null)

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
  const manageJob = manageModal && jobs.find((j) => j.id === manageModal.jobId)
  const manageDivision =
    manageJob && manageModal.sub?.type === 'team' ? manageJob.job_divisions.find((d) => d.id === manageModal.sub.divisionId) : null

  let manageTitle = manageJob?.title
  if (manageModal?.sub?.type === 'edit') manageTitle = `Edit — ${manageJob.title}`
  if (manageModal?.sub?.type === 'team' && manageDivision) manageTitle = `Select team — ${manageDivision.skill}`

  return (
    <div className="app-shell">
      <Topbar title="My Event" />
      <div className="page">
        {showCreateForm ? (
          <div className="card">
            <h2>New event</h2>
            <EventForm
              job={null}
              organizerId={user.id}
              skillOptions={skillOptions}
              locationOptions={locationOptions}
              onCancel={() => setShowCreateForm(false)}
              onSaved={() => {
                setShowCreateForm(false)
                load()
              }}
            />
          </div>
        ) : (
          <button className="btn btn-primary btn-block" onClick={() => setShowCreateForm(true)}>
            + Create a new event
          </button>
        )}

        {!showCreateForm && (
          <>
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
                {jobs.map((job) => (
                  <div key={job.id} className="card stack">
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h2 style={{ margin: 0 }}>{job.title}</h2>
                        <p className="subtitle" style={{ margin: '4px 0 0' }}>
                          📍 {job.location}
                          {job.location_detail && ` — ${job.location_detail}`} · {formatEventDates(job.event_start_date, job.event_end_date)}
                        </p>
                      </div>
                      {job.pendingApplicantCount > 0 && <span className="badge">{job.pendingApplicantCount}</span>}
                    </div>
                    <button type="button" className="btn btn-primary btn-block" onClick={() => setManageModal({ jobId: job.id, sub: null })}>
                      Manage event
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {manageJob && (
        <Modal title={manageTitle} onClose={() => setManageModal(null)}>
          {!manageModal.sub && (
            <ManageEventView
              job={manageJob}
              ratedKeys={ratedKeys}
              onEdit={() => setManageModal((m) => ({ ...m, sub: { type: 'edit' } }))}
              onOpenTeam={(divisionId) => setManageModal((m) => ({ ...m, sub: { type: 'team', divisionId } }))}
              onToggleChat={toggleEventChat}
              onSubmitRating={submitRating}
            />
          )}

          {manageModal.sub?.type === 'edit' && (
            <div className="stack">
              <button
                type="button"
                className="btn btn-outline"
                style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12 }}
                onClick={() => setManageModal((m) => ({ ...m, sub: null }))}
              >
                ← Back
              </button>
              <EventForm
                bare
                job={manageJob}
                organizerId={user.id}
                skillOptions={skillOptions}
                locationOptions={locationOptions}
                onCancel={() => setManageModal((m) => ({ ...m, sub: null }))}
                onSaved={() => {
                  setManageModal((m) => ({ ...m, sub: null }))
                  load()
                }}
              />
            </div>
          )}

          {manageModal.sub?.type === 'team' && manageDivision && (
            <div className="stack">
              <button
                type="button"
                className="btn btn-outline"
                style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12 }}
                onClick={() => setManageModal((m) => ({ ...m, sub: null }))}
              >
                ← Back
              </button>
              <TeamSelectView
                job={manageJob}
                division={manageDivision}
                teamMembers={teamMembers}
                onAdd={addToTeam}
                onRemove={removeFromTeam}
                onWithdraw={withdrawInvite}
              />
            </div>
          )}
        </Modal>
      )}

      <OrganizerTabbar pendingCount={totalPending} />
    </div>
  )
}

function ManageEventView({ job, ratedKeys, onEdit, onOpenTeam, onToggleChat, onSubmitRating }) {
  const isPast = job.event_end_date < todayISO()
  const toRate = isPast ? job.confirmedTeam.filter((f) => !ratedKeys.has(`${job.id}:${f.id}`)) : []

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <p className="subtitle" style={{ margin: 0 }}>
          📍 {job.location}
          {job.location_detail && ` — ${job.location_detail}`} · {formatEventDates(job.event_start_date, job.event_end_date)}
        </p>
        <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 12 }} onClick={onEdit}>
          Edit
        </button>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        {job.job_divisions.map((d) => (
          <div key={d.id} className="card" style={{ padding: 10 }}>
            <strong>{d.skill}</strong>
            <p className="subtitle" style={{ margin: '4px 0 8px' }}>
              {d.filled_count}/{d.quantity} filled
              {d.team.accepted.length > 0 && ` · ${d.team.accepted.map((p) => p.name).join(', ')}`}
              {d.team.invited.length > 0 && ` · ${d.team.invited.length} invited (pending)`}
              {d.open_recruit && ' · Open to public (see Post)'}
            </p>
            <button type="button" className="btn btn-outline btn-block" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => onOpenTeam(d.id)}>
              Select team
            </button>
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
            <Switch checked={Boolean(job.chat_opened_at)} onChange={(v) => onToggleChat(job.id, v)} label="Event chat" />
            <InfoButton title="Event chat">
              Turning this on opens a group chat for you + everyone confirmed on this event. Turn it back off any
              time — handy if a cancellation means you need to swap someone out first.
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
            <RateForm key={f.id} freelancer={f} onSubmit={(rating, text) => onSubmitRating(job.id, f.id, rating, text)} />
          ))}
        </div>
      )}
    </div>
  )
}

// A freelancer already assigned to one division of this event can't also be
// assigned to another — the candidate list is filtered across every
// division on the job, not just the one you're currently staffing.
function TeamSelectView({ job, division, teamMembers, onAdd, onRemove, onWithdraw }) {
  const takenAcrossJob = new Set(job.job_divisions.flatMap((d) => [...d.team.accepted, ...d.team.invited]).map((p) => p.freelancerId))
  const candidates = teamMembers.filter((t) => !takenAcrossJob.has(t.id))

  return (
    <div className="stack">
      <p className="subtitle" style={{ margin: 0 }}>
        {division.filled_count}/{division.quantity} filled
      </p>
      {division.team.accepted.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <strong style={{ fontSize: 12 }}>Confirmed</strong>
          {division.team.accepted.map((p) => (
            <div key={p.appId} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{p.name}</span>
              <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => onRemove(p.appId)}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {division.team.invited.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <strong style={{ fontSize: 12 }}>Invited — waiting for response</strong>
          {division.team.invited.map((p) => (
            <div key={p.appId} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{p.name}</span>
              <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => onWithdraw(p.appId)}>
                Withdraw
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="stack" style={{ gap: 6 }}>
        <strong style={{ fontSize: 12 }}>Add from your team</strong>
        {candidates.length === 0 ? (
          <p className="subtitle" style={{ margin: 0 }}>
            Everyone on your team is already assigned somewhere on this event, or you have no team yet.
          </p>
        ) : (
          <div className="chip-row">
            {candidates.map((t) => (
              <span key={t.id} className="chip chip-toggle" onClick={() => onAdd(t.id, division.id)}>
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Shared by "+ Create a new event" (top-level, job === null) and "Manage
// event → Edit" (job === the existing event). Only the basics live here —
// name, details, location, dates, and each division's role + headcount.
// Budget/fee/recruiting are Post's job, not this form's.
function EventForm({ job, organizerId, skillOptions, locationOptions, onSaved, onCancel, bare = false }) {
  const isEdit = Boolean(job)
  const [form, setForm] = useState(() =>
    job
      ? {
          title: job.title,
          description: job.description || '',
          location: locationOptions.includes(job.location) ? job.location : OTHER_LOCATION,
          customLocation: locationOptions.includes(job.location) ? '' : job.location,
          locationDetail: job.location_detail || '',
          eventStartDate: job.event_start_date,
          eventEndDate: job.event_end_date,
        }
      : emptyForm()
  )
  const [divisions, setDivisions] = useState(() =>
    job
      ? job.job_divisions.map((d) => {
          const knownSkill = skillOptions.includes(d.skill)
          return { id: d.id, skill: knownSkill ? d.skill : OTHER_SKILL, customSkill: knownSkill ? '' : d.skill, quantity: d.quantity }
        })
      : [emptyDivision()]
  )
  const [removedDivisionIds, setRemovedDivisionIds] = useState([])
  const [lockedDivisionIds, setLockedDivisionIds] = useState(new Set())
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isEdit) return
    const divisionIds = job.job_divisions.map((d) => d.id)
    if (divisionIds.length === 0) return
    supabase
      .from('applications')
      .select('division_id')
      .in('division_id', divisionIds)
      .then(({ data, error }) => {
        if (error) console.error(error)
        setLockedDivisionIds(new Set((data || []).map((a) => a.division_id)))
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
    if (!isEdit && form.eventStartDate < todayISO()) {
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

    if (!isEdit) {
      const { data: newJob, error: jobError } = await supabase
        .from('job_postings')
        .insert({ organizer_id: organizerId, ...basePayload })
        .select()
        .single()
      if (jobError) {
        setFormError(jobError.message)
        setBusy(false)
        return
      }
      // New divisions always start private — the organizer opts a division
      // into public recruiting deliberately, from Post.
      const { error: divError } = await supabase
        .from('job_divisions')
        .insert(cleanDivisions.map((d) => ({ job_id: newJob.id, ...divisionPayload(d), open_recruit: false })))
      if (divError) {
        setFormError(divError.message)
        setBusy(false)
        return
      }
    } else {
      const { error: jobError } = await supabase.from('job_postings').update(basePayload).eq('id', job.id)
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
          .insert(newDivisions.map((d) => ({ job_id: job.id, ...divisionPayload(d), open_recruit: false })))
        if (insError) {
          setFormError(insError.message)
          setBusy(false)
          return
        }
      }

      for (const d of editedDivisions) {
        // Only skill/quantity are touched here — budget, fee, and open-recruit
        // are all managed from Post, so saving this form never overwrites them.
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
    }

    setBusy(false)
    onSaved()
  }

  return (
    <form className={bare ? 'stack' : 'card stack'} onSubmit={handleSubmit}>
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
            min={isEdit ? undefined : todayISO()}
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
            Just the role and headcount for now. Use "Select team" (in Manage event) to assign your own people, and
            head to Post when you want a role open to public recruiting.
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
        <button type="button" className="btn btn-outline" style={{ marginTop: 8 }} onClick={() => setDivisions((ds) => [...ds, emptyDivision()])}>
          + Add another division
        </button>
      </div>

      {formError && <p className="error-text">{formError}</p>}
      <div className="row">
        <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
          {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create event'}
        </button>
      </div>
    </form>
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
