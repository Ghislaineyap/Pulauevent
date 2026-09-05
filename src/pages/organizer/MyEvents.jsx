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

const todayISO = () => new Date().toISOString().slice(0, 10)

// "My Event" — a clean, at-a-glance list of your events. Creating/editing
// the posting itself happens in Post; everything about RUNNING an event
// (who's on it, recruiting, the team chat, ratings) is one tap away behind
// "Manage event" instead of living on the card.
export default function MyEvents() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])
  const [ratedKeys, setRatedKeys] = useState(new Set())
  const [teamMembers, setTeamMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('list') // 'list' | 'calendar'

  // { jobId, sub: null | { type: 'team' | 'recruit', divisionId } }
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
      .from('team_members')
      .select('freelancer_id, freelancer_profiles(id, name, skills)')
      .eq('organizer_id', user.id)
      .then(({ data, error: teamError }) => {
        if (teamError) console.error(teamError)
        setTeamMembers((data || []).map((t) => t.freelancer_profiles).filter(Boolean))
      })
  }, [user.id])

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
    setManageModal((m) => (m ? { ...m, sub: null } : m))
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
    manageJob && manageModal.sub ? manageJob.job_divisions.find((d) => d.id === manageModal.sub.divisionId) : null

  return (
    <div className="app-shell">
      <Topbar title="My Event" />
      <div className="page">
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
          <div className="empty-state">No events yet — post a job to get one started.</div>
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
      </div>

      {manageJob && (
        <Modal
          title={manageModal.sub ? (manageDivision ? `${manageModal.sub.type === 'team' ? 'Select team' : 'Open recruit'} — ${manageDivision.skill}` : manageJob.title) : manageJob.title}
          onClose={() => setManageModal(null)}
        >
          {!manageModal.sub && (
            <ManageEventView
              job={manageJob}
              ratedKeys={ratedKeys}
              onOpenTeam={(divisionId) => setManageModal((m) => ({ ...m, sub: { type: 'team', divisionId } }))}
              onOpenRecruit={(divisionId) => setManageModal((m) => ({ ...m, sub: { type: 'recruit', divisionId } }))}
              onToggleChat={toggleEventChat}
              onSubmitRating={submitRating}
            />
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

          {manageModal.sub?.type === 'recruit' && manageDivision && (
            <div className="stack">
              <button
                type="button"
                className="btn btn-outline"
                style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12 }}
                onClick={() => setManageModal((m) => ({ ...m, sub: null }))}
              >
                ← Back
              </button>
              <RecruitForm key={manageDivision.id} division={manageDivision} onSave={(payload) => saveRecruit(manageDivision.id, payload)} />
            </div>
          )}
        </Modal>
      )}

      <OrganizerTabbar pendingCount={totalPending} />
    </div>
  )
}

function ManageEventView({ job, ratedKeys, onOpenTeam, onOpenRecruit, onToggleChat, onSubmitRating }) {
  const isPast = job.event_end_date < todayISO()
  const toRate = isPast ? job.confirmedTeam.filter((f) => !ratedKeys.has(`${job.id}:${f.id}`)) : []

  return (
    <div className="stack">
      <p className="subtitle" style={{ margin: 0 }}>
        📍 {job.location}
        {job.location_detail && ` — ${job.location_detail}`} · {formatEventDates(job.event_start_date, job.event_end_date)}
      </p>

      <div className="stack" style={{ gap: 8 }}>
        {job.job_divisions.map((d) => (
          <div key={d.id} className="card" style={{ padding: 10 }}>
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
              <button type="button" className="btn btn-outline" style={{ flex: 1, padding: '6px 10px', fontSize: 12 }} onClick={() => onOpenTeam(d.id)}>
                Select team
              </button>
              <button type="button" className="btn btn-outline" style={{ flex: 1, padding: '6px 10px', fontSize: 12 }} onClick={() => onOpenRecruit(d.id)}>
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
