import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { InfoButton } from './InfoButton'

// Same 12 universal categories as the Universal Event Budget Template
// (spreadsheet + shared ledger artifact) — kept in the same order so a
// budget built here reads the same way as that template.
const CATEGORIES = [
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
  'Miscellaneous',
]

const STATUS_LABEL = { not_started: 'Not started', deposit_paid: 'Deposit paid', paid_in_full: 'Paid in full' }
const STATUS_CHIP_CLASS = { not_started: 'chip chip-outline', deposit_paid: 'chip chip-sunset', paid_in_full: 'chip chip-mint' }

function formatIDR(amount) {
  if (amount == null || amount === '') return '—'
  return `Rp ${Number(amount).toLocaleString('id-ID')}`
}

// Internal Budget tab — organizer-only (see migration_budget_vendors.sql's
// header note: this tab never appears on a freelancer's workspace). A
// 12-category ledger per event: a line-item table on the left, an
// auto-computed summary + spend-by-category breakdown on the right. Totals
// are computed here from event_budget_items — nothing is stored pre-summed,
// so editing a row updates the summary immediately.
export function BudgetView({ jobId }) {
  const [meta, setMeta] = useState(null) // { target_amount, contingency_pct } | null
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingSettings, setEditingSettings] = useState(false)
  const [formOpen, setFormOpen] = useState(false) // false | 'new' | itemId
  const [savingSettings, setSavingSettings] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: metaRow, error: metaError }, { data: itemRows, error: itemsError }] = await Promise.all([
      supabase.from('event_budget_meta').select('target_amount, contingency_pct').eq('job_id', jobId).maybeSingle(),
      supabase.from('event_budget_items').select('*').eq('job_id', jobId).order('sort_order', { ascending: true }),
    ])
    if (metaError) console.error(metaError)
    if (itemsError) console.error(itemsError)
    setMeta(metaRow || { target_amount: null, contingency_pct: 10 })
    setItems(itemRows || [])
    setLoading(false)
  }, [jobId])

  useEffect(() => {
    load()
  }, [load])

  async function saveSettings(next) {
    setSavingSettings(true)
    const { error } = await supabase
      .from('event_budget_meta')
      .upsert({ job_id: jobId, target_amount: next.target_amount, contingency_pct: next.contingency_pct }, { onConflict: 'job_id' })
    setSavingSettings(false)
    if (error) {
      console.error(error)
      return
    }
    setMeta(next)
    setEditingSettings(false)
  }

  async function saveItem(payload, id) {
    if (id) {
      const { error } = await supabase.from('event_budget_items').update(payload).eq('id', id)
      if (error) {
        console.error(error)
        return
      }
    } else {
      const { error } = await supabase.from('event_budget_items').insert({ ...payload, job_id: jobId, sort_order: items.length })
      if (error) {
        console.error(error)
        return
      }
    }
    setFormOpen(false)
    load()
  }

  async function deleteItem(id) {
    const { error } = await supabase.from('event_budget_items').delete().eq('id', id)
    if (error) {
      console.error(error)
      return
    }
    load()
  }

  if (loading) return <p className="subtitle">Loading…</p>

  const subtotal = items.reduce((n, it) => n + Number(it.est_cost || 0), 0)
  const contingencyPct = meta?.contingency_pct ?? 10
  const contingencyAmt = subtotal * (contingencyPct / 100)
  const grandTotal = subtotal + contingencyAmt
  const actualSpent = items.reduce((n, it) => n + Number(it.actual_cost || 0), 0)
  const target = meta?.target_amount
  const vsTarget = target != null ? target - grandTotal : null

  const byCategory = new Map()
  items.forEach((it) => {
    byCategory.set(it.category, (byCategory.get(it.category) || 0) + Number(it.est_cost || 0))
  })
  const categoryRows = [...byCategory.entries()].sort((a, b) => b[1] - a[1])
  const maxCategory = categoryRows.length > 0 ? categoryRows[0][1] : 0

  const editingItem = typeof formOpen === 'string' && formOpen !== 'new' ? items.find((it) => it.id === formOpen) : null

  return (
    // Full-width table first (a 6-column ledger table needs more room than
    // the col-main side of a two-col split gives it — see ws-two-col's
    // 1.55/1 flex ratio, which is fine for text/kv-rows but not a table),
    // then the ledger summary + spend-by-category as a two-col row below it.
    <div className="stack" style={{ gap: 20 }}>
      <div>
        <div className="ws-panel" style={{ padding: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px 0' }}>
            <p className="ws-section-title" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
              Budget
              <InfoButton title="Budget">
                Internal only — your team and clients never see this tab. Line items roll up into the ledger summary automatically as you add or edit them.
              </InfoButton>
            </p>
            <button type="button" className="btn btn-outline" style={{ padding: '6px 12px', fontSize: 12, marginBottom: 10 }} onClick={() => setFormOpen('new')}>
              + Add line item
            </button>
          </div>

          {formOpen === 'new' && <BudgetItemForm onSave={(payload) => saveItem(payload, null)} onCancel={() => setFormOpen(false)} />}

          {items.length === 0 && !formOpen ? (
            <div className="empty-state" style={{ margin: 14 }}>
              No line items yet — add your first one to start the ledger.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="budget-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Item</th>
                    <th>Vendor</th>
                    <th className="num">Est. cost</th>
                    <th className="num">Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) =>
                    editingItem?.id === it.id ? (
                      <tr key={it.id}>
                        <td colSpan={6} style={{ padding: 10 }}>
                          <BudgetItemForm item={it} onSave={(payload) => saveItem(payload, it.id)} onCancel={() => setFormOpen(false)} />
                        </td>
                      </tr>
                    ) : (
                      <tr key={it.id}>
                        <td style={{ fontWeight: 600 }}>{it.category}</td>
                        <td className="muted">{it.item || '—'}</td>
                        <td className="muted">{it.vendor || '—'}</td>
                        <td className="num">{formatIDR(it.est_cost)}</td>
                        <td className="num">
                          <span className={STATUS_CHIP_CLASS[it.status]}>{STATUS_LABEL[it.status]}</span>
                        </td>
                        <td>
                          <div className="budget-row-actions">
                            <button type="button" className="budget-icon-btn" onClick={() => setFormOpen(it.id)} aria-label="Edit">
                              ✎
                            </button>
                            <button type="button" className="budget-icon-btn" onClick={() => deleteItem(it.id)} aria-label="Delete">
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="ws-two-col">
      <div className="ws-col-main">
        <div className="ws-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p className="ws-section-title" style={{ margin: 0 }}>
              Ledger summary
            </p>
            <span className="currency-tag" style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color: 'var(--muted)', background: 'var(--cloud)', padding: '3px 8px', borderRadius: 999 }}>
              IDR
            </span>
          </div>

          {editingSettings ? (
            <BudgetSettingsForm meta={{ target_amount: target, contingency_pct: contingencyPct }} saving={savingSettings} onSave={saveSettings} onCancel={() => setEditingSettings(false)} />
          ) : (
            <div className="stack" style={{ gap: 8 }}>
              <div className="budget-summary-row">
                <span style={{ color: 'var(--muted)' }}>Subtotal ({items.length} item{items.length === 1 ? '' : 's'})</span>
                <span style={{ fontWeight: 700 }}>{formatIDR(subtotal)}</span>
              </div>
              <div className="budget-summary-row">
                <span style={{ color: 'var(--muted)' }}>Contingency ({contingencyPct}%)</span>
                <span style={{ fontWeight: 700 }}>{formatIDR(contingencyAmt)}</span>
              </div>
              <div className="budget-summary-row total">
                <span>Grand total</span>
                <span>{formatIDR(grandTotal)}</span>
              </div>
              <div className="budget-summary-row">
                <span style={{ color: 'var(--muted)' }}>Target budget</span>
                <span style={{ fontWeight: 700 }}>{target != null ? formatIDR(target) : 'Not set'}</span>
              </div>
              <div className="budget-summary-row">
                <span style={{ color: 'var(--muted)' }}>Actual spent so far</span>
                <span style={{ fontWeight: 700 }}>{formatIDR(actualSpent)}</span>
              </div>

              {vsTarget != null && (
                <div className={`budget-callout ${vsTarget >= 0 ? 'under' : 'over'}`}>
                  {vsTarget >= 0 ? `${formatIDR(vsTarget)} under target` : `${formatIDR(Math.abs(vsTarget))} over target`}
                </div>
              )}

              <button type="button" className="btn btn-outline btn-block" style={{ marginTop: 6, fontSize: 12 }} onClick={() => setEditingSettings(true)}>
                Edit target &amp; contingency
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="ws-col-side">
        {categoryRows.length > 0 && (
          <div className="ws-panel">
            <p className="ws-section-title">Spend by category</p>
            <div>
              {categoryRows.map(([cat, amt]) => (
                <div key={cat} className="budget-bar-row">
                  <div className="budget-bar-label">
                    <span>{cat}</span>
                    <span>{formatIDR(amt)}</span>
                  </div>
                  <div className="budget-bar-track">
                    <div className="budget-bar-fill" style={{ width: `${maxCategory > 0 ? Math.round((amt / maxCategory) * 100) : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}

function BudgetSettingsForm({ meta, saving, onSave, onCancel }) {
  const [target, setTarget] = useState(meta.target_amount ?? '')
  const [pct, setPct] = useState(meta.contingency_pct ?? 10)

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Target budget (IDR)</label>
        <input type="number" min="0" placeholder="e.g. 18000000" value={target} onChange={(e) => setTarget(e.target.value)} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Contingency %</label>
        <input type="number" min="0" max="100" value={pct} onChange={(e) => setPct(e.target.value)} />
      </div>
      <div className="row">
        <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={saving}
          onClick={() => onSave({ target_amount: target === '' ? null : Number(target), contingency_pct: pct === '' ? 0 : Number(pct) })}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function BudgetItemForm({ item, onSave, onCancel }) {
  const [category, setCategory] = useState(item?.category || CATEGORIES[0])
  const [itemName, setItemName] = useState(item?.item || '')
  const [vendor, setVendor] = useState(item?.vendor || '')
  const [estCost, setEstCost] = useState(item?.est_cost ?? '')
  const [actualCost, setActualCost] = useState(item?.actual_cost ?? '')
  const [status, setStatus] = useState(item?.status || 'not_started')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    await onSave({
      category,
      item: itemName.trim() || null,
      vendor: vendor.trim() || null,
      est_cost: estCost === '' ? 0 : Number(estCost),
      actual_cost: actualCost === '' ? null : Number(actualCost),
      status,
    })
    setBusy(false)
  }

  return (
    <div className="card stack" style={{ padding: 12, margin: item ? 0 : 14 }}>
      <div className="budget-item-form">
        <div className="field">
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="not_started">Not started</option>
            <option value="deposit_paid">Deposit paid</option>
            <option value="paid_in_full">Paid in full</option>
          </select>
        </div>
        <div className="field span-2">
          <label>Item</label>
          <input type="text" placeholder="e.g. Warehouse loft rental" value={itemName} onChange={(e) => setItemName(e.target.value)} />
        </div>
        <div className="field span-2">
          <label>Vendor</label>
          <input type="text" placeholder="e.g. Ombak Spaces" value={vendor} onChange={(e) => setVendor(e.target.value)} />
        </div>
        <div className="field">
          <label>Est. cost (IDR)</label>
          <input type="number" min="0" value={estCost} onChange={(e) => setEstCost(e.target.value)} />
        </div>
        <div className="field">
          <label>Actual cost (IDR)</label>
          <input type="number" min="0" placeholder="optional" value={actualCost} onChange={(e) => setActualCost(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
