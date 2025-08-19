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