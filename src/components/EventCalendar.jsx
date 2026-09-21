import { useMemo, useState } from 'react'
import { Modal } from './Modal'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function isoDay(year, month, day) {
  const mm = String(month + 1).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

// Small month-grid calendar. Booked days show the event's name right on the
// cell (instead of a separate bullet list below the grid), and tapping a
// booked day opens it — either straight into the event (one event that day)
// or a quick picker when more than one event lands on the same date.
export function EventCalendar({ events, onSelectEvent }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth()) // 0-11
  const [dayPicker, setDayPicker] = useState(null) // array of events sharing a date, or null

  const eventsByDay = useMemo(() => {
    const map = new Map()
    events.forEach((ev) => {
      let d = new Date(`${ev.event_start_date}T00:00:00`)
      const end = new Date(`${(ev.event_end_date || ev.event_start_date)}T00:00:00`)
      while (d <= end) {
        // Build the key from the local calendar fields, not toISOString()
        // (which converts through UTC first) — for anyone east of UTC that
        // shifts local midnight back a day, so a 27th event was keyed and
        // marked on the 26th.
        const key = isoDay(d.getFullYear(), d.getMonth(), d.getDate())
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
  const todayISO = isoDay(today.getFullYear(), today.getMonth(), today.getDate())

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

  function handleDayClick(dayEvents) {
    if (!onSelectEvent || dayEvents.length === 0) return
    if (dayEvents.length === 1) {
      onSelectEvent(dayEvents[0])
    } else {
      setDayPicker(dayEvents)
    }
  }

  function pickEvent(ev) {
    setDayPicker(null)
    onSelectEvent?.(ev)
  }

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
            <button
              key={i}
              type="button"
              disabled={!booked}
              onClick={() => handleDayClick(dayEvents)}
              title={dayEvents.map((e) => e.title).join(', ')}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 2,
                minWidth: 0,
                minHeight: 42,
                padding: '4px 2px',
                borderRadius: 8,
                fontFamily: 'inherit',
                background: booked ? 'var(--primary)' : 'transparent',
                border: isToday && !booked ? '1px solid var(--primary)' : 'none',
                cursor: booked ? 'pointer' : 'default',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: booked ? 'white' : 'var(--ink)' }}>{day}</span>
              {booked && (
                <span
                  style={{
                    fontSize: 8.5,
                    fontWeight: 700,
                    lineHeight: 1.15,
                    color: 'white',
                    // Flex children default to min-width: auto, which lets
                    // text force the span (and the whole grid cell) wider
                    // than its 1/7 track instead of truncating — width:
                    // 100% + minWidth: 0 is what actually makes the
                    // ellipsis kick in inside a flex column.
                    width: '100%',
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {dayEvents[0].title}
                  {dayEvents.length > 1 ? ` +${dayEvents.length - 1}` : ''}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {dayPicker && (
        <Modal title="Events on this day" onClose={() => setDayPicker(null)}>
          <div className="stack">
            {dayPicker.map((ev) => (
              <button key={ev.id} type="button" className="btn btn-outline btn-block" onClick={() => pickEvent(ev)}>
                {ev.title}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
