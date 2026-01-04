/**
 * _systemGraph.js
 * 
 * Core service for Microsoft Graph operations using the system account.
 * This allows Unicorn to act as itself (unicorn@isehome.com) for:
 * - Sending emails
 * - Managing calendar events
 * - Reading/writing to SharePoint
 * 
 * Token Management:
 * - Proactively refreshes tokens before expiry
 * - Falls back to app-only token if refresh fails
 * - Logs all refresh attempts for debugging
 */

const { createClient } = require('@supabase/supabase-js');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const TOKEN_URL = 'https://login.microsoftonline.com';

// Supabase client with service role for token storage
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Azure AD config
const config = {
  tenant: process.env.AZURE_TENANT_ID,
  clientId: process.env.AZURE_CLIENT_ID,
  clientSecret: process.env.AZURE_CLIENT_SECRET,
};

/**
 * Get app-only token (client credentials flow)
 * Used as fallback when system account token is unavailable
 */
async function getAppOnlyToken() {
  if (!config.tenant || !config.clientId || !config.clientSecret) {
    throw new Error('Missing Azure AD configuration');
  }

  const body = new URLSearchParams();
  body.set('client_id', config.clientId);
  body.set('client_secret', config.clientSecret);
  body.set('grant_type', 'client_credentials');
  body.set('scope', 'https://graph.microsoft.com/.default');

  const resp = await fetch(`${TOKEN_URL}/${config.tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`App token error: ${resp.status} ${text}`);
  }

  const json = await resp.json();
  return json.access_token;
}

/**
 * Refresh the system account's access token using the stored refresh token
 */
async function refreshSystemToken(credentials, refreshType = 'on_demand') {
  if (!credentials?.refresh_token) {
    throw new Error('No refresh token available');
  }

  console.log('[SystemGraph] Refreshing token for', credentials.account_email);

  const body = new URLSearchParams();
  body.set('client_id', config.clientId);
  body.set('client_secret', config.clientSecret);
  body.set('grant_type', 'refresh_token');
  body.set('refresh_token', credentials.refresh_token);
  body.set('scope', 'offline_access openid profile email User.Read Mail.Send Calendars.ReadWrite');

  const resp = await fetch(`${TOKEN_URL}/${config.tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error('[SystemGraph] Token refresh failed:', resp.status, errorText);

    // Log the failure
    await supabase.from('system_account_refresh_log').insert({
      account_type: credentials.account_type || 'microsoft_365',
      refresh_type: refreshType,
      success: false,
      error_message: `${resp.status}: ${errorText.substring(0, 500)}`
    });

    // Update consecutive failures
    await supabase.from('system_account_credentials')
      .update({
        consecutive_failures: (credentials.consecutive_failures || 0) + 1,
        last_error: `Token refresh failed: ${resp.status}`,
        last_error_at: new Date().toISOString()
      })
      .eq('id', credentials.id);

    throw new Error(`Token refresh failed: ${resp.status}`);
  }

  const tokens = await resp.json();
  const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

  // Update stored tokens
  const { error: updateError } = await supabase.from('system_account_credentials')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || credentials.refresh_token, // Keep old if not returned
      token_expires_at: expiresAt.toISOString(),
      last_token_refresh: new Date().toISOString(),
      consecutive_failures: 0,
      last_error: null,
      last_error_at: null
    })
    .eq('id', credentials.id);

  if (updateError) {
    console.error('[SystemGraph] Failed to save refreshed token:', updateError);
  }

  // Log success
  await supabase.from('system_account_refresh_log').insert({
    account_type: credentials.account_type || 'microsoft_365',
    refresh_type: refreshType,
    success: true,
    token_expires_at: expiresAt.toISOString()
  });

  console.log('[SystemGraph] Token refreshed, expires at', expiresAt.toISOString());

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || credentials.refresh_token,
    expiresAt
  };
}

/**
 * Get a valid access token for the system account
 * - Checks if current token is valid
 * - Refreshes if expiring within 10 minutes
 * - Falls back to app-only token if system account fails
 */
