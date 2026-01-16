/**
 * Shared Milestone Calculation Module
 *
 * This is the SINGLE SOURCE OF TRUTH for all milestone percentage calculations.
 * Used by:
 *   - api/project-report/generate.js (report generation)
 *   - api/milestone-percentages.js (API endpoint)
 *
 * IMPORTANT: This must match the logic in src/services/milestoneService.js exactly!
 * Any changes here should be reflected there and vice versa.
 *
 * DO NOT DUPLICATE THIS LOGIC ELSEWHERE.
 * If you need milestone percentages, import from this module or call the API.
 */

const { createClient } = require('@supabase/supabase-js');

// Create Supabase client for server-side use
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY
);

/**
 * Calculate all milestone percentages for a project
 * @param {string} projectId - The project UUID
 * @param {object} project - Optional pre-loaded project object (optimization)
 * @returns {object} All milestone percentages
 */
async function calculateAllMilestones(projectId, project = null) {
  // Load project if not provided
  if (!project) {
    const { data, error } = await supabase
      .from('projects')
      .select('id, wiring_diagram_url, portal_proposal_url')
      .eq('id', projectId)
      .single();

    if (error) {
      console.error('Error loading project:', error);
      project = {};
    } else {
      project = data;
    }
  }

  // Calculate Planning & Design
  const planningDesign = calculatePlanningDesign(project);

  // Calculate Prewire metrics
  const prewireOrders = await calculatePrewireOrders(projectId);
  const prewireReceiving = await calculatePrewireReceiving(projectId);
  const prewireStages = await calculatePrewireStages(projectId);

  // Calculate Prewire Phase rollup (25% orders + 25% receiving + 50% stages)
  const prewirePhasePercentage = Math.round(
    prewireOrders.percentage * 0.25 +
    prewireReceiving.percentage * 0.25 +
    prewireStages.percentage * 0.50
  );

  // Calculate Trim metrics
  const trimOrders = await calculateTrimOrders(projectId);
  const trimReceiving = await calculateTrimReceiving(projectId);
  const trimStages = await calculateTrimStages(projectId);

  // Calculate Trim Phase rollup (25% orders + 25% receiving + 50% stages)
  const trimPhasePercentage = Math.round(
    trimOrders.percentage * 0.25 +
    trimReceiving.percentage * 0.25 +
    trimStages.percentage * 0.50
  );

  // Calculate Commissioning
  const commissioning = await calculateCommissioning(projectId);

  return {
    // Individual metrics (snake_case for API consistency)
    planning_design: planningDesign.percentage,
    prewire_orders: prewireOrders.percentage,
    prewire_receiving: prewireReceiving.percentage,
    prewire: prewireStages.percentage,
    trim_orders: trimOrders.percentage,
    trim_receiving: trimReceiving.percentage,
    trim: trimStages.percentage,
    // commissioning stays as object for generate.js compatibility (needs .percentage property)
    commissioning: commissioning,

    // Phase rollups (snake_case for API)
    prewire_phase: {
      percentage: prewirePhasePercentage,
      orders: prewireOrders,
      receiving: prewireReceiving,
      stages: prewireStages
    },
    trim_phase: {
      percentage: trimPhasePercentage,
      orders: trimOrders,
      receiving: trimReceiving,
      stages: trimStages
    },

    // CamelCase aliases (for generate.js backwards compatibility)
    planningDesign,
    prewireOrders,
    prewireReceiving,
    prewireStages,
    prewirePhase: prewirePhasePercentage,
    trimOrders,
    trimReceiving,
    trimStages,
    trimPhase: trimPhasePercentage,
    // commissioning is already an object with { percentage, completed, total }
  };
}

/**
 * Planning & Design: 100% when both URLs exist, 50% for one
 */
function calculatePlanningDesign(project) {
  const hasLucid = Boolean(project?.wiring_diagram_url);
  const hasProposal = Boolean(project?.portal_proposal_url);

  if (hasLucid && hasProposal) return { percentage: 100 };
  if (hasLucid || hasProposal) return { percentage: 50 };
  return { percentage: 0 };
}

