/**
 * Home Assistant Service
 * Handles all HA-related database operations and API calls
 */
import { supabase } from '../lib/supabase';

const homeAssistantService = {
  /**
   * Get HA config for a project (decrypted)
   */
  async getForProject(projectId) {
    const { data, error } = await supabase
      .from('project_home_assistant_decrypted')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data;
  },

  /**
   * Create or update HA config for a project
   */
  async upsert(projectId, config, userId = null) {
    const { data, error } = await supabase.rpc('create_project_home_assistant', {
      p_project_id: projectId,
      p_ha_url: config.ha_url,
      p_access_token: config.access_token,
      p_instance_name: config.instance_name || null,
      p_nabu_casa_enabled: config.nabu_casa_enabled ?? true,
      p_created_by: userId
    });

    if (error) throw error;
    return data;
  },

  /**
   * Update connection status (called by API after connection test)
   */
  async updateStatus(projectId, { lastConnected, lastError, deviceCount }) {
    const { data, error } = await supabase.rpc('update_project_home_assistant', {
      p_project_id: projectId,
      p_last_connected_at: lastConnected || null,
      p_last_error: lastError,
      p_device_count: deviceCount || null
    });

    if (error) throw error;
    return data;
  },

  /**
   * Delete HA config for a project
   */
  async delete(projectId) {
    const { error } = await supabase
      .from('project_home_assistant')
      .delete()
      .eq('project_id', projectId);

    if (error) throw error;
    return true;
  },

  /**
   * Test connection to HA instance
   * Calls the backend API which handles the actual HA communication
   */
  async testConnection(projectId) {
    const apiUrl = `/api/ha/status?project_id=${projectId}`;
    console.log('[HA Service] Testing connection via:', apiUrl);

    const response = await fetch(apiUrl);

    // Get the response text first
    const responseText = await response.text();

    // Check if it looks like HTML (common when API route not found or server error)
    if (responseText.startsWith('<!DOCTYPE') || responseText.startsWith('<html')) {
      console.error('[HA Service] API returned HTML instead of JSON:', responseText.substring(0, 500));

      // Check if it's a 404 page
      if (response.status === 404 || responseText.includes('404') || responseText.includes('Not Found')) {
        throw new Error('API endpoint not found (404). Are you running locally? Use "vercel dev" or use the "Direct Test (Local)" button instead.');
      }

      throw new Error('API returned HTML instead of JSON. If running locally, use "Direct Test (Local)" button, or run "vercel dev".');
    }

    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[HA Service] Failed to parse JSON:', responseText.substring(0, 200));
      throw new Error(`Invalid JSON response: ${responseText.substring(0, 100)}`);
    }

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  },

  /**
   * Get entities from HA
   */
  async getEntities(projectId, options = {}) {
    const params = new URLSearchParams({ project_id: projectId });
    if (options.domain) params.append('domain', options.domain);
    if (options.category) params.append('category', options.category);

    const response = await fetch(`/api/ha/entities?${params}`);

    // Get the response text first
    const responseText = await response.text();

    // Check if it looks like HTML
    if (responseText.startsWith('<!DOCTYPE') || responseText.startsWith('<html')) {
      console.error('[HA Service] API returned HTML instead of JSON:', responseText.substring(0, 200));
      throw new Error('API endpoint returned HTML instead of JSON. The API route may not be deployed correctly.');
    }

    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[HA Service] Failed to parse JSON:', responseText.substring(0, 200));
      throw new Error(`Invalid JSON response: ${responseText.substring(0, 100)}`);
    }

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  },

  /**
   * Execute a command on an HA entity
   */
  async executeCommand(projectId, domain, service, entityId, data = {}) {
    const response = await fetch('/api/ha/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        domain,
        service,
        entity_id: entityId,
        data
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    return response.json();
  }
};

export default homeAssistantService;
