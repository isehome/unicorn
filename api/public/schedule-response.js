/**
 * API Endpoint: Public Schedule Response
 *
 * GET /api/public/schedule-response?action=accept&scheduleId=xxx&token=xxx
 * GET /api/public/schedule-response?action=decline&scheduleId=xxx&token=xxx
 *
 * Allows customers to accept or decline service appointments via email links.
 * This works around the Apple Calendar / iCloud interoperability issue where
 * iOS doesn't show Accept/Decline buttons for Outlook meeting invites.
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Secret for generating/validating tokens
const RESPONSE_SECRET = process.env.SCHEDULE_RESPONSE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Generate a secure token for a schedule response link
 */
function generateResponseToken(scheduleId, action) {
  const data = `${scheduleId}:${action}`;
  return crypto.createHmac('sha256', RESPONSE_SECRET)
    .update(data)
    .digest('hex')
    .substring(0, 32);
}

/**
 * Validate a response token
 */
function validateResponseToken(scheduleId, action, token) {
  const expectedToken = generateResponseToken(scheduleId, action);
  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(expectedToken)
  );
}

module.exports = async (req, res) => {
  // Allow GET for email link clicks
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, scheduleId, token } = req.query;

  // Validate parameters
  if (!action || !scheduleId || !token) {
    return res.status(400).send(renderPage('Missing Parameters', 'The link appears to be invalid. Please contact your service provider.', 'error'));
  }

  if (!['accept', 'decline'].includes(action)) {
    return res.status(400).send(renderPage('Invalid Action', 'The link appears to be invalid.', 'error'));
  }

  // Validate token
  try {
    if (!validateResponseToken(scheduleId, action, token)) {
      return res.status(403).send(renderPage('Invalid Link', 'This link has expired or is invalid. Please contact your service provider.', 'error'));
    }
  } catch (e) {
    return res.status(403).send(renderPage('Invalid Link', 'This link is invalid.', 'error'));
  }

  try {
    // Get the schedule
    const { data: schedule, error: fetchError } = await supabase
      .from('service_schedules')
      .select(`
        id,
        ticket_id,
        schedule_status,
        scheduled_date,
        scheduled_time_start,
        scheduled_time_end,
        technician_name,
        customer_calendar_response
      `)
      .eq('id', scheduleId)
      .single();

    if (fetchError || !schedule) {
      return res.status(404).send(renderPage('Appointment Not Found', 'This appointment could not be found. It may have been cancelled or rescheduled.', 'error'));
    }

    // Check if already responded
    if (schedule.customer_calendar_response && schedule.customer_calendar_response !== 'none') {
      const prevResponse = schedule.customer_calendar_response === 'accepted' ? 'accepted' : 'declined';
      return res.send(renderPage(
        'Already Responded',
        `You have already ${prevResponse} this appointment. If you need to change your response, please contact your service provider.`,
        'info'
      ));
    }

    // Check schedule status
    if (schedule.schedule_status !== 'pending_customer') {
      if (schedule.schedule_status === 'confirmed') {
        return res.send(renderPage('Appointment Confirmed', 'This appointment is already confirmed.', 'success'));
      }
      if (schedule.schedule_status === 'cancelled') {
        return res.send(renderPage('Appointment Cancelled', 'This appointment has been cancelled.', 'info'));
      }
      return res.send(renderPage('Cannot Respond', 'This appointment is not currently awaiting your response.', 'info'));
    }

    // Get ticket details for the confirmation page
    const { data: ticket } = await supabase
      .from('service_tickets')
      .select('customer_name, customer_email, title, service_address')
      .eq('id', schedule.ticket_id)
      .single();

    // Update the schedule based on action
    const updates = {
      customer_calendar_response: action === 'accept' ? 'accepted' : 'declined'
    };

    if (action === 'accept') {
      updates.schedule_status = 'confirmed';
      updates.customer_accepted_at = new Date().toISOString();
    } else {
      updates.schedule_status = 'cancelled';
    }

    const { error: updateError } = await supabase
      .from('service_schedules')
      .update(updates)
      .eq('id', scheduleId);

    if (updateError) {
      console.error('[schedule-response] Update error:', updateError);
      return res.status(500).send(renderPage('Error', 'Failed to record your response. Please try again or contact your service provider.', 'error'));
    }

    // If declined, update ticket status back to triaged
    if (action === 'decline' && schedule.ticket_id) {
      await supabase
        .from('service_tickets')
        .update({ status: 'triaged' })
        .eq('id', schedule.ticket_id);
    }

    // Format date/time for display
    const dateStr = new Date(schedule.scheduled_date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const timeStr = `${schedule.scheduled_time_start?.slice(0, 5)} - ${schedule.scheduled_time_end?.slice(0, 5)}`;

    if (action === 'accept') {
      return res.send(renderPage(
        'Appointment Confirmed! ✓',
        `
          <p>Thank you for confirming your service appointment.</p>
          <div style="background: #f0fdf4; border: 1px solid #22c55e; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Date:</strong> ${dateStr}</p>
            <p style="margin: 4px 0;"><strong>Time:</strong> ${timeStr}</p>
            ${schedule.technician_name ? `<p style="margin: 4px 0;"><strong>Technician:</strong> ${schedule.technician_name}</p>` : ''}
            ${ticket?.service_address ? `<p style="margin: 4px 0;"><strong>Location:</strong> ${ticket.service_address}</p>` : ''}
          </div>
          <p>A technician will arrive during the scheduled time window. If you need to reschedule, please contact us.</p>
        `,
        'success'
      ));
    } else {
      return res.send(renderPage(
        'Appointment Declined',
        `
          <p>You have declined this service appointment.</p>
          <div style="background: #fef2f2; border: 1px solid #ef4444; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Date:</strong> ${dateStr}</p>
            <p style="margin: 4px 0;"><strong>Time:</strong> ${timeStr}</p>
          </div>
          <p>Our team will contact you to reschedule at a more convenient time.</p>
        `,
        'warning'
      ));
    }

  } catch (error) {
    console.error('[schedule-response] Error:', error);
    return res.status(500).send(renderPage('Error', 'An unexpected error occurred. Please try again later.', 'error'));
  }
};

