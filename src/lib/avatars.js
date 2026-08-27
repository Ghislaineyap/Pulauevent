// Fallback avatar shown when a freelancer hasn't uploaded a real photo.
// Simplified from an 8-emoji picker down to 3 options tied directly to the
// gender field on their profile (see gender.js) — no separate picker UI
// needed, the right one is chosen automatically when they set their gender.
export const AVATARS = [
  { key: 'male', emoji: '🧔', gradient: 'linear-gradient(135deg, #0984E3, #1B3B6F)' },
  { key: 'female', emoji: '👩', gradient: 'linear-gradient(135deg, #FD79A8, #A6336B)' },
  { key: 'prefer_not_to_say', emoji: '🧑', gradient: 'linear-gradient(135deg, #576574, #222F3E)' },
]

// Falls back to the neutral avatar (not AVATARS[0]) for anything unrecognized
// — e.g. profiles created before this change, which had emoji-picker keys
// like "avatar-3" that no longer mean anything.
export function avatarFor(key) {
  return AVATARS.find((a) => a.key === key) || AVATARS[2]
}
