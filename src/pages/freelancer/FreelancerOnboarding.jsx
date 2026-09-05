import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { uploadProfilePhoto, MAX_PHOTOS } from '../../lib/uploadPhoto'
import { GENDERS } from '../../lib/gender'
import { EXPERIENCE_BANDS } from '../../lib/experience'
import { Topbar, FreelancerTabbar } from '../../components/Layout'
import { RatingsSummary } from '../../components/RatingsSummary'
import { Modal } from '../../components/Modal'

export default function FreelancerOnboarding() {
  const { user, roleProfile, isOnboarded, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [skillOptions, setSkillOptions] = useState([])
  const [locationOptions, setLocationOptions] = useState([])
  const [form, setForm] = useState({
    name: '',
    gender: '',
    locations: [],
    locationInput: '',
    photoUrls: [],
    pitch: '',
    rateAmount: '',
    rateType: 'hourly',
    skills: [],
    otherSkill: '',
    workHistory: '',
    experienceBand: '',
    instagramHandle: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [uploadingPhotoIndex, setUploadingPhotoIndex] = useState(null)
  const [photoError, setPhotoError] = useState('')
  const [showLocationModal, setShowLocationModal] = useState(false)

  // Editing an existing profile: pre-fill the form once from the saved row,
  // so revisiting this page doesn't wipe out what's already there. Only
  // runs once — after that the form is the source of truth while typing.
  useEffect(() => {
    if (hydrated || !roleProfile) return
    const presetSkills = (roleProfile.skills || []).filter((s) => !s.startsWith('Other: '))
    const otherSkills = (roleProfile.skills || []).filter((s) => s.startsWith('Other: ')).map((s) => s.slice(7))
    setForm((f) => ({
      ...f,
      name: roleProfile.name || '',
      gender: roleProfile.gender || '',
      locations: roleProfile.locations || [],
      photoUrls: roleProfile.photo_urls || [],
      pitch: roleProfile.pitch || '',
      rateAmount: roleProfile.rate_amount != null ? String(roleProfile.rate_amount) : '',
      rateType: roleProfile.rate_type || 'hourly',
      skills: presetSkills,
      otherSkill: otherSkills.join(', '),
      workHistory: roleProfile.work_history || '',
      experienceBand: roleProfile.experience_band || '',
      instagramHandle: roleProfile.instagram_handle || '',
    }))
    setHydrated(true)
  }, [roleProfile, hydrated])

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

  useEffect(() => {
    supabase
      .from('skills')
      .select('label')
      .order('sort_order')
      .then(({ data, error }) => {
        if (error) console.error(error)
        setSkillOptions((data || []).map((s) => s.label))
      })
    supabase
      .from('locations')
      .select('label')
      .order('sort_order')
      .then(({ data, error }) => {
        if (error) console.error(error)
        setLocationOptions((data || []).map((l) => l.label))
      })
  }, [])

  async function handlePhotoChange(e, index) {
    const file = e.target.files?.[0]
    e.target.value = '' // lets the user pick the same file again later if they undo
    if (!file) return
    setPhotoError('')
    setUploadingPhotoIndex(index)
    try {
      const url = await uploadProfilePhoto(user.id, file, index + 1)
      setForm((f) => {
        const next = [...f.photoUrls]
        next[index] = url
        return { ...f, photoUrls: next }
      })
    } catch (err) {
      setPhotoError(err.message || 'Could not upload that photo — try a different one.')
    } finally {
      setUploadingPhotoIndex(null)
    }
  }

  function removePhoto(index) {
    setForm((f) => ({ ...f, photoUrls: f.photoUrls.filter((_, i) => i !== index) }))
  }

  function toggleSkill(label) {
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(label) ? f.skills.filter((s) => s !== label) : [...f.skills, label],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim() || !form.gender || form.locations.length === 0) {
      setError('Name, gender and at least one location are required.')
      return
    }
    const finalSkills = [...form.skills]
    form.otherSkill
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => finalSkills.push(`Other: ${s}`))
    if (finalSkills.length === 0) {
      setError('Pick at least one skill.')
      return
    }

    setBusy(true)
    const { error: upsertError } = await supabase.from('freelancer_profiles').upsert({
      id: user.id,
      name: form.name.trim(),
      gender: form.gender,
      locations: form.locations,
      avatar_key: form.gender, // fallback avatar mirrors gender — no separate picker
      photo_urls: form.photoUrls,
      pitch: form.pitch.trim(),
      rate_amount: form.rateAmount ? Number(form.rateAmount) : null,
      rate_type: form.rateType,
      skills: finalSkills,
      work_history: form.workHistory.trim(),
      experience_band: form.experienceBand || null,
      instagram_handle: form.instagramHandle.trim().replace(/^@/, '') || null,
    })
    setBusy(false)
    if (upsertError) {
      setError(upsertError.message)
      return
    }
    await refreshProfile()
    navigate('/freelancer/jobs')
  }

  return (
    <div className="app-shell">
      <Topbar title={isOnboarded ? 'Edit your profile' : 'Build your profile'} />
      <div className="page">
        <p className="subtitle">This is your CV on Pulau Event — organizers see this when you apply, or when they browse.</p>
        {isOnboarded && <RatingsSummary freelancerId={user.id} />}
        <form className="stack" onSubmit={handleSubmit}>
          <div className="card stack">
            <div className="field">
              <label>Photos</label>
              <div className="chip-row" style={{ gap: 10 }}>
                {form.photoUrls.map((url, i) => (
                  <div key={i} style={{ position: 'relative', width: 84, height: 84 }}>
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      aria-label="Remove photo"
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
                {form.photoUrls.length < MAX_PHOTOS && (
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
                      cursor: uploadingPhotoIndex != null ? 'default' : 'pointer',
                      color: 'var(--muted)',
                      fontSize: 11,
                      textAlign: 'center',
                    }}
                  >
                    {uploadingPhotoIndex === form.photoUrls.length ? (
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
                      disabled={uploadingPhotoIndex != null}
                      onChange={(e) => handlePhotoChange(e, form.photoUrls.length)}
                    />
                  </label>
                )}
              </div>
              {photoError && <p className="error-text">{photoError}</p>}
              <p className="helper-text">
                Optional, but profiles with real photos get more interest — up to {MAX_PHOTOS}. Skip it and organizers
                see a simple avatar instead.
              </p>
            </div>

            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>

            <div className="field">
              <label>Gender</label>
              <div className="chip-row">
                {GENDERS.map((g) => (
                  <span
                    key={g.value}
                    className={`chip chip-toggle ${form.gender === g.value ? 'active' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, gender: g.value }))}
                  >
                    {g.label}
                  </span>
                ))}
              </div>
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
                    ? 'Add locations you cover…'
                    : form.locations.length <= 2
                      ? form.locations.join(', ')
                      : `${form.locations.slice(0, 2).join(', ')} +${form.locations.length - 2} more`}
                </span>
                <span style={{ color: 'var(--muted)', fontWeight: 400 }}>Edit</span>
              </button>
              <p className="helper-text" style={{ margin: 0 }}>
                💡 Covering multiple locations doesn't cost organizers anything extra — your rate stays the same
                wherever you're booked.
              </p>
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
                  <p className="helper-text" style={{ margin: 0 }}>
                    Picking from the list keeps this consistent with how organizers filter and search — tap a chip to
                    remove it.
                  </p>
                  <button type="button" className="btn btn-primary btn-block" onClick={() => setShowLocationModal(false)}>
                    Done
                  </button>
                </div>
              </Modal>
            )}

            <div className="field">
              <label htmlFor="pitch">One-line pitch</label>
              <input
                id="pitch"
                type="text"
                maxLength={120}
                placeholder="e.g. Stage manager for 50+ weddings & corporate events"
                value={form.pitch}
                onChange={(e) => setForm((f) => ({ ...f, pitch: e.target.value }))}
              />
            </div>

            <div className="field">
              <label>Rate</label>
              <div className="row">
                <input
                  type="number"
                  min="0"
                  placeholder="Amount (IDR)"
                  value={form.rateAmount}
                  onChange={(e) => setForm((f) => ({ ...f, rateAmount: e.target.value }))}
                />
                <select value={form.rateType} onChange={(e) => setForm((f) => ({ ...f, rateType: e.target.value }))}>
                  <option value="hourly">per hour</option>
                  <option value="daily">per day</option>
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="skill">Skills</label>
              {form.skills.length > 0 && (
                <div className="chip-row" style={{ marginBottom: 8 }}>
                  {form.skills.map((label) => (
                    <span key={label} className="chip chip-toggle active" onClick={() => toggleSkill(label)}>
                      {label} ×
                    </span>
                  ))}
                </div>
              )}
              <select
                id="skill"
                value=""
                onChange={(e) => {
                  const value = e.target.value
                  if (value) toggleSkill(value)
                }}
              >
                <option value="">Add a skill…</option>
                {skillOptions
                  .filter((label) => !form.skills.includes(label))
                  .map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
              </select>
              <input
                style={{ marginTop: 8 }}
                type="text"
                placeholder="Other skill not listed? Type it here"
                value={form.otherSkill}
                onChange={(e) => setForm((f) => ({ ...f, otherSkill: e.target.value }))}
              />
              <p className="helper-text">Pick as many as apply — tap a chip above to remove it.</p>
            </div>

            <div className="field">
              <label htmlFor="years">Years of experience (freelance)</label>
              <select
                id="years"
                value={form.experienceBand}
                onChange={(e) => setForm((f) => ({ ...f, experienceBand: e.target.value }))}
              >
                <option value="">Select…</option>
                {EXPERIENCE_BANDS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="history">Work history</label>
              <textarea
                id="history"
                placeholder="A few notable events or clients you've worked with"
                value={form.workHistory}
                onChange={(e) => setForm((f) => ({ ...f, workHistory: e.target.value }))}
              />
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="instagram">Instagram (optional)</label>
              <input
                id="instagram"
                type="text"
                placeholder="@yourhandle"
                value={form.instagramHandle}
                onChange={(e) => setForm((f) => ({ ...f, instagramHandle: e.target.value }))}
              />
              <p className="helper-text">Shown to organizers as an extra, checkable way to know it's really you.</p>
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? 'Saving…' : isOnboarded ? 'Save changes' : 'Save profile & start browsing'}
          </button>
        </form>
      </div>
      <FreelancerTabbar />
    </div>
  )
}
