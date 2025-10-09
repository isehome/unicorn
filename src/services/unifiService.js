/**
 * UniFi Service - Manages UniFi data in Supabase
 */

import { supabase } from '../lib/supabase';
import * as unifiApi from './unifiApi';

/**
 * Sync UniFi sites to database
 * @param {string} projectId - Project ID
 * @returns {Promise<Array>} Synced sites
 */
export const syncSites = async (projectId) => {
  try {
    const apiSites = await unifiApi.fetchSites();
    const syncedSites = [];

    for (const site of apiSites.data || []) {
      const { data, error } = await supabase
        .from('unifi_sites')
        .upsert({
          project_id: projectId,
          site_id: site.id,
          site_name: site.name || site.description,
          site_desc: site.description,
          controller_url: site.url || process.env.REACT_APP_UNIFI_CONTROLLER_URL,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'project_id,site_id'
        })
        .select()
        .single();

      if (!error) syncedSites.push(data);
    }

    return syncedSites;
  } catch (error) {
    console.error('Error syncing UniFi sites:', error);
    throw error;
  }
};

/**
 * Sync UniFi switches to database
 * @param {string} projectId - Project ID
 * @param {string} siteId - UniFi site ID
 * @returns {Promise<Array>} Synced switches
 */
export const syncSwitches = async (projectId, siteId) => {
  try {
    const devices = await unifiApi.fetchDevices(siteId);
    const switches = (devices.data || []).filter(d => d.type === 'usw' || d.model?.includes('Switch'));
    
    const syncedSwitches = [];

    for (const device of switches) {
      // Get the unifi_site record
      const { data: siteRecord } = await supabase
        .from('unifi_sites')
        .select('id')
        .eq('project_id', projectId)
        .eq('site_id', siteId)
        .single();

      if (!siteRecord) continue;

      const { data, error } = await supabase
        .from('unifi_switches')
        .upsert({
          project_id: projectId,
          unifi_site_id: siteRecord.id,
          device_id: device.mac,
          device_name: device.name || device.model,
          device_model: device.model,
          ip_address: device.ip,
          total_ports: device.num_port || device.port_table?.length || 0,
          last_seen: device.last_seen ? new Date(device.last_seen * 1000).toISOString() : null,
          is_active: device.state === 1,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'device_id'
        })
        .select()
        .single();

      if (!error) {
        syncedSwitches.push(data);
        
        // Sync ports for this switch
        await syncSwitchPorts(data.id, device.port_table || []);
      }
    }

    return syncedSwitches;
  } catch (error) {
    console.error('Error syncing UniFi switches:', error);
    throw error;
  }
};

/**
 * Sync switch ports to database
 * @param {string} switchId - Database switch ID
 * @param {Array} portTable - Port data from UniFi API
 */
export const syncSwitchPorts = async (switchId, portTable) => {
  try {
    for (const port of portTable) {
      await supabase
        .from('unifi_switch_ports')
        .upsert({
          switch_id: switchId,
          port_idx: port.port_idx,
          port_name: port.name,
          vlan_id: port.vlan,
          poe_mode: port.poe_mode,
          port_profile_name: port.portconf_id,
          is_uplink: port.is_uplink || false,
          speed: port.speed,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'switch_id,port_idx'
        });
    }
  } catch (error) {
    console.error('Error syncing switch ports:', error);
    throw error;
  }
};

/**
 * Link a wire drop to a switch port
 * @param {string} wireDropId - Wire drop ID
 * @param {string} switchPortId - Switch port ID
 * @param {Object} additionalInfo - Cable label, patch panel info, etc.
 */
export const linkWireDropToPort = async (wireDropId, switchPortId, additionalInfo = {}) => {
  try {
    const { data, error } = await supabase
      .from('wire_drop_ports')
      .upsert({
        wire_drop_id: wireDropId,
        switch_port_id: switchPortId,
        patch_panel_port: additionalInfo.patchPanelPort,
        cable_label: additionalInfo.cableLabel,
        notes: additionalInfo.notes
      }, {
        onConflict: 'wire_drop_id'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error linking wire drop to port:', error);
    throw error;
  }
};

/**
 * Get wire drops with full network information
 * @param {string} projectId - Project ID
 * @returns {Promise<Array>} Wire drops with network details
 */
export const getWireDropsWithNetwork = async (projectId) => {
  try {
    const { data, error } = await supabase
      .from('wire_drops_with_network_info')
      .select('*')
      .eq('project_id', projectId);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error fetching wire drops with network info:', error);
    throw error;
  }
};

export default {
  syncSites,
  syncSwitches,
  syncSwitchPorts,
  linkWireDropToPort,
  getWireDropsWithNetwork
};
