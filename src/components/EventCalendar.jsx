import { useMemo, useState } from 'react'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function isoDay(year, month, day) {
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

// Small month-grid calendar highlighting the freelancer's confirmed
// (accepted) event dates, so they can see at a glance what they're already
// booked for before applying to something else on the same day(s).
export function EventCalendar({ events }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth()) // 0-11

  const eventsByDay = useMemo(() => {
    const map = new Map()
    events.forEach((ev) => {
      let d = new Date(`${ev.event_start_date}T00:00:00`)
      const end = new Date(`${(ev.event_end_date || ev.event_start_date)}T00:00:00`)
      while (d <= end) {
        const key = d.toISOString().slice(0, 10)
        const list = map.get(key) || []
        list.push(ev)
        map.set(key, list)
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
      }
    })
    return map
  }, [events])

  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const startOffset = firstOfMonth.getDay()
  const cells = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const monthLabel = firstOfMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const todayISO = today.toISOString().slice(0, 10)

  function changeMonth(delta) {
    let m = viewMonth + delta
    let y = viewYear
    if (m < 0) {
      m = 11
      y -= 1
    } else if (m > 11) {
      m = 0
      y += 1
    }
    setViewMonth(m)
    setViewYear(y)
  }

  const monthEvents = [...new Set([...eventsByDay.entries()].filter(([day]) => day.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`)).flatMap(([, evs]) => evs))]

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <button type="button" className="btn btn-outline" style={{ padding: '4px 10px' }} onClick={() => changeMonth(-1)}>
          ‹
        </button>
        <strong>{monthLabel}</strong>
        <button type="button" className="btn btn-outline" style={{ padding: '4px 10px' }} onClick={() => changeMonth(1)}>
          ›
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="subtitle" style={{ fontSize: 11, fontWeight: 700 }}>
            {w}
          </div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const key = isoDay(viewYear, viewMonth, day)
          const dayEvents = eventsByDay.get(key) || []
          const booked = dayEvents.length > 0
          const isToday = key === todayISO
          return (
            <div
              key={i}
              title={dayEvents.map((e) => e.title).join(', ')}
              style={{
                padding: '6px 0',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: isToday ? 700 : 500,
                background: booked ? 'var(--primary)' : 'transparent',
                color: booked ? 'white' : 'var(--ink)',
                border: isToday && !booked ? '1px solid var(--primary)' : 'none',
              }}
            >
              {day}
            </div>
          )
        })}
      </div>
      <div className="stack" style={{ gap: 4 }}>
        <strong style={{ fontSize: 12 }}>Booked this month</strong>
        {monthEvents.length === 0 ? (
          <p className="subtitle" style={{ margin: 0 }}>Nothing booked yet.</p>
        ) : (
          monthEvents.map((ev) => (
            <p key={ev.id} className="subtitle" style={{ margin: 0 }}>
              🔵 {ev.title}
            </p>
          ))
        )}
      </div>
    </div>
  )
}
