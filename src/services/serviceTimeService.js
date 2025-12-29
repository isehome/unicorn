/**
 * serviceTimeService.js
 * Time tracking service for service tickets
 * Handles check-in/check-out and manual time entries
 */

import { supabase } from '../lib/supabase';

export const serviceTimeService = {
  /**
   * Check in to a service ticket (start time tracking)
   */
  async checkIn(ticketId, userEmail, userName, userId = null) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!ticketId) throw new Error('Ticket ID is required');
    if (!userEmail) throw new Error('User email is required');

    try {
      const { data, error } = await supabase.rpc('service_time_check_in', {
        p_ticket_id: ticketId,
        p_user_email: userEmail,
        p_user_name: userName || userEmail,
        p_user_id: userId
      });

      if (error) {
        console.error('[ServiceTimeService] Check-in failed:', error);
        throw new Error(error.message || 'Failed to check in');
      }

      console.log('[ServiceTimeService] Checked in:', data);
      return { success: true, sessionId: data };
    } catch (error) {
      console.error('[ServiceTimeService] Check-in error:', error);
      throw error;
    }
  },

  /**
   * Check out from a service ticket (end time tracking)
   */
  async checkOut(ticketId, userEmail, notes = null) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!ticketId) throw new Error('Ticket ID is required');
    if (!userEmail) throw new Error('User email is required');

    try {
      const { data, error } = await supabase.rpc('service_time_check_out', {
        p_ticket_id: ticketId,
        p_user_email: userEmail,
        p_notes: notes
      });

      if (error) {
        console.error('[ServiceTimeService] Check-out failed:', error);
        throw new Error(error.message || 'Failed to check out');
      }

      console.log('[ServiceTimeService] Checked out:', data);
      return { success: true, sessionId: data };
    } catch (error) {
      console.error('[ServiceTimeService] Check-out error:', error);
      throw error;
    }
  },

  /**
   * Get active session for a user on a ticket
   */
  async getActiveSession(ticketId, userEmail) {
    if (!supabase) return null;
    if (!ticketId || !userEmail) return null;

    try {
      const { data, error } = await supabase.rpc('get_service_active_session', {
        p_ticket_id: ticketId,
        p_user_email: userEmail
      });

      if (error) {
        console.error('[ServiceTimeService] Get active session failed:', error);
        return null;
      }

      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('[ServiceTimeService] Get active session error:', error);
      return null;
    }
  },

  /**
   * Get time summary for a ticket (all technicians)
   */
  async getTicketTimeSummary(ticketId) {
    if (!supabase) return [];
    if (!ticketId) return [];

    try {
      const { data, error } = await supabase.rpc('get_service_ticket_time_summary', {
        p_ticket_id: ticketId
      });

      if (error) {
        console.error('[ServiceTimeService] Get time summary failed:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[ServiceTimeService] Get time summary error:', error);
      return [];
    }
  },

  /**
   * Get technician's service time across date range
   */
  async getTechnicianServiceTime(userEmail, startDate, endDate) {
    if (!supabase) return [];
    if (!userEmail) return [];

    try {
      const { data, error } = await supabase.rpc('get_technician_service_time', {
        p_user_email: userEmail,
        p_start_date: startDate,
        p_end_date: endDate
      });

      if (error) {
        console.error('[ServiceTimeService] Get technician time failed:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[ServiceTimeService] Get technician time error:', error);
      return [];
    }
  },

  /**
   * Get all time logs for a ticket
   */
  async getTimeLogsForTicket(ticketId) {
    if (!supabase || !ticketId) return [];

    try {
      const { data, error } = await supabase
        .from('service_time_logs')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('check_in', { ascending: false });

      if (error) {
        console.error('[ServiceTimeService] Get time logs failed:', error);
        throw new Error(error.message || 'Failed to get time logs');
      }

      // Calculate duration for each entry
      return (data || []).map(entry => ({
        ...entry,
        duration_minutes: entry.check_out
          ? Math.round((new Date(entry.check_out) - new Date(entry.check_in)) / 60000)
          : null,
        duration_hours: entry.check_out
          ? Math.round((new Date(entry.check_out) - new Date(entry.check_in)) / 3600000 * 100) / 100
          : null
      }));
    } catch (error) {
      console.error('[ServiceTimeService] Get time logs error:', error);
      throw error;
    }
  },

  /**
   * Create a manual time entry (for forgotten check-ins)
   */
  async createManualEntry(ticketId, data) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!ticketId) throw new Error('Ticket ID is required');

    try {
      const { data: result, error } = await supabase.rpc('create_service_time_manual_entry', {
        p_ticket_id: ticketId,
        p_technician_email: data.technician_email,
        p_technician_name: data.technician_name,
        p_check_in: data.check_in,
        p_check_out: data.check_out,
        p_notes: data.notes || null,
        p_created_by_id: data.created_by_id || null,
        p_created_by_name: data.created_by_name || null
      });

      if (error) {
        console.error('[ServiceTimeService] Create manual entry failed:', error);
        throw new Error(error.message || 'Failed to create time entry');
      }

      console.log('[ServiceTimeService] Manual entry created:', result);
      return { success: true, entryId: result };
    } catch (error) {
      console.error('[ServiceTimeService] Create manual entry error:', error);
      throw error;
    }
  },

  /**
   * Update an existing time entry
   */
  async updateTimeEntry(entryId, data) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!entryId) throw new Error('Entry ID is required');

    try {
      const { data: result, error } = await supabase.rpc('update_service_time_entry', {
        p_entry_id: entryId,
        p_check_in: data.check_in,
        p_check_out: data.check_out,
        p_notes: data.notes || null
      });

      if (error) {
        console.error('[ServiceTimeService] Update entry failed:', error);
        throw new Error(error.message || 'Failed to update time entry');
      }

      console.log('[ServiceTimeService] Entry updated:', result);
      return { success: true };
    } catch (error) {
      console.error('[ServiceTimeService] Update entry error:', error);
      throw error;
    }
  },

  /**
   * Delete a time entry
   */
  async deleteTimeEntry(entryId) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!entryId) throw new Error('Entry ID is required');

    try {
      const { error } = await supabase
        .from('service_time_logs')
        .delete()
        .eq('id', entryId);

      if (error) {
        console.error('[ServiceTimeService] Delete entry failed:', error);
        throw new Error(error.message || 'Failed to delete time entry');
      }

      console.log('[ServiceTimeService] Entry deleted:', entryId);
      return { success: true };
    } catch (error) {
      console.error('[ServiceTimeService] Delete entry error:', error);
      throw error;
    }
  },

  /**
   * Calculate total hours and cost for a ticket
   */
  async getTicketTimeAndCost(ticketId, hourlyRate = 150) {
    if (!supabase || !ticketId) return { totalMinutes: 0, totalHours: 0, laborCost: 0 };

    try {
      const summary = await this.getTicketTimeSummary(ticketId);

      const totalMinutes = summary.reduce((sum, tech) => sum + (tech.total_minutes || 0), 0);
      const totalHours = Math.round(totalMinutes / 60 * 100) / 100;
      const laborCost = Math.round(totalHours * hourlyRate * 100) / 100;

      return {
        totalMinutes,
        totalHours,
        laborCost,
        byTechnician: summary
      };
    } catch (error) {
      console.error('[ServiceTimeService] Get time and cost error:', error);
      return { totalMinutes: 0, totalHours: 0, laborCost: 0 };
    }
  }
};

export default serviceTimeService;
