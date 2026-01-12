/**
 * Calendar Response Processor
 *
 * Shared logic for checking calendar event attendee responses
 * and advancing the 4-step scheduling workflow.
 *
 * Workflow:
 * 1. Draft → pending_tech (on commit & send invite)
 * 2. pending_tech → tech_accepted (when tech accepts calendar invite)
 * 3. tech_accepted → pending_customer (when customer invite is sent)
 * 4. pending_customer → confirmed (when customer accepts)
 *
 * Used by:
 * - /api/cron/process-calendar-responses (cron job)
 * - /api/system-account/check-responses (manual trigger)
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { getAppToken, getSystemAccountEmail } = require('./_systemGraph');

// Create fresh Supabase client each time to avoid stale state issues in serverless
function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log(`[CalendarProcessor] getSupabase using URL: ${url?.substring(0, 30)}..., key exists: ${!!key}`);
  return createClient(url, key);
}

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

// Secret for generating response tokens
const RESPONSE_SECRET = process.env.SCHEDULE_RESPONSE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

// Generate secure token for accept/decline links
function generateResponseToken(scheduleId, action) {
  const data = `${scheduleId}:${action}`;
  return crypto.createHmac('sha256', RESPONSE_SECRET)
    .update(data)
    .digest('hex')
    .substring(0, 32);
}

// Get calendar event details including attendee responses
async function getEventDetails(token, userEmail, eventId) {
  const response = await fetch(
    `${GRAPH_BASE}/users/${userEmail}/events/${eventId}?$select=id,subject,attendees,organizer`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      return null; // Event was deleted
    }
    const errorText = await response.text();
    console.error(`[CalendarProcessor] Failed to get event ${eventId}:`, response.status, errorText);
    throw new Error(`Failed to get event: ${response.status}`);
  }

  return response.json();
}

// Add customer as attendee to an existing event
async function addCustomerToEvent(token, userEmail, eventId, customerEmail, customerName) {
  const event = await getEventDetails(token, userEmail, eventId);
  if (!event) return null;

  // Check if customer is already an attendee
  const alreadyAdded = event.attendees?.some(
    a => a.emailAddress?.address?.toLowerCase() === customerEmail.toLowerCase()
  );
  if (alreadyAdded) {
    console.log(`[CalendarProcessor] Customer ${customerEmail} already an attendee`);
    return event;
  }

  // Add customer to attendees
  const updatedAttendees = [
    ...event.attendees,
    {
      emailAddress: {
        address: customerEmail,
        name: customerName || customerEmail
      },
      type: 'required'
    }
  ];

  // Update subject to indicate waiting for customer
  let newSubject = event.subject;
  if (newSubject.startsWith('[Service]')) {
    newSubject = newSubject.replace('[Service]', '[AWAITING CUSTOMER]');
  }

  const response = await fetch(
    `${GRAPH_BASE}/users/${userEmail}/events/${eventId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject: newSubject,
        attendees: updatedAttendees
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to update event: ${await response.text()}`);
  }

  return response.json();
}

// Finalize event when customer confirms
async function finalizeEvent(token, userEmail, eventId) {
  const event = await getEventDetails(token, userEmail, eventId);
  if (!event) return null;

  let newSubject = (event.subject || '')
    .replace('[AWAITING CUSTOMER]', '[Service]')
    .replace('[PENDING]', '[Service]')
    .replace('[TENTATIVE]', '[Service]')
    .trim();

  const response = await fetch(
    `${GRAPH_BASE}/users/${userEmail}/events/${eventId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject: newSubject,
        showAs: 'busy'
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to finalize event: ${await response.text()}`);
  }

  return response.json();
}

// Send customer confirmation email with accept/decline links
// This works around Apple Calendar/iCloud interoperability issues
async function sendCustomerConfirmationEmail(token, systemEmail, schedule, ticket) {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.APP_URL || 'https://unicorn-one.vercel.app');

  const acceptToken = generateResponseToken(schedule.id, 'accept');
  const declineToken = generateResponseToken(schedule.id, 'decline');

  const acceptUrl = `${baseUrl}/api/public/schedule-response?action=accept&scheduleId=${schedule.id}&token=${acceptToken}`;
  const declineUrl = `${baseUrl}/api/public/schedule-response?action=decline&scheduleId=${schedule.id}&token=${declineToken}`;

  // Format date/time for display
  const dateStr = new Date(schedule.scheduled_date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const startTime = schedule.scheduled_time_start?.slice(0, 5) || '00:00';
  const endTime = schedule.scheduled_time_end?.slice(0, 5) || '00:00';

  // Brand colors from styleSystem.js
  const BRAND_SUCCESS = '#94AF32';  // Olive green - primary action color
  const BRAND_PRIMARY = '#8B5CF6';  // Violet - brand primary
  const BRAND_DANGER = '#EF4444';   // Red - decline/cancel

  // Logo URL - use production domain for email compatibility
  const logoUrl = 'https://unicorn-one.vercel.app/android-chrome-192x192.png';

  // Use table-based layout for maximum email client compatibility
  // Inline styles throughout - no CSS classes
  const emailBody = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your Service Appointment</title>
</head>
<body style="margin: 0; padding: 0; background-color: #18181B; font-family: Arial, Helvetica, sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #18181B;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width: 600px; background-color: #27272A; border-radius: 12px; overflow: hidden;">

          <!-- Header with Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #18181B 0%, #27272A 100%); padding: 30px 40px; text-align: center; border-bottom: 3px solid ${BRAND_PRIMARY};">
              <img src="${logoUrl}" alt="Intelligent Systems" width="60" height="60" style="display: block; margin: 0 auto 16px auto; border-radius: 12px;">
              <h1 style="color: #FAFAFA; margin: 0; font-size: 22px; font-weight: bold; letter-spacing: 1px;">INTELLIGENT SYSTEMS</h1>
              <p style="color: #A1A1AA; margin: 8px 0 0 0; font-size: 14px;">Field Operations</p>
            </td>
          </tr>

          <!-- Action Required Banner -->
          <tr>
            <td style="background-color: ${BRAND_SUCCESS}; padding: 16px 40px; text-align: center;">
              <p style="color: #ffffff; margin: 0; font-size: 18px; font-weight: bold; letter-spacing: 0.5px;">⚡ ACTION REQUIRED</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 40px; background-color: #ffffff;">
              <p style="color: #18181B; font-size: 18px; line-height: 1.6; margin: 0 0 16px 0;">
                Hello <strong>${ticket.customer_name || 'Valued Customer'}</strong>,
              </p>

              <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Great news! Your service technician has confirmed their availability. Please confirm this appointment works for you.
              </p>

              <!-- Appointment Details Box -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #F4F4F5; border-left: 4px solid ${BRAND_PRIMARY}; border-radius: 0 8px 8px 0; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 24px;">
                    <p style="color: ${BRAND_PRIMARY}; font-size: 12px; font-weight: bold; margin: 0 0 16px 0; text-transform: uppercase; letter-spacing: 1px;">Appointment Details</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="padding: 10px 0; color: #71717A; font-size: 14px; width: 110px; vertical-align: top;">📅 Date:</td>
                        <td style="padding: 10px 0; color: #18181B; font-size: 16px; font-weight: bold;">${dateStr}</td>
                      </tr>
                      <tr>
                        <td style="padding: 10px 0; color: #71717A; font-size: 14px; vertical-align: top;">🕐 Time:</td>
                        <td style="padding: 10px 0; color: #18181B; font-size: 16px; font-weight: bold;">${startTime} - ${endTime}</td>
                      </tr>
                      ${schedule.technician_name ? `<tr>
                        <td style="padding: 10px 0; color: #71717A; font-size: 14px; vertical-align: top;">👤 Technician:</td>
                        <td style="padding: 10px 0; color: #18181B; font-size: 16px; font-weight: bold;">${schedule.technician_name}</td>
                      </tr>` : ''}
                      ${ticket.customer_address ? `<tr>
                        <td style="padding: 10px 0; color: #71717A; font-size: 14px; vertical-align: top;">📍 Location:</td>
                        <td style="padding: 10px 0; color: #18181B; font-size: 16px; font-weight: bold;">${ticket.customer_address}</td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Primary CTA Button - VERY PROMINENT -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td align="center" style="background-color: ${BRAND_SUCCESS}; border-radius: 10px;">
                          <a href="${acceptUrl}" style="display: block; padding: 20px 40px; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 20px; text-align: center;">
                            ✓ YES, CONFIRM MY APPOINTMENT
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Secondary decline link - subtle -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 30px;">
                <tr>
                  <td align="center" style="padding-top: 8px;">
                    <a href="${declineUrl}" style="color: #71717A; font-size: 13px; text-decoration: underline;">I need to reschedule this appointment</a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
                <tr>
                  <td style="border-top: 1px solid #E4E4E7;"></td>
                </tr>
              </table>

              <!-- Fallback Link - compact -->
              <p style="color: #A1A1AA; font-size: 12px; line-height: 1.5; margin: 0;">
                <strong>Button not working?</strong> Copy this link: <span style="color: ${BRAND_PRIMARY}; word-break: break-all;">${acceptUrl}</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #18181B; padding: 24px 40px; text-align: center;">
              <p style="color: #71717A; font-size: 12px; margin: 0;">
                Questions? Reply to this email or call our office.<br>
                <span style="color: #52525B;">© Intelligent Systems Engineering</span>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const emailPayload = {
    message: {
      subject: `ACTION REQUIRED: Confirm Your Service Appointment - ${dateStr}`,
      body: {
        contentType: 'HTML',
        content: emailBody
      },
      toRecipients: [
        {
          emailAddress: {
            address: ticket.customer_email,
            name: ticket.customer_name || ticket.customer_email
          }
        }
      ],
      importance: 'high'
    },
    saveToSentItems: true
  };

  const response = await fetch(
    `${GRAPH_BASE}/users/${systemEmail}/sendMail`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[CalendarProcessor] Failed to send customer email:', errorText);
    throw new Error(`Failed to send confirmation email: ${response.status}`);
  }

  console.log(`[CalendarProcessor] Sent confirmation email to ${ticket.customer_email}`);
  return true;
}

// Cancel a calendar event
async function cancelEvent(token, userEmail, eventId) {
  const response = await fetch(
    `${GRAPH_BASE}/users/${userEmail}/events/${eventId}/cancel`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        comment: 'This service appointment has been cancelled.'
      })
    }
  );

  return response.ok || response.status === 404;
}

// Process a single schedule
async function processSchedule(token, systemEmail, schedule, ticket) {
  const { calendar_event_id: eventId, schedule_status: currentStatus } = schedule;

  if (!eventId) {
    console.log(`[CalendarProcessor] Schedule ${schedule.id} has no calendar_event_id, skipping`);
    return { action: 'skipped', reason: 'No calendar event' };
  }

  console.log(`[CalendarProcessor] Processing schedule ${schedule.id}, status: ${currentStatus}, event: ${eventId}`);

  // Get event details including attendee responses
  const event = await getEventDetails(token, systemEmail, eventId);

  if (!event) {
    console.log(`[CalendarProcessor] Event ${eventId} not found (deleted externally?)`);
    return { action: 'event_deleted', newStatus: 'cancelled' };
  }

  // Analyze attendee responses
  const attendees = event.attendees || [];
  const technicianEmail = schedule.technician_email?.toLowerCase();
  const customerEmail = ticket.customer_email?.toLowerCase();

  console.log(`[CalendarProcessor] Event attendees:`, JSON.stringify(attendees, null, 2));

  let techResponse = 'none';
  let customerResponse = 'none';

  for (const attendee of attendees) {
    const email = attendee.emailAddress?.address?.toLowerCase();
    const status = attendee.status?.response?.toLowerCase();

    console.log(`[CalendarProcessor] Attendee ${email}: response=${status}`);

    if (email === technicianEmail) {
      techResponse = status || 'none';
    } else if (email === customerEmail) {
      customerResponse = status || 'none';
    }
  }

  console.log(`[CalendarProcessor] Schedule ${schedule.id} - Tech (${technicianEmail}): ${techResponse}, Customer (${customerEmail || 'N/A'}): ${customerResponse}`);

  // Determine action based on current status and responses
  let action = 'no_change';
  let newStatus = currentStatus;

  // Check for declines first
  if (techResponse === 'declined') {
    action = 'tech_declined';
    newStatus = 'cancelled';
  } else if (customerResponse === 'declined') {
    action = 'customer_declined';
    newStatus = 'cancelled';
  }
  // Check for tech acceptance (Step 1 → Step 2: pending_tech → tech_accepted)
  else if (currentStatus === 'pending_tech' && (techResponse === 'accepted' || techResponse === 'tentativelyaccepted')) {
    action = 'tech_accepted';
    newStatus = 'tech_accepted';  // Intermediate status - customer invite not yet sent
  }
  // Check for customer acceptance (Step 3 → Step 4: pending_customer → confirmed)
  else if (currentStatus === 'pending_customer' && (customerResponse === 'accepted' || customerResponse === 'tentativelyaccepted')) {
    action = 'customer_accepted';
    newStatus = 'confirmed';
  }

  return {
    action,
    newStatus,
    techResponse,
    customerResponse,
    eventId
  };
}

// Apply the result of processing
async function applyResult(token, systemEmail, result, schedule, ticket) {
  const { action, newStatus, eventId } = result;

  if (action === 'no_change' || action === 'skipped') {
    return { applied: false };
  }

  const updates = {
    schedule_status: newStatus,
    tech_calendar_response: result.techResponse,
    customer_calendar_response: result.customerResponse
  };

  if (action === 'tech_accepted') {
    // Tech accepted - record timestamp, status stays at 'tech_accepted'
    // Customer invite will be sent separately (manually or via sendCustomerInvite API)
    updates.technician_accepted_at = new Date().toISOString();
    console.log(`[CalendarProcessor] Tech accepted schedule ${schedule.id}, status → tech_accepted`);

    // If no customer email configured, we can auto-confirm since there's no customer to notify
    if (!ticket.customer_email) {
      console.log(`[CalendarProcessor] No customer email, auto-confirming schedule ${schedule.id}`);
      updates.schedule_status = 'confirmed';
    }
    // Otherwise, status stays at 'tech_accepted' and user can:
    // 1. Manually send customer invite (moves to pending_customer)
    // 2. Manually mark customer confirmed (moves to confirmed)
  } else if (action === 'customer_accepted') {
    updates.customer_accepted_at = new Date().toISOString();
    try {
      await finalizeEvent(token, systemEmail, eventId);
      console.log(`[CalendarProcessor] Finalized event ${eventId}`);
    } catch (err) {
      console.error(`[CalendarProcessor] Failed to finalize event:`, err);
    }
  } else if (action === 'tech_declined' || action === 'customer_declined' || action === 'event_deleted') {
    if (action !== 'event_deleted') {
      try {
        await cancelEvent(token, systemEmail, eventId);
        console.log(`[CalendarProcessor] Cancelled event ${eventId}`);
      } catch (err) {
        console.error(`[CalendarProcessor] Failed to cancel event:`, err);
      }
    }

    await getSupabase()
      .from('service_tickets')
      .update({ status: 'triaged' })
      .eq('id', ticket.id);

    console.log(`[CalendarProcessor] Returned ticket ${ticket.id} to unscheduled`);
  }

  const { error } = await getSupabase()
    .from('service_schedules')
    .update(updates)
    .eq('id', schedule.id);

  if (error) {
    console.error(`[CalendarProcessor] Failed to update schedule:`, error);
    return { applied: false, error: error.message };
  }

  console.log(`[CalendarProcessor] Updated schedule ${schedule.id}: ${action} → ${updates.schedule_status}`);
  return { applied: true, action };
}

/**
 * Main processing function
 * @param {string[]} scheduleIds - Optional array of specific schedule IDs to check
 */
