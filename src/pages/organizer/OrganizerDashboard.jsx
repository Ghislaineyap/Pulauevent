import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthProvider'
import { Topbar, OrganizerTabbar } from '../../components/Layout'
import { formatEventDates } from '../../lib/date'
import { Switch } from '../../components/Switch'
import { Modal } from '../../components/Modal'

// "Post" — recruiting, specifically. Creating and editing the event itself
// happens in My Event; this tab is where a division gets opened up to the
// public Job Feed, with its budget and fee terms.
export default function OrganizerDashboard() {
  const { user } = useAuth()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [recruitModal, setRecruitModal] = useState(null) // { jobId, divisionId }

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('job_postings')
      .select(
        'id, title, location, event_start_date, event_end_date, job_divisions(id, skill, quantity, filled_count, budget_amount, budget_type, fee_type, transport_max_amount, open_recruit)'
      )
      .eq('organizer_id', user.id)
      .order('created_at', { ascending: false })
    if (error) console.error(error)
    setJobs(data || [])
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  async function saveRecruit(divisionId, payload) {
    const { error } = await supabase.from('job_divisions').update(payload).eq('id', divisionId)
    if (error) {
      console.error(error)
      return
    }
    setRecruitModal(null)
    load()
  }

  const recruitJob = recruitModal && jobs.find((j) => j.id === recruitModal.jobId)
  const recruitDivision = recruitJob && recruitJob.job_divisions.find((d) => d.id === recruitModal.divisionId)

  return (
    <div className="app-shell">
      <Topbar title="Post" />
      <div className="page">
        <p className="subtitle" style={{ margin: 0 }}>
          Open a division up to public recruiting here — set its budget and fee terms, and it shows up in the Job
          Feed for anyone to apply to whatever's left unfilled by your own team.
        </p>

        {loading && <p className="subtitle">Loading…</p>}
        {!loading && jobs.length === 0 && <div className="empty-state">Create an event in My Event first — then come back here to recruit for it.</div>}

        <div className="stack">
          {jobs.map((job) => (
            <div key={job.id} className="card stack">
              <div>
                <h2 style={{ margin: 0 }}>{job.title}</h2>
                <p className="subtitle" style={{ margin: '4px 0 0' }}>
                  📍 {job.location} · {formatEventDates(job.event_start_date, job.event_end_date)}
                </p>
              </div>
              <div className="stack" style={{ gap: 8 }}>
                {job.job_divisions.map((d) => (
                  <div key={d.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{d.skill}</strong>
                      <p className="subtitle" style={{ margin: '2px 0 0' }}>
                        {d.filled_count}/{d.quantity} filled
                        {d.open_recruit && ' · Open recruit'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ padding: '6px 10px', fontSize: 12 }}
                      onClick={() => setRecruitModal({ jobId: job.id, divisionId: d.id })}
                    >
                      Recruiting settings
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {recruitDivision && (
        <Modal title={`Recruiting — ${recruitDivision.skill}`} onClose={() => setRecruitModal(null)}>
          <RecruitForm key={recruitDivision.id} division={recruitDivision} onSave={(payload) => saveRecruit(recruitDivision.id, payload)} />
        </Modal>
      )}

      <OrganizerTabbar />
    </div>
  )
}

function RecruitForm({ division, onSave }) {
  const [budgetAmount, setBudgetAmount] = useState(division.budget_amount != null ? String(division.budget_amount) : '')
  const [budgetType, setBudgetType] = useState(division.budget_type || 'flat')
  const [feeType, setFeeType] = useState(division.fee_type || 'all_in')
  const [transportMax, setTransportMax] = useState(division.transport_max_amount != null ? String(division.transport_max_amount) : '')
  const [openRecruit, setOpenRecruit] = useState(Boolean(division.open_recruit))
  const [busy, setBusy] = useState(false)

  const remaining = Math.max(division.quantity - division.filled_count, 0)

  async function submit() {
    setBusy(true)
    await onSave({
      budget_amount: budgetAmount ? Number(budgetAmount) : null,
      budget_type: budgetType,
      fee_type: feeType,
      transport_max_amount: feeType === 'plus_transport' && transportMax ? Number(transportMax) : null,
      open_recruit: openRecruit,
    })
    setBusy(false)
  }

  return (
    <div className="stack">
      <p className="subtitle" style={{ margin: 0 }}>
        {remaining > 0
          ? `${remaining} of ${division.quantity} spot${division.quantity === 1 ? '' : 's'} not yet filled by your team.`
          : 'Every spot in this role is already filled.'}
      </p>
      <div className="row">
        <input
          style={{ flex: 1 }}
          type="number"
          min="0"
          placeholder="Budget (IDR)"
          value={budgetAmount}
          onChange={(e) => setBudgetAmount(e.target.value)}
        />
        <select style={{ flex: 1 }} value={budgetType} onChange={(e) => setBudgetType(e.target.value)}>
          <option value="flat">flat total</option>
          <option value="hourly">per hour</option>
          <option value="daily">per day</option>
        </select>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label style={{ fontSize: 12 }}>Fee covers</label>
        <select value={feeType} onChange={(e) => setFeeType(e.target.value)}>
          <option value="all_in">All-in (no separate reimbursement)</option>
          <option value="plus_transport">+ Transport reimbursed separately</option>
        </select>
        {feeType === 'plus_transport' && (
          <input
            style={{ marginTop: 8 }}
            type="number"
            min="0"
            placeholder="Max transport reimbursement (optional)"
            value={transportMax}
            onChange={(e) => setTransportMax(e.target.value)}
          />
        )}
      </div>
      <Switch checked={openRecruit} onChange={setOpenRecruit} label="Open recruit" />
      <p className="helper-text" style={{ margin: 0 }}>
        On: the {remaining} remaining spot{remaining === 1 ? '' : 's'} post to the public Job Feed for anyone to
        apply. Off: only people invited from My Event's "Select team" can fill this role.
      </p>
      <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={submit}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}
