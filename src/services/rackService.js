/**
 * Rack Layout Service
 * Handles CRUD operations for racks, shelves, and equipment placement
 */

import { supabase } from '../lib/supabase';

// ============================================
// RACK EQUIPMENT (Parts that ARE racks)
// ============================================

/**
 * Get all rack-type equipment for a project (equipment that IS a rack)
 * These are equipment line items where the global_part is_rack = true
 * or the name/description suggests it's a rack
 */
export async function getProjectRackEquipment(projectId) {
  if (!projectId) throw new Error('Project ID is required');

  // Query without is_rack column (may not exist yet)
  const { data, error } = await supabase
    .from('project_equipment')
    .select(`
      id,
      description,
      name,
      install_side,
      global_part:global_part_id(
        id, name, manufacturer, model, u_height, is_rack_mountable
      )
    `)
    .eq('project_id', projectId)
    .eq('install_side', 'head_end');

  if (error) {
    console.error('[rackService] Error fetching rack equipment:', error);
    throw error;
  }

  // Filter for items that are racks based on name/description keywords
  // (is_rack column may not exist yet until migration is run)
  const rackEquipment = (data || []).filter(eq => {
    const part = eq.global_part;
    if (!part) return false;

    // Check is_rack flag if it exists
    if (part.is_rack === true) return true;

    // Fallback: Check if name/description contains rack-related keywords
    const nameLower = (part.name || '').toLowerCase();
    const descLower = (eq.description || eq.name || '').toLowerCase();
    const rackKeywords = ['rack', 'enclosure', 'cabinet', 'wall mount', ' u rack', '42u', '24u', '12u', '10u'];

    return rackKeywords.some(kw => nameLower.includes(kw) || descLower.includes(kw));
  });

  return rackEquipment;
}

/**
 * Create a rack from an equipment line item
 * This links the project_rack to the project_equipment (the rack itself)
 */
export async function createRackFromEquipment({ projectId, equipmentId, name, locationDescription, createdBy }) {
  if (!projectId) throw new Error('Project ID is required');
  if (!equipmentId) throw new Error('Equipment ID is required');

  // Get the equipment and its global_part to determine U height
  const { data: equipment, error: eqError } = await supabase
    .from('project_equipment')
    .select(`
      id,
      description,
      global_part:global_part_id(
        id, name, u_height
      )
    `)
    .eq('id', equipmentId)
    .single();

  if (eqError) {
    console.error('[rackService] Error fetching equipment for rack:', eqError);
    throw eqError;
  }

  // Get U height from global_part, default to 42 if not set
  const totalU = equipment?.global_part?.u_height || 42;
  const rackName = name || equipment?.global_part?.name || equipment?.description || 'Rack';

  // Get max sort_order for this project
  const { data: existing } = await supabase
    .from('project_racks')
    .select('sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextOrder = existing?.length > 0 ? (existing[0].sort_order || 0) + 1 : 0;

  // Build insert data - equipment_id may not exist if migration hasn't run
  const insertData = {
    project_id: projectId,
    name: rackName,
    location_description: locationDescription,
    total_u: totalU,
    created_by: createdBy,
    sort_order: nextOrder
  };

  // Try to include equipment_id if the column exists
  // We'll attempt the insert and fall back if it fails
  let { data, error } = await supabase
    .from('project_racks')
    .insert({ ...insertData, equipment_id: equipmentId })
    .select('*')
    .single();

  // If equipment_id column doesn't exist, try without it
  if (error && error.message?.includes('equipment_id')) {
    console.warn('[rackService] equipment_id column not found, creating rack without link');
    const result = await supabase
      .from('project_racks')
      .insert(insertData)
      .select('*')
      .single();
    data = result.data;
    error = result.error;
  }

  if (error) {
    console.error('[rackService] Error creating rack from equipment:', error);
    throw error;
  }

  return data;
}

// ============================================
// RACKS
// ============================================

/**
 * Get all racks for a project (with equipment link if available)
 */
export async function getProjectRacks(projectId) {
  if (!projectId) throw new Error('Project ID is required');

  // Try with equipment_id relationship first
  let { data, error } = await supabase
    .from('project_racks')
    .select(`
      *,
      shelves:project_rack_shelves(*)
    `)
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[rackService] Error fetching racks:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get a single rack with all details
 */
export async function getRack(rackId) {
  if (!rackId) throw new Error('Rack ID is required');

  const { data, error } = await supabase
    .from('project_racks')
    .select(`
      *,
      shelves:project_rack_shelves(*),
      equipment:project_equipment(
        *,
        global_part:global_part_id(
          id, name, manufacturer, model, u_height, is_rack_mountable, power_watts, power_outlets
        )
      )
    `)
    .eq('id', rackId)
    .single();

  if (error) {
    console.error('[rackService] Error fetching rack:', error);
    throw error;
  }

  return data;
}

/**
 * Create a new rack
 */
export async function createRack({ projectId, name, locationDescription, totalU = 42, createdBy }) {
  if (!projectId) throw new Error('Project ID is required');
  if (!name) throw new Error('Rack name is required');

  // Get max sort_order for this project
  const { data: existing } = await supabase
    .from('project_racks')
    .select('sort_order')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextOrder = existing?.length > 0 ? (existing[0].sort_order || 0) + 1 : 0;

  const { data, error } = await supabase
    .from('project_racks')
    .insert({
      project_id: projectId,
      name,
      location_description: locationDescription,
      total_u: totalU,
      created_by: createdBy,
      sort_order: nextOrder
    })
    .select()
    .single();

  if (error) {
    console.error('[rackService] Error creating rack:', error);
    throw error;
  }

  return data;
}

/**
 * Update a rack
 */
export async function updateRack(rackId, updates) {
  if (!rackId) throw new Error('Rack ID is required');

  const allowedFields = ['name', 'location_description', 'total_u', 'sort_order'];
  const cleanUpdates = {};

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      cleanUpdates[field] = updates[field];
    }
  }

  const { data, error } = await supabase
    .from('project_racks')
    .update(cleanUpdates)
    .eq('id', rackId)
    .select()
    .single();

  if (error) {
    console.error('[rackService] Error updating rack:', error);
    throw error;
  }

  return data;
}

