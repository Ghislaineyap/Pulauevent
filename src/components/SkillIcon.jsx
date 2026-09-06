// Small role icon, purely cosmetic — used anywhere a division/role needs to
// read at a glance (Post's division rows, My Event's dashboard agenda).
// Falls back to a generic person icon for anything not in the curated list,
// including custom "Other: ..." skills.
export function SkillIcon({ skill, size = 18, color = 'var(--primary)' }) {
  const s = (skill || '').toLowerCase()
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

  if (s.includes('photo') || s.includes('video')) {
    return (
      <svg {...props}>
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7l1.5-3h5L16 7" />
        <circle cx="12" cy="13.5" r="3.2" />
      </svg>
    )
  }
  if (s.includes('mc') || s.includes('host') || s.includes('emcee')) {
    return (
      <svg {...props}>
        <path d="M12 3v6M8 6l4 3 4-3" />
        <rect x="5" y="12" width="14" height="8" rx="2" />
      </svg>
    )
  }
  if (s.includes('decor') || s.includes('florist') || s.includes('styling')) {
    return (
      <svg {...props}>
        <path d="M12 3v10" />
        <circle cx="12" cy="16.5" r="4" />
      </svg>
    )
  }
  return (
    <svg {...props}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.9 3.1-6 7-6s7 2.1 7 6" />
    </svg>
  )
}