async function processCalendarResponses(scheduleIds = null) {
  const token = await getAppToken();
  const systemEmail = await getSystemAccountEmail();

  console.log(`[CalendarProcessor] Using system account: ${systemEmail}`);
  console.log(`[CalendarProcessor] scheduleIds param:`, scheduleIds);

  // Build query for pending schedules
  let query = getSupabase()
    .from('service_schedules')
    .select(`
      id,
      ticket_id,
      calendar_event_id,
      schedule_status,
      technician_id,
      technician_name,
      tech_calendar_response,
      customer_calendar_response,
      scheduled_date,
      scheduled_time_start,
      scheduled_time_end
    `)
    .not('calendar_event_id', 'is', null);

  if (scheduleIds && scheduleIds.length > 0) {
    console.log(`[CalendarProcessor] Filtering by schedule IDs:`, scheduleIds);
    query = query.in('id', scheduleIds);
  } else {
    // Check all statuses that need calendar response monitoring
    console.log(`[CalendarProcessor] Filtering by statuses: pending_tech, tech_accepted, pending_customer`);
    query = query.in('schedule_status', ['pending_tech', 'tech_accepted', 'pending_customer']);
  }

  const { data: pendingSchedules, error: fetchError } = await query
    .order('created_at', { ascending: true })
    .limit(20);

  if (fetchError) {
    console.error(`[CalendarProcessor] Query error:`, fetchError);
    throw fetchError;
  }

  console.log(`[CalendarProcessor] Found ${pendingSchedules?.length || 0} schedules to check`);
  console.log(`[CalendarProcessor] Raw query result:`, JSON.stringify(pendingSchedules));
  if (pendingSchedules && pendingSchedules.length > 0) {
    console.log(`[CalendarProcessor] First schedule:`, JSON.stringify(pendingSchedules[0]));
  }

  // DEBUG: If scheduleIds were provided but no results, do a direct query to see what's there
  if (scheduleIds && scheduleIds.length > 0 && (!pendingSchedules || pendingSchedules.length === 0)) {
    console.log(`[CalendarProcessor] No schedules found with filter, doing direct query...`);
    const { data: directResult, error: directError } = await getSupabase()
      .from('service_schedules')
      .select('id, schedule_status, calendar_event_id')
      .in('id', scheduleIds);
    console.log(`[CalendarProcessor] Direct query result:`, JSON.stringify(directResult), directError);
  }

  // Get technician emails from contacts table (technicians are stored as contacts)
  const technicianIds = [...new Set(pendingSchedules?.map(s => s.technician_id).filter(Boolean) || [])];
  let technicianEmails = {};

  if (technicianIds.length > 0) {
    const { data: technicians } = await getSupabase()
      .from('contacts')
      .select('id, email')
      .in('id', technicianIds);

    if (technicians) {
      technicianEmails = Object.fromEntries(technicians.map(t => [t.id, t.email]));
    }
  }

  console.log(`[CalendarProcessor] Loaded emails for ${Object.keys(technicianEmails).length} technicians:`, technicianEmails);

  const results = {
    checked: 0,
    techAccepted: 0,
    customerAccepted: 0,
    declined: 0,
    noChange: 0,
    errors: 0,
    schedules: []
  };

  console.log(`[CalendarProcessor] Starting loop over ${pendingSchedules?.length || 0} schedules`);

  for (const schedule of pendingSchedules || []) {
    console.log(`[CalendarProcessor] Processing schedule ${schedule.id}`);
    try {
      schedule.technician_email = technicianEmails[schedule.technician_id] || null;
      console.log(`[CalendarProcessor] Set technician_email to ${schedule.technician_email}`);

      const ticketSupabase = getSupabase();
      console.log(`[CalendarProcessor] About to query service_tickets for ticket_id: ${schedule.ticket_id}`);

      const { data: ticket, error: ticketError } = await ticketSupabase
        .from('service_tickets')
        .select('id, customer_email, customer_name, customer_phone, title, customer_address')
        .eq('id', schedule.ticket_id)
        .single();

      console.log(`[CalendarProcessor] Ticket lookup: ${ticket?.id || 'not found'}, error: ${JSON.stringify(ticketError)}`);

      if (!ticket) {
        console.log(`[CalendarProcessor] No ticket found for schedule ${schedule.id}, skipping`);
        results.schedules.push({
          id: schedule.id,
          action: 'skipped',
          reason: 'no_ticket',
          ticket_id: schedule.ticket_id,
          ticketError: ticketError?.message || ticketError?.code || 'unknown'
        });
        continue;
      }

      console.log(`[CalendarProcessor] Calling processSchedule...`);
      const result = await processSchedule(token, systemEmail, schedule, ticket);
      console.log(`[CalendarProcessor] processSchedule result:`, JSON.stringify(result));

      console.log(`[CalendarProcessor] Calling applyResult...`);
      const applied = await applyResult(token, systemEmail, result, schedule, ticket);
      console.log(`[CalendarProcessor] applyResult done`);

      results.checked++;
      if (result.action === 'tech_accepted') results.techAccepted++;
      else if (result.action === 'customer_accepted') results.customerAccepted++;
      else if (result.action.includes('declined') || result.action === 'event_deleted') results.declined++;
      else results.noChange++;

      results.schedules.push({
        id: schedule.id,
        action: result.action,
        newStatus: result.newStatus,
        techResponse: result.techResponse,
        customerResponse: result.customerResponse
      });

    } catch (error) {
      console.error(`[CalendarProcessor] Error processing schedule ${schedule.id}:`, error);
      results.errors++;
      results.schedules.push({
        id: schedule.id,
        action: 'error',
        error: error.message
      });
    }
  }

  // Add debug info to results
  results.debug = {
    scheduleIdsParam: scheduleIds,
    rawQueryResult: pendingSchedules,
    systemEmail
  };

  return results;
}