/**
 * Delete a rack (cascades to shelves, unlinks equipment)
 */
export async function deleteRack(rackId) {
  if (!rackId) throw new Error('Rack ID is required');

  const { error } = await supabase
    .from('project_racks')
    .delete()
    .eq('id', rackId);

  if (error) {
    console.error('[rackService] Error deleting rack:', error);
    throw error;
  }

  return true;
}

// ============================================
// SHELVES
// ============================================

/**
 * Create a shelf in a rack
 */
export async function createShelf({ rackId, name, uHeight = 2, rackPositionU }) {
  if (!rackId) throw new Error('Rack ID is required');
  if (!rackPositionU) throw new Error('Rack position is required');

  const { data, error } = await supabase
    .from('project_rack_shelves')
    .insert({
      rack_id: rackId,
      name,
      u_height: uHeight,
      rack_position_u: rackPositionU
    })
    .select()
    .single();

  if (error) {
    console.error('[rackService] Error creating shelf:', error);
    throw error;
  }

  return data;
}

/**
 * Update a shelf
 */
export async function updateShelf(shelfId, updates) {
  if (!shelfId) throw new Error('Shelf ID is required');

  const allowedFields = ['name', 'u_height', 'rack_position_u'];
  const cleanUpdates = {};

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      cleanUpdates[field] = updates[field];
    }
  }

  const { data, error } = await supabase
    .from('project_rack_shelves')
    .update(cleanUpdates)
    .eq('id', shelfId)
    .select()
    .single();

  if (error) {
    console.error('[rackService] Error updating shelf:', error);
    throw error;
  }

  return data;
}

/**
 * Delete a shelf (unlinks equipment on it)
 */
export async function deleteShelf(shelfId) {
  if (!shelfId) throw new Error('Shelf ID is required');

  const { error } = await supabase
    .from('project_rack_shelves')
    .delete()
    .eq('id', shelfId);

  if (error) {
    console.error('[rackService] Error deleting shelf:', error);
    throw error;
  }

  return true;
}

// ============================================
// EQUIPMENT PLACEMENT
// ============================================

/**
 * Get all equipment in a rack (including on shelves)
 */
export async function getRackEquipment(rackId) {
  if (!rackId) throw new Error('Rack ID is required');

  const { data, error } = await supabase
    .from('project_equipment')
    .select(`
      *,
      global_part:global_part_id(
        id, name, manufacturer, model, u_height, is_rack_mountable, power_watts, power_outlets, is_wireless
      ),
      ha_client:project_ha_clients!project_equipment_ha_client_mac_fkey(
        mac, hostname, ip, is_wired, is_online, switch_name, switch_port, ssid, signal
      )
    `)
    .eq('rack_id', rackId)
    .order('rack_position_u', { ascending: false });

  if (error) {
    console.error('[rackService] Error fetching rack equipment:', error);
    throw error;
  }

  return data || [];
}

/**
 * Get equipment available to place in a rack (head-end equipment not yet placed)
 */
