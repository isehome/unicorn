/**
 * serviceTicketService.js
 * Service layer for Service CRM functionality
 */

import { supabase } from '../lib/supabase';

// ============================================================================
// SERVICE TICKETS
// ============================================================================

export const serviceTicketService = {
  /**
   * Get all tickets with optional filters
   */
  async getAll(filters = {}) {
    if (!supabase) return { tickets: [], count: 0 };

    try {
      let query = supabase
        .from('service_tickets')
        .select(`
          *,
          project:projects(id, name, address),
          contact:contacts(id, full_name, phone, email),
          schedules:service_schedules(
            id, scheduled_date, scheduled_time_start, status, technician_name
          )
        `, { count: 'exact' })
        .order('created_at', { ascending: false });

      // Apply filters
      if (filters.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters.category) {
        query = query.eq('category', filters.category);
      }

      if (filters.priority) {
        query = query.eq('priority', filters.priority);
      }

      if (filters.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo);
      }

      if (filters.projectId) {
        query = query.eq('project_id', filters.projectId);
      }

      if (filters.contactId) {
        query = query.eq('contact_id', filters.contactId);
      }

      if (filters.search) {
        query = query.textSearch('search_vector', filters.search);
      }

      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }

      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }

      // Pagination
      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('[ServiceTicketService] Failed to fetch tickets:', error);
        throw new Error(error.message || 'Failed to fetch service tickets');
      }

      return { tickets: data || [], count };
    } catch (error) {
      console.error('[ServiceTicketService] Failed to fetch service tickets:', error);
      throw error;
    }
  },

  /**
   * Get single ticket by ID with full details
   */
  async getById(id) {
    if (!supabase || !id) return null;

    try {
      const { data, error } = await supabase
        .from('service_tickets')
        .select(`
          *,
          project:projects(id, name, address, status),
          contact:contacts(id, full_name, phone, email, company),
          notes:service_ticket_notes(
            id, note_type, content, author_name, is_internal,
            call_duration_seconds, created_at
          ),
          schedules:service_schedules(
            id, scheduled_date, scheduled_time_start, scheduled_time_end,
            technician_id, technician_name, status, service_address,
            pre_visit_notes, post_visit_notes, customer_confirmed
          ),
          call_logs:service_call_logs(
            id, call_start_time, call_duration_seconds, summary,
            handled_by, issue_resolved
          )
        `)
        .eq('id', id)
        .single();

      if (error) {
        console.error('[ServiceTicketService] Failed to fetch ticket:', error);
        throw new Error(error.message || 'Failed to fetch service ticket');
      }

      return data;
    } catch (error) {
      console.error('[ServiceTicketService] Failed to fetch service ticket:', error);
      throw error;
    }
  },

  /**
   * Create new service ticket
   */
  async create(ticketData) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const { data, error } = await supabase
        .from('service_tickets')
        .insert([ticketData])
        .select()
        .single();

      if (error) {
        console.error('[ServiceTicketService] Failed to create ticket:', error);
        throw new Error(error.message || 'Failed to create service ticket');
      }

      // Add creation note
      await this.addNote(data.id, {
        note_type: 'note',
        content: `Ticket created via ${ticketData.source || 'manual entry'}`,
        author_name: 'System'
      });

      return data;
    } catch (error) {
      console.error('[ServiceTicketService] Failed to create service ticket:', error);
      throw error;
    }
  },

  /**
   * Update service ticket
   */
  async update(id, updates) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!id) throw new Error('Ticket ID is required');

    try {
      // Clean the payload
      const payload = { ...updates };
      delete payload.id;
      delete payload.created_at;
      delete payload.ticket_number;
      delete payload.search_vector;

      const { data, error } = await supabase
        .from('service_tickets')
        .update(payload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[ServiceTicketService] Failed to update ticket:', error);
        throw new Error(error.message || 'Failed to update service ticket');
      }

      return data;
    } catch (error) {
      console.error('[ServiceTicketService] Failed to update service ticket:', error);
      throw error;
    }
  },

  /**
   * Update ticket status with automatic note
   */
  async updateStatus(id, newStatus, userId, userName) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const updates = { status: newStatus };

      if (newStatus === 'resolved' || newStatus === 'closed') {
        updates.resolved_at = new Date().toISOString();
        updates.resolved_by = userId;
      }

      const ticket = await this.update(id, updates);

      // Add status change note
      await this.addNote(id, {
        note_type: 'status_change',
        content: `Status changed to: ${newStatus.replace('_', ' ')}`,
        author_id: userId,
        author_name: userName
      });

      return ticket;
    } catch (error) {
      console.error('[ServiceTicketService] Failed to update ticket status:', error);
      throw error;
    }
  },

  /**
   * Assign ticket to technician
   */
  async assign(id, technicianId, technicianName, assignedByName) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const ticket = await this.update(id, {
        assigned_to: technicianId,
        assigned_at: new Date().toISOString(),
        status: 'triaged'
      });

      await this.addNote(id, {
        note_type: 'assignment',
        content: `Assigned to ${technicianName} by ${assignedByName}`,
        author_name: assignedByName
      });

      return ticket;
    } catch (error) {
      console.error('[ServiceTicketService] Failed to assign ticket:', error);
      throw error;
    }
  },

  /**
   * Add note to ticket
   */
  async addNote(ticketId, noteData) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const { data, error } = await supabase
        .from('service_ticket_notes')
        .insert([{ ticket_id: ticketId, ...noteData }])
        .select()
        .single();

      if (error) {
        console.error('[ServiceTicketService] Failed to add note:', error);
        throw new Error(error.message || 'Failed to add ticket note');
      }

      return data;
    } catch (error) {
      console.error('[ServiceTicketService] Failed to add ticket note:', error);
      throw error;
    }
  },

  /**
   * Get ticket statistics for dashboard
   */
  async getStats() {
    if (!supabase) return {
      total: 0,
      byStatus: {},
      byPriority: {},
      byCategory: {},
      openCount: 0,
      urgentCount: 0,
      thisWeek: 0
    };

    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('service_tickets')
        .select('status, priority, category, created_at')
        .gte('created_at', thirtyDaysAgo);

      if (error) {
        console.error('[ServiceTicketService] Failed to get stats:', error);
        throw new Error(error.message || 'Failed to fetch ticket stats');
      }

      const stats = {
        total: data?.length || 0,
        byStatus: {},
        byPriority: {},
        byCategory: {},
        openCount: 0,
        urgentCount: 0,
        thisWeek: 0
      };

      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      (data || []).forEach(ticket => {
        // By status
        stats.byStatus[ticket.status] = (stats.byStatus[ticket.status] || 0) + 1;

        // By priority
        stats.byPriority[ticket.priority] = (stats.byPriority[ticket.priority] || 0) + 1;

        // By category
        stats.byCategory[ticket.category] = (stats.byCategory[ticket.category] || 0) + 1;

        // Open count
        if (!['resolved', 'closed'].includes(ticket.status)) {
          stats.openCount++;
        }

        // Urgent count
        if (ticket.priority === 'urgent' && !['resolved', 'closed'].includes(ticket.status)) {
          stats.urgentCount++;
        }

        // This week
        if (new Date(ticket.created_at).getTime() > weekAgo) {
          stats.thisWeek++;
        }
      });

      return stats;
    } catch (error) {
      console.error('[ServiceTicketService] Failed to get ticket stats:', error);
      throw error;
    }
  },

  /**
   * Delete a service ticket
   */
  async remove(id) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!id) throw new Error('Ticket ID is required');

    try {
      const { error } = await supabase
        .from('service_tickets')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[ServiceTicketService] Failed to delete ticket:', error);
        throw new Error(error.message || 'Failed to delete service ticket');
      }
    } catch (error) {
      console.error('[ServiceTicketService] Failed to delete service ticket:', error);
      throw error;
    }
  }
};

