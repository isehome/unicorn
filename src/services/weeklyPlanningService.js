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
      // First try with foreign key join
      let query = supabase
        .from('service_schedules')
        .select('*')
        .gte('scheduled_date', formatDate(startDate))
        .lte('scheduled_date', formatDate(endDate))
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true })
        .order('scheduled_time_start', { ascending: true });

      if (technicianId) {
        query = query.eq('technician_id', technicianId);
      }

      const { data: schedules, error } = await query;

      if (error) {
        console.error('[WeeklyPlanningService] Failed to fetch schedules:', error);
        // Return empty instead of throwing to prevent UI crash
        return [];
      }

      if (!schedules || schedules.length === 0) {
        return [];
      }

      // Fetch technician avatar colors from profiles table (via contacts email)
      const technicianIds = [...new Set(schedules.filter(s => s.technician_id).map(s => s.technician_id))];
      let technicianMap = {};

      if (technicianIds.length > 0) {
        // First get contact emails
        const { data: contacts } = await supabase
          .from('contacts')
          .select('id, email')
          .in('id', technicianIds);

        if (contacts && contacts.length > 0) {
          // Get avatar colors from profiles via email
          const emails = contacts.filter(c => c.email).map(c => c.email.toLowerCase());
          if (emails.length > 0) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('email, avatar_color')
              .in('email', emails);

            // Build contact ID -> avatar_color map
            if (profiles) {
              const emailToColor = profiles.reduce((acc, p) => {
                if (p.email && p.avatar_color) {
                  acc[p.email.toLowerCase()] = p.avatar_color;
                }
                return acc;
              }, {});

              contacts.forEach(c => {
                if (c.email && emailToColor[c.email.toLowerCase()]) {
                  technicianMap[c.id] = { avatar_color: emailToColor[c.email.toLowerCase()] };
                }
              });
            }
          }
        }
      }

      // Fetch ticket details separately to avoid join issues
      const ticketIds = [...new Set(schedules.map(s => s.ticket_id).filter(Boolean))];
      let ticketMap = {};

      if (ticketIds.length > 0) {
        const { data: tickets } = await supabase
          .from('service_tickets')
          .select('id, ticket_number, title, status, priority, category, estimated_hours, customer_name, customer_phone, customer_email, service_address')
          .in('id', ticketIds);

        if (tickets) {
          ticketMap = tickets.reduce((acc, t) => ({ ...acc, [t.id]: t }), {});
        }
      }

      // Merge ticket data and technician avatar color into schedules
      return schedules.map(s => ({
        ...s,
        ticket: ticketMap[s.ticket_id] || null,
        technician_avatar_color: technicianMap[s.technician_id]?.avatar_color || null
      }));
    } catch (error) {
      console.error('[WeeklyPlanningService] Failed to fetch schedules:', error);
      // Return empty instead of throwing to prevent UI crash
      return [];
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

      // Query existing schedules - use basic columns only
      let existingSchedules = [];
      try {
        const { data, error: schedError } = await supabase
          .from('service_schedules')
          .select('ticket_id, status')
          .in('ticket_id', ticketIds)
          .neq('status', 'cancelled')
          .neq('status', 'completed');

        if (schedError) {
          console.error('[WeeklyPlanningService] Schedule query error:', schedError);
          // Return all active tickets if schedule query fails
          return activeTickets;
        }

        existingSchedules = data || [];
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
      // Get all schedules for technician on date - use basic columns only
      let query = supabase
        .from('service_schedules')
        .select('id, scheduled_time_start, scheduled_time_end, status, ticket_id')
        .eq('technician_id', technicianId)
        .eq('scheduled_date', formatDate(date))
        .neq('status', 'cancelled');

      if (excludeScheduleId) {
        query = query.neq('id', excludeScheduleId);
      }

      const { data: schedules, error } = await query;

      if (error) {
        console.error('[WeeklyPlanningService] Failed to check conflicts:', error);
        return []; // Return empty to allow scheduling
      }

      if (!schedules || schedules.length === 0) return [];

      // Calculate requested time range with buffer
      const requestedStart = timeToMinutes(startTime) - BUFFER_MINUTES;
      const requestedEnd = timeToMinutes(endTime) + BUFFER_MINUTES;

      // Find conflicts
      const conflicts = schedules.filter(s => {
        const schedStart = timeToMinutes(s.scheduled_time_start);
        const schedEnd = s.scheduled_time_end
          ? timeToMinutes(s.scheduled_time_end)
          : schedStart + DEFAULT_DURATION_MINUTES;

        // Check overlap (including buffer)
        return !(requestedEnd <= schedStart || requestedStart >= schedEnd);
      });

      return conflicts.map(c => ({
        id: c.id,
        start: c.scheduled_time_start,
        end: c.scheduled_time_end || minutesToTime(timeToMinutes(c.scheduled_time_start) + DEFAULT_DURATION_MINUTES),
        title: 'Scheduled service'
      }));
    } catch (error) {
      console.error('[WeeklyPlanningService] Failed to check conflicts:', error);
      return []; // Return empty to allow scheduling on error
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
      const { data: ticket, error: ticketError } = await supabase
        .from('service_tickets')
        .select('estimated_hours, service_address, customer_name')
        .eq('id', ticketId)
        .single();

      if (ticketError) {
        console.warn('[WeeklyPlanningService] Could not fetch ticket details:', ticketError);
      }

      // Parse estimated_hours as number (database NUMERIC may return string)
      const rawHours = ticket?.estimated_hours;
      const parsedHours = typeof rawHours === 'number' ? rawHours : parseFloat(rawHours);
      const estimatedMinutes = parsedHours > 0 ? parsedHours * 60 : DEFAULT_DURATION_MINUTES;

      console.log('[WeeklyPlanningService] createTentativeSchedule - estimatedHours:', {
        raw: rawHours,
        parsed: parsedHours,
        minutes: estimatedMinutes
      });

      // Calculate end time
      const startMinutes = timeToMinutes(scheduleData.scheduled_time_start);
      const endTime = scheduleData.scheduled_time_end || minutesToTime(startMinutes + estimatedMinutes);

      // Build insert object - use only basic columns that definitely exist
      // Start with 'pending_tech' status for 3-step approval workflow
      const insertData = {
        ticket_id: ticketId,
        scheduled_date: scheduleData.scheduled_date,
        scheduled_time_start: scheduleData.scheduled_time_start,
        scheduled_time_end: endTime,
        technician_id: scheduleData.technician_id,
        technician_name: scheduleData.technician_name,
        technician_email: scheduleData.technician_email || null,
        service_address: scheduleData.service_address || ticket?.service_address || '',
        pre_visit_notes: scheduleData.pre_visit_notes || '',
        status: 'scheduled',
        schedule_status: 'pending_tech' // Step 1: Waiting for technician to accept calendar invite
      };

      console.log('[WeeklyPlanningService] Creating schedule with data:', insertData);

      // Create schedule with basic columns only (safe approach)
      const { data, error } = await supabase
        .from('service_schedules')
        .insert([insertData])
        .select()
        .single();

      if (error) {
        console.error('[WeeklyPlanningService] Failed to create schedule:', error);
        throw error;
      }

      console.log('[WeeklyPlanningService] Schedule created:', data);

      // Update ticket status to 'scheduled'
      const { error: updateError } = await supabase
        .from('service_tickets')
        .update({ status: 'scheduled' })
        .eq('id', ticketId);

      if (updateError) {
        console.warn('[WeeklyPlanningService] Failed to update ticket status:', updateError);
      }

      return data;
    } catch (error) {
      console.error('[WeeklyPlanningService] Failed to create schedule:', error);
      throw error;
    }
  },

  /**
   * Move schedule to new date/time (drag-drop on calendar)
   * Preserves the original duration from ticket's estimated_hours
   */
  async moveSchedule(scheduleId, newDate, newTime, newTechnicianId = null, newTechnicianName = null, estimatedHours = null) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!scheduleId) throw new Error('Schedule ID is required');

    try {
      // Get current schedule with ticket info for duration
      const { data: current } = await supabase
        .from('service_schedules')
        .select('ticket_id, technician_id, technician_name, scheduled_time_start, scheduled_time_end')
        .eq('id', scheduleId)
        .single();

      // Calculate duration from multiple sources
      let durationMinutes = DEFAULT_DURATION_MINUTES;

      // Use passed estimatedHours first (from drag data)
      if (estimatedHours) {
        durationMinutes = estimatedHours * 60;
      }
      // Fallback: calculate from current schedule's start/end times
      else if (current?.scheduled_time_start && current?.scheduled_time_end) {
        const currentStart = timeToMinutes(current.scheduled_time_start);
        const currentEnd = timeToMinutes(current.scheduled_time_end);
        durationMinutes = currentEnd - currentStart;
      }
      // Fallback: get from ticket's estimated_hours
      else if (current?.ticket_id) {
        const { data: ticket } = await supabase
          .from('service_tickets')
          .select('estimated_hours')
          .eq('id', current.ticket_id)
          .single();

        if (ticket?.estimated_hours) {
          // Parse as number (database NUMERIC may return string)
          const rawHours = ticket.estimated_hours;
          const parsedHours = typeof rawHours === 'number' ? rawHours : parseFloat(rawHours);
          if (parsedHours > 0) {
            durationMinutes = parsedHours * 60;
          }
        }
      }

      const startMinutes = timeToMinutes(newTime);
      const endTime = minutesToTime(startMinutes + durationMinutes);

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

      console.log('[WeeklyPlanningService] Schedule moved:', data, 'Duration:', durationMinutes, 'minutes');

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
  },

  // ============================================================================
  // 3-STEP APPROVAL WORKFLOW FUNCTIONS
  // ============================================================================

  /**
   * Handle technician acceptance (Step 2 of 3-step workflow)
   * Called when cron job detects technician accepted calendar invite
   * Updates status to pending_customer
   */
  async handleTechnicianAccepted(scheduleId) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const { data, error } = await supabase
        .from('service_schedules')
        .update({
          schedule_status: 'pending_customer',
          tech_calendar_response: 'accepted',
          technician_accepted_at: new Date().toISOString()
        })
        .eq('id', scheduleId)
        .select(`
          *,
          ticket:service_tickets(customer_email, customer_name)
        `)
        .single();

      if (error) {
        console.error('[WeeklyPlanningService] Failed to handle tech accepted:', error);
        throw error;
      }

      console.log('[WeeklyPlanningService] Technician accepted schedule:', scheduleId);
      return data;
    } catch (error) {
      console.error('[WeeklyPlanningService] Failed to handle tech accepted:', error);
      throw error;
    }
  },

  /**
   * Handle customer acceptance (Step 3 of 3-step workflow)
   * Called when cron job detects customer accepted calendar invite
   * Updates status to confirmed
   */
  async handleCustomerAccepted(scheduleId) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const { data, error } = await supabase
        .from('service_schedules')
        .update({
          schedule_status: 'confirmed',
          customer_calendar_response: 'accepted',
          customer_accepted_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
          confirmation_method: 'calendar'
        })
        .eq('id', scheduleId)
        .select()
        .single();

      if (error) {
        console.error('[WeeklyPlanningService] Failed to handle customer accepted:', error);
        throw error;
      }

      console.log('[WeeklyPlanningService] Customer accepted schedule:', scheduleId);
      return data;
    } catch (error) {
      console.error('[WeeklyPlanningService] Failed to handle customer accepted:', error);
      throw error;
    }
  },

  /**
   * Handle decline (tech or customer declined calendar invite)
   * Returns ticket to unscheduled state
   */
  async handleDecline(scheduleId, declinedBy = 'unknown') {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      // Get schedule with ticket info
      const { data: schedule } = await supabase
        .from('service_schedules')
        .select('ticket_id, schedule_status')
        .eq('id', scheduleId)
        .single();

      if (!schedule) {
        throw new Error('Schedule not found');
      }

      // Update the appropriate response field based on who declined
      const updates = {
        schedule_status: 'cancelled',
        status: 'cancelled'
      };

      if (declinedBy === 'technician') {
        updates.tech_calendar_response = 'declined';
      } else if (declinedBy === 'customer') {
        updates.customer_calendar_response = 'declined';
      }

      // Cancel the schedule
      const { error: scheduleError } = await supabase
        .from('service_schedules')
        .update(updates)
        .eq('id', scheduleId);

      if (scheduleError) {
        console.error('[WeeklyPlanningService] Failed to cancel schedule:', scheduleError);
        throw scheduleError;
      }

      // Return ticket to triaged status (unscheduled)
      if (schedule.ticket_id) {
        const { error: ticketError } = await supabase
          .from('service_tickets')
          .update({ status: 'triaged' })
          .eq('id', schedule.ticket_id);

        if (ticketError) {
          console.warn('[WeeklyPlanningService] Failed to update ticket status:', ticketError);
        }
      }

      console.log(`[WeeklyPlanningService] Schedule ${scheduleId} declined by ${declinedBy}, returned to unscheduled`);
      return { success: true, declinedBy };
    } catch (error) {
      console.error('[WeeklyPlanningService] Failed to handle decline:', error);
      throw error;
    }
  },

  /**
   * Update calendar response status
   * Called by cron job when processing webhook notifications
   */
  async updateCalendarResponse(scheduleId, responseType, response) {
    if (!supabase) throw new Error('Supabase not configured');

    const field = responseType === 'technician' ? 'tech_calendar_response' : 'customer_calendar_response';

    try {
      const { data, error } = await supabase
        .from('service_schedules')
        .update({ [field]: response })
        .eq('id', scheduleId)
        .select()
        .single();

      if (error) {
        console.error('[WeeklyPlanningService] Failed to update calendar response:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[WeeklyPlanningService] Failed to update calendar response:', error);
      throw error;
    }
  },

  /**
   * Get schedule by calendar event ID
   * Used by cron job to find schedule from webhook notification
   */
  async getScheduleByCalendarEventId(calendarEventId) {
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from('service_schedules')
        .select(`
          *,
          ticket:service_tickets(id, customer_email, customer_name, customer_phone, service_address)
        `)
        .eq('calendar_event_id', calendarEventId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned
          return null;
        }
        console.error('[WeeklyPlanningService] Failed to get schedule by event ID:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[WeeklyPlanningService] Failed to get schedule by event ID:', error);
      return null;
    }
  }
};

// Helper exports
export { timeToMinutes, minutesToTime, getWeekStart, getWeekEnd, formatDate, BUFFER_MINUTES, DEFAULT_DURATION_MINUTES };

export default weeklyPlanningService;
