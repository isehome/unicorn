// Serverless function to send issue notifications via System Account
const { systemSendMail } = require('./_systemGraph');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(200).end();
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { to, cc, subject, html, text } = req.body || {};

    console.log('[send-issue-notification] Request received:', {
      to,
      cc,
      subject,
      htmlLength: html?.length,
      textLength: text?.length
    });

    if (!Array.isArray(to) || to.length === 0) {
      console.error('[send-issue-notification] No recipients provided');
      res.status(400).json({ error: 'No recipients provided' });
      return;
    }

    const result = await systemSendMail({
      to: to.filter(Boolean),
      cc: Array.isArray(cc) ? cc.filter(Boolean) : [],
      subject,
      body: html || text,
      bodyType: html ? 'HTML' : 'Text'
    });

    console.log('[send-issue-notification] Email sent successfully via system account:', result);
    res.status(200).json({ success: true, sentFrom: result.sentFrom });
  } catch (error) {
    console.error('[send-issue-notification] Failed to send:', error.message, error.stack);
    res.status(500).json({ error: error.message || 'Failed to send notification' });
  }
};