// ============================================================================
// SERVICE SCHEDULING
// ============================================================================

export const serviceScheduleService = {
  /**
   * Get schedules for a date range
   */
  async getByDateRange(startDate, endDate, technicianId = null) {
    if (!supabase) return [];

    try {
      let query = supabase
        .from('service_schedules')
        .select(`
          *,
          ticket:service_tickets(
            id, ticket_number, title, category, priority,
            customer_name, customer_phone, customer_address
          )
        `)
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate)
        .order('scheduled_date')
        .order('scheduled_time_start');

      if (technicianId) {
        query = query.eq('technician_id', technicianId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[ServiceScheduleService] Failed to fetch schedules:', error);
        throw new Error(error.message || 'Failed to fetch schedules');
      }

      return data || [];
    } catch (error) {
      console.error('[ServiceScheduleService] Failed to fetch schedules:', error);
      throw error;
    }
  },

  /**
   * Create schedule for ticket
   */
  async create(scheduleData) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const { data, error } = await supabase
        .from('service_schedules')
        .insert([scheduleData])
        .select()
        .single();

      if (error) {
        console.error('[ServiceScheduleService] Failed to create schedule:', error);
        throw new Error(error.message || 'Failed to create schedule');
      }

      // Update ticket status
      await serviceTicketService.update(scheduleData.ticket_id, {
        status: 'scheduled'
      });

      // Add note to ticket
      await serviceTicketService.addNote(scheduleData.ticket_id, {
        note_type: 'schedule_update',
        content: `Service visit scheduled for ${scheduleData.scheduled_date} at ${scheduleData.scheduled_time_start || 'TBD'} with ${scheduleData.technician_name || 'TBD'}`,
        author_name: 'System'
      });

      return data;
    } catch (error) {
      console.error('[ServiceScheduleService] Failed to create schedule:', error);
      throw error;
    }
  },

  /**
   * Update schedule
   */
  async update(id, updates) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!id) throw new Error('Schedule ID is required');

    try {
      const { data, error } = await supabase
        .from('service_schedules')
        .update(updates)
        .eq('id', id)
        .select('*, ticket_id')
        .single();

      if (error) {
        console.error('[ServiceScheduleService] Failed to update schedule:', error);
        throw new Error(error.message || 'Failed to update schedule');
      }

      return data;
    } catch (error) {
      console.error('[ServiceScheduleService] Failed to update schedule:', error);
      throw error;
    }
  },

  /**
   * Update schedule status
   */
  async updateStatus(id, status, notes = null) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const updates = { status };
      if (notes) {
        if (status === 'completed') {
          updates.post_visit_notes = notes;
        } else {
          updates.pre_visit_notes = notes;
        }
      }

      const data = await this.update(id, updates);

      // Update ticket status based on schedule status
      if (status === 'on_site') {
        await serviceTicketService.update(data.ticket_id, { status: 'in_progress' });
      } else if (status === 'completed') {
        await serviceTicketService.update(data.ticket_id, { status: 'resolved' });
      }

      return data;
    } catch (error) {
      console.error('[ServiceScheduleService] Failed to update schedule status:', error);
      throw error;
    }
  },

  /**
   * Get today's schedule for a technician
   */
  async getTodayForTechnician(technicianId) {
    const today = new Date().toISOString().split('T')[0];
    return this.getByDateRange(today, today, technicianId);
  },

  /**
   * Delete schedule
   */
  async remove(id) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!id) throw new Error('Schedule ID is required');

    try {
      const { error } = await supabase
        .from('service_schedules')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[ServiceScheduleService] Failed to delete schedule:', error);
        throw new Error(error.message || 'Failed to delete schedule');
      }
    } catch (error) {
      console.error('[ServiceScheduleService] Failed to delete schedule:', error);
      throw error;
    }
  }
};

