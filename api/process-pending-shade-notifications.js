// Serverless function to process pending shade approval notifications
// Called by authenticated internal users when they view the shades page
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
      global: { headers: { 'x-client-info': 'unicorn-shade-notifications' } }
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
    const { projectId } = req.body || {};
    if (!projectId) {
      res.status(400).json({ error: 'Project ID required' });
      return;
    }

    // Check if there's a pending shade approval notification for this project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, shades_approved_at, shades_approved_by, shades_approved_by_email, shades_approval_notification_pending')
      .eq('id', projectId)
      .maybeSingle();

    if (projectError) {
      console.error('[ShadeNotifications] Failed to fetch project:', projectError);
      res.status(500).json({ error: 'Failed to fetch project' });
      return;
    }

    if (!project || !project.shades_approval_notification_pending) {
      res.status(200).json({ processed: 0 });
      return;
    }

    // Get the count of shades
    const { data: shades, error: shadesError } = await supabase
      .from('project_shades')
      .select('id')
      .eq('project_id', projectId);

    if (shadesError) {
      console.error('[ShadeNotifications] Failed to fetch shades:', shadesError);
    }

    const shadeCount = shades?.length || 0;

    // Fetch internal stakeholders to notify (project team members)
    const { data: stakeholders } = await supabase
      .from('project_stakeholders')
      .select('contact_email, contact_name, role_category')
      .eq('project_id', projectId);

    const internalRecipients = (stakeholders || [])
      .filter(s => s.role_category === 'internal' && s.contact_email)
      .map(s => s.contact_email.trim());

    if (internalRecipients.length === 0) {
      // Mark as processed even if no recipients
      await supabase
        .from('projects')
        .update({ shades_approval_notification_pending: false })
        .eq('id', projectId);

      res.status(200).json({ processed: 1, sent: 0, reason: 'no_internal_recipients' });
      return;
    }

    const projectUrl = PUBLIC_SITE_URL ? `${PUBLIC_SITE_URL}/project/${projectId}/shades` : null;
    const approver = project.shades_approved_by || project.shades_approved_by_email || 'The designer';

    const subject = `✓ All Window Coverings Approved - ${project.name}`;
    const html = `
      <p>Great news! <strong>${approver}</strong> has approved all ${shadeCount} window covering selections for <strong>${project.name}</strong>.</p>
      <p>The shades are now ready to proceed to the next stage.</p>
      ${projectUrl ? `<p><a href="${projectUrl}" style="display:inline-block;padding:12px 24px;background-color:#22c55e;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">View Shades</a></p>` : ''}
    `;
    const text = `Great news! ${approver} has approved all ${shadeCount} window covering selections for ${project.name}.

The shades are now ready to proceed to the next stage.

${projectUrl ? `View Shades: ${projectUrl}` : ''}`;

    let sentCount = 0;
    try {
      await sendGraphEmail(
        {
          to: internalRecipients,
          subject,
          html,
          text
        },
        { delegatedToken }
      );
      sentCount = 1;
    } catch (emailError) {
      console.error('[ShadeNotifications] Failed to send notification:', emailError.message);
    }

    // Mark as processed
    await supabase
      .from('projects')
      .update({ shades_approval_notification_pending: false })
      .eq('id', projectId);

    res.status(200).json({ processed: 1, sent: sentCount });
  } catch (error) {
    console.error('[ShadeNotifications] Request failed:', error);
    res.status(500).json({ error: error.message || 'Unexpected error' });
  }
};
