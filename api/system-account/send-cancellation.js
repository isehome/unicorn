/**
 * API Endpoint: Send Meeting Cancellation from System Account
 *
 * POST /api/system-account/send-cancellation
 *
 * Sends a cancellation email to a technician from the system account
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
      scheduledDate,
      startTime,
      scheduleId
    } = req.body;

    if (!technicianEmail) {
      return res.status(400).json({ error: 'technicianEmail is required' });
    }

    // Get system account email for sender
    const senderEmail = await getSystemAccountEmail();
    const token = await getAppToken();

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

        <p>Please remove this appointment from your calendar if you have already accepted it.</p>

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

    const graphResp = await fetch(`https://graph.microsoft.com/v1.0/users/${senderEmail}/sendMail`, {
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

    console.log(`[send-cancellation] Cancellation sent from ${senderEmail} to ${technicianEmail}`);

    return res.status(200).json({
      success: true,
      sentFrom: senderEmail,
      sentTo: technicianEmail
    });

  } catch (error) {
    console.error('[send-cancellation] Error:', error);
    return res.status(500).json({
      error: 'Failed to send cancellation email',
      message: error.message
    });
  }
};
