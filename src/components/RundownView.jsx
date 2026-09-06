import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { InfoButton } from './InfoButton'
import { formatTime, formatDuration, reorderAndRetime, timeToMinutes, minutesToTime } from '../lib/schedule'

// Shared Rundown feature — organizer gets full CRUD + reorder, a freelancer
// (or the desktop read-only workspace tab) gets the same list/detail views
// with canEdit=false so nothing renders that they can't use. Mounted as-is
// inside the mobile "Manage event" modal (organizer/freelancer MyEvents)
// AND inside the desktop event-workspace page's Rundown tab — same
// component, two different chrome.
export function RundownView({ jobId, canEdit }) {
  const [rundowns, setRundowns] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [showNewForm, setShowNewForm] = useState(false)
  const [editingItemId, setEditingItemId] = useState(null)

  const loadRundowns = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('event_rundowns')
      .select('id, title, event_date')
      .eq('job_id', jobId)
      .order('event_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
    if (error) console.error(error)
    setRundowns(data || [])
    setLoading(false)
  }, [jobId])

  useEffect(() => {
    loadRundowns()
  }, [loadRundowns])

  const loadItems = useCallback(async (rundownId) => {
    if (!rundownId) {
      setItems([])
      return
    }
    setItemsLoading(true)
    const { data, error } = await supabase
      .from('event_rundown_items')
      .select('id, sort_order, start_time, duration_minutes, segment, owner_label, note, client_visible')
      .eq('rundown_id', rundownId)
      .order('sort_order', { ascending: true })
    if (error) console.error(error)
    setItems(data || [])
    setItemsLoading(false)
  }, [])

  useEffect(() => {
    loadItems(selectedId)
  }, [selectedId, loadItems])

  async function createRundown(title, event_date) {
    const { data: userData } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('event_rundowns')
      .insert({ job_id: jobId, title, event_date: event_date || null, created_by: userData?.user?.id })
      .select()
      .single()
    if (error) {
      console.error(error)
      return
    }
    setShowNewForm(false)
    await loadRundowns()
    setSelectedId(data.id)
  }

  async function deleteRundown(rundownId) {
    if (!window.confirm('Delete this rundown and all its segments? This can’t be undone.')) return
    const { error } = await supabase.from('event_rundowns').delete().eq('id', rundownId)
    if (error) {
      console.error(error)
      return
    }
    setSelectedId(null)
    loadRundowns()
  }

  async function addItem(payload) {
    const { error } = await supabase.from('event_rundown_items').insert({
      rundown_id: selectedId,
      sort_order: items.length,
      ...payload,
    })
    if (error) {
      console.error(error)
      return
    }
    loadItems(selectedId)
  }

  async function updateItem(itemId, payload) {
    const { error } = await supabase.from('event_rundown_items').update(payload).eq('id', itemId)
    if (error) {
      console.error(error)
      return
    }
    setEditingItemId(null)
    loadItems(selectedId)
  }

  async function deleteItem(itemId) {
    const { error } = await supabase.from('event_rundown_items').delete().eq('id', itemId)
    if (error) {
      console.error(error)
      return
    }
    loadItems(selectedId)
  }

  async function moveItem(index, direction) {
    const reordered = reorderAndRetime(items, index, direction)
    if (reordered === items) return
    setItems(reordered) // optimistic — the two changed rows are written right after
    const changed = reordered.filter((it, i) => it.id !== items[i]?.id || it.start_time !== items[i]?.start_time)
    for (const it of changed) {
      const { error } = await supabase
        .from('event_rundown_items')
        .update({ sort_order: it.sort_order, start_time: it.start_time })
        .eq('id', it.id)
      if (error) console.error(error)
    }
  }

  const selectedRundown = rundowns.find((r) => r.id === selectedId)

  if (loading) return <p className="subtitle">Loading…</p>

  if (!selectedId) {
    return (
      <div className="stack">
        {canEdit && (
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <p className="subtitle" style={{ margin: 0 }}>
              {rundowns.length} rundown{rundowns.length === 1 ? '' : 's'}
            </p>
            <button type="button" className="btn btn-outline" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setShowNewForm((s) => !s)}>
              + New rundown
            </button>
          </div>
        )}
        {showNewForm && canEdit && <NewRundownForm onCreate={createRundown} onCancel={() => setShowNewForm(false)} />}
        {rundowns.length === 0 && !showNewForm && (
          <div className="empty-state">
            {canEdit ? 'No rundowns yet — create one for Day 1, a crew load-in list, or anything else.' : 'No rundown has been shared for this event yet.'}
          </div>
        )}
        <div className="stack" style={{ gap: 8 }}>
          {rundowns.map((r) => (
            <button key={r.id} type="button" className="rundown-list-row" onClick={() => setSelectedId(r.id)}>
              <span>
                <strong style={{ fontSize: 13.5 }}>{r.title}</strong>
                {r.event_date && (
                  <p className="subtitle" style={{ margin: '2px 0 0' }}>
                    {new Date(`${r.event_date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </p>
                )}
              </span>
              <span style={{ color: 'var(--muted)' }}>›</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setSelectedId(null)}>
          ← All rundowns
        </button>
        {canEdit && (
          <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 12, color: 'var(--danger)' }} onClick={() => deleteRundown(selectedId)}>
            Delete
          </button>
        )}
      </div>
      <div>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
          {selectedRundown?.title}
          {canEdit && <InfoButton title="Reordering">Use the ▲▼ arrows to move a segment. The times around it update automatically — no need to retype anything.</InfoButton>}
        </h2>
        {selectedRundown?.event_date && (
          <p className="subtitle" style={{ margin: '2px 0 0' }}>
            {new Date(`${selectedRundown.event_date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
        )}
      </div>

      {itemsLoading && <p className="subtitle">Loading…</p>}
      {!itemsLoading && items.length === 0 && <div className="empty-state">No segments yet.</div>}

      <div className="stack" style={{ gap: 8 }}>
        {items.map((item, i) =>
          editingItemId === item.id ? (
            <ItemForm
              key={item.id}
              item={item}
              onSave={(payload) => updateItem(item.id, payload)}
              onCancel={() => setEditingItemId(null)}
            />
          ) : (
            <div key={item.id} className="rundown-item">
              {canEdit && (
                <div className="ri-reorder">
                  <button type="button" className="ri-arrow" disabled={i === 0} onClick={() => moveItem(i, -1)} aria-label="Move earlier">
                    ▲
                  </button>
                  <button type="button" className="ri-arrow" disabled={i === items.length - 1} onClick={() => moveItem(i, 1)} aria-label="Move later">
                    ▼
                  </button>
                </div>
              )}
              <span className="ri-time">{formatTime(item.start_time)}</span>
              <div className="ri-body">
                <strong style={{ fontSize: 13 }}>{item.segment}</strong>
                <p className="subtitle" style={{ margin: '2px 0 0' }}>
                  {formatDuration(item.duration_minutes)}
                  {item.owner_label && ` · ${item.owner_label}`}
                </p>
                {item.note && (
                  <p className="subtitle" style={{ margin: '2px 0 0' }}>
                    {item.note}
                  </p>
                )}
              </div>
              {canEdit && (
                <div className="row" style={{ gap: 2 }}>
                  <button
                    type="button"
                    onClick={() => setEditingItemId(item.id)}
                    aria-label="Edit segment"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 14, padding: 4 }}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteItem(item.id)}
                    aria-label="Delete segment"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, padding: 4 }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          )
        )}
      </div>

      {canEdit && (
        <AddItemForm
          onAdd={addItem}
          // Default the new segment to start right where the last one ends,
          // instead of always defaulting to 09:00 — the whole point of a
          // time-sequenced rundown is that segments stack back to back, so
          // this is what an organizer wants nearly every time; they can
          // still edit the time before saving.
          defaultStartTime={items.length > 0 ? minutesToTime(timeToMinutes(items[items.length - 1].start_time) + items[items.length - 1].duration_minutes) : null}
        />
      )}
    </div>
  )
}

function NewRundownForm({ onCreate, onCancel }) {
  const [title, setTitle] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!title.trim()) return
    setBusy(true)
    await onCreate(title.trim(), eventDate)
    setBusy(false)
  }

  return (
    <div className="card stack" style={{ padding: 12 }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Title</label>
        <input type="text" placeholder="e.g. Day 1 — Press Preview" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label style={{ display: 'flex', alignItems: 'center' }}>
          Date (optional)
          <InfoButton title="Date">Leave blank for a rundown that applies to the whole event, like a crew-only load-in/load-out list spanning both days.</InfoButton>
        </label>
        <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
      </div>
      <div className="row">
        <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={busy || !title.trim()} onClick={submit}>
          {busy ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  )
}

function AddItemForm({ onAdd, defaultStartTime }) {
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <button type="button" className="btn btn-outline btn-block" onClick={() => setOpen(true)}>
        + Add segment
      </button>
    )
  }

  return (
    <ItemForm
      defaultStartTime={defaultStartTime}
      onSave={async (payload) => {
        await onAdd(payload)
        setOpen(false)
      }}
      onCancel={() => setOpen(false)}
    />
  )
}

// Shared segment form for both "+ Add segment" (item=null) and editing an
// existing row in place (item set) — same fields either way, just a
// different starting value and a different button label.
function ItemForm({ item, defaultStartTime, onSave, onCancel }) {
  const [segment, setSegment] = useState(item?.segment || '')
  // New segments default to right after the previous one ends (see the
  // defaultStartTime passed from RundownView); editing an existing segment
  // keeps its own time; a rundown's very first segment falls back to 09:00.
  const [startTime, setStartTime] = useState((item?.start_time || defaultStartTime || '09:00:00').slice(0, 5))
  const [duration, setDuration] = useState(String(item?.duration_minutes || 30))
  const [ownerLabel, setOwnerLabel] = useState(item?.owner_label || '')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!segment.trim() || !startTime || !duration) return
    setBusy(true)
    await onSave({
      segment: segment.trim(),
      start_time: `${startTime}:00`,
      duration_minutes: Number(duration),
      owner_label: ownerLabel.trim() || null,
    })
    setBusy(false)
  }

  return (
    <div className="card stack" style={{ padding: 12 }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Segment</label>
        <input type="text" placeholder="e.g. Doors open" value={segment} onChange={(e) => setSegment(e.target.value)} />
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Start time</label>
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Duration (min)</label>
          <input type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </div>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Owner (optional)</label>
        <input type="text" placeholder="e.g. MC / Host" value={ownerLabel} onChange={(e) => setOwnerLabel(e.target.value)} />
      </div>
      <div className="row">
        <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={busy || !segment.trim()} onClick={submit}>
          {busy ? 'Saving…' : item ? 'Save' : 'Add'}
        </button>
      </div>
    </div>
  )
}
