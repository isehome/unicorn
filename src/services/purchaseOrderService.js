import { supabase } from '../lib/supabase';

class PurchaseOrderService {
  /**
   * Generate PO number via database function
   */
  async generatePONumber(supplierId) {
    try {
      const { data, error } = await supabase
        .rpc('generate_po_number', { p_supplier_id: supplierId });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error generating PO number:', error);
      throw error;
    }
  }

  /**
   * Create new purchase order with line items
   */
  async createPurchaseOrder(poData, lineItems) {
    try {
      // Get current authenticated user
      const { data: { user } } = await supabase.auth.getUser();

      // Generate PO number
      const poNumber = await this.generatePONumber(poData.supplier_id);

      // Create PO
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert([{
          project_id: poData.project_id,
          supplier_id: poData.supplier_id,
          po_number: poNumber,
          milestone_stage: poData.milestone_stage,
          status: poData.status || 'draft',
          order_date: poData.order_date || new Date().toISOString().split('T')[0],
          requested_delivery_date: poData.requested_delivery_date,
          expected_delivery_date: poData.expected_delivery_date,
          tax_amount: poData.tax_amount || 0,
          shipping_cost: poData.shipping_cost || 0,
          payment_method: poData.payment_method,
          ship_to_address: poData.ship_to_address,
          ship_to_contact: poData.ship_to_contact,
          ship_to_phone: poData.ship_to_phone,
          internal_notes: poData.internal_notes,
          supplier_notes: poData.supplier_notes,
          created_by: user?.id,
          updated_by: user?.id
        }])
        .select()
        .single();

      if (poError) {
        console.error('❌ Error creating PO:', {
          code: poError.code,
          message: poError.message,
          details: poError.details,
          hint: poError.hint,
          poData,
          poNumber
        });
        throw poError;
      }

      // Add line items
      if (lineItems && lineItems.length > 0) {
        const items = lineItems.map((item, index) => ({
          po_id: po.id,
          project_equipment_id: item.project_equipment_id,
          line_number: index + 1,
          quantity_ordered: item.quantity_ordered,
          unit_cost: item.unit_cost,
          expected_delivery_date: item.expected_delivery_date,
          notes: item.notes
        }));

        const { error: itemsError } = await supabase
          .from('purchase_order_items')
          .insert(items);

        if (itemsError) throw itemsError;
      }

      return await this.getPurchaseOrder(po.id);
    } catch (error) {
      console.error('Error creating purchase order:', error);
      throw error;
    }
  }

