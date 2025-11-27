// Serverless function to process pending issue comment notifications
// Called by authenticated internal users when they view an issue
const { createClient } = require('@supabase/supabase-js');
const {
  sendGraphEmail,
  getDelegatedTokenFromHeader,
  isGraphConfigured
} = require('./_graphMail');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || process.env.APP_BASE_URL || null;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { headers: { 'x-client-info': 'unicorn-pending-notifications' } }
    })
  : null;

function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async (req, res) => {
  withCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!supabase) {
    res.status(500).json({ error: 'Supabase not configured' });
    return;
  }

  if (!isGraphConfigured()) {
    res.status(200).json({ processed: 0, message: 'Email not configured' });
    return;
  }

  // Require authentication - only internal users should call this
  const delegatedToken = getDelegatedTokenFromHeader(req.headers?.authorization || req.headers?.Authorization);
  if (!delegatedToken) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const { issueId } = req.body || {};
    if (!issueId) {
      res.status(400).json({ error: 'Issue ID required' });
      return;
    }

    // Find external comments that need notifications sent
    // External comments have is_internal = false and notification_pending = true (or null for old comments)
    const { data: pendingComments, error: fetchError } = await supabase
      .from('issue_comments')
      .select('id, issue_id, comment_text, author_name, author_email, created_at')
      .eq('issue_id', issueId)
      .eq('is_internal', false)
      .eq('notification_pending', true);

    if (fetchError) {
      console.error('[PendingNotifications] Failed to fetch comments:', fetchError);
      res.status(500).json({ error: 'Failed to fetch pending comments' });
      return;
    }

    if (!pendingComments || pendingComments.length === 0) {
      res.status(200).json({ processed: 0 });
      return;
    }

    // Fetch issue and project details
    const { data: issue } = await supabase
      .from('issues')
      .select('id, project_id, title, description, status')
      .eq('id', issueId)
      .maybeSingle();

    if (!issue) {
      res.status(404).json({ error: 'Issue not found' });
      return;
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id, name')
      .eq('id', issue.project_id)
      .maybeSingle();

    // Fetch internal stakeholders to notify
    const { data: stakeholders } = await supabase
      .from('issue_stakeholder_tags_detailed')
      .select('contact_name, email, role_category')
      .eq('issue_id', issueId);

    const internalRecipients = (stakeholders || [])
      .filter(s => s.role_category === 'internal' && s.email)
      .map(s => s.email.trim());

    if (internalRecipients.length === 0) {
      // Mark as processed even if no recipients
      const commentIds = pendingComments.map(c => c.id);
      await supabase
        .from('issue_comments')
        .update({ notification_pending: false })
        .in('id', commentIds);

      res.status(200).json({ processed: pendingComments.length, sent: 0 });
      return;
    }

    const projectName = project?.name ? ` for project ${project.name}` : '';
    const detailsUrl = PUBLIC_SITE_URL ? `${PUBLIC_SITE_URL}/project/${issue.project_id}/issues/${issue.id}` : null;

    let sentCount = 0;
    const processedIds = [];

    for (const comment of pendingComments) {
      try {
        const actor = comment.author_name || 'External stakeholder';
        const subject = `New comment on "${issue.title}"${projectName}`;
        const html = `
          <p><strong>${actor}</strong> left a new comment on issue <strong>${issue.title}</strong>${projectName}.</p>
          <blockquote style="border-left:4px solid #ccc;padding-left:12px;margin:12px 0;">${(comment.comment_text || '').replace(/\n/g, '<br/>')}</blockquote>
          ${detailsUrl ? `<p><a href="${detailsUrl}">View the issue in Unicorn</a> for full context.</p>` : ''}
        `;
        const text = `${actor} left a new comment on issue "${issue.title}"${projectName}.

${comment.comment_text || ''}
${detailsUrl ? `\nView the issue: ${detailsUrl}` : ''}`;

        await sendGraphEmail(
          {
            to: internalRecipients,
            subject,
            html,
            text
          },
          { delegatedToken }
        );

        sentCount++;
        processedIds.push(comment.id);
      } catch (emailError) {
        console.error('[PendingNotifications] Failed to send notification for comment:', comment.id, emailError.message);
        // Still mark as processed to avoid infinite retries
        processedIds.push(comment.id);
      }
    }

    // Mark all processed comments as notification_pending = false
    if (processedIds.length > 0) {
      await supabase
        .from('issue_comments')
        .update({ notification_pending: false })
        .in('id', processedIds);
    }

    res.status(200).json({ processed: processedIds.length, sent: sentCount });
  } catch (error) {
    console.error('[PendingNotifications] Request failed:', error);
    res.status(500).json({ error: error.message || 'Unexpected error' });
  }
};
