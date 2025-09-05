// Minimal Supabase client for local testing
import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Public bucket name to store images. Create this in Supabase Dashboard → Storage.
export const PHOTOS_BUCKET = process.env.REACT_APP_SUPABASE_BUCKET || 'photos'

// Upload an image file to Storage and return a public URL
export async function uploadPublicImage(file, path) {
  if (!supabase) throw new Error('Supabase not configured')
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase()
  const key = `${path}.${ext}`
  const { error } = await supabase
    .storage
    .from(PHOTOS_BUCKET)
    .upload(key, file, { contentType: file.type, upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(key)
  return data.publicUrl
}

// Build low-res thumbnail URL using Supabase image renderer (if enabled)
export function toThumb(url, { width = 320, height = 160, quality = 70 } = {}) {
  if (!url || !supabaseUrl) return url
  try {
    // Expecting a public URL like: {supabaseUrl}/storage/v1/object/public/{bucket}/{path}
    const marker = '/storage/v1/object/public/'
    const idx = url.indexOf(marker)
    if (idx === -1) return url
    const objectPath = url.slice(idx + marker.length)
    // Ask renderer to fit inside width/height without cropping
    return `${supabaseUrl}/storage/v1/render/image/public/${objectPath}?width=${width}&height=${height}&quality=${quality}&resize=contain`
  } catch {
    return url
  }
}

// Safe path segment for Storage keys
export function slugifySegment(input, max = 60) {
  const base = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  const trimmed = base.slice(0, max)
  return trimmed || 'item'
}
