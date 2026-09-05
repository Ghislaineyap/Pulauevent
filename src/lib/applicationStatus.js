// Friendly, non-harsh wording for an application's status — shown to the
// freelancer who applied. Never say "rejected"/"declined" outright.
export function applicationStatusLabel(status) {
  switch (status) {
    case 'pending':
      return 'Pending review'
    case 'accepted':
      return 'Confirmed'
    case 'declined':
      return 'Not selected'
    case 'invited':
      return 'Invited — respond in Connect'
    case 'cancelled':
      return 'Removed from this event'
    default:
      return status
  }
}

// Which chip style to pair the label with, so accepted reads as a positive
// (filled/active chip) and the other two stay neutral outline chips.
export function applicationStatusChipClass(status) {
  return status === 'accepted' || status === 'invited' ? 'chip' : 'chip chip-outline'
}
