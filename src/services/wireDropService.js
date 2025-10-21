import { supabase } from '../lib/supabase';

/**
 * Enhanced Wire Drop Service for 3-stage system
 * Handles Prewire, Trim Out, and Commission stages
 */

let supportsShapeDataColumn = true;

class WireDropService {
  /**
   * Get all wire drops for a project with stages and equipment data
   */
  async getProjectWireDrops(projectId) {
    try {
      const { data, error } = await supabase
        .from('wire_drops')
        .select(`
          *,
          project_room:project_room_id (*),
          projects(name, id),
          wire_drop_stages(*),
          wire_drop_room_end(*),
          wire_drop_head_end(*),
          wire_drop_equipment_links (
            id,
            link_side,
            sort_order,
            project_equipment (
              *,
              project_rooms(name, is_headend)
            )
          )
        `)
        .order('sort_order', { ascending: true, foreignTable: 'wire_drop_equipment_links' })
        .eq('project_id', projectId)
        .order('room_name, drop_name');

      if (error) throw error;
      
      // Calculate completion for each wire drop
      const wireDropsWithCompletion = (data || []).map(drop => ({
        ...drop,
        completion: this.calculateWireDropCompletion(drop.wire_drop_stages || [])
      }));

      return wireDropsWithCompletion;
    } catch (error) {
      console.error('Failed to fetch wire drops:', error);
      throw error;
    }
  }

  /**
   * Get single wire drop with all related data
   */
  async getWireDrop(wireDropId) {
    try {
      const { data, error } = await supabase
        .from('wire_drops')
        .select(`
          *,
          project_room:project_room_id (*),
          projects(name, id),
          wire_drop_stages(*),
          wire_drop_room_end(*),
          wire_drop_head_end(*),
          wire_drop_equipment_links (
            id,
            link_side,
            sort_order,
            project_equipment (
              *,
              project_rooms(name, is_headend)
            )
          )
        `)
        .order('sort_order', { ascending: true, foreignTable: 'wire_drop_equipment_links' })
        .eq('id', wireDropId)
        .single();

      if (error) throw error;

      return {
        ...data,
        completion: this.calculateWireDropCompletion(data.wire_drop_stages || [])
      };
    } catch (error) {
      console.error('Failed to fetch wire drop:', error);
      throw error;
    }
  }

  /**
   * Generate automatic drop name based on room and drop type
   * Format: "Room Name Drop Type #" (e.g., "Living Room Speaker 1")
   */
  async generateDropName(projectId, roomName, dropType) {
    if (!roomName || !dropType) return '';
    
    try {
      // Get existing wire drops for this project, room, and drop type
      const { data: existingDrops, error } = await supabase
        .from('wire_drops')
        .select('drop_name, room_name, drop_type')
        .eq('project_id', projectId)
        .eq('room_name', roomName)
        .eq('drop_type', dropType)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Extract numbers from existing drop names for this room/type combination
      const existingNumbers = [];
      const basePattern = `${roomName} ${dropType}`;
      
      (existingDrops || []).forEach(drop => {
        if (drop.drop_name && drop.drop_name.startsWith(basePattern)) {
          const match = drop.drop_name.match(/(\d+)$/);
          if (match) {
            existingNumbers.push(parseInt(match[1], 10));
          }
        }
      });

      // Find the next available number
      let nextNumber = 1;
      if (existingNumbers.length > 0) {
        // Sort numbers and find the first gap, or use max + 1
        existingNumbers.sort((a, b) => a - b);
        for (let i = 0; i < existingNumbers.length; i++) {
          if (existingNumbers[i] !== i + 1) {
            nextNumber = i + 1;
            break;
          }
        }
        if (nextNumber === 1 && existingNumbers.length > 0) {
          nextNumber = Math.max(...existingNumbers) + 1;
        }
      }

      return `${roomName} ${dropType} ${nextNumber}`;
    } catch (error) {
      console.error('Failed to generate drop name:', error);
      // Fallback to simple format
      return `${roomName} ${dropType}`;
    }
  }

