/**
 * Debug endpoint for calendar response processing
 * GET /api/debug-calendar-response?scheduleId=xxx
 */

const { createClient } = require('@supabase/supabase-js');
const { getAppToken, getSystemAccountEmail } = require('./_systemGraph');
const { requireAuth } = require('./_authMiddleware');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

module.exports = async (req, res) => {
  // Auth required
  const user = await requireAuth(req, res);
  if (!user) return;

  const { scheduleId } = req.query;

  if (!scheduleId) {
    return res.status(400).json({ error: 'scheduleId query param required' });
  }

  try {
    const token = await getAppToken();
    const systemEmail = await getSystemAccountEmail();
    const supabase = getSupabase();

    // Get the schedule
    const { data: schedule, error: scheduleError } = await supabase
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
      .eq('id', scheduleId)
      .single();

    if (scheduleError || !schedule) {
      return res.status(404).json({ error: 'Schedule not found', details: scheduleError });
    }

    // Get technician email from contacts
    let technicianEmail = null;
    if (schedule.technician_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id, email, full_name')
        .eq('id', schedule.technician_id)
        .single();

      technicianEmail = contact?.email;
    }

    // Get ticket for customer email
    const { data: ticket } = await supabase
      .from('service_tickets')
      .select('id, customer_email, customer_name')
      .eq('id', schedule.ticket_id)
      .single();

    // Get calendar event details
    let eventDetails = null;
    let graphError = null;

    if (schedule.calendar_event_id) {
      try {
        const response = await fetch(
          `${GRAPH_BASE}/users/${systemEmail}/events/${schedule.calendar_event_id}?$select=id,subject,attendees,organizer`,
          {
            headers: { 'Authorization': `Bearer ${token}` }
          }
        );

        if (response.ok) {
          eventDetails = await response.json();
        } else {
          graphError = {
            status: response.status,
            statusText: response.statusText,
            body: await response.text()
          };
        }
      } catch (err) {
        graphError = { message: err.message };
      }
    }

    // Analyze attendees
    let attendeeAnalysis = [];
    if (eventDetails?.attendees) {
      for (const attendee of eventDetails.attendees) {
        const email = attendee.emailAddress?.address?.toLowerCase();
        const status = attendee.status?.response;

        attendeeAnalysis.push({
          email,
          name: attendee.emailAddress?.name,
          status,
          type: attendee.type,
          isTechnician: email === technicianEmail?.toLowerCase(),
          isCustomer: email === ticket?.customer_email?.toLowerCase()
        });
      }
    }

    // Check what action would be taken
    const techResponse = attendeeAnalysis.find(a => a.isTechnician)?.status?.toLowerCase() || 'none';
    const customerResponse = attendeeAnalysis.find(a => a.isCustomer)?.status?.toLowerCase() || 'none';

    let expectedAction = 'no_change';
    let expectedNewStatus = schedule.schedule_status;

    if (techResponse === 'declined') {
      expectedAction = 'tech_declined';
      expectedNewStatus = 'cancelled';
    } else if (customerResponse === 'declined') {
      expectedAction = 'customer_declined';
      expectedNewStatus = 'cancelled';
    } else if (schedule.schedule_status === 'pending_tech' && (techResponse === 'accepted' || techResponse === 'tentativelyaccepted')) {
      expectedAction = 'tech_accepted';
      expectedNewStatus = 'tech_accepted';
    } else if (schedule.schedule_status === 'pending_customer' && (customerResponse === 'accepted' || customerResponse === 'tentativelyaccepted')) {
      expectedAction = 'customer_accepted';
      expectedNewStatus = 'confirmed';
    }

    return res.status(200).json({
      schedule: {
        id: schedule.id,
        schedule_status: schedule.schedule_status,
        calendar_event_id: schedule.calendar_event_id,
        technician_id: schedule.technician_id,
        technician_name: schedule.technician_name,
        tech_calendar_response: schedule.tech_calendar_response,
        customer_calendar_response: schedule.customer_calendar_response
      },
      technician: {
        id: schedule.technician_id,
        email: technicianEmail,
        emailLowercase: technicianEmail?.toLowerCase()
      },
      ticket: {
        id: ticket?.id,
        customer_email: ticket?.customer_email,
        customer_name: ticket?.customer_name
      },
      systemAccount: systemEmail,
      calendarEvent: eventDetails ? {
        id: eventDetails.id,
        subject: eventDetails.subject,
        organizer: eventDetails.organizer?.emailAddress?.address,
        attendeeCount: eventDetails.attendees?.length || 0
      } : null,
      graphError,
      attendees: attendeeAnalysis,
      analysis: {
        technicianEmailMatch: technicianEmail?.toLowerCase(),
        customerEmailMatch: ticket?.customer_email?.toLowerCase(),
        techResponse,
        customerResponse,
        currentStatus: schedule.schedule_status,
        expectedAction,
        expectedNewStatus,
        wouldTransition: expectedAction !== 'no_change'
      }
    });

  } catch (error) {
    console.error('[DebugCalendarResponse] Error:', error);
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
};
