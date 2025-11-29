/**
 * Purchase Order Generator Service
 *
 * Handles the complete PO generation workflow:
 * 1. Groups equipment by milestone and supplier (using fuzzy matching)
 * 2. Generates PO with auto-number (ProjectName-PO-YYYY-NNN-SUP-NNN)
 * 3. Creates PO records in database
 * 4. Links equipment to PO
 * 5. Updates equipment ordered quantities
 * 6. Prepares data for PDF/CSV export
 */

import { supabase } from '../lib/supabase';
import { fuzzyMatchService } from '../utils/fuzzyMatchService';

class POGeneratorService {
  /**
   * Get equipment grouped by milestone and supplier
   * Uses fuzzy matching to link CSV supplier names to database suppliers
   *
   * @param {string} projectId - Project UUID
   * @param {string} milestoneStage - 'prewire_prep' or 'trim_prep'
   * @returns {Object} Grouped equipment data
   */
  async getEquipmentGroupedForPO(projectId, milestoneStage) {
    try {
      // Get all equipment for this project with global_part data
      const { data: equipment, error } = await supabase
        .from('project_equipment')
        .select(`
          *,
          project:projects(name, id),
          global_part:global_part_id(required_for_prewire)
        `)
        .eq('project_id', projectId);

      if (error) throw error;

      // Filter by milestone stage based on required_for_prewire
      let filteredEquipment = equipment;
      if (milestoneStage === 'prewire_prep') {
        filteredEquipment = equipment.filter(item => item.global_part?.required_for_prewire === true);
      } else if (milestoneStage === 'trim_prep') {
        filteredEquipment = equipment.filter(item => item.global_part?.required_for_prewire !== true);
      }

      // Group by supplier name from CSV
      const grouped = {};

      for (const item of filteredEquipment) {
        const supplierName = item.supplier || 'Unassigned';

        if (!grouped[supplierName]) {
          grouped[supplierName] = {
            csvName: supplierName,
            supplier: null,
            matchConfidence: 0,
            equipment: [],
            totalCost: 0,
            totalItems: 0,
            needsReview: false
          };
        }

        grouped[supplierName].equipment.push(item);
        const qty = item.planned_quantity || item.quantity || 0;
        grouped[supplierName].totalCost += (item.unit_cost || 0) * qty;
        grouped[supplierName].totalItems += qty;
      }

      // Perform fuzzy matching for each supplier
      const supplierNames = Object.keys(grouped).filter(name => name !== 'Unassigned');
      const matchResults = await fuzzyMatchService.batchMatchSuppliers(supplierNames, 0.7);

      // Update grouped data with match results
      for (const match of matchResults.matched) {
        if (grouped[match.csvName]) {
          grouped[match.csvName].supplier = match.supplier;
          grouped[match.csvName].matchConfidence = match.confidence;
          grouped[match.csvName].matchStatus = 'matched';
        }
      }

      for (const needsReview of matchResults.needsReview) {
        if (grouped[needsReview.csvName]) {
          grouped[needsReview.csvName].suggestions = needsReview.suggestions;
          grouped[needsReview.csvName].matchConfidence = needsReview.confidence;
          grouped[needsReview.csvName].needsReview = true;
          grouped[needsReview.csvName].matchStatus = 'needs_review';
        }
      }

      for (const needsCreation of matchResults.needsCreation) {
        if (grouped[needsCreation.csvName]) {
          grouped[needsCreation.csvName].matchStatus = 'needs_creation';
          grouped[needsCreation.csvName].needsReview = true;
        }
      }

      return {
        grouped,
        stats: {
          totalVendors: Object.keys(grouped).length,
          matched: matchResults.matched.length,
          needsReview: matchResults.needsReview.length,
          needsCreation: matchResults.needsCreation.length
        }
      };
    } catch (error) {
      console.error('Error grouping equipment:', error);
      throw error;
    }
  }

  /**
   * Create supplier from CSV name (auto-create flow)
   *
   * @param {string} supplierName - Supplier name from CSV
   * @returns {Object} Created supplier
   */
  async createSupplierFromName(supplierName) {
    return await fuzzyMatchService.createSupplierFromCSV(supplierName);
  }

