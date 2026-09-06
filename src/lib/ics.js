// Client-side .ics generation — no calendar API, no OAuth. Works with
// Google/Apple/Outlook: the browser downloads a plain text file and the
// OS/calendar app that owns the .ics extension opens an "Add event" sheet.
// This is deliberately simple (one VEVENT, or one per rundown day) rather
// than a full RFC 5545 library, since that's all "add this event to my
// calendar" needs.

function pad(n) {
  return String(n).padStart(2, '0')
}

// A local date/time -> the UTC 'YYYYMMDDTHHMMSSZ' form .ics wants. Treats
// the given Date as already being in the viewer's local time, same as any
// native <input type="date">/"time"> value would be interpreted.
function toICSDate(date) {
  return (
    date.getUTCFullYear() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  )
}

function escapeICSText(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

// events: [{ uid, title, description, location, start: Date, end: Date }]
export function buildICS(events) {
  const now = toICSDate(new Date())
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pulau Event//Rundown//EN', 'CALSCALE:GREGORIAN']
  events.forEach((ev) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${toICSDate(ev.start)}`,
      `DTEND:${toICSDate(ev.end)}`,
      `SUMMARY:${escapeICSText(ev.title)}`
    )
    if (ev.description) lines.push(`DESCRIPTION:${escapeICSText(ev.description)}`)
    if (ev.location) lines.push(`LOCATION:${escapeICSText(ev.location)}`)
    lines.push('END:VEVENT')
  })
  lines.push('END:VCALENDAR')
  // .ics wants CRLF line endings.
  return lines.join('\r\n')
}

// Turns a job + its rundowns/items into calendar VEVENTs: one per rundown
// day that actually has segments (spanning its first segment's start to its
// last segment's end), or — if there's no rundown yet — a single all-day-ish
// event covering the whole event_start_date..event_end_date span. This is
// what "Add to calendar" (on the My Event / overview level, not the Rundown
// tab — see the mockup decision that moved it there) hands to downloadICS.
//
// Note: start_time in the schema is a plain wall-clock time with no
// timezone of its own (same as the rest of the app) — this assumes it
// means local time wherever the event actually is, and .ics export then
// converts using the DEVICE's timezone at the moment of export. For an app
// whose events are all in one country/timezone this is a reasonable
// simplification; it would need a stored event timezone to be fully
// correct for a traveling client.
export function eventsFromJobSchedule(job, rundowns, items) {
  const byRundown = new Map()
  ;(items || []).forEach((it) => {
    const list = byRundown.get(it.rundown_id) || []
    list.push(it)
    byRundown.set(it.rundown_id, list)
  })

  const dayEvents = (rundowns || [])
    .map((r) => {
      const dayItems = (byRundown.get(r.id) || []).slice().sort((a, b) => a.sort_order - b.sort_order)
      if (dayItems.length === 0) return null
      const dateStr = r.event_date || job.event_start_date
      const first = dayItems[0]
      const last = dayItems[dayItems.length - 1]
      const start = new Date(`${dateStr}T${first.start_time}`)
      const end = new Date(`${dateStr}T${last.start_time}`)
      end.setMinutes(end.getMinutes() + last.duration_minutes)
      return {
        uid: `rundown-${r.id}@pulauevent`,
        title: `${job.title} — ${r.title}`,
        location: job.location,
        start,
        end,
      }
    })
    .filter(Boolean)

  if (dayEvents.length > 0) return dayEvents

  const start = new Date(`${job.event_start_date}T00:00:00`)
  const end = new Date(`${job.event_end_date}T00:00:00`)
  end.setDate(end.getDate() + 1) // all-day span is exclusive of the end date
  return [{ uid: `job-${job.id}@pulauevent`, title: job.title, location: job.location, start, end }]
}

export function downloadICS(filename, events) {
  const content = buildICS(events)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
