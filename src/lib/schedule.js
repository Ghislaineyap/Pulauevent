// Shared helpers for Rundown items: time formatting and the reorder-time-
// recalculation used when an item moves up/down in the list. Pulled out of
// any one component since both the organizer's editable RundownView and the
// (future) drag-free reorder logic need the exact same math.

// 'HH:MM:SS' (or 'HH:MM') -> minutes since midnight.
export function timeToMinutes(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + (m || 0)
}

// minutes since midnight -> 'HH:MM:00', wrapping past midnight so a load-in
// list that starts at 22:00 and runs long doesn't produce an invalid time.
export function minutesToTime(mins) {
  const wrapped = ((mins % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

// '14:05:00' -> '2:05 PM'
export function formatTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

export function formatDuration(mins) {
  if (!mins) return ''
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h} hr${h === 1 ? '' : 's'}` : `${h}h ${m}m`
}

// The reorder control is a single-step ▲▼ (not free drag — see the mobile
// mockup's decision to skip drag entirely), so a "move" is always a swap of
// two adjacent items. Only those two get a new start_time; everything else
// in the list is untouched (including any deliberate gaps elsewhere in the
// schedule). The item landing in the earlier of the two slots inherits
// whatever start_time used to belong to that slot; the item landing in the
// later slot is stacked immediately after it (its own start + duration).
export function reorderAndRetime(items, index, direction) {
  const target = index + direction
  if (target < 0 || target >= items.length) return items

  const next = [...items]
  const earlierPos = Math.min(index, target)
  const laterPos = Math.max(index, target)
  const inheritedStart = items[earlierPos].start_time

  next[earlierPos] = items[laterPos]
  next[laterPos] = items[earlierPos]

  const newFirst = { ...next[earlierPos], start_time: inheritedStart }
  const newSecond = {
    ...next[laterPos],
    start_time: minutesToTime(timeToMinutes(inheritedStart) + newFirst.duration_minutes),
  }
  next[earlierPos] = newFirst
  next[laterPos] = newSecond

  return next.map((item, i) => ({ ...item, sort_order: i }))
}
