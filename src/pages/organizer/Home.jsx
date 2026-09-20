import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { EventCalendar } from '../../components/EventCalendar'
import { EventDashboard } from './MyEvents'

// Home — the dashboard (next event, week strip, stat tiles) and Calendar,
// split out of My Event into their own top-level tab (2026-09-20 nav
// restructure: My Event is list-only now). Loads its own copy of
// jobs/pendingCount rather than sharing state with My Event — same "routes
// don't share state" pattern this codebase already uses elsewhere (see
// OrganizerOnboarding's brief stint holding the dashboard).
//
// Managing an event (Overview/Team/Budget/Documents/Vendors/Tasks) is no
// longer a modal mounted here — every entry point (the next-event card,
// the calendar) navigates straight into that event's own workspace at
// /organizer/events/:jobId, which is the one implementation of that UI
// used on both desktop and mobile (2026-09-20 workspace unification).
export default function Home() {
  const { user, roleProfile } = useAuth()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [pendingCount, setPendingCount] = useState(0)
  const [pendingJobId, setPendingJobId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('dashboard') // 'dashboard' | 'calendar'

  const load = useCallback(async () => {
    setLoading(true)
    const { data: jobRows, error: jobsError } = await supabase
      .from('job_postings')
      .select(
        'id, title, description, location, location_detail, event_start_date, event_end_date, status, chat_opened_at, job_divisions(id, skill, quantity, filled_count, budget_amount, budget_type, fee_type, transport_max_amount, open_recruit, jobdesk)'
      )
      .eq('organizer_id', user.id)
      .order('created_at', { ascending: false })
    if (jobsError) console.error(jobsError)

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
            onCreate={() => navigate('/organizer/my-events', { state: { openCreate: true } })}
          />
        )}

        {view === 'calendar' && (
          <EventCalendar events={jobs} onSelectEvent={(job) => navigate(`/organizer/events/${job.id}`)} />
        )}
      </div>

      <OrganizerTabbar />
    </div>
  )
}
