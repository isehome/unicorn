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

// ============================================================================
// TRIAGE SERVICE
// ============================================================================

export const serviceTriageService = {
  /**
   * Save triage information for a ticket
   */
  async saveTriage(ticketId, triageData) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!ticketId) throw new Error('Ticket ID is required');

    try {
      const updates = {
        triaged_by: triageData.triaged_by,
        triaged_by_name: triageData.triaged_by_name,
        triaged_at: new Date().toISOString(),
        triage_notes: triageData.triage_notes,
        estimated_hours: triageData.estimated_hours,
        parts_needed: triageData.parts_needed || false,
        proposal_needed: triageData.proposal_needed || false
      };

      // Update status to triaged if currently open
      const ticket = await serviceTicketService.getById(ticketId);
      if (ticket && ticket.status === 'open') {
        updates.status = 'triaged';
      }

      const { data, error } = await supabase
        .from('service_tickets')
        .update(updates)
        .eq('id', ticketId)
        .select()
        .single();

      if (error) {
        console.error('[ServiceTriageService] Failed to save triage:', error);
        throw new Error(error.message || 'Failed to save triage');
      }

      // Add triage note
      await serviceTicketService.addNote(ticketId, {
        note_type: 'triage',
        content: `Triaged by ${triageData.triaged_by_name}. Est. ${triageData.estimated_hours || 0} hours. ${triageData.parts_needed ? 'Parts needed. ' : ''}${triageData.proposal_needed ? 'Proposal needed.' : ''}`,
        author_name: triageData.triaged_by_name
      });

      return data;
    } catch (error) {
      console.error('[ServiceTriageService] Failed to save triage:', error);
      throw error;
    }
  }
};

// ============================================================================
// SERVICE PARTS
// ============================================================================

export const servicePartsService = {
  /**
   * Get all parts for a ticket
   */
  async getPartsForTicket(ticketId) {
    if (!supabase || !ticketId) return [];

    try {
      const { data, error } = await supabase
        .from('service_ticket_parts')
        .select(`
          *,
          global_part:global_parts(id, name, part_number, unit_cost)
        `)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[ServicePartsService] Failed to fetch parts:', error);
        throw new Error(error.message || 'Failed to fetch parts');
      }

      return data || [];
    } catch (error) {
      console.error('[ServicePartsService] Failed to fetch parts:', error);
      throw error;
    }
  },

  /**
   * Add a part to a ticket
   */
  async addPart(ticketId, partData) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!ticketId) throw new Error('Ticket ID is required');

    try {
      const { data, error } = await supabase
        .from('service_ticket_parts')
        .insert([{
          ticket_id: ticketId,
          global_part_id: partData.global_part_id || null,
          name: partData.name,
          part_number: partData.part_number || null,
          manufacturer: partData.manufacturer || null,
          description: partData.description || null,
          quantity_needed: partData.quantity_needed || 1,
          unit_cost: partData.unit_cost || 0,
          notes: partData.notes || null,
          added_by: partData.added_by,
          added_by_name: partData.added_by_name
        }])
        .select()
        .single();

      if (error) {
        console.error('[ServicePartsService] Failed to add part:', error);
        throw new Error(error.message || 'Failed to add part');
      }

      // Update ticket to indicate parts needed
      await supabase
        .from('service_tickets')
        .update({ parts_needed: true })
        .eq('id', ticketId);

      return data;
    } catch (error) {
      console.error('[ServicePartsService] Failed to add part:', error);
      throw error;
    }
  },

  /**
   * Update a part
   */
  async updatePart(partId, updates) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!partId) throw new Error('Part ID is required');

    try {
      const { data, error } = await supabase
        .from('service_ticket_parts')
        .update(updates)
        .eq('id', partId)
        .select()
        .single();

      if (error) {
        console.error('[ServicePartsService] Failed to update part:', error);
        throw new Error(error.message || 'Failed to update part');
      }

      return data;
    } catch (error) {
      console.error('[ServicePartsService] Failed to update part:', error);
      throw error;
    }
  },

  /**
   * Remove a part
   */
  async removePart(partId) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!partId) throw new Error('Part ID is required');

    try {
      const { error } = await supabase
        .from('service_ticket_parts')
        .delete()
        .eq('id', partId);

      if (error) {
        console.error('[ServicePartsService] Failed to remove part:', error);
        throw new Error(error.message || 'Failed to remove part');
      }
    } catch (error) {
      console.error('[ServicePartsService] Failed to remove part:', error);
      throw error;
    }
  },

  /**
   * Update part status
   */
  async updatePartStatus(partId, status, quantity = null) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const updates = { status };

      if (status === 'ordered' && quantity !== null) {
        updates.quantity_ordered = quantity;
      } else if (status === 'received' && quantity !== null) {
        updates.quantity_received = quantity;
      } else if (status === 'delivered' && quantity !== null) {
        updates.quantity_delivered = quantity;
      }

      return await this.updatePart(partId, updates);
    } catch (error) {
      console.error('[ServicePartsService] Failed to update part status:', error);
      throw error;
    }
  }
};

