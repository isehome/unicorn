import { supabase } from '../lib/supabase';

const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

// normalizeResourceLinks is reserved for future use when resource_links JSON field is enabled
// eslint-disable-next-line no-unused-vars
const normalizeResourceLinks = (links = []) => {
  if (!Array.isArray(links)) return [];
  return links
    .map((link) => {
      if (!link) return null;
      const id = link.id || generateId();
      return {
        id,
        label: link.label?.trim() || 'Resource',
        type: link.type?.trim() || 'link',
        url: link.url?.trim() || '',
      };
    })
    .filter((link) => link.url);
};

export const partsService = {
  async list({ search, needsReviewOnly = false } = {}) {
    if (!supabase) return [];

    let query = supabase
      .from('global_parts')
      .select('*')
      .order('part_number', { ascending: true });

    if (search) {
      const term = `%${search.trim()}%`;
      query = query.or(
        [
          `part_number.ilike.${term}`,
          `name.ilike.${term}`,
          `manufacturer.ilike.${term}`,
          `model.ilike.${term}`,
          `description.ilike.${term}`,
        ].join(',')
      );
    }

    if (needsReviewOnly) {
      query = query.eq('needs_review', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch global parts:', error);
      throw new Error(error.message || 'Failed to fetch parts');
    }

    return data || [];
  },

  async getNewPartsCount() {
    if (!supabase) return 0;

    const { data, error } = await supabase.rpc('get_new_parts_count');

    if (error) {
      console.error('Failed to get new parts count:', error);
      // Fallback: query directly
      const { count, error: countError } = await supabase
        .from('global_parts')
        .select('*', { count: 'exact', head: true })
        .eq('needs_review', true);

      if (countError) {
        console.error('Fallback count also failed:', countError);
        return 0;
      }
      return count || 0;
    }

    return data || 0;
  },

  async markPartReviewed(partId) {
    if (!supabase || !partId) return false;

    const { data, error } = await supabase.rpc('mark_part_reviewed', {
      p_part_id: partId
    });

    if (error) {
      console.error('Failed to mark part as reviewed:', error);
      // Fallback: direct update
      const { error: updateError } = await supabase
        .from('global_parts')
        .update({ needs_review: false })
        .eq('id', partId);

      if (updateError) {
        throw new Error(updateError.message || 'Failed to mark part as reviewed');
      }
      return true;
    }

    return data;
  },

  async markAllPartsReviewed() {
    if (!supabase) return 0;

    const { data, error } = await supabase.rpc('mark_all_parts_reviewed');

    if (error) {
      console.error('Failed to mark all parts as reviewed:', error);
      // Fallback: direct update
      const { error: updateError, count } = await supabase
        .from('global_parts')
        .update({ needs_review: false })
        .eq('needs_review', true);

      if (updateError) {
        throw new Error(updateError.message || 'Failed to mark all parts as reviewed');
      }
      return count || 0;
    }

    return data || 0;
  },

  async getById(id) {
    if (!supabase || !id) return null;

    const { data, error } = await supabase
      .from('global_parts')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Failed to fetch part:', error);
      throw new Error(error.message || 'Failed to fetch part');
    }

    return data;
  },

  async create(payload) {
    if (!supabase) throw new Error('Supabase not configured');

    // Exclude JSON fields (resource_links and attributes) entirely
    const dataToInsert = {
      part_number: payload.part_number?.trim(),
      name: payload.name?.trim() || null,
      description: payload.description?.trim() || null,
      manufacturer: payload.manufacturer?.trim() || null,
      model: payload.model?.trim() || null,
      category: payload.category?.trim() || null,
      unit_of_measure: payload.unit_of_measure?.trim() || 'ea',
      quantity_on_hand: Number(payload.quantity_on_hand) || 0,
      quantity_reserved: Number(payload.quantity_reserved) || 0,
      is_wire_drop_visible:
        payload.is_wire_drop_visible === false ? false : true,
      is_inventory_item:
        payload.is_inventory_item === false ? false : true,
      required_for_prewire:
        payload.required_for_prewire === true ? true : false,
      // Submittal document fields
      submittal_pdf_url: payload.submittal_pdf_url?.trim() || null,
      submittal_sharepoint_url: payload.submittal_sharepoint_url?.trim() || null,
      submittal_sharepoint_drive_id: payload.submittal_sharepoint_drive_id?.trim() || null,
      submittal_sharepoint_item_id: payload.submittal_sharepoint_item_id?.trim() || null,
      // Removed: resource_links and attributes - these JSON fields cause serialization issues
    };

    const { data, error } = await supabase
      .from('global_parts')
      .insert([dataToInsert])
      .select('*')
      .single();

    if (error) {
      console.error('Failed to create part:', error);
      throw new Error(error.message || 'Failed to create part');
    }

    return data;
  },

  async update(id, updates) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!id) throw new Error('Part ID is required');

    // Create a clean payload, ensuring no obsolete or generated fields are sent.
    const payload = { ...updates };
    delete payload.id;
    delete payload.created_at;
    delete payload.updated_at;
    delete payload.quantity_available;
    delete payload.resource_links;
    delete payload.attributes;

    // Explicitly handle boolean fields to ensure `false` is saved correctly.
    if (payload.is_wire_drop_visible !== undefined) {
      payload.is_wire_drop_visible = Boolean(payload.is_wire_drop_visible);
    }
    if (payload.is_inventory_item !== undefined) {
      payload.is_inventory_item = Boolean(payload.is_inventory_item);
    }
    if (payload.required_for_prewire !== undefined) {
      payload.required_for_prewire = Boolean(payload.required_for_prewire);
    }
    if (payload.is_rack_mountable !== undefined) {
      payload.is_rack_mountable = Boolean(payload.is_rack_mountable);
    }
    if (payload.needs_shelf !== undefined) {
      payload.needs_shelf = Boolean(payload.needs_shelf);
    }
    if (payload.exclude_from_rack !== undefined) {
      payload.exclude_from_rack = Boolean(payload.exclude_from_rack);
    }

    // Use comprehensive RPC function to bypass RLS for all updates
    const rpcParams = {
      p_part_id: id,
      p_part_number: payload.part_number,
      p_name: payload.name,
      p_description: payload.description,
      p_manufacturer: payload.manufacturer,
      p_model: payload.model,
      p_category: payload.category,
      p_unit_of_measure: payload.unit_of_measure,
      p_quantity_on_hand: payload.quantity_on_hand,
      p_quantity_reserved: payload.quantity_reserved,
      p_is_wire_drop_visible: payload.is_wire_drop_visible,
      p_is_inventory_item: payload.is_inventory_item,
      p_required_for_prewire: payload.required_for_prewire,
      p_schematic_url: payload.schematic_url,
      p_install_manual_urls: payload.install_manual_urls,
      p_technical_manual_urls: payload.technical_manual_urls,
      // Submittal document fields
      p_submittal_pdf_url: payload.submittal_pdf_url,
      p_submittal_sharepoint_url: payload.submittal_sharepoint_url,
      p_submittal_sharepoint_drive_id: payload.submittal_sharepoint_drive_id,
      p_submittal_sharepoint_item_id: payload.submittal_sharepoint_item_id,
      // Rack layout fields
      p_u_height: payload.u_height,
      p_is_rack_mountable: payload.is_rack_mountable,
      p_needs_shelf: payload.needs_shelf,
      p_shelf_u_height: payload.shelf_u_height,
      p_max_items_per_shelf: payload.max_items_per_shelf,
      p_exclude_from_rack: payload.exclude_from_rack,
    };

    const { data: rpcResult, error: rpcError } = await supabase.rpc('update_global_part', rpcParams);

    if (rpcError) {
      console.error('Failed to update part:', rpcError);
      throw new Error(rpcError.message || 'Failed to update part');
    }

    return rpcResult;
  },

  async remove(id) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!id) throw new Error('Part ID is required');

    const { error } = await supabase
      .from('global_parts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Failed to delete part:', error);
      throw new Error(error.message || 'Failed to delete part');
    }
  },
};