/**
 * Send customer invite for a schedule that's in tech_accepted status
 * This moves the schedule from tech_accepted → pending_customer
 */
async function sendCustomerInviteForSchedule(scheduleId) {
  const token = await getAppToken();
  const systemEmail = await getSystemAccountEmail();

  // Get the schedule
  const { data: schedule, error: scheduleError } = await getSupabase()
    .from('service_schedules')
    .select(`
      id,
      ticket_id,
      calendar_event_id,
      schedule_status,
      technician_id,
      technician_name,
      scheduled_date,
      scheduled_time_start,
      scheduled_time_end
    `)
    .eq('id', scheduleId)
    .single();

  if (scheduleError || !schedule) {
    throw new Error(`Schedule not found: ${scheduleId}`);
  }

  if (schedule.schedule_status !== 'tech_accepted') {
    throw new Error(`Schedule ${scheduleId} is not in tech_accepted status (current: ${schedule.schedule_status})`);
  }

  // Get the ticket
  const { data: ticket, error: ticketError } = await getSupabase()
    .from('service_tickets')
    .select('id, customer_email, customer_name, customer_phone, title, customer_address')
    .eq('id', schedule.ticket_id)
    .single();

  if (ticketError || !ticket) {
    throw new Error(`Ticket not found for schedule ${scheduleId}`);
  }

  if (!ticket.customer_email) {
    throw new Error('No customer email configured on ticket');
  }

  const eventId = schedule.calendar_event_id;

  // Add customer to calendar event
  if (eventId) {
    try {
      await addCustomerToEvent(token, systemEmail, eventId, ticket.customer_email, ticket.customer_name);
      console.log(`[CalendarProcessor] Added customer ${ticket.customer_email} to event ${eventId}`);
    } catch (err) {
      console.error(`[CalendarProcessor] Failed to add customer to event:`, err);
      // Continue anyway - we'll still send email
    }
  }

  // Send email with accept/decline links
  await sendCustomerConfirmationEmail(token, systemEmail, schedule, ticket);

  // Update schedule status to pending_customer
  const { error: updateError } = await getSupabase()
    .from('service_schedules')
    .update({
      schedule_status: 'pending_customer',
      customer_invite_sent_at: new Date().toISOString()
    })
    .eq('id', scheduleId);

  if (updateError) {
    throw new Error(`Failed to update schedule status: ${updateError.message}`);
  }

  console.log(`[CalendarProcessor] Sent customer invite for schedule ${scheduleId}, status → pending_customer`);

  return { success: true, scheduleId, newStatus: 'pending_customer' };
}