// ============================================================================
// CALL LOGS
// ============================================================================

export const serviceCallLogService = {
  /**
   * Log an incoming/outgoing call
   */
  async create(callData) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const { data, error } = await supabase
        .from('service_call_logs')
        .insert([callData])
        .select()
        .single();

      if (error) {
        console.error('[ServiceCallLogService] Failed to log call:', error);
        throw new Error(error.message || 'Failed to log call');
      }

      return data;
    } catch (error) {
      console.error('[ServiceCallLogService] Failed to log call:', error);
      throw error;
    }
  },

  /**
   * Get calls for a contact
   */
  async getByContact(contactId, limit = 20) {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('service_call_logs')
        .select('*')
        .eq('contact_id', contactId)
        .order('call_start_time', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[ServiceCallLogService] Failed to fetch call logs:', error);
        throw new Error(error.message || 'Failed to fetch call logs');
      }

      return data || [];
    } catch (error) {
      console.error('[ServiceCallLogService] Failed to fetch call logs:', error);
      throw error;
    }
  },

  /**
   * Get recent calls (for dashboard)
   */
  async getRecent(limit = 50) {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('service_call_logs')
        .select(`
          *,
          contact:contacts(id, full_name),
          ticket:service_tickets(id, ticket_number, title)
        `)
        .order('call_start_time', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[ServiceCallLogService] Failed to fetch recent calls:', error);
        throw new Error(error.message || 'Failed to fetch recent calls');
      }

      return data || [];
    } catch (error) {
      console.error('[ServiceCallLogService] Failed to fetch recent calls:', error);
      throw error;
    }
  }
};

