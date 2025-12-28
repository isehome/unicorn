/**
 * Cron Job: Process Calendar Responses
 *
 * Processes queued Graph webhook notifications to detect when
 * technicians and customers accept/decline calendar invites.
 *
 * Workflow:
 * 1. Fetch unprocessed notifications from graph_change_notifications
 * 2. For each notification, get the calendar event details from Graph
 * 3. Check attendee response statuses
 * 4. Update service_schedules based on responses:
 *    - Tech accepts: status → pending_customer, add customer to invite
 *    - Customer accepts: status → confirmed
 *    - Anyone declines: status → cancelled, ticket → unscheduled
 *
 * Schedule: Every 2-3 minutes
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
async function getEventDetails(token, userId, eventId) {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userId}/events/${eventId}?$select=id,subject,attendees,organizer`,
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
async function addCustomerToEvent(token, userId, eventId, customerEmail, customerName) {
  // First get current attendees
  const event = await getEventDetails(token, userId, eventId);
  if (!event) return null;

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
  if (newSubject.startsWith('[PENDING]')) {
    newSubject = newSubject.replace('[PENDING]', '[AWAITING CUSTOMER]');
  }

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userId}/events/${eventId}`,
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
async function finalizeEvent(token, userId, eventId) {
  const event = await getEventDetails(token, userId, eventId);
  if (!event) return null;

  // Remove status prefix from subject
  let newSubject = event.subject
    .replace('[PENDING]', '')
    .replace('[AWAITING CUSTOMER]', '')
    .replace('[TENTATIVE]', '')
    .trim();

  // Ensure it starts with "Service:"
  if (!newSubject.startsWith('Service:')) {
    newSubject = `Service: ${newSubject}`;
  }

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userId}/events/${eventId}`,
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

// Delete a calendar event
async function deleteEvent(token, userId, eventId) {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userId}/events/${eventId}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );

  // 204 is success, 404 means already deleted
  return response.ok || response.status === 404;
}

// Process a single notification
async function processNotification(token, notification, schedule, ticket) {
  const { resource_id: eventId, change_type: changeType } = notification;

  console.log(`[ProcessCalendar] Processing notification for event ${eventId}, type: ${changeType}`);

  // If event was deleted, handle accordingly
  if (changeType === 'deleted') {
    console.log(`[ProcessCalendar] Event ${eventId} was deleted externally`);
    return {
      action: 'cancelled',
      reason: 'Event deleted externally'
    };
  }

  // Get the subscription to find the user ID
  const { data: subscription } = await supabase
    .from('graph_subscriptions')
    .select('user_id')
    .eq('subscription_id', notification.subscription_id)
    .single();

  if (!subscription) {
    return { action: 'skipped', reason: 'Subscription not found' };
  }

  // Get event details including attendee responses
  const event = await getEventDetails(token, subscription.user_id, eventId);

  if (!event) {
    return { action: 'skipped', reason: 'Event not found' };
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

  console.log(`[ProcessCalendar] Responses - Tech: ${techResponse}, Customer: ${customerResponse}`);

  // Determine action based on current status and responses
  const currentStatus = schedule.schedule_status;
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
  // Then check for acceptances
  else if (currentStatus === 'pending_tech' && techResponse === 'accepted') {
    action = 'tech_accepted';
    newStatus = 'pending_customer';
  } else if (currentStatus === 'pending_customer' && customerResponse === 'accepted') {
    action = 'customer_accepted';
    newStatus = 'confirmed';
  }

  return {
    action,
    newStatus,
    techResponse,
    customerResponse,
    eventId,
    userId: subscription.user_id
  };
}

// Apply the result of processing
async function applyResult(token, result, schedule, ticket) {
  const { action, newStatus, eventId, userId } = result;

  if (action === 'no_change') {
    return { applied: false };
  }

  const updates = {
    schedule_status: newStatus,
    tech_calendar_response: result.techResponse,
    customer_calendar_response: result.customerResponse
  };

  // Handle specific actions
  if (action === 'tech_accepted') {
    updates.technician_accepted_at = new Date().toISOString();

    // Add customer to the calendar invite
    if (ticket.customer_email) {
      try {
        await addCustomerToEvent(
          token,
          userId,
          eventId,
          ticket.customer_email,
          ticket.customer_name
        );
        console.log(`[ProcessCalendar] Added customer ${ticket.customer_email} to event`);
      } catch (err) {
        console.error(`[ProcessCalendar] Failed to add customer:`, err);
      }
    }
  } else if (action === 'customer_accepted') {
    updates.customer_accepted_at = new Date().toISOString();

    // Finalize the event (remove PENDING/TENTATIVE from subject)
    try {
      await finalizeEvent(token, userId, eventId);
      console.log(`[ProcessCalendar] Finalized event ${eventId}`);
    } catch (err) {
      console.error(`[ProcessCalendar] Failed to finalize event:`, err);
    }
  } else if (action === 'tech_declined' || action === 'customer_declined') {
    // Delete the calendar event
    try {
      await deleteEvent(token, userId, eventId);
      console.log(`[ProcessCalendar] Deleted event ${eventId}`);
    } catch (err) {
      console.error(`[ProcessCalendar] Failed to delete event:`, err);
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

  console.log(`[ProcessCalendar] Updated schedule ${schedule.id}: ${action}`);
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

  console.log('[ProcessCalendar] Starting calendar response processing');

  try {
    const token = await getAppToken();

    // Get unprocessed notifications with schedule and ticket details
    const { data: notifications, error: fetchError } = await supabase
      .from('graph_change_notifications')
      .select(`
        *,
        service_schedules!schedule_id (
          id,
          schedule_status,
          calendar_event_id,
          technician_id,
          technician_email,
          ticket_id
        )
      `)
      .is('processed_at', null)
      .order('created_at', { ascending: true })
      .limit(50);

    if (fetchError) {
      throw fetchError;
    }

    console.log(`[ProcessCalendar] Found ${notifications?.length || 0} unprocessed notifications`);

    const results = {
      processed: 0,
      techAccepted: 0,
      customerAccepted: 0,
      declined: 0,
      skipped: 0,
      errors: 0
    };

    for (const notification of notifications || []) {
      try {
        // Find the schedule by calendar_event_id if not joined
        let schedule = notification.service_schedules;

        if (!schedule && notification.resource_id) {
          const { data: foundSchedule } = await supabase
            .from('service_schedules')
            .select('*')
            .eq('calendar_event_id', notification.resource_id)
            .single();
          schedule = foundSchedule;
        }

        if (!schedule) {
          console.log(`[ProcessCalendar] No schedule found for event ${notification.resource_id}`);
          await supabase
            .from('graph_change_notifications')
            .update({
              processed_at: new Date().toISOString(),
              processed_result: 'skipped',
              error_message: 'No matching schedule found'
            })
            .eq('id', notification.id);
          results.skipped++;
          continue;
        }

        // Get ticket details
        const { data: ticket } = await supabase
          .from('service_tickets')
          .select('*')
          .eq('id', schedule.ticket_id)
          .single();

        if (!ticket) {
          console.log(`[ProcessCalendar] No ticket found for schedule ${schedule.id}`);
          results.skipped++;
          continue;
        }

        // Process the notification
        const result = await processNotification(token, notification, schedule, ticket);

        // Apply the result
        const applied = await applyResult(token, result, schedule, ticket);

        // Mark notification as processed
        await supabase
          .from('graph_change_notifications')
          .update({
            processed_at: new Date().toISOString(),
            processed_result: applied.applied ? 'success' : 'skipped',
            schedule_id: schedule.id
          })
          .eq('id', notification.id);

        // Update counters
        results.processed++;
        if (result.action === 'tech_accepted') results.techAccepted++;
        else if (result.action === 'customer_accepted') results.customerAccepted++;
        else if (result.action.includes('declined')) results.declined++;
        else results.skipped++;

      } catch (error) {
        console.error(`[ProcessCalendar] Error processing notification ${notification.id}:`, error);

        await supabase
          .from('graph_change_notifications')
          .update({
            processed_at: new Date().toISOString(),
            processed_result: 'error',
            error_message: error.message
          })
          .eq('id', notification.id);

        results.errors++;
      }
    }

    console.log('[ProcessCalendar] Processing complete:', results);

    return res.status(200).json({
      success: true,
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
