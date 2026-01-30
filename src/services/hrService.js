/**
 * hrService.js
 *
 * Service layer for HR functionality including:
 * - Employee Notes (quick capture for reviews)
 * - PTO/Time Off management
 * - Company holidays
 */

import { supabase } from '../lib/supabase';

// ============================================================================
// EMPLOYEE NOTES
// Quick capture thoughts about employees (or self) for use in reviews
// ============================================================================

/**
 * Get notes about a specific employee
 * @param {string} subjectEmployeeId - Employee the notes are about
 * @param {object} options - Filter options
 * @returns {Promise<Array>} Notes with author info
 */
export const getNotesAboutEmployee = async (subjectEmployeeId, options = {}) => {
  const { includePrivate = false, reviewCycleId = null, noteType = null, limit = 50 } = options;

  let query = supabase
    .from('employee_notes')
    .select(`
      *,
      author:profiles!employee_notes_author_id_fkey(id, full_name, avatar_color),
      subject:profiles!employee_notes_subject_employee_id_fkey(id, full_name, avatar_color)
    `)
    .eq('subject_employee_id', subjectEmployeeId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!includePrivate) {
    query = query.eq('is_private', false);
  }

  if (reviewCycleId) {
    query = query.eq('review_cycle_id', reviewCycleId);
  }

  if (noteType) {
    query = query.eq('note_type', noteType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

/**
 * Get notes written by a specific author
 * @param {string} authorId - User who wrote the notes
 * @param {object} options - Filter options
 * @returns {Promise<Array>} Notes with subject info
 */
export const getNotesByAuthor = async (authorId, options = {}) => {
  const { subjectEmployeeId = null, noteType = null, limit = 50 } = options;

  let query = supabase
    .from('employee_notes')
    .select(`
      *,
      author:profiles!employee_notes_author_id_fkey(id, full_name, avatar_color),
      subject:profiles!employee_notes_subject_employee_id_fkey(id, full_name, avatar_color)
    `)
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (subjectEmployeeId) {
    query = query.eq('subject_employee_id', subjectEmployeeId);
  }

  if (noteType) {
    query = query.eq('note_type', noteType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

/**
 * Get unincorporated notes for a review cycle
 * Notes that haven't been added to a review session yet
 * @param {string} employeeId - Employee to get notes for
 * @param {string} reviewCycleId - Current review cycle
 * @returns {Promise<Array>} Unincorporated notes
 */
export const getUnincorporatedNotes = async (employeeId, reviewCycleId) => {
  const { data, error } = await supabase
    .from('employee_notes')
    .select(`
      *,
      author:profiles!employee_notes_author_id_fkey(id, full_name, avatar_color)
    `)
    .eq('subject_employee_id', employeeId)
    .is('incorporated_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

/**
 * Create a new employee note
 * @param {object} noteData - Note information
 * @returns {Promise<object>} Created note
 */
export const createNote = async ({
  subjectEmployeeId,
  authorId,
  noteText,
  noteType = 'general',
  reviewCycleId = null,
  isPrivate = false
}) => {
  const { data, error } = await supabase
    .from('employee_notes')
    .insert({
      subject_employee_id: subjectEmployeeId,
      author_id: authorId,
      note_text: noteText,
      note_type: noteType,
      review_cycle_id: reviewCycleId,
      is_private: isPrivate
    })
    .select(`
      *,
      author:profiles!employee_notes_author_id_fkey(id, full_name, avatar_color),
      subject:profiles!employee_notes_subject_employee_id_fkey(id, full_name, avatar_color)
    `)
    .single();

  if (error) throw error;
  return data;
};

/**
 * Update an existing note
 * @param {string} noteId - Note to update
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} Updated note
 */
export const updateNote = async (noteId, updates) => {
  const { data, error } = await supabase
    .from('employee_notes')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', noteId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Mark a note as incorporated into a review
 * @param {string} noteId - Note to mark
 * @param {string} reviewSessionId - Review session it was incorporated into
 * @returns {Promise<object>} Updated note
 */
export const markNoteIncorporated = async (noteId, reviewSessionId) => {
  return updateNote(noteId, {
    incorporated_at: new Date().toISOString(),
    incorporated_into_session_id: reviewSessionId
  });
};

/**
 * Delete a note
 * @param {string} noteId - Note to delete
 * @returns {Promise<void>}
 */
export const deleteNote = async (noteId) => {
  const { error } = await supabase
    .from('employee_notes')
    .delete()
    .eq('id', noteId);

  if (error) throw error;
};

// ============================================================================
// PTO TYPES
// ============================================================================

/**
 * Get all active PTO types
 * @returns {Promise<Array>} PTO type definitions
 */
export const getPTOTypes = async () => {
  const { data, error } = await supabase
    .from('pto_types')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw error;
  return data || [];
};

// ============================================================================
// PTO BALANCES
// ============================================================================

/**
 * Get PTO balances for an employee
 * @param {string} employeeId - Employee to get balances for
 * @param {number} year - Year to get balances for (default: current year)
 * @returns {Promise<Array>} Balances with PTO type info
 */
export const getPTOBalances = async (employeeId, year = new Date().getFullYear()) => {
  const { data, error } = await supabase
    .from('pto_balances')
    .select(`
      *,
      pto_type:pto_types(*)
    `)
    .eq('employee_id', employeeId)
    .eq('year', year);

  if (error) throw error;
  return data || [];
};

/**
 * Initialize PTO balances for an employee (typically for new hires or new year)
 * @param {string} employeeId - Employee to initialize
 * @param {number} year - Year to initialize (default: current year)
 * @returns {Promise<Array>} Created balance records
 */
export const initializePTOBalances = async (employeeId, year = new Date().getFullYear()) => {
  // Get all active PTO types
  const types = await getPTOTypes();

  const balances = [];
  for (const type of types) {
    // Check if balance already exists
    const { data: existing } = await supabase
      .from('pto_balances')
      .select('id')
      .eq('employee_id', employeeId)
      .eq('pto_type_id', type.id)
      .eq('year', year)
      .single();

    if (!existing) {
      const { data, error } = await supabase
        .from('pto_balances')
        .insert({
          employee_id: employeeId,
          pto_type_id: type.id,
          year: year,
          balance_hours: 0,
          carryover_hours: 0
        })
        .select()
        .single();

      if (!error && data) {
        balances.push(data);
      }
    }
  }

  return balances;
};

/**
 * Adjust PTO balance (admin function)
 * @param {string} balanceId - Balance record to adjust
 * @param {number} adjustmentHours - Hours to add (positive) or remove (negative)
 * @param {string} notes - Reason for adjustment
 * @returns {Promise<object>} Updated balance
 */
export const adjustPTOBalance = async (balanceId, adjustmentHours, notes) => {
  // Get current balance
  const { data: current, error: fetchError } = await supabase
    .from('pto_balances')
    .select('balance_hours, adjustment_hours')
    .eq('id', balanceId)
    .single();

  if (fetchError) throw fetchError;

  const { data, error } = await supabase
    .from('pto_balances')
    .update({
      balance_hours: (current.balance_hours || 0) + adjustmentHours,
      adjustment_hours: (current.adjustment_hours || 0) + adjustmentHours,
      adjustment_notes: notes,
      updated_at: new Date().toISOString()
    })
    .eq('id', balanceId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ============================================================================
// PTO REQUESTS
// ============================================================================

/**
 * Get PTO requests for an employee
 * @param {string} employeeId - Employee to get requests for
 * @param {object} options - Filter options
 * @returns {Promise<Array>} Requests with type and approver info
 */
export const getPTORequests = async (employeeId, options = {}) => {
  const { status = null, year = null, limit = 50 } = options;

  let query = supabase
    .from('pto_requests')
    .select(`
      *,
      pto_type:pto_types(*),
      approver:profiles!pto_requests_approver_id_fkey(id, full_name, avatar_color)
    `)
    .eq('employee_id', employeeId)
    .order('start_date', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  if (year) {
    query = query.gte('start_date', `${year}-01-01`).lte('end_date', `${year}-12-31`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

/**
 * Get pending PTO requests for a manager's direct reports
 * @param {string} managerId - Manager to get requests for
 * @returns {Promise<Array>} Pending requests with employee info
 */
export const getPendingRequestsForManager = async (managerId) => {
  // First get manager's direct reports
  const { data: relationships, error: relError } = await supabase
    .from('manager_relationships')
    .select('employee_id')
    .eq('manager_id', managerId)
    .eq('is_primary', true)
    .is('end_date', null);

  if (relError) throw relError;

  const employeeIds = relationships?.map(r => r.employee_id) || [];
  if (employeeIds.length === 0) return [];

  const { data, error } = await supabase
    .from('pto_requests')
    .select(`
      *,
      pto_type:pto_types(*),
      employee:profiles!pto_requests_employee_id_fkey(id, full_name, avatar_color, email)
    `)
    .in('employee_id', employeeIds)
    .eq('status', 'pending')
    .order('start_date', { ascending: true });

  if (error) throw error;
  return data || [];
};

/**
 * Create a new PTO request
 * @param {object} requestData - Request information
 * @returns {Promise<object>} Created request
 */
export const createPTORequest = async ({
  employeeId,
  ptoTypeId,
  startDate,
  endDate,
  hoursRequested,
  isPartialDay = false,
  partialDayHours = null,
  employeeNotes = null
}) => {
  // Get current balance for snapshot
  const { data: balance } = await supabase
    .from('pto_balances')
    .select('balance_hours')
    .eq('employee_id', employeeId)
    .eq('pto_type_id', ptoTypeId)
    .eq('year', new Date(startDate).getFullYear())
    .single();

  const { data, error } = await supabase
    .from('pto_requests')
    .insert({
      employee_id: employeeId,
      pto_type_id: ptoTypeId,
      start_date: startDate,
      end_date: endDate,
      hours_requested: hoursRequested,
      is_partial_day: isPartialDay,
      partial_day_hours: partialDayHours,
      employee_notes: employeeNotes,
      balance_at_request: balance?.balance_hours || 0,
      status: 'pending'
    })
    .select(`
      *,
      pto_type:pto_types(*)
    `)
    .single();

  if (error) throw error;
  return data;
};

/**
 * Approve a PTO request
 * @param {string} requestId - Request to approve
 * @param {string} approverId - Manager approving
 * @param {string} notes - Optional approval notes
 * @returns {Promise<object>} Updated request
 */
export const approvePTORequest = async (requestId, approverId, notes = null) => {
  const { data, error } = await supabase
    .from('pto_requests')
    .update({
      status: 'approved',
      approver_id: approverId,
      approved_at: new Date().toISOString(),
      approver_notes: notes,
      updated_at: new Date().toISOString()
    })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Deny a PTO request
 * @param {string} requestId - Request to deny
 * @param {string} approverId - Manager denying
 * @param {string} notes - Reason for denial
 * @returns {Promise<object>} Updated request
 */
export const denyPTORequest = async (requestId, approverId, notes) => {
  const { data, error } = await supabase
    .from('pto_requests')
    .update({
      status: 'denied',
      approver_id: approverId,
      approved_at: new Date().toISOString(),
      approver_notes: notes,
      updated_at: new Date().toISOString()
    })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Cancel a PTO request
 * @param {string} requestId - Request to cancel
 * @returns {Promise<object>} Updated request
 */
export const cancelPTORequest = async (requestId) => {
  const { data, error } = await supabase
    .from('pto_requests')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString()
    })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ============================================================================
// COMPANY HOLIDAYS
// ============================================================================

/**
 * Get company holidays for a year
 * @param {number} year - Year to get holidays for
 * @returns {Promise<Array>} Holiday list
 */
export const getCompanyHolidays = async (year = new Date().getFullYear()) => {
  const { data, error } = await supabase
    .from('company_holidays')
    .select('*')
    .eq('year', year)
    .order('date');

  if (error) throw error;
  return data || [];
};

/**
 * Check if a date is a company holiday
 * @param {string} date - Date to check (YYYY-MM-DD)
 * @returns {Promise<object|null>} Holiday info or null
 */
export const isCompanyHoliday = async (date) => {
  const { data, error } = await supabase
    .from('company_holidays')
    .select('*')
    .eq('date', date)
    .eq('is_company_closed', true)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
  return data || null;
};

// ============================================================================
// TEAM TIME OFF VIEW (for managers)
// ============================================================================

/**
 * Get upcoming time off for a manager's team
 * @param {string} managerId - Manager to get team for
 * @param {number} daysAhead - How many days to look ahead
 * @returns {Promise<Array>} Upcoming approved time off
 */
export const getTeamUpcomingTimeOff = async (managerId, daysAhead = 30) => {
  // Get manager's direct reports
  const { data: relationships, error: relError } = await supabase
    .from('manager_relationships')
    .select('employee_id')
    .eq('manager_id', managerId)
    .eq('is_primary', true)
    .is('end_date', null);

  if (relError) throw relError;

  const employeeIds = relationships?.map(r => r.employee_id) || [];
  if (employeeIds.length === 0) return [];

  const today = new Date().toISOString().split('T')[0];
  const futureDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('pto_requests')
    .select(`
      *,
      pto_type:pto_types(*),
      employee:profiles!pto_requests_employee_id_fkey(id, full_name, avatar_color)
    `)
    .in('employee_id', employeeIds)
    .eq('status', 'approved')
    .gte('end_date', today)
    .lte('start_date', futureDate)
    .order('start_date', { ascending: true });

  if (error) throw error;
  return data || [];
};

// ============================================================================
// EMPLOYEE PTO ALLOCATIONS (Manager-assigned hours)
// ============================================================================

/**
 * Get PTO allocations for an employee
 * @param {string} employeeId - Employee to get allocations for
 * @param {number} year - Year to get allocations for
 * @returns {Promise<Array>} Allocations with PTO type info
 */
export const getEmployeePTOAllocations = async (employeeId, year = new Date().getFullYear()) => {
  const { data, error } = await supabase
    .from('employee_pto_allocations')
    .select(`
      *,
      pto_type:pto_types(*),
      allocated_by_user:profiles!employee_pto_allocations_allocated_by_fkey(id, full_name)
    `)
    .eq('employee_id', employeeId)
    .eq('year', year);

  if (error) throw error;
  return data || [];
};

/**
 * Get PTO allocations for all direct reports of a manager
 * @param {string} managerId - Manager to get team allocations for
 * @param {number} year - Year
 * @returns {Promise<Array>} Allocations grouped by employee
 */
export const getTeamPTOAllocations = async (managerId, year = new Date().getFullYear()) => {
  // Get manager's direct reports
  const { data: relationships, error: relError } = await supabase
    .from('manager_relationships')
    .select(`
      employee_id,
      employee:profiles!manager_relationships_employee_id_fkey(id, full_name, email, avatar_color)
    `)
    .eq('manager_id', managerId)
    .eq('is_primary', true)
    .is('end_date', null);

  if (relError) throw relError;

  const employeeIds = relationships?.map(r => r.employee_id) || [];
  if (employeeIds.length === 0) return [];

  // Get all allocations for these employees
  const { data: allocations, error: allocError } = await supabase
    .from('employee_pto_allocations')
    .select(`
      *,
      pto_type:pto_types(*)
    `)
    .in('employee_id', employeeIds)
    .eq('year', year);

  if (allocError) throw allocError;

  // Get all PTO types for defaults
  const { data: ptoTypes } = await supabase
    .from('pto_types')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  // Group allocations by employee
  return relationships.map(r => ({
    employee: r.employee,
    allocations: ptoTypes.map(type => {
      const existing = allocations?.find(
        a => a.employee_id === r.employee_id && a.pto_type_id === type.id
      );
      return {
        pto_type: type,
        pto_type_id: type.id,
        allocated_hours: existing?.allocated_hours ?? (type.accrues_monthly ? type.monthly_accrual_hours * 12 : 0),
        is_custom: !!existing,
        allocation_id: existing?.id || null,
        notes: existing?.notes || null
      };
    })
  }));
};

/**
 * Set PTO allocation for an employee
 * @param {object} params - Allocation parameters
 * @returns {Promise<object>} Created/updated allocation
 */
export const setPTOAllocation = async ({
  employeeId,
  ptoTypeId,
  year = new Date().getFullYear(),
  allocatedHours,
  allocatedBy,
  notes = null
}) => {
  const { data, error } = await supabase
    .from('employee_pto_allocations')
    .upsert({
      employee_id: employeeId,
      pto_type_id: ptoTypeId,
      year,
      allocated_hours: allocatedHours,
      allocated_by: allocatedBy,
      notes,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'employee_id,pto_type_id,year'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Delete a custom allocation (revert to company default)
 * @param {string} allocationId - Allocation to delete
 * @returns {Promise<void>}
 */
export const deletePTOAllocation = async (allocationId) => {
  const { error } = await supabase
    .from('employee_pto_allocations')
    .delete()
    .eq('id', allocationId);

  if (error) throw error;
};

/**
 * Copy allocations from one year to another for an employee
 * @param {string} employeeId - Employee
 * @param {number} fromYear - Source year
 * @param {number} toYear - Target year
 * @param {string} allocatedBy - Who is copying
 * @returns {Promise<Array>} New allocations
 */
export const copyAllocationsToYear = async (employeeId, fromYear, toYear, allocatedBy) => {
  // Get existing allocations
  const existing = await getEmployeePTOAllocations(employeeId, fromYear);

  // Create new allocations for target year
  const newAllocations = [];
  for (const alloc of existing) {
    const result = await setPTOAllocation({
      employeeId,
      ptoTypeId: alloc.pto_type_id,
      year: toYear,
      allocatedHours: alloc.allocated_hours,
      allocatedBy,
      notes: `Copied from ${fromYear}`
    });
    newAllocations.push(result);
  }

  return newAllocations;
};

// Export as named object for consistency
export const hrService = {
  // Notes
  getNotesAboutEmployee,
  getNotesByAuthor,
  getUnincorporatedNotes,
  createNote,
  updateNote,
  markNoteIncorporated,
  deleteNote,

  // PTO Types
  getPTOTypes,

  // PTO Balances
  getPTOBalances,
  initializePTOBalances,
  adjustPTOBalance,

  // PTO Allocations (Manager-assigned)
  getEmployeePTOAllocations,
  getTeamPTOAllocations,
  setPTOAllocation,
  deletePTOAllocation,
  copyAllocationsToYear,

  // PTO Requests
  getPTORequests,
  getPendingRequestsForManager,
  createPTORequest,
  approvePTORequest,
  denyPTORequest,
  cancelPTORequest,

  // Holidays
  getCompanyHolidays,
  isCompanyHoliday,

  // Team views
  getTeamUpcomingTimeOff
};

export default hrService;
