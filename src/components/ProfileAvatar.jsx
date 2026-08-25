import { avatarFor } from '../lib/avatars'

// Renders a freelancer's real photo if they've uploaded one, falling back to
// their chosen preset avatar (gradient + emoji) otherwise. Used everywhere a
// freelancer's picture shows up — onboarding, browse, applicant review, matches.
export function ProfileAvatar({ avatarKey, photoUrl, size }) {
  const style = size ? { width: size, height: size, fontSize: Math.round(size * 0.46) } : undefined

  if (photoUrl) {
    return <img src={photoUrl} alt="" className="avatar" style={{ ...style, objectFit: 'cover' }} />
  }

  const avatar = avatarFor(avatarKey)
  return (
    <span className="avatar" style={{ ...style, background: avatar.gradient }}>
      {avatar.emoji}
    </span>
  )
}
