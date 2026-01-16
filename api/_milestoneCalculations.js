/**
 * Shared Milestone Calculation Module
 *
 * This is the SINGLE SOURCE OF TRUTH for all milestone percentage calculations.
 * Used by:
 *   - api/project-report/generate.js (report generation)
 *   - api/milestone-percentages.js (API endpoint)
 *   - Future: Replace duplicate code in src/services/milestoneService.js
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
  const prewirePhase = Math.round(
    prewireOrders.percentage * 0.25 +
    prewireReceiving.percentage * 0.25 +
    prewireStages.percentage * 0.50
  );

  // Calculate Trim metrics
  const trimOrders = await calculateTrimOrders(projectId);
  const trimReceiving = await calculateTrimReceiving(projectId);
  const trimStages = await calculateTrimStages(projectId);

  // Calculate Trim Phase rollup (25% orders + 25% receiving + 50% stages)
  const trimPhase = Math.round(
    trimOrders.percentage * 0.25 +
    trimReceiving.percentage * 0.25 +
    trimStages.percentage * 0.50
  );

  // Calculate Commissioning
  const commissioning = await calculateCommissioning(projectId);

  return {
    // Individual metrics
    planning_design: planningDesign.percentage,
    prewire_orders: prewireOrders.percentage,
    prewire_receiving: prewireReceiving.percentage,
    prewire: prewireStages.percentage,
    trim_orders: trimOrders.percentage,
    trim_receiving: trimReceiving.percentage,
    trim: trimStages.percentage,
    commissioning: commissioning.percentage,

    // Phase rollups
    prewire_phase: {
      percentage: prewirePhase,
      orders: prewireOrders,
      receiving: prewireReceiving,
      stages: prewireStages
    },
    trim_phase: {
      percentage: trimPhase,
      orders: trimOrders,
      receiving: trimReceiving,
      stages: trimStages
    },

    // Legacy aliases (for backwards compatibility)
    planningDesign,
    prewireOrders,
    prewireReceiving,
    prewireStages,
    prewirePhase,
    trimOrders,
    trimReceiving,
    trimStages,
    trimPhase
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
 * Prewire Stages: % of wire drops with prewire photo
 */
async function calculatePrewireStages(projectId) {
  try {
    const { data: wireDrops } = await supabase
      .from('wire_drops')
      .select('id')
      .eq('project_id', projectId);

    const { data: stages } = await supabase
      .from('wire_drop_stages')
      .select('wire_drop_id, photo_url')
      .eq('stage_type', 'prewire')
      .in('wire_drop_id', (wireDrops || []).map(w => w.id));

    const total = wireDrops?.length || 0;
    const completed = (stages || []).filter(s => s.photo_url).length;

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { percentage, completed, total };
  } catch (error) {
    console.error('Error calculating prewire stages:', error);
    return { percentage: 0, completed: 0, total: 0 };
  }
}

/**
 * Trim Orders: % of trim parts with submitted POs
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

    if (trimItems.length === 0) {
      return { percentage: 0, ordered: 0, total: 0 };
    }

    let totalParts = 0;
    let orderedParts = 0;

    trimItems.forEach(item => {
      const required = item.planned_quantity || 0;
      const ordered = submittedPOMap.get(item.id) || 0;
      totalParts += required;
      orderedParts += Math.min(required, ordered);
    });

    const percentage = totalParts > 0 ? Math.round((orderedParts / totalParts) * 100) : 0;
    return { percentage, ordered: orderedParts, total: totalParts };
  } catch (error) {
    console.error('Error calculating trim orders:', error);
    return { percentage: 0, ordered: 0, total: 0 };
  }
}

/**
 * Trim Receiving: % of trim parts fully received
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

    const trimItems = (equipment || []).filter(item =>
      item.global_part?.required_for_prewire !== true &&
      (item.planned_quantity || 0) > 0
    );

    if (trimItems.length === 0) {
      return { percentage: 0, received: 0, total: 0 };
    }

    let totalParts = 0;
    let receivedParts = 0;

    trimItems.forEach(item => {
      const required = item.planned_quantity || 0;
      const received = item.received_quantity || 0;
      totalParts += required;
      receivedParts += Math.min(required, received);
    });

    const percentage = totalParts > 0 ? Math.round((receivedParts / totalParts) * 100) : 0;
    return { percentage, received: receivedParts, total: totalParts };
  } catch (error) {
    console.error('Error calculating trim receiving:', error);
    return { percentage: 0, received: 0, total: 0 };
  }
}

/**
 * Trim Stages: % of equipment installed via wire drops
 */
async function calculateTrimStages(projectId) {
  try {
    // Get all trim-phase equipment
    const { data: equipment } = await supabase
      .from('project_equipment')
      .select(`
        id,
        planned_quantity,
        installed_quantity,
        global_part:global_part_id (required_for_prewire)
      `)
      .eq('project_id', projectId)
      .neq('equipment_type', 'Labor');

    const trimItems = (equipment || []).filter(item =>
      item.global_part?.required_for_prewire !== true &&
      (item.planned_quantity || 0) > 0
    );

    if (trimItems.length === 0) {
      return { percentage: 0, installed: 0, total: 0 };
    }

    let totalParts = 0;
    let installedParts = 0;

    trimItems.forEach(item => {
      const required = item.planned_quantity || 0;
      const installed = item.installed_quantity || 0;
      totalParts += required;
      installedParts += Math.min(required, installed);
    });

    const percentage = totalParts > 0 ? Math.round((installedParts / totalParts) * 100) : 0;
    return { percentage, installed: installedParts, total: totalParts };
  } catch (error) {
    console.error('Error calculating trim stages:', error);
    return { percentage: 0, installed: 0, total: 0 };
  }
}

/**
 * Commissioning: % of wire drops with commission photo
 */
async function calculateCommissioning(projectId) {
  try {
    const { data: wireDrops } = await supabase
      .from('wire_drops')
      .select('id')
      .eq('project_id', projectId);

    const { data: stages } = await supabase
      .from('wire_drop_stages')
      .select('wire_drop_id, photo_url')
      .eq('stage_type', 'commission')
      .in('wire_drop_id', (wireDrops || []).map(w => w.id));

    const total = wireDrops?.length || 0;
    const completed = (stages || []).filter(s => s.photo_url).length;

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { percentage, completed, total };
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