  /**
   * Generate a new PO for a supplier
   *
   * @param {Object} poData - PO data
   * @param {string} poData.projectId - Project UUID
   * @param {string} poData.supplierId - Supplier UUID
   * @param {string} poData.milestoneStage - 'prewire_prep' or 'trim_prep'
   * @param {Array<string>} equipmentIds - Array of equipment IDs to include
   * @param {string} createdBy - User identifier
   * @returns {Object} Created PO with items
   */
  async generatePO(poData, equipmentIds, createdBy = 'system') {
    const { projectId, supplierId, milestoneStage } = poData;

    try {
      // Step 1: Generate PO number (includes project name prefix)
      const { data: poNumber, error: poError } = await supabase
        .rpc('generate_po_number', {
          p_supplier_id: supplierId,
          p_project_id: projectId
        });

      if (poError) throw poError;

      // Step 2: Get equipment details
      const { data: equipment, error: equipError } = await supabase
        .from('project_equipment')
        .select('*')
        .in('id', equipmentIds);

      if (equipError) throw equipError;

      // Step 3: Calculate totals
      const subtotal = equipment.reduce((sum, item) => {
        const qty = item.planned_quantity || item.quantity || 0;
        return sum + ((item.unit_cost || 0) * qty);
      }, 0);

      // Extract shipping cost from equipment if there's a shipping line item
      const shippingItem = equipment.find(item =>
        item.description?.toLowerCase().includes('shipping') ||
        item.part_number?.toLowerCase().includes('ship')
      );
      const shippingQty = shippingItem ? (shippingItem.planned_quantity || shippingItem.quantity || 0) : 0;
      const shippingCost = shippingItem ? (shippingItem.unit_cost || 0) * shippingQty : 0;

      const subtotalBeforeShipping = subtotal - shippingCost;

      // Step 4: Get milestone dates for delivery calculation
      const { data: milestone, error: milestoneError } = await supabase
        .from('project_milestones')
        .select('target_date, actual_date')
        .eq('project_id', projectId)
        .eq('milestone_type', milestoneStage)
        .single();

      if (milestoneError) console.warn('Could not fetch milestone dates:', milestoneError);

      // Calculate requested delivery date (milestone target - 14 days)
      let requestedDeliveryDate = null;
      if (milestone?.target_date) {
        const targetDate = new Date(milestone.target_date);
        targetDate.setDate(targetDate.getDate() - 14); // 14 days before milestone
        requestedDeliveryDate = targetDate.toISOString().split('T')[0];
      }

      // Step 5: Create PO record
      const poRecord = {
        project_id: projectId,
        supplier_id: supplierId,
        po_number: poNumber,
        milestone_stage: milestoneStage,
        status: 'draft',
        order_date: new Date().toISOString().split('T')[0],
        requested_delivery_date: requestedDeliveryDate,
        subtotal: subtotalBeforeShipping,
        tax_amount: 0, // Manual entry
        shipping_cost: shippingCost,
        total_amount: subtotal,
        created_by: createdBy,
        internal_notes: `Auto-generated PO for ${milestoneStage.replace('_', ' ')}`
      };

      const { data: newPO, error: createError } = await supabase
        .from('purchase_orders')
        .insert([poRecord])
        .select()
        .single();

      if (createError) throw createError;

      // Step 6: Create PO line items
      const lineItems = equipment.map((item, index) => ({
        po_id: newPO.id,
        project_equipment_id: item.id,
        line_number: index + 1,
        quantity_ordered: item.planned_quantity || item.quantity || 1, // Use planned_quantity, fallback to quantity or 1
        unit_cost: item.unit_cost || 0,
        notes: item.notes || null
      }));

      const { data: createdItems, error: itemsError } = await supabase
        .from('purchase_order_items')
        .insert(lineItems)
        .select();

      if (itemsError) throw itemsError;

      // Step 7: Return complete PO data
      return {
        po: newPO,
        items: createdItems,
        equipment: equipment,
        stats: {
          totalItems: equipment.length,
          totalQuantity: equipment.reduce((sum, item) => {
            const qty = item.planned_quantity || item.quantity || 0;
            return sum + qty;
          }, 0),
          subtotal: subtotalBeforeShipping,
          shipping: shippingCost,
          total: subtotal
        }
      };
    } catch (error) {
      console.error('Error generating PO:', error);
      throw error;
    }
  }

  /**
   * Generate preview data for bulk PO creation
   * Shows what POs would be created without actually creating them
   *
   * @param {string} projectId - Project UUID
   * @param {string} milestoneStage - 'prewire_prep' or 'trim_prep'
   * @returns {Object} Preview data for confirmation
   */
  async generateBulkPOPreview(projectId, milestoneStage) {
    try {
      const { grouped, stats } = await this.getEquipmentGroupedForPO(projectId, milestoneStage);

      const preview = {
        milestoneStage,
        vendors: [],
        totals: {
          vendorCount: 0,
          itemCount: 0,
          totalCost: 0
        },
        warnings: []
      };

      for (const [csvName, groupData] of Object.entries(grouped)) {
        if (csvName === 'Unassigned') {
          preview.warnings.push(`${groupData.equipment.length} items have no supplier assigned`);
          continue;
        }

        if (groupData.matchStatus === 'needs_creation') {
          preview.warnings.push(`"${csvName}" will be created as a new supplier`);
        }

        if (groupData.matchStatus === 'needs_review') {
          preview.warnings.push(`"${csvName}" needs manual review (${(groupData.matchConfidence * 100).toFixed(0)}% confidence)`);
        }

        preview.vendors.push({
          csvName,
          supplierName: groupData.supplier?.name || csvName,
          supplierId: groupData.supplier?.id || null,
          matchStatus: groupData.matchStatus,
          matchConfidence: groupData.matchConfidence,
          itemCount: groupData.equipment.length,
          totalCost: groupData.totalCost,
          needsAction: groupData.needsReview
        });

        preview.totals.vendorCount++;
        preview.totals.itemCount += groupData.equipment.length;
        preview.totals.totalCost += groupData.totalCost;
      }

      return preview;
    } catch (error) {
      console.error('Error generating bulk preview:', error);
      throw error;
    }
  }

