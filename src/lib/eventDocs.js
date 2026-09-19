import { supabase } from './supabaseClient'

const BUCKET = 'event-docs'
export const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB — generous for a contract/floor-plan PDF or a few photos, small enough to not stall on a phone connection

// Mime types the DocumentsView modal can render inline — anything else still
// uploads and downloads fine, it just gets a "download to view" card instead
// of a live preview. PDF + images cover the large majority of what actually
// gets shared on an event (contracts, floor plans, a run-of-show exported as
// a PDF, venue photos).
export function canPreviewInline(mimeType) {
  return mimeType === 'application/pdf' || (mimeType || '').startsWith('image/')
}

function randomToken() {
  const bytes = new Uint8Array(9)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// Strips the file down to a storage-safe name — keeps the extension (needed
// for mime sniffing on download) but replaces anything that isn't a plain
// ASCII word character, dot, or dash, so an emoji-laden or non-Latin
// filename never breaks the storage path.
function sanitizeFilename(name) {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  const safeBase = base.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60) || 'file'
  const safeExt = ext.replace(/[^A-Za-z0-9.]+/g, '').slice(0, 10)
  return `${safeBase}${safeExt}`
}

export async function listEventDocuments(jobId) {
  const { data, error } = await supabase
    .from('event_documents')
    .select('id, job_id, storage_path, file_name, mime_type, file_size, uploaded_by, created_at')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function uploadEventDocument(jobId, userId, file) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('That file is over the 10MB limit — try a smaller or compressed version.')
  }
  const path = `${jobId}/${randomToken()}-${sanitizeFilename(file.name)}`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    cacheControl: '3600',
  })
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('event_documents')
    .insert({
      job_id: jobId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size,
      uploaded_by: userId,
    })
    .select()
    .single()
  if (error) {
    // Row insert failed after the file made it to storage — clean up the
    // orphaned object rather than leaving unreferenced storage around.
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }
  return data
}

export async function deleteEventDocument(doc) {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([doc.storage_path])
  if (storageError) console.error(storageError)
  const { error } = await supabase.from('event_documents').delete().eq('id', doc.id)
  if (error) throw error
}

// Bucket is private, so every view/download goes through a short-lived
// signed URL — Supabase only issues one if the requester's storage RLS
// policy (see migration_event_documents.sql) actually grants them select.
export async function getSignedDocUrl(storagePath, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresInSeconds)
  if (error) throw error
  return data.signedUrl
}

export function formatFileSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function fileKindIcon(mimeType) {
  if (!mimeType) return '📄'
  if (mimeType === 'application/pdf') return '📕'
  if (mimeType.startsWith('image/')) return '🖼️'
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return '📊'
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📽️'
  if (mimeType.includes('word') || mimeType.includes('document')) return '📃'
  return '📄'
}
