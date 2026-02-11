// Unified Supabase client + helpers (auth + storage)
import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

// Debug logging for Supabase initialization
console.log('[Supabase] Initializing...', {
  hasUrl: !!supabaseUrl,
  urlPrefix: supabaseUrl?.substring(0, 30),
  hasKey: !!supabaseAnonKey,
  keyLength: supabaseAnonKey?.length
})

// Only create client if we have valid URL and key (not placeholder values)
const isValidUrl = supabaseUrl && supabaseUrl.startsWith('http') && !supabaseUrl.includes('your_supabase_project_url_here')
const isValidKey = supabaseAnonKey && supabaseAnonKey !== 'your_supabase_anon_key_here'

console.log('[Supabase] Validation:', { isValidUrl, isValidKey })

// Connection retry configuration
const connectionRetryConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  shouldRetry: (error) => {
    // Retry on network errors or specific Supabase errors
    return error?.message?.includes('Failed to fetch') || 
           error?.message?.includes('Network') ||
           error?.code === 'PGRST301'
  }
}

const createSupabaseClient = () => {
  if (!isValidUrl || !isValidKey) {
    console.log('[Supabase] Client NOT created - invalid config')
    return null
  }

  console.log('[Supabase] Creating client...')
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: 'pkce',
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      storageKey: 'supabase.auth.token',
      storage: window.localStorage
    },
    global: {
      headers: { 'x-client-info': 'unicorn-app' },
    },
    db: {
      schema: 'public'
    },
    realtime: {
      params: {
        eventsPerSecond: 10
      }
    }
  })
  console.log('[Supabase] Client created successfully')
  return client
}

export const supabase = createSupabaseClient()

// Test function to check Supabase connectivity
export const testSupabaseConnection = async () => {
  if (!supabase) {
    console.log('[Supabase] Test: No client available')
    return { success: false, error: 'No client' }
  }

  const testUrl = `${supabaseUrl}/rest/v1/`
  console.log('[Supabase] Test: Starting connectivity test to:', testUrl)
  const startTime = Date.now()

  try {
    // Simple health check - just try to make any request
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      console.log('[Supabase] Test: Aborting after 5s...')
      controller.abort()
    }, 5000)

    console.log('[Supabase] Test: Sending fetch request...')
    // Use native fetch to test if we can reach Supabase at all
    const response = await fetch(testUrl, {
      method: 'HEAD',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      },
      signal: controller.signal
    })

    clearTimeout(timeoutId)
    const elapsed = Date.now() - startTime
    console.log('[Supabase] Test: Response received in', elapsed, 'ms, status:', response.status, response.statusText)

    return { success: true, elapsed, status: response.status }
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.log('[Supabase] Test: FAILED after', elapsed, 'ms')
    console.log('[Supabase] Test: Error name:', error.name)
    console.log('[Supabase] Test: Error message:', error.message)
    console.log('[Supabase] Test: Error stack:', error.stack)
    return { success: false, elapsed, error: error.message, errorName: error.name }
  }
}

// Alternative test using a simpler approach
export const testSupabaseQuery = async () => {
  if (!supabase) {
    console.log('[Supabase] QueryTest: No client')
    return { success: false, error: 'No client' }
  }

  console.log('[Supabase] QueryTest: Starting simple query...')
  const startTime = Date.now()

  try {
    // Set up a race between the query and a timeout
    const queryPromise = supabase.from('projects').select('id').limit(1)

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Query timeout after 5s')), 5000)
    )

    const { data, error } = await Promise.race([queryPromise, timeoutPromise])

    const elapsed = Date.now() - startTime
    if (error) {
      console.log('[Supabase] QueryTest: Query error after', elapsed, 'ms:', error)
      return { success: false, elapsed, error: error.message }
    }

    console.log('[Supabase] QueryTest: Success in', elapsed, 'ms, got', data?.length || 0, 'rows')
    return { success: true, elapsed, rowCount: data?.length || 0 }
  } catch (error) {
    const elapsed = Date.now() - startTime
    console.log('[Supabase] QueryTest: FAILED after', elapsed, 'ms:', error.message)
    return { success: false, elapsed, error: error.message }
  }
}

// Retry wrapper for database operations
async function withRetry(operation, config = connectionRetryConfig) {
  let lastError = null
  
  for (let i = 0; i < config.maxRetries; i++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      
      if (i < config.maxRetries - 1 && config.shouldRetry(error)) {
        await new Promise(resolve => setTimeout(resolve, config.retryDelay * Math.pow(2, i)))
      } else {
        throw error
      }
    }
  }
  
  throw lastError
}

// PUBLIC STORAGE (optional fallback when not using OneDrive)
export const PHOTOS_BUCKET = 'photos'

