// Unified Supabase client + helpers (auth + storage)
import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null

// PUBLIC STORAGE (optional fallback when not using OneDrive)
export const PHOTOS_BUCKET = process.env.REACT_APP_SUPABASE_BUCKET || 'photos'

// Upload an image file to Storage and return a public URL
export async function uploadPublicImage(file, path) {
  if (!supabase) throw new Error('Supabase not configured')
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase()
  const key = `${path}.${ext}`
  const { error } = await supabase.storage.from(PHOTOS_BUCKET).upload(key, file, { contentType: file.type, upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(key)
  return data.publicUrl
}

// Build low-res thumbnail URL using Supabase image renderer (if enabled)
export function toThumb(url, { width = 320, height = 160, quality = 70 } = {}) {
  if (!url || !supabaseUrl) return url
  try {
    const marker = '/storage/v1/object/public/'
    const idx = url.indexOf(marker)
    if (idx === -1) return url
    const objectPath = url.slice(idx + marker.length)
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

// --- Optional auth helpers kept for compatibility ---
export const signInWithMicrosoft = async () => {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      // Include Microsoft Calendar + Contacts scopes for integrations
      scopes: 'openid profile email offline_access Calendars.Read Contacts.Read',
      redirectTo: `${window.location.origin}/auth/callback`
    }
  })
  if (error) throw error
  return data
}

export const signOut = async () => {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export const getCurrentUser = () => supabase ? supabase.auth.getUser() : null
export const getSession = () => supabase ? supabase.auth.getSession() : null

// DB helpers used by Dashboard
export const insertData = async (table, data) => {
  const { data: result, error } = await supabase.from(table).insert(data).select()
  if (error) throw error
  return result
}

export const fetchData = async (table, filters = {}) => {
  let query = supabase.from(table).select('*')
  Object.entries(filters).forEach(([k, v]) => { query = query.eq(k, v) })
  const { data, error } = await query
  if (error) throw error
  return data
}

export const updateData = async (table, id, updates) => {
  const { data, error } = await supabase.from(table).update(updates).eq('id', id).select()
  if (error) throw error
  return data
}

export const deleteData = async (table, id) => {
  const { data, error } = await supabase.from(table).delete().eq('id', id)
  if (error) throw error
  return data
}
