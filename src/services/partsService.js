import { supabase } from '../lib/supabase';

const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

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
  async list({ search } = {}) {
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

    const { data, error } = await query;

    if (error) {
      console.error('Failed to fetch global parts:', error);
      throw new Error(error.message || 'Failed to fetch parts');
    }

    return data || [];
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
      resource_links: normalizeResourceLinks(payload.resource_links),
      attributes: payload.attributes || {},
    };

    const { data, error } = await supabase
      .from('global_parts')
      .insert([dataToInsert])
      .select()
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

    const payload = { ...updates };

    if (payload.part_number) payload.part_number = payload.part_number.trim();
    if (payload.name !== undefined) payload.name = payload.name?.trim() || null;
    if (payload.description !== undefined) payload.description = payload.description?.trim() || null;
    if (payload.manufacturer !== undefined) payload.manufacturer = payload.manufacturer?.trim() || null;
    if (payload.model !== undefined) payload.model = payload.model?.trim() || null;
    if (payload.category !== undefined) payload.category = payload.category?.trim() || null;
    if (payload.unit_of_measure !== undefined) payload.unit_of_measure = payload.unit_of_measure?.trim() || 'ea';
    if (payload.quantity_on_hand !== undefined) payload.quantity_on_hand = Number(payload.quantity_on_hand) || 0;
    if (payload.quantity_reserved !== undefined) payload.quantity_reserved = Number(payload.quantity_reserved) || 0;
    if (payload.is_wire_drop_visible !== undefined) payload.is_wire_drop_visible = Boolean(payload.is_wire_drop_visible);
    if (payload.is_inventory_item !== undefined) payload.is_inventory_item = Boolean(payload.is_inventory_item);

    if (payload.resource_links !== undefined) {
      payload.resource_links = normalizeResourceLinks(payload.resource_links);
    }

    const { data, error } = await supabase
      .from('global_parts')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update part:', error);
      throw new Error(error.message || 'Failed to update part');
    }

    return data;
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
