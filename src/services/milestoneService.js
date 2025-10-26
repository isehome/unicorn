import { supabase } from '../lib/supabase';

class MilestoneService {
  // Milestone type definitions
  MILESTONE_TYPES = {
    PLANNING_DESIGN: 'planning_design',
    PREWIRE_PREP: 'prewire_prep',
    PREWIRE: 'prewire',
    TRIM_PREP: 'trim_prep',
    TRIM: 'trim',
    COMMISSIONING: 'commissioning',
    HANDOFF_TRAINING: 'handoff_training'
  };

  // Milestone labels for display
  MILESTONE_LABELS = {
    planning_design: 'Planning and Design',
    prewire_prep: 'Prewire Prep',
    prewire: 'Prewire',
    trim_prep: 'Trim Prep',
    trim: 'Trim',
    commissioning: 'Commissioning',
    handoff_training: 'Handoff / Training'
  };

  // Milestone requirements/helpers
  MILESTONE_HELPERS = {
    planning_design: 'Complete when Lucid diagram and Portal proposal URLs exist',
    prewire_prep: 'Complete when all prewire items are ordered AND received. Target date = Prewire date - 2 weeks',
    prewire: '% = (Wire drops with prewire photo) / (Total wire drops)',
    trim_prep: 'Complete when all trim items are ordered AND received. Target date = Trim date - 2 weeks',
    trim: '% = (Wire drops with trim photo & equipment attached) / (Total wire drops)',
    commissioning: 'Complete when equipment is attached in head end field',
    handoff_training: 'Manual completion checkbox'
  };

  /**
   * Calculate Planning & Design percentage
   * 100% when both wiring_diagram_url and portal_proposal_url exist
   */
  async calculatePlanningDesignPercentage(projectId) {
    try {
      const { data: project, error } = await supabase
        .from('projects')
        .select('wiring_diagram_url, portal_proposal_url')
        .eq('id', projectId)
        .single();

      if (error) throw error;

      const hasLucid = Boolean(project?.wiring_diagram_url);
      const hasProposal = Boolean(project?.portal_proposal_url);

      if (hasLucid && hasProposal) return 100;
      if (hasLucid || hasProposal) return 50;
      return 0;
    } catch (error) {
      console.error('Error calculating planning & design percentage:', error);
      return 0;
    }
  }

  /**
   * Calculate Prewire Prep percentage
   * Based on equipment with required_for_prewire = true
   * Formula: (ordered_quantity × 50% + received_quantity × 50%) / planned_quantity
   */
  async calculatePrewirePrepPercentage(projectId) {
    try {
      const { data: equipment, error } = await supabase
        .from('project_equipment')
        .select(`
          id,
          planned_quantity,
          ordered_quantity,
          received_quantity,
          global_part:global_part_id (required_for_prewire)
        `)
        .eq('project_id', projectId)
        .neq('equipment_type', 'Labor'); // Exclude labor items

      if (error) throw error;

      // Filter to prewire items (via global_parts.required_for_prewire)
      const prewireItems = (equipment || []).filter(item =>
        item.global_part?.required_for_prewire === true &&
        (item.planned_quantity || 0) > 0
      );

      if (prewireItems.length === 0) return 0;

      // Calculate quantity-based percentages
      const totalPlanned = prewireItems.reduce((sum, item) => sum + (item.planned_quantity || 0), 0);
      const totalOrdered = prewireItems.reduce((sum, item) => sum + (item.ordered_quantity || 0), 0);
      const totalReceived = prewireItems.reduce((sum, item) => sum + (item.received_quantity || 0), 0);

      if (totalPlanned === 0) return 0;

      // Ordered contributes 50%, Received contributes 50%
      const orderedPercent = (totalOrdered / totalPlanned) * 50;
      const receivedPercent = (totalReceived / totalPlanned) * 50;

      return Math.round(orderedPercent + receivedPercent);
    } catch (error) {
      console.error('Error calculating prewire prep percentage:', error);
      return 0;
    }
  }

