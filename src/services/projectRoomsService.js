import { supabase } from '../lib/supabase';
import { normalizeRoomName } from '../utils/roomUtils';

const uniqueAliasesPayload = (projectId, projectRoomId, aliases = [], createdBy = null) => {
  const seen = new Set();
  const payload = [];

  aliases
    .map((alias) => (typeof alias === 'string' ? alias.trim() : ''))
    .filter(Boolean)
    .forEach((alias) => {
      const normalized = normalizeRoomName(alias);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      payload.push({
        project_id: projectId,
        project_room_id: projectRoomId,
        alias,
        created_by: createdBy
      });
    });

  return payload;
};

export const projectRoomsService = {
  normalizeRoomName,

  async fetchRoomsWithAliases(projectId) {
    if (!projectId) return [];

    const { data, error } = await supabase
      .from('project_rooms')
      .select('*, project_room_aliases(*)')
      .eq('project_id', projectId)
      .order('name', { ascending: true });

    if (error) {
      console.error('Failed to load project rooms:', error);
      throw error;
    }

    return (data || []).map((room) => ({
      ...room,
      project_room_aliases: room.project_room_aliases || []
    }));
  },

  async createRoom(projectId, { name, is_headend = false, notes = null, createdBy = null }) {
    if (!projectId || !name) throw new Error('Project ID and room name are required');
    const { data, error } = await supabase
      .from('project_rooms')
      .insert({
        project_id: projectId,
        name,
        is_headend,
        notes,
        created_by: createdBy
      })
      .select('*, project_room_aliases(*)')
      .single();

    if (error) {
      console.error('Failed to create project room:', error);
      throw error;
    }

    return {
      ...data,
      project_room_aliases: data.project_room_aliases || []
    };
  },

  async updateRoom(roomId, updates = {}) {
    if (!roomId) throw new Error('Room ID is required to update a room');
    const { data, error } = await supabase
      .from('project_rooms')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', roomId)
      .select('*, project_room_aliases(*)')
      .single();

    if (error) {
      console.error('Failed to update project room:', error);
      throw error;
    }

    return {
      ...data,
      project_room_aliases: data.project_room_aliases || []
    };
  },

  async deleteAlias(aliasId) {
    if (!aliasId) return;
    const { error } = await supabase
      .from('project_room_aliases')
      .delete()
      .eq('id', aliasId);

    if (error) {
      console.error('Failed to delete room alias:', error);
      throw error;
    }
  },

  async upsertAliases(projectId, projectRoomId, aliases = [], createdBy = null) {
    if (!projectId || !projectRoomId || !aliases?.length) return [];

    const payload = uniqueAliasesPayload(projectId, projectRoomId, aliases, createdBy);
    if (!payload.length) return [];

    const { data, error } = await supabase
      .from('project_room_aliases')
      .upsert(payload, {
        onConflict: 'project_id, normalized_alias'
      })
      .select();

    if (error) {
      console.error('Failed to upsert room aliases:', error);
      throw error;
    }

    return data || [];
  }
};
