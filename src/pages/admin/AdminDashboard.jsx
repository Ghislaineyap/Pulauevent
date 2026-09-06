import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { formatEventDates } from '../../lib/date'
import { useAuth } from '../../context/AuthProvider'
import { Modal } from '../../components/Modal'

// Platform overview + user/event management. Deliberately its own layout
// (not the mobile app-shell the rest of the app uses) — this is a desktop
// tool for the person running the platform, not a screen a freelancer or
// organizer ever sees.
//
// Three separate lists (organizers, freelancers, events) rather than one
// combined "users" table — each has its own shape (an organizer has one
// location, a freelancer can cover several, an event has its own), and
// keeping them apart is what makes the location filter below mean the same
// thing regardless of which tab you're on: "show me who/what is in X".
export default function AdminDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('organizers') // 'organizers' | 'freelancers' | 'events' | 'reports' | 'appeals'
  const [locationFilter, setLocationFilter] = useState('')
  const [locationOptions, setLocationOptions] = useState([])
  const [organizers, setOrganizers] = useState([])
  const [freelancers, setFreelancers] = useState([])
  const [events, setEvents] = useState([])
  const [reports, setReports] = useState([])
  const [appeals, setAppeals] = useState([])
  const [reportFilter, setReportFilter] = useState('open') // 'open' | 'all'
  const [appealFilter, setAppealFilter] = useState('pending') // 'pending' | 'all'
  const [pendingApplications, setPendingApplications] = useState(0)
  const [emailsUnavailable, setEmailsUnavailable] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [suspendTarget, setSuspendTarget] = useState(null) // { id, name, reportId? }
  const [denyTarget, setDenyTarget] = useState(null) // { id, name }
  const [busyId, setBusyId] = useState(null)
  const [actionError, setActionError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setActionError('')

    const [
      { data: profileRows, error: profilesError },
      { data: freelancerRows, error: freelancerError },
      { data: organizerRows, error: organizerError },
      { data: jobRows, error: jobsError },
      { data: locationRows, error: locationsError },
      { count: pendingCount, error: pendingError },
      { data: reportRows, error: reportsError },
      { data: appealRows, error: appealsError },
    ] = await Promise.all([
      supabase.from('profiles').select('id, created_at, status, suspended_reason'),
      supabase.from('freelancer_profiles').select('id, name, locations'),
      supabase.from('organizer_profiles').select('id, org_name, location'),
      supabase
        .from('job_postings')
        .select(
          'id, title, location, event_start_date, event_end_date, created_at, organizer_id, organizer_profiles(org_name), job_divisions(id, skill, quantity, filled_count)'
        )
        .order('created_at', { ascending: false }),
      supabase.from('locations').select('label').order('sort_order'),
      supabase.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('reports').select('*').order('created_at', { ascending: false }),
      supabase.from('appeals').select('*').order('created_at', { ascending: false }),
    ])
    if (profilesError) console.error(profilesError)
    if (freelancerError) console.error(freelancerError)
    if (organizerError) console.error(organizerError)
    if (jobsError) console.error(jobsError)
    if (locationsError) console.error(locationsError)
    if (pendingError) console.error(pendingError)
    // reports/appeals errors (most likely: migration_reports_appeals.sql not
    // run yet) shouldn't take down the rest of the dashboard — just leave
    // those two tabs empty rather than failing the whole load.
    if (reportsError) console.error(reportsError)
    if (appealsError) console.error(appealsError)
    setPendingApplications(pendingCount || 0)
    setEvents(jobRows || [])
    setLocationOptions((locationRows || []).map((l) => l.label))
    setReports(reportRows || [])
    setAppeals(appealRows || [])

    const createdAtById = new Map((profileRows || []).map((p) => [p.id, p.created_at]))
    const statusById = new Map(
      (profileRows || []).map((p) => [p.id, { status: p.status || 'active', suspendedReason: p.suspended_reason || null }])
    )

    // Email lives in auth.users, which the browser can never read directly —
    // only the admin-list-users Edge Function (running with the service
    // role, server-side) can see it. If it isn't deployed yet, fall back to
    // showing everything except email rather than failing the whole page.
    let emailById = new Map()
    let emailsFailed = false
    try {
      const { data, error } = await supabase.functions.invoke('admin-list-users')
      if (error || !data?.users) {
        emailsFailed = true
      } else {
        data.users.forEach((u) => emailById.set(u.id, u.email))
      }
    } catch (err) {
      console.error(err)
      emailsFailed = true
    }
    setEmailsUnavailable(emailsFailed)

    setOrganizers(
      (organizerRows || []).map((o) => ({
        id: o.id,
        name: o.org_name,
        location: o.location,
        email: emailById.get(o.id) || null,
        createdAt: createdAtById.get(o.id),
        status: statusById.get(o.id)?.status || 'active',
        suspendedReason: statusById.get(o.id)?.suspendedReason || null,
      }))
    )
    setFreelancers(
      (freelancerRows || []).map((f) => ({
        id: f.id,
        name: f.name,
        locations: f.locations || [],
        email: emailById.get(f.id) || null,
        createdAt: createdAtById.get(f.id),
        status: statusById.get(f.id)?.status || 'active',
        suspendedReason: statusById.get(f.id)?.suspendedReason || null,
      }))
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Reports and appeals reference profiles by id only — this resolves a
  // reporter/reported/appellant id to a display name + role using the
  // organizer/freelancer lists already loaded above, rather than a second
  // round-trip to the database.
  const nameById = useMemo(() => {
    const map = new Map()
    organizers.forEach((o) => map.set(o.id, { name: o.name || 'Organizer (onboarding incomplete)', role: 'Organizer' }))
    freelancers.forEach((f) => map.set(f.id, { name: f.name || 'Freelancer (onboarding incomplete)', role: 'Freelancer' }))
    return map
  }, [organizers, freelancers])

  const openReportsCount = reports.filter((r) => r.status === 'open').length
  const pendingAppealsCount = appeals.filter((a) => a.status === 'pending').length

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/admin/login')
  }

  // ---------------------------------------------------------------------
  // Suspend / reinstate a profile. Suspending from a report also resolves
  // that report in one step (suspendTarget.reportId) so the admin doesn't
  // have to separately dismiss/resolve it afterward.
  // ---------------------------------------------------------------------
  async function handleSuspendConfirm(reason) {
    if (!suspendTarget) return
    setBusyId(suspendTarget.id)
    setActionError('')
    const { error } = await supabase
      .from('profiles')
      .update({ status: 'suspended', suspended_reason: reason || null, suspended_at: new Date().toISOString() })
      .eq('id', suspendTarget.id)
    if (error) {
      setBusyId(null)
      setActionError(error.message)
      return
    }
    if (suspendTarget.reportId) {
      const { error: reportError } = await supabase
        .from('reports')
        .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: user.id })
        .eq('id', suspendTarget.reportId)
      if (reportError) console.error(reportError)
    }
    setBusyId(null)
    setSuspendTarget(null)
    await load()
  }

  async function handleUnsuspend(profileId) {
    setBusyId(profileId)
    setActionError('')
    const { error } = await supabase
      .from('profiles')
      .update({ status: 'active', suspended_reason: null, suspended_at: null })
      .eq('id', profileId)
    setBusyId(null)
    if (error) {
      setActionError(error.message)
      return
    }
    await load()
  }

  async function resolveReport(reportId, status) {
    setBusyId(reportId)
    setActionError('')
    const { error } = await supabase
      .from('reports')
      .update({ status, resolved_at: new Date().toISOString(), resolved_by: user.id })
      .eq('id', reportId)
    setBusyId(null)
    if (error) {
      setActionError(error.message)
      return
    }
    await load()
  }

  async function handleApproveAppeal(appeal) {
    setBusyId(appeal.id)
    setActionError('')
    const { error: appealError } = await supabase
      .from('appeals')
      .update({ status: 'approved', resolved_at: new Date().toISOString(), resolved_by: user.id })
      .eq('id', appeal.id)
    if (appealError) {
      setBusyId(null)
      setActionError(appealError.message)
      return
    }
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ status: 'active', suspended_reason: null, suspended_at: null })
      .eq('id', appeal.profile_id)
    setBusyId(null)
    if (profileError) {
      setActionError(profileError.message)
      return
    }
    await load()
  }

  async function handleDenyAppeal(notes) {
    if (!denyTarget) return
    setBusyId(denyTarget.id)
    setActionError('')
    const { error } = await supabase
      .from('appeals')
      .update({ status: 'denied', admin_notes: notes || null, resolved_at: new Date().toISOString(), resolved_by: user.id })
      .eq('id', denyTarget.id)
    setBusyId(null)
    setDenyTarget(null)
    if (error) {
      setActionError(error.message)
      return
    }
    await load()
  }

  async function handleDeleteUser(userId) {
    setBusyId(userId)
    setActionError('')
    try {
      const { data, error } = await supabase.functions.invoke('admin-delete-user', { body: { userId } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setConfirmDeleteId(null)
      await load()
    } catch (err) {
      setActionError(
        err.message?.includes('Failed to fetch') || err.message?.includes('404')
          ? 'Could not reach the admin-delete-user function — has it been deployed yet? See supabase/functions/README.md.'
          : err.message || 'Could not delete that account.'
      )
    } finally {
      setBusyId(null)
    }
  }

  async function handleDeleteEvent(jobId) {
    setBusyId(jobId)
    setActionError('')
    const { error } = await supabase.from('job_postings').delete().eq('id', jobId)
    setBusyId(null)
    if (error) {
      setActionError(error.message)
      return
    }
    setConfirmDeleteId(null)
    setEvents((es) => es.filter((e) => e.id !== jobId))
  }

  const filteredOrganizers = locationFilter ? organizers.filter((o) => o.location === locationFilter) : organizers
  const filteredFreelancers = locationFilter
    ? freelancers.filter((f) => f.locations.includes(locationFilter))
    : freelancers
  const filteredEvents = locationFilter ? events.filter((e) => e.location === locationFilter) : events
  const visibleReports = reportFilter === 'open' ? reports.filter((r) => r.status === 'open') : reports
  const visibleAppeals = appealFilter === 'pending' ? appeals.filter((a) => a.status === 'pending') : appeals

  return (
    <div className="admin-shell">
      <div className="admin-header">
        <div>
          <h1 style={{ margin: 0 }}>Admin dashboard</h1>
          <p className="subtitle" style={{ margin: '2px 0 0' }}>Pulau Event — platform overview</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={handleSignOut}>
          Sign out
        </button>
      </div>

      <div className="admin-stats">
        <div className="stat-tile">
          <span className="subtitle">Freelancers</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>{freelancers.length}</span>
        </div>
        <div className="stat-tile">
          <span className="subtitle">Organizers</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>{organizers.length}</span>
        </div>
        <div className="stat-tile">
          <span className="subtitle">Events</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>{events.length}</span>
        </div>
        <div className="stat-tile">
          <span className="subtitle">Pending applications</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>{pendingApplications}</span>
        </div>
        <div className="stat-tile">
          <span className="subtitle">Open reports</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: openReportsCount > 0 ? 'var(--danger)' : 'var(--ink)' }}>
            {openReportsCount}
          </span>
        </div>
        <div className="stat-tile">
          <span className="subtitle">Pending appeals</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: pendingAppealsCount > 0 ? 'var(--sunset-dark)' : 'var(--ink)' }}>
            {pendingAppealsCount}
          </span>
        </div>
      </div>

      {emailsUnavailable && (
        <p className="helper-text" style={{ marginBottom: 16 }}>
          Email addresses aren't showing because the <code>admin-list-users</code> function isn't deployed yet — see{' '}
          <code>supabase/functions/README.md</code>. Everything else below still works.
        </p>
      )}
      {actionError && <p className="error-text" style={{ marginBottom: 16 }}>{actionError}</p>}

      <div className="row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div className="segmented" style={{ maxWidth: 560, flexWrap: 'wrap' }}>
          <button type="button" className={tab === 'organizers' ? 'active' : ''} onClick={() => setTab('organizers')}>
            Organizers
          </button>
          <button type="button" className={tab === 'freelancers' ? 'active' : ''} onClick={() => setTab('freelancers')}>
            Freelancers
          </button>
          <button type="button" className={tab === 'events' ? 'active' : ''} onClick={() => setTab('events')}>
            Events
          </button>
          <button type="button" className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}>
            Reports
            {openReportsCount > 0 && <span className="badge" style={{ marginLeft: 6 }}>{openReportsCount}</span>}
          </button>
          <button type="button" className={tab === 'appeals' ? 'active' : ''} onClick={() => setTab('appeals')}>
            Appeals
            {pendingAppealsCount > 0 && <span className="badge" style={{ marginLeft: 6 }}>{pendingAppealsCount}</span>}
          </button>
        </div>
        {(tab === 'organizers' || tab === 'freelancers' || tab === 'events') && (
          <>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              style={{ maxWidth: 220 }}
            >
              <option value="">All locations</option>
              {locationOptions.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
            {locationFilter && (
              <button type="button" className="btn btn-outline" style={{ padding: '6px 12px', fontSize: 12.5 }} onClick={() => setLocationFilter('')}>
                Clear filter
              </button>
            )}
          </>
        )}
        {tab === 'reports' && (
          <div className="segmented" style={{ maxWidth: 200 }}>
            <button type="button" className={reportFilter === 'open' ? 'active' : ''} onClick={() => setReportFilter('open')}>
              Open
            </button>
            <button type="button" className={reportFilter === 'all' ? 'active' : ''} onClick={() => setReportFilter('all')}>
              All
            </button>
          </div>
        )}
        {tab === 'appeals' && (
          <div className="segmented" style={{ maxWidth: 200 }}>
            <button type="button" className={appealFilter === 'pending' ? 'active' : ''} onClick={() => setAppealFilter('pending')}>
              Pending
            </button>
            <button type="button" className={appealFilter === 'all' ? 'active' : ''} onClick={() => setAppealFilter('all')}>
              All
            </button>
          </div>
        )}
      </div>

      {loading && <p className="subtitle">Loading…</p>}

      {!loading && tab === 'organizers' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Organizer</th>
                <th>Location</th>
                <th>Email</th>
                <th>Joined</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredOrganizers.map((o) => (
                <tr key={o.id}>
                  <td>{o.name || <span style={{ color: 'var(--muted)' }}>Onboarding not finished</span>}</td>
                  <td>{o.location || '—'}</td>
                  <td>{o.email || '—'}</td>
                  <td>{o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '—'}</td>
                  <td>
                    <StatusPill tone={o.status === 'suspended' ? 'danger' : 'success'}>
                      {o.status === 'suspended' ? 'Suspended' : 'Active'}
                    </StatusPill>
                  </td>
                  <td>
                    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <SuspendButton
                        profile={o}
                        busy={busyId === o.id}
                        onSuspend={() => setSuspendTarget({ id: o.id, name: o.name || 'this organizer' })}
                        onUnsuspend={() => handleUnsuspend(o.id)}
                      />
                      <DeleteButton
                        id={o.id}
                        confirmDeleteId={confirmDeleteId}
                        busy={busyId === o.id}
                        onArm={() => setConfirmDeleteId(o.id)}
                        onCancel={() => setConfirmDeleteId(null)}
                        onConfirm={() => handleDeleteUser(o.id)}
                      />
                    </span>
                  </td>
                </tr>
              ))}
              {filteredOrganizers.length === 0 && (
                <tr>
                  <td colSpan={6} className="subtitle" style={{ textAlign: 'center', padding: 20 }}>
                    {locationFilter ? `No organizers in ${locationFilter}.` : 'No organizers yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'freelancers' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Freelancer</th>
                <th>Locations</th>
                <th>Email</th>
                <th>Joined</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredFreelancers.map((f) => (
                <tr key={f.id}>
                  <td>{f.name || <span style={{ color: 'var(--muted)' }}>Onboarding not finished</span>}</td>
                  <td>{f.locations.length > 0 ? f.locations.join(', ') : '—'}</td>
                  <td>{f.email || '—'}</td>
                  <td>{f.createdAt ? new Date(f.createdAt).toLocaleDateString() : '—'}</td>
                  <td>
                    <StatusPill tone={f.status === 'suspended' ? 'danger' : 'success'}>
                      {f.status === 'suspended' ? 'Suspended' : 'Active'}
                    </StatusPill>
                  </td>
                  <td>
                    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <SuspendButton
                        profile={f}
                        busy={busyId === f.id}
                        onSuspend={() => setSuspendTarget({ id: f.id, name: f.name || 'this freelancer' })}
                        onUnsuspend={() => handleUnsuspend(f.id)}
                      />
                      <DeleteButton
                        id={f.id}
                        confirmDeleteId={confirmDeleteId}
                        busy={busyId === f.id}
                        onArm={() => setConfirmDeleteId(f.id)}
                        onCancel={() => setConfirmDeleteId(null)}
                        onConfirm={() => handleDeleteUser(f.id)}
                      />
                    </span>
                  </td>
                </tr>
              ))}
              {filteredFreelancers.length === 0 && (
                <tr>
                  <td colSpan={6} className="subtitle" style={{ textAlign: 'center', padding: 20 }}>
                    {locationFilter ? `No freelancers covering ${locationFilter}.` : 'No freelancers yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'events' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Organizer</th>
                <th>Location</th>
                <th>Dates</th>
                <th>Roles</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((job) => (
                <tr key={job.id}>
                  <td>{job.title}</td>
                  <td>{job.organizer_profiles?.org_name || '—'}</td>
                  <td>{job.location}</td>
                  <td>{formatEventDates(job.event_start_date, job.event_end_date)}</td>
                  <td>{job.job_divisions.map((d) => `${d.filled_count}/${d.quantity} ${d.skill}`).join(', ')}</td>
                  <td>
                    <DeleteButton
                      id={job.id}
                      confirmDeleteId={confirmDeleteId}
                      busy={busyId === job.id}
                      onArm={() => setConfirmDeleteId(job.id)}
                      onCancel={() => setConfirmDeleteId(null)}
                      onConfirm={() => handleDeleteEvent(job.id)}
                    />
                  </td>
                </tr>
              ))}
              {filteredEvents.length === 0 && (
                <tr>
                  <td colSpan={6} className="subtitle" style={{ textAlign: 'center', padding: 20 }}>
                    {locationFilter ? `No events in ${locationFilter}.` : 'No events yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'reports' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Reported profile</th>
                <th>Role</th>
                <th>Reported by</th>
                <th>Reason</th>
                <th>Details</th>
                <th>Filed</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleReports.map((r) => {
                const reported = nameById.get(r.reported_id)
                const reporter = nameById.get(r.reporter_id)
                return (
                  <tr key={r.id}>
                    <td>{reported?.name || 'Deleted profile'}</td>
                    <td>{reported?.role || '—'}</td>
                    <td>{reporter?.name || 'Deleted profile'}</td>
                    <td>{r.reason}</td>
                    <td style={{ whiteSpace: 'normal', minWidth: 200, maxWidth: 280 }}>{r.details || '—'}</td>
                    <td>{new Date(r.created_at).toLocaleDateString()}</td>
                    <td>
                      <StatusPill tone={r.status === 'open' ? 'danger' : r.status === 'resolved' ? 'success' : 'muted'}>
                        {r.status === 'open' ? 'Open' : r.status === 'resolved' ? 'Resolved' : 'Dismissed'}
                      </StatusPill>
                    </td>
                    <td>
                      {r.status === 'open' ? (
                        <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: '5px 10px', fontSize: 12, color: 'var(--danger)', borderColor: 'var(--danger)' }}
                            disabled={busyId === r.id}
                            onClick={() =>
                              setSuspendTarget({ id: r.reported_id, name: reported?.name || 'this profile', reportId: r.id, reason: r.reason })
                            }
                          >
                            Suspend profile
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: '5px 10px', fontSize: 12 }}
                            disabled={busyId === r.id}
                            onClick={() => resolveReport(r.id, 'dismissed')}
                          >
                            Dismiss
                          </button>
                        </span>
                      ) : (
                        <span className="subtitle" style={{ fontSize: 12 }}>
                          {r.resolved_at ? new Date(r.resolved_at).toLocaleDateString() : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {visibleReports.length === 0 && (
                <tr>
                  <td colSpan={8} className="subtitle" style={{ textAlign: 'center', padding: 20 }}>
                    {reportFilter === 'open' ? 'No open reports — nothing needs your attention right now.' : 'No reports yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'appeals' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Profile</th>
                <th>Role</th>
                <th>Message</th>
                <th>Filed</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleAppeals.map((a) => {
                const who = nameById.get(a.profile_id)
                return (
                  <tr key={a.id}>
                    <td>{who?.name || 'Deleted profile'}</td>
                    <td>{who?.role || '—'}</td>
                    <td style={{ whiteSpace: 'normal', minWidth: 220, maxWidth: 320 }}>{a.message}</td>
                    <td>{new Date(a.created_at).toLocaleDateString()}</td>
                    <td>
                      <StatusPill tone={a.status === 'pending' ? 'warn' : a.status === 'approved' ? 'success' : 'danger'}>
                        {a.status === 'pending' ? 'Pending' : a.status === 'approved' ? 'Approved' : 'Denied'}
                      </StatusPill>
                    </td>
                    <td>
                      {a.status === 'pending' ? (
                        <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ padding: '5px 10px', fontSize: 12 }}
                            disabled={busyId === a.id}
                            onClick={() => handleApproveAppeal(a)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: '5px 10px', fontSize: 12 }}
                            disabled={busyId === a.id}
                            onClick={() => setDenyTarget({ id: a.id, name: who?.name || 'this profile' })}
                          >
                            Deny
                          </button>
                        </span>
                      ) : (
                        <span className="subtitle" style={{ fontSize: 12 }}>
                          {a.resolved_at ? new Date(a.resolved_at).toLocaleDateString() : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {visibleAppeals.length === 0 && (
                <tr>
                  <td colSpan={6} className="subtitle" style={{ textAlign: 'center', padding: 20 }}>
                    {appealFilter === 'pending' ? 'No pending appeals.' : 'No appeals yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {suspendTarget && (
        <PromptModal
          title={`Suspend ${suspendTarget.name}`}
          label="Reason (shown to the person, and to you later in this dashboard)"
          placeholder="e.g. No-show on a confirmed event, reported by an organizer"
          defaultValue={suspendTarget.reason || ''}
          confirmLabel="Suspend"
          danger
          onCancel={() => setSuspendTarget(null)}
          onConfirm={handleSuspendConfirm}
        />
      )}

      {denyTarget && (
        <PromptModal
          title={`Deny ${denyTarget.name}'s appeal`}
          label="Note for the person (optional)"
          placeholder="e.g. The suspension stands because…"
          confirmLabel="Deny appeal"
          danger
          onCancel={() => setDenyTarget(null)}
          onConfirm={handleDenyAppeal}
        />
      )}
    </div>
  )
}

// Click once to arm ("Delete" → "Confirm?"), click again to actually delete —
// avoids a native confirm() dialog while still requiring a deliberate
// second action for something irreversible.
function DeleteButton({ id, confirmDeleteId, busy, onArm, onCancel, onConfirm }) {
  const armed = confirmDeleteId === id
  if (busy) {
    return (
      <button type="button" className="btn btn-outline" style={{ padding: '5px 10px', fontSize: 12 }} disabled>
        Deleting…
      </button>
    )
  }
  if (armed) {
    return (
      <span className="row" style={{ gap: 6 }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ padding: '5px 10px', fontSize: 12, background: 'var(--primary-dark)' }}
          onClick={onConfirm}
        >
          Confirm delete
        </button>
        <button type="button" className="btn btn-outline" style={{ padding: '5px 10px', fontSize: 12 }} onClick={onCancel}>
          Cancel
        </button>
      </span>
    )
  }
  return (
    <button type="button" className="btn btn-outline" style={{ padding: '5px 10px', fontSize: 12 }} onClick={onArm}>
      Delete
    </button>
  )
}

// Small colored outline chip for a status word (Active/Suspended,
// Open/Resolved/Dismissed, Pending/Approved/Denied) — reuses the existing
// chip styling so it doesn't need its own CSS.
const STATUS_PILL_COLORS = {
  success: 'var(--success)',
  danger: 'var(--danger)',
  warn: 'var(--sunset-dark)',
  muted: 'var(--muted)',
}
function StatusPill({ tone, children }) {
  const color = STATUS_PILL_COLORS[tone] || 'var(--muted)'
  return (
    <span className="chip chip-outline" style={{ color, borderColor: color, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}

// Toggles between "Suspend" (arms the reason prompt, handled by the parent
// via onSuspend) and "Reinstate" once a profile is already suspended.
function SuspendButton({ profile, busy, onSuspend, onUnsuspend }) {
  if (busy) {
    return (
      <button type="button" className="btn btn-outline" style={{ padding: '5px 10px', fontSize: 12 }} disabled>
        Working…
      </button>
    )
  }
  if (profile.status === 'suspended') {
    return (
      <button type="button" className="btn btn-outline" style={{ padding: '5px 10px', fontSize: 12 }} onClick={onUnsuspend}>
        Reinstate
      </button>
    )
  }
  return (
    <button
      type="button"
      className="btn btn-outline"
      style={{ padding: '5px 10px', fontSize: 12, color: 'var(--danger)', borderColor: 'var(--danger)' }}
      onClick={onSuspend}
    >
      Suspend
    </button>
  )
}

// One-field text prompt in a Modal — used for both the suspend reason and
// the appeal-denial note. onConfirm receives the trimmed text; the caller
// (AdminDashboard) owns the async request and clears its own target state
// once it resolves.
function PromptModal({ title, label, placeholder, defaultValue = '', confirmLabel, danger, onCancel, onConfirm }) {
  const [value, setValue] = useState(defaultValue)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    await onConfirm(value.trim())
    setBusy(false)
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <form className="stack" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="prompt-modal-value">{label}</label>
          <textarea
            id="prompt-modal-value"
            rows={4}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
          />
        </div>
        <div className="row">
          <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ flex: 1, background: danger ? 'var(--danger)' : undefined }}
            disabled={busy}
          >
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
