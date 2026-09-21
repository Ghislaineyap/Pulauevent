import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { uploadProfilePhoto } from '../../lib/uploadPhoto'
import { uploadPortfolioImage, MAX_PORTFOLIO_IMAGES } from '../../lib/uploadVendorPortfolio'
import { Topbar, VendorTabbar } from '../../components/Layout'
import { Modal } from '../../components/Modal'

// Doubles as "edit profile" once onboarded, same pattern as
// FreelancerOnboarding/OrganizerOnboarding. Six fields per the spec: name,
// logo, image portfolio, details (a link to their site/portfolio), location,
// price range (optional) — plus category, which isn't in the original list
// but reuses the same vocabulary VendorRoster.jsx already established, so
// Discover can filter vendors by it later the same way it filters
// freelancers by skill.
export default function VendorOnboarding() {
  const { user, roleProfile, isOnboarded, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [locationOptions, setLocationOptions] = useState([])
  const [categoryOptions, setCategoryOptions] = useState([])
  const [form, setForm] = useState({
    vendorName: '',
    category: '',
    logoUrl: '',
    portfolioUrls: [],
    websiteUrl: '',
    locations: [],
    locationInput: '',
    priceRangeMin: '',
    priceRangeMax: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingPortfolioIndex, setUploadingPortfolioIndex] = useState(null)
  const [photoError, setPhotoError] = useState('')
  const [showLocationModal, setShowLocationModal] = useState(false)

  useEffect(() => {
    if (hydrated || !roleProfile) return
    setForm((f) => ({
      ...f,
      vendorName: roleProfile.vendor_name || '',
      category: roleProfile.category || f.category,
      logoUrl: roleProfile.logo_url || '',
      portfolioUrls: roleProfile.portfolio_urls || [],
      websiteUrl: roleProfile.website_url || '',
      locations: roleProfile.locations || [],
      priceRangeMin: roleProfile.price_range_min != null ? String(roleProfile.price_range_min) : '',
      priceRangeMax: roleProfile.price_range_max != null ? String(roleProfile.price_range_max) : '',
    }))
    setHydrated(true)
  }, [roleProfile, hydrated])

  useEffect(() => {
    supabase
      .from('locations')
      .select('label')
      .order('sort_order')
      .then(({ data, error: err }) => {
        if (err) console.error(err)
        setLocationOptions((data || []).map((l) => l.label))
      })
    supabase
      .from('vendor_categories')
      .select('label')
      .order('sort_order')
      .then(({ data, error: err }) => {
        if (err) console.error(err)
        const labels = (data || []).map((c) => c.label)
        setCategoryOptions(labels)
        // Default a brand-new vendor's category to the first option once
        // it's loaded — never override one already set (own value, or from
        // the hydration effect above, whichever ran first).
        setForm((f) => (f.category ? f : { ...f, category: labels[0] || '' }))
      })
  }, [])

  function addLocation() {
    const value = form.locationInput.trim()
    if (!value) return
    setForm((f) =>
      f.locations.some((l) => l.toLowerCase() === value.toLowerCase())
        ? { ...f, locationInput: '' }
        : { ...f, locations: [...f.locations, value], locationInput: '' }
    )
  }

  function removeLocation(value) {
    setForm((f) => ({ ...f, locations: f.locations.filter((l) => l !== value) }))
  }

  async function handleLogoChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoError('')
    setUploadingLogo(true)
    try {
      const url = await uploadProfilePhoto(user.id, file, 1)
      setForm((f) => ({ ...f, logoUrl: url }))
    } catch (err) {
      setPhotoError(err.message || 'Could not upload that logo — try a different image.')
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handlePortfolioChange(e, index) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoError('')
    setUploadingPortfolioIndex(index)
    try {
      const url = await uploadPortfolioImage(user.id, file, index + 1)
      setForm((f) => {
        const next = [...f.portfolioUrls]
        next[index] = url
        return { ...f, portfolioUrls: next }
      })
    } catch (err) {
      setPhotoError(err.message || 'Could not upload that image — try a different one.')
    } finally {
      setUploadingPortfolioIndex(null)
    }
  }

  function removePortfolioImage(index) {
    setForm((f) => ({ ...f, portfolioUrls: f.portfolioUrls.filter((_, i) => i !== index) }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.vendorName.trim() || form.locations.length === 0) {
      setError('Vendor name and at least one location are required.')
      return
    }
    setBusy(true)
    const { error: upsertError } = await supabase.from('vendor_profiles').upsert({
      id: user.id,
      vendor_name: form.vendorName.trim(),
      category: form.category || null,
      logo_url: form.logoUrl || null,
      portfolio_urls: form.portfolioUrls,
      website_url: form.websiteUrl.trim() || null,
      locations: form.locations,
      price_range_min: form.priceRangeMin.trim() !== '' ? Number(form.priceRangeMin) : null,
      price_range_max: form.priceRangeMax.trim() !== '' ? Number(form.priceRangeMax) : null,
    })
    setBusy(false)
    if (upsertError) {
      setError(upsertError.message)
      return
    }
    await refreshProfile()
    navigate('/vendor/jobs')
  }

  return (
    <div className="app-shell">
      <Topbar title={isOnboarded ? 'Edit your profile' : 'Build your vendor profile'} />
      <div className="page">
        <p className="subtitle">This is what organizers see when they browse vendors, or when you apply to an event.</p>
        <form className="stack" onSubmit={handleSubmit}>
          <div className="card stack">
            <div className="field">
              <label>Logo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {form.logoUrl && <img src={form.logoUrl} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 12 }} />}
                <label
                  className="btn btn-outline"
                  style={{ padding: '7px 12px', fontSize: 12.5, cursor: uploadingLogo ? 'default' : 'pointer' }}
                >
                  {uploadingLogo ? 'Uploading…' : form.logoUrl ? 'Replace logo' : 'Upload logo'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} disabled={uploadingLogo} onChange={handleLogoChange} />
                </label>
              </div>
            </div>

            <div className="field">
              <label htmlFor="vendorName">Vendor name</label>
              <input
                id="vendorName"
                type="text"
                placeholder="e.g. Ombak Catering"
                value={form.vendorName}
                onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))}
              />
            </div>

            <div className="field">
              <label htmlFor="category">Category</label>
              <select id="category" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Image portfolio</label>
              <div className="chip-row" style={{ gap: 10 }}>
                {form.portfolioUrls.map((url, i) => (
                  <div key={i} style={{ position: 'relative', width: 84, height: 84 }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} />
                    <button
                      type="button"
                      onClick={() => removePortfolioImage(i)}
                      aria-label="Remove image"
                      style={{
                        position: 'absolute',
                        top: -6,
                        right: -6,
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: 'var(--ink)',
                        color: '#fff',
                        border: '2px solid #fff',
                        cursor: 'pointer',
                        fontSize: 12,
                        lineHeight: '18px',
                        padding: 0,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {form.portfolioUrls.length < MAX_PORTFOLIO_IMAGES && (
                  <label
                    style={{
                      width: 84,
                      height: 84,
                      borderRadius: 12,
                      border: '1px dashed var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                      gap: 4,
                      cursor: uploadingPortfolioIndex != null ? 'default' : 'pointer',
                      color: 'var(--muted)',
                      fontSize: 11,
                      textAlign: 'center',
                    }}
                  >
                    {uploadingPortfolioIndex === form.portfolioUrls.length ? (
                      'Uploading…'
                    ) : (
                      <>
                        <span style={{ fontSize: 20, lineHeight: 1 }}>+</span>
                        Add photo
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      disabled={uploadingPortfolioIndex != null}
                      onChange={(e) => handlePortfolioChange(e, form.portfolioUrls.length)}
                    />
                  </label>
                )}
              </div>
              {photoError && <p className="error-text">{photoError}</p>}
              <p className="helper-text">Show off past work — up to {MAX_PORTFOLIO_IMAGES} photos.</p>
            </div>

            <div className="field">
              <label htmlFor="websiteUrl">Details (link to your website / portfolio)</label>
              <input
                id="websiteUrl"
                type="url"
                placeholder="https://…"
                value={form.websiteUrl}
                onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
              />
            </div>

            <div className="field">
              <label htmlFor="location">Location(s)</label>
              <button
                type="button"
                id="location"
                className="btn btn-outline btn-block"
                style={{ justifyContent: 'space-between' }}
                onClick={() => setShowLocationModal(true)}
              >
                <span>
                  {form.locations.length === 0
                    ? 'Add locations you serve…'
                    : form.locations.length <= 2
                      ? form.locations.join(', ')
                      : `${form.locations.slice(0, 2).join(', ')} +${form.locations.length - 2} more`}
                </span>
                <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Edit</span>
              </button>
            </div>

            {showLocationModal && (
              <Modal title="Your locations" onClose={() => setShowLocationModal(false)}>
                <div className="stack">
                  {form.locations.length > 0 && (
                    <div className="chip-row">
                      {form.locations.map((loc) => (
                        <span key={loc} className="chip chip-toggle active" onClick={() => removeLocation(loc)}>
                          {loc} ×
                        </span>
                      ))}
                    </div>
                  )}
                  <select
                    value=""
                    onChange={(e) => {
                      const value = e.target.value
                      if (!value) return
                      setForm((f) =>
                        f.locations.some((l) => l.toLowerCase() === value.toLowerCase())
                          ? f
                          : { ...f, locations: [...f.locations, value] }
                      )
                    }}
                  >
                    <option value="">Add a location…</option>
                    {locationOptions
                      .filter((loc) => !form.locations.includes(loc))
                      .map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                  </select>
                  <div className="row">
                    <input
                      type="text"
                      placeholder="Not listed? Type your own"
                      value={form.locationInput}
                      onChange={(e) => setForm((f) => ({ ...f, locationInput: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addLocation()
                        }
                      }}
                    />
                    <button type="button" className="btn btn-outline" onClick={addLocation}>
                      Add
                    </button>
                  </div>
                  <button type="button" className="btn btn-primary btn-block" onClick={() => setShowLocationModal(false)}>
                    Done
                  </button>
                </div>
              </Modal>
            )}

            <div className="field" style={{ marginBottom: 0 }}>
              <label>Price range (optional)</label>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <div className="field" style={{ flex: 1, minWidth: 120, marginBottom: 0 }}>
                  <label htmlFor="priceRangeMin" style={{ fontWeight: 400, fontSize: 12 }}>
                    Min (Rp)
                  </label>
                  <input
                    id="priceRangeMin"
                    type="number"
                    min="0"
                    placeholder="e.g. 5000000"
                    value={form.priceRangeMin}
                    onChange={(e) => setForm((f) => ({ ...f, priceRangeMin: e.target.value }))}
                  />
                </div>
                <div className="field" style={{ flex: 1, minWidth: 120, marginBottom: 0 }}>
                  <label htmlFor="priceRangeMax" style={{ fontWeight: 400, fontSize: 12 }}>
                    Max (Rp)
                  </label>
                  <input
                    id="priceRangeMax"
                    type="number"
                    min="0"
                    placeholder="e.g. 15000000"
                    value={form.priceRangeMax}
                    onChange={(e) => setForm((f) => ({ ...f, priceRangeMax: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? 'Saving…' : isOnboarded ? 'Save changes' : 'Save profile & start browsing'}
          </button>
        </form>

        <button type="button" className="btn btn-outline btn-block" style={{ marginTop: 12 }} onClick={signOut}>
          Sign out
        </button>
      </div>
      <VendorTabbar />
    </div>
  )
}