export async function getUnplacedRackEquipment(projectId) {
  if (!projectId) throw new Error('Project ID is required');

  const { data, error } = await supabase
    .from('project_equipment')
    .select(`
      *,
      global_part:global_part_id(
        id, name, manufacturer, model, u_height, is_rack_mountable, power_watts, power_outlets
      )
    `)
    .eq('project_id', projectId)
    .eq('install_side', 'head_end')
    .is('rack_id', null)
    .order('description');

  if (error) {
    console.error('[rackService] Error fetching unplaced equipment:', error);
    throw error;
  }

  return data || [];
}

/**
 * Place equipment in a rack
 */
export async function placeEquipmentInRack(equipmentId, { rackId, rackPositionU, shelfId = null }) {
  if (!equipmentId) throw new Error('Equipment ID is required');
  if (!rackId) throw new Error('Rack ID is required');

  const updates = {
    rack_id: rackId,
    rack_position_u: rackPositionU,
    shelf_id: shelfId
  };

  const { data, error } = await supabase
    .from('project_equipment')
    .update(updates)
    .eq('id', equipmentId)
    .select(`
      *,
      global_part:global_part_id(
        id, name, manufacturer, model, u_height, is_rack_mountable, power_watts, power_outlets
      )
    `)
    .single();

  if (error) {
    console.error('[rackService] Error placing equipment:', error);
    throw error;
  }

  return data;
}

/**
 * Move equipment to a different position in the rack
 */
export async function moveEquipmentInRack(equipmentId, { rackPositionU, shelfId = null }) {
  if (!equipmentId) throw new Error('Equipment ID is required');

  const updates = {
    rack_position_u: rackPositionU,
    shelf_id: shelfId
  };

  const { data, error } = await supabase
    .from('project_equipment')
    .update(updates)
    .eq('id', equipmentId)
    .select()
    .single();

  if (error) {
    console.error('[rackService] Error moving equipment:', error);
    throw error;
  }

  return data;
}

/**
 * Remove equipment from rack (back to unplaced)
 */
export async function removeEquipmentFromRack(equipmentId) {
  if (!equipmentId) throw new Error('Equipment ID is required');

  const { data, error } = await supabase
    .from('project_equipment')
    .update({
      rack_id: null,
      rack_position_u: null,
      shelf_id: null
    })
    .eq('id', equipmentId)
    .select()
    .single();

  if (error) {
    console.error('[rackService] Error removing equipment from rack:', error);
    throw error;
  }

  return data;
}

/**
 * Link equipment to HA client (by MAC address)
 */
export async function linkEquipmentToHAClient(equipmentId, mac) {
  if (!equipmentId) throw new Error('Equipment ID is required');

  const { data, error } = await supabase
    .from('project_equipment')
    .update({ ha_client_mac: mac || null })
    .eq('id', equipmentId)
    .select()
    .single();

  if (error) {
    console.error('[rackService] Error linking equipment to HA client:', error);
    throw error;
  }

  return data;
}

// ============================================
// RACK CALCULATIONS
// ============================================

/**
 * Calculate rack power usage
 */
export async function calculateRackPower(rackId) {
  if (!rackId) throw new Error('Rack ID is required');

  const { data, error } = await supabase
    .rpc('calculate_rack_power', { p_rack_id: rackId });

  if (error) {
    console.error('[rackService] Error calculating rack power:', error);
    throw error;
  }

  return data?.[0] || { total_watts: 0, total_outlets: 0, equipment_count: 0 };
}

/**
 * Check for U-slot collisions in a rack
 */
export async function checkRackCollisions(rackId, positionU, uHeight, excludeEquipmentId = null) {
  const equipment = await getRackEquipment(rackId);

  const newTop = positionU + uHeight - 1;
  const newBottom = positionU;

  for (const item of equipment) {
    if (excludeEquipmentId && item.id === excludeEquipmentId) continue;
    if (!item.rack_position_u) continue;

    const itemHeight = item.global_part?.u_height || 1;
    const itemTop = item.rack_position_u + itemHeight - 1;
    const itemBottom = item.rack_position_u;

    // Check for overlap
    if (newBottom <= itemTop && newTop >= itemBottom) {
      return {
        collision: true,
        conflictsWith: item
      };
    }
  }

  return { collision: false };
}

export default {
  // Rack equipment (parts that ARE racks)
  getProjectRackEquipment,
  createRackFromEquipment,

  // Racks
  getProjectRacks,
  getRack,
  createRack,
  updateRack,
  deleteRack,

  // Shelves
  createShelf,
  updateShelf,
  deleteShelf,

  // Equipment placement
  getRackEquipment,
  getUnplacedRackEquipment,
  placeEquipmentInRack,
  moveEquipmentInRack,
  removeEquipmentFromRack,
  linkEquipmentToHAClient,

  // Calculations
  calculateRackPower,
  checkRackCollisions
};
