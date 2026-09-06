import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { formatEventDates } from '../../lib/date'

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
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('organizers') // 'organizers' | 'freelancers' | 'events'
  const [locationFilter, setLocationFilter] = useState('')
  const [locationOptions, setLocationOptions] = useState([])
  const [organizers, setOrganizers] = useState([])
  const [freelancers, setFreelancers] = useState([])
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
      { data: locationRows, error: locationsError },
      { count: pendingCount, error: pendingError },
    ] = await Promise.all([
      supabase.from('profiles').select('id, created_at'),
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
    ])
    if (profilesError) console.error(profilesError)
    if (freelancerError) console.error(freelancerError)
    if (organizerError) console.error(organizerError)
    if (jobsError) console.error(jobsError)
    if (locationsError) console.error(locationsError)
    if (pendingError) console.error(pendingError)
    setPendingApplications(pendingCount || 0)
    setEvents(jobRows || [])
    setLocationOptions((locationRows || []).map((l) => l.label))

    const createdAtById = new Map((profileRows || []).map((p) => [p.id, p.created_at]))

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
      }))
    )
    setFreelancers(
      (freelancerRows || []).map((f) => ({
        id: f.id,
        name: f.name,
        locations: f.locations || [],
        email: emailById.get(f.id) || null,
        createdAt: createdAtById.get(f.id),
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

  const filteredOrganizers = locationFilter ? organizers.filter((o) => o.location === locationFilter) : organizers
  const filteredFreelancers = locationFilter
    ? freelancers.filter((f) => f.locations.includes(locationFilter))
    : freelancers
  const filteredEvents = locationFilter ? events.filter((e) => e.location === locationFilter) : events

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
      </div>

      {emailsUnavailable && (
        <p className="helper-text" style={{ marginBottom: 16 }}>
          Email addresses aren't showing because the <code>admin-list-users</code> function isn't deployed yet — see{' '}
          <code>supabase/functions/README.md</code>. Everything else below still works.
        </p>
      )}
      {actionError && <p className="error-text" style={{ marginBottom: 16 }}>{actionError}</p>}

      <div className="row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div className="segmented" style={{ maxWidth: 380 }}>
          <button type="button" className={tab === 'organizers' ? 'active' : ''} onClick={() => setTab('organizers')}>
            Organizers
          </button>
          <button type="button" className={tab === 'freelancers' ? 'active' : ''} onClick={() => setTab('freelancers')}>
            Freelancers
          </button>
          <button type="button" className={tab === 'events' ? 'active' : ''} onClick={() => setTab('events')}>
            Events
          </button>
        </div>
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
                    <DeleteButton
                      id={o.id}
                      confirmDeleteId={confirmDeleteId}
                      busy={busyId === o.id}
                      onArm={() => setConfirmDeleteId(o.id)}
                      onCancel={() => setConfirmDeleteId(null)}
                      onConfirm={() => handleDeleteUser(o.id)}
                    />
                  </td>
                </tr>
              ))}
              {filteredOrganizers.length === 0 && (
                <tr>
                  <td colSpan={5} className="subtitle" style={{ textAlign: 'center', padding: 20 }}>
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
                    <DeleteButton
                      id={f.id}
                      confirmDeleteId={confirmDeleteId}
                      busy={busyId === f.id}
                      onArm={() => setConfirmDeleteId(f.id)}
                      onCancel={() => setConfirmDeleteId(null)}
                      onConfirm={() => handleDeleteUser(f.id)}
                    />
                  </td>
                </tr>
              ))}
              {filteredFreelancers.length === 0 && (
                <tr>
                  <td colSpan={5} className="subtitle" style={{ textAlign: 'center', padding: 20 }}>
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
