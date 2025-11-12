// Serverless function to send issue notifications via SendGrid

const SENDGRID_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'no-reply@isehome.com';
const FROM_NAME = process.env.SENDGRID_FROM_NAME || 'ISE Issue Tracker';

const sendgridEndpoint = 'https://api.sendgrid.com/v3/mail/send';

async function sendEmail({ to, subject, html, text }) {
  const payload = {
    personalizations: [
      {
        to: to.map((email) => ({ email }))
      }
    ],
    from: {
      email: FROM_EMAIL,
      name: FROM_NAME
    },
    subject: subject || 'Issue update',
    content: [
      { type: 'text/plain', value: text || html || '' },
      { type: 'text/html', value: html || text || '' }
    ]
  };

  const response = await fetch(sendgridEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SENDGRID_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SendGrid ${response.status}: ${errorText}`);
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

  if (!SENDGRID_KEY || !FROM_EMAIL) {
    res.status(500).json({ error: 'Missing SENDGRID_API_KEY or SENDGRID_FROM_EMAIL environment variables' });
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

