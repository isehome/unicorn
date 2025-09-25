// Unified Supabase client + helpers (auth + storage)
import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

// Only create client if we have valid URL and key (not placeholder values)
const isValidUrl = supabaseUrl && supabaseUrl.startsWith('http') && !supabaseUrl.includes('your_supabase_project_url_here')
const isValidKey = supabaseAnonKey && supabaseAnonKey !== 'your_supabase_anon_key_here'

export const supabase = (isValidUrl && isValidKey)
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

// ===== STAKEHOLDER SLOTS =====
export const getStakeholderSlots = async () => {
  const { data, error } = await supabase
    .from('stakeholder_slots')
    .select('*')
    .order('slot_type', { ascending: true })
    .order('slot_name', { ascending: true });
  if (error) throw error;
  return data;
};

export const createStakeholderSlot = async (slotData) => {
  const { data, error } = await supabase
    .from('stakeholder_slots')
    .insert(slotData)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ===== PROJECT ASSIGNMENTS =====
export const getProjectTeam = async (projectId) => {
  const { data, error } = await supabase
    .from('project_assignments')
    .select(`
      *,
      contact:contacts(*),
      stakeholder_slot:stakeholder_slots(*)
    `)
    .eq('project_id', projectId)
    .eq('assignment_status', 'active')
    .order('is_primary', { ascending: false });
  if (error) throw error;
  return data;
};

export const assignContactToProject = async (assignmentData) => {
  const { data, error } = await supabase
    .from('project_assignments')
    .insert(assignmentData)
    .select(`
      *,
      contact:contacts(*),
      stakeholder_slot:stakeholder_slots(*)
    `)
    .single();
  if (error) throw error;
  return data;
};

export const removeProjectAssignment = async (assignmentId) => {
  const { data, error } = await supabase
    .from('project_assignments')
    .delete()
    .eq('id', assignmentId);
  if (error) throw error;
  return data;
};

// ===== ISSUE ASSIGNMENTS =====
export const getIssueAssignments = async (issueId) => {
  const { data, error } = await supabase
    .from('issue_assignments')
    .select(`
      *,
      contact:contacts(*)
    `)
    .eq('issue_id', issueId);
  if (error) throw error;
  return data;
};

export const assignContactToIssue = async (issueId, contactId, assignmentType = 'watcher') => {
  const { data, error } = await supabase
    .from('issue_assignments')
    .insert({ issue_id: issueId, contact_id: contactId, assignment_type: assignmentType })
    .select(`
      *,
      contact:contacts(*)
    `)
    .single();
  if (error) throw error;
  return data;
};

// ===== ENHANCED CONTACT QUERIES =====
export const getContactsWithProjects = async () => {
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
    .order('first_name');
  if (error) throw error;
  return data;
};

export const getAvailableContactsForProject = async (projectId) => {
  // Get contacts not already assigned to this project
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('is_active', true)
    .not('id', 'in', `(
      SELECT contact_id FROM project_assignments 
      WHERE project_id = '${projectId}' AND assignment_status = 'active'
    )`)
    .order('first_name');
  if (error) throw error;
  return data;
};