async function getSystemToken(options = {}) {
  const { requireSystemAccount = false, refreshType = 'on_demand' } = options;

  // Get stored credentials
  const { data: credentials, error } = await supabase
    .from('system_account_credentials')
    .select('*')
    .eq('account_type', 'microsoft_365')
    .eq('is_active', true)
    .single();

  if (error || !credentials) {
    console.log('[SystemGraph] No system account configured');
    if (requireSystemAccount) {
      throw new Error('System account not configured');
    }
    // Fall back to app-only token
    return { token: await getAppOnlyToken(), isSystemAccount: false };
  }

  // Check if we have a valid access token
  const now = new Date();
  const expiresAt = credentials.token_expires_at ? new Date(credentials.token_expires_at) : null;
  const bufferMs = 10 * 60 * 1000; // 10 minutes

  if (credentials.access_token && expiresAt && expiresAt.getTime() > now.getTime() + bufferMs) {
    // Token is still valid
    return {
      token: credentials.access_token,
      isSystemAccount: true,
      accountEmail: credentials.account_email,
      expiresAt
    };
  }

  // Token expired or expiring soon - refresh it
  try {
    const refreshed = await refreshSystemToken(credentials, refreshType);
    return {
      token: refreshed.accessToken,
      isSystemAccount: true,
      accountEmail: credentials.account_email,
      expiresAt: refreshed.expiresAt
    };
  } catch (refreshError) {
    console.error('[SystemGraph] Failed to refresh system token:', refreshError.message);
    
    if (requireSystemAccount) {
      throw refreshError;
    }

    // Fall back to app-only token
    console.log('[SystemGraph] Falling back to app-only token');
    return { token: await getAppOnlyToken(), isSystemAccount: false };
  }
}

/**
 * Send an email as the system account
 */
async function systemSendMail({ to, cc, bcc, subject, body, bodyType = 'HTML', saveToSentItems = true }) {
  const { token, isSystemAccount, accountEmail } = await getSystemToken();

  if (!Array.isArray(to) || to.length === 0) {
    throw new Error('No recipients provided');
  }

  const message = {
    subject: subject || 'Notification',
    body: {
      contentType: bodyType,
      content: body || ''
    },
    toRecipients: to.map(email => ({
      emailAddress: { address: email }
    }))
  };

  if (cc && cc.length > 0) {
    message.ccRecipients = cc.filter(Boolean).map(email => ({
      emailAddress: { address: email }
    }));
  }

  if (bcc && bcc.length > 0) {
    message.bccRecipients = bcc.filter(Boolean).map(email => ({
      emailAddress: { address: email }
    }));
  }

  const payload = { message, saveToSentItems };

  // Determine the endpoint based on whether we have system account or app-only token
  const senderEmail = isSystemAccount ? accountEmail : process.env.NOTIFICATION_SENDER_EMAIL;
  const endpoint = `${GRAPH_BASE}/users/${encodeURIComponent(senderEmail)}/sendMail`;

  console.log('[SystemGraph] Sending mail via', isSystemAccount ? 'system account' : 'app-only', 'to', to.join(', '));

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[SystemGraph] Send mail failed:', response.status, errorText);
    throw new Error(`Failed to send mail: ${response.status}`);
  }

  // Update last successful use
  if (isSystemAccount) {
    await supabase.from('system_account_credentials')
      .update({ last_successful_use: new Date().toISOString() })
      .eq('account_type', 'microsoft_365');
  }

  console.log('[SystemGraph] Email sent successfully');
  return { success: true, sentAs: senderEmail };
}

/**
 * Create a calendar event on the system account's calendar
 */
async function systemCreateCalendarEvent({
  subject,
  body,
  bodyType = 'text',
  start,
  end,
  location,
  attendees = [],
  isOnlineMeeting = false,
  showAs = 'busy',
  categories = []
}) {
  const { token, isSystemAccount, accountEmail } = await getSystemToken({ requireSystemAccount: true });

  const event = {
    subject,
    body: body ? { contentType: bodyType, content: body } : undefined,
    start: {
      dateTime: start,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
    },
    end: {
      dateTime: end,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York'
    },
    showAs,
    categories
  };

  if (location) {
    event.location = { displayName: location };
  }

  if (attendees.length > 0) {
    event.attendees = attendees.map(a => ({
      emailAddress: {
        address: a.email,
        name: a.name || a.email
      },
      type: a.type || 'required'
    }));
  }

  if (isOnlineMeeting) {
    event.isOnlineMeeting = true;
    event.onlineMeetingProvider = 'teamsForBusiness';
  }

  const endpoint = `${GRAPH_BASE}/users/${encodeURIComponent(accountEmail)}/events`;

  console.log('[SystemGraph] Creating calendar event:', subject);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(event)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[SystemGraph] Create event failed:', response.status, errorText);
    throw new Error(`Failed to create event: ${response.status}`);
  }

  const data = await response.json();

  // Update last successful use
  await supabase.from('system_account_credentials')
    .update({ last_successful_use: new Date().toISOString() })
    .eq('account_type', 'microsoft_365');

  console.log('[SystemGraph] Calendar event created:', data.id);
  return { success: true, eventId: data.id, webLink: data.webLink };
}

