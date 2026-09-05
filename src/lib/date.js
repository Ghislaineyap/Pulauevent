// Job postings can now span more than one day (event_start_date /
// event_end_date instead of a single event_date) — this formats either a
// single day or a range consistently everywhere a job's date is shown.
function formatDate(isoDate) {
  if (!isoDate) return ''
  const d = new Date(`${isoDate}T00:00:00`)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatEventDates(startDate, endDate) {
  if (!startDate) return ''
  if (!endDate || endDate === startDate) return formatDate(startDate)
  return `${formatDate(startDate)} – ${formatDate(endDate)}`
}

// Do two inclusive date ranges (ISO 'YYYY-MM-DD' strings) overlap at all —
// used to warn a freelancer they're already booked on an overlapping date
// before they apply to a second job on the same day(s).
export function datesOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart || !bStart) return false
  const aFrom = aStart
  const aTo = aEnd || aStart
  const bFrom = bStart
  const bTo = bEnd || bStart
  return aFrom <= bTo && bFrom <= aTo
}
