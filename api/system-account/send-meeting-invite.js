/**
 * API Endpoint: Send Meeting Invite from System Account
 *
 * POST /api/system-account/send-meeting-invite
 *
 * Sends a meeting invite email with ICS attachment to a technician
 * from the system account (unicorn@isehome.com)
 */

const { systemSendMail, getSystemAccountEmail } = require('../_systemGraph');

/**
 * Generate ICS calendar file content
 */
function generateICSContent(eventDetails) {
  const {
    uid,
    subject,
    description,
    location,
    scheduledDate,
    startTime,
    endTime,
    organizerEmail,
    organizerName,
    attendeeEmail,
    attendeeName,
    timezone = 'America/Indianapolis'
  } = eventDetails;

  // Format date for ICS (YYYYMMDDTHHMMSS)
  const formatICSDate = (dateStr, timeStr) => {
    const [year, month, day] = dateStr.split('-');
    const [hour, minute] = timeStr.split(':');
    return `${year}${month}${day}T${hour}${minute}00`;
  };

  const dtStart = formatICSDate(scheduledDate, startTime);
  const dtEnd = formatICSDate(scheduledDate, endTime);
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  // Escape special characters in text
  const escapeICS = (text) => {
    if (!text) return '';
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');
  };

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Unicorn CRM//Service Scheduling//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VTIMEZONE',
    `TZID:${timezone}`,
    'BEGIN:STANDARD',
    'DTSTART:19701101T020000',
    'RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11',
    'TZOFFSETFROM:-0400',
    'TZOFFSETTO:-0500',
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    'DTSTART:19700308T020000',
    'RRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3',
    'TZOFFSETFROM:-0500',
    'TZOFFSETTO:-0400',
    'END:DAYLIGHT',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=${timezone}:${dtStart}`,
    `DTEND;TZID=${timezone}:${dtEnd}`,
    `SUMMARY:${escapeICS(subject)}`,
    `DESCRIPTION:${escapeICS(description)}`,
    location ? `LOCATION:${escapeICS(location)}` : '',
    `ORGANIZER;CN=${escapeICS(organizerName)}:mailto:${organizerEmail}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${escapeICS(attendeeName)}:mailto:${attendeeEmail}`,
    'STATUS:TENTATIVE',
    'TRANSP:OPAQUE',
    'SEQUENCE:0',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');

  return icsContent;
}

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
    const organizerName = 'ISE Service Scheduling';

    // Generate unique ID for the calendar event
    const uid = `unicorn-schedule-${scheduleId || Date.now()}@isehome.com`;

    // Build subject line
    const subject = `[Service Request] ${customerName || 'Customer'} - ${category || 'Service'}`;

    // Build description for ICS
    const descriptionLines = [
      `Service Appointment Request`,
      ``,
      `Customer: ${customerName || 'N/A'}`,
      customerPhone ? `Phone: ${customerPhone}` : '',
      customerEmail ? `Email: ${customerEmail}` : '',
      serviceAddress ? `Address: ${serviceAddress}` : '',
      ``,
      `Category: ${category || 'General Service'}`,
      description ? `Notes: ${description}` : '',
      ticketNumber ? `Ticket #: ${ticketNumber}` : '',
      ``,
      `Please accept or decline this meeting request to confirm your availability.`
    ].filter(Boolean).join('\n');

    // Generate ICS content
    const icsContent = generateICSContent({
      uid,
      subject,
      description: descriptionLines,
      location: serviceAddress,
      scheduledDate,
      startTime,
      endTime,
      organizerEmail,
      organizerName,
      attendeeEmail: technicianEmail,
      attendeeName: technicianName || technicianEmail
    });

    // Convert ICS to base64
    const icsBase64 = Buffer.from(icsContent, 'utf-8').toString('base64');

    // Build HTML email body
    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #1a365d;">Service Appointment Request</h2>
        <p>You have been assigned a service appointment. Please review the details and <strong>accept or decline</strong> this meeting request.</p>

        <div style="background: #f7fafc; border-left: 4px solid #4299e1; padding: 16px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Customer:</strong> ${customerName || 'N/A'}</p>
          ${customerPhone ? `<p style="margin: 4px 0;"><strong>Phone:</strong> ${customerPhone}</p>` : ''}
          ${serviceAddress ? `<p style="margin: 4px 0;"><strong>Address:</strong> ${serviceAddress}</p>` : ''}
          <p style="margin: 4px 0;"><strong>Date:</strong> ${scheduledDate}</p>
          <p style="margin: 4px 0;"><strong>Time:</strong> ${startTime} - ${endTime}</p>
          ${category ? `<p style="margin: 4px 0;"><strong>Category:</strong> ${category}</p>` : ''}
        </div>

        ${description ? `<p><strong>Notes:</strong> ${description}</p>` : ''}

        <p style="color: #718096; font-size: 14px; margin-top: 24px;">
          This is an automated message from Unicorn CRM.<br>
          Please respond to this calendar invite to confirm your availability.
        </p>
      </div>
    `;

    // Send email with ICS attachment using system account
    // Note: Microsoft Graph sendMail with attachments requires the message to be constructed differently
    const { getAppToken } = require('../_systemGraph');
    const token = await getAppToken();

    const emailPayload = {
      message: {
        subject: subject,
        body: {
          contentType: 'HTML',
          content: htmlBody
        },
        toRecipients: [
          {
            emailAddress: {
              address: technicianEmail,
              name: technicianName || technicianEmail
            }
          }
        ],
        attachments: [
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: 'invite.ics',
            contentType: 'text/calendar; method=REQUEST',
            contentBytes: icsBase64
          }
        ]
      },
      saveToSentItems: true
    };

    const graphResp = await fetch(`https://graph.microsoft.com/v1.0/users/${organizerEmail}/sendMail`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    if (!graphResp.ok) {
      const errorText = await graphResp.text();
      console.error('[send-meeting-invite] Failed to send email:', graphResp.status, errorText);
      return res.status(500).json({
        error: 'Failed to send meeting invite',
        details: errorText
      });
    }

    console.log(`[send-meeting-invite] Meeting invite sent from ${organizerEmail} to ${technicianEmail}`);

    return res.status(200).json({
      success: true,
      uid,
      sentFrom: organizerEmail,
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
