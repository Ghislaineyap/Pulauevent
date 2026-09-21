import { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { formatEventDates } from '../../lib/date'
import { Switch } from '../../components/Switch'
import { InfoButton } from '../../components/InfoButton'
import { SkillIcon } from '../../components/SkillIcon'
import { HomeTasksWidget } from '../../components/HomeTasksWidget'

const OTHER_SKILL = '__other__'
const OTHER_LOCATION = '__other__'
const emptyDivision = () => ({ skill: '', customSkill: '', quantity: 1, jobdesk: '' })
const emptyForm = () => ({ title: '', description: '', location: '', customLocation: '', locationDetail: '', eventStartDate: '', eventEndDate: '' })
const todayISO = () => new Date().toISOString().slice(0, 10)
const isoDate = (d) => {
  const tz = d.getTimezoneOffset()
  return new Date(d.getTime() - tz * 60000).toISOString().slice(0, 10)
}
function startOfWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - d.getDay())
  return d
}

// "My Event" — a list of your events. Managing one (crew, recruiting,
// budget, documents, vendors, tasks, event details, chat) all happens in
// the event workspace now (EventWorkspace.jsx) — the same page whether
// you're on a phone or a desktop (2026-09-20 workspace-unification pass:
// this page used to also open a separate "Manage event" bottom-sheet modal
// on mobile, built from ManageEventView/TeamSelectView/RecruitForm below,
// with a different look and feel than the desktop workspace covering the
// exact same actions — that duplication is gone; every "Manage event" link
// below just navigates into the workspace). The Home tab's
// "+ Create a new event" hands off here via router state (openCreate) since
// the create form itself still only lives on this page.
export default function MyEvents() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [jobs, setJobs] = useState([])
  const [skillOptions, setSkillOptions] = useState([])
  const [locationOptions, setLocationOptions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showPastList, setShowPastList] = useState(false)
  const [listSort, setListSort] = useState('upcoming') // 'upcoming' (soonest first) | 'latest' (newest first)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: jobRows, error: jobsError } = await supabase
      .from('job_postings')
      .select('id, title, location, location_detail, event_start_date, event_end_date')
      .eq('organizer_id', user.id)
      .order('created_at', { ascending: false })
    if (jobsError) console.error(jobsError)
    setJobs(jobRows || [])
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  // Hand-off from Home.jsx's "+ Create a new event" button (dashboard lives
  // there now, but the create form is still only here) — open the form, then
  // clear the router state so it doesn't reopen on a back-navigation.
  useEffect(() => {
    if (location.state?.openCreate) {
      setShowCreateForm(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location, navigate])

  useEffect(() => {
    supabase
      .from('skills')
      .select('label')
      .eq('audience', 'freelancer')
      .order('sort_order')
      .then(({ data }) => setSkillOptions((data || []).map((s) => s.label)))
    supabase
      .from('locations')
      .select('label')
      .order('sort_order')
      .then(({ data }) => setLocationOptions((data || []).map((l) => l.label)))
  }, [])

  // Keep wrapped-up events out of the way on the List tab, same as the
  // Connect chat lists already do — an event's card moves under a collapsed
  // "Show past events" toggle once its end date has passed instead of
  // sitting in the main list forever.
  const sortByDate = (list) =>
    [...list].sort((a, b) =>
      listSort === 'upcoming'
        ? a.event_start_date.localeCompare(b.event_start_date)
        : b.event_start_date.localeCompare(a.event_start_date)
    )
  const activeListJobs = sortByDate(jobs.filter((j) => j.event_end_date >= todayISO()))
  const pastListJobs = sortByDate(jobs.filter((j) => j.event_end_date < todayISO()))

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
            {loading && <p className="subtitle">Loading…</p>}

            {!loading && jobs.length === 0 && (
              <div className="empty-state">No events yet — create one to get started.</div>
            )}
            {jobs.length > 0 && (
              <div className="row" style={{ justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                <label htmlFor="my-events-sort" className="subtitle" style={{ margin: 0 }}>
                  Sort
                </label>
                <select
                  id="my-events-sort"
                  style={{ width: 'auto', padding: '4px 8px', fontSize: 12, borderRadius: 8 }}
                  value={listSort}
                  onChange={(e) => setListSort(e.target.value)}
                >
                  <option value="upcoming">Upcoming first</option>
                  <option value="latest">Latest first</option>
                </select>
              </div>
            )}
            {activeListJobs.length === 0 && pastListJobs.length > 0 && (
              <div className="empty-state">No upcoming events — see past events below.</div>
            )}
            <div className="stack">
              {activeListJobs.map((job) => (
                <div key={job.id} className="card stack">
                  <div>
                    <h2 style={{ margin: 0 }}>{job.title}</h2>
                    <p className="subtitle" style={{ margin: '4px 0 0' }}>
                      📍 {job.location}
                      {job.location_detail && ` — ${job.location_detail}`} · {formatEventDates(job.event_start_date, job.event_end_date)}
                    </p>
                  </div>
                  <Link to={`/organizer/events/${job.id}`} className="btn btn-primary btn-block" style={{ textDecoration: 'none' }}>
                    Manage event
                  </Link>
                </div>
              ))}
            </div>
            {pastListJobs.length > 0 && (
              <>
                <button type="button" className="btn btn-outline btn-block" onClick={() => setShowPastList((s) => !s)}>
                  {showPastList ? 'Hide' : 'Show'} past events ({pastListJobs.length})
                </button>
                {showPastList && (
                  <div className="stack">
                    {pastListJobs.map((job) => (
                      <div key={job.id} className="card stack" style={{ opacity: 0.75 }}>
                        <div>
                          <h2 style={{ margin: 0 }}>{job.title}</h2>
                          <p className="subtitle" style={{ margin: '4px 0 0' }}>
                            📍 {job.location}
                            {job.location_detail && ` — ${job.location_detail}`} · {formatEventDates(job.event_start_date, job.event_end_date)}
                          </p>
                        </div>
                        <Link to={`/organizer/events/${job.id}`} className="btn btn-outline btn-block" style={{ textDecoration: 'none' }}>
                          Manage event
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <OrganizerTabbar />
    </div>
  )
}

// The Home tab — a quick "what's going on" view instead of jumping straight
// into the create form or a flat list: what's coming up next, a week strip
// to jump to a day's agenda, and a few at-a-glance numbers. Everything here
// reads from its own copy of `jobs` — no separate data model — and tapping
// into an event navigates into the event workspace (EventWorkspace.jsx),
// the same one whether you're on a phone or a desktop.
export function EventDashboard({ jobs, pendingCount, pendingJobId, orgName, onCreate }) {
  const navigate = useNavigate()
  const today = todayISO()
  const [selectedDay, setSelectedDay] = useState(today)

  function openEvent(jobId) {
    navigate(`/organizer/events/${jobId}`)
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = startOfWeek(new Date())
    d.setDate(d.getDate() + i)
    return d
  })

  const hasEventOn = (dayISO) => jobs.some((j) => j.event_start_date <= dayISO && j.event_end_date >= dayISO)

  const activeJobs = jobs.filter((j) => j.event_end_date >= today)
  const nextEvent = [...activeJobs].sort((a, b) => a.event_start_date.localeCompare(b.event_start_date))[0]

  const agendaJobs = jobs
    .filter((j) => j.event_start_date <= selectedDay && j.event_end_date >= selectedDay)
    .sort((a, b) => a.title.localeCompare(b.title))

  return (
    <div className="stack">
      <div>
        <h2 style={{ margin: 0 }}>Hi{orgName ? `, ${orgName}` : ''} 👋</h2>
        <p className="subtitle" style={{ margin: '2px 0 0' }}>
          {activeJobs.length === 0 ? 'No upcoming events yet.' : `${activeJobs.length} upcoming event${activeJobs.length === 1 ? '' : 's'}.`}
        </p>
      </div>

      {nextEvent ? (
        <button
          type="button"
          className="card stack next-event-card"
          style={{ textAlign: 'left', border: 'none', cursor: 'pointer', width: '100%', fontFamily: 'inherit' }}
          onClick={() => openEvent(nextEvent.id)}
        >
          <div className="stack next-event-info" style={{ gap: 4 }}>
            <p
              className="subtitle"
              style={{ margin: 0, fontWeight: 700, color: 'var(--primary-dark)', textTransform: 'uppercase', fontSize: 10.5, letterSpacing: 0.4 }}
            >
              Next event
            </p>
            <h2 style={{ margin: 0 }}>{nextEvent.title}</h2>
            <p className="subtitle" style={{ margin: 0 }}>
              📍 {nextEvent.location} · {formatEventDates(nextEvent.event_start_date, nextEvent.event_end_date)}
            </p>
            <p className="subtitle" style={{ margin: 0 }}>
              {nextEvent.confirmedTeam.length} confirmed
              {nextEvent.job_divisions.some((d) => d.open_recruit) && ' · Open recruit on'}
            </p>
          </div>
        </button>
      ) : (
        <div className="empty-state">No upcoming events — create one to get started.</div>
      )}

      {/* Wrapped in one row so the desktop breakpoint can lay these three
          blocks out as a real two-column dashboard (calendar + agenda as
          the main column, stats alongside) — see .home-dash-row. On mobile
          this div has no layout of its own (a plain block), so the three
          children just stack in this same DOM order exactly as before. */}
      <div className="home-dash-row">
        <div className="week-strip">
          {weekDays.map((d) => {
            const dISO = isoDate(d)
            const active = dISO === selectedDay
            return (
              <button key={dISO} type="button" className={`week-day${active ? ' active' : ''}`} onClick={() => setSelectedDay(dISO)}>
                <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.75 }}>{d.toLocaleDateString('en-US', { weekday: 'narrow' })}</span>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{d.getDate()}</span>
                <span className={hasEventOn(dISO) ? 'dot' : ''} style={{ width: 5, height: 5 }} />
              </button>
            )
          })}
        </div>

        <div className="stack home-agenda-block" style={{ gap: 8 }}>
          <strong style={{ fontSize: 12.5 }}>
            {selectedDay === today ? 'Today' : new Date(`${selectedDay}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </strong>
          {agendaJobs.length === 0 && (
            <p className="subtitle" style={{ margin: 0 }}>
              Nothing scheduled this day.
            </p>
          )}
          {agendaJobs.map((j) => (
            <button key={j.id} type="button" className="row-card" onClick={() => openEvent(j.id)}>
              <div className="icon-badge">
                <SkillIcon skill={j.job_divisions[0]?.skill} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 13 }}>{j.title}</strong>
                <p className="subtitle" style={{ margin: '2px 0 0' }}>
                  {j.job_divisions.map((d) => `${d.filled_count}/${d.quantity} ${d.skill}`).join(' · ')}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Down to just the one number that actually needs a glance and a
            tap — everything else that used to live here (open recruit,
            confirmed this month, team roster) is one click away on its own
            tab already (Team, My Event). On desktop this side column would
            otherwise be a tall, mostly-empty strip next to the calendar, so
            the to-do list underneath fills it in — on mobile it's just the
            same stack, tile then list. */}
        <div className="stack home-stat-row" style={{ gap: 10 }}>
          {pendingJobId ? (
            <Link to={`/organizer/jobs/${pendingJobId}/applicants`} className="stat-tile stat-tile-link" style={{ textDecoration: 'none', display: 'flex' }}>
              <span className="subtitle">Pending applicants</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                {pendingCount}
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary-dark)' }}>Review →</span>
              </span>
            </Link>
          ) : (
            <div className="stat-tile">
              <span className="subtitle">Pending applicants</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)' }}>{pendingCount}</span>
            </div>
          )}
          <HomeTasksWidget jobs={activeJobs} />
        </div>
      </div>

      <button type="button" className="fab-btn" aria-label="Create a new event" onClick={onCreate}>
        +
      </button>
    </div>
  )
}

// A freelancer already assigned to one division of this event can't also be
// assigned to another — the candidate list is filtered across every
// division on the job, not just the one you're currently staffing.
export function TeamSelectView({ job, division, teamMembers, onAdd, onRemove, onWithdraw }) {
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

export function RecruitForm({ division, onSave }) {
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
        On: the {remaining} remaining spot{remaining === 1 ? '' : 's'} show up on the Post tab for anyone to apply.
        Off: only people invited from "Select team" can fill this role.
      </p>
      <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={submit}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

// Shared by "+ Create a new event" (top-level, job === null) and "Manage
// event → Edit" (job === the existing event). Only the basics live here —
// name, details, location, dates, and each division's role, headcount, and
// jobdesk. Budget/fee/Open Recruit live in "Manage event → Recruiting", not
// this form.
export function EventForm({ job, organizerId, skillOptions, locationOptions, onSaved, onCancel, bare = false }) {
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
          return {
            id: d.id,
            skill: knownSkill ? d.skill : OTHER_SKILL,
            customSkill: knownSkill ? '' : d.skill,
            quantity: d.quantity,
            jobdesk: d.jobdesk || '',
          }
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
      jobdesk: d.jobdesk.trim() || null,
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
        // Only skill/quantity/jobdesk are touched here — budget, fee, and
        // open-recruit are managed from "Recruiting", so saving this form
        // never overwrites them.
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
            Role, headcount, and what the job actually involves. Use "Select team" (in Manage event) to assign your
            own people, and "Recruiting" (also in Manage event) when you want a role open to public applicants.
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
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      background: 'var(--cloud)',
                      borderRadius: 10,
                      padding: '4px 8px',
                    }}
                  >
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => updateDivision(i, { quantity: Math.max(1, (Number(d.quantity) || 1) - 1) })}
                      aria-label="Decrease quantity"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        border: '1px solid var(--border)',
                        background: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: locked ? 'not-allowed' : 'pointer',
                        fontSize: 16,
                        fontWeight: 700,
                        color: 'var(--ink)',
                        flexShrink: 0,
                      }}
                    >
                      −
                    </button>
                    <span style={{ minWidth: 20, textAlign: 'center', fontSize: 15, fontWeight: 700 }}>{d.quantity}</span>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => updateDivision(i, { quantity: Math.min(20, (Number(d.quantity) || 1) + 1) })}
                      aria-label="Increase quantity"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        border: 'none',
                        background: 'var(--mint)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: locked ? 'not-allowed' : 'pointer',
                        fontSize: 16,
                        fontWeight: 700,
                        color: 'var(--bg)',
                        flexShrink: 0,
                      }}
                    >
                      +
                    </button>
                  </div>
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
                <textarea
                  style={{ marginTop: 8 }}
                  placeholder="Jobdesk — what will they actually do? (optional, but helps people understand the role)"
                  value={d.jobdesk}
                  disabled={locked}
                  onChange={(e) => updateDivision(i, { jobdesk: e.target.value })}
                />
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

export function RateForm({ freelancer, onSubmit }) {
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
