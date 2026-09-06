import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthProvider'
import { REPORT_REASONS } from '../lib/moderation'

// Plain form, not a Modal itself — embedded inside whatever container is
// already showing this profile (OrganizerAboutModal's own Modal, or a Modal
// wrapper on FreelancerProfileDetail) so reporting never stacks a second
// backdrop on top of the first.
export function ReportForm({ reportedId, reportedName, onCancel, onDone }) {
  const { user } = useAuth()
  const [reason, setReason] = useState(REPORT_REASONS[0])
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error: insertError } = await supabase.from('reports').insert({
      reporter_id: user.id,
      reported_id: reportedId,
      reason,
      details: details.trim() || null,
    })
    setBusy(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="stack">
        <p style={{ margin: 0 }}>
          Thanks — your report about {reportedName} has been sent to the Pulau Event team for review.
        </p>
        <button type="button" className="btn btn-outline" onClick={onDone}>
          Done
        </button>
      </div>
    )
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <p className="helper-text" style={{ margin: 0 }}>
        This goes straight to the Pulau Event team — {reportedName} isn't notified that you filed it.
      </p>
      <div className="field">
        <label htmlFor="report-reason">Reason</label>
        <select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="report-details">Details (optional)</label>
        <textarea
          id="report-details"
          rows={4}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Anything that helps us understand what happened…"
        />
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="row">
        <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
          {busy ? 'Sending…' : 'Submit report'}
        </button>
      </div>
    </form>
  )
}
