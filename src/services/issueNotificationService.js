import { companySettingsService } from './companySettingsService';

const NOTIFICATION_ENDPOINT = '/api/send-issue-notification';

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

// Generate branded email header with company logo, name, and project name
const generateEmailHeader = (companySettings, projectName) => {
  const companyName = companySettings?.company_name || '';
  const logoUrl = companySettings?.company_logo_url || '';
  const safeCompanyName = escapeHtml(companyName);
  const safeProjectName = escapeHtml(projectName || '');

  const logoHtml = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${safeCompanyName}" style="max-height:50px;max-width:200px;margin-bottom:8px;" />`
    : '';

  const companyNameHtml = safeCompanyName
    ? `<div style="font-size:18px;font-weight:bold;color:#333;">${safeCompanyName}</div>`
    : '';

  const projectNameHtml = safeProjectName
    ? `<div style="font-size:14px;color:#666;margin-top:4px;">Project: ${safeProjectName}</div>`
    : '';

  if (!logoHtml && !companyNameHtml && !projectNameHtml) {
    return '';
  }

  return `
    <div style="border-bottom:2px solid #e5e7eb;padding-bottom:16px;margin-bottom:20px;text-align:left;">
      ${logoHtml}
      ${companyNameHtml}
      ${projectNameHtml}
    </div>
  `;
};

// Generate plain text header for company and project
const generateTextHeader = (companySettings, projectName) => {
  const companyName = companySettings?.company_name || '';
  const parts = [];
  if (companyName) parts.push(companyName);
  if (projectName) parts.push(`Project: ${projectName}`);
  if (parts.length === 0) return '';
  return parts.join('\n') + '\n' + '─'.repeat(40) + '\n\n';
};