  /**
   * Get purchase order by ID with full details
   */
  async getPurchaseOrder(poId) {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          supplier:suppliers(*),
          project:projects(id, name),
          items:purchase_order_items(
            *,
            equipment:project_equipment(
              id,
              name,
              part_number,
              manufacturer,
              model,
              description
            )
          ),
          tracking:shipment_tracking(*)
        `)
        .eq('id', poId)
        .single();

      if (error) throw error;

      // Fetch submitter profile separately if submitted_by exists
      if (data && data.submitted_by) {
        try {
          const { data: submitterData } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .eq('id', data.submitted_by)
            .single();

          if (submitterData) {
            data.submitter = submitterData;
          }
        } catch (submitterError) {
          // If submitter fetch fails, just continue without it
          console.warn('Could not fetch submitter profile:', submitterError);
        }
      }

      return data;
    } catch (error) {
      console.error('Error fetching purchase order:', error);
      throw error;
    }
  }

  /**
   * Get all purchase orders for a project
   */
  async getProjectPurchaseOrders(projectId, filters = {}) {
    try {
      let query = supabase
        .from('purchase_orders_summary')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (filters.milestone_stage) {
        query = query.eq('milestone_stage', filters.milestone_stage);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.supplier_id) {
        query = query.eq('supplier_id', filters.supplier_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching project purchase orders:', error);
      throw error;
    }
  }

  /**
   * Get ALL purchase orders across all projects
   */
  async getAllPurchaseOrders(filters = {}) {
    try {
      let query = supabase
        .from('purchase_orders_summary')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.supplier_id) {
        query = query.eq('supplier_id', filters.supplier_id);
      }

      if (filters.project_id) {
        query = query.eq('project_id', filters.project_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching all purchase orders:', error);
      throw error;
    }
  }

  /**
   * Update purchase order
   */
  async updatePurchaseOrder(poId, updates) {
    try {
      // Get current authenticated user
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('purchase_orders')
        .update({
          ...updates,
          updated_by: user?.id
        })
        .eq('id', poId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating purchase order:', error);
      throw error;
    }
  }

  /**
   * Submit purchase order (change status to submitted)
   * Also updates equipment records to capture who ordered them
   */
  async submitPurchaseOrder(poId, submittedBy) {
    try {
      // First, update the PO status
      const { data, error } = await supabase
        .from('purchase_orders')
        .update({
          status: 'submitted',
          submitted_by: submittedBy,
          submitted_at: new Date().toISOString()
        })
        .eq('id', poId)
        .select()
        .single();

      if (error) throw error;

      // Update equipment records to track who ordered them
      // Get all equipment IDs from this PO's line items
      const { data: lineItems, error: itemsError } = await supabase
        .from('purchase_order_items')
        .select('project_equipment_id')
        .eq('po_id', poId);

      if (!itemsError && lineItems?.length > 0) {
        const equipmentIds = lineItems.map(item => item.project_equipment_id).filter(Boolean);
        const timestamp = new Date().toISOString();

        // Update each equipment item to track who ordered it
        // Only set if not already set (preserve original orderer for items ordered via multiple POs)
        for (const equipmentId of equipmentIds) {
          await supabase
            .from('project_equipment')
            .update({
              ordered_confirmed: true,
              ordered_confirmed_at: timestamp,
              ordered_confirmed_by: submittedBy
            })
            .eq('id', equipmentId)
            .is('ordered_confirmed_by', null); // Only update if not already set
        }

        console.log(`[purchaseOrderService] Updated ${equipmentIds.length} equipment items with orderer: ${submittedBy}`);
      }

      return data;
    } catch (error) {
      console.error('Error submitting purchase order:', error);
      throw error;
    }
  }

  /**
   * Undo submission of a purchase order (EMERGENCY USE ONLY)
   * Reverts PO back to draft status and reverses all side effects:
   * - Restores allocated inventory to global stock
   * - Clears submission tracking (submitted_by, submitted_at)
   * - Changes PO status back to 'draft'
   *
   * Note: ordered_quantity is automatically recalculated from PO items
   * based on status (only submitted/confirmed/received POs count as "ordered")
   */
  async undoSubmitPurchaseOrder(poId) {
    try {
      console.log('[undoSubmitPurchaseOrder] Starting undo for PO:', poId);

      // Get PO with full details including equipment and global parts info
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          items:purchase_order_items(
            id,
            project_equipment_id,
            quantity_ordered,
            equipment:project_equipment(
              id,
              ordered_quantity,
              planned_quantity,
              global_part_id
            )
          )
        `)
        .eq('id', poId)
        .single();

      if (poError) throw poError;

      console.log('[undoSubmitPurchaseOrder] PO data:', po);
      console.log('[undoSubmitPurchaseOrder] Processing', po.items?.length || 0, 'line items');

      // Only allow undoing submitted POs
      if (po.status === 'draft') {
        throw new Error('PO is already in draft status');
      }

      if (po.status === 'cancelled') {
        throw new Error('Cannot undo cancelled PO');
      }

