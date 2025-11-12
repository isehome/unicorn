// Serverless function to send issue notifications via Microsoft Graph

const TENANT = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const SENDER_EMAIL = (process.env.NOTIFICATION_SENDER_EMAIL || 'Unicorn@isehome.com').trim();
const SENDER_GROUP_ID = process.env.NOTIFICATION_SENDER_GROUP_ID?.trim();
const SENDER_GROUP_EMAIL = process.env.NOTIFICATION_SENDER_GROUP_EMAIL?.trim();
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
let cachedGroupId = SENDER_GROUP_ID || null;

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

function getDelegatedToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function sanitizeEmailForFilter(email) {
  return `${email}`.replace(/'/g, "''");
}

async function resolveGroupId(token) {
  if (cachedGroupId) return cachedGroupId;
  if (!SENDER_GROUP_EMAIL) return null;

  const sanitized = sanitizeEmailForFilter(SENDER_GROUP_EMAIL);
  const filter = encodeURIComponent(
    `mail eq '${sanitized}' or proxyAddresses/any(x:x eq 'smtp:${sanitized.toLowerCase()}') or proxyAddresses/any(x:x eq 'SMTP:${sanitized.toUpperCase()}')`
  );

  const resp = await fetch(`${GRAPH_BASE}/groups?$filter=${filter}&$select=id,mail,displayName`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to resolve group ID for ${SENDER_GROUP_EMAIL}: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  const group = data.value?.[0];

  if (!group?.id) {
    throw new Error(`Group ${SENDER_GROUP_EMAIL} not found in tenant`);
  }

  cachedGroupId = group.id;
  return cachedGroupId;
}

async function sendEmail({ to, subject, html, text }, delegatedToken = null) {
  const useDelegated = Boolean(delegatedToken);
  const token = delegatedToken || await getAppToken();
  const fromAddress = SENDER_GROUP_EMAIL || SENDER_EMAIL;
  const contentType = html ? 'HTML' : 'Text';
  const contentValue = html || (text ? text.replace(/\n/g, '<br/>') : '');

  let targetPath = null;
  let groupId = null;

  if (!useDelegated && (SENDER_GROUP_ID || SENDER_GROUP_EMAIL)) {
    try {
      groupId = await resolveGroupId(token);
    } catch (error) {
      console.error('[IssueNotification] Group resolution failed:', error.message);
      if (!SENDER_EMAIL) {
        throw error;
      }
    }
  }

  if (useDelegated) {
    targetPath = '/me/sendMail';
  } else if (groupId) {
    targetPath = `/groups/${encodeURIComponent(groupId)}/sendMail`;
  } else {
    targetPath = `/users/${encodeURIComponent(SENDER_EMAIL)}/sendMail`;
  }

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

  if (fromAddress) {
    payload.message.from = { emailAddress: { address: fromAddress } };
    payload.message.sender = { emailAddress: { address: fromAddress } };
  }

  const response = await fetch(`${GRAPH_BASE}${targetPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Graph sendMail ${response.status} (${targetPath}): ${errorText}`);
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

  if (!TENANT || !CLIENT_ID || !CLIENT_SECRET || (!SENDER_EMAIL && !SENDER_GROUP_EMAIL && !SENDER_GROUP_ID)) {
    res.status(500).json({ error: 'Missing Azure AD credentials or sender configuration' });
    return;
  }

  try {
    const { to, subject, html, text } = req.body || {};
    if (!Array.isArray(to) || to.length === 0) {
      res.status(400).json({ error: 'No recipients provided' });
      return;
    }

    const delegatedToken = getDelegatedToken(req);

    await sendEmail(
      {
        to: to.filter(Boolean),
        subject,
        html,
        text,
      },
      delegatedToken
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to send issue notification:', error);
    res.status(500).json({ error: error.message || 'Failed to send notification' });
  }
};
