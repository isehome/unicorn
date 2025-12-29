/**
 * QBO Create Invoice endpoint
 * Creates an invoice in QuickBooks from a service ticket
 */

import { createClient } from '@supabase/supabase-js';

// Helper to get fresh OAuth client with valid tokens
async function getAuthenticatedClient(supabase) {
  // Import intuit-oauth dynamically to avoid cold start issues
  const OAuthClient = (await import('intuit-oauth')).default;
  // Get stored tokens
  const { data: tokenData, error: tokenError } = await supabase
    .from('qbo_auth_tokens')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (tokenError || !tokenData) {
    throw new Error('QuickBooks is not connected');
  }

  const oauthClient = new OAuthClient({
    clientId: process.env.QBO_CLIENT_ID,
    clientSecret: process.env.QBO_CLIENT_SECRET,
    environment: process.env.QBO_ENVIRONMENT || 'sandbox',
    redirectUri: process.env.QBO_REDIRECT_URI
  });

  // Set the token
  oauthClient.setToken({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    token_type: 'bearer',
    expires_in: Math.floor((new Date(tokenData.access_token_expires_at) - new Date()) / 1000),
    x_refresh_token_expires_in: Math.floor((new Date(tokenData.refresh_token_expires_at) - new Date()) / 1000),
    realmId: tokenData.realm_id
  });

  // Check if token needs refresh
  if (oauthClient.isAccessTokenValid()) {
    return { client: oauthClient, realmId: tokenData.realm_id };
  }

  // Refresh the token
  console.log('[QBO] Refreshing access token...');
  const authResponse = await oauthClient.refresh();
  const newToken = authResponse.getJson();

  // Update stored tokens
  const now = new Date();
  const accessTokenExpiresAt = new Date(now.getTime() + (newToken.expires_in * 1000));
  const refreshTokenExpiresAt = new Date(now.getTime() + (newToken.x_refresh_token_expires_in * 1000));

  await supabase
    .from('qbo_auth_tokens')
    .update({
      access_token: newToken.access_token,
      refresh_token: newToken.refresh_token,
      access_token_expires_at: accessTokenExpiresAt.toISOString(),
      refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
      updated_at: now.toISOString()
    })
    .eq('realm_id', tokenData.realm_id);

  return { client: oauthClient, realmId: tokenData.realm_id };
}