      // For each line item, reverse the effects
      if (po.items && po.items.length > 0) {
        for (const item of po.items) {
          const equipment = item.equipment;

          console.log('[undoSubmitPurchaseOrder] Processing item:', {
            project_equipment_id: item.project_equipment_id,
            po_quantity_ordered: item.quantity_ordered,
            planned_quantity: equipment.planned_quantity,
            global_part_id: equipment.global_part_id
          });

          // Restore inventory to global_parts
          // Add back up to the quantity ordered, but no more than what's needed
          const inventoryToRestore = Math.min(
            item.quantity_ordered,
            Math.max(0, equipment.planned_quantity || 0)
          );

          console.log('[undoSubmitPurchaseOrder] Restoring inventory:', inventoryToRestore, 'units');

          if (inventoryToRestore > 0 && equipment.global_part_id) {
            const { error: inventoryError } = await supabase.rpc('increment_global_inventory', {
              p_global_part_id: equipment.global_part_id,
              p_quantity: inventoryToRestore
            });

            if (inventoryError) {
              console.warn('Could not restore inventory (may need manual adjustment):', inventoryError);
              // Don't fail the entire undo if inventory restore fails
            } else {
              console.log('[undoSubmitPurchaseOrder] Successfully restored', inventoryToRestore, 'units to global inventory');
            }
          }
        }
      }

      // 3. Revert PO status to draft and clear submission tracking
      console.log('[undoSubmitPurchaseOrder] Reverting PO status to draft');
      const { data: updatedPO, error: updateError } = await supabase
        .from('purchase_orders')
        .update({
          status: 'draft',
          submitted_by: null,
          submitted_at: null
        })
        .eq('id', poId)
        .select()
        .single();

      if (updateError) throw updateError;

      console.log('[undoSubmitPurchaseOrder] Successfully undone PO submission');

      // Note: Materialized view will auto-refresh via database triggers