  /**
   * Create new wire drop with initial stages
   */
  async createWireDrop(projectId, wireDropData) {
    try {
      // Auto-generate drop name if not provided but room and type are available
      let dropName = wireDropData.drop_name;
      if (!dropName && wireDropData.room_name && wireDropData.drop_type) {
        dropName = await this.generateDropName(projectId, wireDropData.room_name, wireDropData.drop_type);
      }

      // Generate human-readable UID
      const uid = this.generateUID(wireDropData.room_name, dropName || wireDropData.drop_name);

      // Create the wire drop
      const insertPayload = {
        project_id: projectId,
        uid,
        drop_name: dropName || wireDropData.drop_name,
        room_name: wireDropData.room_name,
        wire_type: wireDropData.wire_type || null,
        drop_type: wireDropData.drop_type || null,
        install_note: wireDropData.install_note || null,
        floor: wireDropData.floor || null,
        shape_color: wireDropData.shape_color || null,
        shape_fill_color: wireDropData.shape_fill_color || null,
        shape_line_color: wireDropData.shape_line_color || null,
        lucid_shape_id: wireDropData.lucid_shape_id,
        lucid_page_id: wireDropData.lucid_page_id || null,
        lucid_synced_at: wireDropData.lucid_synced_at || null,
        schematic_reference: wireDropData.schematic_reference,
        notes: wireDropData.notes,
        project_room_id: wireDropData.project_room_id || null,
        qr_code_url: wireDropData.qr_code_url || null
      };

      if (supportsShapeDataColumn && wireDropData.shape_data !== undefined) {
        insertPayload.shape_data = wireDropData.shape_data;
      }

      let { data: wireDrop, error: createError } = await supabase
        .from('wire_drops')
        .insert(insertPayload)
        .select()
        .single();

      if (createError && supportsShapeDataColumn && createError.message?.includes('shape_data')) {
        console.warn('[wireDropService] shape_data column missing; inserting without shape data payload.');
        supportsShapeDataColumn = false;
        const retryPayload = { ...insertPayload };
        delete retryPayload.shape_data;

        ({ data: wireDrop, error: createError } = await supabase
          .from('wire_drops')
          .insert(retryPayload)
          .select()
          .single());
      }

      if (createError) throw createError;

      // Create the three stages
      const stages = ['prewire', 'trim_out', 'commission'];
      const stageInserts = stages.map(stage_type => ({
        wire_drop_id: wireDrop.id,
        stage_type,
        completed: false
      }));

      const { error: stagesError } = await supabase
        .from('wire_drop_stages')
        .insert(stageInserts);

      if (stagesError) throw stagesError;

      return wireDrop;
    } catch (error) {
      console.error('Failed to create wire drop:', error);
      throw error;
    }
  }

