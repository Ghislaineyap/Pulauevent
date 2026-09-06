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
