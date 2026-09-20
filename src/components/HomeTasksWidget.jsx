import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'

// Home's to-do list — every open (not-done) event_tasks row across all of
// the organizer's upcoming events, in one place, instead of having to open
// each event's own Tasks tab to see what's outstanding. A task here always
// belongs to one event (event_tasks.job_id is required), so "add task" asks
// which event it's for; there's no "assign to" picker here since Home
// doesn't have a per-event team-member list assembled — assigning a task to
// a specific person still happens from that event's own Tasks tab (Manage
// event → Tasks), same table, same row, just a different view onto it.
export function HomeTasksWidget({ jobs }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)

  const jobIds = jobs.map((j) => j.id)
  const jobIdsKey = jobIds.join(',')

  const load = useCallback(async () => {
    if (jobIds.length === 0) {
      setTasks([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('event_tasks')
      .select('id, job_id, title, due_date')
      .in('job_id', jobIds)
      .eq('done', false)
      .order('due_date', { ascending: true, nullsFirst: false })
    if (error) console.error(error)
    setTasks(data || [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobIdsKey])

  useEffect(() => {
    load()
  }, [load])

  async function addTask(title, jobId, dueDate) {
    const { error } = await supabase.from('event_tasks').insert({ job_id: jobId, title, due_date: dueDate || null })
    if (error) {
      console.error(error)
      return
    }
    setShowAddForm(false)
    load()
  }

  async function toggleDone(taskId) {
    // Checking a box off Home's list only ever marks it done — it drops off
    // this widget immediately, same as ticking off any to-do; the row still
    // exists (done=true) and shows up, struck through, in that event's own
    // Tasks tab.
    const { error } = await supabase.from('event_tasks').update({ done: true }).eq('id', taskId)
    if (error) {
      console.error(error)
      return
    }
    setTasks((ts) => ts.filter((t) => t.id !== taskId))
  }

  const titleFor = (jobId) => jobs.find((j) => j.id === jobId)?.title

  return (
    <div className="card stack home-tasks-widget" style={{ padding: 14, gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 13 }}>To-do</strong>
        {jobs.length > 0 && (
          <button type="button" className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setShowAddForm((s) => !s)}>
            + Add
          </button>
        )}
      </div>

      {showAddForm && jobs.length > 0 && <AddHomeTaskForm jobs={jobs} onAdd={addTask} onCancel={() => setShowAddForm(false)} />}

      {loading && (
        <p className="subtitle" style={{ margin: 0 }}>
          Loading…
        </p>
      )}
      {!loading && jobs.length === 0 && (
        <p className="subtitle" style={{ margin: 0 }}>
          Create an event first to start a to-do list for it.
        </p>
      )}
      {!loading && jobs.length > 0 && tasks.length === 0 && (
        <p className="subtitle" style={{ margin: 0 }}>
          Nothing on your list — add a task to get started.
        </p>
      )}

      <div className="stack" style={{ gap: 6 }}>
        {tasks.map((t) => (
          <div key={t.id} className="task-row">
            <button type="button" className="task-check" onClick={() => toggleDone(t.id)} aria-label="Mark done" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 13 }}>{t.title}</strong>
              <p className="subtitle" style={{ margin: '2px 0 0' }}>
                {titleFor(t.job_id)}
                {t.due_date && ` · Due ${new Date(`${t.due_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AddHomeTaskForm({ jobs, onAdd, onCancel }) {
  const [title, setTitle] = useState('')
  const [jobId, setJobId] = useState(jobs[0]?.id || '')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!title.trim() || !jobId) return
    setBusy(true)
    await onAdd(title.trim(), jobId, dueDate)
    setTitle('')
    setDueDate('')
    setBusy(false)
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="home-task-title">Task</label>
        <input id="home-task-title" type="text" placeholder="e.g. Confirm final headcount" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="row">
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor="home-task-event">Event</label>
          <select id="home-task-event" value={jobId} onChange={(e) => setJobId(e.target.value)}>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor="home-task-due">Due (optional)</label>
          <input id="home-task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={busy || !title.trim() || !jobId} onClick={submit}>
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
    </div>
  )
}
