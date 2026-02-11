// Serverless function to send issue notifications.
// When sendAsUser is true AND an Authorization header is present, sends from
// the logged-in user's mailbox via Microsoft Graph /me/sendMail (delegated).
// This prevents the system account from being flagged as spam.
// Falls back to the system account if no user token is available.

const { systemSendMail, getSystemAccountEmail } = require('./_systemGraph');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * Send email as the logged-in user using their delegated Graph token.
 * The user's MSAL token must include Mail.Send scope.
 */
async function sendAsUserMail({ userToken, to, cc, bcc, subject, body, bodyType = 'HTML', saveToSentItems = true }) {
  const formatRecipients = (emails) =>
    emails.filter(Boolean).map((email) => ({
      emailAddress: { address: email.trim() },
    }));

  const payload = {
    message: {
      subject,
      body: { contentType: bodyType, content: body },
      toRecipients: formatRecipients(to),
    },
    saveToSentItems,
  };

  if (cc && cc.length > 0) {
    payload.message.ccRecipients = formatRecipients(cc);
  }
  if (bcc && bcc.length > 0) {
    payload.message.bccRecipients = formatRecipients(bcc);
  }

  const resp = await fetch(`${GRAPH_BASE}/me/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${userToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error('[send-issue-notification] User sendMail failed:', resp.status, text);
    throw new Error(`User sendMail failed: ${resp.status} - ${text}`);
  }

  return { success: true, sentFrom: 'user' };
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

  try {
    const { to, cc, subject, html, text, sendAsUser } = req.body || {};
    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    const userToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    console.log('[send-issue-notification] Request received:', {
      to,
      cc,
      subject,
      sendAsUser,
      hasUserToken: !!userToken,
      htmlLength: html?.length,
      textLength: text?.length
    });

    if (!Array.isArray(to) || to.length === 0) {
      console.error('[send-issue-notification] No recipients provided');
      res.status(400).json({ error: 'No recipients provided' });
      return;
    }

    const cleanTo = to.filter(Boolean);
    const cleanCc = Array.isArray(cc) ? cc.filter(Boolean) : [];
    const emailBody = html || text;
    const emailBodyType = html ? 'HTML' : 'Text';

    // If sendAsUser and we have a user token, send from the user's mailbox
    // and CC the system email so it stays in the loop
    if (sendAsUser && userToken) {
      try {
        const systemEmail = await getSystemAccountEmail();
        // Merge system email into CC list (avoid duplicates)
        const ccWithSystem = [...cleanCc];
        if (systemEmail && !ccWithSystem.some(e => e.trim().toLowerCase() === systemEmail.toLowerCase())) {
          ccWithSystem.push(systemEmail);
        }

        await sendAsUserMail({
          userToken,
          to: cleanTo,
          cc: ccWithSystem,
          subject,
          body: emailBody,
          bodyType: emailBodyType,
        });

        console.log('[send-issue-notification] Email sent from user mailbox, CC to system:', {
          systemEmail,
          recipientCount: cleanTo.length
        });
        res.status(200).json({ success: true, sentFrom: 'user', ccSystem: systemEmail });
        return;
      } catch (userSendError) {
        // If user send fails (e.g. token expired, no Mail.Send scope), fall back to system
        console.warn('[send-issue-notification] User sendMail failed, falling back to system account:', userSendError.message);
      }
    }

    // Fallback: send from system account
    const result = await systemSendMail({
      to: cleanTo,
      cc: cleanCc,
      subject,
      body: emailBody,
      bodyType: emailBodyType
    });

    console.log('[send-issue-notification] Email sent via system account:', result);
    res.status(200).json({ success: true, sentFrom: result.sentFrom });
  } catch (error) {
    console.error('[send-issue-notification] Failed to send:', error.message, error.stack);
    res.status(500).json({ error: error.message || 'Failed to send notification' });
  }
};
