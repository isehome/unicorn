/**
 * API Endpoint: Send Meeting Invite from System Account
 *
 * POST /api/system-account/send-meeting-invite
 *
 * Creates a calendar event on the system account's calendar with the technician
 * as an attendee. This sends a native Outlook meeting invite they can accept/decline.
 */

const { getAppToken, getSystemAccountEmail } = require('../_systemGraph');

module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      technicianEmail,
      technicianName,
      customerName,
      customerPhone,
      customerEmail,
      serviceAddress,
      scheduledDate,
      startTime,
      endTime,
      category,
      description,
      ticketNumber,
      scheduleId
    } = req.body;

    if (!technicianEmail) {
      return res.status(400).json({ error: 'technicianEmail is required' });
    }

    if (!scheduledDate || !startTime || !endTime) {
      return res.status(400).json({ error: 'scheduledDate, startTime, and endTime are required' });
    }

    // Get system account email for organizer
    const organizerEmail = await getSystemAccountEmail();
    const token = await getAppToken();

    // Build subject line
    const subject = `[Service] ${customerName || 'Customer'} - ${category || 'Service'}`;

    // Build description/body for the event
    const bodyLines = [
      `<b>Service Appointment</b><br><br>`,
      `<b>Customer:</b> ${customerName || 'N/A'}<br>`,
      customerPhone ? `<b>Phone:</b> ${customerPhone}<br>` : '',
      customerEmail ? `<b>Email:</b> ${customerEmail}<br>` : '',
      serviceAddress ? `<b>Address:</b> ${serviceAddress}<br>` : '',
      `<br>`,
      `<b>Category:</b> ${category || 'General Service'}<br>`,
      description ? `<b>Notes:</b> ${description}<br>` : '',
      ticketNumber ? `<b>Ticket #:</b> ${ticketNumber}<br>` : '',
    ].filter(Boolean).join('');

    // Build the datetime strings (ISO format)
    // scheduledDate is "YYYY-MM-DD", startTime/endTime could be "HH:MM" or "HH:MM:SS"
    // Normalize to HH:MM:SS format
    const normalizeTime = (time) => {
      if (!time) return '00:00:00';
      const parts = time.split(':');
      if (parts.length === 2) return `${time}:00`; // Add seconds if missing
      return time; // Already has seconds
    };

    const startDateTime = `${scheduledDate}T${normalizeTime(startTime)}`;
    const endDateTime = `${scheduledDate}T${normalizeTime(endTime)}`;

    // Create the calendar event with the technician as an attendee
    const eventPayload = {
      subject: subject,
      body: {
        contentType: 'HTML',
        content: bodyLines
      },
      start: {
        dateTime: startDateTime,
        timeZone: 'America/Indiana/Indianapolis'
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'America/Indiana/Indianapolis'
      },
      location: {
        displayName: serviceAddress || ''
      },
      attendees: [
        {
          emailAddress: {
            address: technicianEmail,
            name: technicianName || technicianEmail
          },
          type: 'required'
        }
      ],
      // This ensures meeting invites are sent to attendees
      responseRequested: true,
      allowNewTimeProposals: false
    };

    // Create event on organizer's calendar - Graph API automatically sends invites to attendees
    const graphResp = await fetch(
      `https://graph.microsoft.com/v1.0/users/${organizerEmail}/events`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventPayload),
      }
    );

    if (!graphResp.ok) {
      const errorText = await graphResp.text();
      console.error('[send-meeting-invite] Failed to create event:', graphResp.status, errorText);
      return res.status(500).json({
        error: 'Failed to create meeting invite',
        details: errorText
      });
    }

    const event = await graphResp.json();

    console.log(`[send-meeting-invite] Calendar event created: ${event.id}, invite sent to ${technicianEmail}`);

    return res.status(200).json({
      success: true,
      eventId: event.id,
      webLink: event.webLink,
      organizer: organizerEmail,
      sentTo: technicianEmail
    });

  } catch (error) {
    console.error('[send-meeting-invite] Error:', error);
    return res.status(500).json({
      error: 'Failed to send meeting invite',
      message: error.message
    });
  }
};
