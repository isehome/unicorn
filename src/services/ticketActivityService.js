/**
 * ticketActivityService.js
 * Service for logging and retrieving service ticket activity
 */

import { supabase } from '../lib/supabase';

// Action types
export const ACTIVITY_TYPES = {
  CREATED: 'created',
  STATUS_CHANGE: 'status_change',
  ASSIGNMENT_CHANGE: 'assignment_change',
  TIME_ENTRY_ADDED: 'time_entry_added',
  TIME_ENTRY_UPDATED: 'time_entry_updated',
  TIME_ENTRY_DELETED: 'time_entry_deleted',
  PART_ADDED: 'part_added',
  PART_UPDATED: 'part_updated',
  PART_REMOVED: 'part_removed',
  TRIAGE_NOTE: 'triage_note',
  PHOTO_ADDED: 'photo_added',
  PHOTO_REMOVED: 'photo_removed',
  PRIORITY_CHANGE: 'priority_change',
  ESTIMATE_CHANGE: 'estimate_change',
  QBO_INVOICE_CREATED: 'qbo_invoice_created',
  SCHEDULED: 'scheduled',
  NOTE_ADDED: 'note_added',
  FIELD_UPDATED: 'field_updated'
};

// Human-readable action labels
const ACTION_LABELS = {
  [ACTIVITY_TYPES.CREATED]: 'created this ticket',
  [ACTIVITY_TYPES.STATUS_CHANGE]: 'changed status',
  [ACTIVITY_TYPES.ASSIGNMENT_CHANGE]: 'changed assignment',
  [ACTIVITY_TYPES.TIME_ENTRY_ADDED]: 'added time entry',
  [ACTIVITY_TYPES.TIME_ENTRY_UPDATED]: 'updated time entry',
  [ACTIVITY_TYPES.TIME_ENTRY_DELETED]: 'deleted time entry',
  [ACTIVITY_TYPES.PART_ADDED]: 'added part',
  [ACTIVITY_TYPES.PART_UPDATED]: 'updated part',
  [ACTIVITY_TYPES.PART_REMOVED]: 'removed part',
  [ACTIVITY_TYPES.TRIAGE_NOTE]: 'added triage note',
  [ACTIVITY_TYPES.PHOTO_ADDED]: 'added photo',
  [ACTIVITY_TYPES.PHOTO_REMOVED]: 'removed photo',
  [ACTIVITY_TYPES.PRIORITY_CHANGE]: 'changed priority',
  [ACTIVITY_TYPES.ESTIMATE_CHANGE]: 'updated estimate',
  [ACTIVITY_TYPES.QBO_INVOICE_CREATED]: 'created QuickBooks invoice',
  [ACTIVITY_TYPES.SCHEDULED]: 'scheduled visit',
  [ACTIVITY_TYPES.NOTE_ADDED]: 'added note',
  [ACTIVITY_TYPES.FIELD_UPDATED]: 'updated field'
};

