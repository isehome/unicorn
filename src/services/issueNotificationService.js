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

const postNotification = async ({ to, subject, html, text }, options = {}) => {
  if (!Array.isArray(to) || to.length === 0) return;
  const headers = {
    'Content-Type': 'application/json'
  };

  if (options.authToken) {
    headers.Authorization = `Bearer ${options.authToken}`;
  }

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

export const notifyStakeholderAdded = async ({ issue, project, stakeholder, actor, issueUrl, publicPortal }, options = {}) => {
  if (!stakeholder?.email) return;

  const { issueTitle, projectName } = formatIssueContext(issue, project);
  const actorName = actor?.name || 'A teammate';
  const recipient = stakeholder?.contact_name || stakeholder?.displayName || stakeholder?.role_name || 'Stakeholder';
  const safeRecipient = escapeHtml(recipient);
  const safeIssueTitle = escapeHtml(issueTitle);
  const safeProjectName = escapeHtml(projectName);
  const safeActorName = escapeHtml(actorName);
  const portalUrl = publicPortal?.url || null;
  const portalOtp = publicPortal?.otp || null;
  const isExternalStakeholder = stakeholder?.is_internal === false || stakeholder?.role_category === 'external' || stakeholder?.category === 'external';
  const primaryUrl = isExternalStakeholder && portalUrl ? portalUrl : (issueUrl || '#');
  const safeUrl = escapeHtml(primaryUrl);
  const safePortalUrl = portalUrl ? escapeHtml(portalUrl) : null;
  const safePortalOtp = portalOtp ? escapeHtml(portalOtp) : null;

  const html = `
    <p>Hi ${safeRecipient},</p>
    <p>${safeActorName} added you as a stakeholder on issue <strong>${safeIssueTitle}</strong>${safeProjectName}.</p>
    <p><a href="${safeUrl}">${isExternalStakeholder && portalUrl ? 'Open the secure portal' : 'View the issue'}</a> to review the latest updates.</p>
    ${(isExternalStakeholder && safePortalOtp) ? `<p>Your one-time verification code: <strong>${safePortalOtp}</strong></p>` : ''}
    ${(!isExternalStakeholder && safePortalUrl) ? `<p>External portal link: <a href="${safePortalUrl}">${safePortalUrl}</a>${safePortalOtp ? `<br/>One-time code: <strong>${safePortalOtp}</strong>` : ''}</p>` : ''}
  `;

  const textIntro = `Hi ${recipient},

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

export const notifyIssueComment = async ({ issue, project, comment, stakeholders, actor, issueUrl }, options = {}) => {
  const recipients = collectRecipients(stakeholders, actor);

  if (recipients.length === 0) {
    console.log('[IssueNotificationService] No recipients for comment notification');
    return;
  }

  const { issueTitle, projectName } = formatIssueContext(issue, project);
  const actorName = actor?.name || comment?.author || 'System';
  const safeActorName = escapeHtml(actorName);
  const safeIssueTitle = escapeHtml(issueTitle);
  const safeProjectName = escapeHtml(projectName);
  const safeComment = escapeHtml(comment?.text || '');
  const safeUrl = issueUrl || '#';
  
  // Check if this is a system-generated comment (like status change)
  const isSystemComment = comment?.text?.startsWith('Status changed to ') || comment?.is_internal;

  const html = `
    <p>${safeActorName} ${isSystemComment ? 'updated' : 'left a new comment on'} <strong>${safeIssueTitle}</strong>${safeProjectName}:</p>
    <blockquote style="border-left:4px solid #ccc;padding-left:12px;margin:12px 0;">${safeComment}</blockquote>
    <p><a href="${safeUrl}">Open the issue</a> to ${isSystemComment ? 'view details' : 'reply or view the full history'}.</p>
  `;

  const text = `${actorName} ${isSystemComment ? 'updated' : 'left a new comment on'} "${issueTitle}"${projectName}:

"${comment?.text || ''}"

Open the issue: ${safeUrl}
`;

  console.log('[IssueNotificationService] Sending notification', {
    recipients: recipients.length,
    isSystemComment,
    hasAuthToken: !!options?.authToken,
    commentText: comment?.text?.substring(0, 50)
  });

  await postNotification(
    {
      to: recipients,
      subject: `${isSystemComment ? 'Status update' : 'New comment'} on "${issueTitle}"`,
      html,
      text
    },
    { authToken: options?.authToken }
  );
};

export const sendNotificationEmail = async (message, options = {}) => {
  await postNotification(message, options);
};
