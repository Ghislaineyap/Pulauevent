// Preset avatars — v1 has no photo upload (see README), so every freelancer
// picks one of these instead of uploading a real photo. Each is just a
// gradient + emoji, rendered entirely in CSS/JS, no image files to host.
export const AVATARS = [
  { key: 'avatar-1', emoji: '🎬', gradient: 'linear-gradient(135deg, #FF6B6B, #C0392B)' },
  { key: 'avatar-2', emoji: '🎤', gradient: 'linear-gradient(135deg, #6C5CE7, #341F97)' },
  { key: 'avatar-3', emoji: '📸', gradient: 'linear-gradient(135deg, #00B894, #00636B)' },
  { key: 'avatar-4', emoji: '💡', gradient: 'linear-gradient(135deg, #FDCB6E, #E67E22)' },
  { key: 'avatar-5', emoji: '🎧', gradient: 'linear-gradient(135deg, #0984E3, #1B3B6F)' },
  { key: 'avatar-6', emoji: '🌸', gradient: 'linear-gradient(135deg, #FD79A8, #A6336B)' },
  { key: 'avatar-7', emoji: '🍽️', gradient: 'linear-gradient(135deg, #55E6C1, #12756D)' },
  { key: 'avatar-8', emoji: '🛡️', gradient: 'linear-gradient(135deg, #576574, #222F3E)' },
]

export function avatarFor(key) {
  return AVATARS.find((a) => a.key === key) || AVATARS[0]
}