/**
 * Prewire Orders: % of prewire parts with submitted POs
 * Matches milestoneService.calculatePrewireOrdersPercentage
 */
async function calculatePrewireOrders(projectId) {
  try {
    // Get equipment with global_part data
    const { data: equipment } = await supabase
      .from('project_equipment')
      .select(`
        id,
        planned_quantity,
        global_part:global_part_id (required_for_prewire)
      `)
      .eq('project_id', projectId)
      .neq('equipment_type', 'Labor');

    // Get submitted prewire POs
    const { data: pos } = await supabase
      .from('purchase_orders')
      .select(`
        id,
        status,
        items:purchase_order_items(project_equipment_id, quantity_ordered)
      `)
      .eq('project_id', projectId)
      .eq('milestone_stage', 'prewire_prep');

    // Map submitted PO quantities
    const submittedPOMap = new Map();
    (pos || []).forEach(po => {
      if (['submitted', 'confirmed', 'partially_received', 'received'].includes(po.status)) {
        (po.items || []).forEach(item => {
          const existing = submittedPOMap.get(item.project_equipment_id) || 0;
          submittedPOMap.set(item.project_equipment_id, existing + (item.quantity_ordered || 0));
        });
      }
    });

    // Filter to prewire items
    const prewireItems = (equipment || []).filter(item =>
      item.global_part?.required_for_prewire === true
    );

    if (prewireItems.length === 0) {
      return { percentage: 0, ordered: 0, total: 0 };
    }

    let totalParts = 0;
    let orderedParts = 0;

    prewireItems.forEach(item => {
      const required = item.planned_quantity || 0;
      const ordered = submittedPOMap.get(item.id) || 0;
      totalParts += required;
      orderedParts += Math.min(required, ordered);
    });

    const percentage = totalParts > 0 ? Math.round((orderedParts / totalParts) * 100) : 0;
    return { percentage, ordered: orderedParts, total: totalParts };
  } catch (error) {
    console.error('Error calculating prewire orders:', error);
    return { percentage: 0, ordered: 0, total: 0 };
  }
}

/**
 * Prewire Receiving: % of prewire parts fully received
 * Matches milestoneService.calculatePrewireReceivingPercentage
 */
async function calculatePrewireReceiving(projectId) {
  try {
    const { data: equipment } = await supabase
      .from('project_equipment')
      .select(`
        id,
        planned_quantity,
        received_quantity,
        global_part:global_part_id (required_for_prewire)
      `)
      .eq('project_id', projectId)
      .neq('equipment_type', 'Labor');

    const prewireItems = (equipment || []).filter(item =>
      item.global_part?.required_for_prewire === true &&
      (item.planned_quantity || 0) > 0
    );

    if (prewireItems.length === 0) {
      return { percentage: 0, received: 0, total: 0 };
    }

    let totalParts = 0;
    let receivedParts = 0;

    prewireItems.forEach(item => {
      const required = item.planned_quantity || 0;
      const received = item.received_quantity || 0;
      totalParts += required;
      receivedParts += Math.min(required, received);
    });

    const percentage = totalParts > 0 ? Math.round((receivedParts / totalParts) * 100) : 0;
    return { percentage, received: receivedParts, total: totalParts };
  } catch (error) {
    console.error('Error calculating prewire receiving:', error);
    return { percentage: 0, received: 0, total: 0 };
  }
}

/**
 * Prewire Stages: % of wire drops with completed prewire stage
 * Matches milestoneService.calculatePrewirePercentage
 *
 * A wire drop's prewire stage is complete when:
 *   - completed === true, OR
 *   - photo_url exists (has a photo)
 */