// Get or create QBO customer
async function getOrCreateQBOCustomer(supabase, client, realmId, ticket, contact) {
  const baseUrl = `https://${process.env.QBO_ENVIRONMENT === 'production' ? '' : 'sandbox-'}quickbooks.api.intuit.com/v3/company/${realmId}`;

  // Check for existing mapping
  const { data: mapping } = await supabase
    .from('qbo_customer_mapping')
    .select('qbo_customer_id')
    .eq('contact_id', ticket.customer_id)
    .eq('qbo_realm_id', realmId)
    .single();

  if (mapping?.qbo_customer_id) {
    console.log('[QBO] Using existing customer mapping:', mapping.qbo_customer_id);
    return mapping.qbo_customer_id;
  }

  // Search for existing customer by name
  const customerName = ticket.customer_name || contact?.full_name || 'Unknown Customer';
  const searchResponse = await client.makeApiCall({
    url: `${baseUrl}/query?query=select * from Customer where DisplayName = '${customerName.replace(/'/g, "\\'")}'`,
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  const searchResult = searchResponse.getJson();
  if (searchResult.QueryResponse?.Customer?.length > 0) {
    const qboCustomer = searchResult.QueryResponse.Customer[0];
    console.log('[QBO] Found existing customer:', qboCustomer.Id);

    // Store mapping
    await supabase
      .from('qbo_customer_mapping')
      .insert({
        contact_id: ticket.customer_id,
        qbo_customer_id: qboCustomer.Id,
        qbo_display_name: qboCustomer.DisplayName,
        qbo_realm_id: realmId,
        sync_status: 'synced',
        last_synced_at: new Date().toISOString()
      });

    return qboCustomer.Id;
  }

  // Create new customer
  console.log('[QBO] Creating new customer:', customerName);
  const newCustomer = {
    DisplayName: customerName,
    PrimaryPhone: contact?.phone ? { FreeFormNumber: contact.phone } : undefined,
    PrimaryEmailAddr: contact?.email ? { Address: contact.email } : undefined,
    BillAddr: ticket.customer_address ? {
      Line1: ticket.customer_address
    } : undefined
  };

  const createResponse = await client.makeApiCall({
    url: `${baseUrl}/customer`,
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(newCustomer)
  });

  const createdCustomer = createResponse.getJson().Customer;
  console.log('[QBO] Created customer:', createdCustomer.Id);

  // Store mapping
  await supabase
    .from('qbo_customer_mapping')
    .insert({
      contact_id: ticket.customer_id,
      qbo_customer_id: createdCustomer.Id,
      qbo_display_name: createdCustomer.DisplayName,
      qbo_realm_id: realmId,
      sync_status: 'synced',
      last_synced_at: new Date().toISOString()
    });

  return createdCustomer.Id;
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticketId } = req.body;

  if (!ticketId) {
    return res.status(400).json({ error: 'Ticket ID is required' });
  }

  try {
    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get authenticated QBO client
    const { client, realmId } = await getAuthenticatedClient(supabase);
    const baseUrl = `https://${process.env.QBO_ENVIRONMENT === 'production' ? '' : 'sandbox-'}quickbooks.api.intuit.com/v3/company/${realmId}`;

    // Get ticket with all related data
    const { data: ticket, error: ticketError } = await supabase
      .from('service_tickets')
      .select(`
        *,
        contact:contacts!service_tickets_customer_id_fkey(*)
      `)
      .eq('id', ticketId)
      .single();

    if (ticketError || !ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Check if already exported
    if (ticket.qbo_invoice_id) {
      return res.status(400).json({
        error: 'This ticket has already been exported to QuickBooks',
        invoiceId: ticket.qbo_invoice_id
      });
    }

    // Get time logs
    const { data: timeLogs } = await supabase
      .from('service_time_logs')
      .select('*')
      .eq('ticket_id', ticketId)
      .not('check_out', 'is', null);

    // Get parts
    const { data: parts } = await supabase
      .from('service_ticket_parts')
      .select('*')
      .eq('ticket_id', ticketId);

    // Get or create QBO customer
    const qboCustomerId = await getOrCreateQBOCustomer(supabase, client, realmId, ticket, ticket.contact);

    // Calculate totals
    const hourlyRate = ticket.hourly_rate || 150;
    const totalMinutes = (timeLogs || []).reduce((sum, log) => {
      return sum + Math.round((new Date(log.check_out) - new Date(log.check_in)) / 60000);
    }, 0);
    const totalHours = Math.round(totalMinutes / 60 * 100) / 100;

    // Build invoice line items
    const lineItems = [];

    // Labor line
    if (totalHours > 0) {
      lineItems.push({
        DetailType: 'SalesItemLineDetail',
        Amount: Math.round(totalHours * hourlyRate * 100) / 100,
        Description: `Service Labor - ${ticket.title}`,
        SalesItemLineDetail: {
          Qty: totalHours,
          UnitPrice: hourlyRate
        }
      });
    }

    // Parts lines
    (parts || []).forEach(part => {
      if (part.quantity_needed > 0 && part.unit_cost > 0) {
        lineItems.push({
          DetailType: 'SalesItemLineDetail',
          Amount: Math.round(part.quantity_needed * part.unit_cost * 100) / 100,
          Description: part.part_name || 'Parts',
          SalesItemLineDetail: {
            Qty: part.quantity_needed,
            UnitPrice: part.unit_cost
          }
        });
      }
    });

    if (lineItems.length === 0) {
      return res.status(400).json({
        error: 'No billable items found on this ticket. Add time or parts before exporting.'
      });
    }

    // Create invoice
    const invoice = {
      CustomerRef: { value: qboCustomerId },
      Line: lineItems,
      DueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Net 30
      PrivateNote: `Service Ticket #${ticket.ticket_number} - ${ticket.title}`,
      CustomerMemo: { value: `Service Ticket #${ticket.ticket_number}` }
    };

    console.log('[QBO] Creating invoice:', JSON.stringify(invoice, null, 2));

    const invoiceResponse = await client.makeApiCall({
      url: `${baseUrl}/invoice`,
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(invoice)
    });

    const createdInvoice = invoiceResponse.getJson().Invoice;
    console.log('[QBO] Invoice created:', createdInvoice.Id, createdInvoice.DocNumber);

    // Build invoice URL
    const invoiceUrl = `https://${process.env.QBO_ENVIRONMENT === 'production' ? 'qbo' : 'sandbox.qbo'}.intuit.com/app/invoice?txnId=${createdInvoice.Id}`;

    return res.status(200).json({
      success: true,
      invoiceId: createdInvoice.Id,
      invoiceNumber: createdInvoice.DocNumber,
      invoiceUrl,
      total: createdInvoice.TotalAmt
    });
  } catch (error) {
    console.error('[QBO Create Invoice] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to create invoice'
    });
  }
}
