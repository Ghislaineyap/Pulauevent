import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { InfoButton } from './InfoButton'

// Shared Tasks feature. Organizer (canManage) can add/assign/delete any
// task and check off any row; a freelancer can only flip done/undone on a
// row assigned to them (enforced again server-side by RLS — this is just
// the UI reflecting the same rule). Freelancer view defaults to "assigned
// to me" but can show everything, matching the RLS model: read is shared
// across the whole confirmed team.
export function TasksView({ jobId, canManage, currentUserId, teamMembers = [] }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(canManage)
  const [showAddForm, setShowAddForm] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('event_tasks')
      .select('id, title, done, assigned_to, due_date')
      .eq('job_id', jobId)
      .order('done', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
    if (error) console.error(error)
    setTasks(data || [])
    setLoading(false)
  }, [jobId])

  useEffect(() => {
    load()
  }, [load])

  async function addTask(title, assignedTo, dueDate) {
    const { error } = await supabase.from('event_tasks').insert({
      job_id: jobId,
      title,
      assigned_to: assignedTo || null,
      due_date: dueDate || null,
    })
    if (error) {
      console.error(error)
      return
    }
    setShowAddForm(false)
    load()
  }

  async function toggleDone(task) {
    const { error } = await supabase.from('event_tasks').update({ done: !task.done }).eq('id', task.id)
    if (error) {
      console.error(error)
      return
    }
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)))
  }

  async function deleteTask(taskId) {
    const { error } = await supabase.from('event_tasks').delete().eq('id', taskId)
    if (error) {
      console.error(error)
      return
    }
    load()
  }

  const visibleTasks = showAll ? tasks : tasks.filter((t) => t.assigned_to === currentUserId)
  const nameFor = (id) => teamMembers.find((m) => m.id === id)?.name

  if (loading) return <p className="subtitle">Loading…</p>

  return (
    <div className="stack">
      {!canManage && (
        <div className="segmented">
          <button type="button" className={!showAll ? 'active' : ''} onClick={() => setShowAll(false)}>
            Assigned to me
          </button>
          <button type="button" className={showAll ? 'active' : ''} onClick={() => setShowAll(true)}>
            Everyone's
          </button>
        </div>
      )}

      {canManage && (
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="subtitle" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
            {tasks.filter((t) => !t.done).length} open · {tasks.filter((t) => t.done).length} done
            <InfoButton title="Tasks">The whole confirmed team can see this list. A freelancer can only check off a task assigned to them — everything else here is organizer-only.</InfoButton>
          </p>
          <button type="button" className="btn btn-outline" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => setShowAddForm((s) => !s)}>
            + Add task
          </button>
        </div>
      )}

      {showAddForm && canManage && <AddTaskForm teamMembers={teamMembers} onAdd={addTask} onCancel={() => setShowAddForm(false)} />}

      {visibleTasks.length === 0 && (
        <div className="empty-state">{showAll ? 'No tasks yet.' : "Nothing assigned to you yet — check \"Everyone's\" to see the full list."}</div>
      )}

      <div className="stack" style={{ gap: 8 }}>
        {visibleTasks.map((t) => {
          const canCheck = canManage || t.assigned_to === currentUserId
          return (
            <div key={t.id} className={`task-row${t.done ? ' done' : ''}`}>
              <button
                type="button"
                className={`task-check${t.done ? ' checked' : ''}`}
                disabled={!canCheck}
                onClick={() => toggleDone(t)}
                aria-label={t.done ? 'Mark not done' : 'Mark done'}
              >
                {t.done ? '✓' : ''}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 13, textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</strong>
                <p className="subtitle" style={{ margin: '2px 0 0' }}>
                  {t.assigned_to ? nameFor(t.assigned_to) || 'Assigned' : 'Unassigned'}
                  {t.due_date && ` · Due ${new Date(`${t.due_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                </p>
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => deleteTask(t.id)}
                  aria-label="Delete task"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, padding: 4 }}
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AddTaskForm({ teamMembers, onAdd, onCancel }) {
  const [title, setTitle] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!title.trim()) return
    setBusy(true)
    await onAdd(title.trim(), assignedTo, dueDate)
    setTitle('')
    setBusy(false)
  }

  return (
    <div className="card stack" style={{ padding: 12 }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Task</label>
        <input type="text" placeholder="e.g. Confirm final headcount" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Assign to (optional)</label>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Unassigned</option>
            {teamMembers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label>Due (optional)</label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={busy || !title.trim()} onClick={submit}>
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
    </div>
  )
}
