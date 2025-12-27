const { sendGraphEmail } = require('./_graphMail');

const PARTS_REQUEST_EMAIL = process.env.PARTS_REQUEST_EMAIL || 'stephe@isehome.com';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      ticketNumber,
      ticketTitle,
      customerName,
      customerAddress,
      parts,
      notes,
      requestedBy,
      requestedByEmail,
      urgency
    } = req.body;

    if (!parts || parts.length === 0) {
      return res.status(400).json({ error: 'At least one part is required' });
    }

    // Build parts table rows
    const partsRows = parts.map((part, index) => `
      <tr style="border-bottom: 1px solid #e4e4e7;">
        <td style="padding: 12px 8px; text-align: center;">${index + 1}</td>
        <td style="padding: 12px 8px;">${escapeHtml(part.name)}</td>
        <td style="padding: 12px 8px;">${escapeHtml(part.part_number || '-')}</td>
        <td style="padding: 12px 8px;">${escapeHtml(part.manufacturer || '-')}</td>
        <td style="padding: 12px 8px; text-align: center;">${part.quantity_needed || 1}</td>
        <td style="padding: 12px 8px;">${escapeHtml(part.notes || '-')}</td>
      </tr>
    `).join('');

    // Urgency indicator
    const urgencyColor = urgency === 'urgent' ? '#dc2626' : urgency === 'high' ? '#f59e0b' : '#3b82f6';
    const urgencyLabel = urgency === 'urgent' ? 'URGENT' : urgency === 'high' ? 'High Priority' : 'Normal';

    // Build HTML email content
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto;">
        <h2 style="color: #7c3aed; margin-bottom: 8px;">Parts Request - Service Ticket</h2>

        <div style="display: inline-block; padding: 4px 12px; border-radius: 20px; background-color: ${urgencyColor}15; color: ${urgencyColor}; font-weight: 600; font-size: 12px; margin-bottom: 24px;">
          ${urgencyLabel}
        </div>

        <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 8px 0; color: #18181b;">Ticket Information</h3>
          <p style="margin: 0; color: #52525b;">
            <strong>Ticket #:</strong> ${escapeHtml(ticketNumber || 'N/A')}<br/>
            <strong>Title:</strong> ${escapeHtml(ticketTitle || 'N/A')}<br/>
            <strong>Customer:</strong> ${escapeHtml(customerName || 'N/A')}<br/>
            <strong>Address:</strong> ${escapeHtml(customerAddress || 'N/A')}
          </p>
        </div>

        <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 8px 0; color: #18181b;">Requested By</h3>
          <p style="margin: 0; color: #52525b;">
            ${escapeHtml(requestedBy || 'Unknown')}
            ${requestedByEmail ? `(<a href="mailto:${escapeHtml(requestedByEmail)}">${escapeHtml(requestedByEmail)}</a>)` : ''}
          </p>
        </div>

        <h3 style="color: #18181b; margin: 24px 0 12px 0;">Parts Needed</h3>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #e4e4e7; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: #f4f4f5;">
              <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #18181b;">#</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #18181b;">Part Name</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #18181b;">Part Number</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #18181b;">Manufacturer</th>
              <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #18181b;">Qty</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #18181b;">Notes</th>
            </tr>
          </thead>
          <tbody>
            ${partsRows}
          </tbody>
        </table>

        ${notes ? `
        <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin-top: 16px; border: 1px solid #fcd34d;">
          <h3 style="margin: 0 0 8px 0; color: #92400e;">Additional Notes</h3>
          <p style="margin: 0; color: #78350f; white-space: pre-wrap;">${escapeHtml(notes)}</p>
        </div>
        ` : ''}

        <p style="margin-top: 24px; color: #71717a; font-size: 12px;">
          This is an automated parts request from the Unicorn Service CRM.
        </p>
      </div>
    `;

    // Send the email
    await sendGraphEmail({
      to: [PARTS_REQUEST_EMAIL],
      cc: requestedByEmail ? [requestedByEmail] : [],
      subject: `[Parts Request] ${ticketNumber || 'Service'} - ${customerName || 'Customer'} (${parts.length} item${parts.length > 1 ? 's' : ''})`,
      html
    });

    console.log('[ServicePartsRequest] Parts request sent successfully to', PARTS_REQUEST_EMAIL);

    return res.status(200).json({
      success: true,
      message: 'Parts request sent successfully',
      sentTo: PARTS_REQUEST_EMAIL
    });
  } catch (error) {
    console.error('[ServicePartsRequest] Failed to send parts request:', error);
    return res.status(500).json({ error: 'Failed to send parts request', details: error.message });
  }
};

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
