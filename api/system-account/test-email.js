/**
 * System Account Test Email
 *
 * Endpoint: POST /api/system-account/test-email
 * Sends a test email to verify the system account is working
 */

const { systemSendMail, getSystemAccountEmail } = require('../_systemGraph');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { to } = req.body;
    const systemEmail = await getSystemAccountEmail();

    // If no recipient specified, send to the system account itself
    const recipient = to || systemEmail;

    await systemSendMail({
      to: [recipient],
      subject: 'Unicorn System Account Test',
      body: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px;">
          <h2 style="color: #8B5CF6;">System Account Working!</h2>
          <p>This email was sent from the Unicorn system account.</p>
          <p><strong>Sent from:</strong> ${systemEmail}</p>
          <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
          <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 20px 0;">
          <p style="color: #71717a; font-size: 12px;">
            This is an automated test email from Unicorn. No action required.
          </p>
        </div>
      `,
      bodyType: 'HTML',
    });

    console.log(`[SystemAccount] Test email sent to ${recipient}`);

    res.json({
      success: true,
      message: `Test email sent to ${recipient}`,
      sentFrom: systemEmail,
    });
  } catch (err) {
    console.error('[SystemAccount] Test email error:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
