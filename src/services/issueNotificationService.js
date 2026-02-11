import { companySettingsService } from './companySettingsService';
import { supabase } from '../lib/supabase';

const NOTIFICATION_ENDPOINT = '/api/send-issue-notification';
const SYSTEM_EMAIL = 'unicorn@isehome.com';

/**
 * Log a notification send to issue_notification_log for engagement tracking.
 * Non-blocking — failures are silently caught so they don't break notification flow.
 */
const logNotificationSend = async ({
  issueId,
  projectId,
  stakeholderTagId,
  recipientEmail,
  recipientName,
  notificationType = 'bulk_notify',
  subject,
  sentBy,
  deliveryStatus = 'sent',
  errorMessage = null,
  metadata = {}
}) => {
  try {
    if (!supabase) return;
    await supabase.from('issue_notification_log').insert({
      issue_id: issueId,
      project_id: projectId,
      stakeholder_tag_id: stakeholderTagId || null,
      recipient_email: recipientEmail,
      recipient_name: recipientName || null,
      notification_type: notificationType,
      subject: subject || null,
      sent_by: sentBy || null,
      delivery_status: deliveryStatus,
      error_message: errorMessage,
      metadata
    });
  } catch (err) {
    console.warn('[IssueNotificationService] Failed to log notification:', err.message);
  }
};

// Whitelist notice to include in first-contact emails
const WHITELIST_NOTICE_HTML = `
  <p style="margin-top:20px;padding:12px;background:#f0f9ff;border-left:4px solid #0ea5e9;font-size:13px;color:#0369a1;">
    <strong>Important:</strong> Some automated updates may come from <strong>${SYSTEM_EMAIL}</strong>.
    Please add this address to your contacts or whitelist to ensure you receive all notifications.
  </p>
`;

const WHITELIST_NOTICE_TEXT = `
---
Important: Some automated updates may come from ${SYSTEM_EMAIL}.
Please add this address to your contacts or whitelist to ensure you receive all notifications.
`;

const escapeHtml = (text = '') =>
  `${text}`.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case '\'':
        return '&#39;';
      default:
        return char;
    }
  });

// Generate branded email footer with company logo (2x size), name, and project name
const generateEmailFooter = (companySettings, projectName) => {
  const companyName = companySettings?.company_name || '';
  const logoUrl = companySettings?.company_logo_url || '';
  const safeCompanyName = escapeHtml(companyName);
  const safeProjectName = escapeHtml(projectName || '');

  // Logo at 2x size (max-height: 100px instead of 50px)
  const logoHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${safeCompanyName}" style="max-height:100px;max-width:400px;margin-bottom:12px;" />`
    : '';

  const companyNameHtml = safeCompanyName
    ? `<div style="font-size:18px;font-weight:bold;color:#333333;">${safeCompanyName}</div>`
    : '';

  const projectNameHtml = safeProjectName
    ? `<div style="font-size:14px;color:#666666;margin-top:4px;">Project: ${safeProjectName}</div>`
    : '';

  if (!logoHtml && !companyNameHtml && !projectNameHtml) {
    return '';
  }

  return `
    <div style="border-top:2px solid #e5e7eb;padding-top:20px;margin-top:24px;text-align:left;">
      ${logoHtml}
      ${companyNameHtml}
      ${projectNameHtml}
    </div>
  `;
};

// Generate logo-only footer for vendor emails (no project name)
const generateVendorEmailFooter = (companySettings) => {
  const companyName = companySettings?.company_name || '';
  const logoUrl = companySettings?.company_logo_url || '';
  const safeCompanyName = escapeHtml(companyName);

  // Logo at 2x size
  const logoHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${safeCompanyName}" style="max-height:100px;max-width:400px;margin-bottom:12px;" />`
    : '';

  const companyNameHtml = safeCompanyName
    ? `<div style="font-size:18px;font-weight:bold;color:#333333;">${safeCompanyName}</div>`
    : '';

  if (!logoHtml && !companyNameHtml) {
    return '';
  }

  return `
    <div style="border-top:2px solid #e5e7eb;padding-top:20px;margin-top:24px;text-align:left;">
      ${logoHtml}
      ${companyNameHtml}
    </div>
  `;
};

