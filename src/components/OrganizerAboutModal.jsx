import { useState } from 'react'
import { Modal } from './Modal'
import { ReportForm } from './ReportForm'

// Shared "about the organizer" popup — used anywhere a freelancer might want
// to check who they're dealing with before responding: a job posting, an
// invite, or a Discover-style "interested in you" request. Organizer
// identity is never hidden, so this always leads with their real name.
//
// Also doubles as the entry point to report the organizer — swaps its own
// content for the report form rather than opening a second modal on top of
// itself, so there's never more than one backdrop on screen.
export function OrganizerAboutModal({ organizer, jobCount, onClose }) {
  const [reporting, setReporting] = useState(false)

  return (
    <Modal title={reporting ? `Report ${organizer.org_name}` : 'About the organizer'} onClose={onClose}>
      {reporting ? (
        <ReportForm
          reportedId={organizer.id}
          reportedName={organizer.org_name}
          onCancel={() => setReporting(false)}
          onDone={onClose}
        />
      ) : (
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
          {organizer.id && (
            <button
              type="button"
              className="helper-text"
              style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', color: 'var(--danger)' }}
              onClick={() => setReporting(true)}
            >
              🚩 Report this organizer
            </button>
          )}
        </div>
      )}
    </Modal>
  )
}
