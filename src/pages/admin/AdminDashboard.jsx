import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { formatEventDates } from '../../lib/date'

// Platform overview + user/event management. Deliberately its own layout
// (not the mobile app-shell the rest of the app uses) — this is a desktop
// tool for the person running the platform, not a screen a freelancer or
// organizer ever sees.
export default function AdminDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('users') // 'users' | 'events'
  const [users, setUsers] = useState([])
  const [events, setEvents] = useState([])
  const [pendingApplications, setPendingApplications] = useState(0)
  const [emailsUnavailable, setEmailsUnavailable] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
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
      { count: pendingCount, error: pendingError },
    ] = await Promise.all([
      supabase.from('profiles').select('id, role, created_at'),
      supabase.from('freelancer_profiles').select('id, name'),
      supabase.from('organizer_profiles').select('id, org_name'),
      supabase
        .from('job_postings')
        .select(
          'id, title, location, event_start_date, event_end_date, created_at, organizer_id, organizer_profiles(org_name), job_divisions(id, skill, quantity, filled_count)'
        )
        .order('created_at', { ascending: false }),
      supabase.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ])
    if (profilesError) console.error(profilesError)
    if (freelancerError) console.error(freelancerError)
    if (organizerError) console.error(organizerError)
    if (jobsError) console.error(jobsError)
    if (pendingError) console.error(pendingError)
    setPendingApplications(pendingCount || 0)
    setEvents(jobRows || [])

    const nameById = new Map()
    ;(freelancerRows || []).forEach((f) => nameById.set(f.id, f.name))
    ;(organizerRows || []).forEach((o) => nameById.set(o.id, o.org_name))

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

    setUsers(
      (profileRows || []).map((p) => ({
        id: p.id,
        role: p.role,
        name: nameById.get(p.id) || null,
        email: emailById.get(p.id) || null,
        createdAt: p.created_at,
      }))
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/admin/login')
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

  const freelancerCount = users.filter((u) => u.role === 'freelancer').length
  const organizerCount = users.filter((u) => u.role === 'organizer').length

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
          <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>{freelancerCount}</span>
        </div>
        <div className="stat-tile">
          <span className="subtitle">Organizers</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>{organizerCount}</span>
        </div>
        <div className="stat-tile">
          <span className="subtitle">Events</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>{events.length}</span>
        </div>
        <div className="stat-tile">
          <span className="subtitle">Pending applications</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)' }}>{pendingApplications}</span>
        </div>
      </div>

      {emailsUnavailable && (
        <p className="helper-text" style={{ marginBottom: 16 }}>
          Email addresses aren't showing because the <code>admin-list-users</code> function isn't deployed yet — see{' '}
          <code>supabase/functions/README.md</code>. Everything else below still works.
        </p>
      )}
      {actionError && <p className="error-text" style={{ marginBottom: 16 }}>{actionError}</p>}

      <div className="segmented" style={{ maxWidth: 280, marginBottom: 16 }}>
        <button type="button" className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>
          Users
        </button>
        <button type="button" className={tab === 'events' ? 'active' : ''} onClick={() => setTab('events')}>
          Events
        </button>
      </div>

      {loading && <p className="subtitle">Loading…</p>}

      {!loading && tab === 'users' && (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Name</th>
                <th>Email</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ textTransform: 'capitalize' }}>{u.role}</td>
                  <td>{u.name || <span style={{ color: 'var(--muted)' }}>Onboarding not finished</span>}</td>
                  <td>{u.email || '—'}</td>
                  <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}</td>
                  <td>
                    <DeleteButton
                      id={u.id}
                      confirmDeleteId={confirmDeleteId}
                      busy={busyId === u.id}
                      onArm={() => setConfirmDeleteId(u.id)}
                      onCancel={() => setConfirmDeleteId(null)}
                      onConfirm={() => handleDeleteUser(u.id)}
                    />
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="subtitle" style={{ textAlign: 'center', padding: 20 }}>
                    No accounts yet.
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
              {events.map((job) => (
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
              {events.length === 0 && (
                <tr>
                  <td colSpan={6} className="subtitle" style={{ textAlign: 'center', padding: 20 }}>
                    No events yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