// ============================================================================
// SERVICE PURCHASE ORDERS
// ============================================================================

export const servicePOService = {
  /**
   * Generate PO number for service tickets
   */
  async generatePONumber(supplierId) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const { data, error } = await supabase
        .rpc('generate_service_po_number', { p_supplier_id: supplierId });

      if (error) {
        console.error('[ServicePOService] Failed to generate PO number:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('[ServicePOService] Failed to generate PO number:', error);
      throw error;
    }
  },

  /**
   * Create a purchase order for a service ticket
   */
  async createPO(ticketId, poData, lineItems = []) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!ticketId) throw new Error('Ticket ID is required');

    try {
      // Generate PO number
      const poNumber = await this.generatePONumber(poData.supplier_id);

      // Calculate totals
      const subtotal = lineItems.reduce((sum, item) => {
        return sum + (item.quantity_ordered * item.unit_cost);
      }, 0);

      const totalAmount = subtotal + (poData.tax_amount || 0) + (poData.shipping_cost || 0);

      // Create PO
      const { data: po, error: poError } = await supabase
        .from('service_ticket_purchase_orders')
        .insert([{
          ticket_id: ticketId,
          supplier_id: poData.supplier_id,
          po_number: poNumber,
          status: poData.status || 'draft',
          order_date: poData.order_date || new Date().toISOString().split('T')[0],
          requested_delivery_date: poData.requested_delivery_date,
          expected_delivery_date: poData.expected_delivery_date,
          subtotal: subtotal,
          tax_amount: poData.tax_amount || 0,
          shipping_cost: poData.shipping_cost || 0,
          total_amount: totalAmount,
          ship_to_address: poData.ship_to_address,
          ship_to_contact: poData.ship_to_contact,
          ship_to_phone: poData.ship_to_phone,
          internal_notes: poData.internal_notes,
          supplier_notes: poData.supplier_notes,
          created_by: poData.created_by,
          created_by_name: poData.created_by_name
        }])
        .select()
        .single();

      if (poError) {
        console.error('[ServicePOService] Failed to create PO:', poError);
        throw new Error(poError.message || 'Failed to create purchase order');
      }

      // Add line items
      if (lineItems.length > 0) {
        const items = lineItems.map((item, index) => ({
          po_id: po.id,
          part_id: item.part_id || null,
          line_number: index + 1,
          name: item.name,
          part_number: item.part_number || null,
          quantity_ordered: item.quantity_ordered,
          unit_cost: item.unit_cost || 0,
          notes: item.notes || null
        }));

        const { error: itemsError } = await supabase
          .from('service_ticket_po_items')
          .insert(items);

        if (itemsError) {
          console.error('[ServicePOService] Failed to add PO items:', itemsError);
          throw new Error(itemsError.message || 'Failed to add purchase order items');
        }

        // Update parts to 'ordered' status
        for (const item of lineItems) {
          if (item.part_id) {
            await servicePartsService.updatePartStatus(item.part_id, 'ordered', item.quantity_ordered);
          }
        }
      }

      return await this.getPO(po.id);
    } catch (error) {
      console.error('[ServicePOService] Failed to create PO:', error);
      throw error;
    }
  },

  /**
   * Get a single PO with full details
   */
  async getPO(poId) {
    if (!supabase || !poId) return null;

    try {
      const { data, error } = await supabase
        .from('service_ticket_purchase_orders')
        .select(`
          *,
          supplier:suppliers(id, name, short_code, email, phone, address),
          items:service_ticket_po_items(
            *,
            part:service_ticket_parts(id, name, part_number)
          )
        `)
        .eq('id', poId)
        .single();

      if (error) {
        console.error('[ServicePOService] Failed to fetch PO:', error);
        throw new Error(error.message || 'Failed to fetch purchase order');
      }

      return data;
    } catch (error) {
      console.error('[ServicePOService] Failed to fetch PO:', error);
      throw error;
    }
  },

  /**
   * Get all POs for a ticket
   */
  async getPOsForTicket(ticketId) {
    if (!supabase || !ticketId) return [];

    try {
      const { data, error } = await supabase
        .from('service_ticket_purchase_orders')
        .select(`
          *,
          supplier:suppliers(id, name, short_code),
          items:service_ticket_po_items(id, quantity_ordered, quantity_received)
        `)
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[ServicePOService] Failed to fetch POs:', error);
        throw new Error(error.message || 'Failed to fetch purchase orders');
      }

      return data || [];
    } catch (error) {
      console.error('[ServicePOService] Failed to fetch POs:', error);
      throw error;
    }
  },

  /**
   * Update a PO
   */
  async updatePO(poId, updates) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!poId) throw new Error('PO ID is required');

    try {
      const { data, error } = await supabase
        .from('service_ticket_purchase_orders')
        .update(updates)
        .eq('id', poId)
        .select()
        .single();

      if (error) {
        console.error('[ServicePOService] Failed to update PO:', error);
        throw new Error(error.message || 'Failed to update purchase order');
      }

      return data;
    } catch (error) {
      console.error('[ServicePOService] Failed to update PO:', error);
      throw error;
    }
  },

  /**
   * Submit PO to supplier
   */
  async submitPO(poId, submittedBy, submittedByName) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      const updates = {
        status: 'submitted',
        submitted_by: submittedBy,
        submitted_by_name: submittedByName,
        submitted_at: new Date().toISOString()
      };

      return await this.updatePO(poId, updates);
    } catch (error) {
      console.error('[ServicePOService] Failed to submit PO:', error);
      throw error;
    }
  },

  /**
   * Receive items on a PO
   */
  async receiveItems(poId, receivedItems, receivedBy, receivedByName) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      // Update each item
      for (const item of receivedItems) {
        const { error } = await supabase
          .from('service_ticket_po_items')
          .update({
            quantity_received: item.quantity_received,
            received_by: receivedBy,
            received_by_name: receivedByName,
            received_at: new Date().toISOString()
          })
          .eq('id', item.id);

        if (error) {
          console.error('[ServicePOService] Failed to update item receipt:', error);
          throw new Error(error.message || 'Failed to update item receipt');
        }

        // Update the associated part status
        if (item.part_id) {
          await servicePartsService.updatePartStatus(item.part_id, 'received', item.quantity_received);
        }
      }

      // Check if all items received
      const po = await this.getPO(poId);
      const allReceived = po.items.every(item => item.quantity_received >= item.quantity_ordered);
      const someReceived = po.items.some(item => item.quantity_received > 0);

      let newStatus = po.status;
      if (allReceived) {
        newStatus = 'received';
      } else if (someReceived) {
        newStatus = 'partially_received';
      }

      if (newStatus !== po.status) {
        await this.updatePO(poId, { status: newStatus });
      }

      return await this.getPO(poId);
    } catch (error) {
      console.error('[ServicePOService] Failed to receive items:', error);
      throw error;
    }
  },

  /**
   * Cancel a PO
   */
  async cancelPO(poId) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      // Get PO items to update part statuses
      const po = await this.getPO(poId);

      // Revert part statuses to 'needed'
      for (const item of po.items || []) {
        if (item.part_id) {
          await servicePartsService.updatePartStatus(item.part_id, 'needed');
        }
      }

      return await this.updatePO(poId, { status: 'cancelled' });
    } catch (error) {
      console.error('[ServicePOService] Failed to cancel PO:', error);
      throw error;
    }
  }
};

// ============================================================================
// SUPPLIERS SERVICE (for service tickets)
// ============================================================================

export const suppliersService = {
  /**
   * Get all active suppliers
   */
  async getAll() {
    if (!supabase) return [];

    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, name, short_code, email, phone, address, is_preferred')
        .eq('is_active', true)
        .order('name');

      if (error) {
        console.error('[SuppliersService] Failed to fetch suppliers:', error);
        throw new Error(error.message || 'Failed to fetch suppliers');
      }

      return data || [];
    } catch (error) {
      console.error('[SuppliersService] Failed to fetch suppliers:', error);
      throw error;
    }
  },

  /**
   * Get a single supplier
   */
  async getById(id) {
    if (!supabase || !id) return null;

    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        console.error('[SuppliersService] Failed to fetch supplier:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[SuppliersService] Failed to fetch supplier:', error);
      return null;
    }
  }
};

// Default export with all services
export default {
  tickets: serviceTicketService,
  schedules: serviceScheduleService,
  callLogs: serviceCallLogService,
  customerLookup: customerLookupService,
  technicians: technicianService,
  triage: serviceTriageService,
  parts: servicePartsService,
  purchaseOrders: servicePOService,
  suppliers: suppliersService
};
