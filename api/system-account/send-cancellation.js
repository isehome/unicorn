/**
 * API Endpoint: Cancel Meeting from System Account
 *
 * POST /api/system-account/send-cancellation
 *
 * Cancels a calendar event, which automatically sends cancellation notices to attendees.
 * If no eventId is provided, sends a cancellation email instead.
 */

const { requireAuth } = require('../_authMiddleware');
const { getAppToken, getSystemAccountEmail } = require('../_systemGraph');

module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth required for internal system-account endpoints
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const {
      eventId,
      technicianEmail,
      technicianName,
      customerName,
      scheduledDate,
      startTime,
      scheduleId
    } = req.body;

    const organizerEmail = await getSystemAccountEmail();
    const token = await getAppToken();

    // If we have an eventId, cancel the calendar event (this sends cancellation to attendees)
    if (eventId) {
      // Cancel the event - this sends cancellation notices to all attendees
      const cancelResp = await fetch(
        `https://graph.microsoft.com/v1.0/users/${organizerEmail}/events/${eventId}/cancel`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            comment: 'This service appointment has been cancelled.'
          }),
        }
      );

      // 404 is OK - event might already be deleted
      if (!cancelResp.ok && cancelResp.status !== 404) {
        const errorText = await cancelResp.text();
        console.error('[send-cancellation] Failed to cancel event:', cancelResp.status, errorText);
        return res.status(500).json({
          error: 'Failed to cancel meeting',
          details: errorText
        });
      }

      console.log(`[send-cancellation] Event ${eventId} cancelled, notification sent to attendees`);

      return res.status(200).json({
        success: true,
        eventId,
        cancelled: true
      });
    }

    // Fallback: If no eventId, send a cancellation email
    if (!technicianEmail) {
      return res.status(400).json({ error: 'Either eventId or technicianEmail is required' });
    }

    const subject = `[CANCELLED] Service Appointment - ${customerName || 'Customer'} on ${scheduledDate}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2 style="color: #c53030;">Service Appointment Cancelled</h2>
        <p>The following service appointment has been <strong>cancelled</strong>:</p>

        <div style="background: #fff5f5; border-left: 4px solid #c53030; padding: 16px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Customer:</strong> ${customerName || 'N/A'}</p>
          <p style="margin: 4px 0;"><strong>Date:</strong> ${scheduledDate}</p>
          <p style="margin: 4px 0;"><strong>Time:</strong> ${startTime}</p>
        </div>

        <p>Please remove this appointment from your calendar.</p>

        <p style="color: #718096; font-size: 14px; margin-top: 24px;">
          This is an automated message from Unicorn CRM.
        </p>
      </div>
    `;

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
      console.error('[send-cancellation] Failed to send email:', graphResp.status, errorText);
      return res.status(500).json({
        error: 'Failed to send cancellation email',
        details: errorText
      });
    }

    console.log(`[send-cancellation] Cancellation email sent from ${organizerEmail} to ${technicianEmail}`);

    return res.status(200).json({
      success: true,
      sentFrom: organizerEmail,
      sentTo: technicianEmail
    });

  } catch (error) {
    console.error('[send-cancellation] Error:', error);
    return res.status(500).json({
      error: 'Failed to send cancellation',
      message: error.message
    });
  }
};
