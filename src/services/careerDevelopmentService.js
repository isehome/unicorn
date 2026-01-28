/**
 * careerDevelopmentService.js
 * Service layer for Career Development & Quarterly Skills Review System
 *
 * Features:
 * - Review cycles (quarterly periods)
 * - Manager relationships (org structure)
 * - Self-evaluations (employee self-ratings)
 * - Manager reviews (manager ratings)
 * - Development goals (5 focus skills per quarter)
 * - Review sessions (meeting tracking)
 * - Audit history
 */

import { supabase } from '../lib/supabase';

// ============================================================================
// REVIEW CYCLES
// ============================================================================

/**
 * Get the current active review cycle (self_eval or manager_review status)
 */
export async function getCurrentCycle() {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('review_cycles')
      .select('*')
      .in('status', ['self_eval', 'manager_review'])
      .order('start_date', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('[CareerDevelopmentService] getCurrentCycle error:', error);
      throw error;
    }

    return data || null;
  } catch (error) {
    console.error('[CareerDevelopmentService] getCurrentCycle failed:', error);
    throw error;
  }
}

/**
 * Get all review cycles, optionally filtered by status
 */
export async function getAllCycles(status = null) {
  if (!supabase) return [];

  try {
    let query = supabase
      .from('review_cycles')
      .select('*')
      .order('year', { ascending: false })
      .order('quarter', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[CareerDevelopmentService] getAllCycles error:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('[CareerDevelopmentService] getAllCycles failed:', error);
    throw error;
  }
}

/**
 * Create a new review cycle (admin only)
 */
export async function createCycle(cycleData, userId) {
  if (!supabase) throw new Error('Database not available');

  try {
    const { data, error } = await supabase
      .from('review_cycles')
      .insert({
        name: cycleData.name,
        year: cycleData.year,
        quarter: cycleData.quarter,
        start_date: cycleData.start_date,
        end_date: cycleData.end_date,
        self_eval_due_date: cycleData.self_eval_due_date,
        manager_review_due_date: cycleData.manager_review_due_date,
        status: cycleData.status || 'upcoming',
        created_by: userId
      })
      .select()
      .single();

    if (error) {
      console.error('[CareerDevelopmentService] createCycle error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[CareerDevelopmentService] createCycle failed:', error);
    throw error;
  }
}

/**
 * Update review cycle status
 */
export async function updateCycleStatus(cycleId, status) {
  if (!supabase) throw new Error('Database not available');

  try {
    const { data, error } = await supabase
      .from('review_cycles')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', cycleId)
      .select()
      .single();

    if (error) {
      console.error('[CareerDevelopmentService] updateCycleStatus error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[CareerDevelopmentService] updateCycleStatus failed:', error);
    throw error;
  }
}

/**
 * Update review cycle
 */
export async function updateCycle(cycleId, updates) {
  if (!supabase) throw new Error('Database not available');

  try {
    const { data, error } = await supabase
      .from('review_cycles')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', cycleId)
      .select()
      .single();

    if (error) {
      console.error('[CareerDevelopmentService] updateCycle error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[CareerDevelopmentService] updateCycle failed:', error);
    throw error;
  }
}

/**
 * Delete a review cycle (only if no evaluations exist)
 */
export async function deleteCycle(cycleId) {
  if (!supabase) throw new Error('Database not available');

  try {
    const { error } = await supabase
      .from('review_cycles')
      .delete()
      .eq('id', cycleId);

    if (error) {
      console.error('[CareerDevelopmentService] deleteCycle error:', error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error('[CareerDevelopmentService] deleteCycle failed:', error);
    throw error;
  }
}

// ============================================================================
// MANAGER RELATIONSHIPS
// ============================================================================

/**
 * Get primary manager for an employee
 */
export async function getMyManager(employeeId) {
  if (!supabase || !employeeId) return null;

  try {
    const { data, error } = await supabase
      .from('manager_relationships')
      .select(`
        id,
        manager_id,
        relationship_type,
        effective_date,
        manager:profiles!manager_relationships_manager_id_fkey (
          id, full_name, email, role, avatar_color
        )
      `)
      .eq('employee_id', employeeId)
      .eq('is_primary', true)
      .is('end_date', null)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[CareerDevelopmentService] getMyManager error:', error);
      throw error;
    }

    return data?.manager || null;
  } catch (error) {
    console.error('[CareerDevelopmentService] getMyManager failed:', error);
    throw error;
  }
}

/**
 * Get all direct reports for a manager
 */
export async function getMyReports(managerId) {
  if (!supabase || !managerId) return [];

  try {
    const { data, error } = await supabase
      .from('manager_relationships')
      .select(`
        id,
        employee_id,
        relationship_type,
        effective_date,
        employee:profiles!manager_relationships_employee_id_fkey (
          id, full_name, email, role, avatar_color, is_active
        )
      `)
      .eq('manager_id', managerId)
      .eq('is_primary', true)
      .is('end_date', null);

    if (error) {
      console.error('[CareerDevelopmentService] getMyReports error:', error);
      throw error;
    }

    // Filter to active employees only and return the employee data
    return (data || [])
      .filter(r => r.employee?.is_active)
      .map(r => ({
        ...r.employee,
        relationship_type: r.relationship_type,
        relationship_id: r.id
      }));
  } catch (error) {
    console.error('[CareerDevelopmentService] getMyReports failed:', error);
    throw error;
  }
}

/**
 * Set or update manager for an employee
 */
export async function setManager(employeeId, managerId, createdBy) {
  if (!supabase) throw new Error('Database not available');

  try {
    // First, end any existing primary manager relationships
    await supabase
      .from('manager_relationships')
      .update({
        end_date: new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString()
      })
      .eq('employee_id', employeeId)
      .eq('is_primary', true)
      .is('end_date', null);

    // Create new relationship
    const { data, error } = await supabase
      .from('manager_relationships')
      .insert({
        employee_id: employeeId,
        manager_id: managerId,
        is_primary: true,
        relationship_type: 'direct',
        effective_date: new Date().toISOString().split('T')[0],
        created_by: createdBy
      })
      .select()
      .single();

    if (error) {
      console.error('[CareerDevelopmentService] setManager error:', error);
      throw error;
    }

    // Also update the default_manager_id in profiles for quick lookup
    await supabase
      .from('profiles')
      .update({ default_manager_id: managerId })
      .eq('id', employeeId);

    return data;
  } catch (error) {
    console.error('[CareerDevelopmentService] setManager failed:', error);
    throw error;
  }
}

/**
 * Get all manager relationships (for org chart)
 */
export async function getOrgChart() {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('manager_relationships')
      .select(`
        id,
        employee_id,
        manager_id,
        relationship_type,
        employee:profiles!manager_relationships_employee_id_fkey (
          id, full_name, email, role, avatar_color
        ),
        manager:profiles!manager_relationships_manager_id_fkey (
          id, full_name, email, role, avatar_color
        )
      `)
      .eq('is_primary', true)
      .is('end_date', null);

    if (error) {
      console.error('[CareerDevelopmentService] getOrgChart error:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('[CareerDevelopmentService] getOrgChart failed:', error);
    throw error;
  }
}

// ============================================================================
// SELF EVALUATIONS
// ============================================================================

/**
 * Get all self-evaluations for an employee in a cycle
 */
export async function getSelfEvaluations(employeeId, cycleId) {
  if (!supabase || !employeeId || !cycleId) return [];

  try {
    const { data, error } = await supabase
      .from('skill_self_evaluations')
      .select(`
        id,
        skill_id,
        self_rating,
        self_notes,
        submitted_at,
        created_at,
        updated_at,
        skill:global_skills (
          id, name, category, description, training_urls,
          class:skill_classes (id, name, label)
        )
      `)
      .eq('employee_id', employeeId)
      .eq('review_cycle_id', cycleId);

    if (error) {
      console.error('[CareerDevelopmentService] getSelfEvaluations error:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('[CareerDevelopmentService] getSelfEvaluations failed:', error);
    throw error;
  }
}

/**
 * Save a single self-evaluation (upsert)
 */
export async function saveSelfEvaluation(cycleId, employeeId, skillId, rating, notes = null) {
  if (!supabase) throw new Error('Database not available');

  try {
    const { data, error } = await supabase
      .from('skill_self_evaluations')
      .upsert({
        review_cycle_id: cycleId,
        employee_id: employeeId,
        skill_id: skillId,
        self_rating: rating,
        self_notes: notes,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'review_cycle_id,employee_id,skill_id'
      })
      .select()
      .single();

    if (error) {
      console.error('[CareerDevelopmentService] saveSelfEvaluation error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[CareerDevelopmentService] saveSelfEvaluation failed:', error);
    throw error;
  }
}

/**
 * Submit all self-evaluations (marks them as submitted)
 */
export async function submitSelfEvaluations(cycleId, employeeId) {
  if (!supabase) throw new Error('Database not available');

  try {
    const now = new Date().toISOString();

    // Update all evaluations with submitted timestamp
    const { error: evalError } = await supabase
      .from('skill_self_evaluations')
      .update({
        submitted_at: now,
        updated_at: now
      })
      .eq('review_cycle_id', cycleId)
      .eq('employee_id', employeeId)
      .is('submitted_at', null);

    if (evalError) throw evalError;

    // Update or create review session
    const { data: session, error: sessionError } = await supabase
      .from('review_sessions')
      .upsert({
        review_cycle_id: cycleId,
        employee_id: employeeId,
        manager_id: (await getMyManager(employeeId))?.id,
        status: 'self_eval_complete',
        self_eval_submitted_at: now,
        updated_at: now
      }, {
        onConflict: 'review_cycle_id,employee_id'
      })
      .select()
      .single();

    if (sessionError) {
      console.error('[CareerDevelopmentService] submitSelfEvaluations session error:', sessionError);
    }

    return { success: true, session };
  } catch (error) {
    console.error('[CareerDevelopmentService] submitSelfEvaluations failed:', error);
    throw error;
  }
}

// ============================================================================
// MANAGER REVIEWS
// ============================================================================

/**
 * Get all manager reviews for an employee in a cycle
 */
export async function getManagerReviews(employeeId, cycleId) {
  if (!supabase || !employeeId || !cycleId) return [];

  try {
    const { data, error } = await supabase
      .from('skill_manager_reviews')
      .select(`
        id,
        skill_id,
        manager_id,
        manager_rating,
        manager_notes,
        submitted_at,
        created_at,
        updated_at,
        skill:global_skills (
          id, name, category, description, training_urls,
          class:skill_classes (id, name, label)
        )
      `)
      .eq('employee_id', employeeId)
      .eq('review_cycle_id', cycleId);

    if (error) {
      console.error('[CareerDevelopmentService] getManagerReviews error:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('[CareerDevelopmentService] getManagerReviews failed:', error);
    throw error;
  }
}

/**
 * Save a single manager review (upsert)
 */
export async function saveManagerReview(cycleId, employeeId, managerId, skillId, rating, notes = null) {
  if (!supabase) throw new Error('Database not available');

  try {
    const { data, error } = await supabase
      .from('skill_manager_reviews')
      .upsert({
        review_cycle_id: cycleId,
        employee_id: employeeId,
        manager_id: managerId,
        skill_id: skillId,
        manager_rating: rating,
        manager_notes: notes,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'review_cycle_id,employee_id,skill_id'
      })
      .select()
      .single();

    if (error) {
      console.error('[CareerDevelopmentService] saveManagerReview error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[CareerDevelopmentService] saveManagerReview failed:', error);
    throw error;
  }
}

/**
 * Submit all manager reviews and update review session
 */
export async function submitManagerReviews(cycleId, employeeId, managerId) {
  if (!supabase) throw new Error('Database not available');

  try {
    const now = new Date().toISOString();

    // Update all reviews with submitted timestamp
    const { error: reviewError } = await supabase
      .from('skill_manager_reviews')
      .update({
        submitted_at: now,
        updated_at: now
      })
      .eq('review_cycle_id', cycleId)
      .eq('employee_id', employeeId)
      .eq('manager_id', managerId)
      .is('submitted_at', null);

    if (reviewError) throw reviewError;

    // Update review session
    const { data: session, error: sessionError } = await supabase
      .from('review_sessions')
      .update({
        status: 'manager_review_complete',
        manager_review_submitted_at: now,
        updated_at: now
      })
      .eq('review_cycle_id', cycleId)
      .eq('employee_id', employeeId)
      .select()
      .single();

    if (sessionError) {
      console.error('[CareerDevelopmentService] submitManagerReviews session error:', sessionError);
    }

    return { success: true, session };
  } catch (error) {
    console.error('[CareerDevelopmentService] submitManagerReviews failed:', error);
    throw error;
  }
}

/**
 * Finalize review - copy manager ratings to official employee_skills
 */
export async function finalizeReview(sessionId, managerId, managerName) {
  if (!supabase) throw new Error('Database not available');

  try {
    // Get the session details
    const { data: session, error: sessionError } = await supabase
      .from('review_sessions')
      .select('*, review_cycle:review_cycles(*)')
      .eq('id', sessionId)
      .single();

    if (sessionError) throw sessionError;

    const cycleId = session.review_cycle_id;
    const employeeId = session.employee_id;
    const now = new Date().toISOString();

    // Get all submitted manager reviews
    const { data: reviews, error: reviewsError } = await supabase
      .from('skill_manager_reviews')
      .select('*')
      .eq('review_cycle_id', cycleId)
      .eq('employee_id', employeeId)
      .not('submitted_at', 'is', null);

    if (reviewsError) throw reviewsError;

    // Update employee_skills with the manager ratings
    for (const review of reviews || []) {
      // Get current employee_skill record
      const { data: currentSkill } = await supabase
        .from('employee_skills')
        .select('id, proficiency_level')
        .eq('employee_id', employeeId)
        .eq('skill_id', review.skill_id)
        .single();

      const oldRating = currentSkill?.proficiency_level || 'none';
      const newRating = review.manager_rating;

      // Upsert to employee_skills
      await supabase
        .from('employee_skills')
        .upsert({
          employee_id: employeeId,
          skill_id: review.skill_id,
          proficiency_level: newRating === 'none' ? 'training' : newRating, // Map 'none' to 'training' for official record
          last_reviewed_at: now,
          last_reviewed_by: managerId,
          last_reviewed_by_name: managerName,
          review_cycle_id: cycleId,
          certified_at: now,
          certified_by: managerId,
          certified_by_name: managerName,
          updated_at: now
        }, {
          onConflict: 'employee_id,skill_id'
        });

      // Record in history
      await supabase
        .from('skill_review_history')
        .insert({
          source_type: 'official_update',
          source_id: review.id,
          skill_id: review.skill_id,
          employee_id: employeeId,
          old_rating: oldRating,
          new_rating: newRating,
          changed_by: managerId,
          changed_by_name: managerName,
          change_notes: `Review finalized from ${session.review_cycle?.name || 'review cycle'}`,
          review_cycle_id: cycleId
        });
    }

    // Update session status to completed
    const { data: updatedSession, error: updateError } = await supabase
      .from('review_sessions')
      .update({
        status: 'completed',
        manager_signature_at: now,
        updated_at: now
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (updateError) throw updateError;

    return updatedSession;
  } catch (error) {
    console.error('[CareerDevelopmentService] finalizeReview failed:', error);
    throw error;
  }
}

// ============================================================================
// DEVELOPMENT GOALS
// ============================================================================

/**
 * Get development goals for an employee in a cycle
 */
export async function getGoals(employeeId, cycleId) {
  if (!supabase || !employeeId || !cycleId) return [];

  try {
    const { data, error } = await supabase
      .from('development_goals')
      .select(`
        id,
        skill_id,
        priority,
        target_level,
        current_level,
        action_plan,
        employee_agreed_at,
        manager_agreed_at,
        manager_id,
        progress_notes,
        achieved_at,
        achieved_level,
        created_at,
        skill:global_skills (
          id, name, category, description, training_urls,
          class:skill_classes (id, name, label)
        )
      `)
      .eq('employee_id', employeeId)
      .eq('review_cycle_id', cycleId)
      .order('priority', { ascending: true });

    if (error) {
      console.error('[CareerDevelopmentService] getGoals error:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('[CareerDevelopmentService] getGoals failed:', error);
    throw error;
  }
}

/**
 * Set a development goal (upsert)
 */
export async function setGoal(cycleId, employeeId, skillId, priority, targetLevel, actionPlan, managerId, createdBy) {
  if (!supabase) throw new Error('Database not available');

  try {
    // First check if we already have 5 goals
    const { data: existingGoals } = await supabase
      .from('development_goals')
      .select('id, priority')
      .eq('employee_id', employeeId)
      .eq('review_cycle_id', cycleId);

    // Check if this skill is already a goal
    const { data: existingSkillGoal } = await supabase
      .from('development_goals')
      .select('id')
      .eq('employee_id', employeeId)
      .eq('review_cycle_id', cycleId)
      .eq('skill_id', skillId)
      .single();

    // If not updating existing, check count
    if (!existingSkillGoal && (existingGoals?.length || 0) >= 5) {
      throw new Error('Maximum of 5 development goals per quarter');
    }

    // Get current skill level
    const { data: currentSkill } = await supabase
      .from('employee_skills')
      .select('proficiency_level')
      .eq('employee_id', employeeId)
      .eq('skill_id', skillId)
      .single();

    const { data, error } = await supabase
      .from('development_goals')
      .upsert({
        review_cycle_id: cycleId,
        employee_id: employeeId,
        skill_id: skillId,
        priority,
        target_level: targetLevel,
        current_level: currentSkill?.proficiency_level || 'none',
        action_plan: actionPlan,
        manager_id: managerId,
        created_by: createdBy,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'review_cycle_id,employee_id,skill_id'
      })
      .select()
      .single();

    if (error) {
      console.error('[CareerDevelopmentService] setGoal error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[CareerDevelopmentService] setGoal failed:', error);
    throw error;
  }
}

/**
 * Remove a development goal
 */
export async function removeGoal(goalId) {
  if (!supabase) throw new Error('Database not available');

  try {
    const { error } = await supabase
      .from('development_goals')
      .delete()
      .eq('id', goalId);

    if (error) {
      console.error('[CareerDevelopmentService] removeGoal error:', error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error('[CareerDevelopmentService] removeGoal failed:', error);
    throw error;
  }
}

/**
 * Update goal progress
 */
export async function updateGoalProgress(goalId, progressNotes, achieved = false, achievedLevel = null) {
  if (!supabase) throw new Error('Database not available');

  try {
    const updates = {
      progress_notes: progressNotes,
      updated_at: new Date().toISOString()
    };

    if (achieved) {
      updates.achieved_at = new Date().toISOString();
      updates.achieved_level = achievedLevel;
    }

    const { data, error } = await supabase
      .from('development_goals')
      .update(updates)
      .eq('id', goalId)
      .select()
      .single();

    if (error) {
      console.error('[CareerDevelopmentService] updateGoalProgress error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[CareerDevelopmentService] updateGoalProgress failed:', error);
    throw error;
  }
}

/**
 * Agree to goals (employee or manager sign-off)
 */
export async function agreeToGoals(cycleId, employeeId, role, userId) {
  if (!supabase) throw new Error('Database not available');

  try {
    const now = new Date().toISOString();
    const updateField = role === 'employee' ? 'employee_agreed_at' : 'manager_agreed_at';

    const { error } = await supabase
      .from('development_goals')
      .update({
        [updateField]: now,
        updated_at: now
      })
      .eq('review_cycle_id', cycleId)
      .eq('employee_id', employeeId);

    if (error) {
      console.error('[CareerDevelopmentService] agreeToGoals error:', error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error('[CareerDevelopmentService] agreeToGoals failed:', error);
    throw error;
  }
}

// ============================================================================
// REVIEW SESSIONS
// ============================================================================

/**
 * Get or create review session
 */
export async function getSession(cycleId, employeeId) {
  if (!supabase || !cycleId || !employeeId) return null;

  try {
    const { data, error } = await supabase
      .from('review_sessions')
      .select(`
        *,
        employee:profiles!review_sessions_employee_id_fkey (
          id, full_name, email, role, avatar_color
        ),
        manager:profiles!review_sessions_manager_id_fkey (
          id, full_name, email, role, avatar_color
        ),
        review_cycle:review_cycles (*)
      `)
      .eq('review_cycle_id', cycleId)
      .eq('employee_id', employeeId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[CareerDevelopmentService] getSession error:', error);
      throw error;
    }

    return data || null;
  } catch (error) {
    console.error('[CareerDevelopmentService] getSession failed:', error);
    throw error;
  }
}

/**
 * Schedule review meeting
 */
export async function scheduleMeeting(sessionId, meetingDate, managerId) {
  if (!supabase) throw new Error('Database not available');

  try {
    const { data, error } = await supabase
      .from('review_sessions')
      .update({
        meeting_date: meetingDate,
        status: 'meeting_scheduled',
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      console.error('[CareerDevelopmentService] scheduleMeeting error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[CareerDevelopmentService] scheduleMeeting failed:', error);
    throw error;
  }
}

/**
 * Complete review meeting
 */
export async function completeMeeting(sessionId, meetingNotes, overallRating, managerId) {
  if (!supabase) throw new Error('Database not available');

  try {
    const { data, error } = await supabase
      .from('review_sessions')
      .update({
        meeting_notes: meetingNotes,
        overall_rating: overallRating,
        updated_at: new Date().toISOString()
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      console.error('[CareerDevelopmentService] completeMeeting error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[CareerDevelopmentService] completeMeeting failed:', error);
    throw error;
  }
}

/**
 * Sign off on review (employee or manager)
 */
export async function signOff(sessionId, role, userId) {
  if (!supabase) throw new Error('Database not available');

  try {
    const now = new Date().toISOString();
    const updateField = role === 'employee' ? 'employee_signature_at' : 'manager_signature_at';

    const { data, error } = await supabase
      .from('review_sessions')
      .update({
        [updateField]: now,
        updated_at: now
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      console.error('[CareerDevelopmentService] signOff error:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('[CareerDevelopmentService] signOff failed:', error);
    throw error;
  }
}

// ============================================================================
// COMPARISON & HISTORY
// ============================================================================

/**
 * Get comparison view (self vs manager ratings side by side)
 */
export async function getComparisonView(employeeId, cycleId) {
  if (!supabase || !employeeId || !cycleId) return [];

  try {
    // Get all skills
    const { data: skills, error: skillsError } = await supabase
      .from('global_skills')
      .select(`
        id, name, category, description, training_urls, sort_order,
        class:skill_classes (id, name, label, category_id),
        category_info:skill_categories!global_skills_category_fkey (id, label, color)
      `)
      .eq('is_active', true)
      .order('category')
      .order('sort_order');

    if (skillsError) throw skillsError;

    // Get self evaluations
    const { data: selfEvals, error: selfError } = await supabase
      .from('skill_self_evaluations')
      .select('skill_id, self_rating, self_notes, submitted_at')
      .eq('employee_id', employeeId)
      .eq('review_cycle_id', cycleId);

    if (selfError) throw selfError;

    // Get manager reviews
    const { data: managerReviews, error: managerError } = await supabase
      .from('skill_manager_reviews')
      .select('skill_id, manager_rating, manager_notes, submitted_at')
      .eq('employee_id', employeeId)
      .eq('review_cycle_id', cycleId);

    if (managerError) throw managerError;

    // Get current official ratings
    const { data: officialRatings, error: officialError } = await supabase
      .from('employee_skills')
      .select('skill_id, proficiency_level')
      .eq('employee_id', employeeId);

    if (officialError) throw officialError;

    // Build comparison map
    const selfMap = new Map(selfEvals?.map(s => [s.skill_id, s]) || []);
    const managerMap = new Map(managerReviews?.map(m => [m.skill_id, m]) || []);
    const officialMap = new Map(officialRatings?.map(o => [o.skill_id, o.proficiency_level]) || []);

    // Combine into comparison view
    const comparison = (skills || []).map(skill => ({
      skill,
      official_rating: officialMap.get(skill.id) || 'none',
      self_eval: selfMap.get(skill.id) || null,
      manager_review: managerMap.get(skill.id) || null,
      has_discrepancy: selfMap.get(skill.id)?.self_rating !== managerMap.get(skill.id)?.manager_rating
    }));

    // Group by category
    const grouped = comparison.reduce((acc, item) => {
      const category = item.skill.category || 'Other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(item);
      return acc;
    }, {});

    return grouped;
  } catch (error) {
    console.error('[CareerDevelopmentService] getComparisonView failed:', error);
    throw error;
  }
}

/**
 * Get history for a specific skill
 */
export async function getSkillHistory(employeeId, skillId) {
  if (!supabase || !employeeId || !skillId) return [];

  try {
    const { data, error } = await supabase
      .from('skill_review_history')
      .select(`
        *,
        review_cycle:review_cycles (id, name, year, quarter)
      `)
      .eq('employee_id', employeeId)
      .eq('skill_id', skillId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[CareerDevelopmentService] getSkillHistory error:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('[CareerDevelopmentService] getSkillHistory failed:', error);
    throw error;
  }
}

/**
 * Get all review history for an employee
 */
export async function getReviewHistory(employeeId) {
  if (!supabase || !employeeId) return [];

  try {
    const { data, error } = await supabase
      .from('skill_review_history')
      .select(`
        *,
        skill:global_skills (id, name, category),
        review_cycle:review_cycles (id, name, year, quarter)
      `)
      .eq('employee_id', employeeId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[CareerDevelopmentService] getReviewHistory error:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('[CareerDevelopmentService] getReviewHistory failed:', error);
    throw error;
  }
}

// ============================================================================
// DASHBOARD & NOTIFICATIONS
// ============================================================================

/**
 * Get pending actions for a user (what needs attention)
 */
export async function getPendingActions(userId, userRole) {
  if (!supabase || !userId) return { selfEval: [], managerReviews: [], goals: [] };

  try {
    const actions = {
      selfEval: [],
      managerReviews: [],
      goals: []
    };

    // Get current cycle
    const cycle = await getCurrentCycle();
    if (!cycle) return actions;

    // Check if user needs to complete self-eval
    if (cycle.status === 'self_eval') {
      const { data: session } = await supabase
        .from('review_sessions')
        .select('self_eval_submitted_at')
        .eq('review_cycle_id', cycle.id)
        .eq('employee_id', userId)
        .single();

      if (!session?.self_eval_submitted_at) {
        actions.selfEval.push({
          type: 'self_eval_pending',
          cycle,
          dueDate: cycle.self_eval_due_date
        });
      }
    }

    // Check if user (as manager) has reviews to complete
    if (['manager', 'director', 'admin', 'owner'].includes(userRole) && cycle.status === 'manager_review') {
      const reports = await getMyReports(userId);

      for (const report of reports) {
        const { data: session } = await supabase
          .from('review_sessions')
          .select('manager_review_submitted_at, self_eval_submitted_at')
          .eq('review_cycle_id', cycle.id)
          .eq('employee_id', report.id)
          .single();

        if (session?.self_eval_submitted_at && !session?.manager_review_submitted_at) {
          actions.managerReviews.push({
            type: 'manager_review_pending',
            employee: report,
            cycle,
            dueDate: cycle.manager_review_due_date
          });
        }
      }
    }

    // Check for goals needing attention
    const { data: goals } = await supabase
      .from('development_goals')
      .select('*, skill:global_skills(name)')
      .eq('employee_id', userId)
      .eq('review_cycle_id', cycle.id)
      .is('achieved_at', null);

    actions.goals = goals || [];

    return actions;
  } catch (error) {
    console.error('[CareerDevelopmentService] getPendingActions failed:', error);
    return { selfEval: [], managerReviews: [], goals: [] };
  }
}

/**
 * Get team review status for a manager
 */
export async function getTeamReviewStatus(managerId, cycleId) {
  if (!supabase || !managerId || !cycleId) return [];

  try {
    const reports = await getMyReports(managerId);

    const status = await Promise.all(reports.map(async (report) => {
      const session = await getSession(cycleId, report.id);
      const selfEvals = await getSelfEvaluations(report.id, cycleId);
      const managerReviews = await getManagerReviews(report.id, cycleId);
      const goals = await getGoals(report.id, cycleId);

      return {
        employee: report,
        session,
        selfEvalsCount: selfEvals.filter(e => e.submitted_at).length,
        managerReviewsCount: managerReviews.filter(r => r.submitted_at).length,
        goalsCount: goals.length,
        status: session?.status || 'pending'
      };
    }));

    return status;
  } catch (error) {
    console.error('[CareerDevelopmentService] getTeamReviewStatus failed:', error);
    throw error;
  }
}

// ============================================================================
// SKILLS DATA (for populating forms)
// ============================================================================

/**
 * Get all active skills grouped by category
 */
export async function getAllSkillsGrouped() {
  if (!supabase) return {};

  try {
    const { data, error } = await supabase
      .from('global_skills')
      .select(`
        id, name, category, description, training_urls, sort_order,
        class:skill_classes (id, name, label),
        category_info:skill_categories (id, name, label, color)
      `)
      .eq('is_active', true)
      .order('category')
      .order('sort_order');

    if (error) throw error;

    // Group by category
    const grouped = (data || []).reduce((acc, skill) => {
      const category = skill.category || 'Other';
      if (!acc[category]) {
        acc[category] = {
          info: skill.category_info,
          skills: []
        };
      }
      acc[category].skills.push(skill);
      return acc;
    }, {});

    return grouped;
  } catch (error) {
    console.error('[CareerDevelopmentService] getAllSkillsGrouped failed:', error);
    throw error;
  }
}

// Export all functions as a service object
export const careerDevelopmentService = {
  // Cycles
  getCurrentCycle,
  getAllCycles,
  createCycle,
  updateCycle,
  updateCycleStatus,
  deleteCycle,

  // Manager relationships
  getMyManager,
  getMyReports,
  setManager,
  getOrgChart,

  // Self evaluations
  getSelfEvaluations,
  saveSelfEvaluation,
  submitSelfEvaluations,

  // Manager reviews
  getManagerReviews,
  saveManagerReview,
  submitManagerReviews,
  finalizeReview,

  // Development goals
  getGoals,
  setGoal,
  removeGoal,
  updateGoalProgress,
  agreeToGoals,

  // Review sessions
  getSession,
  scheduleMeeting,
  completeMeeting,
  signOff,

  // Comparison & history
  getComparisonView,
  getSkillHistory,
  getReviewHistory,

  // Dashboard
  getPendingActions,
  getTeamReviewStatus,

  // Skills data
  getAllSkillsGrouped
};

export default careerDevelopmentService;
