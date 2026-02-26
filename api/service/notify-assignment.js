/**
 * POST /api/service/notify-assignment
 * Send email notification when a technician is assigned to a service ticket.
 *
 * Body: { ticketId, technicianEmail, technicianName, ticketNumber, customerName, assignedByName }
 */

import { requireAuth } from '../_authMiddleware.js';
import { sendGraphEmail, isGraphConfigured } from '../_graphMail.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  if (!isGraphConfigured()) {
    return res.status(200).json({ sent: false, reason: 'Email not configured' });
  }

  const { ticketId, technicianEmail, technicianName, ticketNumber, customerName, serviceAddress, assignedByName } = req.body;

  if (!technicianEmail || !ticketId) {
    return res.status(400).json({ error: 'Missing technicianEmail or ticketId' });
  }

  const ticketUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://unicorn-one.vercel.app'}/service/tickets/${ticketId}`;

  const subject = `Service Ticket Assigned: ${ticketNumber || 'New Ticket'}${customerName ? ` - ${customerName}` : ''}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #7c3aed; padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="color: white; margin: 0; font-size: 18px;">Service Ticket Assignment</h2>
      </div>
      <div style="background: #27272a; padding: 24px; color: #e4e4e7; border-radius: 0 0 8px 8px;">
        <p style="margin: 0 0 16px;">Hi ${technicianName || 'Technician'},</p>
        <p style="margin: 0 0 16px;">You've been assigned to a service ticket${assignedByName ? ` by <strong>${assignedByName}</strong>` : ''}.</p>

        <div style="background: #3f3f46; padding: 16px; border-radius: 8px; margin: 0 0 20px;">
          ${ticketNumber ? `<p style="margin: 0 0 8px;"><strong style="color: #a78bfa;">Ticket:</strong> ${ticketNumber}</p>` : ''}
          ${customerName ? `<p style="margin: 0 0 8px;"><strong style="color: #a78bfa;">Customer:</strong> ${customerName}</p>` : ''}
          ${serviceAddress ? `<p style="margin: 0 0 8px;"><strong style="color: #a78bfa;">Address:</strong> ${serviceAddress}</p>` : ''}
        </div>

        <a href="${ticketUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
          View Ticket
        </a>

        <p style="margin: 20px 0 0; font-size: 13px; color: #71717a;">
          This is an automated notification from Unicorn.
        </p>
      </div>
    </div>
  `;

  try {
    await sendGraphEmail({
      to: [technicianEmail],
      subject,
      html
    });

    console.log(`[notify-assignment] Sent assignment email to ${technicianEmail} for ticket ${ticketId}`);
    return res.status(200).json({ sent: true });
  } catch (error) {
    console.error('[notify-assignment] Failed to send email:', error.message);
    // Don't fail the assignment — email is best-effort
    return res.status(200).json({ sent: false, reason: error.message });
  }
}
