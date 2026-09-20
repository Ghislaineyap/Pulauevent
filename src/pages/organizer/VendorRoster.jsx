import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { InfoButton } from '../../components/InfoButton'
import { Topbar, OrganizerTabbar } from '../../components/Layout'

// Same category vocabulary as the Budget tab's line items, so a vendor
// picked from here reads consistently with the ledger it's usually tied to
// — but stored as free text (not a foreign key), so a one-off category
// typed here doesn't require a schema change.
export const VENDOR_CATEGORIES = [
  'Venue & Rentals',
  'Catering & Beverage',
  'Décor & Styling',
  'Entertainment & AV',
  'Photography & Video',
  'Staffing & Labor',
  'Transportation & Logistics',
  'Marketing & Print',
  'Beauty & Attire',
  'Gifts & Favors',
  'Technology & Equipment',
  'Other',
]

// Organizer-wide, reused across every event — same idea as the existing
// Team roster (team_members table), but for vendors instead of freelancers.
// Reachable from the desktop sidebar AND, since the 2026-09-20 nav
// restructure, the mobile tabbar too (see DesktopSidebar.jsx/Layout.jsx) —
// wrapped in the same app-shell/Topbar/OrganizerTabbar every other mobile
// tab uses (the .desktop-workspace div inside still gets the wide desktop
// treatment via the .ws-app-shell override in index.css), so there's
// somewhere to navigate back to on a phone instead of a dead end. Adding a
// vendor to the roster is no longer done here — see the "+ Add vendor" flow
// on an event's own Vendors tab, which creates the roster entry and books it
// onto that event in one step; this page is edit/remove on existing entries.
export default function VendorRoster() {
  const { user } = useAuth()
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState(null)
  const [formOpen, setFormOpen] = useState(false) // false | vendorId

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('vendor_roster').select('*').eq('organizer_id', user.id).order('created_at', { ascending: false })
    if (error) console.error(error)
    setVendors(data || [])
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  async function saveVendor(payload, id) {
    if (id) {
      const { error } = await supabase.from('vendor_roster').update(payload).eq('id', id)
      if (error) {
        console.error(error)
        return
      }
    } else {
      const { error } = await supabase.from('vendor_roster').insert({ ...payload, organizer_id: user.id })
      if (error) {
        console.error(error)
        return
      }
    }
    setFormOpen(false)
    load()
  }

  async function deleteVendor(id) {
    const { error } = await supabase.from('vendor_roster').delete().eq('id', id)
    if (error) {
      console.error(error)
      return
    }
    load()
  }

  const categoriesInUse = useMemo(() => [...new Set(vendors.map((v) => v.category).filter(Boolean))], [vendors])

  const filtered = vendors.filter((v) => {
    if (activeCategory && v.category !== activeCategory) return false
    if (search.trim() && !`${v.name} ${v.category || ''} ${v.contact_name || ''}`.toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })

  return (
    <div className="app-shell ws-app-shell">
      <Topbar title="Vendor management" />
      <div className="desktop-workspace">
        {/* No h1 here — Topbar above already carries the "Vendor management"
            title (on mobile and desktop alike, now that this page is
            reachable from the tabbar too), so this header is just the
            explanatory subtitle. */}
        <div className="ws-header">
          <p className="ws-meta" style={{ display: 'flex', alignItems: 'center', margin: 0 }}>
            Your reusable vendor list — book any of these straight from an event's Vendors tab.
            <InfoButton title="Vendor management">
              Vendors here are organizer-wide, same as your Team roster. To add a new one, use "+ Add vendor" on an
              event's Vendors tab — that books it onto that event and adds it to this roster in one step.
            </InfoButton>
          </p>
        </div>

        <div className="roster-search-row">
          <input type="text" placeholder="Search vendors…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {categoriesInUse.length > 0 && (
          <div className="chip-row-desktop">
            <button type="button" className={`filter-chip${!activeCategory ? ' active' : ''}`} onClick={() => setActiveCategory(null)}>
              All
            </button>
            {categoriesInUse.map((c) => (
              <button key={c} type="button" className={`filter-chip${activeCategory === c ? ' active' : ''}`} onClick={() => setActiveCategory(c)}>
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="stack" style={{ marginTop: 18, gap: 14, maxWidth: 640 }}>
          {loading && <p className="subtitle">Loading…</p>}
          {!loading && filtered.length === 0 && (
            <div className="empty-state">
              {vendors.length === 0
                ? 'No vendors yet — add your first one from an event\'s Vendors tab.'
                : 'No vendors match that search.'}
            </div>
          )}

          {filtered.map((v) =>
            formOpen === v.id ? (
              <VendorForm key={v.id} vendor={v} onSave={(payload) => saveVendor(payload, v.id)} onCancel={() => setFormOpen(false)} />
            ) : (
              <div key={v.id} className="ws-panel vendor-card">
                <div className="vendor-top">
                  <div>
                    <div className="vendor-name">{v.name}</div>
                    <div className="vendor-meta">
                      {v.category || 'Uncategorized'}
                      {v.contact_name && ` · ${v.contact_name}`}
                      {v.contact_phone && ` · ${v.contact_phone}`}
                    </div>
                    {v.notes && (
                      <p className="subtitle" style={{ margin: '6px 0 0' }}>
                        {v.notes}
                      </p>
                    )}
                  </div>
                  <div className="budget-row-actions">
                    <button type="button" className="budget-icon-btn" onClick={() => setFormOpen(v.id)} aria-label="Edit">
                      ✎
                    </button>
                    <button type="button" className="budget-icon-btn" onClick={() => deleteVendor(v.id)} aria-label="Delete">
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </div>
      <OrganizerTabbar />
    </div>
  )
}

export function VendorForm({ vendor, onSave, onCancel }) {
  const [name, setName] = useState(vendor?.name || '')
  const [category, setCategory] = useState(vendor?.category || VENDOR_CATEGORIES[0])
  const [contactName, setContactName] = useState(vendor?.contact_name || '')
  const [contactPhone, setContactPhone] = useState(vendor?.contact_phone || '')
  const [contactEmail, setContactEmail] = useState(vendor?.contact_email || '')
  const [notes, setNotes] = useState(vendor?.notes || '')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!name.trim()) return
    setBusy(true)
    await onSave({
      name: name.trim(),
      category,
      contact_name: contactName.trim() || null,
      contact_phone: contactPhone.trim() || null,
      contact_email: contactEmail.trim() || null,
      notes: notes.trim() || null,
    })
    setBusy(false)
  }

  return (
    <div className="card stack" style={{ padding: 14 }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Vendor name</label>
        <input type="text" placeholder="e.g. Ombak Spaces" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Category</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {VENDOR_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Contact name</label>
        <input type="text" placeholder="optional" value={contactName} onChange={(e) => setContactName(e.target.value)} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Phone</label>
        <input type="text" placeholder="optional" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Email</label>
        <input type="email" placeholder="optional" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Notes</label>
        <textarea placeholder="optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="row">
        <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={busy || !name.trim()} onClick={submit}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
