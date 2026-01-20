/**
 * Equipment Connection Service
 * Handles CRUD operations for intra-rack connections between devices
 * Supports power connections, network connections, HDMI, audio, etc.
 */

import { supabase } from '../lib/supabase';

// ============================================
// CONNECTION TYPES
// ============================================

export const CONNECTION_TYPES = {
  POWER: 'power',
  NETWORK: 'network',
  HDMI: 'hdmi',
  AUDIO: 'audio',
  VIDEO: 'video',
  USB: 'usb',
  SERIAL: 'serial',
  COAX: 'coax',
  FIBER: 'fiber',
};

export const PORT_TYPES = {
  UPS: 'ups',           // Battery backup outlet
  SURGE: 'surge',       // Surge-only outlet
  STANDARD: 'standard', // Regular outlet
  ETHERNET: 'ethernet', // RJ45 network port
  SFP: 'sfp',           // SFP/SFP+ fiber port
  POE: 'poe',           // Power over Ethernet port
};

// ============================================
// CONNECTIONS CRUD
// ============================================

/**
 * Get all connections for a project
 * @param {string} projectId - Project UUID
 * @param {string} connectionType - Optional filter by connection type ('power', 'network', etc.)
 * @returns {Promise<Array>} Array of connections with source and target equipment details
 */