// Generate plain text footer for company and project
const generateTextFooter = (companySettings, projectName) => {
  const companyName = companySettings?.company_name || '';
  const parts = [];
  if (companyName) parts.push(companyName);
  if (projectName) parts.push(`Project: ${projectName}`);
  if (parts.length === 0) return '';
  return '\n' + '─'.repeat(40) + '\n' + parts.join('\n');
};

// Email wrapper to ensure consistent light-mode styling
const wrapEmailHtml = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <style>
    :root { color-scheme: light; }
    body { background-color: #ffffff !important; color: #333333 !important; }
  </style>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #333333; background-color: #ffffff; margin: 0; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    ${content}
  </div>
</body>
</html>
`;

const postNotification = async ({ to, cc, subject, html, text, sendAsUser }, options = {}) => {
  if (!Array.isArray(to) || to.length === 0) return;
  const headers = {
    'Content-Type': 'application/json'
  };

  if (options.authToken) {
    headers.Authorization = `Bearer ${options.authToken}`;
  }

  console.log('[IssueNotificationService] Sending notification:', {
    to,
    cc,
    subject,
    sendAsUser,
    hasAuthToken: !!options.authToken,
    htmlLength: html?.length,
    textLength: text?.length
  });

  try {
    const response = await fetch(NOTIFICATION_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ to, cc, subject, html, text, sendAsUser })
    });

    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('[IssueNotificationService] Server error:', response.status, responseData);
      throw new Error(responseData.error || `Notification request failed (${response.status})`);
    }
    console.log('[IssueNotificationService] Notification sent successfully', responseData);
  } catch (error) {
    console.error('[IssueNotificationService] Failed to send notification:', error.message);
    throw error; // Re-throw so caller knows it failed
  }
};

const formatIssueContext = (issue, project) => {
  const issueTitle = issue?.title || 'Issue';
  const projectName = project?.name ? ` for project "${project.name}"` : '';
  return { issueTitle, projectName };
};

// collectRecipients is available for future use but currently not called
// eslint-disable-next-line no-unused-vars
const collectRecipients = (stakeholders = [], actor) => {
  const emailMap = new Map();

  (stakeholders || []).forEach((stakeholder) => {
    const raw = stakeholder?.email;
    if (!raw) return;
    const normalized = raw.trim().toLowerCase();
    if (!normalized) return;
    if (!emailMap.has(normalized)) {
      emailMap.set(normalized, raw.trim());
    }
  });

  if (actor?.email) {
    const normalizedActor = actor.email.trim().toLowerCase();
    if (!emailMap.has(normalizedActor)) {
      emailMap.set(normalizedActor, actor.email.trim());
    }
  }

  return Array.from(emailMap.values());
};

export const notifyStakeholderAdded = async ({ issue, project, stakeholder, actor, issueUrl, publicPortal, companySettings }, options = {}) => {
  if (!stakeholder?.email) return;

  // Fetch company settings if not provided
  let settings = companySettings;
  if (!settings) {
    try {
      settings = await companySettingsService.getCompanySettings();
    } catch (err) {
      console.warn('[IssueNotificationService] Could not fetch company settings:', err.message);
    }
  }

  const { issueTitle, projectName } = formatIssueContext(issue, project);
  const rawProjectName = project?.name || '';
  const actorName = actor?.name || 'A teammate';
  const recipient = stakeholder?.contact_name || stakeholder?.displayName || stakeholder?.role_name || 'Stakeholder';
  const safeRecipient = escapeHtml(recipient);
  const safeIssueTitle = escapeHtml(issueTitle);
  const safeProjectName = escapeHtml(projectName);
  const safeActorName = escapeHtml(actorName);
  const portalUrl = publicPortal?.url || null;
  const portalOtp = publicPortal?.otp || null;
  const isExternalStakeholder = stakeholder?.is_internal === false || stakeholder?.role_category === 'external' || stakeholder?.category === 'external';

  console.log('[IssueNotificationService] notifyStakeholderAdded:', {
    stakeholderEmail: stakeholder?.email,
    stakeholderCategory: stakeholder?.category,
    isExternalStakeholder,
    hasPublicPortal: !!publicPortal,
    portalUrl: portalUrl?.substring(0, 50),
    hasOtp: !!portalOtp,
    hasAuthToken: !!options?.authToken,
    hasCompanySettings: !!settings,
    sendAsUser: true
  });
  const primaryUrl = isExternalStakeholder && portalUrl ? portalUrl : (issueUrl || '#');
  const safeUrl = escapeHtml(primaryUrl);
  const safePortalUrl = portalUrl ? escapeHtml(portalUrl) : null;
  const safePortalOtp = portalOtp ? escapeHtml(portalOtp) : null;

  const emailFooter = generateEmailFooter(settings, rawProjectName);
  const textFooter = generateTextFooter(settings, rawProjectName);

  // First-contact email: send from user's email, CC system email, include whitelist notice
  // Content first, then whitelist notice, then branding footer at the bottom
  const htmlContent = `
    <p>Hi ${safeRecipient},</p>
    <p>${safeActorName} added you as a stakeholder on issue <strong>${safeIssueTitle}</strong>${safeProjectName}.</p>
    <p><a href="${safeUrl}" style="color:#2563eb;text-decoration:none;">${isExternalStakeholder && portalUrl ? 'Open the secure portal' : 'View the issue'}</a> to review the latest updates.</p>
    ${(isExternalStakeholder && safePortalOtp) ? `<p>Your one-time verification code: <strong>${safePortalOtp}</strong></p>` : ''}
    ${(!isExternalStakeholder && safePortalUrl) ? `<p>External portal link: <a href="${safePortalUrl}" style="color:#2563eb;">${safePortalUrl}</a>${safePortalOtp ? `<br/>One-time code: <strong>${safePortalOtp}</strong>` : ''}</p>` : ''}
    ${WHITELIST_NOTICE_HTML}
    ${emailFooter}
  `;
  const html = wrapEmailHtml(htmlContent);

  const textIntro = `Hi ${recipient},

${actorName} added you as a stakeholder on issue "${issueTitle}"${projectName}.

`;
  const textBody = `${isExternalStakeholder && portalUrl ? 'Open the secure portal' : 'Open the issue'}: ${portalUrl && isExternalStakeholder ? portalUrl : primaryUrl}`;
  const textOtp = (isExternalStakeholder && portalOtp) ? `\nOne-time verification code: ${portalOtp}` : (portalUrl && portalOtp ? `\nExternal portal: ${portalUrl} (code: ${portalOtp})` : '');
  const text = `${textIntro}${textBody}${textOtp}${WHITELIST_NOTICE_TEXT}${textFooter}`;

  // Send from user's email (sendAsUser: true) with system email CC'd
  await postNotification(
    {
      to: [stakeholder.email],
      cc: [SYSTEM_EMAIL],
      subject: `You were added to "${issueTitle}"`,
      html,
      text,
      sendAsUser: true
    },
    { authToken: options?.authToken }
  );
};

export const notifyIssueComment = async ({ issue, project, comment, stakeholders, actor, issueUrl, externalPortalLinks = {}, companySettings }, options = {}) => {
  // Fetch company settings if not provided
  let settings = companySettings;
  if (!settings) {
    try {
      settings = await companySettingsService.getCompanySettings();
    } catch (err) {
      console.warn('[IssueNotificationService] Could not fetch company settings:', err.message);
    }
  }

  // Separate internal and external stakeholders
  const internalStakeholders = [];
  const externalStakeholders = [];

  (stakeholders || []).forEach((stakeholder) => {
    if (!stakeholder?.email) return;
    const isExternal = stakeholder?.is_internal === false ||
                       stakeholder?.role_category === 'external' ||
                       stakeholder?.category === 'external';
    if (isExternal) {
      externalStakeholders.push(stakeholder);
    } else {
      internalStakeholders.push(stakeholder);
    }
  });

  // Add actor to internal recipients if they have an email
  if (actor?.email) {
    const actorIsExternal = actor?.is_internal === false ||
                            actor?.role_category === 'external' ||
                            actor?.category === 'external';
    if (!actorIsExternal) {
      const normalizedActor = actor.email.trim().toLowerCase();
      const alreadyIncluded = internalStakeholders.some(
        s => s?.email?.trim().toLowerCase() === normalizedActor
      );
      if (!alreadyIncluded) {
        internalStakeholders.push(actor);
      }
    }
  }

  const { issueTitle, projectName } = formatIssueContext(issue, project);
  const rawProjectName = project?.name || '';
  // Actor name should always be available - use email as fallback, then ID for debugging
  const actorName = actor?.name || actor?.email || comment?.author || comment?.author_email || (actor?.id ? `User (${actor.id})` : 'Team Member');
  const safeActorName = escapeHtml(actorName);
  const safeIssueTitle = escapeHtml(issueTitle);
  const safeProjectName = escapeHtml(projectName);
  const safeComment = escapeHtml(comment?.text || '');
  const safeUrl = issueUrl || '#';

  // Generate branded footer (moved from header)
  const emailFooter = generateEmailFooter(settings, rawProjectName);
  const textFooter = generateTextFooter(settings, rawProjectName);

  // Check if this is a system-generated comment (like status change)
  const isSystemComment = comment?.text?.startsWith('Status changed to ') || comment?.is_internal;
  const subject = `${isSystemComment ? 'Status update' : 'New comment'} on "${issueTitle}"`;

  console.log('[IssueNotificationService] Sending comment notification', {
    internalCount: internalStakeholders.length,
    externalCount: externalStakeholders.length,
    hasExternalPortalLinks: Object.keys(externalPortalLinks).length,
    isSystemComment,
    hasAuthToken: !!options?.authToken,
    hasCompanySettings: !!settings,
    commentText: comment?.text?.substring(0, 50)
  });

  // Send to internal stakeholders with internal URL
  if (internalStakeholders.length > 0) {
    const internalRecipients = internalStakeholders
      .map(s => s?.email?.trim())
      .filter(Boolean);

    if (internalRecipients.length > 0) {
      const htmlContent = `
        <p>${safeActorName} ${isSystemComment ? 'updated' : 'left a new comment on'} <strong>${safeIssueTitle}</strong>${safeProjectName}:</p>
        <blockquote style="border-left:4px solid #cccccc;padding-left:12px;margin:12px 0;color:#555555;">${safeComment}</blockquote>
        <p><a href="${safeUrl}" style="color:#2563eb;text-decoration:none;">Open the issue</a> to ${isSystemComment ? 'view details' : 'reply or view the full history'}.</p>
        ${emailFooter}
      `;
      const html = wrapEmailHtml(htmlContent);

      const text = `${actorName} ${isSystemComment ? 'updated' : 'left a new comment on'} "${issueTitle}"${projectName}:

"${comment?.text || ''}"

Open the issue: ${safeUrl}${textFooter}`;

      await postNotification(
        { to: internalRecipients, subject, html, text },
        { authToken: options?.authToken }
      );
    }
  }

  // Send to external stakeholders with their portal URLs
  for (const stakeholder of externalStakeholders) {
    const email = stakeholder?.email?.trim();
    if (!email) continue;

    // Check if this stakeholder has a portal link
    const tagId = stakeholder?.tag_id || stakeholder?.id;
    const portalInfo = externalPortalLinks[tagId];
    const portalUrl = portalInfo?.url;
    const portalOtp = portalInfo?.otp;

    if (portalUrl) {
      const safePortalUrl = escapeHtml(portalUrl);
      const recipientName = stakeholder?.contact_name || stakeholder?.displayName || stakeholder?.role_name || 'there';
      const safeRecipientName = escapeHtml(recipientName);

      const htmlContent = `
        <p>Hi ${safeRecipientName},</p>
        <p>${safeActorName} ${isSystemComment ? 'updated' : 'left a new comment on'} <strong>${safeIssueTitle}</strong>${safeProjectName}:</p>
        <blockquote style="border-left:4px solid #cccccc;padding-left:12px;margin:12px 0;color:#555555;">${safeComment}</blockquote>
        <p><a href="${safePortalUrl}" style="color:#2563eb;text-decoration:none;">Open the secure portal</a> to ${isSystemComment ? 'view details' : 'reply or view the full history'}.</p>
        ${portalOtp ? `<p>Your one-time verification code: <strong>${escapeHtml(portalOtp)}</strong></p>` : ''}
        ${emailFooter}
      `;
      const html = wrapEmailHtml(htmlContent);

      const text = `Hi ${recipientName},

${actorName} ${isSystemComment ? 'updated' : 'left a new comment on'} "${issueTitle}"${projectName}:

"${comment?.text || ''}"

Open the secure portal: ${portalUrl}
${portalOtp ? `Your one-time verification code: ${portalOtp}` : ''}${textFooter}`;

      await postNotification(
        { to: [email], subject, html, text },
        { authToken: options?.authToken }
      );
    } else {
      // External stakeholder without a portal link - send generic message
      // asking them to use their original invite link
      const recipientName = stakeholder?.contact_name || stakeholder?.displayName || stakeholder?.role_name || 'there';
      const safeRecipientName = escapeHtml(recipientName);

      const htmlContent = `
        <p>Hi ${safeRecipientName},</p>
        <p>${safeActorName} ${isSystemComment ? 'updated' : 'left a new comment on'} <strong>${safeIssueTitle}</strong>${safeProjectName}:</p>
        <blockquote style="border-left:4px solid #cccccc;padding-left:12px;margin:12px 0;color:#555555;">${safeComment}</blockquote>
        <p>Please use the secure portal link from your original invitation email to view this issue and respond.</p>
        ${emailFooter}
      `;
      const html = wrapEmailHtml(htmlContent);

      const text = `Hi ${recipientName},

${actorName} ${isSystemComment ? 'updated' : 'left a new comment on'} "${issueTitle}"${projectName}:

"${comment?.text || ''}"

Please use the secure portal link from your original invitation email to view this issue and respond.${textFooter}`;

      await postNotification(
        { to: [email], subject, html, text },
        { authToken: options?.authToken }
      );
    }
  }
};

export const sendNotificationEmail = async (message, options = {}) => {
  await postNotification(message, options);
};

/**
 * Notify all tagged stakeholders about an issue (bulk notification).
 * Sends a branded email from the current user (sendAsUser: true) with
 * CC to unicorn@isehome.com. Internal stakeholders get the internal URL;
 * external stakeholders get their secure portal link + OTP if new.
 *
 * @param {Object} params
 * @param {Object} params.issue - Issue record ({ id, title, description, status, priority, due_date })
 * @param {Object} params.project - Project record ({ id, name })
 * @param {Array}  params.stakeholders - Tagged stakeholder list
 * @param {Object} params.actor - Current user { name, email }
 * @param {string} params.issueUrl - Internal issue URL
 * @param {Object} params.externalPortalLinks - Map of tagId → { url, otp }
 * @param {Object} [params.companySettings] - Optional pre-fetched company settings
 */
export const notifyAllStakeholders = async (
  { issue, project, stakeholders, actor, issueUrl, externalPortalLinks = {}, companySettings },
  options = {}
) => {
  if (!Array.isArray(stakeholders) || stakeholders.length === 0) {
    console.warn('[IssueNotificationService] notifyAllStakeholders: No stakeholders to notify');
    return { sent: 0 };
  }

  // Fetch company settings if not provided
  let settings = companySettings;
  if (!settings) {
    try {
      settings = await companySettingsService.getCompanySettings();
    } catch (err) {
      console.warn('[IssueNotificationService] Could not fetch company settings:', err.message);
    }
  }

  const { issueTitle, projectName } = formatIssueContext(issue, project);
  const rawProjectName = project?.name || '';
  const actorName = actor?.name || actor?.email || 'Your project team';
  const safeActorName = escapeHtml(actorName);
  const safeIssueTitle = escapeHtml(issueTitle);
  const safeProjectName = escapeHtml(projectName);

  // Build a summary block for the issue
  const status = issue?.status ? escapeHtml(formatStatusLabel(issue.status)) : 'Open';
  const priority = issue?.priority ? escapeHtml(formatStatusLabel(issue.priority)) : '—';
  const description = issue?.description
    ? escapeHtml(issue.description.length > 300 ? issue.description.slice(0, 300) + '…' : issue.description)
    : '';
  const dueDateStr = issue?.due_date
    ? new Date(issue.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  const emailFooter = generateEmailFooter(settings, rawProjectName);
  const textFooter = generateTextFooter(settings, rawProjectName);
  const subject = `Issue Update: "${issueTitle}"`;

  const internalStakeholders = [];
  const externalStakeholders = [];

  (stakeholders || []).forEach((s) => {
    if (!s?.email) return;
    const isExternal = s?.is_internal === false ||
                       s?.role_category === 'external' ||
                       s?.category === 'external';
    if (isExternal) {
      externalStakeholders.push(s);
    } else {
      internalStakeholders.push(s);
    }
  });

  console.log('[IssueNotificationService] notifyAllStakeholders:', {
    issueId: issue?.id,
    internalCount: internalStakeholders.length,
    externalCount: externalStakeholders.length,
    hasAuthToken: !!options?.authToken
  });

  let sent = 0;
  const safeUrl = escapeHtml(issueUrl || '#');

  // Build the issue summary HTML block
  const summaryBlock = `
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;width:120px;background:#f9fafb;color:#333;">Status</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#333;">${status}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb;color:#333;">Priority</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#333;">${priority}</td>
      </tr>
      ${dueDateStr ? `<tr>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb;color:#333;">Due Date</td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb;color:#333;">${escapeHtml(dueDateStr)}</td>
      </tr>` : ''}
    </table>
    ${description ? `<p style="color:#555555;margin:12px 0;">${description}</p>` : ''}
  `;

  const textSummary = `Status: ${issue?.status || 'Open'} | Priority: ${issue?.priority || '—'}${dueDateStr ? ` | Due: ${dueDateStr}` : ''}${description ? `\n\n${issue.description.slice(0, 300)}` : ''}`;

  // ── Internal stakeholders: one email to all ──
  if (internalStakeholders.length > 0) {
    const internalRecipients = internalStakeholders
      .map(s => s?.email?.trim())
      .filter(Boolean);

    if (internalRecipients.length > 0) {
      const htmlContent = `
        <p>${safeActorName} is requesting your attention on issue <strong>${safeIssueTitle}</strong>${safeProjectName}.</p>
        ${summaryBlock}
        <p><a href="${safeUrl}" style="display:inline-block;padding:12px 24px;background-color:#7c3aed;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">View Issue</a></p>
        ${emailFooter}
      `;
      const html = wrapEmailHtml(htmlContent);

      const text = `${actorName} is requesting your attention on issue "${issueTitle}"${projectName}.

${textSummary}

View Issue: ${issueUrl || '#'}${textFooter}`;

      await postNotification(
        {
          to: internalRecipients,
          cc: [SYSTEM_EMAIL],
          subject,
          html,
          text,
          sendAsUser: true
        },
        { authToken: options?.authToken }
      );
      sent += internalRecipients.length;

      // Log each internal recipient notification
      for (const s of internalStakeholders) {
        if (!s?.email) continue;
        logNotificationSend({
          issueId: issue?.id,
          projectId: project?.id,
          stakeholderTagId: s?.tag_id || s?.id,
          recipientEmail: s.email.trim(),
          recipientName: s?.contact_name || s?.displayName || s?.role_name,
          notificationType: 'bulk_notify',
          subject,
          sentBy: options?.userId,
          metadata: { channel: 'internal' }
        });
      }
    }
  }

  // ── External stakeholders: individual emails with portal links ──
  for (const stakeholder of externalStakeholders) {
    const email = stakeholder?.email?.trim();
    if (!email) continue;

    const tagId = stakeholder?.tag_id || stakeholder?.id;
    const portalInfo = externalPortalLinks[tagId];
    const portalUrl = portalInfo?.url;
    const portalOtp = portalInfo?.otp;
    const recipientName = stakeholder?.contact_name || stakeholder?.displayName || stakeholder?.role_name || 'there';
    const safeRecipientName = escapeHtml(recipientName);

    const linkUrl = portalUrl ? escapeHtml(portalUrl) : safeUrl;
    const linkLabel = portalUrl ? 'Open the Secure Portal' : 'View Issue';

    const htmlContent = `
      <p>Hi ${safeRecipientName},</p>
      <p>${safeActorName} is requesting your attention on issue <strong>${safeIssueTitle}</strong>${safeProjectName}.</p>
      ${summaryBlock}
      <p><a href="${linkUrl}" style="display:inline-block;padding:12px 24px;background-color:#7c3aed;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">${linkLabel}</a></p>
      ${portalOtp ? `<p>Your one-time verification code: <strong>${escapeHtml(portalOtp)}</strong></p>` : ''}
      ${!portalUrl ? `<p style="color:#666;font-size:13px;">Please use the secure portal link from your original invitation email if you have one.</p>` : ''}
      ${WHITELIST_NOTICE_HTML}
      ${emailFooter}
    `;
    const html = wrapEmailHtml(htmlContent);

    const text = `Hi ${recipientName},

${actorName} is requesting your attention on issue "${issueTitle}"${projectName}.

${textSummary}

${linkLabel}: ${portalUrl || issueUrl || '#'}
${portalOtp ? `Your one-time verification code: ${portalOtp}` : ''}
${!portalUrl ? 'Please use the secure portal link from your original invitation email if you have one.' : ''}
${WHITELIST_NOTICE_TEXT}${textFooter}`;

    await postNotification(
      {
        to: [email],
        cc: [SYSTEM_EMAIL],
        subject,
        html,
        text,
        sendAsUser: true
      },
      { authToken: options?.authToken }
    );
    sent++;

    // Log external stakeholder notification
    logNotificationSend({
      issueId: issue?.id,
      projectId: project?.id,
      stakeholderTagId: tagId,
      recipientEmail: email,
      recipientName: recipientName !== 'there' ? recipientName : null,
      notificationType: 'bulk_notify',
      subject,
      sentBy: options?.userId,
      metadata: { channel: 'external', hasPortalLink: !!portalUrl }
    });
  }

  console.log(`[IssueNotificationService] notifyAllStakeholders complete: ${sent} emails sent`);
  return { sent };
};

// Helper used by notifyAllStakeholders
const formatStatusLabel = (label = '') => {
  if (!label) return '';
  const normalized = `${label}`.trim();
  if (!normalized) return '';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
};

// Process pending notifications for an issue (called when internal user views the issue)
export const processPendingNotifications = async (issueId, options = {}) => {
  if (!issueId) return { processed: 0 };

  const headers = {
    'Content-Type': 'application/json'
  };

  if (options.authToken) {
    headers.Authorization = `Bearer ${options.authToken}`;
  }

  try {
    const response = await fetch('/api/process-pending-issue-notifications', {
      method: 'POST',
      headers,
      body: JSON.stringify({ issueId })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.warn('[IssueNotificationService] Failed to process pending notifications:', error);
      return { processed: 0, error: error.error };
    }

    const result = await response.json();
    if (result.processed > 0) {
      console.log('[IssueNotificationService] Processed pending notifications:', result);
    }
    return result;
  } catch (error) {
    console.warn('[IssueNotificationService] Error processing pending notifications:', error);
    return { processed: 0, error: error.message };
  }
};

// Process pending notifications for shade approvals (called when internal user views shades)
export const processPendingShadeNotifications = async (projectId, options = {}) => {
  if (!projectId) return { processed: 0 };

  const headers = {
    'Content-Type': 'application/json'
  };

  if (options.authToken) {
    headers.Authorization = `Bearer ${options.authToken}`;
  }

  try {
    const response = await fetch('/api/process-pending-shade-notifications', {
      method: 'POST',
      headers,
      body: JSON.stringify({ projectId })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.warn('[IssueNotificationService] Failed to process pending shade notifications:', error);
      return { processed: 0, error: error.error };
    }

    const result = await response.json();
    if (result.processed > 0) {
      console.log('[IssueNotificationService] Processed pending shade notifications:', result);
    }
    return result;
  } catch (error) {
    console.warn('[IssueNotificationService] Error processing pending shade notifications:', error);
    return { processed: 0, error: error.message };
  }
};

/**
 * Notify a designer/stakeholder that shades are ready for review.
 * Uses the same email infrastructure as issue notifications.
 */
export const notifyShadeReviewRequest = async ({ project, stakeholder, actor, shadePortalUrl, otp, companySettings }, options = {}) => {
  if (!stakeholder?.email) {
    console.warn('[IssueNotificationService] notifyShadeReviewRequest: No stakeholder email provided');
    return;
  }

  // Fetch company settings if not provided
  let settings = companySettings;
  if (!settings) {
    try {
      settings = await companySettingsService.getCompanySettings();
    } catch (err) {
      console.warn('[IssueNotificationService] Could not fetch company settings:', err.message);
    }
  }

  const projectName = project?.name || 'your project';
  const actorName = actor?.name || 'Your project team';
  const recipient = stakeholder?.contact_name || stakeholder?.displayName || stakeholder?.role_name || 'Designer';

  const safeRecipient = escapeHtml(recipient);
  const safeProjectName = escapeHtml(projectName);
  const safeActorName = escapeHtml(actorName);
  const safeUrl = escapeHtml(shadePortalUrl || '#');
  const safeOtp = otp ? escapeHtml(otp) : null;

  const emailFooter = generateEmailFooter(settings, projectName);
  const textFooter = generateTextFooter(settings, projectName);

  console.log('[IssueNotificationService] notifyShadeReviewRequest:', {
    stakeholderEmail: stakeholder?.email,
    projectName,
    hasPortalUrl: !!shadePortalUrl,
    hasOtp: !!otp,
    hasAuthToken: !!options?.authToken,
    hasCompanySettings: !!settings
  });

  const htmlContent = `
    <p>Hi ${safeRecipient},</p>
    <p>${safeActorName} has sent window covering selections for <strong>${safeProjectName}</strong> for your review.</p>
    <p>Please review the shade specifications and provide your approval or feedback.</p>
    ${shadePortalUrl ? `<p><a href="${safeUrl}" style="display:inline-block;padding:12px 24px;background-color:#7c3aed;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">Review Window Coverings</a></p>` : ''}
    ${safeOtp ? `<p>Your one-time verification code: <strong>${safeOtp}</strong></p>` : ''}
    ${WHITELIST_NOTICE_HTML}
    ${emailFooter}
  `;
  const html = wrapEmailHtml(htmlContent);

  const text = `Hi ${recipient},

${actorName} has sent window covering selections for ${projectName} for your review.

Please review the shade specifications and provide your approval or feedback.

${shadePortalUrl ? `Review Window Coverings: ${shadePortalUrl}` : ''}${otp ? `
Your one-time verification code: ${otp}` : ''}
${WHITELIST_NOTICE_TEXT}${textFooter}`;

  // Send from user's email (sendAsUser: true) with system email CC'd
  await postNotification(
    {
      to: [stakeholder.email],
      cc: [SYSTEM_EMAIL],
      subject: `Window Covering Review Request - ${projectName}`,
      html,
      text,
      sendAsUser: true
    },
    { authToken: options?.authToken }
  );
};

/**
 * Notify internal stakeholders that all shades have been approved by the designer/stakeholder.
 * This is called when an external stakeholder approves the final shade.
 */
export const notifyShadesAllApproved = async ({ project, approvedBy, approvedByEmail, shadeCount, companySettings }, options = {}) => {
  if (!project?.id) {
    console.warn('[IssueNotificationService] notifyShadesAllApproved: No project provided');
    return;
  }

  // Fetch company settings if not provided
  let settings = companySettings;
  if (!settings) {
    try {
      settings = await companySettingsService.getCompanySettings();
    } catch (err) {
      console.warn('[IssueNotificationService] Could not fetch company settings:', err.message);
    }
  }

  const projectName = project?.name || 'the project';
  const approver = approvedBy || approvedByEmail || 'The designer';
  const count = shadeCount || 'all';

  const safeProjectName = escapeHtml(projectName);
  const safeApprover = escapeHtml(approver);
  const projectUrl = options.projectUrl || '#';

  const emailFooter = generateEmailFooter(settings, projectName);
  const textFooter = generateTextFooter(settings, projectName);

  console.log('[IssueNotificationService] notifyShadesAllApproved:', {
    projectId: project.id,
    projectName,
    approvedBy,
    shadeCount,
    hasAuthToken: !!options?.authToken,
    recipients: options.recipients?.length
  });

  const htmlContent = `
    <p>Great news! <strong>${safeApprover}</strong> has approved all ${count} window covering selections for <strong>${safeProjectName}</strong>.</p>
    <p>The shades are now ready to proceed to the next stage.</p>
    <p><a href="${escapeHtml(projectUrl)}" style="display:inline-block;padding:12px 24px;background-color:#22c55e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">View Project</a></p>
    ${emailFooter}
  `;
  const html = wrapEmailHtml(htmlContent);

  const text = `Great news! ${approver} has approved all ${count} window covering selections for ${projectName}.

The shades are now ready to proceed to the next stage.

View Project: ${projectUrl}${textFooter}`;

  // Send to specified recipients (internal project team)
  const recipients = options.recipients || [];
  if (recipients.length === 0) {
    console.warn('[IssueNotificationService] notifyShadesAllApproved: No recipients provided');
    return;
  }

  await postNotification(
    {
      to: recipients,
      subject: `✓ All Window Coverings Approved - ${projectName}`,
      html,
      text
    },
    { authToken: options?.authToken }
  );
};

// Export constants and functions for use by other services
export { SYSTEM_EMAIL, WHITELIST_NOTICE_HTML, WHITELIST_NOTICE_TEXT, generateVendorEmailFooter, wrapEmailHtml };