// Upload an image file to Storage and return a public URL
export async function uploadPublicImage(file, path) {
  if (!supabase) throw new Error('Supabase not configured')
  
  return withRetry(async () => {
    const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase()
    const key = `${path}.${ext}`
    const { error } = await supabase.storage.from(PHOTOS_BUCKET).upload(key, file, { 
      contentType: file.type, 
      upsert: true,
      cacheControl: '3600'
    })
    if (error) throw error
    const { data } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(key)
    return data.publicUrl
  })
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

// --- Supabase session from custom JWT (MSAL → Supabase bridge) ---

/**
 * Exchange an MSAL access token for a Supabase JWT via /api/auth/supabase-token,
 * then set it as the active Supabase session so that auth.uid() works in RLS.
 *
 * Returns the access_token string on success, or null on failure.
 */
export async function setSupabaseSessionFromMSAL(msalAccessToken) {
  if (!supabase || !msalAccessToken) return null

  try {
    const res = await fetch('/api/auth/supabase-token', {
      method: 'POST',
      headers: { Authorization: `Bearer ${msalAccessToken}` },
    })

    if (!res.ok) {
      console.warn('[Supabase] Token exchange failed:', res.status)
      return null
    }

    const { access_token } = await res.json()

    // setSession accepts { access_token, refresh_token }.
    // We pass the same token as refresh_token because we handle
    // refresh ourselves via MSAL; Supabase will never use it.
    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token: access_token,
    })

    if (error) {
      console.warn('[Supabase] setSession error:', error.message)
      return null
    }

    console.log('[Supabase] Session set — auth.uid() now resolves to Azure OID')
    return access_token
  } catch (err) {
    console.warn('[Supabase] Token exchange error:', err.message)
    return null
  }
}

// --- Auth helpers ---
// Note: These are primarily for backward compatibility
// New code should use AuthContext directly

export const signInWithMicrosoft = async () => {
  if (!supabase) throw new Error('Supabase not configured')
  
  // OAuth flow - will redirect the browser
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'openid profile email offline_access Calendars.Read Contacts.Read',
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: {
        prompt: 'select_account'
      },
      skipBrowserRedirect: false
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

export const getCurrentUser = () => {
  if (!supabase) return Promise.resolve({ data: { user: null }, error: null })
  return supabase.auth.getUser()
}

export const getSession = () => {
  if (!supabase) return Promise.resolve({ data: { session: null }, error: null })
  return supabase.auth.getSession()
}

// DB helpers with retry logic
export const insertData = async (table, data) => {
  return withRetry(async () => {
    const { data: result, error } = await supabase.from(table).insert(data).select()
    if (error) throw error
    return result
  })
}

export const fetchData = async (table, filters = {}) => {
  return withRetry(async () => {
    let query = supabase.from(table).select('*')
    Object.entries(filters).forEach(([k, v]) => { query = query.eq(k, v) })
    const { data, error } = await query
    if (error) throw error
    return data
  })
}

export const updateData = async (table, id, updates) => {
  return withRetry(async () => {
    const { data, error } = await supabase.from(table).update(updates).eq('id', id).select()
    if (error) throw error
    return data
  })
}

export const deleteData = async (table, id) => {
  return withRetry(async () => {
    const { data, error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
    return data
  })
}

// ===== STAKEHOLDER SLOTS with retry =====
export const getStakeholderSlots = async () => {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('stakeholder_slots')
      .select('*')
      .order('slot_type', { ascending: true })
      .order('slot_name', { ascending: true })
    if (error) throw error
    return data
  })
}

export const createStakeholderSlot = async (slotData) => {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('stakeholder_slots')
      .insert(slotData)
      .select()
      .single()
    if (error) throw error
    return data
  })
}

// ===== PROJECT ASSIGNMENTS with retry =====
export const getProjectTeam = async (projectId) => {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('project_assignments')
      .select(`
        *,
        contact:contacts(*),
        stakeholder_slot:stakeholder_slots(*)
      `)
      .eq('project_id', projectId)
      .eq('assignment_status', 'active')
      .order('is_primary', { ascending: false })
    if (error) throw error
    return data
  })
}

export const assignContactToProject = async (assignmentData) => {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('project_assignments')
      .insert(assignmentData)
      .select(`
        *,
        contact:contacts(*),
        stakeholder_slot:stakeholder_slots(*)
      `)
      .single()
    if (error) throw error
    return data
  })
}

export const removeProjectAssignment = async (assignmentId) => {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('project_assignments')
      .delete()
      .eq('id', assignmentId)
    if (error) throw error
    return data
  })
}

// ===== ISSUE ASSIGNMENTS with retry =====
export const getIssueAssignments = async (issueId) => {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('issue_assignments')
      .select(`
        *,
        contact:contacts(*)
      `)
      .eq('issue_id', issueId)
    if (error) throw error
    return data
  })
}

export const assignContactToIssue = async (issueId, contactId, assignmentType = 'watcher') => {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('issue_assignments')
      .insert({ issue_id: issueId, contact_id: contactId, assignment_type: assignmentType })
      .select(`
        *,
        contact:contacts(*)
      `)
      .single()
    if (error) throw error
    return data
  })
}

// ===== ENHANCED CONTACT QUERIES with retry =====
export const getContactsWithProjects = async () => {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select(`
        *,
        project_assignments(
          project_id,
          stakeholder_slot:stakeholder_slots(slot_name, slot_type),
          is_primary,
          assignment_status
        )
      `)
      .eq('is_active', true)
      .order('first_name')
    if (error) throw error
    return data
  })
}

export const getAvailableContactsForProject = async (projectId) => {
  return withRetry(async () => {
    // Get contacts not already assigned to this project
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('is_active', true)
      .not('id', 'in', `(
        SELECT contact_id FROM project_assignments 
        WHERE project_id = '${projectId}' AND assignment_status = 'active'
      )`)
      .order('first_name')
    if (error) throw error
    return data
  })
}
