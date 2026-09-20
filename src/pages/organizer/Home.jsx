import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { EventCalendar } from '../../components/EventCalendar'
import { Modal } from '../../components/Modal'
import { DocumentsView } from '../../components/DocumentsView'
import { TasksView } from '../../components/TasksView'
import { downloadICS, eventsFromJobSchedule } from '../../lib/ics'
import { EventDashboard, ManageEventView, TeamSelectView, RecruitForm, EventForm } from './MyEvents'

// Home — the dashboard (next event, week strip, stat tiles) and Calendar,
// split out of My Event into their own top-level tab (2026-09-20 nav
// restructure: My Event is list-only now). Loads its own copy of
// jobs/teamMembers/pendingCount rather than sharing state with My Event —
// same "routes don't share state" pattern this codebase already uses
// elsewhere (see OrganizerOnboarding's brief stint holding the dashboard).
// Manage/Recruiting/Team/Documents/Tasks all reuse the exact same
// ManageEventView + friends that My Event's own modal uses, so there's one
// implementation of that logic mounted in two places.
export default function Home() {
  const { user, roleProfile } = useAuth()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [ratedKeys, setRatedKeys] = useState(new Set())
  const [teamMembers, setTeamMembers] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [pendingJobId, setPendingJobId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('dashboard') // 'dashboard' | 'calendar'
  const [manageModal, setManageModal] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: jobRows, error: jobsError }, { data: myRatings }] = await Promise.all([
      supabase
        .from('job_postings')
        .select(
          'id, title, description, location, location_detail, event_start_date, event_end_date, status, chat_opened_at, job_divisions(id, skill, quantity, filled_count, budget_amount, budget_type, fee_type, transport_max_amount, open_recruit, jobdesk)'
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
    if (divisionIds.length > 0) {
      const { data: apps, error: appsError } = await supabase
        .from('applications')
        .select('id, status, division_id, job_divisions(job_id), freelancer_profiles(id, name)')
        .in('division_id', divisionIds)
        .in('status', ['accepted', 'invited'])
      if (appsError) console.error(appsError)
      ;(apps || []).forEach((a) => {
        const jobId = a.job_divisions.job_id
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
      }))
    )

    // Fetched as rows (not a head:true count) so pending applicants can be
    // attributed back to a specific job — the stat tile links straight to
    // whichever event most needs a look, not just a bare number.
    const divisionToJob = new Map()
    ;(jobRows || []).forEach((j) => j.job_divisions.forEach((d) => divisionToJob.set(d.id, j.id)))
    const openRecruitDivisionIds = (jobRows || []).flatMap((j) => j.job_divisions.filter((d) => d.open_recruit).map((d) => d.id))
    if (openRecruitDivisionIds.length > 0) {
      const { data: pendingApps, error: pendingError } = await supabase
        .from('applications')
        .select('id, division_id')
        .in('division_id', openRecruitDivisionIds)
        .eq('status', 'pending')
      if (pendingError) console.error(pendingError)
      setPendingCount((pendingApps || []).length)

      const countByJob = new Map()
      ;(pendingApps || []).forEach((a) => {
        const jobId = divisionToJob.get(a.division_id)
        countByJob.set(jobId, (countByJob.get(jobId) || 0) + 1)
      })
      // Whichever job with pending applicants has the soonest event — the
      // most time-sensitive one to review first.
      const jobsWithPending = (jobRows || [])
        .filter((j) => countByJob.has(j.id))
        .sort((a, b) => a.event_start_date.localeCompare(b.event_start_date))
      setPendingJobId(jobsWithPending[0]?.id || null)
    } else {
      setPendingCount(0)
      setPendingJobId(null)
    }

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

  function addToCalendar(job) {
    downloadICS(job.title, eventsFromJobSchedule(job, [], []))
  }

  const manageJob = manageModal && jobs.find((j) => j.id === manageModal.jobId)
  const manageDivision =
    manageJob && (manageModal.sub?.type === 'team' || manageModal.sub?.type === 'recruit')
      ? manageJob.job_divisions.find((d) => d.id === manageModal.sub.divisionId)
      : null

  let manageTitle = manageJob?.title
  if (manageModal?.sub?.type === 'edit') manageTitle = `Edit — ${manageJob.title}`
  if (manageModal?.sub?.type === 'team' && manageDivision) manageTitle = `Select team — ${manageDivision.skill}`
  if (manageModal?.sub?.type === 'recruit' && manageDivision) manageTitle = `Recruiting — ${manageDivision.skill}`
  if (manageModal?.sub?.type === 'documents') manageTitle = `Documents — ${manageJob.title}`
  if (manageModal?.sub?.type === 'tasks') manageTitle = `Tasks — ${manageJob.title}`

  return (
    <div className="app-shell">
      <Topbar title="Home" />
      <div className="page">
        <div className="segmented">
          <button type="button" className={view === 'dashboard' ? 'active' : ''} onClick={() => setView('dashboard')}>
            Home
          </button>
          <button type="button" className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}>
            Calendar
          </button>
        </div>

        {loading && <p className="subtitle">Loading…</p>}

        {!loading && view === 'dashboard' && (
          <EventDashboard
            jobs={jobs}
            pendingCount={pendingCount}
            pendingJobId={pendingJobId}
            orgName={roleProfile?.org_name}
            onManage={(jobId) => setManageModal({ jobId, sub: null })}
            onCreate={() => navigate('/organizer/my-events', { state: { openCreate: true } })}
          />
        )}

        {view === 'calendar' && (
          <EventCalendar events={jobs} onSelectEvent={(job) => setManageModal({ jobId: job.id, sub: null })} />
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
              onOpenRecruit={(divisionId) => setManageModal((m) => ({ ...m, sub: { type: 'recruit', divisionId } }))}
              onOpenDocuments={() => setManageModal((m) => ({ ...m, sub: { type: 'documents' } }))}
              onOpenTasks={() => setManageModal((m) => ({ ...m, sub: { type: 'tasks' } }))}
              onAddToCalendar={() => addToCalendar(manageJob)}
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
                skillOptions={[]}
                locationOptions={[]}
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

          {manageModal.sub?.type === 'documents' && (
            <div className="stack">
              <button
                type="button"
                className="btn btn-outline"
                style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12 }}
                onClick={() => setManageModal((m) => ({ ...m, sub: null }))}
              >
                ← Back
              </button>
              <DocumentsView jobId={manageJob.id} canEdit />
            </div>
          )}

          {manageModal.sub?.type === 'tasks' && (
            <div className="stack">
              <button
                type="button"
                className="btn btn-outline"
                style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12 }}
                onClick={() => setManageModal((m) => ({ ...m, sub: null }))}
              >
                ← Back
              </button>
              <TasksView jobId={manageJob.id} canManage currentUserId={user.id} teamMembers={manageJob.confirmedTeam} />
            </div>
          )}

        </Modal>
      )}

      <OrganizerTabbar />
    </div>
  )
}
