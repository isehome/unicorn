/**
 * Interconnect Service
 * Handles CRUD operations for rack interconnects (cables within racks with QR labels)
 */

import { supabase } from '../lib/supabase';

// ============================================
// GET OPERATIONS
// ============================================

/**
 * Get all interconnects for a project with equipment details
 * @param {string} projectId - The project UUID
 * @returns {Promise<Array>} Array of interconnect records with equipment details
 */
export async function getProjectInterconnects(projectId) {
  if (!projectId) throw new Error('Project ID is required');

  const { data, error } = await supabase
    .from('project_interconnects')
    .select(`
      *,
      rack:project_racks!rack_id(id, name, location_description),
      from_equipment:project_equipment!from_equipment_id(
        id, name, description, manufacturer, model, part_number,
        global_part:global_part_id(id, name, manufacturer, model)
      ),
      to_equipment:project_equipment!to_equipment_id(
        id, name, description, manufacturer, model, part_number,
        global_part:global_part_id(id, name, manufacturer, model)
      ),
      verified_by_user:profiles!verified_by(id, full_name, email),
      created_by_user:profiles!created_by(id, full_name, email)
    `)
    .eq('project_id', projectId)
    .order('label_code', { ascending: true });

  if (error) {
    console.error('[interconnectService] Error fetching project interconnects:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get all interconnects for a specific rack
 * @param {string} rackId - The rack UUID
 * @returns {Promise<Array>} Array of interconnect records for the rack
 */
export async function getRackInterconnects(rackId) {
  if (!rackId) throw new Error('Rack ID is required');

  const { data, error } = await supabase
    .from('project_interconnects')
    .select(`
      *,
      rack:project_racks!rack_id(id, name, location_description),
      from_equipment:project_equipment!from_equipment_id(
        id, name, description, manufacturer, model, part_number,
        global_part:global_part_id(id, name, manufacturer, model)
      ),
      to_equipment:project_equipment!to_equipment_id(
        id, name, description, manufacturer, model, part_number,
        global_part:global_part_id(id, name, manufacturer, model)
      ),
      verified_by_user:profiles!verified_by(id, full_name, email),
      created_by_user:profiles!created_by(id, full_name, email)
    `)
    .eq('rack_id', rackId)
    .order('label_code', { ascending: true });

  if (error) {
    console.error('[interconnectService] Error fetching rack interconnects:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get a single interconnect by ID
 * @param {string} interconnectId - The interconnect UUID
 * @returns {Promise<Object>} The interconnect record with equipment details
 */
export async function getInterconnect(interconnectId) {
  if (!interconnectId) throw new Error('Interconnect ID is required');

  const { data, error } = await supabase
    .from('project_interconnects')
    .select(`
      *,
      rack:project_racks!rack_id(id, name, location_description),
      from_equipment:project_equipment!from_equipment_id(
        id, name, description, manufacturer, model, part_number,
        global_part:global_part_id(id, name, manufacturer, model)
      ),
      to_equipment:project_equipment!to_equipment_id(
        id, name, description, manufacturer, model, part_number,
        global_part:global_part_id(id, name, manufacturer, model)
      ),
      verified_by_user:profiles!verified_by(id, full_name, email),
      created_by_user:profiles!created_by(id, full_name, email)
    `)
    .eq('id', interconnectId)
    .single();

  if (error) {
    console.error('[interconnectService] Error fetching interconnect:', error);
    throw error;
  }

  return data;
}

/**
 * Get all interconnects for a specific equipment item (as source or destination)
 * @param {string} equipmentId - The equipment UUID
 * @returns {Promise<Array>} Array of interconnect records involving the equipment
 */
export async function getEquipmentInterconnects(equipmentId) {
  if (!equipmentId) throw new Error('Equipment ID is required');

  const { data, error } = await supabase
    .from('project_interconnects')
    .select(`
      *,
      rack:project_racks!rack_id(id, name, location_description),
      from_equipment:project_equipment!from_equipment_id(
        id, name, description, manufacturer, model, part_number,
        global_part:global_part_id(id, name, manufacturer, model)
      ),
      to_equipment:project_equipment!to_equipment_id(
        id, name, description, manufacturer, model, part_number,
        global_part:global_part_id(id, name, manufacturer, model)
      ),
      verified_by_user:profiles!verified_by(id, full_name, email),
      created_by_user:profiles!created_by(id, full_name, email)
    `)
    .or(`from_equipment_id.eq.${equipmentId},to_equipment_id.eq.${equipmentId}`)
    .order('label_code', { ascending: true });

  if (error) {
    console.error('[interconnectService] Error fetching equipment interconnects:', error);
    throw error;
  }

  return data || [];
}

// ============================================
// CREATE OPERATIONS
// ============================================

/**
 * Create a new interconnect
 * Uses the database RPC function to generate the label code
 * @param {Object} params - The interconnect parameters
 * @param {string} params.projectId - Project UUID (required)
 * @param {string} params.rackId - Rack UUID (required)
 * @param {string} params.rackName - Rack name for label generation (required)
 * @param {string} params.fromEquipmentId - Source equipment UUID (required)
 * @param {string} params.fromPort - Source port identifier (required)
 * @param {string} params.toEquipmentId - Destination equipment UUID (required)
 * @param {string} params.toPort - Destination port identifier (required)
 * @param {string} params.cableType - Type of cable (e.g., CAT6, HDMI, Speaker Wire)
 * @param {number} params.lengthFt - Cable length in feet
 * @param {string} params.notes - Optional notes
 * @param {string} params.createdBy - User UUID who created this
 * @returns {Promise<Object>} The created interconnect record
 */
export async function createInterconnect({
  projectId,
  rackId,
  rackName,
  fromEquipmentId,
  fromPort,
  toEquipmentId,
  toPort,
  cableType,
  lengthFt,
  notes,
  createdBy
}) {
  if (!projectId) throw new Error('Project ID is required');
  if (!rackId) throw new Error('Rack ID is required');
  if (!rackName) throw new Error('Rack name is required for label generation');
  if (!fromEquipmentId) throw new Error('From equipment ID is required');
  if (!fromPort) throw new Error('From port is required');
  if (!toEquipmentId) throw new Error('To equipment ID is required');
  if (!toPort) throw new Error('To port is required');

  // Generate the label code using the database RPC function
  const { data: labelCode, error: rpcError } = await supabase
    .rpc('generate_interconnect_label', {
      p_project_id: projectId,
      p_rack_name: rackName
    });

  if (rpcError) {
    console.error('[interconnectService] Error generating label code:', rpcError);
    throw new Error(`Failed to generate label code: ${rpcError.message}`);
  }

  if (!labelCode) {
    throw new Error('Failed to generate label code: No label returned from RPC');
  }

  console.log('[interconnectService] Generated label code:', labelCode);

  // Create the interconnect record
  const { data, error } = await supabase
    .from('project_interconnects')
    .insert({
      project_id: projectId,
      rack_id: rackId,
      label_code: labelCode,
      from_equipment_id: fromEquipmentId,
      from_port: fromPort,
      to_equipment_id: toEquipmentId,
      to_port: toPort,
      cable_type: cableType || null,
      length_ft: lengthFt || null,
      notes: notes || null,
      created_by: createdBy || null,
      verified: false,
      qr_code_printed: false
    })
    .select(`
      *,
      rack:project_racks!rack_id(id, name, location_description),
      from_equipment:project_equipment!from_equipment_id(
        id, name, description, manufacturer, model, part_number,
        global_part:global_part_id(id, name, manufacturer, model)
      ),
      to_equipment:project_equipment!to_equipment_id(
        id, name, description, manufacturer, model, part_number,
        global_part:global_part_id(id, name, manufacturer, model)
      )
    `)
    .single();

  if (error) {
    console.error('[interconnectService] Error creating interconnect:', error);
    throw error;
  }

  console.log('[interconnectService] Created interconnect:', data.id, 'with label:', data.label_code);
  return data;
}

// ============================================
// UPDATE OPERATIONS
// ============================================

/**
 * Update an existing interconnect
 * @param {string} interconnectId - The interconnect UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} The updated interconnect record
 */
export async function updateInterconnect(interconnectId, updates) {
  if (!interconnectId) throw new Error('Interconnect ID is required');

  // Define allowed fields for update (excluding system-managed fields)
  const allowedFields = [
    'from_equipment_id',
    'from_port',
    'to_equipment_id',
    'to_port',
    'cable_type',
    'length_ft',
    'notes'
  ];

  const cleanUpdates = {};

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      cleanUpdates[field] = updates[field];
    }
  }

  // Also support camelCase input
  if (updates.fromEquipmentId !== undefined) cleanUpdates.from_equipment_id = updates.fromEquipmentId;
  if (updates.fromPort !== undefined) cleanUpdates.from_port = updates.fromPort;
  if (updates.toEquipmentId !== undefined) cleanUpdates.to_equipment_id = updates.toEquipmentId;
  if (updates.toPort !== undefined) cleanUpdates.to_port = updates.toPort;
  if (updates.cableType !== undefined) cleanUpdates.cable_type = updates.cableType;
  if (updates.lengthFt !== undefined) cleanUpdates.length_ft = updates.lengthFt;

  if (Object.keys(cleanUpdates).length === 0) {
    console.warn('[interconnectService] No valid fields to update');
    return getInterconnect(interconnectId);
  }

  cleanUpdates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('project_interconnects')
    .update(cleanUpdates)
    .eq('id', interconnectId)
    .select(`
      *,
      rack:project_racks!rack_id(id, name, location_description),
      from_equipment:project_equipment!from_equipment_id(
        id, name, description, manufacturer, model, part_number,
        global_part:global_part_id(id, name, manufacturer, model)
      ),
      to_equipment:project_equipment!to_equipment_id(
        id, name, description, manufacturer, model, part_number,
        global_part:global_part_id(id, name, manufacturer, model)
      )
    `)
    .single();

  if (error) {
    console.error('[interconnectService] Error updating interconnect:', error);
    throw error;
  }

  console.log('[interconnectService] Updated interconnect:', interconnectId);
  return data;
}

/**
 * Mark an interconnect as verified
 * @param {string} interconnectId - The interconnect UUID
 * @param {string} verifiedBy - User UUID who verified this
 * @returns {Promise<Object>} The updated interconnect record
 */
export async function verifyInterconnect(interconnectId, verifiedBy) {
  if (!interconnectId) throw new Error('Interconnect ID is required');
  if (!verifiedBy) throw new Error('Verified by user ID is required');

  const { data, error } = await supabase
    .from('project_interconnects')
    .update({
      verified: true,
      verified_at: new Date().toISOString(),
      verified_by: verifiedBy,
      updated_at: new Date().toISOString()
    })
    .eq('id', interconnectId)
    .select(`
      *,
      rack:project_racks!rack_id(id, name, location_description),
      from_equipment:project_equipment!from_equipment_id(
        id, name, description, manufacturer, model, part_number,
        global_part:global_part_id(id, name, manufacturer, model)
      ),
      to_equipment:project_equipment!to_equipment_id(
        id, name, description, manufacturer, model, part_number,
        global_part:global_part_id(id, name, manufacturer, model)
      ),
      verified_by_user:profiles!verified_by(id, full_name, email)
    `)
    .single();

  if (error) {
    console.error('[interconnectService] Error verifying interconnect:', error);
    throw error;
  }

  console.log('[interconnectService] Verified interconnect:', interconnectId);
  return data;
}

/**
 * Mark an interconnect's QR code as printed
 * @param {string} interconnectId - The interconnect UUID
 * @returns {Promise<Object>} The updated interconnect record
 */
export async function markQRPrinted(interconnectId) {
  if (!interconnectId) throw new Error('Interconnect ID is required');

  const { data, error } = await supabase
    .from('project_interconnects')
    .update({
      qr_code_printed: true,
      qr_code_printed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', interconnectId)
    .select(`
      *,
      rack:project_racks!rack_id(id, name, location_description),
      from_equipment:project_equipment!from_equipment_id(
        id, name, description, manufacturer, model, part_number,
        global_part:global_part_id(id, name, manufacturer, model)
      ),
      to_equipment:project_equipment!to_equipment_id(
        id, name, description, manufacturer, model, part_number,
        global_part:global_part_id(id, name, manufacturer, model)
      )
    `)
    .single();

  if (error) {
    console.error('[interconnectService] Error marking QR as printed:', error);
    throw error;
  }

  console.log('[interconnectService] Marked QR printed for interconnect:', interconnectId);
  return data;
}

// ============================================
// DELETE OPERATIONS
// ============================================

/**
 * Delete an interconnect
 * @param {string} interconnectId - The interconnect UUID
 * @returns {Promise<boolean>} True if deletion was successful
 */
export async function deleteInterconnect(interconnectId) {
  if (!interconnectId) throw new Error('Interconnect ID is required');

  const { error } = await supabase
    .from('project_interconnects')
    .delete()
    .eq('id', interconnectId);

  if (error) {
    console.error('[interconnectService] Error deleting interconnect:', error);
    throw error;
  }

  console.log('[interconnectService] Deleted interconnect:', interconnectId);
  return true;
}

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * Mark multiple interconnects' QR codes as printed (bulk operation)
 * @param {Array<string>} interconnectIds - Array of interconnect UUIDs
 * @returns {Promise<Array>} Array of updated interconnect records
 */
export async function markQRPrintedBulk(interconnectIds) {
  if (!interconnectIds || !Array.isArray(interconnectIds) || interconnectIds.length === 0) {
    throw new Error('Interconnect IDs array is required');
  }

  const { data, error } = await supabase
    .from('project_interconnects')
    .update({
      qr_code_printed: true,
      qr_code_printed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .in('id', interconnectIds)
    .select();

  if (error) {
    console.error('[interconnectService] Error bulk marking QR as printed:', error);
    throw error;
  }

  console.log('[interconnectService] Bulk marked QR printed for', data?.length || 0, 'interconnects');
  return data || [];
}

/**
 * Get interconnects that need QR codes printed
 * @param {string} projectId - The project UUID
 * @returns {Promise<Array>} Array of interconnects without printed QR codes
 */
export async function getUnprintedQRInterconnects(projectId) {
  if (!projectId) throw new Error('Project ID is required');

  const { data, error } = await supabase
    .from('project_interconnects')
    .select(`
      *,
      rack:project_racks!rack_id(id, name, location_description),
      from_equipment:project_equipment!from_equipment_id(
        id, name, description, manufacturer, model, part_number
      ),
      to_equipment:project_equipment!to_equipment_id(
        id, name, description, manufacturer, model, part_number
      )
    `)
    .eq('project_id', projectId)
    .eq('qr_code_printed', false)
    .order('label_code', { ascending: true });

  if (error) {
    console.error('[interconnectService] Error fetching unprinted QR interconnects:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get unverified interconnects for a project
 * @param {string} projectId - The project UUID
 * @returns {Promise<Array>} Array of unverified interconnects
 */
export async function getUnverifiedInterconnects(projectId) {
  if (!projectId) throw new Error('Project ID is required');

  const { data, error } = await supabase
    .from('project_interconnects')
    .select(`
      *,
      rack:project_racks!rack_id(id, name, location_description),
      from_equipment:project_equipment!from_equipment_id(
        id, name, description, manufacturer, model, part_number
      ),
      to_equipment:project_equipment!to_equipment_id(
        id, name, description, manufacturer, model, part_number
      )
    `)
    .eq('project_id', projectId)
    .eq('verified', false)
    .order('label_code', { ascending: true });

  if (error) {
    console.error('[interconnectService] Error fetching unverified interconnects:', error);
    throw error;
  }

  return data || [];
}

// Default export with all functions
export default {
  // Get operations
  getProjectInterconnects,
  getRackInterconnects,
  getInterconnect,
  getEquipmentInterconnects,

  // Create operations
  createInterconnect,

  // Update operations
  updateInterconnect,
  verifyInterconnect,
  markQRPrinted,

  // Delete operations
  deleteInterconnect,

  // Bulk operations
  markQRPrintedBulk,
  getUnprintedQRInterconnects,
  getUnverifiedInterconnects
};