  /**
   * Calculate Prewire percentage
   * (Wire drops with prewire stage completed) / (Total wire drops) × 100
   */
  async calculatePrewirePercentage(projectId) {
    try {
      // Get all wire drops for this project
      const { data: wireDrops, error: dropError } = await supabase
        .from('wire_drops')
        .select('id')
        .eq('project_id', projectId);

      if (dropError) throw dropError;

      const totalDrops = wireDrops?.length || 0;
      if (totalDrops === 0) return 0;

      // Get prewire stages that are completed (have photo)
      const { data: stages, error: stageError } = await supabase
        .from('wire_drop_stages')
        .select('wire_drop_id, completed, photo_url, wire_drops!inner(project_id)')
        .eq('stage_type', 'prewire')
        .eq('wire_drops.project_id', projectId);

      if (stageError) throw stageError;

      // Count completed prewire stages (either marked completed OR has photo)
      const completedStages = (stages || []).filter(stage => 
        stage.completed === true || Boolean(stage.photo_url)
      );

      const percentage = Math.round((completedStages.length / totalDrops) * 100);
      return percentage;
    } catch (error) {
      console.error('Error calculating prewire percentage:', error);
      return 0;
    }
  }

  /**
   * Calculate Trim Prep percentage
   * Based on equipment with required_for_prewire = false/null
   * Formula: (ordered_quantity × 50% + received_quantity × 50%) / planned_quantity
   */
  async calculateTrimPrepPercentage(projectId) {
    try {
      const { data: equipment, error } = await supabase
        .from('project_equipment')
        .select(`
          id,
          planned_quantity,
          ordered_quantity,
          received_quantity,
          global_part:global_part_id (required_for_prewire)
        `)
        .eq('project_id', projectId)
        .neq('equipment_type', 'Labor'); // Exclude labor items

      if (error) throw error;

      // Filter to trim items (NOT required for prewire via global_parts)
      const trimItems = (equipment || []).filter(item =>
        item.global_part?.required_for_prewire !== true &&
        (item.planned_quantity || 0) > 0
      );

      if (trimItems.length === 0) return 0;

      // Calculate quantity-based percentages
      const totalPlanned = trimItems.reduce((sum, item) => sum + (item.planned_quantity || 0), 0);
      const totalOrdered = trimItems.reduce((sum, item) => sum + (item.ordered_quantity || 0), 0);
      const totalReceived = trimItems.reduce((sum, item) => sum + (item.received_quantity || 0), 0);

      if (totalPlanned === 0) return 0;

      // Ordered contributes 50%, Received contributes 50%
      const orderedPercent = (totalOrdered / totalPlanned) * 50;
      const receivedPercent = (totalReceived / totalPlanned) * 50;

      return Math.round(orderedPercent + receivedPercent);
    } catch (error) {
      console.error('Error calculating trim prep percentage:', error);
      return 0;
    }
  }

  /**
   * Calculate Trim percentage
   * (Wire drops with trim stage completed) / (Total wire drops) × 100
   */
  async calculateTrimPercentage(projectId) {
    try {
      // Get all wire drops for this project
      const { data: wireDrops, error: dropError } = await supabase
        .from('wire_drops')
        .select('id')
        .eq('project_id', projectId);

      if (dropError) throw dropError;

      const totalDrops = wireDrops?.length || 0;
      if (totalDrops === 0) return 0;

      // Get trim_out stages that are completed (have photo AND equipment attached)
      const { data: stages, error: stageError } = await supabase
        .from('wire_drop_stages')
        .select('wire_drop_id, completed, photo_url, equipment_attached, wire_drops!inner(project_id)')
        .eq('stage_type', 'trim_out')
        .eq('wire_drops.project_id', projectId);

      if (stageError) throw stageError;

      // Count completed trim stages (marked completed OR has both photo and equipment)
      const completedStages = (stages || []).filter(stage => 
        stage.completed === true || 
        (Boolean(stage.photo_url) && stage.equipment_attached === true)
      );

      const percentage = Math.round((completedStages.length / totalDrops) * 100);
      return percentage;
    } catch (error) {
      console.error('Error calculating trim percentage:', error);
      return 0;
    }
  }