      return updatedPO;
    } catch (error) {
      console.error('Error undoing PO submission:', error);
      throw error;
    }
  }

  /**
   * Cancel purchase order
   */
  async cancelPurchaseOrder(poId, reason) {
    try {
      // Get current authenticated user
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('purchase_orders')
        .update({
          status: 'cancelled',
          internal_notes: reason,
          cancelled_by: user?.id,
          cancelled_at: new Date().toISOString(),
          updated_by: user?.id
        })
        .eq('id', poId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error cancelling purchase order:', error);
      throw error;
    }
  }

  /**
   * Add line item to existing PO
   */
  async addLineItem(poId, lineItem) {
    try {
      // Get current max line number
      const { data: existingItems } = await supabase
        .from('purchase_order_items')
        .select('line_number')
        .eq('po_id', poId)
        .order('line_number', { ascending: false })
        .limit(1);

      const nextLineNumber = existingItems?.[0]?.line_number ? existingItems[0].line_number + 1 : 1;

      const { data, error } = await supabase
        .from('purchase_order_items')
        .insert([{
          po_id: poId,
          project_equipment_id: lineItem.project_equipment_id,
          line_number: nextLineNumber,
          quantity_ordered: lineItem.quantity_ordered,
          unit_cost: lineItem.unit_cost,
          expected_delivery_date: lineItem.expected_delivery_date,
          notes: lineItem.notes
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding line item:', error);
      throw error;
    }
  }

  /**
   * Update line item
   */
  async updateLineItem(lineItemId, updates) {
    try {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .update(updates)
        .eq('id', lineItemId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating line item:', error);
      throw error;
    }
  }

  /**
   * Mark line item as received
   */
  async receiveLineItem(lineItemId, quantityReceived, receivedBy) {
    try {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .update({
          quantity_received: quantityReceived,
          actual_delivery_date: new Date().toISOString().split('T')[0],
          received_by: receivedBy,
          received_at: new Date().toISOString()
        })
        .eq('id', lineItemId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error receiving line item:', error);
      throw error;
    }
  }

  /**
   * Remove line item
   */
  async removeLineItem(lineItemId) {
    try {
      const { error } = await supabase
        .from('purchase_order_items')
        .delete()
        .eq('id', lineItemId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error removing line item:', error);
      throw error;
    }
  }

  /**
   * Create PO from equipment selection
   * Automatically groups equipment by supplier and milestone
   */
  async createPOFromEquipment(projectId, supplierId, milestoneStage, equipmentIds, poData = {}) {
    try {
      // Fetch equipment details
      const { data: equipment, error: eqError } = await supabase
        .from('project_equipment')
        .select('*')
        .in('id', equipmentIds);

      if (eqError) throw eqError;

      // Calculate totals
      const lineItems = equipment.map(item => ({
        project_equipment_id: item.id,
        quantity_ordered: item.planned_quantity - (item.ordered_quantity || 0),
        unit_cost: item.unit_cost
      }));

      // Create PO with line items
      const po = await this.createPurchaseOrder({
        project_id: projectId,
        supplier_id: supplierId,
        milestone_stage: milestoneStage,
        ...poData
      }, lineItems);

      return po;
    } catch (error) {
      console.error('Error creating PO from equipment:', error);
      throw error;
    }
  }

  /**
   * Get PO statistics for a project
   */
  async getProjectPOStats(projectId) {
    try {
      const { data: pos, error } = await supabase
        .from('purchase_orders')
        .select('status, total_amount, milestone_stage')
        .eq('project_id', projectId);

      if (error) throw error;

      const stats = {
        total_pos: pos.length,
        total_value: pos.reduce((sum, po) => sum + (po.total_amount || 0), 0),
        by_status: {},
        by_milestone: {},
        prewire_value: 0,
        trim_value: 0
      };

      pos.forEach(po => {
        // By status
        stats.by_status[po.status] = (stats.by_status[po.status] || 0) + 1;

        // By milestone
        stats.by_milestone[po.milestone_stage] = (stats.by_milestone[po.milestone_stage] || 0) + 1;

        // Value by milestone
        if (po.milestone_stage === 'prewire_prep') {
          stats.prewire_value += po.total_amount || 0;
        } else if (po.milestone_stage === 'trim_prep') {
          stats.trim_value += po.total_amount || 0;
        }
      });

      return stats;
    } catch (error) {
      console.error('Error fetching PO stats:', error);
      return null;
    }
  }

  /**
   * Delete purchase order (draft only)
   */
  async deletePurchaseOrder(poId) {
    try {
      // Check if PO is draft
      const { data: po, error: checkError } = await supabase
        .from('purchase_orders')
        .select('status, items:purchase_order_items(project_equipment_id, quantity_ordered)')
        .eq('id', poId)
        .single();

      if (checkError) throw checkError;

      if (po.status !== 'draft') {
        throw new Error('Only draft POs can be deleted');
      }

      // Reset ordered_quantity on all equipment items
      if (po.items && po.items.length > 0) {
        const equipmentIds = po.items.map(item => item.project_equipment_id);

        // Get current ordered quantities for each equipment item
        const { data: equipment, error: equipError } = await supabase
          .from('project_equipment')
          .select('id, ordered_quantity')
          .in('id', equipmentIds);

        if (equipError) throw equipError;

        // Reduce ordered_quantity by the amount in this PO
        const updates = equipment.map(eq => {
          const poItem = po.items.find(item => item.project_equipment_id === eq.id);
          const newOrderedQty = Math.max(0, (eq.ordered_quantity || 0) - (poItem?.quantity_ordered || 0));

          return {
            id: eq.id,
            ordered_quantity: newOrderedQty
          };
        });

        // Update all equipment items
        for (const update of updates) {
          const { error: updateError } = await supabase
            .from('project_equipment')
            .update({ ordered_quantity: update.ordered_quantity })
            .eq('id', update.id);

          if (updateError) throw updateError;
        }
      }

      // Delete PO (items will cascade delete)
      const { error: deleteError } = await supabase
        .from('purchase_orders')
        .delete()
        .eq('id', poId);

      if (deleteError) throw deleteError;

      return { success: true };
    } catch (error) {
      console.error('Error deleting purchase order:', error);
      throw error;
    }
  }

  /**
   * Export PO to printable format
   */
  async exportPOData(poId) {
    try {
      const po = await this.getPurchaseOrder(poId);

      // Format for printing/PDF - structure expected by pdfExportService
      return {
        po: {
          po_number: po.po_number,
          order_date: po.order_date,
          requested_delivery_date: po.requested_delivery_date,
          status: po.status,
          subtotal: po.subtotal,
          tax_amount: po.tax_amount,
          shipping_cost: po.shipping_cost,
          total_amount: po.total_amount
        },
        supplier: {
          name: po.supplier.name,
          contact: po.supplier.contact_name,
          email: po.supplier.email,
          phone: po.supplier.phone,
          address: [
            po.supplier.address,
            `${po.supplier.city}, ${po.supplier.state} ${po.supplier.zip}`,
            po.supplier.country
          ].filter(Boolean).join('\n')
        },
        ship_to: {
          address: po.ship_to_address,
          contact: po.ship_to_contact,
          phone: po.ship_to_phone
        },
        items: Object.values(po.items.reduce((acc, item) => {
          const partNumber = item.equipment?.part_number || 'N/A';

          if (!acc[partNumber]) {
            acc[partNumber] = {
              line_number: Object.keys(acc).length + 1,
              part_number: partNumber,
              description: item.equipment?.description || item.equipment?.name,
              manufacturer: item.equipment?.manufacturer,
              model: item.equipment?.model,
              quantity_ordered: 0,
              unit_cost: item.unit_cost,
              line_total: 0
            };
          }

          acc[partNumber].quantity_ordered += (item.quantity_ordered || 0);
          acc[partNumber].line_total += (item.line_total || 0);

          return acc;
        }, {})),
        totals: {
          subtotal: po.subtotal,
          tax: po.tax_amount,
          shipping: po.shipping_cost,
          total: po.total_amount
        },
        notes: {
          supplier: po.supplier_notes,
          internal: po.internal_notes
        },
        payment_terms: po.supplier.payment_terms
      };
    } catch (error) {
      console.error('Error exporting PO data:', error);
      throw error;
    }
  }

  /**
   * Ensure "Inventory" supplier exists, create if not
   * Returns the inventory supplier record
   */
  async ensureInventorySupplier() {
    try {
      // Check if inventory supplier already exists
      const { data: existing, error: searchError } = await supabase
        .from('suppliers')
        .select('*')
        .eq('name', 'Internal Inventory')
        .maybeSingle();

      if (searchError && searchError.code !== 'PGRST116') {
        throw searchError;
      }

      if (existing) {
        return existing;
      }

      // Create inventory supplier
      const { data: newSupplier, error: createError } = await supabase
        .from('suppliers')
        .insert([{
          name: 'Internal Inventory',
          short_code: 'INV',
          contact_name: 'Warehouse',
          email: 'inventory@internal',
          phone: null,
          address: null,
          city: null,
          state: null,
          zip: null,
          country: 'USA',
          payment_terms: 'Internal',
          is_active: true,
          notes: 'System-generated supplier for internal inventory pulls'
        }])
        .select()
        .single();

      if (createError) throw createError;
      return newSupplier;
    } catch (error) {
      console.error('Error ensuring inventory supplier:', error);
      throw error;
    }
  }

  /**
   * Generate inventory PO for items available from warehouse
   * Automatically creates and submits a PO to "Inventory" supplier for items
   * that can be sourced from existing inventory
   *
   * IMPORTANT: This method always fetches fresh data from the database at the moment
   * it's called, ensuring it accounts for any last-minute inventory updates to
   * global_parts.quantity_on_hand before the PO is placed.
   */
  /**
   * Generate an Internal Inventory PO for specified items
   * @param {string} projectId - Project ID
   * @param {string} userId - User ID for tracking
   * @param {Array} itemsWithQuantities - Array of { equipmentId, quantity } objects
   */
  async generateInventoryPO(projectId, userId = null, itemsWithQuantities = null) {
    try {
      const timestamp = new Date().toISOString();
      console.log('[generateInventoryPO]', timestamp, 'Starting inventory PO generation for project:', projectId);
      console.log('[generateInventoryPO] Items with quantities:', itemsWithQuantities);

      if (!itemsWithQuantities || itemsWithQuantities.length === 0) {
        console.log('[generateInventoryPO] No items provided');
        return null;
      }

      // Ensure inventory supplier exists
      const inventorySupplier = await this.ensureInventorySupplier();

      // Get equipment details for the specified IDs
      const equipmentIds = itemsWithQuantities.map(i => i.equipmentId);
      const { data: equipment, error: equipError } = await supabase
        .from('project_equipment')
        .select(`
          id,
          name,
          part_number,
          planned_quantity,
          unit_cost,
          global_part:global_part_id(
            id,
            quantity_on_hand,
            required_for_prewire
          )
        `)
        .in('id', equipmentIds);

      if (equipError) throw equipError;

      console.log('[generateInventoryPO] Equipment items found:', equipment?.length || 0);

      if (!equipment || equipment.length === 0) {
        console.log('[generateInventoryPO] No equipment found to create inventory PO');
        return null;
      }

      // Map equipment with the quantities provided by caller
      const quantityMap = new Map(itemsWithQuantities.map(i => [i.equipmentId, i.quantity]));
      const inventoryItems = equipment.map(item => ({
        ...item,
        inventoryQty: quantityMap.get(item.id) || item.planned_quantity || 1,
        onHand: item.global_part?.quantity_on_hand || 0
      }));

      console.log('[generateInventoryPO] Creating PO for', inventoryItems.length, 'items');
      console.log('[generateInventoryPO] Total units to allocate:', inventoryItems.reduce((sum, item) => sum + item.inventoryQty, 0));

      // Determine milestone_stage based on items (prewire vs trim)
      // Note: Database constraint requires 'prewire_prep' or 'trim_prep'
      const prewireCount = inventoryItems.filter(item => item.global_part?.required_for_prewire === true).length;
      const trimCount = inventoryItems.length - prewireCount;
      const milestoneStage = prewireCount >= trimCount ? 'prewire_prep' : 'trim_prep';
      console.log('[generateInventoryPO] Milestone determination:', { prewireCount, trimCount, milestoneStage });

      // Create inventory PO
      const poData = {
        project_id: projectId,
        supplier_id: inventorySupplier.id,
        milestone_stage: milestoneStage,
        status: 'draft',
        order_date: new Date().toISOString().split('T')[0],
        ship_to_address: null,
        ship_to_contact: null,
        ship_to_phone: null,
        internal_notes: 'Inventory pull from warehouse',
        supplier_notes: 'Items to be pulled from internal inventory'
      };

      const lineItems = inventoryItems.map(item => ({
        project_equipment_id: item.id,
        quantity_ordered: item.inventoryQty,
        unit_cost: item.unit_cost || 0,
        notes: `From warehouse inventory: ${item.inventoryQty} units`
      }));

      // Create the PO
      const po = await this.createPurchaseOrder(poData, lineItems);
      console.log('[generateInventoryPO] Created inventory PO:', po.po_number);

      // Auto-submit the inventory PO
      await this.submitPurchaseOrder(po.id, userId);
      console.log('[generateInventoryPO] Auto-submitted inventory PO:', po.po_number);

      return po;
    } catch (error) {
      console.error('Error generating inventory PO:', error);
      throw error;
    }
  }
}

export const purchaseOrderService = new PurchaseOrderService();