/**
 * Update a calendar event on the system account's calendar
 */
async function systemUpdateCalendarEvent(eventId, updates) {
  const { token, accountEmail } = await getSystemToken({ requireSystemAccount: true });

  const endpoint = `${GRAPH_BASE}/users/${encodeURIComponent(accountEmail)}/events/${eventId}`;

  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(updates)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[SystemGraph] Update event failed:', response.status, errorText);
    throw new Error(`Failed to update event: ${response.status}`);
  }

  console.log('[SystemGraph] Calendar event updated:', eventId);
  return { success: true };
}

/**
 * Delete a calendar event from the system account's calendar
 */
async function systemDeleteCalendarEvent(eventId) {
  const { token, accountEmail } = await getSystemToken({ requireSystemAccount: true });

  const endpoint = `${GRAPH_BASE}/users/${encodeURIComponent(accountEmail)}/events/${eventId}`;

  const response = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (response.status === 404) {
    // Already deleted
    return { success: true, alreadyDeleted: true };
  }

  if (!response.ok && response.status !== 204) {
    const errorText = await response.text();
    console.error('[SystemGraph] Delete event failed:', response.status, errorText);
    throw new Error(`Failed to delete event: ${response.status}`);
  }

  console.log('[SystemGraph] Calendar event deleted:', eventId);
  return { success: true };
}

/**
 * Get calendar events from the system account's calendar
 */
async function systemGetCalendarEvents({ start, end, top = 50 }) {
  const { token, accountEmail } = await getSystemToken({ requireSystemAccount: true });

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  const url = new URL(`${GRAPH_BASE}/users/${encodeURIComponent(accountEmail)}/calendarView`);
  url.searchParams.set('startDateTime', start);
  url.searchParams.set('endDateTime', end);
  url.searchParams.set('$top', top.toString());
  url.searchParams.set('$select', 'id,subject,start,end,location,attendees,showAs,webLink');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: `outlook.timezone="${timezone}"`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[SystemGraph] Get events failed:', response.status, errorText);
    throw new Error(`Failed to get events: ${response.status}`);
  }

  const data = await response.json();
  return { success: true, events: data.value || [] };
}

/**
 * Get system account status
 */
async function getSystemAccountStatus() {
  const { data: credentials, error } = await supabase
    .from('system_account_credentials')
    .select('*')
    .eq('account_type', 'microsoft_365')
    .eq('is_active', true)
    .single();

  if (error || !credentials) {
    return {
      connected: false,
      reason: 'not_configured'
    };
  }

  // Check health
  const { data: health } = await supabase.rpc('is_system_account_healthy', {
    p_account_type: 'microsoft_365'
  });

  return {
    connected: true,
    healthy: health?.healthy || false,
    accountEmail: credentials.account_email,
    displayName: credentials.display_name,
    lastRefresh: credentials.last_token_refresh,
    lastUse: credentials.last_successful_use,
    tokenExpires: credentials.token_expires_at,
    consecutiveFailures: credentials.consecutive_failures,
    lastError: credentials.last_error,
    grantedScopes: credentials.granted_scopes,
    configuredBy: credentials.configured_by_name,
    configuredAt: credentials.configured_at,
    healthDetails: health
  };
}

/**
 * Check if system account is configured
 */
async function isSystemAccountConfigured() {
  const { count } = await supabase
    .from('system_account_credentials')
    .select('*', { count: 'exact', head: true })
    .eq('account_type', 'microsoft_365')
    .eq('is_active', true);

  return count > 0;
}

module.exports = {
  getSystemToken,
  refreshSystemToken,
  getAppOnlyToken,
  systemSendMail,
  systemCreateCalendarEvent,
  systemUpdateCalendarEvent,
  systemDeleteCalendarEvent,
  systemGetCalendarEvents,
  getSystemAccountStatus,
  isSystemAccountConfigured
};
