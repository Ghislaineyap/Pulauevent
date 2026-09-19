import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { ProfileAvatar } from '../../components/ProfileAvatar'
import { InfoButton } from '../../components/InfoButton'
import { SkillIcon } from '../../components/SkillIcon'
import { IconStore } from '../../components/TabIcons'
import { formatEventDates } from '../../lib/date'
import { experienceBandLabel } from '../../lib/experience'

const todayISO = () => new Date().toISOString().slice(0, 10)

// Item 9: replaces "Post" in its exact tabbar slot. Where OrganizerDashboard
// was a read-only board of open-recruit divisions, Team holds two things
// bundled together per the project doc: (a) the applicant-review queue that
// used to be the whole of Post — now split into a People sub-board (ported
// straight from OrganizerDashboard) and a Vendor sub-board (adapted from the
// inline review that used to live on the per-event Vendors tab's
// "Recruit vendors" panel — see VendorsView.jsx, which now only handles slot
// creation/toggling, not review) — and (b) a directory of who's already on
// the team: connected freelancers (team_members) and connected vendors
// (accepted vendor_applications), deduplicated across every event.
export default function Team() {
  const { user } = useAuth()

  // --- People review board (ported from the old OrganizerDashboard) -------
  const [peopleJobs, setPeopleJobs] = useState([])
  const [peopleLoading, setPeopleLoading] = useState(true)
  const [expandedDivisionId, setExpandedDivisionId] = useState(null)
  const [applicantsByDivision, setApplicantsByDivision] = useState({})
  const [showArchivedPeople, setShowArchivedPeople] = useState(false)

  const loadPeople = useCallback(async () => {
    setPeopleLoading(true)
    const { data: jobRows, error } = await supabase
      .from('job_postings')
      .select('id, title, location, event_start_date, event_end_date, job_divisions(id, skill, quantity, filled_count, open_recruit)')
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

    setPeopleJobs(
      openJobs.map((j) => ({
        ...j,
        job_divisions: j.job_divisions.map((d) => ({ ...d, pendingCount: pendingByDivision.get(d.id) || 0 })),
      }))
    )
    setPeopleLoading(false)
  }, [user.id])

  useEffect(() => {
    loadPeople()
  }, [loadPeople])

  const loadDivisionApplicants = useCallback(async (divisionId) => {
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
    if (next && !applicantsByDivision[next]) loadDivisionApplicants(next)
  }

  async function respondPerson(divisionId, applicationId, status) {
    const { error } = await supabase.from('applications').update({ status }).eq('id', applicationId)
    if (error) {
      console.error(error)
      return
    }
    loadDivisionApplicants(divisionId)
    loadPeople()
  }

  // --- Vendor review board (adapted from VendorsView's old inline review) --
  const [vendorJobs, setVendorJobs] = useState([])
  const [vendorLoading, setVendorLoading] = useState(true)
  const [expandedSlotId, setExpandedSlotId] = useState(null)
  const [applicantsBySlot, setApplicantsBySlot] = useState({})
  const [showArchivedVendors, setShowArchivedVendors] = useState(false)

  const loadVendorSlots = useCallback(async () => {
    setVendorLoading(true)
    const { data: slotRows, error } = await supabase
      .from('vendor_slots')
      .select('id, category, quantity, filled_count, job_id, job_postings(id, title, location, event_start_date, event_end_date)')
      .eq('open_recruit', true)
    if (error) console.error(error)

    const slotIds = (slotRows || []).map((s) => s.id)
    const pendingBySlot = new Map()
    if (slotIds.length > 0) {
      const { data: apps, error: appsError } = await supabase
        .from('vendor_applications')
        .select('slot_id')
        .in('slot_id', slotIds)
        .eq('status', 'pending')
      if (appsError) console.error(appsError)
      ;(apps || []).forEach((a) => pendingBySlot.set(a.slot_id, (pendingBySlot.get(a.slot_id) || 0) + 1))
    }

    const byJob = new Map()
    ;(slotRows || []).forEach((s) => {
      const job = s.job_postings
      if (!job) return
      if (!byJob.has(job.id)) byJob.set(job.id, { ...job, slots: [] })
      byJob.get(job.id).slots.push({ ...s, pendingCount: pendingBySlot.get(s.id) || 0 })
    })
    setVendorJobs([...byJob.values()])
    setVendorLoading(false)
  }, [])

  useEffect(() => {
    loadVendorSlots()
  }, [loadVendorSlots])

  const loadSlotApplicants = useCallback(async (slotId) => {
    const { data, error } = await supabase
      .from('vendor_applications')
      .select('id, status, vendor_profiles(id, vendor_name, category, logo_url, locations)')
      .eq('slot_id', slotId)
      .eq('status', 'pending')
    if (error) console.error(error)
    setApplicantsBySlot((prev) => ({ ...prev, [slotId]: data || [] }))
  }, [])

  function toggleSlot(slotId) {
    const next = expandedSlotId === slotId ? null : slotId
    setExpandedSlotId(next)
    if (next && !applicantsBySlot[next]) loadSlotApplicants(next)
  }

  async function respondVendor(slotId, applicationId, status) {
    const { error } = await supabase.from('vendor_applications').update({ status }).eq('id', applicationId)
    if (error) {
      console.error(error)
      return
    }
    loadSlotApplicants(slotId)
    loadVendorSlots()
  }

  // --- "Your team" directory -----------------------------------------------
  const [connectedPeople, setConnectedPeople] = useState([])
  const [connectedVendors, setConnectedVendors] = useState([])
  const [directoryLoading, setDirectoryLoading] = useState(true)

  useEffect(() => {
    setDirectoryLoading(true)
    Promise.all([
      supabase
        .from('team_members')
        .select('freelancer_id, freelancer_profiles(id, name, gender, avatar_key, photo_urls, skills, locations)')
        .eq('organizer_id', user.id)
        .order('created_at', { ascending: false }),
      // RLS on vendor_applications already scopes rows to slots on this
      // organizer's own jobs, so no explicit organizer filter is needed here
      // — same shape as the pending-review queries above.
      supabase
        .from('vendor_applications')
        .select('id, vendor_profiles(id, vendor_name, category, logo_url, locations)')
        .eq('status', 'accepted'),
    ]).then(([peopleRes, vendorRes]) => {
      if (peopleRes.error) console.error(peopleRes.error)
      if (vendorRes.error) console.error(vendorRes.error)
      setConnectedPeople((peopleRes.data || []).map((t) => t.freelancer_profiles).filter(Boolean))

      const seen = new Set()
      const vendors = []
      ;(vendorRes.data || []).forEach((a) => {
        const v = a.vendor_profiles
        if (v && !seen.has(v.id)) {
          seen.add(v.id)
          vendors.push(v)
        }
      })
      setConnectedVendors(vendors)
      setDirectoryLoading(false)
    })
  }, [user.id])

  // Same "don't clutter the active board with events that already happened"
  // convention as the old Post tab.
  const today = todayISO()
  const activePeopleJobs = peopleJobs.filter((j) => j.event_end_date >= today)
  const archivedPeopleJobs = peopleJobs.filter((j) => j.event_end_date < today)
  const activeVendorJobs = vendorJobs.filter((j) => j.event_end_date >= today)
  const archivedVendorJobs = vendorJobs.filter((j) => j.event_end_date < today)

  const totalPeoplePending = activePeopleJobs.reduce((n, j) => n + j.job_divisions.reduce((m, d) => m + d.pendingCount, 0), 0)
  const totalVendorPending = activeVendorJobs.reduce((n, j) => n + j.slots.reduce((m, s) => m + s.pendingCount, 0), 0)
  const totalPending = totalPeoplePending + totalVendorPending

  return (
    <div className="app-shell">
      <Topbar title="Team" />
      <div className="page">
        <p className="subtitle" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
          Review applicants
          <InfoButton title="Review applicants">
            Everyone who's applied to a role or vendor slot you've opened to public recruiting, from every event, in
            one place. Turn "Recruiting" on for a role or slot from My Event or an event's Vendors tab to have it show
            up here.
          </InfoButton>
        </p>

        <h2 style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', margin: '10px 0 0' }}>
          People
        </h2>
        {peopleLoading && <p className="subtitle">Loading…</p>}
        {!peopleLoading && activePeopleJobs.length === 0 && <div className="empty-state">Nothing open for people right now.</div>}
        <div className="stack">
          {activePeopleJobs.map((job) => (
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
                                      onClick={() => respondPerson(d.id, app.id, 'declined')}
                                    >
                                      Decline
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-primary"
                                      style={{ flex: 1, padding: '8px 14px', fontSize: 12 }}
                                      onClick={() => respondPerson(d.id, app.id, 'accepted')}
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
        {archivedPeopleJobs.length > 0 && (
          <>
            <button type="button" className="btn btn-outline btn-block" onClick={() => setShowArchivedPeople((s) => !s)}>
              {showArchivedPeople ? 'Hide' : 'Show'} past events ({archivedPeopleJobs.length})
            </button>
            {showArchivedPeople && (
              <div className="stack">
                {archivedPeopleJobs.map((job) => (
                  <div key={job.id} className="card" style={{ padding: '14px 14px 6px', opacity: 0.7 }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 14.5 }}>{job.title}</h2>
                      <p className="subtitle" style={{ margin: '2px 0 0' }}>
                        📍 {job.location} · {formatEventDates(job.event_start_date, job.event_end_date)}
                      </p>
                    </div>
                    <div className="stack" style={{ gap: 6, marginTop: 8, paddingBottom: 10 }}>
                      {job.job_divisions.map((d) => (
                        <p key={d.id} className="subtitle" style={{ margin: 0 }}>
                          {d.skill} — {d.filled_count}/{d.quantity} filled
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <h2 style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', margin: '18px 0 0' }}>
          Vendors
        </h2>
        {vendorLoading && <p className="subtitle">Loading…</p>}
        {!vendorLoading && activeVendorJobs.length === 0 && <div className="empty-state">Nothing open for vendors right now.</div>}
        <div className="stack">
          {activeVendorJobs.map((job) => (
            <div key={job.id} className="card" style={{ padding: '14px 14px 6px' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 14.5 }}>{job.title}</h2>
                <p className="subtitle" style={{ margin: '2px 0 0' }}>
                  📍 {job.location} · {formatEventDates(job.event_start_date, job.event_end_date)}
                </p>
              </div>
              <div style={{ marginTop: 6 }}>
                {job.slots.map((s) => {
                  const expanded = expandedSlotId === s.id
                  const applicants = applicantsBySlot[s.id]
                  return (
                    <div key={s.id} style={{ borderTop: '1px solid var(--cloud)' }}>
                      <button
                        type="button"
                        onClick={() => toggleSlot(s.id)}
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
                        <div className="icon-badge"><IconStore style={{ width: 18, height: 18 }} /></div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{s.category}</div>
                          <p className="subtitle" style={{ margin: '2px 0 0' }}>
                            {s.filled_count}/{s.quantity} filled · Open recruit
                          </p>
                        </div>
                        {s.pendingCount > 0 && <span className="badge">{s.pendingCount}</span>}
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
                              const v = app.vendor_profiles
                              return (
                                <div key={app.id} className="card" style={{ padding: 11, background: 'var(--cloud)' }}>
                                  <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                                    <div
                                      style={{
                                        width: 34,
                                        height: 34,
                                        borderRadius: '50%',
                                        flexShrink: 0,
                                        backgroundColor: 'var(--bg)',
                                        backgroundImage: v.logo_url ? `url(${v.logo_url})` : 'none',
                                        backgroundSize: 'cover',
                                        backgroundPosition: 'center',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                      }}
                                    >
                                      {!v.logo_url && <IconStore style={{ width: 15, height: 15, color: 'var(--muted)' }} />}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{v.vendor_name}</div>
                                      <p className="subtitle" style={{ margin: '1px 0 0' }}>
                                        {v.category || 'Uncategorized'}
                                        {(v.locations || []).length > 0 && ` · ${v.locations.join(', ')}`}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="row" style={{ gap: 8, marginTop: 8 }}>
                                    <button
                                      type="button"
                                      className="btn btn-outline"
                                      style={{ flex: 1, padding: '8px 14px', fontSize: 12 }}
                                      onClick={() => respondVendor(s.id, app.id, 'declined')}
                                    >
                                      Decline
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-primary"
                                      style={{ flex: 1, padding: '8px 14px', fontSize: 12 }}
                                      onClick={() => respondVendor(s.id, app.id, 'accepted')}
                                    >
                                      Accept
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
        {archivedVendorJobs.length > 0 && (
          <>
            <button type="button" className="btn btn-outline btn-block" onClick={() => setShowArchivedVendors((s) => !s)}>
              {showArchivedVendors ? 'Hide' : 'Show'} past events ({archivedVendorJobs.length})
            </button>
            {showArchivedVendors && (
              <div className="stack">
                {archivedVendorJobs.map((job) => (
                  <div key={job.id} className="card" style={{ padding: '14px 14px 6px', opacity: 0.7 }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 14.5 }}>{job.title}</h2>
                      <p className="subtitle" style={{ margin: '2px 0 0' }}>
                        📍 {job.location} · {formatEventDates(job.event_start_date, job.event_end_date)}
                      </p>
                    </div>
                    <div className="stack" style={{ gap: 6, marginTop: 8, paddingBottom: 10 }}>
                      {job.slots.map((s) => (
                        <p key={s.id} className="subtitle" style={{ margin: 0 }}>
                          {s.category} — {s.filled_count}/{s.quantity} filled
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '22px 0 4px' }} />

        <p className="subtitle" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
          Your team
          <InfoButton title="Your team">
            Everyone you're already connected with, across every event — accepted freelancers and vendors, plus
            anyone you've manually added from their profile.
          </InfoButton>
        </p>

        <h2 style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', margin: '10px 0 0' }}>
          People
        </h2>
        {directoryLoading && <p className="subtitle">Loading…</p>}
        {!directoryLoading && connectedPeople.length === 0 && <div className="empty-state">No connected people yet.</div>}
        <div className="stack">
          {connectedPeople.map((f) => (
            <Link key={f.id} to={`/organizer/freelancers/${f.id}`} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <ProfileAvatar avatarKey={f.avatar_key} photoUrl={(f.photo_urls || [])[0]} size={40} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{f.name}</div>
                <p className="subtitle" style={{ margin: '2px 0 0' }}>
                  {(f.skills || []).slice(0, 3).join(', ')}
                  {(f.locations || []).length > 0 && ` · ${f.locations.join(', ')}`}
                </p>
              </div>
            </Link>
          ))}
        </div>

        <h2 style={{ fontSize: 12.5, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--muted)', margin: '14px 0 0' }}>
          Vendors
        </h2>
        {directoryLoading && <p className="subtitle">Loading…</p>}
        {!directoryLoading && connectedVendors.length === 0 && <div className="empty-state">No connected vendors yet.</div>}
        <div className="stack">
          {connectedVendors.map((v) => (
            <Link key={v.id} to={`/organizer/vendors-directory/${v.id}`} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  flexShrink: 0,
                  backgroundColor: 'var(--cloud)',
                  backgroundImage: v.logo_url ? `url(${v.logo_url})` : 'none',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {!v.logo_url && <IconStore style={{ width: 18, height: 18, color: 'var(--muted)' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{v.vendor_name}</div>
                <p className="subtitle" style={{ margin: '2px 0 0' }}>
                  {v.category || 'Uncategorized'}
                  {(v.locations || []).length > 0 && ` · ${v.locations.join(', ')}`}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <OrganizerTabbar pendingCount={totalPending} />
    </div>
  )
}
