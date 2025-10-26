import { supabase } from '../lib/supabase';

class SupplierService {
  /**
   * Get all suppliers
   */
  async getAllSuppliers(activeOnly = false) {
    try {
      let query = supabase
        .from('suppliers')
        .select('*')
        .order('name');

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      throw error;
    }
  }

  /**
   * Get supplier by ID with contacts
   */
  async getSupplierById(supplierId) {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select(`
          *,
          contacts:supplier_contacts(*)
        `)
        .eq('id', supplierId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching supplier:', error);
      throw error;
    }
  }

  /**
   * Create new supplier
   */
  async createSupplier(supplierData) {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .insert([{
          name: supplierData.name,
          short_code: supplierData.short_code.toUpperCase(),
          contact_name: supplierData.contact_name,
          email: supplierData.email,
          phone: supplierData.phone,
          address: supplierData.address,
          city: supplierData.city,
          state: supplierData.state,
          zip: supplierData.zip,
          country: supplierData.country || 'USA',
          website: supplierData.website,
          account_number: supplierData.account_number,
          payment_terms: supplierData.payment_terms || 'Net 30',
          shipping_account: supplierData.shipping_account,
          notes: supplierData.notes,
          is_active: supplierData.is_active !== false,
          is_preferred: supplierData.is_preferred || false
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating supplier:', error);
      throw error;
    }
  }

  /**
   * Update supplier
   */
  async updateSupplier(supplierId, updates) {
    try {
      if (updates.short_code) {
        updates.short_code = updates.short_code.toUpperCase();
      }

      const { data, error } = await supabase
        .from('suppliers')
        .update(updates)
        .eq('id', supplierId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating supplier:', error);
      throw error;
    }
  }

  /**
   * Delete supplier (soft delete by setting inactive)
   */
  async deleteSupplier(supplierId, hardDelete = false) {
    try {
      if (hardDelete) {
        const { error } = await supabase
          .from('suppliers')
          .delete()
          .eq('id', supplierId);

        if (error) throw error;
      } else {
        // Soft delete
        await this.updateSupplier(supplierId, { is_active: false });
      }
      return true;
    } catch (error) {
      console.error('Error deleting supplier:', error);
      throw error;
    }
  }

  /**
   * Add contact to supplier
   */
  async addSupplierContact(supplierId, contactData) {
    try {
      const { data, error } = await supabase
        .from('supplier_contacts')
        .insert([{
          supplier_id: supplierId,
          name: contactData.name,
          title: contactData.title,
          email: contactData.email,
          phone: contactData.phone,
          mobile: contactData.mobile,
          is_primary: contactData.is_primary || false,
          is_accounts_payable: contactData.is_accounts_payable || false,
          is_sales: contactData.is_sales || false,
          notes: contactData.notes
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding supplier contact:', error);
      throw error;
    }
  }

  /**
   * Get suppliers grouped by equipment for a project/milestone
   * Returns: { supplierName: { supplier: {...}, equipment: [...] } }
   */
  async getEquipmentGroupedBySupplier(projectId, milestoneStage = null) {
    try {
      let query = supabase
        .from('equipment_for_po')
        .select('*')
        .eq('project_id', projectId);

      if (milestoneStage) {
        query = query.eq('milestone_stage', milestoneStage);
      }

      const { data: equipment, error } = await query;
      if (error) throw error;

      // Get all unique suppliers from equipment
      const supplierNames = [...new Set(equipment.map(e => e.supplier).filter(Boolean))];

      // Fetch supplier records
      const { data: suppliers } = await supabase
        .from('suppliers')
        .select('*')
        .in('name', supplierNames);

      // Group equipment by supplier
      const grouped = {};
      equipment.forEach(item => {
        const supplierName = item.supplier || 'Unassigned';
        if (!grouped[supplierName]) {
          grouped[supplierName] = {
            supplier: suppliers?.find(s => s.name === supplierName) || { name: supplierName },
            equipment: [],
            totalCost: 0,
            totalItems: 0
          };
        }
        grouped[supplierName].equipment.push(item);
        grouped[supplierName].totalCost += item.line_total || 0;
        grouped[supplierName].totalItems += item.quantity_to_order || 0;
      });

      return grouped;
    } catch (error) {
      console.error('Error grouping equipment by supplier:', error);
      throw error;
    }
  }

  /**
   * Match equipment supplier name to supplier record
   * Helps link text supplier names to actual supplier records
   */
  async matchSupplierByName(supplierName) {
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .ilike('name', `%${supplierName}%`)
        .limit(5);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error matching supplier:', error);
      return [];
    }
  }

  /**
   * Update equipment with supplier ID
   */
  async linkEquipmentToSupplier(equipmentIds, supplierId) {
    try {
      // Get supplier name
      const { data: supplier } = await supabase
        .from('suppliers')
        .select('name')
        .eq('id', supplierId)
        .single();

      if (!supplier) throw new Error('Supplier not found');

      // Update equipment records
      const { data, error } = await supabase
        .from('project_equipment')
        .update({ supplier: supplier.name })
        .in('id', equipmentIds)
        .select();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error linking equipment to supplier:', error);
      throw error;
    }
  }
}

export const supplierService = new SupplierService();
