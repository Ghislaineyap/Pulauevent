import { supabase } from './supabaseClient'

const BUCKET = 'avatars'
const MAX_DIMENSION = 640
const JPEG_QUALITY = 0.8

// Resize/compress in the browser before upload — a phone photo straight out
// of a camera can be 4000px and several MB, which is overkill for a 52px
// circular avatar and just slows everyone's page down. Long edge capped at
// 640px, re-encoded as JPEG, good enough to still look sharp at real size.
async function compressImage(file) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not process that image.'))), 'image/jpeg', JPEG_QUALITY)
  })
}

// Uploads to "{userId}/photo.jpg" in the public "avatars" bucket — storage
// RLS policies (see schema.sql) only let a user write inside their own
// folder. Returns a cache-busted public URL so a replaced photo shows
// immediately instead of the browser serving the old cached image.
export async function uploadProfilePhoto(userId, file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.')
  }
  const blob = await compressImage(file)
  const path = `${userId}/photo.jpg`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: '3600',
  })
  if (uploadError) throw uploadError
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return `${data.publicUrl}?t=${Date.now()}`
}