  /**
   * Generate all POs for a milestone stage
   * Auto-creates suppliers as needed
   *
   * @param {string} projectId - Project UUID
   * @param {string} milestoneStage - 'prewire_prep' or 'trim_prep'
   * @param {string} createdBy - User identifier
   * @returns {Object} Results with created POs and any errors
   */
  async generateBulkPOs(projectId, milestoneStage, createdBy = 'system') {
    try {
      const { grouped } = await this.getEquipmentGroupedForPO(projectId, milestoneStage);

      const results = {
        created: [],
        failed: [],
        suppliersCreated: []
      };

      for (const [csvName, groupData] of Object.entries(grouped)) {
        if (csvName === 'Unassigned') {
          results.failed.push({
            vendor: csvName,
            reason: 'No supplier assigned',
            items: groupData.equipment.length
          });
          continue;
        }

        try {
          let supplierId = groupData.supplier?.id;

          // Auto-create supplier if needed
          if (!supplierId && groupData.matchStatus === 'needs_creation') {
            const newSupplier = await this.createSupplierFromName(csvName);
            supplierId = newSupplier.id;
            results.suppliersCreated.push(newSupplier);
          }

          // Skip if still no supplier (shouldn't happen)
          if (!supplierId) {
            results.failed.push({
              vendor: csvName,
              reason: 'Could not create or match supplier',
              items: groupData.equipment.length
            });
            continue;
          }

          // Generate PO
          const equipmentIds = groupData.equipment.map(e => e.id);
          const poResult = await this.generatePO(
            { projectId, supplierId, milestoneStage },
            equipmentIds,
            createdBy
          );

          results.created.push({
            vendor: groupData.supplier?.name || csvName,
            po: poResult.po,
            items: poResult.items.length,
            total: poResult.stats.total
          });
        } catch (error) {
          results.failed.push({
            vendor: csvName,
            reason: error.message,
            items: groupData.equipment.length
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error generating bulk POs:', error);
      throw error;
    }
  }

  /**
   * Update PO status
   *
   * @param {string} poId - PO UUID
   * @param {string} newStatus - 'draft', 'submitted', 'received', 'cancelled'
   * @param {string} updatedBy - User identifier
   */
  async updatePOStatus(poId, newStatus, updatedBy = 'system') {
    try {
      const updateData = { status: newStatus };

      if (newStatus === 'submitted') {
        updateData.submitted_date = new Date().toISOString().split('T')[0];
        updateData.submitted_by = updatedBy;
      } else if (newStatus === 'received') {
        updateData.received_date = new Date().toISOString().split('T')[0];
        updateData.received_by = updatedBy;
      }

      const { data, error } = await supabase
        .from('purchase_orders')
        .update(updateData)
        .eq('id', poId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating PO status:', error);
      throw error;
    }
  }

  /**
   * Get PO with all related data (for export)
   *
   * @param {string} poId - PO UUID
   * @returns {Object} Complete PO data
   */
  async getPOForExport(poId) {
    try {
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          supplier:suppliers(*),
          project:projects(*),
          items:purchase_order_items(*)
        `)
        .eq('id', poId)
        .single();

      if (poError) throw poError;

      return po;
    } catch (error) {
      console.error('Error fetching PO for export:', error);
      throw error;
    }
  }

  /**
   * Delete a draft PO
   * Only allows deletion of draft POs
   *
   * @param {string} poId - PO UUID
   */
  async deleteDraftPO(poId) {
    try {
      // Check if PO is draft
      const { data: po, error: checkError } = await supabase
        .from('purchase_orders')
        .select('status')
        .eq('id', poId)
        .single();

      if (checkError) throw checkError;

      if (po.status !== 'draft') {
        throw new Error('Only draft POs can be deleted');
      }

      // Delete PO (items will cascade delete)
      const { error: deleteError } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', poId);

      if (deleteError) throw deleteError;

      return { success: true };
    } catch (error) {
      console.error('Error deleting draft PO:', error);
      throw error;
    }
  }

  /**
   * Get all POs for a project
   *
   * @param {string} projectId - Project UUID
   * @param {string} milestoneStage - Optional filter by milestone
   * @returns {Array} PO list with supplier info
   */
  async getProjectPOs(projectId, milestoneStage = null) {
    try {
      let query = supabase
        .from('purchase_orders')
        .select(`
          *,
          supplier:suppliers(name, short_code),
          items:purchase_order_items(id)
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (milestoneStage) {
        query = query.eq('milestone_stage', milestoneStage);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Add item count
      return data.map(po => ({
        ...po,
        itemCount: po.items?.length || 0
      }));
    } catch (error) {
      console.error('Error fetching project POs:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const poGeneratorService = new POGeneratorService();
export default poGeneratorService;