export async function getProjectConnections(projectId, connectionType = null) {
  if (!projectId) throw new Error('Project ID is required');

  let query = supabase
    .from('project_equipment_connections')
    .select(`
      id,
      project_id,
      source_equipment_id,
      source_port_number,
      source_port_type,
      target_equipment_id,
      target_port_number,
      connection_type,
      cable_label,
      notes,
      created_at,
      updated_at,
      source_equipment:source_equipment_id(
        id,
        name,
        instance_name,
        model,
        rack_id,
        rack_position_u,
        shelf_id,
        global_part:global_part_id(
          id,
          name,
          model,
          is_power_device,
          power_outlets_provided,
          ups_outlets_provided
        )
      ),
      target_equipment:target_equipment_id(
        id,
        name,
        instance_name,
        model,
        rack_id,
        rack_position_u,
        shelf_id,
        global_part:global_part_id(
          id,
          name,
          model,
          power_watts,
          power_outlets
        )
      )
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  if (connectionType) {
    query = query.eq('connection_type', connectionType);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[equipmentConnectionService] Error fetching connections:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get all connections for a specific rack
 * @param {string} rackId - Rack UUID
 * @param {string} connectionType - Optional filter by connection type
 * @returns {Promise<Array>} Connections where either source or target is in the rack
 */
export async function getRackConnections(rackId, connectionType = null) {
  if (!rackId) throw new Error('Rack ID is required');

  // First get all equipment in the rack
  const { data: rackEquipment, error: eqError } = await supabase
    .from('project_equipment')
    .select('id')
    .eq('rack_id', rackId);

  if (eqError) {
    console.error('[equipmentConnectionService] Error fetching rack equipment:', eqError);
    throw eqError;
  }

  const equipmentIds = (rackEquipment || []).map(e => e.id);
  if (equipmentIds.length === 0) return [];

  // Get connections where source OR target is in this rack
  let query = supabase
    .from('project_equipment_connections')
    .select(`
      id,
      project_id,
      source_equipment_id,
      source_port_number,
      source_port_type,
      target_equipment_id,
      target_port_number,
      connection_type,
      cable_label,
      notes,
      created_at,
      updated_at
    `);

  if (connectionType) {
    query = query.eq('connection_type', connectionType);
  }

  // We need to get connections where either source or target is in rack
  // Using .or() filter
  query = query.or(`source_equipment_id.in.(${equipmentIds.join(',')}),target_equipment_id.in.(${equipmentIds.join(',')})`);

  const { data, error } = await query;

  if (error) {
    console.error('[equipmentConnectionService] Error fetching rack connections:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get all connections for a specific equipment (as source or target)
 * @param {string} equipmentId - Equipment UUID
 * @returns {Promise<Object>} Object with inbound and outbound connections
 */
export async function getEquipmentConnections(equipmentId) {
  if (!equipmentId) throw new Error('Equipment ID is required');

  // Get outbound connections (this equipment is the source)
  const { data: outbound, error: outError } = await supabase
    .from('project_equipment_connections')
    .select(`
      id,
      source_port_number,
      source_port_type,
      target_equipment_id,
      target_port_number,
      connection_type,
      cable_label,
      target_equipment:target_equipment_id(
        id, name, instance_name, model,
        global_part:global_part_id(id, name, model)
      )
    `)
    .eq('source_equipment_id', equipmentId);

  if (outError) {
    console.error('[equipmentConnectionService] Error fetching outbound connections:', outError);
    throw outError;
  }

  // Get inbound connections (this equipment is the target)
  const { data: inbound, error: inError } = await supabase
    .from('project_equipment_connections')
    .select(`
      id,
      source_equipment_id,
      source_port_number,
      source_port_type,
      target_port_number,
      connection_type,
      cable_label,
      source_equipment:source_equipment_id(
        id, name, instance_name, model,
        global_part:global_part_id(id, name, model, is_power_device)
      )
    `)
    .eq('target_equipment_id', equipmentId);

  if (inError) {
    console.error('[equipmentConnectionService] Error fetching inbound connections:', inError);
    throw inError;
  }

  return {
    outbound: outbound || [],
    inbound: inbound || [],
  };
}

/**
 * Create a new connection between equipment
 * @param {Object} connectionData - Connection details
 * @returns {Promise<Object>} Created connection record
 */
export async function createConnection({
  projectId,
  sourceEquipmentId,
  sourcePortNumber,
  sourcePortType = null,
  targetEquipmentId,
  targetPortNumber = 1,
  connectionType,
  cableLabel = null,
  notes = null,
}) {
  if (!projectId) throw new Error('Project ID is required');
  if (!sourceEquipmentId) throw new Error('Source equipment ID is required');
  if (!sourcePortNumber) throw new Error('Source port number is required');
  if (!targetEquipmentId) throw new Error('Target equipment ID is required');
  if (!connectionType) throw new Error('Connection type is required');

  const { data, error } = await supabase
    .from('project_equipment_connections')
    .insert({
      project_id: projectId,
      source_equipment_id: sourceEquipmentId,
      source_port_number: sourcePortNumber,
      source_port_type: sourcePortType,
      target_equipment_id: targetEquipmentId,
      target_port_number: targetPortNumber,
      connection_type: connectionType,
      cable_label: cableLabel,
      notes: notes,
    })
    .select(`
      id,
      project_id,
      source_equipment_id,
      source_port_number,
      source_port_type,
      target_equipment_id,
      target_port_number,
      connection_type,
      cable_label,
      notes,
      created_at
    `)
    .single();

  if (error) {
    // Handle unique constraint violations with helpful messages
    if (error.code === '23505') {
      if (error.message?.includes('unique_source_port')) {
        throw new Error('This outlet/port is already in use');
      }
      if (error.message?.includes('unique_target_port')) {
        throw new Error('This device is already connected to a power source');
      }
    }
    console.error('[equipmentConnectionService] Error creating connection:', error);
    throw error;
  }

  return data;
}

/**
 * Update an existing connection
 * @param {string} connectionId - Connection UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated connection record
 */
export async function updateConnection(connectionId, updates) {
  if (!connectionId) throw new Error('Connection ID is required');

  const allowedFields = ['cable_label', 'notes', 'source_port_type'];
  const updateData = {};

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      updateData[key] = value;
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error('No valid fields to update');
  }

  const { data, error } = await supabase
    .from('project_equipment_connections')
    .update(updateData)
    .eq('id', connectionId)
    .select()
    .single();

  if (error) {
    console.error('[equipmentConnectionService] Error updating connection:', error);
    throw error;
  }

  return data;
}

/**
 * Delete a connection
 * @param {string} connectionId - Connection UUID
 * @returns {Promise<void>}
 */
export async function deleteConnection(connectionId) {
  if (!connectionId) throw new Error('Connection ID is required');

  const { error } = await supabase
    .from('project_equipment_connections')
    .delete()
    .eq('id', connectionId);

  if (error) {
    console.error('[equipmentConnectionService] Error deleting connection:', error);
    throw error;
  }
}

/**
 * Delete all connections for a specific equipment (useful when removing equipment)
 * @param {string} equipmentId - Equipment UUID
 * @returns {Promise<number>} Number of deleted connections
 */
export async function deleteEquipmentConnections(equipmentId) {
  if (!equipmentId) throw new Error('Equipment ID is required');

  // Delete connections where this equipment is source
  const { error: sourceError, count: sourceCount } = await supabase
    .from('project_equipment_connections')
    .delete()
    .eq('source_equipment_id', equipmentId);

  if (sourceError) {
    console.error('[equipmentConnectionService] Error deleting source connections:', sourceError);
    throw sourceError;
  }

  // Delete connections where this equipment is target
  const { error: targetError, count: targetCount } = await supabase
    .from('project_equipment_connections')
    .delete()
    .eq('target_equipment_id', equipmentId);

  if (targetError) {
    console.error('[equipmentConnectionService] Error deleting target connections:', targetError);
    throw targetError;
  }

  return (sourceCount || 0) + (targetCount || 0);
}

// ============================================
// POWER-SPECIFIC HELPERS
// ============================================

/**
 * Get power connection status for all equipment in a rack
 * Returns which devices are connected and which need power
 * @param {string} rackId - Rack UUID
 * @returns {Promise<Object>} Power status for each equipment
 */
export async function getRackPowerStatus(rackId) {
  if (!rackId) throw new Error('Rack ID is required');

  // Get all equipment in rack with their power requirements
  const { data: equipment, error: eqError } = await supabase
    .from('project_equipment')
    .select(`
      id,
      name,
      instance_name,
      model,
      global_part:global_part_id(
        id,
        name,
        is_power_device,
        power_outlets_provided,
        ups_outlets_provided,
        power_outlets,
        power_watts
      )
    `)
    .eq('rack_id', rackId);

  if (eqError) {
    console.error('[equipmentConnectionService] Error fetching rack equipment:', eqError);
    throw eqError;
  }

  // Get all power connections for this rack
  const connections = await getRackConnections(rackId, CONNECTION_TYPES.POWER);

  // Build status map
  const status = {};
  const connectedTargets = new Set(connections.map(c => c.target_equipment_id));
  const usedOutlets = new Map(); // sourceId -> Set of used port numbers

  connections.forEach(conn => {
    if (!usedOutlets.has(conn.source_equipment_id)) {
      usedOutlets.set(conn.source_equipment_id, new Map());
    }
    usedOutlets.get(conn.source_equipment_id).set(conn.source_port_number, {
      targetId: conn.target_equipment_id,
      portType: conn.source_port_type,
      connectionId: conn.id,
    });
  });

  for (const eq of equipment || []) {
    const gp = eq.global_part;
    const isPowerDevice = gp?.is_power_device;
    const outletsRequired = gp?.power_outlets || 1;
    const surgeOutlets = gp?.power_outlets_provided || 0;
    const upsOutlets = gp?.ups_outlets_provided || 0;
    const totalOutlets = surgeOutlets + upsOutlets;

    status[eq.id] = {
      equipment: eq,
      isPowerDevice,
      needsPower: !isPowerDevice || outletsRequired > 0,
      isConnected: connectedTargets.has(eq.id),
      outletsRequired,
      // For power devices: track which outlets are used
      ...(isPowerDevice && totalOutlets > 0 && {
        totalOutlets,
        surgeOutlets,
        upsOutlets,
        usedOutlets: usedOutlets.get(eq.id) || new Map(),
        availableOutlets: totalOutlets - (usedOutlets.get(eq.id)?.size || 0),
      }),
    };
  }

  return status;
}

/**
 * Get the power chain for a device (traces back to UPS/wall)
 * @param {string} equipmentId - Equipment UUID
 * @returns {Promise<Array>} Array of equipment in the power chain, from device to source
 */
export async function getPowerChain(equipmentId) {
  if (!equipmentId) throw new Error('Equipment ID is required');

  const chain = [];
  let currentId = equipmentId;
  const visited = new Set();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);

    // Get the power connection for this device (as target)
    const { data: connection, error } = await supabase
      .from('project_equipment_connections')
      .select(`
        id,
        source_equipment_id,
        source_port_number,
        source_port_type,
        source_equipment:source_equipment_id(
          id, name, instance_name, model,
          global_part:global_part_id(id, name, model, is_power_device)
        )
      `)
      .eq('target_equipment_id', currentId)
      .eq('connection_type', CONNECTION_TYPES.POWER)
      .maybeSingle();

    if (error) {
      console.error('[equipmentConnectionService] Error tracing power chain:', error);
      throw error;
    }

    if (connection) {
      chain.push({
        connectionId: connection.id,
        sourceEquipment: connection.source_equipment,
        portNumber: connection.source_port_number,
        portType: connection.source_port_type,
      });
      currentId = connection.source_equipment_id;
    } else {
      // No more connections - end of chain
      break;
    }
  }

  return chain;
}

// ============================================
// NETWORK-SPECIFIC HELPERS
// ============================================

/**
 * Get network switch port usage
 * @param {string} equipmentId - Switch equipment UUID
 * @returns {Promise<Object>} Port usage map
 */
export async function getSwitchPortUsage(equipmentId) {
  if (!equipmentId) throw new Error('Equipment ID is required');

  const { data: connections, error } = await supabase
    .from('project_equipment_connections')
    .select(`
      id,
      source_port_number,
      source_port_type,
      target_equipment_id,
      cable_label,
      target_equipment:target_equipment_id(
        id, name, instance_name, model,
        global_part:global_part_id(id, name, model)
      )
    `)
    .eq('source_equipment_id', equipmentId)
    .eq('connection_type', CONNECTION_TYPES.NETWORK);

  if (error) {
    console.error('[equipmentConnectionService] Error fetching switch ports:', error);
    throw error;
  }

  const portUsage = new Map();
  for (const conn of connections || []) {
    portUsage.set(conn.source_port_number, {
      connectionId: conn.id,
      portType: conn.source_port_type,
      connectedDevice: conn.target_equipment,
      cableLabel: conn.cable_label,
    });
  }

  return portUsage;
}

// ============================================
// QUICK-CREATE POWER STRIP
// ============================================

/**
 * Quick-create a power strip and optionally connect a device to it
 * Similar to quick-create shelf functionality
 * @param {Object} params - Power strip creation params
 * @returns {Promise<Object>} Created power strip equipment and optional connection
 */
export async function quickCreatePowerStrip({
  projectId,
  rackId,
  shelfId = null,
  name = 'Power Strip',
  outletCount = 6,
  connectEquipmentId = null,
  connectToSourceId = null,
  connectToSourcePort = null,
}) {
  if (!projectId) throw new Error('Project ID is required');

  // Create a basic power strip equipment entry
  // Note: This creates a simple entry - for full parts tracking,
  // the user should add a proper global_part
  const { data: powerStrip, error: createError } = await supabase
    .from('project_equipment')
    .insert({
      project_id: projectId,
      rack_id: rackId,
      shelf_id: shelfId,
      name: name,
      instance_name: name,
      description: `${outletCount}-outlet power strip`,
      // We'll need to handle this without a global_part initially
      // or create a generic power strip global_part
    })
    .select()
    .single();

  if (createError) {
    console.error('[equipmentConnectionService] Error creating power strip:', createError);
    throw createError;
  }

  const result = { powerStrip, connections: [] };

  // If we need to connect the power strip to a source (UPS/surge)
  if (connectToSourceId && connectToSourcePort) {
    try {
      const sourceConn = await createConnection({
        projectId,
        sourceEquipmentId: connectToSourceId,
        sourcePortNumber: connectToSourcePort,
        sourcePortType: PORT_TYPES.SURGE, // Assume surge for power strips
        targetEquipmentId: powerStrip.id,
        targetPortNumber: 1,
        connectionType: CONNECTION_TYPES.POWER,
      });
      result.connections.push(sourceConn);
    } catch (err) {
      console.warn('[equipmentConnectionService] Could not connect power strip to source:', err);
    }
  }

  // If we need to connect a device to this power strip
  if (connectEquipmentId) {
    try {
      const deviceConn = await createConnection({
        projectId,
        sourceEquipmentId: powerStrip.id,
        sourcePortNumber: 1, // First outlet
        sourcePortType: PORT_TYPES.STANDARD,
        targetEquipmentId: connectEquipmentId,
        targetPortNumber: 1,
        connectionType: CONNECTION_TYPES.POWER,
      });
      result.connections.push(deviceConn);
    } catch (err) {
      console.warn('[equipmentConnectionService] Could not connect device to power strip:', err);
    }
  }

  return result;
}

export default {
  CONNECTION_TYPES,
  PORT_TYPES,
  getProjectConnections,
  getRackConnections,
  getEquipmentConnections,
  createConnection,
  updateConnection,
  deleteConnection,
  deleteEquipmentConnections,
  getRackPowerStatus,
  getPowerChain,
  getSwitchPortUsage,
  quickCreatePowerStrip,
};
