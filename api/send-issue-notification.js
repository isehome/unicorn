// Serverless function to send issue notifications via Microsoft Graph
const {
  sendGraphEmail,
  getDelegatedTokenFromHeader,
  isGraphConfigured
} = require('./_graphMail');

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

  if (!isGraphConfigured()) {
    res.status(500).json({ error: 'Missing Azure AD credentials or sender configuration' });
    return;
  }

  try {
    const { to, cc, subject, html, text, sendAsUser } = req.body || {};
    if (!Array.isArray(to) || to.length === 0) {
      res.status(400).json({ error: 'No recipients provided' });
      return;
    }

    const delegatedToken = getDelegatedTokenFromHeader(req.headers?.authorization || req.headers?.Authorization);

    await sendGraphEmail(
      {
        to: to.filter(Boolean),
        cc: Array.isArray(cc) ? cc.filter(Boolean) : [],
        subject,
        html,
        text,
      },
      { delegatedToken, sendAsUser: Boolean(sendAsUser) }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to send issue notification:', error);
    res.status(500).json({ error: error.message || 'Failed to send notification' });
  }
};