  /**
   * Calculate Commissioning percentage
   * 100% when equipment is attached to head-end room
   */
  async calculateCommissioningPercentage(projectId) {
    try {
      // Get head-end rooms for this project
      const { data: headEndRooms, error: roomError } = await supabase
        .from('project_rooms')
        .select('id')
        .eq('project_id', projectId)
        .eq('is_headend', true);

      if (roomError) throw roomError;

      if (!headEndRooms || headEndRooms.length === 0) return 0;

      const headEndRoomIds = headEndRooms.map(r => r.id);

      // Check if any equipment is assigned to head-end rooms
      const { data: equipment, error: equipError } = await supabase
        .from('project_equipment')
        .select('id, project_room_id')
        .eq('project_id', projectId)
        .in('project_room_id', headEndRoomIds);

      if (equipError) throw equipError;

      return (equipment && equipment.length > 0) ? 100 : 0;
    } catch (error) {
      console.error('Error calculating commissioning percentage:', error);
      return 0;
    }
  }

  /**
   * Calculate auto target date for prep milestones
   */
  calculatePrepTargetDate(workDate, daysBeforeWork = 14) {
    if (!workDate) return null;
    
    const date = new Date(workDate);
    date.setDate(date.getDate() - daysBeforeWork);
    return date.toISOString().split('T')[0];
  }

  /**
   * Calculate all milestone percentages for a project
   * OPTIMIZED: All 6 calculations run in parallel for maximum performance
   */
  async calculateAllPercentages(projectId) {
    try {
      // Run all calculations in parallel using Promise.all
      const [
        planning_design,
        prewire_prep,
        prewire,
        trim_prep,
        trim,
        commissioning
      ] = await Promise.all([
        this.calculatePlanningDesignPercentage(projectId),
        this.calculatePrewirePrepPercentage(projectId),
        this.calculatePrewirePercentage(projectId),
        this.calculateTrimPrepPercentage(projectId),
        this.calculateTrimPercentage(projectId),
        this.calculateCommissioningPercentage(projectId)
      ]);

      return {
        planning_design,
        prewire_prep,
        prewire,
        trim_prep,
        trim,
        commissioning
      };
    } catch (error) {
      console.error('Error calculating all percentages:', error);
      return {
        planning_design: 0,
        prewire_prep: 0,
        prewire: 0,
        trim_prep: 0,
        trim: 0,
        commissioning: 0
      };
    }
  }

  /**
   * Get all milestones for a project
   */
  async getProjectMilestones(projectId) {
    try {
      const { data, error } = await supabase
        .from('project_milestone_status')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order');

      if (error) throw error;
      
      // If no milestones exist, create default set
      if (!data || data.length === 0) {
        await this.initializeProjectMilestones(projectId);
        
        // Fetch again after initialization
        const { data: newData, error: fetchError } = await supabase
          .from('project_milestone_status')
          .select('*')
          .eq('project_id', projectId)
          .order('sort_order');
          
        if (fetchError) throw fetchError;
        return newData || [];
      }
      
      return data;
    } catch (error) {
      console.error('Error fetching milestones:', error);
      return [];
    }
  }

