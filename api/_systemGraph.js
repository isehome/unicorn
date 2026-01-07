/**
 * System Graph Service - Application Permissions Version
 *
 * Sends email and manages calendar as the system account (e.g., unicorn@isehome.com)
 * using Application Permissions. No user login or OAuth flow required.
 *
 * Usage:
 *   const { systemSendMail, systemCreateCalendarEvent } = require('./_systemGraph');
 *   await systemSendMail({ to: ['user@example.com'], subject: 'Hello', body: '...' });
 */

const { createClient } = require('@supabase/supabase-js');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// Lazy-initialized Supabase client to avoid crashes at module load time
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return _supabase;
}

// Azure AD configuration (same as existing MSAL setup)
const config = {
  tenant: process.env.AZURE_TENANT_ID,
  clientId: process.env.AZURE_CLIENT_ID,
  clientSecret: process.env.AZURE_CLIENT_SECRET,
};

// Token cache (app tokens last ~1 hour, auto-refresh as needed)
let tokenCache = {
  accessToken: null,
  expiresAt: null,
};

// System account email cache
let systemEmailCache = {
  email: null,
  fetchedAt: null,
};

/**
 * Get app-only token using client credentials flow
 * This is automatic - no user interaction needed
 */
async function getAppToken() {
  // Check cache (with 5 minute buffer)
  if (tokenCache.accessToken && tokenCache.expiresAt) {
    const bufferMs = 5 * 60 * 1000;
    if (tokenCache.expiresAt - Date.now() > bufferMs) {
      return tokenCache.accessToken;
    }
  }

  if (!config.tenant || !config.clientId || !config.clientSecret) {
    throw new Error('Missing Azure AD configuration (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)');
  }

  const body = new URLSearchParams();
  body.set('client_id', config.clientId);
  body.set('client_secret', config.clientSecret);
  body.set('grant_type', 'client_credentials');
  body.set('scope', 'https://graph.microsoft.com/.default');

  const resp = await fetch(
    `https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    console.error('[SystemGraph] Token error:', text);
    throw new Error(`Failed to get app token: ${resp.status}`);
  }

  const json = await resp.json();

  // Cache the token
  tokenCache = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in * 1000),
  };

  return json.access_token;
}

/**
 * Get the system account email from database config
 * Falls back to environment variable, then default
 */
async function getSystemAccountEmail() {
  // Cache for 5 minutes to avoid repeated DB calls
  if (systemEmailCache.email && systemEmailCache.fetchedAt) {
    if (Date.now() - systemEmailCache.fetchedAt < 5 * 60 * 1000) {
      return systemEmailCache.email;
    }
  }

  try {
    const { data } = await getSupabase()
      .from('app_configuration')
      .select('value')
      .eq('key', 'system_account_email')
      .single();

    if (data?.value) {
      systemEmailCache = { email: data.value, fetchedAt: Date.now() };
      return data.value;
    }
  } catch (e) {
    console.warn('[SystemGraph] Could not fetch system email from config:', e.message);
  }

  // Fallback chain
  const fallback = process.env.SYSTEM_ACCOUNT_EMAIL || 'unicorn@isehome.com';
  systemEmailCache = { email: fallback, fetchedAt: Date.now() };
  return fallback;
}

/**
 * Log usage for auditing (optional)
 */
async function logUsage(operation, target, success, error = null, metadata = {}) {
  try {
    await getSupabase().from('system_account_usage_log').insert({
      operation,
      target,
      success,
      error_message: error,
      metadata,
    });
  } catch (e) {
    // Don't fail operations due to logging errors
    console.warn('[SystemGraph] Usage log failed:', e.message);
  }
}

/**
 * Send email as the system account
 *
 * @param {Object} params
 * @param {string[]} params.to - Array of recipient emails
 * @param {string[]} params.cc - Array of CC emails (optional)
 * @param {string[]} params.bcc - Array of BCC emails (optional)
 * @param {string} params.subject - Email subject
 * @param {string} params.body - Email body (HTML or text)
 * @param {string} params.bodyType - 'HTML' or 'Text' (default: 'HTML')
 * @param {boolean} params.saveToSentItems - Save to sent folder (default: true)
 * @param {string} params.replyTo - Reply-to email (optional)
 */
async function systemSendMail(params) {
  const {
    to,
    cc = [],
    bcc = [],
    subject,
    body,
    bodyType = 'HTML',
    saveToSentItems = true,
    replyTo = null,
  } = params;

  if (!Array.isArray(to) || to.length === 0) {
    throw new Error('At least one recipient is required');
  }

  const token = await getAppToken();
  const senderEmail = await getSystemAccountEmail();

  const formatRecipients = (emails) =>
    emails.filter(Boolean).map((email) => ({
      emailAddress: { address: email.trim() },
    }));

  const payload = {
    message: {
      subject,
      body: {
        contentType: bodyType,
        content: body,
      },
      toRecipients: formatRecipients(to),
    },
    saveToSentItems,
  };

  if (cc.length > 0) {
    payload.message.ccRecipients = formatRecipients(cc);
  }

  if (bcc.length > 0) {
    payload.message.bccRecipients = formatRecipients(bcc);
  }

  if (replyTo) {
    payload.message.replyTo = [{ emailAddress: { address: replyTo } }];
  }

  // Application permissions: send as specific user
  const endpoint = `${GRAPH_BASE}/users/${senderEmail}/sendMail`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error('[SystemGraph] Send mail failed:', resp.status, text);
    await logUsage('send_mail', to.join(', '), false, `${resp.status}: ${text}`);
    throw new Error(`Failed to send email: ${resp.status} - ${text}`);
  }

  console.log(`[SystemGraph] Email sent from ${senderEmail} to ${to.join(', ')}: "${subject}"`);
  await logUsage('send_mail', to.join(', '), true, null, { subject, recipientCount: to.length });

  return {
    success: true,
    sentFrom: senderEmail,
  };
}

/**
 * Create a calendar event on the system account's calendar
 *
 * @param {Object} params
 * @param {string} params.subject - Event subject
 * @param {string} params.body - Event body/description (optional)
 * @param {string} params.bodyType - 'HTML' or 'Text' (default: 'Text')
 * @param {string} params.start - Start datetime (ISO format, e.g., '2026-01-15T09:00:00')
 * @param {string} params.end - End datetime (ISO format)
 * @param {string} params.timeZone - Timezone (default: 'America/Indiana/Indianapolis')
 * @param {string} params.location - Event location (optional)
 * @param {Object[]} params.attendees - Array of { email, name, type: 'required'|'optional' }
 * @param {string} params.showAs - 'free', 'tentative', 'busy', 'oof', 'workingElsewhere'
 * @param {boolean} params.isOnlineMeeting - Create Teams meeting (default: false)
 */
async function systemCreateCalendarEvent(params) {
  const {
    subject,
    body = '',
    bodyType = 'Text',
    start,
    end,
    timeZone = 'America/Indiana/Indianapolis',
    location = '',
    attendees = [],
    showAs = 'busy',
    isOnlineMeeting = false,
  } = params;

  if (!subject || !start || !end) {
    throw new Error('subject, start, and end are required');
  }

  const token = await getAppToken();
  const calendarOwner = await getSystemAccountEmail();

  const eventPayload = {
    subject,
    body: {
      contentType: bodyType,
      content: body,
    },
    start: {
      dateTime: start,
      timeZone,
    },
    end: {
      dateTime: end,
      timeZone,
    },
    showAs,
    isOnlineMeeting,
  };

  if (location) {
    eventPayload.location = { displayName: location };
  }

  if (attendees.length > 0) {
    eventPayload.attendees = attendees.map((a) => ({
      emailAddress: {
        address: a.email,
        name: a.name || a.email,
      },
      type: a.type || 'required',
    }));
  }

  // Application permissions: create on specific user's calendar
  const endpoint = `${GRAPH_BASE}/users/${calendarOwner}/events`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventPayload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error('[SystemGraph] Create event failed:', resp.status, text);
    await logUsage('create_event', subject, false, `${resp.status}: ${text}`);
    throw new Error(`Failed to create event: ${resp.status} - ${text}`);
  }

  const event = await resp.json();

  console.log(`[SystemGraph] Event created on ${calendarOwner}'s calendar: "${subject}" (${event.id})`);
  await logUsage('create_event', subject, true, null, { eventId: event.id, attendeeCount: attendees.length });

  return {
    success: true,
    eventId: event.id,
    webLink: event.webLink,
    organizer: calendarOwner,
  };
}

/**
 * Update a calendar event on the system account's calendar
 */
async function systemUpdateCalendarEvent(eventId, updates) {
  if (!eventId) {
    throw new Error('eventId is required');
  }

  const token = await getAppToken();
  const calendarOwner = await getSystemAccountEmail();

  const resp = await fetch(`${GRAPH_BASE}/users/${calendarOwner}/events/${eventId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error('[SystemGraph] Update event failed:', resp.status, text);
    await logUsage('update_event', eventId, false, `${resp.status}: ${text}`);
    throw new Error(`Failed to update event: ${resp.status} - ${text}`);
  }

  const event = await resp.json();
  await logUsage('update_event', eventId, true);

  return { success: true, event };
}

/**
 * Delete a calendar event from the system account's calendar
 */
async function systemDeleteCalendarEvent(eventId) {
  if (!eventId) {
    throw new Error('eventId is required');
  }

  const token = await getAppToken();
  const calendarOwner = await getSystemAccountEmail();

  const resp = await fetch(`${GRAPH_BASE}/users/${calendarOwner}/events/${eventId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  // 404 is OK - event might already be deleted
  if (!resp.ok && resp.status !== 404) {
    const text = await resp.text();
    console.error('[SystemGraph] Delete event failed:', resp.status, text);
    await logUsage('delete_event', eventId, false, `${resp.status}: ${text}`);
    throw new Error(`Failed to delete event: ${resp.status} - ${text}`);
  }

  await logUsage('delete_event', eventId, true);
  return { success: true };
}

/**
 * Get calendar events from the system account's calendar for a date range
 */
async function systemGetCalendarEvents(startDateTime, endDateTime, timeZone = 'America/Indiana/Indianapolis') {
  const token = await getAppToken();
  const calendarOwner = await getSystemAccountEmail();

  const params = new URLSearchParams({
    startDateTime,
    endDateTime,
    $top: '100',
    $orderby: 'start/dateTime',
  });

  const resp = await fetch(`${GRAPH_BASE}/users/${calendarOwner}/calendarView?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: `outlook.timezone="${timeZone}"`,
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to get events: ${resp.status} - ${text}`);
  }

  const data = await resp.json();
  return data.value;
}

/**
 * Get system account status
 * Verifies the app can access the system account
 * Requires User.Read.All Application permission
 */
async function getSystemAccountStatus() {
  try {
    const token = await getAppToken();
    const senderEmail = await getSystemAccountEmail();

    // Verify we can access the user (requires User.Read.All Application permission)
    const resp = await fetch(`${GRAPH_BASE}/users/${senderEmail}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!resp.ok) {
      const text = await resp.text();
      return {
        connected: false,
        healthy: false,
        accountEmail: senderEmail,
        error: `Cannot access account: ${resp.status}`,
        details: text,
        hint: 'Ensure User.Read.All APPLICATION permission is added and admin consent granted',
      };
    }

    const user = await resp.json();

    // If we can read the user profile, the system account is configured correctly
    // Mail.Send permission will be verified when actually sending an email
    return {
      connected: true,
      healthy: true,
      accountEmail: user.userPrincipalName || user.mail,
      accountName: user.displayName,
      hasMailAccess: true, // Will be confirmed when sending test email
      method: 'application_permissions',
    };
  } catch (err) {
    console.error('[SystemGraph] Status check failed:', err);
    return {
      connected: false,
      healthy: false,
      error: err.message,
    };
  }
}

/**
 * Clear caches (useful for testing or after config changes)
 */
function clearCaches() {
  tokenCache = { accessToken: null, expiresAt: null };
  systemEmailCache = { email: null, fetchedAt: null };
}

module.exports = {
  getAppToken,
  getSystemAccountEmail,
  systemSendMail,
  systemCreateCalendarEvent,
  systemUpdateCalendarEvent,
  systemDeleteCalendarEvent,
  systemGetCalendarEvents,
  getSystemAccountStatus,
  clearCaches,
};
