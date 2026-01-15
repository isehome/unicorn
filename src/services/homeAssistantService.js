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
    const response = await fetch(`/api/ha/status?project_id=${projectId}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    return response.json();
  },

  /**
   * Get entities from HA
   */
  async getEntities(projectId, options = {}) {
    const params = new URLSearchParams({ project_id: projectId });
    if (options.domain) params.append('domain', options.domain);
    if (options.category) params.append('category', options.category);

    const response = await fetch(`/api/ha/entities?${params}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    return response.json();
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
