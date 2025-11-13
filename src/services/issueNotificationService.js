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

export const notifyStakeholderAdded = async ({ issue, project, stakeholder, actor, issueUrl }, options = {}) => {
  if (!stakeholder?.email) return;

  const { issueTitle, projectName } = formatIssueContext(issue, project);
  const actorName = actor?.name || 'A teammate';
  const recipient = stakeholder?.contact_name || stakeholder?.displayName || stakeholder?.role_name || 'Stakeholder';
  const safeRecipient = escapeHtml(recipient);
  const safeIssueTitle = escapeHtml(issueTitle);
  const safeProjectName = escapeHtml(projectName);
  const safeActorName = escapeHtml(actorName);
  const safeUrl = issueUrl || '#';

  const html = `
    <p>Hi ${safeRecipient},</p>
    <p>${safeActorName} added you as a stakeholder on issue <strong>${safeIssueTitle}</strong>${safeProjectName}.</p>
    <p><a href="${safeUrl}">View the issue</a> to review the latest updates.</p>
  `;

  const text = `Hi ${recipient},

${actorName} added you as a stakeholder on issue "${issueTitle}"${projectName}.

Open the issue: ${safeUrl}
`;

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

  if (recipients.length === 0) return;

  const { issueTitle, projectName } = formatIssueContext(issue, project);
  const actorName = actor?.name || 'A teammate';
  const safeActorName = escapeHtml(actorName);
  const safeIssueTitle = escapeHtml(issueTitle);
  const safeProjectName = escapeHtml(projectName);
  const safeComment = escapeHtml(comment?.text || '');
  const safeUrl = issueUrl || '#';

  const html = `
    <p>${safeActorName} left a new comment on <strong>${safeIssueTitle}</strong>${safeProjectName}:</p>
    <blockquote style="border-left:4px solid #ccc;padding-left:12px;margin:12px 0;">${safeComment}</blockquote>
    <p><a href="${safeUrl}">Open the issue</a> to reply or view the full history.</p>
  `;

  const text = `${actorName} left a new comment on "${issueTitle}"${projectName}:

"${comment?.text || ''}"

Open the issue: ${safeUrl}
`;

  await postNotification(
    {
      to: recipients,
      subject: `New comment on "${issueTitle}"`,
      html,
      text
    },
    { authToken: options?.authToken }
  );
};
