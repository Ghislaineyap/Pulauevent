import { Modal } from './Modal'

// Shared "about the organizer" popup — used anywhere a freelancer might want
// to check who they're dealing with before responding: a job posting, an
// invite, or a Discover-style "interested in you" request. Organizer
// identity is never hidden, so this always leads with their real name.
export function OrganizerAboutModal({ organizer, jobCount, onClose }) {
  return (
    <Modal title="About the organizer" onClose={onClose}>
      <div className="stack">
        {organizer.logo_url && (
          <img src={organizer.logo_url} alt="" style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />
        )}
        <p style={{ margin: 0, fontWeight: 600 }}>{organizer.org_name}</p>
        {organizer.location && <p className="subtitle" style={{ margin: 0 }}>📍 Based in {organizer.location}</p>}
        {jobCount != null && (
          <p className="subtitle" style={{ margin: 0 }}>
            Posted {jobCount} event{jobCount === 1 ? '' : 's'} on Pulau Event
          </p>
        )}
        {organizer.about && <p style={{ margin: 0 }}>{organizer.about}</p>}
        {organizer.instagram_handle ? (
          <a
            href={`https://instagram.com/${organizer.instagram_handle.replace(/^@/, '')}`}
            target="_blank"
            rel="noreferrer"
            className="subtitle"
            style={{ color: 'var(--primary-dark)', fontWeight: 600 }}
          >
            📷 @{organizer.instagram_handle.replace(/^@/, '')}
          </a>
        ) : (
          <p className="helper-text" style={{ margin: 0 }}>No social profile linked yet.</p>
        )}
      </div>
    </Modal>
  )
}
