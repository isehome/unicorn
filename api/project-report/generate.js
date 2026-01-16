/**
 * Generate Project Progress Report
 * Creates HTML email with gauges and issues for external stakeholders
 *
 * Updated 2026-01-16: Uses _milestoneCalculations.js directly (SSOT)
 * This is the same calculation logic as the frontend milestoneService.js.
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { systemSendMail } = require('../_systemGraph');
const { calculateAllMilestones } = require('../_milestoneCalculations');

// For external portal links (user-facing URLs)
const APP_BASE_URL = process.env.APP_BASE_URL || process.env.PUBLIC_SITE_URL || 'https://unicorn-one.vercel.app';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Generate a secure portal token (server-side version)
 */
function generatePortalToken(length = 48) {
  const bytes = crypto.randomBytes(length);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const chars = [];
  for (let i = 0; i < length; i++) {
    chars.push(alphabet[bytes[i] % alphabet.length]);
  }
  return chars.join('');
}

/**
 * Generate a 6-digit OTP code
 */
function generateOtpCode() {
  return String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
}

/**
 * Hash a secret using SHA-256
 */
function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

/**
 * Get or create a portal link for an issue with an external stakeholder
 * Returns the raw token (not hashed) for use in the portal URL
 */
async function getOrCreateIssuePortalLink(issueId, projectId, stakeholderTag) {
  // Check for existing valid link
  const { data: existingLink } = await supabase
    .from('issue_public_access_links')
    .select('id, token_hash')
    .eq('issue_stakeholder_tag_id', stakeholderTag.id)
    .is('revoked_at', null)
    .maybeSingle();

  // If link exists, we can't recover the token (it's hashed)
  // Generate a new one to include in the report
  const token = generatePortalToken();
  const otp = generateOtpCode();
  const tokenHash = hashSecret(token);
  const otpHash = hashSecret(otp);
  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year

  const contact = stakeholderTag.contacts;
  const payload = {
    issue_id: issueId,
    project_id: projectId,
    issue_stakeholder_tag_id: stakeholderTag.id,
    contact_email: (contact?.email || '').trim().toLowerCase(),
    contact_name: contact?.name || '',
    token_hash: tokenHash,
    otp_hash: otpHash,
    otp_expires_at: expiresAt,
    session_token_hash: null,
    session_expires_at: null,
    session_version: 0,
    verification_attempts: 0,
    metadata: {},
    revoked_at: null
  };

  // Upsert to update existing or create new
  const { error } = await supabase
    .from('issue_public_access_links')
    .upsert([payload], {
      onConflict: 'issue_stakeholder_tag_id',
      ignoreDuplicates: false
    });

  if (error) {
    console.error('[project-report] Failed to create portal link:', error);
    return null;
  }

  return token;
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { projectId, includeTodos = false, sendEmail = false, recipientEmails = [] } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    // Fetch project details
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Fetch milestone percentages from the API endpoint (SSOT)
    // This ensures we use the exact same calculation logic as the frontend
    const milestones = await calculateAllMilestones(projectId);

    // Fetch milestone dates from project_milestones table
    const { data: milestoneDates } = await supabase
      .from('project_milestones')
      .select('milestone_type, target_date, actual_date, completed_manually')
      .eq('project_id', projectId);

    // Fetch issues for this project (exclude resolved issues)
    const { data: issues, error: issuesError } = await supabase
      .from('issues')
      .select('*')
      .eq('project_id', projectId)
      .neq('status', 'resolved')
      .order('created_at', { ascending: false });

    if (issuesError) {
      console.error('[project-report] Error fetching issues:', issuesError);
    }

    // Fetch stakeholder tags using the detailed view which includes role_category
    // The view joins issue_stakeholder_tags -> project_stakeholders -> stakeholder_roles
    // role_category = 'external' means external stakeholder
    const issueIds = (issues || []).map(i => i.id);
    let stakeholderTags = [];

    if (issueIds.length > 0) {
      const { data: tagsData, error: tagsError } = await supabase
        .from('issue_stakeholder_tags_detailed')
        .select('*')
        .in('issue_id', issueIds);

      if (tagsError) {
        console.error('[project-report] Error fetching stakeholder tags:', tagsError);
      }
      stakeholderTags = tagsData || [];
    }

    console.log('[project-report] Issues query result:', {
      projectId,
      issuesFound: issues?.length || 0,
      stakeholderTagsFound: stakeholderTags.length,
      tagsSample: stakeholderTags.slice(0, 5).map(t => ({
        tag_id: t.tag_id,
        issue_id: t.issue_id,
        role_category: t.role_category,
        contact_name: t.contact_name
      }))
    });

    // Group stakeholder tags by issue_id and add is_external computed property
    const tagsByIssue = {};
    for (const tag of stakeholderTags) {
      if (!tagsByIssue[tag.issue_id]) {
        tagsByIssue[tag.issue_id] = [];
      }
      // Determine if external: role_category = 'external' is the authoritative source
      tag.is_external = tag.role_category === 'external';
      tagsByIssue[tag.issue_id].push(tag);
    }

    // Attach stakeholder tags to issues
    for (const issue of (issues || [])) {
      issue.stakeholder_tags = tagsByIssue[issue.id] || [];
    }

    // Separate issues by type - now using role_category via is_external
    const externalIssues = (issues || []).filter(issue =>
      issue.stakeholder_tags?.some(tag => tag.is_external)
    );
    const internalIssues = (issues || []).filter(issue =>
      !issue.stakeholder_tags?.some(tag => tag.is_external)
    );
    const blockedIssues = (issues || []).filter(issue =>
      (issue.status || '').toLowerCase() === 'blocked'
    );

    console.log('[project-report] Issues categorized:', {
      external: externalIssues.length,
      internal: internalIssues.length,
      blocked: blockedIssues.length,
      externalIssueTitles: externalIssues.map(i => i.title)
    });

    // Generate portal links for issues with external stakeholders
    const issuePortalLinks = {};
    for (const issue of (issues || [])) {
      // Find the first external stakeholder tag to create a link
      const externalTag = issue.stakeholder_tags?.find(tag => tag.is_external);
      if (externalTag) {
        console.log('[project-report] Creating portal link for issue:', issue.id, 'tag:', externalTag.tag_id, 'contact:', externalTag.contact_name);
        try {
          // Adapt tag structure for getOrCreateIssuePortalLink
          const tagForLink = {
            id: externalTag.tag_id,
            contacts: {
              email: externalTag.email,
              name: externalTag.contact_name
            }
          };
          const token = await getOrCreateIssuePortalLink(issue.id, projectId, tagForLink);
          if (token) {
            issuePortalLinks[issue.id] = `${APP_BASE_URL}/public/issues/${token}`;
            console.log('[project-report] Portal link created:', issuePortalLinks[issue.id]);
          }
        } catch (linkError) {
          console.error(`[project-report] Failed to create link for issue ${issue.id}:`, linkError);
        }
      }
    }

    console.log('[project-report] Portal links created:', Object.keys(issuePortalLinks).length);

    // Optionally fetch todos
    let todos = [];
    if (includeTodos) {
      const { data: todoData, error: todoError } = await supabase
        .from('project_todos')
        .select('*')
        .eq('project_id', projectId)
        .eq('completed', false)
        .order('do_by', { ascending: true, nullsFirst: false });

      if (todoError) {
        console.error('[project-report] Error fetching todos:', todoError);
      }
      todos = todoData || [];
      console.log('[project-report] Todos fetched:', todos.length, 'includeTodos:', includeTodos);
    }

    // Generate HTML
    const html = generateReportHtml({
      project,
      milestones,
      milestoneDates: milestoneDates || [],
      externalIssues,
      internalIssues,
      blockedIssues,
      issuePortalLinks,
      todos,
      includeTodos
    });

    // Send email if requested
    if (sendEmail && recipientEmails.length > 0) {
      await systemSendMail({
        to: recipientEmails,
        subject: `[Project Update] ${project.name} - Weekly Progress Report`,
        body: html,
        bodyType: 'HTML'
      });
    }

    return res.status(200).json({
      success: true,
      html,
      stats: {
        externalIssues: externalIssues.length,
        internalIssues: internalIssues.length,
        blockedIssues: blockedIssues.length,
        todos: todos.length
      }
    });

  } catch (error) {
    console.error('[project-report] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Note: calculateAllMilestones is now imported from api/_milestoneCalculations.js
// This eliminates 360+ lines of duplicate code that previously lived here.
// See that module for the SINGLE SOURCE OF TRUTH for all milestone calculations.

function generateReportHtml({ project, milestones, milestoneDates, externalIssues, internalIssues, blockedIssues, issuePortalLinks, todos, includeTodos }) {
  // Build milestone date lookup
  const dateMap = {};
  (milestoneDates || []).forEach(m => {
    dateMap[m.milestone_type] = {
      target: m.target_date,
      actual: m.actual_date,
      completed: m.completed_manually
    };
  });

  // Color function matching CircularProgressGauge.js EXACTLY
  // From src/components/CircularProgressGauge.js getColor():
  // - 0%: slate gray (no visible progress arc)
  // - 1-49%: red to yellow gradient
  // - 50-100%: yellow to olive (#94AF32) gradient
  const getGaugeColor = (pct) => {
    if (pct === 0) return '#3f3f46'; // Same as background - shows no arc
    if (pct < 50) {
      // Red to Yellow (1-49%)
      const ratio = pct / 50;
      const r = 239;
      const g = Math.round(68 + (245 - 68) * ratio);
      const b = Math.round(68 + (11 - 68) * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Yellow to Olive (50-100%)
      // End color: #94AF32 = rgb(148, 175, 50)
      const ratio = (pct - 50) / 50;
      const r = Math.round(245 - (245 - 148) * ratio);
      const g = Math.round(245 - (245 - 175) * ratio);
      const b = Math.round(11 + (50 - 11) * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const priorityColor = {
    urgent: '#EF4444',
    high: '#F97316',
    medium: '#3B82F6',
    low: '#94AF32'
  };

  const statusColor = {
    open: '#F59E0B',
    'in progress': '#3B82F6',
    blocked: '#EF4444',
    resolved: '#94AF32'
  };

  // Phase data for the 3 main progress gauges
  const phases = [
    {
      name: 'Prewire',
      percentage: milestones.prewire_phase?.percentage || milestones.prewirePhase || 0,
      subItems: [
        { label: 'Prewire Orders', percentage: milestones.prewire_orders?.percentage || milestones.prewireOrders?.percentage || 0, ordered: milestones.prewire_orders?.ordered || milestones.prewireOrders?.partsAccountedFor, total: milestones.prewire_orders?.total || milestones.prewireOrders?.totalParts },
        { label: 'Prewire Receiving', percentage: milestones.prewire_receiving?.percentage || milestones.prewireReceiving?.percentage || 0, received: milestones.prewire_receiving?.received || milestones.prewireReceiving?.partsReceived, total: milestones.prewire_receiving?.total || milestones.prewireReceiving?.totalParts },
        { label: 'Prewire Stages', percentage: milestones.prewire || milestones.prewireStages?.percentage || 0, completed: milestones.prewireStages?.completed, total: milestones.prewireStages?.total }
      ]
    },
    {
      name: 'Trim',
      percentage: milestones.trim_phase?.percentage || milestones.trimPhase || 0,
      subItems: [
        { label: 'Trim Orders', percentage: milestones.trim_orders?.percentage || milestones.trimOrders?.percentage || 0, ordered: milestones.trim_orders?.ordered || milestones.trimOrders?.partsAccountedFor, total: milestones.trim_orders?.total || milestones.trimOrders?.totalParts },
        { label: 'Trim Receiving', percentage: milestones.trim_receiving?.percentage || milestones.trimReceiving?.percentage || 0, received: milestones.trim_receiving?.received || milestones.trimReceiving?.partsReceived, total: milestones.trim_receiving?.total || milestones.trimReceiving?.totalParts },
        { label: 'Trim Stages', percentage: milestones.trim || milestones.trimStages?.percentage || 0, completed: milestones.trimStages?.completed, total: milestones.trimStages?.total }
      ]
    },
    {
      name: 'Commission',
      percentage: milestones.commissioning?.percentage || 0,
      subItems: null,
      itemCount: milestones.commissioning || { completed: 0, total: 0 }
    }
  ];

  // Phase Milestones table - matches PMProjectView exactly
  // Colors match the PM View milestone table
  const phaseMilestones = [
    { type: 'planning_design', label: 'Planning & Design', color: '#8b5cf6' },
    { type: 'prewire_prep', label: 'Prewire Prep', color: '#06b6d4' },
    { type: 'prewire', label: 'Prewire', color: '#8b5cf6' },
    { type: 'rough_in_inspection', label: 'Rough-In Inspection', color: '#ec4899' },
    { type: 'trim_prep', label: 'Trim Prep', color: '#f59e0b' },
    { type: 'trim', label: 'Trim', color: '#f59e0b' },
    { type: 'final_inspection', label: 'Final Inspection', color: '#ec4899' },
    { type: 'commissioning', label: 'Commissioning', color: '#3b82f6' },
    { type: 'handoff_training', label: 'Handoff / Training', color: '#94AF32' }
  ];

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Update - ${project.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #18181b; color: #fafafa; }
    .container { max-width: 800px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 32px; padding-bottom: 24px; }
    .header h1 { color: #fafafa; margin: 0 0 8px 0; font-size: 28px; }
    .header p { color: #a1a1aa; margin: 0; font-size: 14px; }

    .card { background: #27272a; border-radius: 16px; padding: 24px; margin-bottom: 24px; }
    .card-header { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
    .card-header h2 { margin: 0; font-size: 16px; font-weight: 500; color: #fafafa; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #8B5CF6; }

    /* Phase Progress Section - matches PM View layout */
    .progress-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 24px; }
    .phase-column { text-align: center; }
    .phase-title { font-size: 12px; font-weight: 600; color: #fafafa; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    .gauge-circle { width: 120px; height: 120px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 28px; font-weight: 700; position: relative; margin: 0 auto; }
    .gauge-circle::before { content: ''; position: absolute; inset: 6px; border-radius: 50%; background: #27272a; }
    .gauge-value { position: relative; z-index: 1; color: #fafafa; }
    .gauge-count { font-size: 11px; color: #71717a; margin-top: 8px; }

    .sub-items { margin-top: 16px; padding: 0 8px; }
    .sub-item { display: flex; align-items: center; margin-bottom: 10px; }
    .sub-label { font-size: 12px; color: #a1a1aa; min-width: 100px; text-align: left; }
    .sub-bar { flex: 1; height: 6px; background: #3f3f46; border-radius: 3px; overflow: hidden; margin: 0 8px; }
    .sub-fill { height: 100%; border-radius: 3px; }
    .sub-pct { font-size: 12px; color: #d4d4d8; min-width: 40px; text-align: right; font-weight: 500; }

    /* Schedule Table */
    .schedule-table { width: 100%; border-collapse: collapse; }
    .schedule-table th { text-align: left; padding: 8px 12px; font-size: 12px; font-weight: 500; color: #a1a1aa; border-bottom: 1px solid #3f3f46; }
    .schedule-table td { padding: 12px; font-size: 13px; color: #d4d4d8; border-bottom: 1px solid #3f3f46; }
    .schedule-table .phase-cell { display: flex; align-items: center; gap: 8px; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; }
    .status-dot.red { background: #EF4444; }
    .status-dot.amber { background: #F59E0B; }
    .status-dot.green { background: #94AF32; }
    .status-dot.violet { background: #8B5CF6; }
    .date-actual { color: #94AF32; }
    .date-target { color: #a1a1aa; text-decoration: line-through; }

    /* Issues */
    .issue { padding: 16px; border: 1px solid #3f3f46; border-radius: 12px; margin-bottom: 12px; }
    .issue-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .issue-title { font-weight: 600; color: #fafafa; margin: 0; font-size: 14px; }
    .badge { padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: 500; text-transform: uppercase; }
    .issue-meta { font-size: 12px; color: #71717a; margin-top: 8px; }
    .issue-description { font-size: 13px; color: #a1a1aa; margin: 8px 0 0 0; }
    .blocked-banner { background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #fca5a5; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; }

    .todo { padding: 12px 16px; border-left: 3px solid #8B5CF6; background: #3f3f46; margin-bottom: 8px; border-radius: 0 8px 8px 0; }
    .todo-title { font-weight: 500; margin: 0; color: #fafafa; font-size: 13px; }
    .todo-due { font-size: 12px; color: #a1a1aa; margin-top: 4px; }

    .footer { text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #3f3f46; color: #71717a; font-size: 12px; }

    @media (max-width: 600px) {
      .phase-row { flex-direction: column; }
      .schedule-table { font-size: 11px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${project.name}</h1>
      <p>Weekly Progress Report - ${formatDate(new Date().toISOString())}</p>
      ${project.address ? `<p style="margin-top: 8px;">${project.address}</p>` : ''}
    </div>

    <div class="card">
      <div class="card-header">
        <span class="dot"></span>
        <h2>Project Progress</h2>
      </div>

      <!-- Three gauges side by side with title above each -->
      <div class="progress-grid">
        ${phases.map(phase => `
          <div class="phase-column">
            <div class="phase-title">${phase.name}</div>
            <div class="gauge-circle" style="background: conic-gradient(${getGaugeColor(phase.percentage)} ${phase.percentage * 3.6}deg, #3f3f46 0deg);">
              <span class="gauge-value">${Math.round(phase.percentage)}%</span>
            </div>
            ${phase.itemCount ? `<div class="gauge-count">${phase.itemCount.completed || 0} of ${phase.itemCount.total || 0}</div>` : ''}
            ${phase.subItems ? `
              <div class="sub-items">
                ${phase.subItems.map(sub => `
                  <div class="sub-item">
                    <span class="sub-label">${sub.label.replace('Prewire ', '').replace('Trim ', '')}</span>
                    <div class="sub-bar">
                      <div class="sub-fill" style="width: ${sub.percentage || 0}%; background: ${getGaugeColor(sub.percentage || 0)};"></div>
                    </div>
                    <span class="sub-pct">${Math.round(sub.percentage || 0)}%</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="dot"></span>
        <h2>Phase Milestones</h2>
      </div>
      <table class="schedule-table">
        <thead>
          <tr>
            <th>Phase</th>
            <th>Target Date</th>
            <th>Actual Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${phaseMilestones.map(({ type, label, color }) => {
            const milestone = dateMap[type] || {};
            const hasTarget = !!milestone.target;
            const hasActual = !!milestone.actual;
            const isComplete = milestone.completed === true;

            // Status: Completed (green) > Has actual date (green) > Has target (amber) > Not set (gray)
            let statusText = '—';
            let dotColor = '#71717a'; // gray

            if (isComplete) {
              statusText = 'Completed';
              dotColor = '#94AF32'; // olive green
            } else if (hasActual) {
              statusText = 'Done';
              dotColor = '#94AF32';
            } else if (hasTarget) {
              statusText = 'Scheduled';
              dotColor = '#F59E0B'; // amber
            }

            return `
              <tr>
                <td>
                  <div class="phase-cell">
                    <span class="status-dot" style="background: ${color};"></span>
                    ${label}
                  </div>
                </td>
                <td>${hasActual && hasTarget ? `<span class="date-target">${formatDate(milestone.target)}</span>` : formatDate(milestone.target)}</td>
                <td>${hasActual ? `<span class="date-actual">${formatDate(milestone.actual)}</span>` : '—'}</td>
                <td><span style="color: ${dotColor};">${statusText}</span></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    ${blockedIssues.length > 0 ? `
    <div class="card">
      <div class="card-header">
        <span class="dot" style="background: #EF4444;"></span>
        <h2>Blocked Items (${blockedIssues.length})</h2>
      </div>
      <div class="blocked-banner">
        <strong>Attention Required:</strong> The following items are blocked and require action to proceed.
      </div>
      ${blockedIssues.map(issue => {
        const portalUrl = issuePortalLinks[issue.id];
        return `
        <div class="issue" style="border-left: 4px solid #EF4444;">
          <div class="issue-header">
            ${portalUrl
              ? `<a href="${portalUrl}" class="issue-title" style="color: #fafafa; text-decoration: none;">${issue.title}</a>`
              : `<h4 class="issue-title">${issue.title}</h4>`
            }
            <span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5;">BLOCKED</span>
          </div>
          ${issue.description ? `<p class="issue-description">${issue.description}</p>` : ''}
          <div class="issue-meta">
            Created: ${formatDate(issue.created_at)}
            ${portalUrl ? `<a href="${portalUrl}" style="color: #8B5CF6; margin-left: 12px;">View Details →</a>` : ''}
          </div>
        </div>
      `}).join('')}
    </div>
    ` : ''}

    ${externalIssues.filter(i => (i.status || '').toLowerCase() !== 'blocked').length > 0 ? `
    <div class="card">
      <div class="card-header">
        <span class="dot" style="background: #F59E0B;"></span>
        <h2>Issues (${externalIssues.filter(i => (i.status || '').toLowerCase() !== 'blocked').length})</h2>
      </div>
      ${externalIssues.filter(i => (i.status || '').toLowerCase() !== 'blocked').map(issue => {
        const portalUrl = issuePortalLinks[issue.id];
        return `
        <div class="issue">
          <div class="issue-header">
            ${portalUrl
              ? `<a href="${portalUrl}" class="issue-title" style="color: #fafafa; text-decoration: none; font-weight: 600;">${issue.title}</a>`
              : `<h4 class="issue-title">${issue.title}</h4>`
            }
            <span class="badge" style="background: ${(statusColor[(issue.status || '').toLowerCase()] || '#71717a') + '33'}; color: ${statusColor[(issue.status || '').toLowerCase()] || '#a1a1aa'}">
              ${issue.status || 'Open'}
            </span>
          </div>
          ${issue.description ? `<p class="issue-description">${issue.description}</p>` : ''}
          <div class="issue-meta">
            Priority: <span style="color: ${priorityColor[issue.priority] || '#71717a'}">${issue.priority || 'Medium'}</span>
            - Created: ${formatDate(issue.created_at)}
            ${portalUrl ? `<a href="${portalUrl}" style="color: #8B5CF6; margin-left: 12px;">View Details →</a>` : ''}
          </div>
        </div>
      `}).join('')}
    </div>
    ` : ''}

    ${includeTodos && todos.length > 0 ? `
    <div class="card">
      <div class="card-header">
        <span class="dot"></span>
        <h2>Upcoming Tasks (${todos.length})</h2>
      </div>
      ${todos.slice(0, 10).map(todo => `
        <div class="todo">
          <p class="todo-title">${todo.title}</p>
          ${todo.due_by ? `<p class="todo-due">Due: ${formatDate(todo.due_by)}</p>` : ''}
        </div>
      `).join('')}
      ${todos.length > 10 ? `<p style="color: #71717a; font-size: 12px;">+ ${todos.length - 10} more tasks</p>` : ''}
    </div>
    ` : ''}

    <div class="footer">
      <p>Generated by Unicorn Project Management - Intelligent Systems</p>
    </div>
  </div>
</body>
</html>
  `;
}
