import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { AVATARS } from '../../lib/avatars'
import { uploadProfilePhoto } from '../../lib/uploadPhoto'
import { Topbar } from '../../components/Layout'
import { ProfileAvatar } from '../../components/ProfileAvatar'

export default function FreelancerOnboarding() {
  const { user, roleProfile, isOnboarded, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [skillOptions, setSkillOptions] = useState([])
  const [form, setForm] = useState({
    name: '',
    locations: [],
    locationInput: '',
    avatarKey: AVATARS[0].key,
    photoUrl: '',
    pitch: '',
    rateAmount: '',
    rateType: 'hourly',
    skills: [],
    otherSkill: '',
    workHistory: '',
    yearsExperience: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState('')

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
      locations: roleProfile.locations || [],
      avatarKey: roleProfile.avatar_key || AVATARS[0].key,
      photoUrl: roleProfile.photo_url || '',
      pitch: roleProfile.pitch || '',
      rateAmount: roleProfile.rate_amount != null ? String(roleProfile.rate_amount) : '',
      rateType: roleProfile.rate_type || 'hourly',
      skills: presetSkills,
      otherSkill: otherSkills.join(', '),
      workHistory: roleProfile.work_history || '',
      yearsExperience: roleProfile.years_experience != null ? String(roleProfile.years_experience) : '',
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
  }, [])

  async function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // lets the user pick the same file again later if they undo
    if (!file) return
    setPhotoError('')
    setUploadingPhoto(true)
    try {
      const url = await uploadProfilePhoto(user.id, file)
      setForm((f) => ({ ...f, photoUrl: url }))
    } catch (err) {
      setPhotoError(err.message || 'Could not upload that photo — try a different one.')
    } finally {
      setUploadingPhoto(false)
    }
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
    if (!form.name.trim() || form.locations.length === 0) {
      setError('Name and at least one location are required.')
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
      locations: form.locations,
      avatar_key: form.avatarKey,
      photo_url: form.photoUrl || null,
      pitch: form.pitch.trim(),
      rate_amount: form.rateAmount ? Number(form.rateAmount) : null,
      rate_type: form.rateType,
      skills: finalSkills,
      work_history: form.workHistory.trim(),
      years_experience: form.yearsExperience ? Number(form.yearsExperience) : null,
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
        <p className="subtitle">This is your CV on Vendor Connect — organizers see this when you apply, or when they browse.</p>
        <form className="stack" onSubmit={handleSubmit}>
          <div className="card stack">
            <div className="field">
              <label>Photo</label>
              <div className="row" style={{ alignItems: 'center' }}>
                <ProfileAvatar avatarKey={form.avatarKey} photoUrl={form.photoUrl} size={64} />
                <div style={{ flex: 1 }}>
                  <input type="file" accept="image/*" onChange={handlePhotoChange} disabled={uploadingPhoto} />
                  {form.photoUrl && !uploadingPhoto && (
                    <div>
                      <button
                        type="button"
                        className="link"
                        style={{ background: 'none', border: 'none', color: 'var(--coral)', cursor: 'pointer', padding: 0, marginTop: 4 }}
                        onClick={() => setForm((f) => ({ ...f, photoUrl: '' }))}
                      >
                        Remove photo
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {uploadingPhoto && <p className="helper-text">Uploading…</p>}
              {photoError && <p className="error-text">{photoError}</p>}
              <p className="helper-text">Optional, but profiles with a real photo get more matches. Skip it and organizers see your avatar instead.</p>
            </div>

            <div className="field">
              <label>Backup avatar</label>
              <div className="avatar-picker">
                {AVATARS.map((a) => (
                  <button
                    type="button"
                    key={a.key}
                    className={form.avatarKey === a.key ? 'selected' : ''}
                    onClick={() => setForm((f) => ({ ...f, avatarKey: a.key }))}
                  >
                    <span className="avatar" style={{ background: a.gradient }}>
                      {a.emoji}
                    </span>
                  </button>
                ))}
              </div>
              <p className="helper-text">Shown if you skip a photo, or while one is uploading.</p>
            </div>

            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>

            <div className="field">
              <label htmlFor="location">Location(s)</label>
              {form.locations.length > 0 && (
                <div className="chip-row" style={{ marginBottom: 8 }}>
                  {form.locations.map((loc) => (
                    <span key={loc} className="chip chip-toggle active" onClick={() => removeLocation(loc)}>
                      {loc} ×
                    </span>
                  ))}
                </div>
              )}
              <div className="row">
                <input
                  id="location"
                  type="text"
                  placeholder="e.g. Makassar"
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
              <p className="helper-text">
                Organizers filter and search by this — be specific (city or area). You can add more than one city
                you're willing to work in — tap a chip to remove it.
              </p>
              <p className="helper-text">
                💡 Covering multiple locations doesn't cost organizers anything extra — your rate stays the same
                wherever you're booked.
              </p>
            </div>

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
              <label>Skills</label>
              <div className="chip-row">
                {skillOptions.map((label) => (
                  <span
                    key={label}
                    className={`chip chip-toggle ${form.skills.includes(label) ? 'active' : ''}`}
                    onClick={() => toggleSkill(label)}
                  >
                    {label}
                  </span>
                ))}
              </div>
              <input
                style={{ marginTop: 8 }}
                type="text"
                placeholder="Other skill not listed? Type it here"
                value={form.otherSkill}
                onChange={(e) => setForm((f) => ({ ...f, otherSkill: e.target.value }))}
              />
            </div>

            <div className="field">
              <label htmlFor="years">Years of experience (freelance)</label>
              <input
                id="years"
                type="number"
                min="0"
                value={form.yearsExperience}
                onChange={(e) => setForm((f) => ({ ...f, yearsExperience: e.target.value }))}
              />
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
          </div>

          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy} type="submit">
            {busy ? 'Saving…' : isOnboarded ? 'Save changes' : 'Save profile & start browsing'}
          </button>
        </form>
      </div>
    </div>
  )
}
