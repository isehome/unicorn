/**
 * Home Assistant Client Cache Service
 * Handles caching UniFi client data from Home Assistant into the project_ha_clients table.
 * Provides functions for syncing, querying, and managing cached client data.
 */

import { supabase } from '../lib/supabase';

const handleError = (error, defaultMessage) => {
  console.error(defaultMessage, error);
  throw new Error(error?.message || defaultMessage);
};

/**
 * Get all cached HA clients for a project
 * @param {string} projectId - The project ID
 * @returns {Promise<Array>} Array of cached client records
 */
export const getProjectHAClients = async (projectId) => {
  try {
    if (!supabase || !projectId) return [];

    const { data, error } = await supabase
      .from('project_ha_clients')
      .select('*')
      .eq('project_id', projectId)
      .order('hostname', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Failed to fetch project HA clients:', error);
    return [];
  }
};

/**
 * Get a single cached HA client by MAC address
 * @param {string} projectId - The project ID
 * @param {string} mac - The client MAC address
 * @returns {Promise<Object|null>} The client record or null if not found
 */
export const getHAClient = async (projectId, mac) => {
  try {
    if (!supabase || !projectId || !mac) return null;

    const { data, error } = await supabase
      .from('project_ha_clients')
      .select('*')
      .eq('project_id', projectId)
      .eq('mac', mac)
      .single();

    if (error) {
      // PGRST116 means no rows found, which is not an error for this use case
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return data;
  } catch (error) {
    console.error('Failed to fetch HA client:', error);
    return null;
  }
};

/**
 * Sync (upsert) an array of clients from Home Assistant
 * This is the main sync function that updates the cache with fresh client data.
 * @param {string} projectId - The project ID
 * @param {Array} clients - Array of client objects from HA with properties:
 *   - mac (required): MAC address, primary identifier
 *   - hostname: Client hostname
 *   - ip: IP address
 *   - is_wired: Boolean indicating wired vs wireless
 *   - switch_name, switch_port, switch_mac: For wired clients
 *   - ssid, signal, ap_name, ap_mac: For wireless clients
 *   - uptime_seconds: Client uptime in seconds
 * @returns {Promise<Object>} Result with synced count and any errors
 */
export const syncHAClients = async (projectId, clients) => {
  try {
    if (!supabase) throw new Error('Supabase not configured');
    if (!projectId) throw new Error('projectId is required');
    if (!Array.isArray(clients)) throw new Error('clients must be an array');

    if (clients.length === 0) {
      return { synced: 0, errors: [] };
    }

    const now = new Date().toISOString();
    const errors = [];
    let syncedCount = 0;

    // Prepare records for upsert
    const records = clients
      .filter(client => {
        if (!client.mac) {
          errors.push({ client, error: 'Missing MAC address' });
          return false;
        }
        return true;
      })
      .map(client => ({
        project_id: projectId,
        mac: client.mac.toLowerCase(), // Normalize MAC to lowercase
        hostname: client.hostname || null,
        ip: client.ip || null,
        is_wired: Boolean(client.is_wired),
        switch_name: client.switch_name || null,
        switch_port: client.switch_port || null,
        switch_mac: client.switch_mac ? client.switch_mac.toLowerCase() : null,
        ssid: client.ssid || null,
        signal: client.signal || null,
        ap_name: client.ap_name || null,
        ap_mac: client.ap_mac ? client.ap_mac.toLowerCase() : null,
        is_online: true, // If we're syncing it, it's online
        last_seen_at: now,
        uptime_seconds: client.uptime_seconds || null,
        cached_at: now
      }));

    if (records.length > 0) {
      // Upsert in batches to avoid payload size limits
      const BATCH_SIZE = 100;
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);

        const { data, error } = await supabase
          .from('project_ha_clients')
          .upsert(batch, {
            onConflict: 'project_id,mac',
            ignoreDuplicates: false
          })
          .select();

        if (error) {
          console.error(`Failed to sync batch ${i / BATCH_SIZE + 1}:`, error);
          errors.push({ batch: i / BATCH_SIZE + 1, error: error.message });
        } else {
          syncedCount += (data?.length || batch.length);
        }
      }
    }

    console.log(`HA Client sync completed: ${syncedCount} clients synced for project ${projectId}`);

    return {
      synced: syncedCount,
      errors,
      total: clients.length
    };
  } catch (error) {
    handleError(error, 'Failed to sync HA clients');
  }
};

/**
 * Get clients that are not linked to any equipment
 * Useful for showing "orphan" clients that may need to be assigned
 * @param {string} projectId - The project ID
 * @returns {Promise<Array>} Array of unlinked client records
 */
