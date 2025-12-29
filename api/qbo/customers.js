/**
 * QBO Customers endpoint
 * Search and create customers in QuickBooks
 */

import OAuthClient from 'intuit-oauth';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper to get fresh OAuth client with valid tokens
async function getAuthenticatedClient() {
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

  oauthClient.setToken({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    token_type: 'bearer',
    expires_in: Math.floor((new Date(tokenData.access_token_expires_at) - new Date()) / 1000),
    x_refresh_token_expires_in: Math.floor((new Date(tokenData.refresh_token_expires_at) - new Date()) / 1000),
    realmId: tokenData.realm_id
  });

  // Check if token needs refresh
  if (!oauthClient.isAccessTokenValid()) {
    console.log('[QBO] Refreshing access token...');
    const authResponse = await oauthClient.refresh();
    const newToken = authResponse.getJson();

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
  }

  return { client: oauthClient, realmId: tokenData.realm_id };
}

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { client, realmId } = await getAuthenticatedClient();
    const baseUrl = `https://${process.env.QBO_ENVIRONMENT === 'production' ? '' : 'sandbox-'}quickbooks.api.intuit.com/v3/company/${realmId}`;

    if (req.method === 'GET') {
      // Search customers
      const { search } = req.query;
      let query = 'select * from Customer';

      if (search) {
        query += ` where DisplayName like '%${search.replace(/'/g, "\\'")}%'`;
      }

      query += ' MAXRESULTS 25';

      const response = await client.makeApiCall({
        url: `${baseUrl}/query?query=${encodeURIComponent(query)}`,
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });

      const result = response.getJson();
      const customers = (result.QueryResponse?.Customer || []).map(c => ({
        id: c.Id,
        displayName: c.DisplayName,
        companyName: c.CompanyName,
        email: c.PrimaryEmailAddr?.Address,
        phone: c.PrimaryPhone?.FreeFormNumber
      }));

      return res.status(200).json({ customers });
    }

    if (req.method === 'POST') {
      // Create customer from contact
      const { contactId } = req.body;

      if (!contactId) {
        return res.status(400).json({ error: 'Contact ID is required' });
      }

      // Get contact details
      const { data: contact, error: contactError } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .single();

      if (contactError || !contact) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      // Create customer in QBO
      const newCustomer = {
        DisplayName: contact.full_name,
        PrimaryPhone: contact.phone ? { FreeFormNumber: contact.phone } : undefined,
        PrimaryEmailAddr: contact.email ? { Address: contact.email } : undefined,
        BillAddr: contact.address ? { Line1: contact.address } : undefined
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

      // Store mapping
      await supabase
        .from('qbo_customer_mapping')
        .insert({
          contact_id: contactId,
          qbo_customer_id: createdCustomer.Id,
          qbo_display_name: createdCustomer.DisplayName,
          qbo_realm_id: realmId,
          sync_status: 'synced',
          last_synced_at: new Date().toISOString()
        });

      return res.status(200).json({
        customer: {
          id: createdCustomer.Id,
          displayName: createdCustomer.DisplayName
        }
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('[QBO Customers] Error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to access QuickBooks'
    });
  }
}
