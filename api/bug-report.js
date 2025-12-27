const { sendGraphEmail } = require('./_graphMail');

const BUG_REPORT_EMAIL = process.env.BUG_REPORT_EMAIL || 'stephe@isehome.com';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      description,
      screenshot,
      url,
      userAgent,
      timestamp,
      userEmail,
      userName,
      errorInfo,
      consoleErrors
    } = req.body;

    if (!description || description.trim().length === 0) {
      return res.status(400).json({ error: 'Description is required' });
    }

    // Build HTML email content
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto;">
        <h2 style="color: #7c3aed; margin-bottom: 24px;">Bug Report from Unicorn App</h2>

        <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 8px 0; color: #18181b;">Reporter</h3>
          <p style="margin: 0; color: #52525b;">${userName || 'Unknown'} (${userEmail || 'No email'})</p>
        </div>

        <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 8px 0; color: #18181b;">Description</h3>
          <p style="margin: 0; color: #52525b; white-space: pre-wrap;">${escapeHtml(description)}</p>
        </div>

        <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 8px 0; color: #18181b;">Page URL</h3>
          <p style="margin: 0; color: #52525b;"><a href="${url}">${url}</a></p>
        </div>

        <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 8px 0; color: #18181b;">Timestamp</h3>
          <p style="margin: 0; color: #52525b;">${timestamp}</p>
        </div>

        <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 8px 0; color: #18181b;">Device / Browser</h3>
          <p style="margin: 0; color: #52525b; font-size: 12px;">${escapeHtml(userAgent || 'Unknown')}</p>
        </div>

        ${errorInfo ? `
        <div style="background: #fef2f2; padding: 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid #fecaca;">
          <h3 style="margin: 0 0 8px 0; color: #dc2626;">Error Info</h3>
          <pre style="margin: 0; color: #991b1b; font-size: 12px; overflow-x: auto; white-space: pre-wrap;">${escapeHtml(errorInfo)}</pre>
        </div>
        ` : ''}

        ${consoleErrors && consoleErrors.length > 0 ? `
        <div style="background: #fef2f2; padding: 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid #fecaca;">
          <h3 style="margin: 0 0 8px 0; color: #dc2626;">Recent Console Errors</h3>
          <pre style="margin: 0; color: #991b1b; font-size: 11px; overflow-x: auto; white-space: pre-wrap;">${escapeHtml(consoleErrors.join('\n\n'))}</pre>
        </div>
        ` : ''}

        ${screenshot ? `
        <div style="margin-bottom: 16px;">
          <h3 style="margin: 0 0 8px 0; color: #18181b;">Screenshot</h3>
          <img src="${screenshot}" style="max-width: 100%; border: 1px solid #e4e4e7; border-radius: 8px;" alt="Bug screenshot" />
        </div>
        ` : ''}
      </div>
    `;

    // Send the email
    await sendGraphEmail({
      to: [BUG_REPORT_EMAIL],
      subject: `[Bug Report] ${description.substring(0, 50)}${description.length > 50 ? '...' : ''} - ${userName || 'User'}`,
      html
    });

    console.log('[BugReport] Bug report sent successfully to', BUG_REPORT_EMAIL);

    return res.status(200).json({ success: true, message: 'Bug report sent successfully' });
  } catch (error) {
    console.error('[BugReport] Failed to send bug report:', error);
    return res.status(500).json({ error: 'Failed to send bug report', details: error.message });
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