export const getUnlinkedClients = async (projectId) => {
  try {
    if (!supabase || !projectId) return [];

    // Get all clients for the project
    const { data: clients, error: clientsError } = await supabase
      .from('project_ha_clients')
      .select('*')
      .eq('project_id', projectId);

    if (clientsError) throw clientsError;
    if (!clients || clients.length === 0) return [];

    // Get all equipment MACs for the project
    const { data: equipment, error: equipmentError } = await supabase
      .from('project_equipment')
      .select('mac_address')
      .eq('project_id', projectId)
      .not('mac_address', 'is', null);

    if (equipmentError) throw equipmentError;

    // Create a set of linked MACs (normalized to lowercase)
    const linkedMacs = new Set(
      (equipment || [])
        .map(e => e.mac_address?.toLowerCase())
        .filter(Boolean)
    );

    // Filter clients that don't have a matching equipment MAC
    const unlinked = clients.filter(client =>
      !linkedMacs.has(client.mac?.toLowerCase())
    );

    return unlinked;
  } catch (error) {
    console.error('Failed to fetch unlinked clients:', error);
    return [];
  }
};

/**
 * Get network status for a specific equipment item using the DB function
 * @param {string} equipmentId - The equipment ID
 * @returns {Promise<Object|null>} Network status data or null
 */
export const getEquipmentNetworkStatus = async (equipmentId) => {
  try {
    if (!supabase || !equipmentId) return null;

    const { data, error } = await supabase
      .rpc('get_equipment_network_status', {
        p_equipment_id: equipmentId
      });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Failed to get equipment network status:', error);
    return null;
  }
};

/**
 * Get all clients connected to a specific switch using the DB function
 * @param {string} projectId - The project ID
 * @param {string} switchMac - The switch MAC address
 * @returns {Promise<Array>} Array of connected client records
 */
export const getSwitchConnectedClients = async (projectId, switchMac) => {
  try {
    if (!supabase || !projectId || !switchMac) return [];

    const { data, error } = await supabase
      .rpc('get_switch_connected_clients', {
        p_project_id: projectId,
        p_switch_mac: switchMac.toLowerCase()
      });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Failed to get switch connected clients:', error);
    return [];
  }
};

/**
 * Delete clients that haven't been seen recently (stale data cleanup)
 * @param {string} projectId - The project ID
 * @param {number} maxAgeMinutes - Maximum age in minutes (default 30)
 * @returns {Promise<number>} Number of deleted records
 */
export const deleteStaleClients = async (projectId, maxAgeMinutes = 30) => {
  try {
    if (!supabase || !projectId) return 0;

    // Calculate the cutoff time
    const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('project_ha_clients')
      .delete()
      .eq('project_id', projectId)
      .lt('last_seen_at', cutoffTime)
      .select('id');

    if (error) throw error;

    const deletedCount = data?.length || 0;
    if (deletedCount > 0) {
      console.log(`Deleted ${deletedCount} stale HA clients for project ${projectId}`);
    }

    return deletedCount;
  } catch (error) {
    console.error('Failed to delete stale clients:', error);
    return 0;
  }
};

/**
 * Search clients by hostname or IP address
 * @param {string} projectId - The project ID
 * @param {string} searchTerm - The search term (searches hostname and IP)
 * @returns {Promise<Array>} Array of matching client records
 */
export const searchClients = async (projectId, searchTerm) => {
  try {
    if (!supabase || !projectId) return [];
    if (!searchTerm || searchTerm.trim() === '') {
      return getProjectHAClients(projectId);
    }

    const term = searchTerm.trim().toLowerCase();

    const { data, error } = await supabase
      .from('project_ha_clients')
      .select('*')
      .eq('project_id', projectId)
      .or(`hostname.ilike.%${term}%,ip.ilike.%${term}%`)
      .order('hostname', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Failed to search clients:', error);
    return [];
  }
};

/**
 * Mark clients as offline that haven't been seen in the latest sync
 * @param {string} projectId - The project ID
 * @param {Array<string>} onlineMacs - Array of MAC addresses that are currently online
 * @returns {Promise<number>} Number of clients marked offline
 */
export const markOfflineClients = async (projectId, onlineMacs) => {
  try {
    if (!supabase || !projectId) return 0;

    // Normalize MACs to lowercase
    const normalizedMacs = (onlineMacs || []).map(mac => mac.toLowerCase());

    // Get all clients for the project
    const { data: allClients, error: fetchError } = await supabase
      .from('project_ha_clients')
      .select('id, mac')
      .eq('project_id', projectId)
      .eq('is_online', true);

    if (fetchError) throw fetchError;
    if (!allClients || allClients.length === 0) return 0;

    // Find clients that are no longer in the online list
    const offlineClients = allClients.filter(
      client => !normalizedMacs.includes(client.mac?.toLowerCase())
    );

    if (offlineClients.length === 0) return 0;

    const offlineIds = offlineClients.map(c => c.id);

    const { error: updateError } = await supabase
      .from('project_ha_clients')
      .update({ is_online: false })
      .in('id', offlineIds);

    if (updateError) throw updateError;

    console.log(`Marked ${offlineClients.length} clients as offline for project ${projectId}`);
    return offlineClients.length;
  } catch (error) {
    console.error('Failed to mark offline clients:', error);
    return 0;
  }
};

// Export all functions as a service object for convenient access
export const haClientService = {
  getProjectHAClients,
  getHAClient,
  syncHAClients,
  getUnlinkedClients,
  getEquipmentNetworkStatus,
  getSwitchConnectedClients,
  deleteStaleClients,
  searchClients,
  markOfflineClients
};

export default haClientService;