/**
 * Render a simple HTML response page
 */
function renderPage(title, message, type = 'info') {
  const colors = {
    success: { bg: '#f0fdf4', border: '#22c55e', icon: '✓' },
    error: { bg: '#fef2f2', border: '#ef4444', icon: '✗' },
    warning: { bg: '#fffbeb', border: '#f59e0b', icon: '!' },
    info: { bg: '#eff6ff', border: '#3b82f6', icon: 'ℹ' }
  };
  const color = colors[type] || colors.info;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - ISE Home Service</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .card {
          background: white;
          border-radius: 16px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          max-width: 500px;
          width: 100%;
          overflow: hidden;
        }
        .header {
          background: ${color.bg};
          border-bottom: 2px solid ${color.border};
          padding: 24px;
          text-align: center;
        }
        .icon {
          width: 48px;
          height: 48px;
          background: ${color.border};
          color: white;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          font-weight: bold;
          margin-bottom: 12px;
        }
        .header h1 {
          font-size: 1.5rem;
          color: #1f2937;
        }
        .content {
          padding: 24px;
          color: #4b5563;
          line-height: 1.6;
        }
        .content p { margin-bottom: 12px; }
        .footer {
          background: #f9fafb;
          padding: 16px 24px;
          text-align: center;
          font-size: 0.875rem;
          color: #6b7280;
          border-top: 1px solid #e5e7eb;
        }
        .logo { font-weight: bold; color: #4f46e5; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <div class="icon">${color.icon}</div>
          <h1>${title}</h1>
        </div>
        <div class="content">
          ${message}
        </div>
        <div class="footer">
          <span class="logo">INTELLIGENT SYSTEMS</span> | Field Operations
        </div>
      </div>
    </body>
    </html>
  `;
}

// Export token generator for use in other modules
module.exports.generateResponseToken = generateResponseToken;
