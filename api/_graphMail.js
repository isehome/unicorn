const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const config = {
  tenant: process.env.AZURE_TENANT_ID,
  clientId: process.env.AZURE_CLIENT_ID,
  clientSecret: process.env.AZURE_CLIENT_SECRET,
  senderEmail: (process.env.NOTIFICATION_SENDER_EMAIL || 'Unicorn@isehome.com').trim(),
  senderGroupId: process.env.NOTIFICATION_SENDER_GROUP_ID?.trim() || null,
  senderGroupEmail: process.env.NOTIFICATION_SENDER_GROUP_EMAIL?.trim() || null
};

let cachedGroupId = config.senderGroupId || null;

function requireGraphConfig() {
  if (!config.tenant || !config.clientId || !config.clientSecret || (!config.senderEmail && !config.senderGroupEmail && !config.senderGroupId)) {
    throw new Error('Missing Graph email configuration');
  }
}

async function getAppToken() {
  requireGraphConfig();
  const body = new URLSearchParams();
  body.set('client_id', config.clientId);
  body.set('client_secret', config.clientSecret);
  body.set('grant_type', 'client_credentials');
  body.set('scope', 'https://graph.microsoft.com/.default');

  const resp = await fetch(`https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Graph token error: ${resp.status} ${text}`);
  }

  const json = await resp.json();
  return json.access_token;
}

function getDelegatedTokenFromHeader(header) {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function sanitizeEmailForFilter(email) {
  return `${email}`.replace(/'/g, "''");
}

async function resolveGroupId(token) {
  if (cachedGroupId) return cachedGroupId;
  if (!config.senderGroupEmail) return null;

  const sanitized = sanitizeEmailForFilter(config.senderGroupEmail);
  const filter = encodeURIComponent(
    `mail eq '${sanitized}' or proxyAddresses/any(x:x eq 'smtp:${sanitized.toLowerCase()}') or proxyAddresses/any(x:x eq 'SMTP:${sanitized.toUpperCase()}')`
  );

  const resp = await fetch(`${GRAPH_BASE}/groups?$filter=${filter}&$select=id,mail,displayName`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to resolve Graph group ID: ${resp.status} ${text}`);
  }

  const data = await resp.json();
  const group = data.value?.[0];
  if (!group?.id) {
    throw new Error(`Group ${config.senderGroupEmail} not found`);
  }

  cachedGroupId = group.id;
  return cachedGroupId;
}

async function sendGraphEmail({ to, cc, subject, html, text }, options = {}) {
  requireGraphConfig();
  if (!Array.isArray(to) || to.length === 0) {
    throw new Error('No recipients provided');
  }

  const delegatedToken = options.delegatedToken || null;
  const sendAsUser = options.sendAsUser || false; // If true, send from user's mailbox using delegated token
  const useDelegated = Boolean(delegatedToken);
  const token = delegatedToken || await getAppToken();

  // Determine from address: if sendAsUser is true, we send from the user's own mailbox
  // Otherwise use the configured system sender
  const fromAddress = useDelegated && !sendAsUser
    ? (config.senderGroupEmail || config.senderEmail)
    : config.senderEmail;
  const contentType = html ? 'HTML' : 'Text';
  const contentValue = html || (text ? text.replace(/\n/g, '<br/>') : '');

  const payload = {
    message: {
      subject: subject || 'Notification',
      body: {
        contentType,
        content: contentValue
      },
      toRecipients: to.map(email => ({
        emailAddress: { address: email }
      }))
    },
    saveToSentItems: sendAsUser // Save to sent items if sending as user
  };

  // Add CC recipients if provided
  if (Array.isArray(cc) && cc.length > 0) {
    payload.message.ccRecipients = cc.filter(Boolean).map(email => ({
      emailAddress: { address: email }
    }));
  }

  if (useDelegated && fromAddress && !sendAsUser) {
    payload.message.from = { emailAddress: { address: fromAddress } };
  }

  const trySend = async (targetPath) => {
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
      throw new Error(`Graph sendMail ${response.status}: ${errorText}`);
    }
    return { status: response.status };
  };

  // For app-only auth (no delegated token), try group send first if configured
  if (!useDelegated && (config.senderGroupId || config.senderGroupEmail) && options.forceUserSend !== true) {
    try {
      const groupId = await resolveGroupId(token);
      return await trySend(`/groups/${encodeURIComponent(groupId)}/sendMail`);
    } catch (groupError) {
      console.warn('[GraphMail] Group send failed, retrying via user mailbox:', groupError.message);
    }
  }

  // For delegated auth, use /me/sendMail
  // For app-only auth, use /users/{email}/sendMail
  const targetPath = useDelegated ? '/me/sendMail' : `/users/${encodeURIComponent(config.senderEmail)}/sendMail`;

  try {
    return await trySend(targetPath);
  } catch (userSendError) {
    // If user send fails with ErrorInvalidUser, the senderEmail might be a group/shared mailbox
    // Try sending via group endpoint as a fallback
    if (!useDelegated && userSendError.message?.includes('ErrorInvalidUser') && config.senderEmail) {
      console.warn('[GraphMail] User mailbox send failed, trying as group mailbox:', config.senderEmail);
      try {
        // Try to resolve senderEmail as a group
        const sanitized = sanitizeEmailForFilter(config.senderEmail);
        const filter = encodeURIComponent(
          `mail eq '${sanitized}' or proxyAddresses/any(x:x eq 'smtp:${sanitized.toLowerCase()}') or proxyAddresses/any(x:x eq 'SMTP:${sanitized.toUpperCase()}')`
        );
        const resp = await fetch(`${GRAPH_BASE}/groups?$filter=${filter}&$select=id,mail,displayName`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (resp.ok) {
          const data = await resp.json();
          const group = data.value?.[0];
          if (group?.id) {
            console.log('[GraphMail] Found group for senderEmail, sending via group:', group.displayName);
            return await trySend(`/groups/${encodeURIComponent(group.id)}/sendMail`);
          }
        }
      } catch (groupFallbackError) {
        console.warn('[GraphMail] Group fallback also failed:', groupFallbackError.message);
      }
    }
    // Re-throw original error if fallback didn't work
    throw userSendError;
  }
}

module.exports = {
  sendGraphEmail,
  getDelegatedTokenFromHeader,
  isGraphConfigured: () => {
    try {
      requireGraphConfig();
      return true;
    } catch (error) {
      return false;
    }
  }
};