  /**
   * Initialize milestones for a project
   */
  async initializeProjectMilestones(projectId) {
    try {
      const milestones = Object.keys(this.MILESTONE_TYPES).map(key => ({
        project_id: projectId,
        milestone_type: this.MILESTONE_TYPES[key],
        percent_complete: 0,
        auto_calculated: this.MILESTONE_TYPES[key] === 'prewire_prep' || this.MILESTONE_TYPES[key] === 'trim_prep'
      }));

      // Use upsert to handle conflicts (insert or update)
      const { data, error } = await supabase
        .from('project_milestones')
        .upsert(milestones, {
          onConflict: 'project_id,milestone_type',
          ignoreDuplicates: false
        })
        .select();

      if (error) {
        console.error('Error initializing milestones:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Error in initializeProjectMilestones:', error);
      throw error;
    }
  }

  /**
   * Update a milestone
   */
  async updateMilestone(projectId, milestoneType, updates) {
    try {
      // Don't allow updating auto-calculated dates unless explicitly overriding
      if (updates.target_date && 
          (milestoneType === 'prewire_prep' || milestoneType === 'trim_prep') &&
          !updates.override_auto_calculate) {
        delete updates.target_date;
      }

      const { data, error } = await supabase
        .from('project_milestones')
        .upsert({
          project_id: projectId,
          milestone_type: milestoneType,
          ...updates,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'project_id,milestone_type',
          ignoreDuplicates: false
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating milestone:', error);
      throw error;
    }
  }

  /**
   * Check and update milestone completion
   */
  async checkMilestoneCompletion(projectId, milestoneType) {
    try {
      // Call the database function to check completion
      const { data, error } = await supabase
        .rpc('check_milestone_completion', {
          p_project_id: projectId,
          p_milestone_type: milestoneType
        });

      if (error) throw error;

      // Update the milestone with the completion data
      if (data) {
        await supabase
          .from('project_milestones')
          .update({
            percent_complete: data.percent_complete,
            auto_completion_data: data.details,
            last_auto_check: new Date().toISOString(),
            // Set actual date if complete and not already set
            actual_date: data.is_complete ? new Date().toISOString().split('T')[0] : null
          })
          .eq('project_id', projectId)
          .eq('milestone_type', milestoneType);
      }

      return data;
    } catch (error) {
      console.error('Error checking milestone completion:', error);
      return null;
    }
  }

  /**
   * Check all milestones for a project
   */
  async checkAllMilestones(projectId) {
    const milestoneTypes = Object.values(this.MILESTONE_TYPES);
    const results = {};

    for (const type of milestoneTypes) {
      results[type] = await this.checkMilestoneCompletion(projectId, type);
    }

    return results;
  }

  /**
   * Update milestone dates (handles dependent dates automatically)
   */
  async updateMilestoneDate(projectId, milestoneType, targetDate = undefined, actualDate = undefined) {
    try {
      const updates = {};
      
      // Only update target_date if explicitly provided
      if (targetDate !== undefined) {
        updates.target_date = targetDate || null;
      }
      
      // Only update actual_date if explicitly provided
      if (actualDate !== undefined) {
        updates.actual_date = actualDate || null;
      }
      
      // If no updates, return early
      if (Object.keys(updates).length === 0) {
        console.warn('No date updates provided');
        return null;
      }

      // Check if the milestone already exists
      const { data: existing } = await supabase
        .from('project_milestones')
        .select('id')
        .eq('project_id', projectId)
        .eq('milestone_type', milestoneType)
        .single();

      let data, error;

      if (existing) {
        // Update existing milestone
        ({ data, error } = await supabase
          .from('project_milestones')
          .update({
            ...updates,
            updated_at: new Date().toISOString()
          })
          .eq('project_id', projectId)
          .eq('milestone_type', milestoneType)
          .select()
          .single());
      } else {
        // Insert new milestone
        ({ data, error } = await supabase
          .from('project_milestones')
          .insert({
            project_id: projectId,
            milestone_type: milestoneType,
            ...updates,
            percent_complete: 0,
            auto_calculated: milestoneType === 'prewire_prep' || milestoneType === 'trim_prep'
          })
          .select()
          .single());
      }

      if (error) throw error;

      // Auto-update dependent prep milestones when work dates change
      if (milestoneType === 'prewire' && actualDate !== undefined && actualDate) {
        // Update Prewire Prep target date to 2 weeks before Prewire actual date
        const prepTargetDate = this.calculatePrepTargetDate(actualDate, 14);
        if (prepTargetDate) {
          await supabase
            .from('project_milestones')
            .upsert({
              project_id: projectId,
              milestone_type: 'prewire_prep',
              target_date: prepTargetDate,
              auto_calculated: true,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'project_id,milestone_type',
              ignoreDuplicates: false
            });
        }
      } else if (milestoneType === 'trim' && actualDate !== undefined && actualDate) {
        // Update Trim Prep target date to 2 weeks before Trim actual date
        const prepTargetDate = this.calculatePrepTargetDate(actualDate, 14);
        if (prepTargetDate) {
          await supabase
            .from('project_milestones')
            .upsert({
              project_id: projectId,
              milestone_type: 'trim_prep',
              target_date: prepTargetDate,
              auto_calculated: true,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'project_id,milestone_type',
              ignoreDuplicates: false
            });
        }
      }

      return data;
    } catch (error) {
      console.error('Error updating milestone date:', error);
      throw error;
    }
  }

  /**
   * Toggle manual completion for handoff/training
   */
  async toggleManualCompletion(projectId, milestoneType, isComplete) {
    try {
      const updates = {
        completed_manually: isComplete,
        percent_complete: isComplete ? 100 : 0
      };

      if (isComplete && !updates.actual_date) {
        updates.actual_date = new Date().toISOString().split('T')[0];
      } else if (!isComplete) {
        updates.actual_date = null;
      }

      const { data, error } = await supabase
        .from('project_milestones')
        .update(updates)
        .eq('project_id', projectId)
        .eq('milestone_type', milestoneType)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error toggling manual completion:', error);
      throw error;
    }
  }

  /**
   * Get completion stats for a project
   */
  async getProjectCompletionStats(projectId) {
    try {
      const milestones = await this.getProjectMilestones(projectId);
      
      const stats = {
        total: milestones.length || 0,
        completed: 0,
        inProgress: 0,
        notStarted: 0,
        overallProgress: 0
      };

      let totalProgress = 0;
      
      milestones.forEach(milestone => {
        const progress = milestone.percent_complete || 0;
        totalProgress += progress;
        
        if (progress === 100) {
          stats.completed++;
        } else if (progress > 0) {
          stats.inProgress++;
        } else {
          stats.notStarted++;
        }
      });

      if (stats.total > 0) {
        stats.overallProgress = Math.round(totalProgress / stats.total);
      }

      return stats;
    } catch (error) {
      console.error('Error getting completion stats:', error);
      return {
        total: 0,
        completed: 0,
        inProgress: 0,
        notStarted: 0,
        overallProgress: 0
      };
    }
  }

  /**
   * Format milestone for display
   */
  formatMilestone(milestone) {
    const isOverdue = milestone.target_date && 
                      !milestone.actual_date && 
                      new Date(milestone.target_date) < new Date();
    
    const status = milestone.percent_complete === 100 ? 'complete' :
                   isOverdue ? 'overdue' :
                   milestone.target_date ? 'scheduled' :
                   'not_set';
    
    return {
      ...milestone,
      label: this.MILESTONE_LABELS[milestone.milestone_type],
      helper: this.MILESTONE_HELPERS[milestone.milestone_type],
      status,
      isOverdue,
      isAutoCalculated: milestone.auto_calculated,
      canEditDate: milestone.milestone_type !== 'prewire_prep' && 
                   milestone.milestone_type !== 'trim_prep'
    };
  }

  /**
   * Subscribe to milestone changes
   */
  subscribeMilestoneChanges(projectId, callback) {
    const subscription = supabase
      .channel(`milestones:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_milestones',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          callback(payload);
        }
      )
      .subscribe();

    return subscription;
  }
}

export const milestoneService = new MilestoneService();