async function calculatePrewireStages(projectId) {
  try {
    // Get all wire drops for this project
    const { data: wireDrops } = await supabase
      .from('wire_drops')
      .select('id')
      .eq('project_id', projectId);

    const totalDrops = wireDrops?.length || 0;
    if (totalDrops === 0) return { percentage: 0, completed: 0, total: 0 };

    // Get prewire stages for these wire drops
    const { data: stages } = await supabase
      .from('wire_drop_stages')
      .select('wire_drop_id, completed, photo_url')
      .eq('stage_type', 'prewire')
      .in('wire_drop_id', wireDrops.map(w => w.id));

    // Count completed prewire stages (either marked completed OR has photo)
    const completedStages = (stages || []).filter(stage =>
      stage.completed === true || Boolean(stage.photo_url)
    );

    const percentage = Math.round((completedStages.length / totalDrops) * 100);
    return { percentage, completed: completedStages.length, total: totalDrops };
  } catch (error) {
    console.error('Error calculating prewire stages:', error);
    return { percentage: 0, completed: 0, total: 0 };
  }
}

/**
 * Trim Orders: % of trim parts with submitted POs
 * Matches milestoneService.calculateTrimOrdersPercentage
 *
 * Includes both equipment AND approved shades that have been ordered
 */
async function calculateTrimOrders(projectId) {
  try {
    const { data: equipment } = await supabase
      .from('project_equipment')
      .select(`
        id,
        planned_quantity,
        global_part:global_part_id (required_for_prewire)
      `)
      .eq('project_id', projectId)
      .neq('equipment_type', 'Labor');

    const { data: pos } = await supabase
      .from('purchase_orders')
      .select(`
        id,
        status,
        items:purchase_order_items(project_equipment_id, quantity_ordered)
      `)
      .eq('project_id', projectId)
      .eq('milestone_stage', 'trim_prep');

    // Load shades for this project (shades are trim-phase items)
    const { data: shades } = await supabase
      .from('project_shades')
      .select('id, ordered, approval_status')
      .eq('project_id', projectId);

    const submittedPOMap = new Map();
    (pos || []).forEach(po => {
      if (['submitted', 'confirmed', 'partially_received', 'received'].includes(po.status)) {
        (po.items || []).forEach(item => {
          const existing = submittedPOMap.get(item.project_equipment_id) || 0;
          submittedPOMap.set(item.project_equipment_id, existing + (item.quantity_ordered || 0));
        });
      }
    });

    // Trim items: required_for_prewire !== true
    const trimItems = (equipment || []).filter(item =>
      item.global_part?.required_for_prewire !== true
    );

    // Calculate EQUIPMENT ordered
    let totalParts = 0;
    let orderedParts = 0;

    trimItems.forEach(item => {
      const required = item.planned_quantity || 0;
      const ordered = submittedPOMap.get(item.id) || 0;
      totalParts += required;
      orderedParts += Math.min(required, ordered);
    });

    // Add SHADES to totals (each shade counts as 1 part)
    // Only count approved shades as "requiring order"
    const approvedShades = (shades || []).filter(s => s.approval_status === 'approved');
    const orderedShades = approvedShades.filter(s => s.ordered === true);

    totalParts += approvedShades.length;
    orderedParts += orderedShades.length;

    if (totalParts === 0) {
      return { percentage: 0, ordered: 0, total: 0 };
    }

    const percentage = Math.round((orderedParts / totalParts) * 100);
    return { percentage, ordered: orderedParts, total: totalParts };
  } catch (error) {
    console.error('Error calculating trim orders:', error);
    return { percentage: 0, ordered: 0, total: 0 };
  }
}

/**
 * Trim Receiving: % of trim parts fully received
 * Matches milestoneService.calculateTrimReceivingPercentage
 *
 * Includes both equipment AND ordered shades that have been received
 */
