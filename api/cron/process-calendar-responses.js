/**
 * Cron Job: Process Calendar Responses
 *
 * Polls pending service schedules and checks their calendar event
 * attendee responses to advance the 3-step workflow.
 *
 * Workflow:
 * 1. Find schedules in 'pending_tech' or 'pending_customer' status
 * 2. For each, fetch the calendar event from Graph API
 * 3. Check attendee response statuses
 * 4. Update service_schedules based on responses:
 *    - Tech accepts: status → pending_customer, add customer to invite
 *    - Customer accepts: status → confirmed
 *    - Anyone declines: status → cancelled, ticket → unscheduled
 *
 * Schedule: Every 3 minutes (*/3 * * * *)
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get system account email from config or fallback
async function getSystemAccountEmail() {
  try {
    const { data } = await supabase
      .from('app_configuration')
      .select('value')
      .eq('key', 'system_account_email')
      .single();

    if (data?.value) {
      return data.value;
    }
  } catch (e) {
    console.warn('[ProcessCalendar] Could not fetch system email from config:', e.message);
  }

  return process.env.SYSTEM_ACCOUNT_EMAIL || 'unicorn@isehome.com';
}

// Get app-only access token for Graph API
async function getAppToken() {
  const tokenUrl = `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/oauth2/v2.0/token`;

  const params = new URLSearchParams({
    client_id: process.env.AZURE_CLIENT_ID,
    client_secret: process.env.AZURE_CLIENT_SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!response.ok) {
    throw new Error(`Failed to get app token: ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Get calendar event details including attendee responses
async function getEventDetails(token, userEmail, eventId) {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userEmail}/events/${eventId}?$select=id,subject,attendees,organizer`,
    {
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );

  if (!response.ok) {
    if (response.status === 404) {
      return null; // Event was deleted
    }
    throw new Error(`Failed to get event: ${await response.text()}`);
  }

  return response.json();
}

// Add customer as attendee to an existing event
async function addCustomerToEvent(token, userEmail, eventId, customerEmail, customerName) {
  // First get current attendees
  const event = await getEventDetails(token, userEmail, eventId);
  if (!event) return null;

  // Check if customer is already an attendee
  const alreadyAdded = event.attendees?.some(
    a => a.emailAddress?.address?.toLowerCase() === customerEmail.toLowerCase()
  );
  if (alreadyAdded) {
    console.log(`[ProcessCalendar] Customer ${customerEmail} already an attendee`);
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
    `https://graph.microsoft.com/v1.0/users/${userEmail}/events/${eventId}`,
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

  // Remove status prefix from subject
  let newSubject = (event.subject || '')
    .replace('[AWAITING CUSTOMER]', '[Service]')
    .replace('[PENDING]', '[Service]')
    .replace('[TENTATIVE]', '[Service]')
    .trim();

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userEmail}/events/${eventId}`,
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

// Cancel/delete a calendar event
async function cancelEvent(token, userEmail, eventId) {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userEmail}/events/${eventId}/cancel`,
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

  // 204 is success, 404 means already deleted
  return response.ok || response.status === 404;
}

// Process a single schedule
async function processSchedule(token, systemEmail, schedule, ticket) {
  const { calendar_event_id: eventId, schedule_status: currentStatus } = schedule;

  if (!eventId) {
    console.log(`[ProcessCalendar] Schedule ${schedule.id} has no calendar_event_id, skipping`);
    return { action: 'skipped', reason: 'No calendar event' };
  }

  console.log(`[ProcessCalendar] Processing schedule ${schedule.id}, status: ${currentStatus}, event: ${eventId}`);

  // Get event details including attendee responses
  const event = await getEventDetails(token, systemEmail, eventId);

  if (!event) {
    console.log(`[ProcessCalendar] Event ${eventId} not found (deleted externally?)`);
    return { action: 'event_deleted', newStatus: 'cancelled' };
  }

  // Analyze attendee responses
  const attendees = event.attendees || [];
  const technicianEmail = schedule.technician_email?.toLowerCase();
  const customerEmail = ticket.customer_email?.toLowerCase();

  let techResponse = 'none';
  let customerResponse = 'none';

  for (const attendee of attendees) {
    const email = attendee.emailAddress?.address?.toLowerCase();
    const status = attendee.status?.response?.toLowerCase();

    if (email === technicianEmail) {
      techResponse = status || 'none';
    } else if (email === customerEmail) {
      customerResponse = status || 'none';
    }
  }

  console.log(`[ProcessCalendar] Schedule ${schedule.id} - Tech (${technicianEmail}): ${techResponse}, Customer (${customerEmail || 'N/A'}): ${customerResponse}`);

  // Determine action based on current status and responses
  let action = 'no_change';
  let newStatus = currentStatus;

  // Check for declines first (from either party)
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
    customer_calendar_response: result.customerResponse,
    last_response_check_at: new Date().toISOString()
  };

  // Handle specific actions
  if (action === 'tech_accepted') {
    updates.technician_accepted_at = new Date().toISOString();

    // Add customer to the calendar invite (if they have email)
    if (ticket.customer_email) {
      try {
        await addCustomerToEvent(
          token,
          systemEmail,
          eventId,
          ticket.customer_email,
          ticket.customer_name
        );
        console.log(`[ProcessCalendar] Added customer ${ticket.customer_email} to event ${eventId}`);
      } catch (err) {
        console.error(`[ProcessCalendar] Failed to add customer to event:`, err);
        // Continue anyway - we still update the schedule status
      }
    } else {
      // No customer email - skip to confirmed
      console.log(`[ProcessCalendar] No customer email, auto-confirming schedule ${schedule.id}`);
      updates.schedule_status = 'confirmed';
    }
  } else if (action === 'customer_accepted') {
    updates.customer_accepted_at = new Date().toISOString();

    // Finalize the event (update subject, show as busy)
    try {
      await finalizeEvent(token, systemEmail, eventId);
      console.log(`[ProcessCalendar] Finalized event ${eventId}`);
    } catch (err) {
      console.error(`[ProcessCalendar] Failed to finalize event:`, err);
    }
  } else if (action === 'tech_declined' || action === 'customer_declined' || action === 'event_deleted') {
    // Cancel the calendar event (if it still exists)
    if (action !== 'event_deleted') {
      try {
        await cancelEvent(token, systemEmail, eventId);
        console.log(`[ProcessCalendar] Cancelled event ${eventId}`);
      } catch (err) {
        console.error(`[ProcessCalendar] Failed to cancel event:`, err);
      }
    }

    // Return ticket to unscheduled (set status back to 'triaged')
    await supabase
      .from('service_tickets')
      .update({ status: 'triaged' })
      .eq('id', ticket.id);

    console.log(`[ProcessCalendar] Returned ticket ${ticket.id} to unscheduled`);
  }

  // Update the schedule
  const { error } = await supabase
    .from('service_schedules')
    .update(updates)
    .eq('id', schedule.id);

  if (error) {
    console.error(`[ProcessCalendar] Failed to update schedule:`, error);
    return { applied: false, error: error.message };
  }

  console.log(`[ProcessCalendar] Updated schedule ${schedule.id}: ${action} → ${updates.schedule_status}`);
  return { applied: true, action };
}

module.exports = async (req, res) => {
  // Verify cron secret for Vercel cron jobs
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow manual triggers without auth in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  console.log('[ProcessCalendar] Starting calendar response processing (polling mode)');

  try {
    const token = await getAppToken();
    const systemEmail = await getSystemAccountEmail();

    console.log(`[ProcessCalendar] Using system account: ${systemEmail}`);

    // Find schedules that are pending responses
    const { data: pendingSchedules, error: fetchError } = await supabase
      .from('service_schedules')
      .select(`
        id,
        ticket_id,
        calendar_event_id,
        schedule_status,
        technician_id,
        technician_email,
        technician_name,
        tech_calendar_response,
        customer_calendar_response,
        last_response_check_at
      `)
      .in('schedule_status', ['pending_tech', 'pending_customer'])
      .not('calendar_event_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(20);

    if (fetchError) {
      throw fetchError;
    }

    console.log(`[ProcessCalendar] Found ${pendingSchedules?.length || 0} pending schedules to check`);

    const results = {
      checked: 0,
      techAccepted: 0,
      customerAccepted: 0,
      declined: 0,
      noChange: 0,
      errors: 0
    };

    for (const schedule of pendingSchedules || []) {
      try {
        // Get ticket details
        const { data: ticket } = await supabase
          .from('service_tickets')
          .select('id, customer_email, customer_name, customer_phone, title')
          .eq('id', schedule.ticket_id)
          .single();

        if (!ticket) {
          console.log(`[ProcessCalendar] No ticket found for schedule ${schedule.id}`);
          continue;
        }

        // Process the schedule
        const result = await processSchedule(token, systemEmail, schedule, ticket);

        // Apply the result
        const applied = await applyResult(token, systemEmail, result, schedule, ticket);

        // Update counters
        results.checked++;
        if (result.action === 'tech_accepted') results.techAccepted++;
        else if (result.action === 'customer_accepted') results.customerAccepted++;
        else if (result.action.includes('declined') || result.action === 'event_deleted') results.declined++;
        else results.noChange++;

      } catch (error) {
        console.error(`[ProcessCalendar] Error processing schedule ${schedule.id}:`, error);
        results.errors++;
      }
    }

    console.log('[ProcessCalendar] Processing complete:', results);

    return res.status(200).json({
      success: true,
      systemEmail,
      ...results
    });

  } catch (error) {
    console.error('[ProcessCalendar] Fatal error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
