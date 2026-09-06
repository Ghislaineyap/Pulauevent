import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { formatEventDates } from '../lib/date'
import { formatTime, formatDuration } from '../lib/schedule'

// The one unauthenticated page in the app — reached by a token link an
// organizer generates from "Share" (see ShareView). No sign-in, no tabbar,
// not even the app-shell chrome: just the schedule, grouped by day exactly
// like a multi-day event's client-facing rundown was designed to read, all
// on one link regardless of how many days the event runs.
export default function PublicSchedule() {
  const { token } = useParams()
  const [rows, setRows] = useState(null) // null = loading, [] = not found/empty
  const [error, setError] = useState(false)

  useEffect(() => {
    supabase
      .rpc('get_public_schedule', { p_token: token })
      .then(({ data, error: rpcError }) => {
        if (rpcError) {
          console.error(rpcError)
          setError(true)
          setRows([])
          return
        }
        setRows(data || [])
      })
  }, [token])

  if (rows === null) {
    return (
      <div className="client-page">
        <p className="subtitle">Loading…</p>
      </div>
    )
  }

  if (error || rows.length === 0) {
    return (
      <div className="client-page">
        <div className="client-brand-row">
          <span className="client-brand-dot" />
          <strong>Pulau Event</strong>
        </div>
        <div className="empty-state">This link isn't available, or the organizer hasn't shared any segments yet.</div>
      </div>
    )
  }

  const first = rows[0]
  const days = new Map()
  rows.forEach((r) => {
    const key = `${r.rundown_title}|${r.rundown_date || ''}`
    if (!days.has(key)) days.set(key, { title: r.rundown_title, date: r.rundown_date, items: [] })
    days.get(key).items.push(r)
  })

  return (
    <div className="client-page">
      <div className="client-brand-row">
        <span className="client-brand-dot" />
        <strong>Pulau Event</strong>
      </div>
      <h1>{first.event_title}</h1>
      <p className="subtitle" style={{ margin: 0 }}>
        {formatEventDates(first.event_start_date, first.event_end_date)}
        {first.event_location && ` · ${first.event_location}`}
      </p>

      {[...days.values()].map((day) => (
        <div key={`${day.title}|${day.date || ''}`} className="client-day-section">
          <h2 style={{ marginTop: 22 }}>
            {day.title}
            {day.date && ` · ${new Date(`${day.date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          </h2>
          <table className="client-day-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Duration</th>
                <th>Program</th>
              </tr>
            </thead>
            <tbody>
              {day.items.map((it, i) => (
                <tr key={i}>
                  <td>{formatTime(it.start_time)}</td>
                  <td>{formatDuration(it.duration_minutes)}</td>
                  <td>{it.segment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
