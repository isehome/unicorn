// Serverless function to send issue notifications via Microsoft Graph

const TENANT = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const SENDER_EMAIL = (process.env.NOTIFICATION_SENDER_EMAIL || 'Unicorn@isehome.com').trim();
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

async function getAppToken() {
  const body = new URLSearchParams();
  body.set('client_id', CLIENT_ID);
  body.set('client_secret', CLIENT_SECRET);
  body.set('grant_type', 'client_credentials');
  body.set('scope', 'https://graph.microsoft.com/.default');

  const resp = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token error: ${resp.status} ${text}`);
  }

  const json = await resp.json();
  return json.access_token;
}

async function sendEmail({ to, subject, html, text }) {
  const token = await getAppToken();
  const contentType = html ? 'HTML' : 'Text';
  const contentValue = html || (text ? text.replace(/\n/g, '<br/>') : '');

  const payload = {
    message: {
      subject: subject || 'Issue update',
      body: {
        contentType,
        content: contentValue
      },
      toRecipients: to.map(email => ({
        emailAddress: { address: email }
      }))
    },
    saveToSentItems: false
  };

  const response = await fetch(
    `${GRAPH_BASE}/users/${encodeURIComponent(SENDER_EMAIL)}/sendMail`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Graph sendMail ${response.status}: ${errorText}`);
  }
}

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

  if (!TENANT || !CLIENT_ID || !CLIENT_SECRET || !SENDER_EMAIL) {
    res.status(500).json({ error: 'Missing Azure AD credentials or sender email configuration' });
    return;
  }

  try {
    const { to, subject, html, text } = req.body || {};
    if (!Array.isArray(to) || to.length === 0) {
      res.status(400).json({ error: 'No recipients provided' });
      return;
    }

    await sendEmail({
      to: to.filter(Boolean),
      subject,
      html,
      text
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to send issue notification:', error);
    res.status(500).json({ error: error.message || 'Failed to send notification' });
  }
};
