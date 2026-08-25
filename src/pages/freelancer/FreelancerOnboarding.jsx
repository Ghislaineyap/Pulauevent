import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { AVATARS } from '../../lib/avatars'
import { Topbar } from '../../components/Layout'

export default function FreelancerOnboarding() {
  const { user, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [skillOptions, setSkillOptions] = useState([])
  const [form, setForm] = useState({
    name: '',
    location: '',
    avatarKey: AVATARS[0].key,
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

  function toggleSkill(label) {
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(label) ? f.skills.filter((s) => s !== label) : [...f.skills, label],
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim() || !form.location.trim()) {
      setError('Name and location are required.')
      return
    }
    const finalSkills = [...form.skills]
    if (form.otherSkill.trim()) finalSkills.push(`Other: ${form.otherSkill.trim()}`)
    if (finalSkills.length === 0) {
      setError('Pick at least one skill.')
      return
    }

    setBusy(true)
    const { error: upsertError } = await supabase.from('freelancer_profiles').upsert({
      id: user.id,
      name: form.name.trim(),
      location: form.location.trim(),
      avatar_key: form.avatarKey,
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
      <Topbar title="Build your profile" />
      <div className="page">
        <p className="subtitle">This is your CV on Vendor Connect — organizers see this when you apply, or when they browse.</p>
        <form className="stack" onSubmit={handleSubmit}>
          <div className="card stack">
            <div className="field">
              <label>Pick an avatar</label>
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
              <p className="helper-text">No photo uploads yet in this early version — pick the avatar closest to your vibe.</p>
            </div>

            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>

            <div className="field">
              <label htmlFor="location">Location</label>
              <input
                id="location"
                type="text"
                placeholder="e.g. Makassar"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              />
              <p className="helper-text">Organizers filter and search by this — be specific (city or area).</p>
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
            {busy ? 'Saving…' : 'Save profile & start browsing'}
          </button>
        </form>
      </div>
    </div>
  )
}
