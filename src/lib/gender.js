// Freelancer gender — drives both the profile field and, since there's no
// manual avatar picker anymore, which of the 3 simple fallback avatars in
// avatars.js is shown when no real photo is uploaded.
export const GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
]

export function genderLabel(value) {
  return GENDERS.find((g) => g.value === value)?.label || 'Prefer not to say'
}
