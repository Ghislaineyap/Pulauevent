import { avatarFor } from '../lib/avatars'
import { Silhouette } from './Silhouette'

// Big photo hero for the Discover card and profile detail page — shows the
// freelancer's real photo if they have one, or a gradient + neutral
// silhouette (colored by gender, see avatars.js) if not. dotCount/activeDot
// render the small carousel-style indicator when there's more than 1 photo.
export function PhotoFrame({ photoUrl, gender, dotCount = 0, activeDot = 0, children, style, className = '' }) {
  const bgStyle = photoUrl ? { backgroundImage: `url(${photoUrl})` } : { background: avatarFor(gender).gradient }
  return (
    <div className={`photo-frame ${className}`} style={{ ...bgStyle, ...style }}>
      {!photoUrl && <Silhouette />}
      {dotCount > 1 && (
        <div className="photo-dots">
          {Array.from({ length: dotCount }).map((_, i) => (
            <span key={i} className={i === activeDot ? 'on' : ''} />
          ))}
        </div>
      )}
      {children}
    </div>
  )
}
