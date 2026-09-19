import { supabase } from './supabaseClient'

const BUCKET = 'vendor-portfolio'
const MAX_DIMENSION = 1200 // portfolio images are viewed larger than a 52px avatar, so a more generous cap than uploadPhoto.js's
const JPEG_QUALITY = 0.82

export const MAX_PORTFOLIO_IMAGES = 8

// Same resize/compress approach as src/lib/uploadPhoto.js (freelancer/
// organizer/vendor logo) — kept as its own small copy rather than a shared
// import since the two only really share this one helper and the constants
// genuinely differ (portfolio images need more resolution than an avatar).
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

// Uploads to "{userId}/portfolio-{slot}.jpg" in the public "vendor-portfolio"
// bucket — storage RLS only lets a vendor write inside their own folder.
// Cache-busted public URL, same reasoning as uploadProfilePhoto.
export async function uploadPortfolioImage(userId, file, slot) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.')
  }
  const blob = await compressImage(file)
  const path = `${userId}/portfolio-${slot}.jpg`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: '3600',
  })
  if (uploadError) throw uploadError
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return `${data.publicUrl}?t=${Date.now()}`
}