/**
 * Manually mark customer as confirmed for a schedule
 * This moves the schedule from pending_customer → confirmed (or tech_accepted → confirmed)
 */
async function markCustomerConfirmed(scheduleId, confirmedBy) {
  const token = await getAppToken();
  const systemEmail = await getSystemAccountEmail();

  // Get the schedule
  const { data: schedule, error: scheduleError } = await getSupabase()
    .from('service_schedules')
    .select('id, calendar_event_id, schedule_status')
    .eq('id', scheduleId)
    .single();

  if (scheduleError || !schedule) {
    throw new Error(`Schedule not found: ${scheduleId}`);
  }

  // Allow manual confirmation from tech_accepted or pending_customer status
  if (!['tech_accepted', 'pending_customer'].includes(schedule.schedule_status)) {
    throw new Error(`Schedule ${scheduleId} cannot be confirmed (current: ${schedule.schedule_status})`);
  }

  // Finalize the calendar event if it exists
  const eventId = schedule.calendar_event_id;
  if (eventId) {
    try {
      await finalizeEvent(token, systemEmail, eventId);
      console.log(`[CalendarProcessor] Finalized event ${eventId}`);
    } catch (err) {
      console.error(`[CalendarProcessor] Failed to finalize event:`, err);
      // Continue anyway - the confirmation is more important
    }
  }

  // Update schedule status to confirmed
  const { error: updateError } = await getSupabase()
    .from('service_schedules')
    .update({
      schedule_status: 'confirmed',
      customer_calendar_response: 'accepted',
      customer_accepted_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
      confirmed_by: confirmedBy || 'manual',
      confirmation_method: 'internal'
    })
    .eq('id', scheduleId);

  if (updateError) {
    throw new Error(`Failed to update schedule status: ${updateError.message}`);
  }

  console.log(`[CalendarProcessor] Manually confirmed schedule ${scheduleId}, status → confirmed`);

  return { success: true, scheduleId, newStatus: 'confirmed' };
}

module.exports = {
  processCalendarResponses,
  getEventDetails,
  addCustomerToEvent,
  finalizeEvent,
  cancelEvent,
  sendCustomerInviteForSchedule,
  markCustomerConfirmed
};
