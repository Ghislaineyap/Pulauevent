import { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, VendorTabbar } from '../../components/Layout'
import { formatEventDates } from '../../lib/date'

// Vendor counterpart of freelancer/JobFeed.jsx — browses open vendor_slots
// (an organizer's open call for a category on a specific event) instead of
// job_divisions, and applies inline from the card rather than a separate
// detail page, since a vendor slot doesn't carry a jobdesk to read first the
// way a freelancer role does.
export default function VendorJobFeed() {
  const { user } = useAuth()
  const [rawJobs, setRawJobs] = useState([])
  const [myApplications, setMyApplications] = useState(new Map()) // slot_id -> status
  const [loading, setLoading] = useState(true)
  const [applyingSlotId, setApplyingSlotId] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data, error: jobsError }, { data: myApps, error: appsError }] = await Promise.all([
      supabase
        .from('job_postings')
        .select(
          'id, title, location, event_start_date, event_end_date, organizer_profiles(org_name), vendor_slots(id, category, quantity, filled_count, budget_amount, budget_type, notes, open_recruit)'
        )
        .eq('status', 'open')
        .order('created_at', { ascending: false }),
      supabase.from('vendor_applications').select('slot_id, status').eq('vendor_id', user.id),
    ])
    if (jobsError) console.error(jobsError)
    if (appsError) console.error(appsError)
    const recruiting = (data || [])
      .map((j) => ({ ...j, vendor_slots: j.vendor_slots.filter((s) => s.open_recruit && s.filled_count < s.quantity) }))
      .filter((j) => j.vendor_slots.length > 0)
    setRawJobs(recruiting)
    setMyApplications(new Map((myApps || []).map((a) => [a.slot_id, a.status])))
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  const jobs = useMemo(() => rawJobs, [rawJobs])

  async function apply(slotId) {
    setError('')
    setApplyingSlotId(slotId)
    const { error: applyError } = await supabase.from('vendor_applications').insert({ slot_id: slotId, vendor_id: user.id })
    setApplyingSlotId(null)
    if (applyError) {
      console.error(applyError)
      setError('Could not apply — try again in a moment.')
      return
    }
    load()
  }

  return (
    <div className="app-shell">
      <Topbar title="Opportunities" />
      <div className="page">
        <p className="subtitle">Open calls for vendors, across every event currently recruiting.</p>
        {error && <p className="error-text">{error}</p>}

        {loading && <p className="subtitle">Loading…</p>}
        {!loading && jobs.length === 0 && <div className="empty-state">No open calls for vendors right now — check back later.</div>}

        <div className="stack">
          {jobs.map((job) => (
            <div key={job.id} className="card stack">
              <div>
                <h2 style={{ margin: 0 }}>{job.title}</h2>
                <p className="subtitle" style={{ margin: '4px 0 0' }}>
                  {job.organizer_profiles.org_name} · 📍 {job.location} · {formatEventDates(job.event_start_date, job.event_end_date)}
                </p>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {job.vendor_slots.map((slot) => {
                  const myStatus = myApplications.get(slot.id)
                  return (
                    <div key={slot.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <div>
                        <strong style={{ fontSize: 13 }}>{slot.category}</strong>
                        <p className="subtitle" style={{ margin: '2px 0 0' }}>
                          {slot.quantity - slot.filled_count} spot{slot.quantity - slot.filled_count === 1 ? '' : 's'} left
                          {slot.budget_amount && ` · Rp ${Number(slot.budget_amount).toLocaleString('id-ID')}${slot.budget_type === 'flat' ? ' flat' : ` / ${slot.budget_type}`}`}
                        </p>
                        {slot.notes && <p className="subtitle" style={{ margin: '2px 0 0' }}>{slot.notes}</p>}
                      </div>
                      {myStatus ? (
                        <span className="chip chip-outline">{myStatus === 'pending' ? 'Applied' : myStatus}</span>
                      ) : (
                        <button type="button" className="btn btn-primary" style={{ padding: '6px 14px', fontSize: 12.5 }} disabled={applyingSlotId === slot.id} onClick={() => apply(slot.id)}>
                          {applyingSlotId === slot.id ? 'Applying…' : 'Apply'}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <VendorTabbar />
    </div>
  )
}
