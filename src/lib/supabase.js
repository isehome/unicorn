<<<<<<< HEAD
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
=======
// lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})

// Authentication helper functions
export const signInWithMicrosoft = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'email profile openid',
      redirectTo: `${window.location.origin}/auth/callback`
    }
  })
  
  if (error) {
    console.error('Error signing in with Microsoft:', error)
    throw error
  }
  
  return data
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('Error signing out:', error)
    throw error
  }
}

export const getCurrentUser = () => {
  return supabase.auth.getUser()
}

export const getSession = () => {
  return supabase.auth.getSession()
}

// Database helper functions
export const insertData = async (table, data) => {
  const { data: result, error } = await supabase
    .from(table)
    .insert(data)
    .select()
  
  if (error) {
    console.error(`Error inserting data into ${table}:`, error)
    throw error
  }
  
  return result
}

export const fetchData = async (table, filters = {}) => {
  let query = supabase.from(table).select('*')
  
  // Apply filters if provided
  Object.entries(filters).forEach(([key, value]) => {
    query = query.eq(key, value)
  })
  
  const { data, error } = await query
  
  if (error) {
    console.error(`Error fetching data from ${table}:`, error)
    throw error
  }
  
  return data
}

export const updateData = async (table, id, updates) => {
  const { data, error } = await supabase
    .from(table)
    .update(updates)
    .eq('id', id)
    .select()
  
  if (error) {
    console.error(`Error updating data in ${table}:`, error)
    throw error
  }
  
  return data
}

export const deleteData = async (table, id) => {
  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq('id', id)
  
  if (error) {
    console.error(`Error deleting data from ${table}:`, error)
    throw error
  }
  
  return data
}
>>>>>>> origin/main
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

// --- Optional auth helpers kept for compatibility with existing code ---
export const signInWithMicrosoft = async () => {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'email profile openid',
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
