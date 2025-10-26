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
          supplier_notes: poData.supplier_notes
        }])
        .select()
        .single();

      if (poError) throw poError;

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
   * Update purchase order
   */
  async updatePurchaseOrder(poId, updates) {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .update(updates)
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
   */
  async submitPurchaseOrder(poId, submittedBy) {
    try {
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
      return data;
    } catch (error) {
      console.error('Error submitting purchase order:', error);
      throw error;
    }
  }

  /**
   * Cancel purchase order
   */
  async cancelPurchaseOrder(poId, reason) {
    try {
      const { data, error } = await supabase
        .from('purchase_orders')
        .update({
          status: 'cancelled',
          internal_notes: reason
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

      // Format for printing/PDF
      return {
        po_number: po.po_number,
        date: po.order_date,
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
        items: po.items.map(item => ({
          line: item.line_number,
          part_number: item.equipment?.part_number,
          description: item.equipment?.name,
          manufacturer: item.equipment?.manufacturer,
          model: item.equipment?.model,
          quantity: item.quantity_ordered,
          unit_cost: item.unit_cost,
          total: item.line_total
        })),
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
}

export const purchaseOrderService = new PurchaseOrderService();
