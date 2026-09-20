import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthProvider'
import { InfoButton } from './InfoButton'
import { Modal } from './Modal'
import { VendorForm } from '../pages/organizer/VendorRoster'

// Per-event Vendors tab — organizer-only, same as Budget. Lists vendor_roster
// entries booked on this event (via event_vendors) and, optionally, which
// Budget line item each is providing. "+ Add vendor" opens a one-click
// picker straight from the organizer-wide roster instead of re-entering
// details each time (see the "vendors-note" annotation on the design
// canvas) — or adds a brand-new vendor to the roster and books it in one
// step.
export function VendorsView({ jobId }) {
  const { user } = useAuth()
  const [booked, setBooked] = useState([]) // event_vendors rows joined with vendor_roster + budget item
  const [budgetItems, setBudgetItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: vendorRows, error: vendorError }, { data: itemRows }] = await Promise.all([
      supabase
        .from('event_vendors')
        .select('id, status, budget_item_id, vendor_roster(id, name, category, contact_name, contact_phone, contact_email), event_budget_items(id, item, category)')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false }),
      supabase.from('event_budget_items').select('id, category, item').eq('job_id', jobId).order('sort_order', { ascending: true }),
    ])
    if (vendorError) console.error(vendorError)
    setBooked(vendorRows || [])
    setBudgetItems(itemRows || [])
    setLoading(false)
  }, [jobId])

  useEffect(() => {
    load()
  }, [load])

  async function unbook(id) {
    const { error } = await supabase.from('event_vendors').delete().eq('id', id)
    if (error) {
      console.error(error)
      return
    }
    load()
  }

  async function linkBudgetItem(eventVendorId, budgetItemId) {
    const { error } = await supabase
      .from('event_vendors')
      .update({ budget_item_id: budgetItemId || null })
      .eq('id', eventVendorId)
    if (error) {
      console.error(error)
      return
    }
    load()
  }

  if (loading) return <p className="subtitle">Loading…</p>

  const bookedRosterIds = new Set(booked.map((b) => b.vendor_roster.id))

  return (
    <div className="ws-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p className="subtitle" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
          {booked.length} vendor{booked.length === 1 ? '' : 's'} booked on this event
          <InfoButton title="Vendors">
            Vendors are organizer-wide — add one here and it's saved to your roster for every future event too. Link a vendor to a Budget line item so it's clear who's providing that cost.
          </InfoButton>
        </p>
        <button type="button" className="btn btn-outline" style={{ padding: '7px 14px', fontSize: 12.5 }} onClick={() => setPickerOpen(true)}>
          + Add vendor
        </button>
      </div>

      {pickerOpen && (
        <VendorPickerModal
          organizerId={user.id}
          excludeIds={bookedRosterIds}
          onClose={() => setPickerOpen(false)}
          onBooked={() => {
            setPickerOpen(false)
            load()
          }}
          jobId={jobId}
        />
      )}

      {booked.length === 0 ? (
        <div className="empty-state">No vendors booked yet — add one from your roster or create a new one.</div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {booked.map((b) => (
            <div key={b.id} className="ws-panel vendor-card" style={{ background: 'var(--bg)' }}>
              <div className="vendor-top">
                <div>
                  <div className="vendor-name">{b.vendor_roster.name}</div>
                  <div className="vendor-meta">
                    {b.vendor_roster.category || 'Uncategorized'}
                    {b.vendor_roster.contact_name && ` · ${b.vendor_roster.contact_name}`}
                    {b.vendor_roster.contact_phone && ` · ${b.vendor_roster.contact_phone}`}
                  </div>
                </div>
                <button type="button" className="budget-icon-btn" onClick={() => unbook(b.id)} aria-label="Remove">
                  ✕
                </button>
              </div>
              <div className="field" style={{ marginTop: 10, marginBottom: 0, maxWidth: 320 }}>
                <label style={{ fontSize: 10.5 }}>Budget line item</label>
                <select value={b.budget_item_id || ''} onChange={(e) => linkBudgetItem(b.id, e.target.value || null)}>
                  <option value="">Not linked</option>
                  {budgetItems.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.category}
                      {it.item ? ` — ${it.item}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      <VendorRecruitPanel jobId={jobId} />
    </div>
  )
}

// Second, separate capability on this same tab: instead of booking from
// your private roster, post an open call that platform Vendor accounts can
// apply to — mirrors Recruiting for freelancers, just against
// vendor_slots/vendor_applications. Slot creation/toggling/deletion AND
// applicant review both live here, per-event — Team (see Team.jsx) is a
// pure connected-roster directory now, not a review inbox, so accepting or
// declining a vendor's application happens on the event it's for, same as
// a freelancer's "Review applicants" link next to Select team/Recruiting.
function VendorRecruitPanel({ jobId }) {
  const [slots, setSlots] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('vendor_slots')
      .select(
        'id, category, quantity, filled_count, budget_amount, budget_type, notes, open_recruit, vendor_applications(id, status, vendor_profiles(id, vendor_name, category, logo_url, locations))'
      )
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    setSlots(data || [])
    setLoading(false)
  }, [jobId])

  useEffect(() => {
    load()
  }, [load])

  async function createSlot(payload) {
    const { error } = await supabase.from('vendor_slots').insert({ ...payload, job_id: jobId })
    if (error) {
      console.error(error)
      return
    }
    setShowForm(false)
    load()
  }

  async function deleteSlot(id) {
    const { error } = await supabase.from('vendor_slots').delete().eq('id', id)
    if (error) {
      console.error(error)
      return
    }
    load()
  }

  async function toggleOpenRecruit(id, value) {
    const { error } = await supabase.from('vendor_slots').update({ open_recruit: value }).eq('id', id)
    if (error) {
      console.error(error)
      return
    }
    load()
  }

  async function respondApplication(applicationId, status) {
    const { error } = await supabase.from('vendor_applications').update({ status }).eq('id', applicationId)
    if (error) {
      console.error(error)
      return
    }
    load()
  }

  return (
    <div style={{ marginTop: 20, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p className="subtitle" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
          Recruit vendors
          <InfoButton title="Recruit vendors">
            Post an open call for a category and any Vendor account on Pulau Event can apply — separate from your
            private roster above. Accepting an application opens this event's team chat, same as accepting a
            freelancer.
          </InfoButton>
        </p>
        <button type="button" className="btn btn-outline" style={{ padding: '7px 14px', fontSize: 12.5 }} onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Post a vendor need'}
        </button>
      </div>

      {showForm && <VendorSlotForm onSave={createSlot} onCancel={() => setShowForm(false)} />}

      {loading && <p className="subtitle">Loading…</p>}
      {!loading && slots.length === 0 && !showForm && <div className="empty-state">No open calls posted for this event yet.</div>}

      <div className="stack" style={{ gap: 12 }}>
        {slots.map((slot) => {
          const pending = (slot.vendor_applications || []).filter((a) => a.status === 'pending')
          return (
            <div key={slot.id} className="ws-panel" style={{ background: 'var(--bg)' }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <strong style={{ fontSize: 13 }}>{slot.category}</strong>
                  <p className="subtitle" style={{ margin: '2px 0 0' }}>
                    {slot.filled_count}/{slot.quantity} filled
                    {slot.budget_amount && ` · Rp ${Number(slot.budget_amount).toLocaleString('id-ID')}${slot.budget_type === 'flat' ? ' flat' : ` / ${slot.budget_type}`}`}
                    {slot.open_recruit ? ' · Open' : ' · Closed'}
                  </p>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn btn-outline" style={{ padding: '5px 10px', fontSize: 11.5 }} onClick={() => toggleOpenRecruit(slot.id, !slot.open_recruit)}>
                    {slot.open_recruit ? 'Close' : 'Reopen'}
                  </button>
                  <button type="button" className="budget-icon-btn" onClick={() => deleteSlot(slot.id)} aria-label="Delete">
                    ✕
                  </button>
                </div>
              </div>
              {slot.notes && <p className="subtitle" style={{ margin: '6px 0 0' }}>{slot.notes}</p>}

              {pending.length > 0 && (
                <div className="stack" style={{ gap: 8, marginTop: 10 }}>
                  {pending.map((app) => (
                    <div key={app.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <div>
                        <strong style={{ fontSize: 12.5 }}>{app.vendor_profiles.vendor_name}</strong>
                        <p className="subtitle" style={{ margin: '2px 0 0' }}>
                          {app.vendor_profiles.category || 'Uncategorized'}
                          {(app.vendor_profiles.locations || []).length > 0 && ` · ${app.vendor_profiles.locations.join(', ')}`}
                        </p>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <button type="button" className="btn btn-outline" style={{ padding: '5px 10px', fontSize: 11.5 }} onClick={() => respondApplication(app.id, 'declined')}>
                          Decline
                        </button>
                        <button type="button" className="btn btn-primary" style={{ padding: '5px 10px', fontSize: 11.5 }} onClick={() => respondApplication(app.id, 'accepted')}>
                          Accept
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function VendorSlotForm({ onSave, onCancel }) {
  const [category, setCategory] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [notes, setNotes] = useState('')
  const [budgetAmount, setBudgetAmount] = useState('')
  const [budgetType, setBudgetType] = useState('flat')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!category.trim()) return
    setBusy(true)
    await onSave({
      category: category.trim(),
      quantity: Number(quantity) || 1,
      notes: notes.trim() || null,
      budget_amount: budgetAmount ? Number(budgetAmount) : null,
      budget_type: budgetAmount ? budgetType : null,
    })
    setBusy(false)
  }

  return (
    <div className="card stack" style={{ padding: 14, marginBottom: 12 }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Category</label>
        <input type="text" placeholder="e.g. Catering" value={category} onChange={(e) => setCategory(e.target.value)} />
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>How many</label>
          <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Budget (optional)</label>
          <input type="number" min="0" placeholder="Amount (IDR)" value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value)} />
        </div>
      </div>
      {budgetAmount && (
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Budget type</label>
          <select value={budgetType} onChange={(e) => setBudgetType(e.target.value)}>
            <option value="flat">flat</option>
            <option value="hourly">per hour</option>
            <option value="daily">per day</option>
          </select>
        </div>
      )}
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Notes (optional)</label>
        <textarea placeholder="What do you need from this vendor?" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="row">
        <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={busy || !category.trim()} onClick={submit}>
          {busy ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  )
}

function VendorPickerModal({ organizerId, excludeIds, onClose, onBooked, jobId }) {
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [addingNew, setAddingNew] = useState(false)

  useEffect(() => {
    supabase
      .from('vendor_roster')
      .select('*')
      .eq('organizer_id', organizerId)
      .order('name', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error(error)
        setRoster(data || [])
        setLoading(false)
      })
  }, [organizerId])

  async function book(vendorRosterId) {
    const { error } = await supabase.from('event_vendors').insert({ job_id: jobId, vendor_roster_id: vendorRosterId })
    if (error) {
      console.error(error)
      return
    }
    onBooked()
  }

  async function saveNewAndBook(payload) {
    const { data, error } = await supabase.from('vendor_roster').insert({ ...payload, organizer_id: organizerId }).select().single()
    if (error) {
      console.error(error)
      return
    }
    await book(data.id)
  }

  const available = roster.filter((v) => !excludeIds.has(v.id) && (!search.trim() || v.name.toLowerCase().includes(search.trim().toLowerCase())))

  return (
    <Modal title="Add vendor" onClose={onClose}>
      {addingNew ? (
        <VendorForm onSave={saveNewAndBook} onCancel={() => setAddingNew(false)} />
      ) : (
        <>
          <input type="text" placeholder="Search your roster…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12 }} />
          {loading && <p className="subtitle">Loading…</p>}
          {!loading && (
            <div className="pick-list">
              {available.length === 0 && (
                <p className="subtitle" style={{ padding: '6px 0' }}>
                  {roster.length === 0 ? "You haven't added any vendors yet." : 'No match, or every match is already booked.'}
                </p>
              )}
              {available.map((v) => (
                <div key={v.id} className="pick-row">
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{v.name}</div>
                    <div className="vendor-meta">{v.category || 'Uncategorized'}</div>
                  </div>
                  <button type="button" className="pick-add-btn" onClick={() => book(v.id)}>
                    + Add
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" className="add-new-vendor-link" onClick={() => setAddingNew(true)}>
            + Add a new vendor to your roster
          </button>
        </>
      )}
    </Modal>
  )
}
