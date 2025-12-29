/**
 * quickbooksService.js
 * Service for QuickBooks Online integration
 * Handles OAuth, customer mapping, and invoice creation
 */

import { supabase } from '../lib/supabase';

// QBO API endpoints via our Vercel serverless functions
const QBO_API_BASE = '/api/qbo';

export const quickbooksService = {
  /**
   * Get QuickBooks connection status
   */
  async getConnectionStatus() {
    if (!supabase) {
      return { connected: false, error: 'Supabase not configured' };
    }

    try {
      const { data, error } = await supabase.rpc('get_qbo_connection_status');

      if (error) {
        console.error('[quickbooksService] Get status failed:', error);
        return { connected: false, error: error.message };
      }

      if (!data || data.length === 0 || !data[0].is_connected) {
        return { connected: false };
      }

      return {
        connected: true,
        realmId: data[0].realm_id,
        companyName: data[0].company_name,
        tokenExpiresAt: data[0].token_expires_at,
        isTokenExpired: data[0].is_token_expired,
        needsRefresh: data[0].needs_refresh
      };
    } catch (error) {
      console.error('[quickbooksService] Get status error:', error);
      return { connected: false, error: error.message };
    }
  },

  /**
   * Initiate OAuth flow to connect QuickBooks
   */
  async initiateOAuth() {
    try {
      const response = await fetch(`${QBO_API_BASE}/auth`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to initiate OAuth');
      }

      // Redirect to QBO authorization URL
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }

      return data;
    } catch (error) {
      console.error('[quickbooksService] OAuth initiate error:', error);
      throw error;
    }
  },

  /**
   * Disconnect QuickBooks
   */
  async disconnect() {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      // Delete all tokens
      const { error } = await supabase
        .from('qbo_auth_tokens')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (error) {
        console.error('[quickbooksService] Disconnect failed:', error);
        throw new Error(error.message || 'Failed to disconnect');
      }

      return { success: true };
    } catch (error) {
      console.error('[quickbooksService] Disconnect error:', error);
      throw error;
    }
  },

  /**
   * Get customer mapping for a contact
   */
  async getCustomerMapping(contactId) {
    if (!supabase || !contactId) return null;

    try {
      const { data, error } = await supabase.rpc('get_qbo_customer_mapping', {
        p_contact_id: contactId
      });

      if (error) {
        console.error('[quickbooksService] Get mapping failed:', error);
        return null;
      }

      return data?.[0] || null;
    } catch (error) {
      console.error('[quickbooksService] Get mapping error:', error);
      return null;
    }
  },

  /**
   * Search for customers in QuickBooks
   */
  async searchQBOCustomers(searchTerm) {
    try {
      const response = await fetch(
        `${QBO_API_BASE}/customers?search=${encodeURIComponent(searchTerm)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to search customers');
      }

      return data.customers || [];
    } catch (error) {
      console.error('[quickbooksService] Search customers error:', error);
      throw error;
    }
  },

  /**
   * Link a contact to a QBO customer
   */
  async linkCustomer(contactId, qboCustomerId, qboDisplayName) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      // Get current realm ID
      const status = await this.getConnectionStatus();
      if (!status.connected) {
        throw new Error('QuickBooks is not connected');
      }

      const { data, error } = await supabase
        .from('qbo_customer_mapping')
        .upsert({
          contact_id: contactId,
          qbo_customer_id: qboCustomerId,
          qbo_display_name: qboDisplayName,
          qbo_realm_id: status.realmId,
          sync_status: 'synced',
          last_synced_at: new Date().toISOString()
        }, {
          onConflict: 'contact_id,qbo_realm_id'
        })
        .select()
        .single();

      if (error) {
        console.error('[quickbooksService] Link customer failed:', error);
        throw new Error(error.message || 'Failed to link customer');
      }

      return data;
    } catch (error) {
      console.error('[quickbooksService] Link customer error:', error);
      throw error;
    }
  },

  /**
   * Create a customer in QuickBooks from a contact
   */
  async createQBOCustomer(contactId) {
    try {
      const response = await fetch(`${QBO_API_BASE}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create customer');
      }

      return data.customer;
    } catch (error) {
      console.error('[quickbooksService] Create customer error:', error);
      throw error;
    }
  },

  /**
   * Create an invoice from a service ticket
   */
  async createInvoiceFromTicket(ticketId) {
    if (!supabase) throw new Error('Supabase not configured');

    try {
      // First update ticket status to pending
      await supabase
        .from('service_tickets')
        .update({
          qbo_sync_status: 'pending',
          qbo_sync_error: null
        })
        .eq('id', ticketId);

      // Call API to create invoice
      const response = await fetch(`${QBO_API_BASE}/create-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId })
      });
      const data = await response.json();

      if (!response.ok) {
        // Update ticket with error
        await supabase
          .from('service_tickets')
          .update({
            qbo_sync_status: 'failed',
            qbo_sync_error: data.error || 'Failed to create invoice'
          })
          .eq('id', ticketId);

        throw new Error(data.error || 'Failed to create invoice');
      }

      // Update ticket with success
      await supabase
        .from('service_tickets')
        .update({
          qbo_invoice_id: data.invoiceId,
          qbo_invoice_number: data.invoiceNumber,
          qbo_synced_at: new Date().toISOString(),
          qbo_sync_status: 'synced',
          qbo_sync_error: null
        })
        .eq('id', ticketId);

      return {
        success: true,
        invoiceId: data.invoiceId,
        invoiceNumber: data.invoiceNumber,
        invoiceUrl: data.invoiceUrl
      };
    } catch (error) {
      console.error('[quickbooksService] Create invoice error:', error);
      throw error;
    }
  },

  /**
   * Get invoice status/details
   */
  async getInvoiceStatus(invoiceId) {
    try {
      const response = await fetch(`${QBO_API_BASE}/invoice/${invoiceId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get invoice');
      }

      return data.invoice;
    } catch (error) {
      console.error('[quickbooksService] Get invoice error:', error);
      throw error;
    }
  },

  /**
   * Get QBO invoice view URL
   */
  getInvoiceViewUrl(realmId, invoiceId) {
    const baseUrl = process.env.NODE_ENV === 'production'
      ? 'https://qbo.intuit.com'
      : 'https://sandbox.qbo.intuit.com';
    return `${baseUrl}/app/invoice?txnId=${invoiceId}`;
  },

  /**
   * Build invoice line items from ticket data
   */
  buildInvoiceLineItems(ticket, timeLogs, parts) {
    const lineItems = [];
    const hourlyRate = ticket.hourly_rate || 150;

    // Calculate total hours from time logs
    const totalMinutes = (timeLogs || []).reduce((sum, log) => {
      if (log.check_out) {
        const mins = Math.round(
          (new Date(log.check_out) - new Date(log.check_in)) / 60000
        );
        return sum + mins;
      }
      return sum;
    }, 0);

    const totalHours = Math.round(totalMinutes / 60 * 100) / 100;

    // Labor line item
    if (totalHours > 0) {
      lineItems.push({
        type: 'labor',
        description: `Service Labor - ${ticket.title}`,
        quantity: totalHours,
        unitPrice: hourlyRate,
        amount: Math.round(totalHours * hourlyRate * 100) / 100
      });
    }

    // Parts line items
    (parts || []).forEach(part => {
      if (part.quantity_needed > 0 && part.unit_cost > 0) {
        lineItems.push({
          type: 'part',
          description: part.part_name || 'Parts',
          quantity: part.quantity_needed,
          unitPrice: part.unit_cost,
          amount: Math.round(part.quantity_needed * part.unit_cost * 100) / 100
        });
      }
    });

    return lineItems;
  },

  /**
   * Calculate invoice total
   */
  calculateInvoiceTotal(lineItems) {
    return lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  }
};

export default quickbooksService;
