import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { IconStore } from '../../components/TabIcons'
import { formatPriceRange } from '../../lib/vendorPrice'

// Item 8's other half of Discover — a full public directory over
// vendor_profiles (every Vendor account on the platform), not filtered down
// to vendors the organizer is already connected to. Unlike People, there's
// no like/skip/invite action here yet — no schema exists for an organizer to
// "shortlist" a vendor the way `likes` does for freelancers — so this stays
// deliberately read-only: search, filter by category, and open a profile.
// (See the project doc's "deliberately deferred" list — a direct-invite flow
// is a follow-on, not part of this pass.)
const emptyFilters = { categories: [], locations: [] }

export function VendorBrowse() {
  const navigate = useNavigate()
  const [vendors, setVendors] = useState([])
  const [categoryOrder, setCategoryOrder] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState(emptyFilters)

  useEffect(() => {
    supabase
      .from('vendor_profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error(error)
        setVendors(data || [])
        setLoading(false)
      })
    supabase
      .from('vendor_categories')
      .select('label')
      .order('sort_order')
      .then(({ data }) => setCategoryOrder((data || []).map((c) => c.label)))
  }, [])

  const categoriesInUse = useMemo(() => {
    const set = new Set(vendors.map((v) => v.category).filter(Boolean))
    // Keep the platform's canonical order rather than insertion order, same
    // spirit as VendorRoster's own category filter chips.
    return categoryOrder.filter((c) => set.has(c))
  }, [vendors, categoryOrder])

  const locationOptions = useMemo(() => {
    const set = new Set()
    vendors.forEach((v) => (v.locations || []).forEach((l) => set.add(l)))
    return [...set].sort()
  }, [vendors])

  function toggleFilter(category, value) {
    setFilters((f) => ({
      ...f,
      [category]: f[category].includes(value) ? f[category].filter((v) => v !== value) : [...f[category], value],
    }))
  }

  const activeFilterCount = Object.values(filters).reduce((n, arr) => n + arr.length, 0)

  const filtered = vendors.filter((v) => {
    if (filters.categories.length && !filters.categories.includes(v.category)) return false
    if (filters.locations.length && !(v.locations || []).some((l) => filters.locations.includes(l))) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const haystack = `${v.vendor_name} ${v.category || ''} ${(v.locations || []).join(' ')}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })

  return (
    <>
      <input
        type="text"
        placeholder="Search vendors…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <button
        className="btn btn-outline btn-block"
        style={{ justifyContent: 'space-between' }}
        onClick={() => setShowFilters((s) => !s)}
      >
        <span>
          Filters
          {activeFilterCount > 0 && <span className="badge" style={{ marginLeft: 6 }}>{activeFilterCount}</span>}
        </span>
        <span style={{ color: 'var(--muted)', fontWeight: 400 }}>{showFilters ? '▴' : '▾'}</span>
      </button>

      {showFilters && (
        <div className="card stack">
          {categoriesInUse.length > 0 && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Category</label>
              <div className="chip-row">
                {categoriesInUse.map((c) => (
                  <span
                    key={c}
                    className={`chip chip-toggle ${filters.categories.includes(c) ? 'active' : ''}`}
                    onClick={() => toggleFilter('categories', c)}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {locationOptions.length > 0 && (
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Location</label>
              <div className="chip-row">
                {locationOptions.map((loc) => (
                  <span
                    key={loc}
                    className={`chip chip-toggle ${filters.locations.includes(loc) ? 'active' : ''}`}
                    onClick={() => toggleFilter('locations', loc)}
                  >
                    {loc}
                  </span>
                ))}
              </div>
            </div>
          )}

          {activeFilterCount > 0 && (
            <button type="button" className="btn btn-outline" onClick={() => setFilters(emptyFilters)}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {loading && <p className="subtitle">Loading…</p>}
      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          {vendors.length === 0 ? 'No vendors on the platform yet.' : 'No vendors match this search or filter.'}
        </div>
      )}

      <div className="stack">
        {filtered.map((v) => (
          <div
            key={v.id}
            className="card"
            role="button"
            tabIndex={0}
            style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer' }}
            onClick={() => navigate(`/organizer/vendors-directory/${v.id}`)}
            onKeyDown={(e) => e.key === 'Enter' && navigate(`/organizer/vendors-directory/${v.id}`)}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 12,
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
              {!v.logo_url && <IconStore style={{ width: 22, height: 22, color: 'var(--muted)' }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{v.vendor_name}</div>
              <p className="subtitle" style={{ margin: '2px 0 0' }}>
                {v.category || 'Uncategorized'}
                {(v.locations || []).length > 0 && ` · 📍 ${v.locations.join(', ')}`}
              </p>
              {formatPriceRange(v.price_range_min, v.price_range_max) && (
                <p className="subtitle" style={{ margin: '2px 0 0' }}>
                  {formatPriceRange(v.price_range_min, v.price_range_max)}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