  /**
   * Update wire drop basic information
   */
  async updateWireDrop(wireDropId, updates) {
    try {
      // If room or drop name changed, regenerate UID
      if (updates.room_name || updates.drop_name) {
        const currentDrop = await this.getWireDrop(wireDropId);
        updates.uid = this.generateUID(
          updates.room_name || currentDrop.room_name,
          updates.drop_name || currentDrop.drop_name
        );
      }

      const { data, error } = await supabase
        .from('wire_drops')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', wireDropId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to update wire drop:', error);
      throw error;
    }
  }

  /**
   * Update stage status (complete/incomplete)
   */
  async updateStage(wireDropId, stageType, updates) {
    try {
      const stageData = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      // If marking as complete, add timestamp and user
      if (updates.completed) {
        stageData.completed_at = new Date().toISOString();
        // Get actual user info if not already provided
        if (!updates.completed_by) {
          stageData.completed_by = await this.getCurrentUserInfo();
        } else {
          stageData.completed_by = updates.completed_by;
        }
      } else {
        stageData.completed_at = null;
        stageData.completed_by = null;
      }

      // First, check if the stage exists (handle potential duplicates)
      const { data: existingStages, error: checkError } = await supabase
        .from('wire_drop_stages')
        .select('*')
        .eq('wire_drop_id', wireDropId)
        .eq('stage_type', stageType);

      if (checkError) throw checkError;

      if (!existingStages || existingStages.length === 0) {
        // Create the stage if it doesn't exist
        const { data, error } = await supabase
          .from('wire_drop_stages')
          .insert({
            wire_drop_id: wireDropId,
            stage_type: stageType,
            ...stageData
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Update the first matching stage (and handle duplicates if they exist)
        const stageId = existingStages[0].id;
        
        // If there are duplicates, remove them
        if (existingStages.length > 1) {
          const duplicateIds = existingStages.slice(1).map(s => s.id);
          await supabase
            .from('wire_drop_stages')
            .delete()
            .in('id', duplicateIds);
          console.warn(`Removed ${duplicateIds.length} duplicate stages for wire_drop_id: ${wireDropId}, stage_type: ${stageType}`);
        }

        // Update the stage
        const { data, error } = await supabase
          .from('wire_drop_stages')
          .update(stageData)
          .eq('id', stageId)
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    } catch (error) {
      console.error('Failed to update stage:', error);
      throw error;
    }
  }

  /**
   * Get current authenticated user information
   */
  async getCurrentUserInfo() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return 'Unknown User';
      
      // For Microsoft/Azure auth, user metadata contains the actual name and email
      const userDisplayName = user.user_metadata?.name || 
                             user.user_metadata?.full_name || 
                             user.email?.split('@')[0] || 
                             'Unknown User';
      
      return userDisplayName;
    } catch (error) {
      console.error('Failed to get current user:', error);
      return 'Unknown User';
    }
  }

  /**
   * Get the configured storage bucket name
   */
  getStorageBucket() {
    // Temporarily hardcode to bypass environment variable issues
    return 'photos';
  }

  /**
   * Upload photo for a stage (prewire or trim_out)
   */
  async uploadStagePhoto(wireDropId, stageType, photoFile) {
    try {
      // Get current user info for attribution
      const currentUser = await this.getCurrentUserInfo();
      
      // Get wire drop to determine project ID
      const wireDrop = await this.getWireDrop(wireDropId);
      if (!wireDrop || !wireDrop.project_id) {
        throw new Error('Wire drop not found or project ID missing');
      }
      
      // Import SharePoint storage service dynamically to avoid circular dependencies
      const { sharePointStorageService } = await import('./sharePointStorageService');
      
      console.log(`Uploading photo to SharePoint for wire drop: ${wireDropId}, stage: ${stageType}`);
      
      // Upload to SharePoint
      const sharePointUrl = await sharePointStorageService.uploadWireDropPhoto(
        wireDrop.project_id,
        wireDropId,
        stageType,
        photoFile
      );

      if (!sharePointUrl) {
        throw new Error('Failed to get SharePoint URL for uploaded photo');
      }

      console.log('Photo uploaded successfully to SharePoint:', sharePointUrl);

      // Update stage with photo URL and mark as complete
      return await this.updateStage(wireDropId, stageType, {
        photo_url: sharePointUrl,
        completed: true,
        completed_by: currentUser
      });
    } catch (error) {
      console.error('Failed to upload photo:', error);
      throw error;
    }
  }

  /**
   * Complete commission stage (no photo required)
   */
  async completeCommission(wireDropId, commissionData = {}) {
    try {
      const currentUser = await this.getCurrentUserInfo();
      
      return await this.updateStage(wireDropId, 'commission', {
        completed: true,
        stage_data: commissionData,
        notes: commissionData.notes,
        completed_by: commissionData.completed_by || currentUser
      });
    } catch (error) {
      console.error('Failed to complete commission:', error);
      throw error;
    }
  }

  /**
   * Update room end equipment information
   */
  async updateRoomEnd(wireDropId, roomEndData) {
    try {
      // Check if record exists
      const { data: existing } = await supabase
        .from('wire_drop_room_end')
        .select('id')
        .eq('wire_drop_id', wireDropId)
        .single();

      let result;
      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from('wire_drop_room_end')
          .update({
            ...roomEndData,
            updated_at: new Date().toISOString()
          })
          .eq('wire_drop_id', wireDropId)
          .select()
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Create new
        const { data, error } = await supabase
          .from('wire_drop_room_end')
          .insert({
            wire_drop_id: wireDropId,
            ...roomEndData
          })
          .select()
          .single();

        if (error) throw error;
        result = data;
      }

      return result;
    } catch (error) {
      console.error('Failed to update room end:', error);
      throw error;
    }
  }

  /**
   * Update head end equipment and network information
   */
  async updateHeadEnd(wireDropId, headEndData) {
    try {
      // Check if record exists
      const { data: existing } = await supabase
        .from('wire_drop_head_end')
        .select('id')
        .eq('wire_drop_id', wireDropId)
        .single();

      let result;
      if (existing) {
        // Update existing
        const { data, error } = await supabase
          .from('wire_drop_head_end')
          .update({
            ...headEndData,
            updated_at: new Date().toISOString()
          })
          .eq('wire_drop_id', wireDropId)
          .select()
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Create new
        const { data, error } = await supabase
          .from('wire_drop_head_end')
          .insert({
            wire_drop_id: wireDropId,
            ...headEndData
          })
          .select()
          .single();

        if (error) throw error;
        result = data;
      }

      return result;
    } catch (error) {
      console.error('Failed to update head end:', error);
      throw error;
    }
  }

  /**
   * Get equipment types for dropdowns
   */
  async getEquipmentTypes(category = null) {
    try {
      let query = supabase
        .from('equipment_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order, equipment_type');

      if (category) {
        query = query.or(`category.eq.${category},category.eq.both`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Failed to fetch equipment types:', error);
      throw error;
    }
  }

  /**
   * Calculate wire drop completion percentage (0, 33, 67, or 100)
   */
  calculateWireDropCompletion(stages) {
    if (!stages || stages.length === 0) return 0;
    
    const completedCount = stages.filter(s => s.completed).length;
    
    if (completedCount === 0) return 0;
    if (completedCount === 1) return 33;
    if (completedCount === 2) return 67;
    return 100;
  }

  /**
   * Calculate project completion based on all wire drops
   */
  calculateProjectCompletion(wireDrops) {
    if (!wireDrops || wireDrops.length === 0) return 0;
    
    const totalCompletion = wireDrops.reduce((sum, drop) => {
      const dropCompletion = drop.completion || 
        this.calculateWireDropCompletion(drop.wire_drop_stages || []);
      return sum + dropCompletion;
    }, 0);
    
    return Math.round(totalCompletion / wireDrops.length);
  }

  /**
   * Generate human-readable UID from room and drop names
   * Includes timestamp to ensure uniqueness even for recreated wire drops
   */
  generateUID(roomName, dropName) {
    const room = (roomName || 'RM').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
    const drop = (dropName || 'DROP').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
    // Add last 4 characters of timestamp to ensure uniqueness
    const uniqueSuffix = Date.now().toString().slice(-4);
    return `${room}-${drop}-${uniqueSuffix}`;
  }

  /**
   * Delete wire drop and all related data
   */
  async deleteWireDrop(wireDropId) {
    try {
      console.log(`Attempting to delete wire drop: ${wireDropId}`);
      
      // First check if the wire drop exists
      const { data: existingDrop, error: checkError } = await supabase
        .from('wire_drops')
        .select('id')
        .eq('id', wireDropId)
        .single();

      if (checkError || !existingDrop) {
        console.error('Wire drop not found or error checking:', checkError);
        throw new Error('Wire drop not found or already deleted');
      }

      // Now attempt to delete
      const { data, error } = await supabase
        .from('wire_drops')
        .delete()
        .eq('id', wireDropId)
        .select();

      if (error) {
        console.error('Delete error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        
        // Check for specific error types
        if (error.code === '42501' || error.message?.includes('policy')) {
          throw new Error('Permission denied: Database DELETE policy is missing. Please run the fix_wire_drops_delete_NOW.sql script in Supabase SQL Editor.');
        }
        
        throw error;
      }

      // Verify the delete actually removed something
      if (!data || data.length === 0) {
        console.error('Delete operation returned no data - item may not have been deleted');
        
        // Double-check if it still exists
        const { data: stillExists } = await supabase
          .from('wire_drops')
          .select('id')
          .eq('id', wireDropId)
          .single();

        if (stillExists) {
          console.error('Wire drop still exists after delete attempt!');
          throw new Error('Delete failed: Wire drop was not removed. Please check database permissions.');
        }
      }

      console.log(`Successfully deleted wire drop: ${wireDropId}`, data);
      return true;
    } catch (error) {
      console.error('Failed to delete wire drop:', error);
      throw error;
    }
  }
  async getEquipmentLinks(wireDropId) {
    try {
      const { data, error } = await supabase
        .from('wire_drop_equipment_links')
        .select(`
          id,
          link_side,
          sort_order,
          project_equipment (
            *,
            project_rooms(name, is_headend)
          )
        `)
        .eq('wire_drop_id', wireDropId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to fetch wire drop equipment links:', error);
      throw error;
    }
  }

  async updateEquipmentLinks(wireDropId, linkSide, equipmentIds = []) {
    try {
      const { data: existingLinks, error: existingError } = await supabase
        .from('wire_drop_equipment_links')
        .select('id, project_equipment_id')
        .eq('wire_drop_id', wireDropId)
        .eq('link_side', linkSide);

      if (existingError) throw existingError;

      const existingIds = new Set((existingLinks || []).map((link) => link.project_equipment_id));
      const desiredIds = new Set((equipmentIds || []).filter(Boolean));

      const toInsert = Array.from(desiredIds)
        .filter((id) => !existingIds.has(id))
        .map((id) => ({
          wire_drop_id: wireDropId,
          project_equipment_id: id,
          link_side: linkSide,
          created_by: null
        }));

      const toRemove = (existingLinks || [])
        .filter((link) => !desiredIds.has(link.project_equipment_id))
        .map((link) => link.id);

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('wire_drop_equipment_links')
          .insert(toInsert);
        if (insertError) throw insertError;
      }

      if (toRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from('wire_drop_equipment_links')
          .delete()
          .in('id', toRemove);
        if (deleteError) throw deleteError;
      }

      if (equipmentIds.length > 0) {
        await Promise.all(
          equipmentIds.map((equipmentId, index) =>
            supabase
              .from('wire_drop_equipment_links')
              .update({ sort_order: index })
              .eq('wire_drop_id', wireDropId)
              .eq('project_equipment_id', equipmentId)
              .eq('link_side', linkSide)
          )
        );
      }

      return true;
    } catch (error) {
      console.error('Failed to update wire drop equipment links:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const wireDropService = new WireDropService();
export default wireDropService;
