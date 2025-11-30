import { supabase } from '../lib/supabase';

class MilestoneService {
  // Milestone type definitions
  MILESTONE_TYPES = {
    PLANNING_DESIGN: 'planning_design',
    PREWIRE_ORDERS: 'prewire_orders',
    PREWIRE_RECEIVING: 'prewire_receiving',
    PREWIRE: 'prewire',
    PREWIRE_PHASE: 'prewire_phase',
    TRIM_ORDERS: 'trim_orders',
    TRIM_RECEIVING: 'trim_receiving',
    TRIM: 'trim',
    TRIM_PHASE: 'trim_phase',
    COMMISSIONING: 'commissioning',
    HANDOFF_TRAINING: 'handoff_training',
    // Legacy (deprecated)
    PREWIRE_PREP: 'prewire_prep',
    TRIM_PREP: 'trim_prep'
  };

  // Milestone labels for display
  MILESTONE_LABELS = {
    planning_design: 'Planning & Design',
    prewire_orders: 'Prewire Orders',
    prewire_receiving: 'Prewire Receiving',
    prewire: 'Prewire Stages',
    prewire_phase: 'Prewire Phase',
    trim_orders: 'Trim Orders',
    trim_receiving: 'Trim Receiving',
    trim: 'Trim Stages',
    trim_phase: 'Trim Phase',
    commissioning: 'Commissioning',
    handoff_training: 'Handoff / Training',
    // Legacy
    prewire_prep: 'Prewire Prep',
    trim_prep: 'Trim Prep'
  };

  // Milestone requirements/helpers
  MILESTONE_HELPERS = {
    planning_design: 'Complete when Lucid diagram and Portal proposal URLs exist',
    prewire_orders: 'Count of items with ordered_quantity > 0',
    prewire_receiving: 'Count of items fully received (received >= planned) - includes PO and inventory items',
    prewire: '% = (Wire drops with prewire photo) / (Total wire drops)',
    prewire_phase: 'Rollup: Orders 25% + Receiving 25% + Stages 50%',
    trim_orders: 'Count of items with ordered_quantity > 0',
    trim_receiving: 'Count of items fully received (received >= planned) - includes PO and inventory items',
    trim: '% = (Equipment installed via wire drop trim_out OR manual toggle) / (Total trim-phase equipment)',
    trim_phase: 'Rollup: Orders 25% + Receiving 25% + Stages 50%',
    commissioning: 'Complete when equipment is attached in head end field',
    handoff_training: 'Manual completion checkbox',
    // Legacy
    prewire_prep: 'DEPRECATED: Use prewire_orders and prewire_receiving',
    trim_prep: 'DEPRECATED: Use trim_orders and trim_receiving'
  };

  /**
   * Calculate Planning & Design percentage
   * 100% when both wiring_diagram_url and portal_proposal_url exist
   */
  async calculatePlanningDesignPercentage(projectId) {
    try {
      const { data: project, error } = await supabase
        .from('projects')
        .select('wiring_diagram_url, portal_proposal_url')
        .eq('id', projectId)
        .single();

      if (error) throw error;

      const hasLucid = Boolean(project?.wiring_diagram_url);
      const hasProposal = Boolean(project?.portal_proposal_url);

      if (hasLucid && hasProposal) return 100;
      if (hasLucid || hasProposal) return 50;
      return 0;
    } catch (error) {
      console.error('Error calculating planning & design percentage:', error);
      return 0;
    }
  }

