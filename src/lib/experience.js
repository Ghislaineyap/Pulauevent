// Years-of-experience is captured as a band, not an exact number — easier to
// pick, and easier to filter on ("show me 6-10 years") than an exact-number
// search would be.
export const EXPERIENCE_BANDS = [
  { value: '0-1', label: '0–1 years' },
  { value: '2-5', label: '2–5 years' },
  { value: '6-10', label: '6–10 years' },
  { value: '10+', label: '10+ years' },
]

export function experienceBandLabel(value) {
  return EXPERIENCE_BANDS.find((b) => b.value === value)?.label || value
}