// ============================================================================
// CUSTOMER LOOKUP (for AI phone agent)
// ============================================================================

export const customerLookupService = {
  /**
   * Find customer by phone number
   * Uses the database function for efficient lookup
   */
  async findByPhone(phone) {
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .rpc('find_customer_by_phone', { phone_input: phone });

      if (error) {
        console.error('[CustomerLookupService] Failed to find customer:', error);
        return null;
      }

      return data?.[0] || null;
    } catch (error) {
      console.error('[CustomerLookupService] Failed to find customer by phone:', error);
      return null;
    }
  },

  /**
   * Get customer service history
   */
  async getHistory(contactId) {
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from('customer_service_history')
        .select('*')
        .eq('contact_id', contactId)
        .single();

      if (error) {
        console.error('[CustomerLookupService] Failed to get history:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[CustomerLookupService] Failed to get customer history:', error);
      return null;
    }
  },

  /**
   * Search contacts by name, phone, or email
   */
  async search(query, limit = 10) {
    if (!supabase || !query) return [];

    try {
      const term = `%${query.trim()}%`;
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, phone, email, company')
        .eq('is_active', true)
        .or([
          `full_name.ilike.${term}`,
          `phone.ilike.${term}`,
          `email.ilike.${term}`,
          `company.ilike.${term}`
        ].join(','))
        .limit(limit);

      if (error) {
        console.error('[CustomerLookupService] Failed to search contacts:', error);
        throw new Error(error.message || 'Failed to search contacts');
      }

      return data || [];
    } catch (error) {
      console.error('[CustomerLookupService] Failed to search contacts:', error);
      throw error;
    }
  }
};

// ============================================================================
// TECHNICIAN / EMPLOYEE SERVICE
// ============================================================================

export const technicianService = {
  /**
   * Get all internal employees (technicians) who can be assigned to tickets
   * Uses the contacts table with is_internal = true
   */
  async getAll() {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, phone, role')
        .eq('is_internal', true)
        .eq('is_active', true)
        .order('full_name');

      if (error) {
        console.error('[TechnicianService] Failed to fetch technicians:', error);
        throw new Error(error.message || 'Failed to fetch technicians');
      }

      return data || [];
    } catch (error) {
      console.error('[TechnicianService] Failed to fetch technicians:', error);
      throw error;
    }
  },

  /**
   * Get a single technician by ID
   */
  async getById(id) {
    if (!supabase || !id) return null;

    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, phone, role')
        .eq('id', id)
        .eq('is_internal', true)
        .single();

      if (error) {
        console.error('[TechnicianService] Failed to fetch technician:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[TechnicianService] Failed to fetch technician:', error);
      return null;
    }
  },

  /**
   * Get technicians by role (e.g., 'Technician', 'Lead Technician', 'Project Manager')
   */
  async getByRole(role) {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, phone, role')
        .eq('is_internal', true)
        .eq('is_active', true)
        .ilike('role', `%${role}%`)
        .order('full_name');

      if (error) {
        console.error('[TechnicianService] Failed to fetch technicians by role:', error);
        throw new Error(error.message || 'Failed to fetch technicians');
      }

      return data || [];
    } catch (error) {
      console.error('[TechnicianService] Failed to fetch technicians by role:', error);
      throw error;
    }
  }
};

// Default export with all services
export default {
  tickets: serviceTicketService,
  schedules: serviceScheduleService,
  callLogs: serviceCallLogService,
  customerLookup: customerLookupService,
  technicians: technicianService
};
