/**
 * weeklyPlanningService.js
 * Service for Weekly Planning "Air Traffic Control" interface
 * Handles week schedules, buffer checking, drag-drop operations
 */

import { supabase } from '../lib/supabase';

// Constants
const BUFFER_MINUTES = 30;
const DEFAULT_DURATION_MINUTES = 120; // 2 hours

/**
 * Helper: Convert time string to minutes since midnight
 */
const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Helper: Convert minutes since midnight to time string
 */
const minutesToTime = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

/**
 * Helper: Get start of week (Monday)
 */
const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  return new Date(d.setDate(diff));
};

/**
 * Helper: Get end of week (Sunday)
 */
const getWeekEnd = (date) => {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
};

/**
 * Helper: Format date to YYYY-MM-DD
 */
const formatDate = (date) => {
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

// ============================================================================
// WEEKLY PLANNING SERVICE
// ============================================================================

export const weeklyPlanningService = {
  /**
   * Get schedules for a date range with ticket details
   */
  async getSchedulesForDateRange(startDate, endDate, technicianId = null) {
    if (!supabase) return [];

    try {
      let query = supabase
        .from('service_schedules')
        .select(`
          *,
          ticket:service_tickets(
            id,
            ticket_number,
            title,
            status,
            priority,
            category,
            estimated_hours,
            customer_name,
            customer_phone,
            customer_email,
            service_address
          )
        `)
        .gte('scheduled_date', formatDate(startDate))
        .lte('scheduled_date', formatDate(endDate))
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time_start', { ascending: true });

      if (technicianId) {
        query = query.eq('technician_id', technicianId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[WeeklyPlanningService] Failed to fetch schedules:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('[WeeklyPlanningService] Failed to fetch schedules:', error);
      throw error;
    }
  },

  /**
   * Get schedules for a specific week
   */
  async getWeekSchedules(weekStartDate, technicianId = null) {
    const start = getWeekStart(weekStartDate);
    const end = getWeekEnd(weekStartDate);
    return this.getSchedulesForDateRange(start, end, technicianId);
  },

  /**
   * Get unscheduled tickets (triaged but not scheduled, or needs rescheduling)
   */
  async getUnscheduledTickets(filters = {}) {
    if (!supabase) {
      console.log('[WeeklyPlanningService] Supabase not configured');
      return [];
    }

    try {
      // Get ALL tickets first - use * to get all fields like serviceTicketService does
      let query = supabase
        .from('service_tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100); // Get recent tickets

      // Only apply technician filter if explicitly requested AND not 'all'
      // Don't filter by default - show all tickets
      if (filters.technicianId && filters.technicianId !== 'all') {
        query = query.eq('assigned_to', filters.technicianId);
      }
      if (filters.priority) {
        query = query.eq('priority', filters.priority);
      }
      if (filters.category) {
        query = query.eq('category', filters.category);
      }

      console.log('[WeeklyPlanningService] Fetching tickets with filters:', filters);

      const { data: tickets, error } = await query;

      if (error) {
        console.error('[WeeklyPlanningService] Failed to fetch unscheduled tickets:', error);
        console.error('[WeeklyPlanningService] Error details:', JSON.stringify(error));
        throw error;
      }

      console.log('[WeeklyPlanningService] Raw query result - tickets count:', tickets?.length || 0);

      if (!tickets || tickets.length === 0) {
        console.log('[WeeklyPlanningService] No tickets found in database');
        return [];
      }

      console.log('[WeeklyPlanningService] Found tickets:', tickets.length);
      console.log('[WeeklyPlanningService] Ticket details:', tickets.map(t => ({ id: t.id, status: t.status, title: t.title })));

      // Filter out completed/closed tickets client-side
      const DONE_STATUSES = ['completed', 'closed', 'resolved', 'cancelled'];
      const activeTickets = tickets.filter(t => !DONE_STATUSES.includes(t.status));
      console.log('[WeeklyPlanningService] Active tickets after status filter:', activeTickets.length);

      if (activeTickets.length === 0) {
        return [];
      }

      // Filter out tickets that already have active schedules
      const ticketIds = activeTickets.map(t => t.id);

      // Query existing schedules - be graceful if schedule_status column doesn't exist
      let existingSchedules = [];
      try {
        const { data, error: schedError } = await supabase
          .from('service_schedules')
          .select('ticket_id, status, schedule_status')
          .in('ticket_id', ticketIds)
          .neq('status', 'cancelled')
          .neq('status', 'completed');

        if (schedError) {
          // If schedule_status column doesn't exist, try without it
          if (schedError.message?.includes('schedule_status')) {
            console.warn('[WeeklyPlanningService] schedule_status column not found, using fallback query');
            const { data: fallbackData } = await supabase
              .from('service_schedules')
              .select('ticket_id, status')
              .in('ticket_id', ticketIds)
              .neq('status', 'cancelled')
              .neq('status', 'completed');
            existingSchedules = fallbackData || [];
          } else {
            console.error('[WeeklyPlanningService] Schedule query error:', schedError);
          }
        } else {
          // Filter out cancelled schedule_status if the column exists
          existingSchedules = (data || []).filter(s => s.schedule_status !== 'cancelled');
        }
      } catch (schedQueryError) {
        console.warn('[WeeklyPlanningService] Schedule query failed, returning all active tickets:', schedQueryError);
        // Return all active tickets if schedule query fails
        return activeTickets;
      }

      const scheduledTicketIds = new Set(existingSchedules.map(s => s.ticket_id));
      const unscheduledTickets = activeTickets.filter(t => !scheduledTicketIds.has(t.id));

      console.log('[WeeklyPlanningService] Unscheduled tickets:', unscheduledTickets.length);

      return unscheduledTickets;
    } catch (error) {
      console.error('[WeeklyPlanningService] Failed to fetch unscheduled tickets:', error);
      // Return empty array instead of throwing to prevent UI from breaking
      return [];
    }
  },

  /**
   * Check for buffer conflicts with existing schedules
   */
  async checkBufferConflicts(technicianId, date, startTime, endTime, excludeScheduleId = null) {
    if (!supabase || !technicianId) return [];

    try {
      // Get all schedules for technician on date
      // Try with schedule_status first, fall back if column doesn't exist
      let schedules = [];
      let query = supabase
        .from('service_schedules')
        .select('id, scheduled_time_start, scheduled_time_end, estimated_duration_minutes, status, ticket:service_tickets(title)')
        .eq('technician_id', technicianId)
        .eq('scheduled_date', formatDate(date))
        .neq('status', 'cancelled');

      if (excludeScheduleId) {
        query = query.neq('id', excludeScheduleId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[WeeklyPlanningService] Failed to check conflicts:', error);
        return []; // Return empty to allow scheduling
      }

      schedules = data || [];

      if (!schedules || schedules.length === 0) return [];

      // Calculate requested time range with buffer
      const requestedStart = timeToMinutes(startTime) - BUFFER_MINUTES;
      const requestedEnd = timeToMinutes(endTime) + BUFFER_MINUTES;

      // Find conflicts
      const conflicts = schedules.filter(s => {
        const schedStart = timeToMinutes(s.scheduled_time_start);
        const duration = s.estimated_duration_minutes || DEFAULT_DURATION_MINUTES;
        const schedEnd = s.scheduled_time_end
          ? timeToMinutes(s.scheduled_time_end)
          : schedStart + duration;

        // Check overlap (including buffer)
        return !(requestedEnd <= schedStart || requestedStart >= schedEnd);
      });

      return conflicts.map(c => ({
        id: c.id,
        start: c.scheduled_time_start,
        end: c.scheduled_time_end || minutesToTime(timeToMinutes(c.scheduled_time_start) + (c.estimated_duration_minutes || DEFAULT_DURATION_MINUTES)),
        title: c.ticket?.title || 'Scheduled service'
      }));
    } catch (error) {
      console.error('[WeeklyPlanningService] Failed to check conflicts:', error);
      throw error;
    }
  },

  /**
   * Create a tentative schedule (drag-drop from unscheduled panel)
   */
  async createTentativeSchedule(ticketId, scheduleData) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!ticketId) throw new Error('Ticket ID is required');

    try {
      // Get ticket info for duration
      const { data: ticket } = await supabase
        .from('service_tickets')
        .select('estimated_hours, service_address, customer_name')
        .eq('id', ticketId)
        .single();

      const estimatedMinutes = ticket?.estimated_hours
        ? ticket.estimated_hours * 60
        : DEFAULT_DURATION_MINUTES;

      // Calculate end time
      const startMinutes = timeToMinutes(scheduleData.scheduled_time_start);
      const endTime = scheduleData.scheduled_time_end || minutesToTime(startMinutes + estimatedMinutes);

      // Build insert object - only include columns that exist
      const insertData = {
        ticket_id: ticketId,
        scheduled_date: scheduleData.scheduled_date,
        scheduled_time_start: scheduleData.scheduled_time_start,
        scheduled_time_end: endTime,
        technician_id: scheduleData.technician_id,
        technician_name: scheduleData.technician_name,
        service_address: scheduleData.service_address || ticket?.service_address,
        pre_visit_notes: scheduleData.pre_visit_notes || '',
        status: 'pending'
      };

      // Try to create with new columns first
      let { data, error } = await supabase
        .from('service_schedules')
        .insert([{
          ...insertData,
          schedule_status: 'tentative',
          estimated_duration_minutes: estimatedMinutes
        }])
        .select()
        .single();

      // If error mentions missing column, retry without new columns
      if (error && (error.message?.includes('schedule_status') || error.message?.includes('estimated_duration_minutes'))) {
        console.warn('[WeeklyPlanningService] New columns not found, creating without them');
        const fallbackResult = await supabase
          .from('service_schedules')
          .insert([insertData])
          .select()
          .single();
        data = fallbackResult.data;
        error = fallbackResult.error;
      }

      if (error) {
        console.error('[WeeklyPlanningService] Failed to create schedule:', error);
        throw error;
      }

      // Update ticket status to 'scheduled'
      await supabase
        .from('service_tickets')
        .update({ status: 'scheduled' })
        .eq('id', ticketId);

      return data;
    } catch (error) {
      console.error('[WeeklyPlanningService] Failed to create schedule:', error);
      throw error;
    }
  },

  /**
   * Move schedule to new date/time (drag-drop on calendar)
   */
  async moveSchedule(scheduleId, newDate, newTime, newTechnicianId = null, newTechnicianName = null) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!scheduleId) throw new Error('Schedule ID is required');

    try {
      // Get current schedule for duration
      const { data: current } = await supabase
        .from('service_schedules')
        .select('estimated_duration_minutes, technician_id, technician_name')
        .eq('id', scheduleId)
        .single();

      const duration = current?.estimated_duration_minutes || DEFAULT_DURATION_MINUTES;
      const startMinutes = timeToMinutes(newTime);
      const endTime = minutesToTime(startMinutes + duration);

      const updates = {
        scheduled_date: newDate,
        scheduled_time_start: newTime,
        scheduled_time_end: endTime
      };

      // Update technician if changed
      if (newTechnicianId) {
        updates.technician_id = newTechnicianId;
        updates.technician_name = newTechnicianName || current?.technician_name;
      }

      const { data, error } = await supabase
        .from('service_schedules')
        .update(updates)
        .eq('id', scheduleId)
        .select()
        .single();

      if (error) {
        console.error('[WeeklyPlanningService] Failed to move schedule:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[WeeklyPlanningService] Failed to move schedule:', error);
      throw error;
    }
  },

  /**
   * Confirm a schedule
   */
  async confirmSchedule(scheduleId, confirmedBy, method = 'internal') {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const { data, error } = await supabase
        .from('service_schedules')
        .update({
          schedule_status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          confirmed_by: confirmedBy,
          confirmation_method: method
        })
        .eq('id', scheduleId)
        .select()
        .single();

      if (error) {
        console.error('[WeeklyPlanningService] Failed to confirm schedule:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[WeeklyPlanningService] Failed to confirm schedule:', error);
      throw error;
    }
  },

  /**
   * Cancel a schedule
   */
  async cancelSchedule(scheduleId, reason = null) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const updates = {
        schedule_status: 'cancelled',
        status: 'cancelled'
      };

      if (reason) {
        updates.reschedule_reason = reason;
      }

      const { data, error } = await supabase
        .from('service_schedules')
        .update(updates)
        .eq('id', scheduleId)
        .select()
        .single();

      if (error) {
        console.error('[WeeklyPlanningService] Failed to cancel schedule:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[WeeklyPlanningService] Failed to cancel schedule:', error);
      throw error;
    }
  },

  /**
   * Request reschedule (customer initiated)
   */
  async requestReschedule(scheduleId, reason, preferredTimes = []) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const { data, error } = await supabase
        .from('service_schedules')
        .update({
          reschedule_requested_at: new Date().toISOString(),
          reschedule_reason: reason
        })
        .eq('id', scheduleId)
        .select()
        .single();

      if (error) {
        console.error('[WeeklyPlanningService] Failed to request reschedule:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[WeeklyPlanningService] Failed to request reschedule:', error);
      throw error;
    }
  },

  /**
   * Get week summary stats
   */
  async getWeekStats(weekStartDate, technicianId = null) {
    if (!supabase) return null;

    try {
      const start = getWeekStart(weekStartDate);
      const end = getWeekEnd(weekStartDate);

      let query = supabase
        .from('service_schedules')
        .select('id, schedule_status, status, estimated_duration_minutes')
        .gte('scheduled_date', formatDate(start))
        .lte('scheduled_date', formatDate(end))
        .neq('status', 'cancelled');

      if (technicianId) {
        query = query.eq('technician_id', technicianId);
      }

      const { data: schedules, error } = await query;

      if (error) {
        console.error('[WeeklyPlanningService] Failed to get stats:', error);
        throw error;
      }

      const stats = {
        total: schedules.length,
        tentative: schedules.filter(s => s.schedule_status === 'tentative').length,
        confirmed: schedules.filter(s => s.schedule_status === 'confirmed').length,
        completed: schedules.filter(s => s.status === 'completed').length,
        totalMinutes: schedules.reduce((sum, s) => sum + (s.estimated_duration_minutes || DEFAULT_DURATION_MINUTES), 0)
      };

      stats.totalHours = Math.round(stats.totalMinutes / 60 * 10) / 10;

      return stats;
    } catch (error) {
      console.error('[WeeklyPlanningService] Failed to get stats:', error);
      throw error;
    }
  },

  /**
   * Update calendar event ID on schedule
   */
  async updateCalendarEventId(scheduleId, calendarEventId) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const { data, error } = await supabase
        .from('service_schedules')
        .update({ calendar_event_id: calendarEventId })
        .eq('id', scheduleId)
        .select()
        .single();

      if (error) {
        console.error('[WeeklyPlanningService] Failed to update calendar event ID:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[WeeklyPlanningService] Failed to update calendar event ID:', error);
      throw error;
    }
  }
};

// Helper exports
export { timeToMinutes, minutesToTime, getWeekStart, getWeekEnd, formatDate, BUFFER_MINUTES, DEFAULT_DURATION_MINUTES };

export default weeklyPlanningService;
