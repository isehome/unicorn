/**
 * Calendar Response Processor
 *
 * Shared logic for checking calendar event attendee responses
 * and advancing the 3-step scheduling workflow.
 *
 * Used by:
 * - /api/cron/process-calendar-responses (cron job)
 * - /api/system-account/check-responses (manual trigger)
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { getAppToken, getSystemAccountEmail } = require('./_systemGraph');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

  const emailBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); padding: 24px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">Service Appointment Confirmation</h1>
      </div>

      <div style="padding: 24px; background: #ffffff;">
        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
          Hello ${ticket.customer_name || 'Valued Customer'},
        </p>

        <p style="color: #374151; font-size: 16px; line-height: 1.6;">
          Your service technician has confirmed their availability for your appointment. Please confirm this time works for you.
        </p>

        <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Date:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${dateStr}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Time:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${startTime} - ${endTime}</td>
            </tr>
            ${schedule.technician_name ? `
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Technician:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${schedule.technician_name}</td>
            </tr>
            ` : ''}
            ${ticket.service_address ? `
            <tr>
              <td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Location:</td>
              <td style="padding: 8px 0; color: #111827; font-size: 14px; font-weight: 600;">${ticket.service_address}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        <p style="color: #374151; font-size: 16px; line-height: 1.6; text-align: center; margin-bottom: 24px;">
          <strong>Please confirm your appointment:</strong>
        </p>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${acceptUrl}" style="display: inline-block; background: #22c55e; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 0 8px;">
            ✓ Accept Appointment
          </a>
          <a href="${declineUrl}" style="display: inline-block; background: #ef4444; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 0 8px;">
            ✗ Decline
          </a>
        </div>

        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin-top: 24px;">
          If the buttons above don't work, you can copy and paste this link into your browser:<br>
          <span style="color: #4f46e5; word-break: break-all;">${acceptUrl}</span>
        </p>

        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          <em>Note: You may have also received a calendar invite. Accepting either the calendar invite or clicking the button above will confirm your appointment.</em>
        </p>
      </div>

      <div style="background: #f9fafb; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="color: #6b7280; font-size: 12px; margin: 0;">
          <strong style="color: #4f46e5;">INTELLIGENT SYSTEMS</strong> | Field Operations<br>
          Questions? Reply to this email or call our office.
        </p>
      </div>
    </div>
  `;

  const emailPayload = {
    message: {
      subject: `Please Confirm: Service Appointment on ${dateStr}`,
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
      ]
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
  // Check for tech acceptance (Step 1 → Step 2)
  else if (currentStatus === 'pending_tech' && (techResponse === 'accepted' || techResponse === 'tentativelyaccepted')) {
    action = 'tech_accepted';
    newStatus = 'pending_customer';
  }
  // Check for customer acceptance (Step 2 → Step 3)
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
    updates.technician_accepted_at = new Date().toISOString();

    if (ticket.customer_email) {
      // Add customer to calendar event
      try {
        await addCustomerToEvent(token, systemEmail, eventId, ticket.customer_email, ticket.customer_name);
        console.log(`[CalendarProcessor] Added customer ${ticket.customer_email} to event ${eventId}`);
      } catch (err) {
        console.error(`[CalendarProcessor] Failed to add customer to event:`, err);
      }

      // Also send email with accept/decline links (for Apple Calendar/iCloud users)
      try {
        await sendCustomerConfirmationEmail(token, systemEmail, schedule, ticket);
      } catch (err) {
        console.error(`[CalendarProcessor] Failed to send customer confirmation email:`, err);
        // Don't fail the whole operation - calendar invite was still sent
      }
    } else {
      console.log(`[CalendarProcessor] No customer email, auto-confirming schedule ${schedule.id}`);
      updates.schedule_status = 'confirmed';
    }
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

    await supabase
      .from('service_tickets')
      .update({ status: 'triaged' })
      .eq('id', ticket.id);

    console.log(`[CalendarProcessor] Returned ticket ${ticket.id} to unscheduled`);
  }

  const { error } = await supabase
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

  // Build query for pending schedules
  let query = supabase
    .from('service_schedules')
    .select(`
      id,
      ticket_id,
      calendar_event_id,
      schedule_status,
      technician_id,
      technician_name,
      tech_calendar_response,
      customer_calendar_response
    `)
    .not('calendar_event_id', 'is', null);

  if (scheduleIds && scheduleIds.length > 0) {
    query = query.in('id', scheduleIds);
  } else {
    query = query.in('schedule_status', ['pending_tech', 'pending_customer']);
  }

  const { data: pendingSchedules, error: fetchError } = await query
    .order('created_at', { ascending: true })
    .limit(20);

  if (fetchError) {
    throw fetchError;
  }

  console.log(`[CalendarProcessor] Found ${pendingSchedules?.length || 0} schedules to check`);

  // Get technician emails from contacts table (technicians are stored as contacts)
  const technicianIds = [...new Set(pendingSchedules?.map(s => s.technician_id).filter(Boolean) || [])];
  let technicianEmails = {};

  if (technicianIds.length > 0) {
    const { data: technicians } = await supabase
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

  for (const schedule of pendingSchedules || []) {
    try {
      schedule.technician_email = technicianEmails[schedule.technician_id] || null;

      const { data: ticket } = await supabase
        .from('service_tickets')
        .select('id, customer_email, customer_name, customer_phone, title')
        .eq('id', schedule.ticket_id)
        .single();

      if (!ticket) {
        console.log(`[CalendarProcessor] No ticket found for schedule ${schedule.id}`);
        continue;
      }

      const result = await processSchedule(token, systemEmail, schedule, ticket);
      const applied = await applyResult(token, systemEmail, result, schedule, ticket);

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

  return results;
}

module.exports = {
  processCalendarResponses,
  getEventDetails,
  addCustomerToEvent,
  finalizeEvent,
  cancelEvent
};
