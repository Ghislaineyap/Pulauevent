import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { ProfileAvatar } from '../../components/ProfileAvatar'
import { InfoButton } from '../../components/InfoButton'
import { SkillIcon } from '../../components/SkillIcon'
import { formatEventDates } from '../../lib/date'
import { experienceBandLabel } from '../../lib/experience'

// "Post" — a read-only board of whatever's currently open to public
// recruiting (set from My Event → Manage event → Recruiting). Private
// divisions never appear here at all. Tapping a division expands it right
// here so accepting/declining a pending applicant doesn't need a whole page
// navigation; "Compare & filter" still deep-links to the fuller review page
// for when there are enough applicants that filtering actually helps.
export default function OrganizerDashboard() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showInfo, setShowInfo] = useState(false)
  const [expandedDivisionId, setExpandedDivisionId] = useState(null)
  const [applicantsByDivision, setApplicantsByDivision] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    const { data: jobRows, error } = await supabase
      .from('job_postings')
      .select(
        'id, title, location, event_start_date, event_end_date, job_divisions(id, skill, quantity, filled_count, open_recruit)'
      )
      .eq('organizer_id', user.id)
      .order('created_at', { ascending: false })
    if (error) console.error(error)

    const openJobs = (jobRows || [])
      .map((j) => ({ ...j, job_divisions: j.job_divisions.filter((d) => d.open_recruit) }))
      .filter((j) => j.job_divisions.length > 0)

    const divisionIds = openJobs.flatMap((j) => j.job_divisions.map((d) => d.id))
    const pendingByDivision = new Map()
    if (divisionIds.length > 0) {
      const { data: apps, error: appsError } = await supabase
        .from('applications')
        .select('division_id')
        .in('division_id', divisionIds)
        .eq('status', 'pending')
      if (appsError) console.error(appsError)
      ;(apps || []).forEach((a) => {
        pendingByDivision.set(a.division_id, (pendingByDivision.get(a.division_id) || 0) + 1)
      })
    }

    setJobs(
      openJobs.map((j) => ({
        ...j,
        job_divisions: j.job_divisions.map((d) => ({ ...d, pendingCount: pendingByDivision.get(d.id) || 0 })),
      }))
    )
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  const loadApplicants = useCallback(async (divisionId) => {
    const { data, error } = await supabase
      .from('applications')
      .select('id, status, freelancer_profiles(id, name, gender, locations, avatar_key, photo_urls, pitch, experience_band)')
      .eq('division_id', divisionId)
      .eq('status', 'pending')
    if (error) console.error(error)
    setApplicantsByDivision((prev) => ({ ...prev, [divisionId]: data || [] }))
  }, [])

  function toggleDivision(divisionId) {
    const next = expandedDivisionId === divisionId ? null : divisionId
    setExpandedDivisionId(next)
    if (next && !applicantsByDivision[next]) loadApplicants(next)
  }

  async function respond(divisionId, applicationId, status) {
    const { error } = await supabase.from('applications').update({ status }).eq('id', applicationId)
    if (error) {
      console.error(error)
      return
    }
    loadApplicants(divisionId)
    load()
  }

  const totalPending = jobs.reduce((n, j) => n + j.job_divisions.reduce((m, d) => m + d.pendingCount, 0), 0)

  return (
    <div className="app-shell">
      <Topbar title="Post" />
      <div className="page">
        <p className="subtitle" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
          Open recruiting
          <InfoButton title="Open recruiting">
            Every division you've opened to public recruiting, in one place. Tap one to review whoever's applied.
          </InfoButton>
        </p>

        {loading && <p className="subtitle">Loading…</p>}
        {!loading && jobs.length === 0 && (
          <div className="empty-state">
            Nothing open right now — turn on "Recruiting" for a role from My Event → Manage event when you want it to
            show up here.
          </div>
        )}

        <div className="stack">
          {jobs.map((job) => (
            <div key={job.id} className="card" style={{ padding: '14px 14px 6px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 14.5 }}>{job.title}</h2>
                <p className="subtitle" style={{ margin: '2px 0 0' }}>
                  📍 {job.location} · {formatEventDates(job.event_start_date, job.event_end_date)}
                </p>
              </div>
              <div style={{ marginTop: 6 }}>
                {job.job_divisions.map((d) => {
                  const expanded = expandedDivisionId === d.id
                  const applicants = applicantsByDivision[d.id]
                  return (
                    <div key={d.id} style={{ borderTop: '1px solid var(--cloud)' }}>
                      <button
                        type="button"
                        onClick={() => toggleDivision(d.id)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          border: 'none',
                          background: 'transparent',
                          padding: '12px 4px',
                          fontFamily: 'inherit',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        <div className="icon-badge"><SkillIcon skill={d.skill} /></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{d.skill}</div>
                          <p className="subtitle" style={{ margin: '2px 0 0' }}>
                            {d.filled_count}/{d.quantity} filled · Open recruit
                          </p>
                        </div>
                        {d.pendingCount > 0 && <span className="badge">{d.pendingCount}</span>}
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--muted)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
                        >
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </button>

                      {expanded && (
                        <div style={{ padding: '2px 4px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {applicants === undefined && <p className="subtitle">Loading…</p>}
                          {applicants && applicants.length === 0 && (
                            <p className="subtitle" style={{ textAlign: 'center', padding: '10px 0', margin: 0 }}>
                              No applicants left to review.
                            </p>
                          )}
                          {applicants &&
                            applicants.map((app) => {
                              const f = app.freelancer_profiles
                              return (
                                <div key={app.id} className="card" style={{ padding: 11, background: 'var(--cloud)' }}>
                                  <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                                    <ProfileAvatar avatarKey={f.avatar_key} photoUrl={(f.photo_urls || [])[0]} size={34} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{f.name}</div>
                                      <p className="subtitle" style={{ margin: '1px 0 0' }}>
                                        {(f.locations || []).join(', ')}
                                        {f.experience_band && ` · ${experienceBandLabel(f.experience_band)}`}
                                      </p>
                                    </div>
                                  </div>
                                  {f.pitch && <p style={{ fontSize: 11.5, color: 'var(--muted)', margin: '8px 0' }}>{f.pitch}</p>}
                                  <div className="row" style={{ gap: 8 }}>
                                    <button
                                      type="button"
                                      className="btn btn-outline"
                                      style={{ flex: 1, padding: '8px 14px', fontSize: 12 }}
                                      onClick={() => respond(d.id, app.id, 'declined')}
                                    >
                                      Decline
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-primary"
                                      style={{ flex: 1, padding: '8px 14px', fontSize: 12 }}
                                      onClick={() => respond(d.id, app.id, 'accepted')}
                                    >
                                      Accept
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          {applicants && applicants.length > 1 && (
                            <Link
                              to={`/organizer/jobs/${job.id}/applicants`}
                              className="subtitle"
                              style={{ textAlign: 'center', fontWeight: 600, color: 'var(--primary-dark)' }}
                            >
                              Compare &amp; filter these applicants →
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <OrganizerTabbar pendingCount={totalPending} />
    </div>
  )
}