async function calculateTrimReceiving(projectId) {
  try {
    const { data: equipment } = await supabase
      .from('project_equipment')
      .select(`
        id,
        planned_quantity,
        received_quantity,
        global_part:global_part_id (required_for_prewire)
      `)
      .eq('project_id', projectId)
      .neq('equipment_type', 'Labor');

    // Load shades for this project
    const { data: shades } = await supabase
      .from('project_shades')
      .select('id, ordered, received')
      .eq('project_id', projectId);

    const trimItems = (equipment || []).filter(item =>
      item.global_part?.required_for_prewire !== true &&
      (item.planned_quantity || 0) > 0
    );

    // Calculate EQUIPMENT received
    let totalParts = 0;
    let receivedParts = 0;

    trimItems.forEach(item => {
      const required = item.planned_quantity || 0;
      const received = item.received_quantity || 0;
      totalParts += required;
      receivedParts += Math.min(required, received);
    });

    // Add SHADES to totals (each ordered shade counts as 1 part)
    const orderedShades = (shades || []).filter(s => s.ordered === true);
    const receivedShades = orderedShades.filter(s => s.received === true);

    totalParts += orderedShades.length;
    receivedParts += receivedShades.length;

    if (totalParts === 0) {
      return { percentage: 0, received: 0, total: 0 };
    }

    const percentage = Math.round((receivedParts / totalParts) * 100);
    return { percentage, received: receivedParts, total: totalParts };
  } catch (error) {
    console.error('Error calculating trim receiving:', error);
    return { percentage: 0, received: 0, total: 0 };
  }
}

/**
 * Trim Stages: Combined calculation for wire drops + equipment + shades
 * Matches milestoneService.calculateTrimPercentage
 *
 * Formula: (completed wire drops + installed equipment + installed shades) /
 *          (total wire drops + total trim equipment + total ordered shades)
 *
 * Wire drop completion:
 *   - is_auxiliary = true: Auto-completes (spare wires don't block progress)
 *   - trim_out stage completed = true: Completed
 *
 * Equipment installation:
 *   - installed = true (manual toggle), OR
 *   - Linked to wire drop (room_end) with completed trim_out
 *
 * Shade installation:
 *   - installed = true (manual toggle), OR
 *   - Linked to wire drop (room_end) with completed trim_out
 */
