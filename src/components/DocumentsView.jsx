import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthProvider'
import { InfoButton } from './InfoButton'
import { Modal } from './Modal'
import {
  listEventDocuments,
  uploadEventDocument,
  deleteEventDocument,
  getSignedDocUrl,
  formatFileSize,
  fileKindIcon,
  canPreviewInline,
} from '../lib/eventDocs'

// Replaces the old Rundown + Share-with-client tabs — instead of building a
// time-sequenced schedule inside the app, the organizer just uploads
// whatever document already has the info (a contract, floor plan, a
// run-of-show exported as a PDF) and the confirmed team can view/download
// it. Mounted the same way RundownView was: inside the mobile "Manage
// event" modal AND the desktop workspace's Documents tab, canEdit=false for
// a freelancer/read-only context.
export function DocumentsView({ jobId, canEdit }) {
  const { user } = useAuth()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null) // { doc, url } | null
  const [previewLoading, setPreviewLoading] = useState(false)
  const fileInputRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setDocs(await listEventDocuments(jobId))
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }, [jobId])

  useEffect(() => {
    load()
  }, [load])

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // let the same file be picked again immediately if the upload fails
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      await uploadEventDocument(jobId, user.id, file)
      await load()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not upload that file.')
    }
    setUploading(false)
  }

  async function handleDelete(doc) {
    if (!window.confirm(`Delete "${doc.file_name}"? This can't be undone.`)) return
    try {
      await deleteEventDocument(doc)
      setDocs((prev) => prev.filter((d) => d.id !== doc.id))
    } catch (err) {
      console.error(err)
      setError(err.message || 'Could not delete that file.')
    }
  }

  async function openPreview(doc) {
    setPreview({ doc, url: null })
    setPreviewLoading(true)
    try {
      const url = await getSignedDocUrl(doc.storage_path)
      setPreview({ doc, url })
    } catch (err) {
      console.error(err)
      setError('Could not open that file.')
      setPreview(null)
    }
    setPreviewLoading(false)
  }

  return (
    <div className="stack">
      <p className="subtitle" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
        {canEdit ? 'Upload contracts, floor plans, or anything the team needs' : 'Documents shared for this event'}
        <InfoButton title="Documents">
          {canEdit
            ? 'Upload a file and everyone confirmed on this event can view or download it — no separate client link to manage.'
            : "Files the organizer has uploaded for this event. Tap one to preview it (PDFs and images open right here), or download it."}
        </InfoButton>
      </p>

      {canEdit && (
        <div>
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileChange} disabled={uploading} />
          <button type="button" className="btn btn-outline btn-block" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? 'Uploading…' : '+ Upload document'}
          </button>
        </div>
      )}

      {error && <p className="helper-text" style={{ color: 'var(--danger)' }}>{error}</p>}

      {loading && <p className="subtitle">Loading…</p>}
      {!loading && docs.length === 0 && (
        <div className="empty-state">{canEdit ? 'No documents yet — upload the first one for your team.' : 'No documents have been shared for this event yet.'}</div>
      )}

      <div className="stack" style={{ gap: 8 }}>
        {docs.map((doc) => (
          <div key={doc.id} className="card" style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>{fileKindIcon(doc.mime_type)}</span>
            <button
              type="button"
              onClick={() => openPreview(doc)}
              style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <strong style={{ fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.file_name}</strong>
              <span className="subtitle" style={{ margin: 0 }}>
                {formatFileSize(doc.file_size)} · {new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => handleDelete(doc)}
                aria-label="Delete"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: 16, padding: 4, flexShrink: 0 }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {preview && (
        <Modal title={preview.doc.file_name} onClose={() => setPreview(null)}>
          <div className="stack">
            {previewLoading && <p className="subtitle">Loading…</p>}
            {!previewLoading && preview.url && (
              <>
                {canPreviewInline(preview.doc.mime_type) ? (
                  preview.doc.mime_type === 'application/pdf' ? (
                    <iframe src={preview.url} title={preview.doc.file_name} style={{ width: '100%', height: '70vh', border: '1px solid var(--border)', borderRadius: 8 }} />
                  ) : (
                    <img src={preview.url} alt={preview.doc.file_name} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: 8 }} />
                  )
                ) : (
                  <p className="subtitle" style={{ margin: 0 }}>No inline preview available for this file type — download it to view.</p>
                )}
                <a href={preview.url} download={preview.doc.file_name} className="btn btn-primary btn-block" style={{ textDecoration: 'none' }}>
                  Download
                </a>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