export const ticketActivityService = {
  /**
   * Log an activity for a ticket
   */
  async logActivity({
    ticketId,
    userId,
    userEmail,
    userName,
    actionType,
    description,
    oldValue = null,
    newValue = null,
    metadata = null
  }) {
    try {
      const { data, error } = await supabase
        .from('service_ticket_activity')
        .insert({
          ticket_id: ticketId,
          user_id: userId || null,
          user_email: userEmail || null,
          user_name: userName || null,
          action_type: actionType,
          description: description || ACTION_LABELS[actionType] || actionType,
          old_value: oldValue,
          new_value: newValue,
          metadata: metadata
        })
        .select()
        .single();

      if (error) {
        console.error('[ticketActivityService] Error logging activity:', error);
        // Don't throw - activity logging should not break main operations
        return null;
      }

      return data;
    } catch (err) {
      console.error('[ticketActivityService] Exception logging activity:', err);
      return null;
    }
  },

  /**
   * Get activity history for a ticket
   */
  async getTicketActivity(ticketId, limit = 50) {
    const { data, error } = await supabase
      .from('service_ticket_activity')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[ticketActivityService] Error fetching activity:', error);
      throw error;
    }

    return data || [];
  },

  /**
   * Helper: Log status change
   */
  async logStatusChange(ticketId, user, oldStatus, newStatus) {
    const statusLabels = {
      open: 'Open',
      triaged: 'Triaged',
      scheduled: 'Scheduled',
      in_progress: 'In Progress',
      waiting_parts: 'Waiting for Parts',
      waiting_customer: 'Waiting for Customer',
      work_complete_needs_invoice: 'Work Complete - Needs Invoice',
      problem: 'Problem',
      closed: 'Closed'
    };

    return this.logActivity({
      ticketId,
      userId: user?.id,
      userEmail: user?.email,
      userName: user?.name || user?.full_name,
      actionType: ACTIVITY_TYPES.STATUS_CHANGE,
      description: `Changed status from "${statusLabels[oldStatus] || oldStatus}" to "${statusLabels[newStatus] || newStatus}"`,
      oldValue: { status: oldStatus },
      newValue: { status: newStatus }
    });
  },

  /**
   * Helper: Log time entry added
   */
  async logTimeEntryAdded(ticketId, user, timeEntry) {
    const hours = timeEntry.check_out && timeEntry.check_in
      ? ((new Date(timeEntry.check_out) - new Date(timeEntry.check_in)) / 3600000).toFixed(1)
      : '?';

    return this.logActivity({
      ticketId,
      userId: user?.id,
      userEmail: user?.email,
      userName: user?.name || user?.full_name,
      actionType: ACTIVITY_TYPES.TIME_ENTRY_ADDED,
      description: `Added ${hours} hours for ${timeEntry.technician_name || timeEntry.technician_email || 'technician'}`,
      newValue: {
        hours,
        technician: timeEntry.technician_name || timeEntry.technician_email,
        date: timeEntry.check_in
      }
    });
  },

  /**
   * Helper: Log time entry deleted
   */
  async logTimeEntryDeleted(ticketId, user, timeEntry) {
    const hours = timeEntry.check_out && timeEntry.check_in
      ? ((new Date(timeEntry.check_out) - new Date(timeEntry.check_in)) / 3600000).toFixed(1)
      : '?';

    return this.logActivity({
      ticketId,
      userId: user?.id,
      userEmail: user?.email,
      userName: user?.name || user?.full_name,
      actionType: ACTIVITY_TYPES.TIME_ENTRY_DELETED,
      description: `Deleted ${hours} hours from ${timeEntry.technician_name || timeEntry.technician_email || 'technician'}`,
      oldValue: {
        hours,
        technician: timeEntry.technician_name || timeEntry.technician_email,
        date: timeEntry.check_in
      }
    });
  },

  /**
   * Helper: Log part added
   */
  async logPartAdded(ticketId, user, part) {
    return this.logActivity({
      ticketId,
      userId: user?.id,
      userEmail: user?.email,
      userName: user?.name || user?.full_name,
      actionType: ACTIVITY_TYPES.PART_ADDED,
      description: `Added part: ${part.name || part.part_number || 'Unknown'} (qty: ${part.quantity_needed || 1})`,
      newValue: {
        name: part.name,
        part_number: part.part_number,
        quantity: part.quantity_needed
      }
    });
  },

  /**
   * Helper: Log part removed
   */
  async logPartRemoved(ticketId, user, part) {
    return this.logActivity({
      ticketId,
      userId: user?.id,
      userEmail: user?.email,
      userName: user?.name || user?.full_name,
      actionType: ACTIVITY_TYPES.PART_REMOVED,
      description: `Removed part: ${part.name || part.part_number || 'Unknown'}`,
      oldValue: {
        name: part.name,
        part_number: part.part_number,
        quantity: part.quantity_needed
      }
    });
  },

  /**
   * Helper: Log triage note
   */
  async logTriageNote(ticketId, user, note) {
    return this.logActivity({
      ticketId,
      userId: user?.id,
      userEmail: user?.email,
      userName: user?.name || user?.full_name,
      actionType: ACTIVITY_TYPES.TRIAGE_NOTE,
      description: `Added triage note: "${note.length > 100 ? note.substring(0, 100) + '...' : note}"`,
      newValue: { note }
    });
  },

  /**
   * Helper: Log QBO invoice created
   */
  async logQboInvoiceCreated(ticketId, user, invoiceNumber, invoiceId) {
    return this.logActivity({
      ticketId,
      userId: user?.id,
      userEmail: user?.email,
      userName: user?.name || user?.full_name,
      actionType: ACTIVITY_TYPES.QBO_INVOICE_CREATED,
      description: `Created QuickBooks invoice #${invoiceNumber}`,
      newValue: { invoiceNumber, invoiceId }
    });
  },

  /**
   * Helper: Log ticket created
   */
  async logTicketCreated(ticketId, user, ticketData) {
    return this.logActivity({
      ticketId,
      userId: user?.id,
      userEmail: user?.email,
      userName: user?.name || user?.full_name,
      actionType: ACTIVITY_TYPES.CREATED,
      description: `Created ticket: ${ticketData.title || ticketData.description?.substring(0, 50) || 'New ticket'}`,
      newValue: {
        title: ticketData.title,
        customer: ticketData.customer_name,
        priority: ticketData.priority
      }
    });
  },

  /**
   * Helper: Log photo added
   */
  async logPhotoAdded(ticketId, user, photoInfo) {
    return this.logActivity({
      ticketId,
      userId: user?.id,
      userEmail: user?.email,
      userName: user?.name || user?.full_name,
      actionType: ACTIVITY_TYPES.PHOTO_ADDED,
      description: `Added photo${photoInfo?.caption ? `: ${photoInfo.caption}` : ''}`,
      newValue: photoInfo
    });
  },

  /**
   * Helper: Log assignment change
   */
  async logAssignmentChange(ticketId, user, oldAssignee, newAssignee) {
    return this.logActivity({
      ticketId,
      userId: user?.id,
      userEmail: user?.email,
      userName: user?.name || user?.full_name,
      actionType: ACTIVITY_TYPES.ASSIGNMENT_CHANGE,
      description: newAssignee
        ? `Assigned to ${newAssignee.name || newAssignee.email}`
        : 'Removed assignment',
      oldValue: oldAssignee ? { name: oldAssignee.name, email: oldAssignee.email } : null,
      newValue: newAssignee ? { name: newAssignee.name, email: newAssignee.email } : null
    });
  },

  /**
   * Helper: Log estimate change
   */
  async logEstimateChange(ticketId, user, oldHours, newHours) {
    return this.logActivity({
      ticketId,
      userId: user?.id,
      userEmail: user?.email,
      userName: user?.name || user?.full_name,
      actionType: ACTIVITY_TYPES.ESTIMATE_CHANGE,
      description: `Updated estimate from ${oldHours || 0} to ${newHours} hours`,
      oldValue: { estimated_hours: oldHours },
      newValue: { estimated_hours: newHours }
    });
  }
};

export default ticketActivityService;
