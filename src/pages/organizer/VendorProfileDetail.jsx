import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { Modal } from '../../components/Modal'
import { ReportForm } from '../../components/ReportForm'
import { IconStore } from '../../components/TabIcons'

// Full-detail view reached from Discover's Vendor tab (VendorBrowse.jsx) —
// mirrors FreelancerProfileDetail's structure (photo/portfolio gallery,
// 🚩 Report) but stays read-only throughout: there's no shortlist/skip/invite
// action for a vendor yet, so unlike the freelancer version this page never
// grows an action row.
export default function VendorProfileDetail() {
  const { vendorId } = useParams()
  const navigate = useNavigate()
  const [vendor, setVendor] = useState(null)
  const [activePhoto, setActivePhoto] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reporting, setReporting] = useState(false)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('vendor_profiles')
      .select('*')
      .eq('id', vendorId)
      .single()
      .then(({ data, error: loadError }) => {
        if (loadError) setError("Couldn't load this profile.")
        setVendor(data)
        setLoading(false)
      })
  }, [vendorId])

  if (loading) {
    return (
      <div className="app-shell">
        <Topbar title="Vendor profile" />
        <div className="page">
          <div className="skeleton" style={{ aspectRatio: '4 / 5', borderRadius: 18 }} />
          <div className="skeleton" style={{ height: 20, width: '60%', margin: '0 auto', borderRadius: 6 }} />
          <div className="skeleton" style={{ height: 14, width: '40%', margin: '0 auto', borderRadius: 6 }} />
          <div className="skeleton" style={{ height: 90, borderRadius: 14 }} />
        </div>
        <OrganizerTabbar />
      </div>
    )
  }
  if (!vendor) {
    return (
      <div className="center-page">
        <p className="error-text">{error || 'Profile not found.'}</p>
        <button className="btn btn-outline" onClick={() => navigate(-1)}>
          Go back
        </button>
      </div>
    )
  }

  // Prefer the portfolio gallery; fall back to just the logo when there's no
  // portfolio yet, so the hero is never empty for a vendor who only uploaded
  // a logo.
  const gallery = vendor.portfolio_urls?.length > 0 ? vendor.portfolio_urls : vendor.logo_url ? [vendor.logo_url] : []

  return (
    <div className="app-shell">
      <Topbar title="Vendor profile" />
      <div className="page">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            className="subtitle"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            onClick={() => navigate(-1)}
          >
            ← Back
          </button>
          <button
            type="button"
            className="helper-text"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--danger)' }}
            onClick={() => setReporting(true)}
          >
            🚩 Report
          </button>
        </div>

        {reporting && (
          <Modal title={`Report ${vendor.vendor_name}`} onClose={() => setReporting(false)}>
            <ReportForm
              reportedId={vendor.id}
              reportedName={vendor.vendor_name}
              onCancel={() => setReporting(false)}
              onDone={() => setReporting(false)}
            />
          </Modal>
        )}

        {gallery.length > 0 ? (
          <div
            style={{
              aspectRatio: '4 / 5',
              borderRadius: 18,
              backgroundImage: `url(${gallery[activePhoto]})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
        ) : (
          <div
            style={{
              aspectRatio: '4 / 5',
              borderRadius: 18,
              background: 'var(--cloud)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconStore style={{ width: 48, height: 48, color: 'var(--muted)' }} />
          </div>
        )}

        {gallery.length > 1 && (
          <div className="gallery-thumbs">
            {gallery.map((url, i) => (
              <div
                key={url}
                className={`thumb ${i === activePhoto ? 'active' : ''}`}
                style={{ backgroundImage: `url(${url})` }}
                role="button"
                tabIndex={0}
                onClick={() => setActivePhoto(i)}
                onKeyDown={(e) => e.key === 'Enter' && setActivePhoto(i)}
              />
            ))}
          </div>
        )}

        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <h1 style={{ margin: 0 }}>{vendor.vendor_name}</h1>
          <p className="subtitle">
            {vendor.category || 'Uncategorized'}
            {(vendor.locations || []).length > 0 && ` · 📍 ${vendor.locations.join(', ')}`}
          </p>
          {vendor.website_url && (
            <a
              href={vendor.website_url}
              target="_blank"
              rel="noreferrer"
              className="subtitle"
              style={{ color: 'var(--primary-dark)', fontWeight: 600 }}
            >
              🔗 Visit website
            </a>
          )}
        </div>

        {vendor.price_range && (
          <div className="card">
            <strong>Price range</strong>
            <p className="subtitle" style={{ margin: '4px 0 0' }}>
              {vendor.price_range}
            </p>
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
      </div>
      <OrganizerTabbar />
    </div>
  )
}