async function calculateTrimStages(projectId) {
  try {
    // ===== WIRE DROPS =====
    const { data: wireDrops } = await supabase
      .from('wire_drops')
      .select('id, is_auxiliary')
      .eq('project_id', projectId);

    const totalWireDrops = (wireDrops || []).length;
    const wireDropIds = (wireDrops || []).map(wd => wd.id);

    // Get completed trim_out stages for wire drops
    let completedWireDropIds = new Set();
    if (wireDropIds.length > 0) {
      const { data: trimStages } = await supabase
        .from('wire_drop_stages')
        .select('wire_drop_id')
        .eq('stage_type', 'trim_out')
        .eq('completed', true)
        .in('wire_drop_id', wireDropIds);

      completedWireDropIds = new Set((trimStages || []).map(s => s.wire_drop_id));
    }

    // Count completed wire drops:
    // - is_auxiliary = true (spare wires auto-complete), OR
    // - trim_out stage completed
    const completedWireDropCount = (wireDrops || []).filter(wd =>
      wd.is_auxiliary === true || completedWireDropIds.has(wd.id)
    ).length;

    // ===== EQUIPMENT =====
    const { data: equipment } = await supabase
      .from('project_equipment')
      .select(`
        id,
        installed,
        equipment_type,
        global_part:global_part_id (required_for_prewire)
      `)
      .eq('project_id', projectId)
      .eq('is_active', true);

    // Filter for trim-phase equipment:
    // - NOT required for prewire (via global_parts), AND
    // - NOT labor items
    const trimEquipment = (equipment || []).filter(item =>
      item.global_part?.required_for_prewire !== true &&
      item.equipment_type !== 'Labor'
    );

    const totalEquipment = trimEquipment.length;
    const trimEquipmentIds = trimEquipment.map(e => e.id);

    // Get room_end wire drop links for this equipment
    // IMPORTANT: Only room_end links auto-install equipment on trim_out completion
    let equipmentWithCompletedTrimOut = new Set();
    if (trimEquipmentIds.length > 0) {
      const { data: equipmentLinks } = await supabase
        .from('wire_drop_equipment_links')
        .select('project_equipment_id, wire_drop_id, link_side')
        .in('project_equipment_id', trimEquipmentIds)
        .eq('link_side', 'room_end');

      // Build a set of equipment IDs that are linked via room_end to completed wire drops
      (equipmentLinks || []).forEach(link => {
        if (completedWireDropIds.has(link.wire_drop_id)) {
          equipmentWithCompletedTrimOut.add(link.project_equipment_id);
        }
      });
    }

    // Count installed equipment:
    // - Has installed=true in DB (manual toggle for wireless/head-end items), OR
    // - Is linked via room_end to a wire drop with completed trim_out
    const installedEquipmentCount = trimEquipment.filter(item => {
      if (equipmentWithCompletedTrimOut.has(item.id)) return true;
      if (item.installed === true) return true;
      return false;
    }).length;

    // ===== SHADES =====
    // Get all ordered shades for this project (only ordered shades count for installation tracking)
    const { data: shades } = await supabase
      .from('project_shades')
      .select('id, installed, ordered')
      .eq('project_id', projectId)
      .eq('ordered', true);

    const totalShades = (shades || []).length;
    const shadeIds = (shades || []).map(s => s.id);

    // Get shade links to check for wire drop completion
    let shadesWithCompletedTrimOut = new Set();
    if (shadeIds.length > 0 && wireDropIds.length > 0) {
      const { data: shadeLinks } = await supabase
        .from('wire_drop_shade_links')
        .select('project_shade_id, wire_drop_id')
        .in('project_shade_id', shadeIds)
        .eq('link_side', 'room_end');

      // Build a set of shade IDs that are linked to completed wire drops
      (shadeLinks || []).forEach(link => {
        if (completedWireDropIds.has(link.wire_drop_id)) {
          shadesWithCompletedTrimOut.add(link.project_shade_id);
        }
      });
    }

    // Count installed shades:
    // - Has installed=true in DB (manual toggle), OR
    // - Is linked to a wire drop with completed trim_out
    const installedShadesCount = (shades || []).filter(shade => {
      if (shadesWithCompletedTrimOut.has(shade.id)) return true;
      if (shade.installed === true) return true;
      return false;
    }).length;

    // ===== COMBINED CALCULATION =====
    const totalItems = totalWireDrops + totalEquipment + totalShades;
    if (totalItems === 0) return { percentage: 0, completed: 0, total: 0 };

    const completedItems = completedWireDropCount + installedEquipmentCount + installedShadesCount;
    const percentage = Math.round((completedItems / totalItems) * 100);

    console.log('[_milestoneCalculations] calculateTrimStages:', {
      totalWireDrops,
      completedWireDropCount,
      totalEquipment,
      installedEquipmentCount,
      totalShades,
      installedShadesCount,
      totalItems,
      completedItems,
      percentage
    });

    return { percentage, completed: completedItems, total: totalItems };
  } catch (error) {
    console.error('Error calculating trim stages:', error);
    return { percentage: 0, completed: 0, total: 0 };
  }
}

/**
 * Commissioning: % of wire drops with completed commission stage
 * Matches milestoneService.calculateCommissioningPercentage
 */
async function calculateCommissioning(projectId) {
  try {
    // Get all wire drops for this project
    const { data: wireDrops } = await supabase
      .from('wire_drops')
      .select('id')
      .eq('project_id', projectId);

    const totalWireDrops = (wireDrops || []).length;
    if (totalWireDrops === 0) return { percentage: 0, completed: 0, total: 0 };

    const wireDropIds = wireDrops.map(wd => wd.id);

    // Get wire drops with completed commission stages
    const { data: commissionStages } = await supabase
      .from('wire_drop_stages')
      .select('wire_drop_id')
      .eq('stage_type', 'commission')
      .eq('completed', true)
      .in('wire_drop_id', wireDropIds);

    const completedCount = (commissionStages || []).length;
    const percentage = Math.round((completedCount / totalWireDrops) * 100);

    return { percentage, completed: completedCount, total: totalWireDrops };
  } catch (error) {
    console.error('Error calculating commissioning:', error);
    return { percentage: 0, completed: 0, total: 0 };
  }
}

module.exports = {
  calculateAllMilestones,
  calculatePlanningDesign,
  calculatePrewireOrders,
  calculatePrewireReceiving,
  calculatePrewireStages,
  calculateTrimOrders,
  calculateTrimReceiving,
  calculateTrimStages,
  calculateCommissioning
};
