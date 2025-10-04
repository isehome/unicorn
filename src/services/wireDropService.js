import { supabase } from '../lib/supabase';

/**
 * Enhanced Wire Drop Service for 3-stage system
 * Handles Prewire, Trim Out, and Commission stages
 */

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
          projects(name, id),
          wire_drop_stages(*),
          wire_drop_room_end(*),
          wire_drop_head_end(*)
        `)
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
          projects(name, id),
          wire_drop_stages(*),
          wire_drop_room_end(*),
          wire_drop_head_end(*)
        `)
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
   * Create new wire drop with initial stages
   */
  async createWireDrop(projectId, wireDropData) {
    try {
      // Generate human-readable UID
      const uid = this.generateUID(wireDropData.room_name, wireDropData.drop_name);

      // Create the wire drop
      const { data: wireDrop, error: createError } = await supabase
        .from('wire_drops')
        .insert({
          project_id: projectId,
          uid,
          name: wireDropData.drop_name,
          room_name: wireDropData.room_name,
          drop_name: wireDropData.drop_name,
          location: wireDropData.location || wireDropData.room_name,
          type: wireDropData.type || 'CAT6',
          lucid_shape_id: wireDropData.lucid_shape_id,
          schematic_reference: wireDropData.schematic_reference,
          room_end_equipment: wireDropData.room_end_equipment,
          head_end_equipment: wireDropData.head_end_equipment,
          notes: wireDropData.notes
        })
        .select()
        .single();

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
      
      // Get the configured bucket name
      const bucketName = this.getStorageBucket();
      
      // Generate unique filename with proper extension
      const fileExtension = photoFile.name?.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `wire-drops/${wireDropId}/${stageType}_${Date.now()}.${fileExtension}`;
      
      console.log(`Uploading photo to bucket: ${bucketName}, file: ${fileName}`);
      
      // First, try to upload to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(fileName, photoFile, {
          contentType: photoFile.type,
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.warn('Supabase storage upload failed:', uploadError);
        
        // Check if the bucket exists, if not provide better error message
        if (uploadError.message?.includes('Bucket not found')) {
          console.error(`Storage bucket "${bucketName}" not found. Please create the bucket in Supabase dashboard.`);
          throw new Error(`Photo storage bucket "${bucketName}" not found. Please contact support.`);
        }
        
        // For other storage errors, still throw - don't use blob URLs as they're temporary
        throw new Error(`Photo upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(fileName);

      if (!urlData.publicUrl) {
        throw new Error('Failed to generate public URL for uploaded photo');
      }

      console.log('Photo uploaded successfully:', urlData.publicUrl);

      // Update stage with photo URL and mark as complete
      return await this.updateStage(wireDropId, stageType, {
        photo_url: urlData.publicUrl,
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
}

// Export singleton instance
export const wireDropService = new WireDropService();
export default wireDropService;
