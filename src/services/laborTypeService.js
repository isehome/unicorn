/**
 * Labor Type Service
 * Manages labor types for service ticket time tracking
 */

import { supabase } from './supabase';

export const laborTypeService = {
  /**
   * Get all labor types (active only by default)
   */
  async getAllLaborTypes(includeInactive = false) {
    let query = supabase
      .from('labor_types')
      .select('*')
      .order('sort_order', { ascending: true });

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[laborTypeService] Error fetching labor types:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Get a single labor type by ID
   */
  async getLaborTypeById(id) {
    const { data, error } = await supabase
      .from('labor_types')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[laborTypeService] Error fetching labor type:', error);
      throw error;
    }

    return data;
  },

  /**
   * Get the default labor type
   */
  async getDefaultLaborType() {
    // First try to get the one marked as default
    let { data, error } = await supabase
      .from('labor_types')
      .select('*')
      .eq('is_default', true)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      // Fallback to first active labor type
      const result = await supabase
        .from('labor_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .limit(1)
        .single();

      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error('[laborTypeService] Error fetching default labor type:', error);
      return null;
    }

    return data;
  },

  /**
   * Create a new labor type
   */
  async createLaborType(laborTypeData) {
    const { data, error } = await supabase
      .from('labor_types')
      .insert({
        name: laborTypeData.name,
        label: laborTypeData.label,
        description: laborTypeData.description || null,
        hourly_rate: laborTypeData.hourly_rate || 150,
        qbo_item_name: laborTypeData.qbo_item_name || null,
        is_default: laborTypeData.is_default || false,
        is_active: laborTypeData.is_active !== false,
        sort_order: laborTypeData.sort_order || 999
      })
      .select()
      .single();

    if (error) {
      console.error('[laborTypeService] Error creating labor type:', error);
      throw error;
    }

    // If this was set as default, unset others
    if (laborTypeData.is_default && data) {
      await this.setAsDefault(data.id);
    }

    return data;
  },

  /**
   * Update an existing labor type
   */
  async updateLaborType(id, updates) {
    const { data, error } = await supabase
      .from('labor_types')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[laborTypeService] Error updating labor type:', error);
      throw error;
    }

    // If this was set as default, unset others
    if (updates.is_default && data) {
      await this.setAsDefault(id);
    }

    return data;
  },

  /**
   * Set a labor type as the default (and unset others)
   */
  async setAsDefault(id) {
    // First, unset all defaults
    await supabase
      .from('labor_types')
      .update({ is_default: false })
      .neq('id', id);

    // Then set this one as default
    const { data, error } = await supabase
      .from('labor_types')
      .update({ is_default: true })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[laborTypeService] Error setting default labor type:', error);
      throw error;
    }

    return data;
  },

  /**
   * Soft delete a labor type (set is_active = false)
   */
  async deleteLaborType(id) {
    const { data, error } = await supabase
      .from('labor_types')
      .update({
        is_active: false,
        is_default: false, // Can't be default if inactive
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[laborTypeService] Error deleting labor type:', error);
      throw error;
    }

    return data;
  },

  /**
   * Restore a soft-deleted labor type
   */
  async restoreLaborType(id) {
    const { data, error } = await supabase
      .from('labor_types')
      .update({
        is_active: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[laborTypeService] Error restoring labor type:', error);
      throw error;
    }

    return data;
  },

  /**
   * Reorder labor types
   */
  async reorderLaborTypes(orderedIds) {
    const updates = orderedIds.map((id, index) => ({
      id,
      sort_order: index
    }));

    // Update each in sequence
    for (const update of updates) {
      const { error } = await supabase
        .from('labor_types')
        .update({ sort_order: update.sort_order })
        .eq('id', update.id);

      if (error) {
        console.error('[laborTypeService] Error reordering labor type:', error);
        throw error;
      }
    }

    return true;
  },

  // ============================================================
  // QBO Item Mapping Methods
  // ============================================================

  /**
   * Get QBO item mapping for a labor type
   */
  async getQboMapping(laborTypeId, realmId) {
    const { data, error } = await supabase
      .from('qbo_item_mapping')
      .select('*')
      .eq('item_type', 'labor')
      .eq('local_id', laborTypeId)
      .eq('qbo_realm_id', realmId)
      .single();

    if (error && error.code !== 'PGRST116') { // Not found is OK
      console.error('[laborTypeService] Error fetching QBO mapping:', error);
      throw error;
    }

    return data;
  },

  /**
   * Create or update QBO item mapping for a labor type
   */
  async upsertQboMapping(laborTypeId, realmId, qboItemId, qboItemName) {
    const { data, error } = await supabase
      .from('qbo_item_mapping')
      .upsert({
        item_type: 'labor',
        local_id: laborTypeId,
        qbo_item_id: qboItemId,
        qbo_item_name: qboItemName,
        qbo_realm_id: realmId
      }, {
        onConflict: 'item_type,local_id,qbo_realm_id'
      })
      .select()
      .single();

    if (error) {
      console.error('[laborTypeService] Error upserting QBO mapping:', error);
      throw error;
    }

    return data;
  },

  /**
   * Delete QBO item mapping for a labor type
   */
  async deleteQboMapping(laborTypeId, realmId) {
    const { error } = await supabase
      .from('qbo_item_mapping')
      .delete()
      .eq('item_type', 'labor')
      .eq('local_id', laborTypeId)
      .eq('qbo_realm_id', realmId);

    if (error) {
      console.error('[laborTypeService] Error deleting QBO mapping:', error);
      throw error;
    }

    return true;
  },

  /**
   * Get all QBO mappings for labor types in a realm
   */
  async getAllQboMappings(realmId) {
    const { data, error } = await supabase
      .from('qbo_item_mapping')
      .select('*')
      .eq('item_type', 'labor')
      .eq('qbo_realm_id', realmId);

    if (error) {
      console.error('[laborTypeService] Error fetching QBO mappings:', error);
      throw error;
    }

    return data || [];
  }
};

export default laborTypeService;
