/**
 * System Graph Email Functions
 *
 * Extended email operations for the AI Email Agent.
 * Requires Mail.Read and Mail.ReadWrite application permissions.
 */

const { getAppToken, getSystemAccountEmail } = require('./_systemGraph');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * Get unread emails from inbox
 *
 * @param {Object} options
 * @param {number} options.top - Max emails to fetch (default: 50)
 * @param {string} options.since - Get emails after this ISO datetime
 * @param {boolean} options.includeBody - Include full body content (default: true)
 */
async function getUnreadEmails(options = {}) {
  const {
    top = 50,
    since = null,
    includeBody = true,
  } = options;

  const token = await getAppToken();
  const mailbox = await getSystemAccountEmail();

  const selectFields = [
    'id',
    'conversationId',
    'internetMessageId',
    'subject',
    'from',
    'toRecipients',
    'ccRecipients',
    'receivedDateTime',
    'isRead',
    'bodyPreview',
    'hasAttachments',
    'importance',
  ];

  if (includeBody) {
    selectFields.push('body');
  }

  const params = new URLSearchParams({
    $top: top.toString(),
    $orderby: 'receivedDateTime asc', // Oldest first for processing order
    $select: selectFields.join(','),
    $filter: 'isRead eq false',
  });

  // Add date filter if specified
  if (since) {
    params.set('$filter', `isRead eq false and receivedDateTime ge ${since}`);
  }

  const endpoint = `${GRAPH_BASE}/users/${mailbox}/messages?${params}`;

  const resp = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      Prefer: 'outlook.body-content-type="text"', // Get plain text body for AI processing
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to get emails: ${resp.status} - ${text}`);
  }

  const data = await resp.json();

  return data.value.map(email => ({
    id: email.id,
    conversationId: email.conversationId,
    internetMessageId: email.internetMessageId,
    subject: email.subject || '(No Subject)',
    from: {
      email: email.from?.emailAddress?.address?.toLowerCase(),
      name: email.from?.emailAddress?.name,
    },
    to: email.toRecipients?.map(r => ({
      email: r.emailAddress?.address?.toLowerCase(),
      name: r.emailAddress?.name,
    })) || [],
    cc: email.ccRecipients?.map(r => ({
      email: r.emailAddress?.address?.toLowerCase(),
      name: r.emailAddress?.name,
    })) || [],
    receivedAt: email.receivedDateTime,
    bodyPreview: email.bodyPreview,
    body: email.body?.content,
    bodyType: email.body?.contentType,
    hasAttachments: email.hasAttachments,
    importance: email.importance,
  }));
}

/**
 * Get a specific email by ID with full details
 */
async function getEmailById(emailId) {
  const token = await getAppToken();
  const mailbox = await getSystemAccountEmail();

  const resp = await fetch(
    `${GRAPH_BASE}/users/${mailbox}/messages/${emailId}?$select=id,conversationId,internetMessageId,subject,from,toRecipients,ccRecipients,receivedDateTime,body,hasAttachments,importance,inferenceClassification`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.body-content-type="text"',
      },
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to get email: ${resp.status} - ${text}`);
  }

  return await resp.json();
}

/**
 * Mark email as read
 */
async function markEmailAsRead(emailId) {
  const token = await getAppToken();
  const mailbox = await getSystemAccountEmail();

  const resp = await fetch(
    `${GRAPH_BASE}/users/${mailbox}/messages/${emailId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isRead: true }),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to mark email as read: ${resp.status} - ${text}`);
  }

  return { success: true };
}

/**
 * Reply to an email
 *
 * @param {string} emailId - Original email ID to reply to
 * @param {Object} params
 * @param {string} params.body - Reply body (HTML)
 * @param {string[]} params.cc - Additional CC recipients
 */
async function replyToEmail(emailId, params) {
  const { body, cc = [] } = params;

  const token = await getAppToken();
  const mailbox = await getSystemAccountEmail();

  const payload = {
    message: {
      body: {
        contentType: 'HTML',
        content: body,
      },
    },
  };

  // Add CC recipients if specified
  if (cc.length > 0) {
    payload.message.ccRecipients = cc.map(email => ({
      emailAddress: { address: email },
    }));
  }

  const resp = await fetch(
    `${GRAPH_BASE}/users/${mailbox}/messages/${emailId}/reply`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to reply to email: ${resp.status} - ${text}`);
  }

  return { success: true };
}

/**
 * Forward an email
 *
 * @param {string} emailId - Email ID to forward
 * @param {Object} params
 * @param {string} params.to - Recipient email
 * @param {string} params.comment - Comment to add (optional)
 */
async function forwardEmail(emailId, params) {
  const { to, comment = '' } = params;

  const token = await getAppToken();
  const mailbox = await getSystemAccountEmail();

  const payload = {
    toRecipients: [
      { emailAddress: { address: to } },
    ],
  };

  if (comment) {
    payload.comment = comment;
  }

  const resp = await fetch(
    `${GRAPH_BASE}/users/${mailbox}/messages/${emailId}/forward`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to forward email: ${resp.status} - ${text}`);
  }

  return { success: true };
}

/**
 * Move email to a folder (e.g., archive)
 */
async function moveEmailToFolder(emailId, folderName) {
  const token = await getAppToken();
  const mailbox = await getSystemAccountEmail();

  // First, get the folder ID
  const foldersResp = await fetch(
    `${GRAPH_BASE}/users/${mailbox}/mailFolders?$filter=displayName eq '${folderName}'`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!foldersResp.ok) {
    throw new Error(`Failed to find folder: ${folderName}`);
  }

  const foldersData = await foldersResp.json();
  const folder = foldersData.value?.[0];

  if (!folder) {
    throw new Error(`Folder not found: ${folderName}`);
  }

  // Move the email
  const resp = await fetch(
    `${GRAPH_BASE}/users/${mailbox}/messages/${emailId}/move`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ destinationId: folder.id }),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to move email: ${resp.status} - ${text}`);
  }

  return { success: true };
}

/**
 * Get email attachments
 */
async function getEmailAttachments(emailId) {
  const token = await getAppToken();
  const mailbox = await getSystemAccountEmail();

  const resp = await fetch(
    `${GRAPH_BASE}/users/${mailbox}/messages/${emailId}/attachments`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Failed to get attachments: ${resp.status} - ${text}`);
  }

  const data = await resp.json();

  return data.value.map(att => ({
    id: att.id,
    name: att.name,
    contentType: att.contentType,
    size: att.size,
    isInline: att.isInline,
  }));
}

module.exports = {
  getUnreadEmails,
  getEmailById,
  markEmailAsRead,
  replyToEmail,
  forwardEmail,
  moveEmailToFolder,
  getEmailAttachments,
};