  /**
   * Calculate Prewire Orders percentage
   * NEW METHOD: Counts parts accounted for (on hand + ordered from submitted POs)
   * 100% when ALL required prewire parts are accounted for
   */
  async calculatePrewireOrdersPercentage(projectId) {
    try {
      // Load equipment with global_part data
      const { data: equipment, error } = await supabase
        .from('project_equipment')
        .select(`
          id,
          planned_quantity,
          global_part:global_part_id (
            required_for_prewire,
            quantity_on_hand
          )
        `)
        .eq('project_id', projectId)
        .neq('equipment_type', 'Labor'); // Exclude labor items

      if (error) throw error;

      // Load ALL purchase orders to calculate quantity_ordered (submitted POs only)
      const { data: pos, error: poError } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          status,
          items:purchase_order_items(
            project_equipment_id,
            quantity_ordered
          )
        `)
        .eq('project_id', projectId);

      if (poError) throw poError;

      // Create map of submitted PO quantities (exclude drafts)
      const submittedPOMap = new Map();
      (pos || []).forEach(po => {
        if (['submitted', 'confirmed', 'partially_received', 'received'].includes(po.status)) {
          (po.items || []).forEach(item => {
            const existing = submittedPOMap.get(item.project_equipment_id) || 0;
            submittedPOMap.set(item.project_equipment_id, existing + (item.quantity_ordered || 0));
          });
        }
      });

      // Filter to prewire items (via global_parts.required_for_prewire)
      const prewireItems = (equipment || []).filter(item =>
        item.global_part?.required_for_prewire === true
      );

      if (prewireItems.length === 0) {
        return { percentage: 0, itemCount: 0, totalItems: 0, partsAccountedFor: 0, totalParts: 0 };
      }

      // Calculate parts accounted for (on hand + ordered from submitted POs)
      let totalPartsRequired = 0;
      let partsAccountedFor = 0;

      prewireItems.forEach(item => {
        const required = item.planned_quantity || 0;
        const onHand = item.global_part?.quantity_on_hand || 0;
        const ordered = submittedPOMap.get(item.id) || 0;

        totalPartsRequired += required;
        // Count parts we have OR have ordered (but don't double count)
        partsAccountedFor += Math.min(required, onHand + ordered);
      });

      const percentage = totalPartsRequired > 0
        ? Math.round((partsAccountedFor / totalPartsRequired) * 100)
        : 0;

      return {
        percentage,
        itemCount: prewireItems.length,
        totalItems: prewireItems.length,
        partsAccountedFor, // NEW: actual parts count
        totalParts: totalPartsRequired // NEW: total parts required
      };
    } catch (error) {
      console.error('Error calculating prewire orders percentage:', error);
      return { percentage: 0, itemCount: 0, totalItems: 0, partsAccountedFor: 0, totalParts: 0 };
    }
  }

  /**
   * Calculate Prewire Receiving percentage
   * 100% when ALL prewire items are fully received (received_quantity >= planned_quantity)
   * Includes items from both POs and inventory
   */
  async calculatePrewireReceivingPercentage(projectId) {
    try {
      const { data: equipment, error } = await supabase
        .from('project_equipment')
        .select(`
          id,
          planned_quantity,
          ordered_quantity,
          received_quantity,
          global_part:global_part_id (required_for_prewire)
        `)
        .eq('project_id', projectId)
        .neq('equipment_type', 'Labor'); // Exclude labor items

      if (error) throw error;

      // Filter to prewire items that have planned quantities
      // This includes items from POs AND inventory
      const prewireItems = (equipment || []).filter(item =>
        item.global_part?.required_for_prewire === true &&
        (item.planned_quantity || 0) > 0
      );

      if (prewireItems.length === 0) {
        return { percentage: 0, itemCount: 0, totalItems: 0 };
      }

      // Count items where received >= planned (fully received)
      // This works for both PO items and inventory items
      const itemsReceived = prewireItems.filter(item =>
        (item.received_quantity || 0) >= (item.planned_quantity || 0)
      ).length;
      const totalItems = prewireItems.length;
      const percentage = Math.round((itemsReceived / totalItems) * 100);

      return { percentage, itemCount: itemsReceived, totalItems };
    } catch (error) {
      console.error('Error calculating prewire receiving percentage:', error);
      return { percentage: 0, itemCount: 0, totalItems: 0 };
    }
  }

  /**
   * DEPRECATED: Calculate Prewire Prep percentage (combined orders + receiving)
   * Use calculatePrewireOrdersPercentage and calculatePrewireReceivingPercentage instead
   */
  async calculatePrewirePrepPercentage(projectId) {
    try {
      const orders = await this.calculatePrewireOrdersPercentage(projectId);
      const receiving = await this.calculatePrewireReceivingPercentage(projectId);

      // Simple average for backwards compatibility
      const percentage = Math.round((orders.percentage + receiving.percentage) / 2);
      return percentage;
    } catch (error) {
      console.error('Error calculating prewire prep percentage:', error);
      return 0;
    }
  }

  /**
   * Calculate Prewire percentage
   * (Wire drops with prewire stage completed) / (Total wire drops) × 100
   */
  async calculatePrewirePercentage(projectId) {
    try {
      // Get all wire drops for this project
      const { data: wireDrops, error: dropError } = await supabase
        .from('wire_drops')
        .select('id')
        .eq('project_id', projectId);

      if (dropError) throw dropError;

      const totalDrops = wireDrops?.length || 0;
      if (totalDrops === 0) return 0;

      // Get prewire stages that are completed (have photo)
      const { data: stages, error: stageError } = await supabase
        .from('wire_drop_stages')
        .select('wire_drop_id, completed, photo_url, wire_drops!inner(project_id)')
        .eq('stage_type', 'prewire')
        .eq('wire_drops.project_id', projectId);

      if (stageError) throw stageError;

      // Count completed prewire stages (either marked completed OR has photo)
      const completedStages = (stages || []).filter(stage => 
        stage.completed === true || Boolean(stage.photo_url)
      );

      const percentage = Math.round((completedStages.length / totalDrops) * 100);
      return percentage;
    } catch (error) {
      console.error('Error calculating prewire percentage:', error);
      return 0;
    }
  }

  /**
   * Calculate Trim Orders percentage
   * NEW METHOD: Counts parts accounted for (on hand + ordered from submitted POs)
   * 100% when ALL required trim parts are accounted for
   */
  async calculateTrimOrdersPercentage(projectId) {
    try {
      // Load equipment with global_part data
      const { data: equipment, error } = await supabase
        .from('project_equipment')
        .select(`
          id,
          planned_quantity,
          global_part:global_part_id (
            required_for_prewire,
            quantity_on_hand
          )
        `)
        .eq('project_id', projectId)
        .neq('equipment_type', 'Labor'); // Exclude labor items

      if (error) throw error;

      // Load ALL purchase orders to calculate quantity_ordered (submitted POs only)
      const { data: pos, error: poError } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          status,
          items:purchase_order_items(
            project_equipment_id,
            quantity_ordered
          )
        `)
        .eq('project_id', projectId);

      if (poError) throw poError;

      // Create map of submitted PO quantities (exclude drafts)
      const submittedPOMap = new Map();
      (pos || []).forEach(po => {
        if (['submitted', 'confirmed', 'partially_received', 'received'].includes(po.status)) {
          (po.items || []).forEach(item => {
            const existing = submittedPOMap.get(item.project_equipment_id) || 0;
            submittedPOMap.set(item.project_equipment_id, existing + (item.quantity_ordered || 0));
          });
        }
      });

      // Filter to trim items (NOT required for prewire via global_parts)
      const trimItems = (equipment || []).filter(item =>
        item.global_part?.required_for_prewire !== true
      );

      if (trimItems.length === 0) {
        return { percentage: 0, itemCount: 0, totalItems: 0, partsAccountedFor: 0, totalParts: 0 };
      }

      // Calculate parts accounted for (on hand + ordered from submitted POs)
      let totalPartsRequired = 0;
      let partsAccountedFor = 0;

      trimItems.forEach(item => {
        const required = item.planned_quantity || 0;
        const onHand = item.global_part?.quantity_on_hand || 0;
        const ordered = submittedPOMap.get(item.id) || 0;

        totalPartsRequired += required;
        // Count parts we have OR have ordered (but don't double count)
        partsAccountedFor += Math.min(required, onHand + ordered);
      });

      const percentage = totalPartsRequired > 0
        ? Math.round((partsAccountedFor / totalPartsRequired) * 100)
        : 0;

      return {
        percentage,
        itemCount: trimItems.length,
        totalItems: trimItems.length,
        partsAccountedFor, // NEW: actual parts count
        totalParts: totalPartsRequired // NEW: total parts required
      };
    } catch (error) {
      console.error('Error calculating trim orders percentage:', error);
      return { percentage: 0, itemCount: 0, totalItems: 0, partsAccountedFor: 0, totalParts: 0 };
    }
  }

  /**
   * Calculate Trim Receiving percentage
   * 100% when ALL trim items are fully received (received_quantity >= planned_quantity)
   * Includes items from both POs and inventory
   */
  async calculateTrimReceivingPercentage(projectId) {
    try {
      const { data: equipment, error } = await supabase
        .from('project_equipment')
        .select(`
          id,
          planned_quantity,
          ordered_quantity,
          received_quantity,
          global_part:global_part_id (required_for_prewire)
        `)
        .eq('project_id', projectId)
        .neq('equipment_type', 'Labor'); // Exclude labor items

      if (error) throw error;

      // Filter to trim items that have planned quantities
      // This includes items from POs AND inventory
      const trimItems = (equipment || []).filter(item =>
        item.global_part?.required_for_prewire !== true &&
        (item.planned_quantity || 0) > 0
      );

      if (trimItems.length === 0) {
        return { percentage: 0, itemCount: 0, totalItems: 0 };
      }

      // Count items where received >= planned (fully received)
      // This works for both PO items and inventory items
      const itemsReceived = trimItems.filter(item =>
        (item.received_quantity || 0) >= (item.planned_quantity || 0)
      ).length;
      const totalItems = trimItems.length;
      const percentage = Math.round((itemsReceived / totalItems) * 100);

      return { percentage, itemCount: itemsReceived, totalItems };
    } catch (error) {
      console.error('Error calculating trim receiving percentage:', error);
      return { percentage: 0, itemCount: 0, totalItems: 0 };
    }
  }

  /**
   * DEPRECATED: Calculate Trim Prep percentage (combined orders + receiving)
   * Use calculateTrimOrdersPercentage and calculateTrimReceivingPercentage instead
   */
  async calculateTrimPrepPercentage(projectId) {
    try {
      const orders = await this.calculateTrimOrdersPercentage(projectId);
      const receiving = await this.calculateTrimReceivingPercentage(projectId);

      // Simple average for backwards compatibility
      const percentage = Math.round((orders.percentage + receiving.percentage) / 2);
      return percentage;
    } catch (error) {
      console.error('Error calculating trim prep percentage:', error);
      return 0;
    }
  }

  /**
   * Calculate Trim percentage
   * Based on equipment installed status for trim-phase equipment
   * Equipment is considered "installed" if:
   *   1. It has installed=true in the database (manual toggle for items without wire drops), OR
   *   2. It's linked to a wire drop that has trim_out stage completed
   * (Installed equipment) / (Total trim-phase equipment) × 100
   */
  async calculateTrimPercentage(projectId) {
    try {
      // Get all trim-phase equipment for this project (required_for_prewire = false)
      const { data: equipment, error: equipError } = await supabase
        .from('project_equipment')
        .select('id, installed, required_for_prewire')
        .eq('project_id', projectId)
        .eq('is_active', true);

      if (equipError) throw equipError;

      // Filter for trim-phase equipment (not required for prewire)
      const trimEquipment = (equipment || []).filter(item => item.required_for_prewire !== true);

      const totalItems = trimEquipment.length;
      if (totalItems === 0) return 0;

      // Get equipment IDs that are linked to wire drops with completed trim_out
      const trimEquipmentIds = trimEquipment.map(e => e.id);

      // Get all wire drop links for this equipment
      const { data: equipmentLinks } = await supabase
        .from('wire_drop_equipment_links')
        .select('project_equipment_id, wire_drop_id')
        .in('project_equipment_id', trimEquipmentIds);

      // Get unique wire drop IDs
      const wireDropIds = [...new Set((equipmentLinks || []).map(l => l.wire_drop_id))];

      // Get trim_out stages that are completed for these wire drops
      let completedWireDropIds = new Set();
      if (wireDropIds.length > 0) {
        const { data: trimStages } = await supabase
          .from('wire_drop_stages')
          .select('wire_drop_id, completed')
          .eq('stage_type', 'trim_out')
          .eq('completed', true)
          .in('wire_drop_id', wireDropIds);

        completedWireDropIds = new Set((trimStages || []).map(s => s.wire_drop_id));
      }

      // Build a set of equipment IDs that are linked to completed wire drops
      const equipmentWithCompletedTrimOut = new Set();
      (equipmentLinks || []).forEach(link => {
        if (completedWireDropIds.has(link.wire_drop_id)) {
          equipmentWithCompletedTrimOut.add(link.project_equipment_id);
        }
      });

      // Count installed equipment:
      // - Has installed=true in DB (manual toggle for wireless items), OR
      // - Is linked to a wire drop with completed trim_out
      const installedCount = trimEquipment.filter(item => {
        // Check if linked to completed wire drop
        if (equipmentWithCompletedTrimOut.has(item.id)) return true;
        // Check if manually marked installed (for items without wire drops)
        if (item.installed === true) return true;
        return false;
      }).length;

      const percentage = Math.round((installedCount / totalItems) * 100);
      return percentage;
    } catch (error) {
      console.error('Error calculating trim percentage:', error);
      return 0;
    }
  }

  /**
   * Calculate Commissioning percentage
   * 100% when equipment is attached to head-end room
   */
  async calculateCommissioningPercentage(projectId) {
    try {
      // Get head-end rooms for this project
      const { data: headEndRooms, error: roomError } = await supabase
        .from('project_rooms')
        .select('id')
        .eq('project_id', projectId)
        .eq('is_headend', true);

      if (roomError) throw roomError;

      if (!headEndRooms || headEndRooms.length === 0) return 0;

      const headEndRoomIds = headEndRooms.map(r => r.id);

      // Check if any equipment is assigned to head-end rooms
      const { data: equipment, error: equipError } = await supabase
        .from('project_equipment')
        .select('id, project_room_id')
        .eq('project_id', projectId)
        .in('project_room_id', headEndRoomIds);

      if (equipError) throw equipError;

      return (equipment && equipment.length > 0) ? 100 : 0;
    } catch (error) {
      console.error('Error calculating commissioning percentage:', error);
      return 0;
    }
  }

  /**
   * Calculate auto target date for prep milestones
   */
  calculatePrepTargetDate(workDate, daysBeforeWork = 14) {
    if (!workDate) return null;
    
    const date = new Date(workDate);
    date.setDate(date.getDate() - daysBeforeWork);
    return date.toISOString().split('T')[0];
  }

  /**
   * Calculate Prewire Phase rollup percentage
   * Weighted average: (Orders × 25%) + (Receiving × 25%) + (Stages × 50%)
   */
  async calculatePrewirePhasePercentage(projectId) {
    try {
      const [orders, receiving, stages] = await Promise.all([
        this.calculatePrewireOrdersPercentage(projectId),
        this.calculatePrewireReceivingPercentage(projectId),
        this.calculatePrewirePercentage(projectId)
      ]);

      // Weighted average: Orders 25%, Receiving 25%, Stages 50%
      const rollup = Math.round(
        (orders.percentage * 0.25) +
        (receiving.percentage * 0.25) +
        (stages * 0.50)
      );

      return {
        percentage: rollup,
        orders,
        receiving,
        stages
      };
    } catch (error) {
      console.error('Error calculating prewire phase percentage:', error);
      return {
        percentage: 0,
        orders: { percentage: 0, itemCount: 0, totalItems: 0 },
        receiving: { percentage: 0, itemCount: 0, totalItems: 0 },
        stages: 0
      };
    }
  }

  /**
   * Calculate Trim Phase rollup percentage
   * Weighted average: (Orders × 25%) + (Receiving × 25%) + (Stages × 50%)
   */
  async calculateTrimPhasePercentage(projectId) {
    try {
      const [orders, receiving, stages] = await Promise.all([
        this.calculateTrimOrdersPercentage(projectId),
        this.calculateTrimReceivingPercentage(projectId),
        this.calculateTrimPercentage(projectId)
      ]);

      // Weighted average: Orders 25%, Receiving 25%, Stages 50%
      const rollup = Math.round(
        (orders.percentage * 0.25) +
        (receiving.percentage * 0.25) +
        (stages * 0.50)
      );

      return {
        percentage: rollup,
        orders,
        receiving,
        stages
      };
    } catch (error) {
      console.error('Error calculating trim phase percentage:', error);
      return {
        percentage: 0,
        orders: { percentage: 0, itemCount: 0, totalItems: 0 },
        receiving: { percentage: 0, itemCount: 0, totalItems: 0 },
        stages: 0
      };
    }
  }

  /**
   * Get pre-calculated milestone percentages from materialized view
   * HIGHLY OPTIMIZED: Single query instead of 10+ queries
   * Falls back to calculated method if view doesn't exist
   *
   * @param {string} projectId - Project UUID
   * @returns {Promise<Object>} Milestone percentages
   */
  async getAllPercentagesOptimized(projectId) {
    try {
      // Try to fetch from materialized view first
      const { data, error } = await supabase
        .from('project_milestone_percentages')
        .select('*')
        .eq('project_id', projectId)
        .single();

      if (error) {
        // View doesn't exist or other error - fall back to calculation
        console.warn('[Milestone] View not available, falling back to calculation:', error.message);
        return this.calculateAllPercentages(projectId);
      }

      if (!data) {
        // No data in view - fall back to calculation
        console.warn('[Milestone] No data in view for project, calculating...');
        return this.calculateAllPercentages(projectId);
      }

      // Transform view data to match expected format
      const result = {
        planning_design: data.planning_design_percentage,
        prewire_orders: {
          percentage: data.prewire_orders_percentage,
          itemCount: data.prewire_orders_count, // Legacy
          totalItems: data.prewire_orders_total, // Legacy
          partsAccountedFor: data.prewire_orders_count, // NEW: parts count
          totalParts: data.prewire_orders_total // NEW: total parts
        },
        prewire_receiving: {
          percentage: data.prewire_receiving_percentage,
          itemCount: data.prewire_receiving_count,
          totalItems: data.prewire_receiving_total
        },
        prewire: data.prewire_stages_percentage,
        prewire_phase: {
          percentage: data.prewire_phase_percentage,
          orders: {
            percentage: data.prewire_orders_percentage,
            itemCount: data.prewire_orders_count,
            totalItems: data.prewire_orders_total,
            partsAccountedFor: data.prewire_orders_count,
            totalParts: data.prewire_orders_total
          },
          receiving: {
            percentage: data.prewire_receiving_percentage,
            itemCount: data.prewire_receiving_count,
            totalItems: data.prewire_receiving_total
          },
          stages: data.prewire_stages_percentage
        },
        trim_orders: {
          percentage: data.trim_orders_percentage,
          itemCount: data.trim_orders_count, // Legacy
          totalItems: data.trim_orders_total, // Legacy
          partsAccountedFor: data.trim_orders_count, // NEW: parts count
          totalParts: data.trim_orders_total // NEW: total parts
        },
        trim_receiving: {
          percentage: data.trim_receiving_percentage,
          itemCount: data.trim_receiving_count,
          totalItems: data.trim_receiving_total
        },
        trim: data.trim_stages_percentage,
        trim_phase: {
          percentage: data.trim_phase_percentage,
          orders: {
            percentage: data.trim_orders_percentage,
            itemCount: data.trim_orders_count,
            totalItems: data.trim_orders_total,
            partsAccountedFor: data.trim_orders_count,
            totalParts: data.trim_orders_total
          },
          receiving: {
            percentage: data.trim_receiving_percentage,
            itemCount: data.trim_receiving_count,
            totalItems: data.trim_receiving_total
          },
          stages: data.trim_stages_percentage
        },
        commissioning: {
          percentage: data.commissioning_percentage,
          itemCount: data.commissioning_count,
          totalItems: data.commissioning_total
        },
        // Legacy compatibility
        prewire_prep: Math.round((data.prewire_orders_percentage + data.prewire_receiving_percentage) / 2),
        trim_prep: Math.round((data.trim_orders_percentage + data.trim_receiving_percentage) / 2),
        // Metadata
        _cachedAt: data.last_calculated_at,
        _fromCache: true
      };

      // Stage percentages (prewire/trim) can change more frequently than the materialized view refresh.
      // Recalculate them live so we always show the latest install progress.
      try {
        const [freshPrewire, freshTrim] = await Promise.all([
          this.calculatePrewirePercentage(projectId),
          this.calculateTrimPercentage(projectId)
        ]);

        if (typeof freshPrewire === 'number' && result.prewire !== freshPrewire) {
          result.prewire = freshPrewire;
          result.prewire_phase = {
            ...result.prewire_phase,
            stages: freshPrewire,
            percentage: Math.round(
              (result.prewire_phase.orders.percentage * 0.25) +
              (result.prewire_phase.receiving.percentage * 0.25) +
              (freshPrewire * 0.50)
            )
          };
          result._fromCache = false;
        }

        if (typeof freshTrim === 'number' && result.trim !== freshTrim) {
          result.trim = freshTrim;
          result.trim_phase = {
            ...result.trim_phase,
            stages: freshTrim,
            percentage: Math.round(
              (result.trim_phase.orders.percentage * 0.25) +
              (result.trim_phase.receiving.percentage * 0.25) +
              (freshTrim * 0.50)
            )
          };
          result._fromCache = false;
        }
      } catch (stageError) {
        console.warn('[Milestone] Failed to refresh stage percentages from live data:', stageError);
      }

      return result;
    } catch (error) {
      console.error('[Milestone] Error fetching from view, falling back:', error);
      return this.calculateAllPercentages(projectId);
    }
  }

  /**
   * Get pre-calculated milestones for MULTIPLE projects (batch)
   * SUPER OPTIMIZED: One query for all projects instead of 10+ per project
   *
   * @param {string[]} projectIds - Array of project UUIDs
   * @returns {Promise<Object>} Map of projectId → milestone percentages
   */
  async getAllPercentagesBatch(projectIds) {
    try {
      if (!projectIds || projectIds.length === 0) {
        return {};
      }

      // Fetch all projects in one query
      const { data, error } = await supabase
        .from('project_milestone_percentages')
        .select('*')
        .in('project_id', projectIds);

      if (error) {
        console.warn('[Milestone] Batch view query failed, falling back:', error.message);
        // Fall back to individual calculations
        const results = {};
        await Promise.all(projectIds.map(async (projectId) => {
          results[projectId] = await this.calculateAllPercentages(projectId);
        }));
        return results;
      }

      // Transform to map
      const results = {};
      data.forEach(row => {
        results[row.project_id] = {
          planning_design: row.planning_design_percentage,
          prewire_orders: {
            percentage: row.prewire_orders_percentage,
            itemCount: row.prewire_orders_count, // Legacy
            totalItems: row.prewire_orders_total, // Legacy
            partsAccountedFor: row.prewire_orders_count, // NEW: parts count
            totalParts: row.prewire_orders_total // NEW: total parts
          },
          prewire_receiving: {
            percentage: row.prewire_receiving_percentage,
            itemCount: row.prewire_receiving_count,
            totalItems: row.prewire_receiving_total
          },
          prewire: row.prewire_stages_percentage,
          prewire_phase: {
            percentage: row.prewire_phase_percentage,
            orders: {
              percentage: row.prewire_orders_percentage,
              itemCount: row.prewire_orders_count,
              totalItems: row.prewire_orders_total,
              partsAccountedFor: row.prewire_orders_count,
              totalParts: row.prewire_orders_total
            },
            receiving: {
              percentage: row.prewire_receiving_percentage,
              itemCount: row.prewire_receiving_count,
              totalItems: row.prewire_receiving_total
            },
            stages: row.prewire_stages_percentage
          },
          trim_orders: {
            percentage: row.trim_orders_percentage,
            itemCount: row.trim_orders_count, // Legacy
            totalItems: row.trim_orders_total, // Legacy
            partsAccountedFor: row.trim_orders_count, // NEW: parts count
            totalParts: row.trim_orders_total // NEW: total parts
          },
          trim_receiving: {
            percentage: row.trim_receiving_percentage,
            itemCount: row.trim_receiving_count,
            totalItems: row.trim_receiving_total
          },
          trim: row.trim_stages_percentage,
          trim_phase: {
            percentage: row.trim_phase_percentage,
            orders: {
              percentage: row.trim_orders_percentage,
              itemCount: row.trim_orders_count,
              totalItems: row.trim_orders_total,
              partsAccountedFor: row.trim_orders_count,
              totalParts: row.trim_orders_total
            },
            receiving: {
              percentage: row.trim_receiving_percentage,
              itemCount: row.trim_receiving_count,
              totalItems: row.trim_receiving_total
            },
            stages: row.trim_stages_percentage
          },
          commissioning: {
            percentage: row.commissioning_percentage,
            itemCount: row.commissioning_count,
            totalItems: row.commissioning_total
          },
          prewire_prep: Math.round((row.prewire_orders_percentage + row.prewire_receiving_percentage) / 2),
          trim_prep: Math.round((row.trim_orders_percentage + row.trim_receiving_percentage) / 2),
          _cachedAt: row.last_calculated_at,
          _fromCache: true
        };
      });

      return results;
    } catch (error) {
      console.error('[Milestone] Batch fetch error:', error);
      return {};
    }
  }

  /**
   * Refresh the materialized view
   * Call this after significant data changes (equipment updates, wire drop stages, etc.)
   *
   * @returns {Promise<void>}
   */
  async refreshMilestoneCache() {
    try {
      const { error } = await supabase.rpc('refresh_milestone_percentages');
      if (error) throw error;
      console.log('[Milestone] Cache refreshed successfully');
    } catch (error) {
      console.error('[Milestone] Failed to refresh cache:', error);
      throw error;
    }
  }

  /**
   * Calculate all milestone percentages for a project
   * OPTIMIZED: All 10 calculations run in parallel for maximum performance
   * Returns 8 individual gauges + 2 rollup gauges
   *
   * @deprecated Use getAllPercentagesOptimized() instead for better performance
   */
  async calculateAllPercentages(projectId) {
    try {
      // Run all calculations in parallel using Promise.all
      const [
        planning_design,
        prewire_orders,
        prewire_receiving,
        prewire,
        trim_orders,
        trim_receiving,
        trim,
        commissioning,
        prewire_phase,
        trim_phase
      ] = await Promise.all([
        this.calculatePlanningDesignPercentage(projectId),
        this.calculatePrewireOrdersPercentage(projectId),
        this.calculatePrewireReceivingPercentage(projectId),
        this.calculatePrewirePercentage(projectId),
        this.calculateTrimOrdersPercentage(projectId),
        this.calculateTrimReceivingPercentage(projectId),
        this.calculateTrimPercentage(projectId),
        this.calculateCommissioningPercentage(projectId),
        this.calculatePrewirePhasePercentage(projectId),
        this.calculateTrimPhasePercentage(projectId)
      ]);

      return {
        planning_design,
        prewire_orders,
        prewire_receiving,
        prewire,
        prewire_phase,
        trim_orders,
        trim_receiving,
        trim,
        trim_phase,
        commissioning,
        // Legacy compatibility
        prewire_prep: Math.round((prewire_orders.percentage + prewire_receiving.percentage) / 2),
        trim_prep: Math.round((trim_orders.percentage + trim_receiving.percentage) / 2)
      };
    } catch (error) {
      console.error('Error calculating all percentages:', error);
      return {
        planning_design: 0,
        prewire_orders: { percentage: 0, itemCount: 0, totalItems: 0 },
        prewire_receiving: { percentage: 0, itemCount: 0, totalItems: 0 },
        prewire: 0,
        prewire_phase: { percentage: 0, orders: { percentage: 0, itemCount: 0, totalItems: 0 }, receiving: { percentage: 0, itemCount: 0, totalItems: 0 }, stages: 0 },
        trim_orders: { percentage: 0, itemCount: 0, totalItems: 0 },
        trim_receiving: { percentage: 0, itemCount: 0, totalItems: 0 },
        trim: 0,
        trim_phase: { percentage: 0, orders: { percentage: 0, itemCount: 0, totalItems: 0 }, receiving: { percentage: 0, itemCount: 0, totalItems: 0 }, stages: 0 },
        commissioning: 0,
        prewire_prep: 0,
        trim_prep: 0
      };
    }
  }

  /**
   * Get all milestones for a project
   */
  async getProjectMilestones(projectId) {
    try {
      const { data, error } = await supabase
        .from('project_milestone_status')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order');

      if (error) throw error;
      
      // If no milestones exist, create default set
      if (!data || data.length === 0) {
        await this.initializeProjectMilestones(projectId);
        
        // Fetch again after initialization
        const { data: newData, error: fetchError } = await supabase
          .from('project_milestone_status')
          .select('*')
          .eq('project_id', projectId)
          .order('sort_order');
          
        if (fetchError) throw fetchError;
        return newData || [];
      }
      
      return data;
    } catch (error) {
      console.error('Error fetching milestones:', error);
      return [];
    }
  }

  /**
   * Initialize milestones for a project
   */
  async initializeProjectMilestones(projectId) {
    try {
      const milestones = Object.keys(this.MILESTONE_TYPES).map(key => ({
        project_id: projectId,
        milestone_type: this.MILESTONE_TYPES[key],
        percent_complete: 0,
        auto_calculated: this.MILESTONE_TYPES[key] === 'prewire_prep' || this.MILESTONE_TYPES[key] === 'trim_prep'
      }));

      // Use upsert to handle conflicts (insert or update)
      const { data, error } = await supabase
        .from('project_milestones')
        .upsert(milestones, {
          onConflict: 'project_id,milestone_type',
          ignoreDuplicates: false
        })
        .select();

      if (error) {
        console.error('Error initializing milestones:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Error in initializeProjectMilestones:', error);
      throw error;
    }
  }

  /**
   * Update a milestone
   */
  async updateMilestone(projectId, milestoneType, updates) {
    try {
      // Get current authenticated user
      const { data: { user } } = await supabase.auth.getUser();

      // Don't allow updating auto-calculated dates unless explicitly overriding
      if (updates.target_date &&
          (milestoneType === 'prewire_prep' || milestoneType === 'trim_prep') &&
          !updates.override_auto_calculate) {
        delete updates.target_date;
      }

      const { data, error } = await supabase
        .from('project_milestones')
        .upsert({
          project_id: projectId,
          milestone_type: milestoneType,
          ...updates,
          updated_by: user?.id,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'project_id,milestone_type',
          ignoreDuplicates: false
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating milestone:', error);
      throw error;
    }
  }

  /**
   * Check and update milestone completion
   */
  async checkMilestoneCompletion(projectId, milestoneType) {
    try {
      // Call the database function to check completion
      const { data, error } = await supabase
        .rpc('check_milestone_completion', {
          p_project_id: projectId,
          p_milestone_type: milestoneType
        });

      if (error) throw error;

      // Update the milestone with the completion data
      if (data) {
        await supabase
          .from('project_milestones')
          .update({
            percent_complete: data.percent_complete,
            auto_completion_data: data.details,
            last_auto_check: new Date().toISOString(),
            // Set actual date if complete and not already set
            actual_date: data.is_complete ? new Date().toISOString().split('T')[0] : null
          })
          .eq('project_id', projectId)
          .eq('milestone_type', milestoneType);
      }

      return data;
    } catch (error) {
      console.error('Error checking milestone completion:', error);
      return null;
    }
  }

  /**
   * Check all milestones for a project
   */
  async checkAllMilestones(projectId) {
    const milestoneTypes = Object.values(this.MILESTONE_TYPES);
    const results = {};

    for (const type of milestoneTypes) {
      results[type] = await this.checkMilestoneCompletion(projectId, type);
    }

    return results;
  }

  /**
   * Update milestone dates (handles dependent dates automatically)
   */
  async updateMilestoneDate(projectId, milestoneType, targetDate = undefined, actualDate = undefined) {
    try {
      // Get current authenticated user
      const { data: { user } } = await supabase.auth.getUser();

      const updates = {};

      // Only update target_date if explicitly provided
      if (targetDate !== undefined) {
        updates.target_date = targetDate || null;
      }

      // Only update actual_date if explicitly provided
      if (actualDate !== undefined) {
        updates.actual_date = actualDate || null;
      }

      // If no updates, return early
      if (Object.keys(updates).length === 0) {
        console.warn('No date updates provided');
        return null;
      }

      // Check if the milestone already exists
      const { data: existing } = await supabase
        .from('project_milestones')
        .select('id')
        .eq('project_id', projectId)
        .eq('milestone_type', milestoneType)
        .single();

      let data, error;

      if (existing) {
        // Update existing milestone
        ({ data, error } = await supabase
          .from('project_milestones')
          .update({
            ...updates,
            updated_by: user?.id,
            updated_at: new Date().toISOString()
          })
          .eq('project_id', projectId)
          .eq('milestone_type', milestoneType)
          .select()
          .single());
      } else {
        // Insert new milestone
        ({ data, error } = await supabase
          .from('project_milestones')
          .insert({
            project_id: projectId,
            milestone_type: milestoneType,
            ...updates,
            percent_complete: 0,
            auto_calculated: milestoneType === 'prewire_prep' || milestoneType === 'trim_prep',
            updated_by: user?.id
          })
          .select()
          .single());
      }

      if (error) throw error;

      // Auto-update dependent prep milestones when work dates change
      if (milestoneType === 'prewire' && actualDate !== undefined && actualDate) {
        // Update Prewire Prep target date to 2 weeks before Prewire actual date
        const prepTargetDate = this.calculatePrepTargetDate(actualDate, 14);
        if (prepTargetDate) {
          await supabase
            .from('project_milestones')
            .upsert({
              project_id: projectId,
              milestone_type: 'prewire_prep',
              target_date: prepTargetDate,
              auto_calculated: true,
              updated_by: user?.id,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'project_id,milestone_type',
              ignoreDuplicates: false
            });
        }
      } else if (milestoneType === 'trim' && actualDate !== undefined && actualDate) {
        // Update Trim Prep target date to 2 weeks before Trim actual date
        const prepTargetDate = this.calculatePrepTargetDate(actualDate, 14);
        if (prepTargetDate) {
          await supabase
            .from('project_milestones')
            .upsert({
              project_id: projectId,
              milestone_type: 'trim_prep',
              target_date: prepTargetDate,
              auto_calculated: true,
              updated_by: user?.id,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'project_id,milestone_type',
              ignoreDuplicates: false
            });
        }
      }

      return data;
    } catch (error) {
      console.error('Error updating milestone date:', error);
      throw error;
    }
  }

  /**
   * Toggle manual completion for handoff/training
   */
  async toggleManualCompletion(projectId, milestoneType, isComplete) {
    try {
      // Get current authenticated user
      const { data: { user } } = await supabase.auth.getUser();

      const updates = {
        completed_manually: isComplete,
        percent_complete: isComplete ? 100 : 0,
        updated_by: user?.id
      };

      if (isComplete && !updates.actual_date) {
        updates.actual_date = new Date().toISOString().split('T')[0];
      } else if (!isComplete) {
        updates.actual_date = null;
      }

      const { data, error } = await supabase
        .from('project_milestones')
        .update(updates)
        .eq('project_id', projectId)
        .eq('milestone_type', milestoneType)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error toggling manual completion:', error);
      throw error;
    }
  }

  /**
   * Auto-complete prep milestones when all items are ordered and received
   * Call this after PO updates to check if prep milestones should be marked complete
   * - Prewire Prep: completes when all prewire items are ORDERED (100%) AND RECEIVED (100%)
   * - Trim Prep: completes when all trim items are ORDERED (100%) AND RECEIVED (100%)
   */
  async autoCompletePrepMilestones(projectId) {
    console.log('🚨 [Milestone] autoCompletePrepMilestones CALLED for project:', projectId);
    try {
      const completionDate = new Date().toISOString().split('T')[0];
      let prewireCompleted = false;
      let trimCompleted = false;

      console.log('[Milestone] Fetching prewire orders and receiving percentages...');

      // Check PREWIRE: orders AND receiving must BOTH be 100%
      const [prewireOrders, prewireReceiving] = await Promise.all([
        this.calculatePrewireOrdersPercentage(projectId),
        this.calculatePrewireReceivingPercentage(projectId)
      ]);

      console.log('[Milestone] Prewire status:', {
        orders: prewireOrders.percentage,
        receiving: prewireReceiving.percentage
      });

      // If BOTH are 100%, auto-complete prewire_prep
      if (prewireOrders.percentage === 100 && prewireReceiving.percentage === 100) {
        console.log('[Milestone] ✓ Prewire prep conditions met - auto-completing...');

        // Get current authenticated user
        const { data: { user } } = await supabase.auth.getUser();

        // Single atomic update to mark milestone complete
        const { data, error } = await supabase
          .from('project_milestones')
          .upsert({
            project_id: projectId,
            milestone_type: 'prewire_prep',
            actual_date: completionDate,
            completed_manually: true,
            percent_complete: 100,
            updated_by: user?.id,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'project_id,milestone_type',
            ignoreDuplicates: false
          })
          .select()
          .single();

        if (error) {
          console.error('[Milestone] ❌ Failed to auto-complete prewire_prep:', error);
        } else {
          console.log('[Milestone] ✅ Auto-completed prewire_prep milestone');
          prewireCompleted = true;
        }
      }

      // Check TRIM: orders AND receiving must BOTH be 100%
      const [trimOrders, trimReceiving] = await Promise.all([
        this.calculateTrimOrdersPercentage(projectId),
        this.calculateTrimReceivingPercentage(projectId)
      ]);

      console.log('[Milestone] Trim status:', {
        orders: trimOrders.percentage,
        receiving: trimReceiving.percentage
      });

      // If BOTH are 100%, auto-complete trim_prep
      if (trimOrders.percentage === 100 && trimReceiving.percentage === 100) {
        console.log('[Milestone] ✓ Trim prep conditions met - auto-completing...');

        // Get current authenticated user
        const { data: { user } } = await supabase.auth.getUser();

        // Single atomic update to mark milestone complete
        const { data, error } = await supabase
          .from('project_milestones')
          .upsert({
            project_id: projectId,
            milestone_type: 'trim_prep',
            actual_date: completionDate,
            completed_manually: true,
            percent_complete: 100,
            updated_by: user?.id,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'project_id,milestone_type',
            ignoreDuplicates: false
          })
          .select()
          .single();

        if (error) {
          console.error('[Milestone] ❌ Failed to auto-complete trim_prep:', error);
        } else {
          console.log('[Milestone] ✅ Auto-completed trim_prep milestone');
          trimCompleted = true;
        }
      }

      console.log('[Milestone] ✅ autoCompletePrepMilestones completed successfully');
      return {
        prewirePrep: prewireCompleted,
        trimPrep: trimCompleted
      };
    } catch (error) {
      console.error('🚨 [Milestone] ERROR in autoCompletePrepMilestones:', error);
      console.error('🚨 [Milestone] Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      });
      throw error;
    }
  }

  /**
   * Get completion stats for a project
   */
  async getProjectCompletionStats(projectId) {
    try {
      const milestones = await this.getProjectMilestones(projectId);
      
      const stats = {
        total: milestones.length || 0,
        completed: 0,
        inProgress: 0,
        notStarted: 0,
        overallProgress: 0
      };

      let totalProgress = 0;
      
      milestones.forEach(milestone => {
        const progress = milestone.percent_complete || 0;
        totalProgress += progress;
        
        if (progress === 100) {
          stats.completed++;
        } else if (progress > 0) {
          stats.inProgress++;
        } else {
          stats.notStarted++;
        }
      });

      if (stats.total > 0) {
        stats.overallProgress = Math.round(totalProgress / stats.total);
      }

      return stats;
    } catch (error) {
      console.error('Error getting completion stats:', error);
      return {
        total: 0,
        completed: 0,
        inProgress: 0,
        notStarted: 0,
        overallProgress: 0
      };
    }
  }

  /**
   * Format milestone for display
   */
  formatMilestone(milestone) {
    const isOverdue = milestone.target_date && 
                      !milestone.actual_date && 
                      new Date(milestone.target_date) < new Date();
    
    const status = milestone.percent_complete === 100 ? 'complete' :
                   isOverdue ? 'overdue' :
                   milestone.target_date ? 'scheduled' :
                   'not_set';
    
    return {
      ...milestone,
      label: this.MILESTONE_LABELS[milestone.milestone_type],
      helper: this.MILESTONE_HELPERS[milestone.milestone_type],
      status,
      isOverdue,
      isAutoCalculated: milestone.auto_calculated,
      canEditDate: milestone.milestone_type !== 'prewire_prep' && 
                   milestone.milestone_type !== 'trim_prep'
    };
  }

  /**
   * Subscribe to milestone changes
   */
  subscribeMilestoneChanges(projectId, callback) {
    const subscription = supabase
      .channel(`milestones:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_milestones',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          callback(payload);
        }
      )
      .subscribe();

    return subscription;
  }
}

export const milestoneService = new MilestoneService();