const postNotification = async ({ to, subject, html, text }, options = {}) => {
  if (!Array.isArray(to) || to.length === 0) return;
  const headers = {
    'Content-Type': 'application/json'
  };

  if (options.authToken) {
    headers.Authorization = `Bearer ${options.authToken}`;
  }

  console.log('[IssueNotificationService] Sending notification:', {
    to,
    subject,
    hasAuthToken: !!options.authToken,
    htmlLength: html?.length,
    textLength: text?.length
  });

  try {
    const response = await fetch(NOTIFICATION_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ to, subject, html, text })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Notification request failed (${response.status})`);
    }
    console.log('[IssueNotificationService] Notification sent successfully');
  } catch (error) {
    console.warn('[IssueNotificationService] Failed to send notification:', error.message);
  }
};

const formatIssueContext = (issue, project) => {
  const issueTitle = issue?.title || 'Issue';
  const projectName = project?.name ? ` for project "${project.name}"` : '';
  return { issueTitle, projectName };
};

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
    hasCompanySettings: !!settings
  });
  const primaryUrl = isExternalStakeholder && portalUrl ? portalUrl : (issueUrl || '#');
  const safeUrl = escapeHtml(primaryUrl);
  const safePortalUrl = portalUrl ? escapeHtml(portalUrl) : null;
  const safePortalOtp = portalOtp ? escapeHtml(portalOtp) : null;

  const emailHeader = generateEmailHeader(settings, rawProjectName);
  const textHeader = generateTextHeader(settings, rawProjectName);

  const html = `
    ${emailHeader}
    <p>Hi ${safeRecipient},</p>
    <p>${safeActorName} added you as a stakeholder on issue <strong>${safeIssueTitle}</strong>${safeProjectName}.</p>
    <p><a href="${safeUrl}">${isExternalStakeholder && portalUrl ? 'Open the secure portal' : 'View the issue'}</a> to review the latest updates.</p>
    ${(isExternalStakeholder && safePortalOtp) ? `<p>Your one-time verification code: <strong>${safePortalOtp}</strong></p>` : ''}
    ${(!isExternalStakeholder && safePortalUrl) ? `<p>External portal link: <a href="${safePortalUrl}">${safePortalUrl}</a>${safePortalOtp ? `<br/>One-time code: <strong>${safePortalOtp}</strong>` : ''}</p>` : ''}
  `;

  const textIntro = `${textHeader}Hi ${recipient},

${actorName} added you as a stakeholder on issue "${issueTitle}"${projectName}.

`;
  const textBody = `${isExternalStakeholder && portalUrl ? 'Open the secure portal' : 'Open the issue'}: ${portalUrl && isExternalStakeholder ? portalUrl : primaryUrl}`;
  const textOtp = (isExternalStakeholder && portalOtp) ? `\nOne-time verification code: ${portalOtp}` : (portalUrl && portalOtp ? `\nExternal portal: ${portalUrl} (code: ${portalOtp})` : '');
  const text = `${textIntro}${textBody}${textOtp}`;

  await postNotification(
    {
      to: [stakeholder.email],
      subject: `You were added to "${issueTitle}"`,
      html,
      text
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
  const actorName = actor?.name || comment?.author || 'System';
  const safeActorName = escapeHtml(actorName);
  const safeIssueTitle = escapeHtml(issueTitle);
  const safeProjectName = escapeHtml(projectName);
  const safeComment = escapeHtml(comment?.text || '');
  const safeUrl = issueUrl || '#';

  // Generate branded header
  const emailHeader = generateEmailHeader(settings, rawProjectName);
  const textHeader = generateTextHeader(settings, rawProjectName);

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
      const html = `
        ${emailHeader}
        <p>${safeActorName} ${isSystemComment ? 'updated' : 'left a new comment on'} <strong>${safeIssueTitle}</strong>${safeProjectName}:</p>
        <blockquote style="border-left:4px solid #ccc;padding-left:12px;margin:12px 0;">${safeComment}</blockquote>
        <p><a href="${safeUrl}">Open the issue</a> to ${isSystemComment ? 'view details' : 'reply or view the full history'}.</p>
      `;

      const text = `${textHeader}${actorName} ${isSystemComment ? 'updated' : 'left a new comment on'} "${issueTitle}"${projectName}:

"${comment?.text || ''}"

Open the issue: ${safeUrl}
`;

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

      const html = `
        ${emailHeader}
        <p>Hi ${safeRecipientName},</p>
        <p>${safeActorName} ${isSystemComment ? 'updated' : 'left a new comment on'} <strong>${safeIssueTitle}</strong>${safeProjectName}:</p>
        <blockquote style="border-left:4px solid #ccc;padding-left:12px;margin:12px 0;">${safeComment}</blockquote>
        <p><a href="${safePortalUrl}">Open the secure portal</a> to ${isSystemComment ? 'view details' : 'reply or view the full history'}.</p>
        ${portalOtp ? `<p>Your one-time verification code: <strong>${escapeHtml(portalOtp)}</strong></p>` : ''}
      `;

      const text = `${textHeader}Hi ${recipientName},

${actorName} ${isSystemComment ? 'updated' : 'left a new comment on'} "${issueTitle}"${projectName}:

"${comment?.text || ''}"

Open the secure portal: ${portalUrl}
${portalOtp ? `Your one-time verification code: ${portalOtp}` : ''}
`;

      await postNotification(
        { to: [email], subject, html, text },
        { authToken: options?.authToken }
      );
    } else {
      // External stakeholder without a portal link - send generic message
      // asking them to use their original invite link
      const recipientName = stakeholder?.contact_name || stakeholder?.displayName || stakeholder?.role_name || 'there';
      const safeRecipientName = escapeHtml(recipientName);

      const html = `
        ${emailHeader}
        <p>Hi ${safeRecipientName},</p>
        <p>${safeActorName} ${isSystemComment ? 'updated' : 'left a new comment on'} <strong>${safeIssueTitle}</strong>${safeProjectName}:</p>
        <blockquote style="border-left:4px solid #ccc;padding-left:12px;margin:12px 0;">${safeComment}</blockquote>
        <p>Please use the secure portal link from your original invitation email to view this issue and respond.</p>
      `;

      const text = `${textHeader}Hi ${recipientName},

${actorName} ${isSystemComment ? 'updated' : 'left a new comment on'} "${issueTitle}"${projectName}:

"${comment?.text || ''}"

Please use the secure portal link from your original invitation email to view this issue and respond.
`;

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
