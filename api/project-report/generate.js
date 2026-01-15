/**
 * Generate Project Progress Report
 * Creates HTML email with gauges and issues for external stakeholders
 *
 * Updated 2026-01-15: Now calculates milestone percentages in real-time
 * (matching milestoneService.js logic) instead of reading from database
 * Issues link to external portal for external stakeholders
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const { systemSendMail } = require('../_systemGraph');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const APP_BASE_URL = process.env.APP_BASE_URL || process.env.PUBLIC_SITE_URL || 'https://unicorn-one.vercel.app';

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

    // Calculate milestone percentages (matching milestoneService.js logic)
    const milestones = await calculateAllMilestones(projectId, project);

    // Fetch milestone dates from project_milestones table
    const { data: milestoneDates } = await supabase
      .from('project_milestones')
      .select('milestone_type, target_date, actual_date, completed_manually')
      .eq('project_id', projectId);

    // Fetch issues for this project
    const { data: issues, error: issuesError } = await supabase
      .from('issues')
      .select('*')
      .eq('project_id', projectId)
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
      const { data: todoData } = await supabase
        .from('todos')
        .select('*')
        .eq('project_id', projectId)
        .eq('completed', false)
        .order('due_by', { ascending: true });
      todos = todoData || [];
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

/**
 * Calculate all milestone percentages (matches milestoneService.js logic)
 */
async function calculateAllMilestones(projectId, project) {
  // Calculate Planning & Design
  const planningDesign = calculatePlanningDesign(project);

  // Calculate Prewire metrics
  const prewireOrders = await calculatePrewireOrders(projectId);
  const prewireReceiving = await calculatePrewireReceiving(projectId);
  const prewireStages = await calculatePrewireStages(projectId);

  // Calculate Prewire Phase rollup (25% orders + 25% receiving + 50% stages)
  const prewirePhase = Math.round(
    prewireOrders.percentage * 0.25 +
    prewireReceiving.percentage * 0.25 +
    prewireStages.percentage * 0.50
  );

  // Calculate Trim metrics
  const trimOrders = await calculateTrimOrders(projectId);
  const trimReceiving = await calculateTrimReceiving(projectId);
  const trimStages = await calculateTrimStages(projectId);

  // Calculate Trim Phase rollup (25% orders + 25% receiving + 50% stages)
  const trimPhase = Math.round(
    trimOrders.percentage * 0.25 +
    trimReceiving.percentage * 0.25 +
    trimStages.percentage * 0.50
  );

  // Calculate Commissioning
  const commissioning = await calculateCommissioning(projectId);

  return {
    planningDesign,
    prewireOrders,
    prewireReceiving,
    prewireStages,
    prewirePhase,
    trimOrders,
    trimReceiving,
    trimStages,
    trimPhase,
    commissioning
  };
}

/**
 * Planning & Design: 100% when both URLs exist, 50% for one
 */
function calculatePlanningDesign(project) {
  const hasLucid = Boolean(project?.wiring_diagram_url);
  const hasProposal = Boolean(project?.portal_proposal_url);

  if (hasLucid && hasProposal) return { percentage: 100 };
  if (hasLucid || hasProposal) return { percentage: 50 };
  return { percentage: 0 };
}

/**
 * Prewire Orders: % of prewire parts with submitted POs
 */
async function calculatePrewireOrders(projectId) {
  try {
    // Get equipment with global_part data
    const { data: equipment } = await supabase
      .from('project_equipment')
      .select(`
        id,
        planned_quantity,
        global_part:global_part_id (required_for_prewire)
      `)
      .eq('project_id', projectId)
      .neq('equipment_type', 'Labor');

    // Get submitted prewire POs
    const { data: pos } = await supabase
      .from('purchase_orders')
      .select(`
        id,
        status,
        items:purchase_order_items(project_equipment_id, quantity_ordered)
      `)
      .eq('project_id', projectId)
      .eq('milestone_stage', 'prewire_prep');

    // Map submitted PO quantities
    const submittedPOMap = new Map();
    (pos || []).forEach(po => {
      if (['submitted', 'confirmed', 'partially_received', 'received'].includes(po.status)) {
        (po.items || []).forEach(item => {
          const existing = submittedPOMap.get(item.project_equipment_id) || 0;
          submittedPOMap.set(item.project_equipment_id, existing + (item.quantity_ordered || 0));
        });
      }
    });

    // Filter to prewire items
    const prewireItems = (equipment || []).filter(item =>
      item.global_part?.required_for_prewire === true
    );

    if (prewireItems.length === 0) {
      return { percentage: 0, ordered: 0, total: 0 };
    }

    let totalParts = 0;
    let orderedParts = 0;

    prewireItems.forEach(item => {
      const required = item.planned_quantity || 0;
      const ordered = submittedPOMap.get(item.id) || 0;
      totalParts += required;
      orderedParts += Math.min(required, ordered);
    });

    const percentage = totalParts > 0 ? Math.round((orderedParts / totalParts) * 100) : 0;
    return { percentage, ordered: orderedParts, total: totalParts };
  } catch (error) {
    console.error('Error calculating prewire orders:', error);
    return { percentage: 0, ordered: 0, total: 0 };
  }
}

/**
 * Prewire Receiving: % of prewire parts fully received
 */
async function calculatePrewireReceiving(projectId) {
  try {
    const { data: equipment } = await supabase
      .from('project_equipment')
      .select(`
        id,
        planned_quantity,
        received_quantity,
        global_part:global_part_id (required_for_prewire)
      `)
      .eq('project_id', projectId)
      .neq('equipment_type', 'Labor');

    const prewireItems = (equipment || []).filter(item =>
      item.global_part?.required_for_prewire === true &&
      (item.planned_quantity || 0) > 0
    );

    if (prewireItems.length === 0) {
      return { percentage: 0, received: 0, total: 0 };
    }

    let totalParts = 0;
    let receivedParts = 0;

    prewireItems.forEach(item => {
      const required = item.planned_quantity || 0;
      const received = item.received_quantity || 0;
      totalParts += required;
      receivedParts += Math.min(required, received);
    });

    const percentage = totalParts > 0 ? Math.round((receivedParts / totalParts) * 100) : 0;
    return { percentage, received: receivedParts, total: totalParts };
  } catch (error) {
    console.error('Error calculating prewire receiving:', error);
    return { percentage: 0, received: 0, total: 0 };
  }
}

/**
 * Prewire Stages: % of wire drops with prewire photo
 */
async function calculatePrewireStages(projectId) {
  try {
    const { data: wireDrops } = await supabase
      .from('wire_drops')
      .select('id')
      .eq('project_id', projectId);

    const { data: stages } = await supabase
      .from('wire_drop_stages')
      .select('wire_drop_id, photo_url')
      .eq('stage_type', 'prewire')
      .in('wire_drop_id', (wireDrops || []).map(w => w.id));

    const total = wireDrops?.length || 0;
    const completed = (stages || []).filter(s => s.photo_url).length;

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { percentage, completed, total };
  } catch (error) {
    console.error('Error calculating prewire stages:', error);
    return { percentage: 0, completed: 0, total: 0 };
  }
}

/**
 * Trim Orders: % of trim parts with submitted POs
 */
async function calculateTrimOrders(projectId) {
  try {
    const { data: equipment } = await supabase
      .from('project_equipment')
      .select(`
        id,
        planned_quantity,
        global_part:global_part_id (required_for_prewire)
      `)
      .eq('project_id', projectId)
      .neq('equipment_type', 'Labor');

    const { data: pos } = await supabase
      .from('purchase_orders')
      .select(`
        id,
        status,
        items:purchase_order_items(project_equipment_id, quantity_ordered)
      `)
      .eq('project_id', projectId)
      .eq('milestone_stage', 'trim_prep');

    const submittedPOMap = new Map();
    (pos || []).forEach(po => {
      if (['submitted', 'confirmed', 'partially_received', 'received'].includes(po.status)) {
        (po.items || []).forEach(item => {
          const existing = submittedPOMap.get(item.project_equipment_id) || 0;
          submittedPOMap.set(item.project_equipment_id, existing + (item.quantity_ordered || 0));
        });
      }
    });

    // Trim items: required_for_prewire !== true
    const trimItems = (equipment || []).filter(item =>
      item.global_part?.required_for_prewire !== true
    );

    if (trimItems.length === 0) {
      return { percentage: 0, ordered: 0, total: 0 };
    }

    let totalParts = 0;
    let orderedParts = 0;

    trimItems.forEach(item => {
      const required = item.planned_quantity || 0;
      const ordered = submittedPOMap.get(item.id) || 0;
      totalParts += required;
      orderedParts += Math.min(required, ordered);
    });

    const percentage = totalParts > 0 ? Math.round((orderedParts / totalParts) * 100) : 0;
    return { percentage, ordered: orderedParts, total: totalParts };
  } catch (error) {
    console.error('Error calculating trim orders:', error);
    return { percentage: 0, ordered: 0, total: 0 };
  }
}

/**
 * Trim Receiving: % of trim parts fully received
 */
async function calculateTrimReceiving(projectId) {
  try {
    const { data: equipment } = await supabase
      .from('project_equipment')
      .select(`
        id,
        planned_quantity,
        received_quantity,
        global_part:global_part_id (required_for_prewire)
      `)
      .eq('project_id', projectId)
      .neq('equipment_type', 'Labor');

    const trimItems = (equipment || []).filter(item =>
      item.global_part?.required_for_prewire !== true &&
      (item.planned_quantity || 0) > 0
    );

    if (trimItems.length === 0) {
      return { percentage: 0, received: 0, total: 0 };
    }

    let totalParts = 0;
    let receivedParts = 0;

    trimItems.forEach(item => {
      const required = item.planned_quantity || 0;
      const received = item.received_quantity || 0;
      totalParts += required;
      receivedParts += Math.min(required, received);
    });

    const percentage = totalParts > 0 ? Math.round((receivedParts / totalParts) * 100) : 0;
    return { percentage, received: receivedParts, total: totalParts };
  } catch (error) {
    console.error('Error calculating trim receiving:', error);
    return { percentage: 0, received: 0, total: 0 };
  }
}

/**
 * Trim Stages: % of wire drops with trim_out completed (equipment installed)
 */
async function calculateTrimStages(projectId) {
  try {
    const { data: wireDrops } = await supabase
      .from('wire_drops')
      .select('id, is_auxiliary')
      .eq('project_id', projectId);

    const { data: stages } = await supabase
      .from('wire_drop_stages')
      .select('wire_drop_id, completed')
      .eq('stage_type', 'trim_out')
      .in('wire_drop_id', (wireDrops || []).map(w => w.id));

    // Auxiliary drops auto-complete, so count them as completed
    const completedStages = new Set(
      (stages || []).filter(s => s.completed).map(s => s.wire_drop_id)
    );
    const auxiliaryDrops = (wireDrops || []).filter(w => w.is_auxiliary).map(w => w.id);
    auxiliaryDrops.forEach(id => completedStages.add(id));

    const total = wireDrops?.length || 0;
    const completed = completedStages.size;

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { percentage, completed, total };
  } catch (error) {
    console.error('Error calculating trim stages:', error);
    return { percentage: 0, completed: 0, total: 0 };
  }
}

/**
 * Commissioning: % of wire drops with commissioning complete
 */
async function calculateCommissioning(projectId) {
  try {
    const { data: wireDrops } = await supabase
      .from('wire_drops')
      .select('id')
      .eq('project_id', projectId);

    const { data: stages } = await supabase
      .from('wire_drop_stages')
      .select('wire_drop_id, completed')
      .eq('stage_type', 'commission')
      .in('wire_drop_id', (wireDrops || []).map(w => w.id));

    const total = wireDrops?.length || 0;
    const completed = (stages || []).filter(s => s.completed).length;

    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { percentage, completed, total };
  } catch (error) {
    console.error('Error calculating commissioning:', error);
    return { percentage: 0, completed: 0, total: 0 };
  }
}

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

  // Color function matching CircularProgressGauge.js exactly
  // Uses gradient transitions: red (0%) -> yellow (50%) -> olive (100%)
  // At 100%: uses violet (#8B5CF6) to indicate completion
  const getGaugeColor = (pct) => {
    if (pct === 100) return '#8B5CF6'; // Violet for complete
    if (pct === 0) return '#64748B';   // Slate gray for 0%
    if (pct < 50) {
      // Red to Yellow (0-50%)
      const ratio = pct / 50;
      const r = 239;
      const g = Math.round(68 + (245 - 68) * ratio);
      const b = Math.round(68 + (11 - 68) * ratio);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Yellow to Brand Success Olive (50-100%)
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

  // Phase data matching screenshot layout
  const phases = [
    {
      name: 'Prewire Phase',
      percentage: milestones.prewirePhase,
      subItems: [
        { label: 'Prewire Orders', ...milestones.prewireOrders },
        { label: 'Prewire Receiving', ...milestones.prewireReceiving },
        { label: 'Prewire Stages', ...milestones.prewireStages }
      ]
    },
    {
      name: 'Trim Phase',
      percentage: milestones.trimPhase,
      subItems: [
        { label: 'Trim Orders', ...milestones.trimOrders },
        { label: 'Trim Receiving', ...milestones.trimReceiving },
        { label: 'Trim Stages', ...milestones.trimStages }
      ]
    },
    {
      name: 'Commissioning',
      percentage: milestones.commissioning.percentage,
      subItems: null,
      itemCount: milestones.commissioning
    }
  ];

  // Schedule rows matching the screenshot
  const scheduleRows = [
    { phase: 'Planning & Design', type: 'planning_design', percentage: milestones.planningDesign.percentage },
    { phase: 'Prewire Prep', type: 'prewire_prep', percentage: null },
    { phase: 'Prewire', type: 'prewire', percentage: milestones.prewireStages.percentage },
    { phase: 'Rough-In Inspection', type: 'rough_in_inspection', percentage: null },
    { phase: 'Trim Prep', type: 'trim_prep', percentage: null },
    { phase: 'Trim', type: 'trim', percentage: milestones.trimStages.percentage },
    { phase: 'Final Inspection', type: 'final_inspection', percentage: null },
    { phase: 'Commissioning', type: 'commissioning', percentage: milestones.commissioning.percentage },
    { phase: 'Handoff / Training', type: 'handoff_training', percentage: null }
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

    /* Phase Progress Section */
    .phase-section { margin-bottom: 24px; }
    .phase-row { display: flex; align-items: flex-start; gap: 24px; margin-bottom: 24px; }
    .phase-gauge { text-align: center; }
    .phase-label { font-size: 12px; color: #a1a1aa; margin-bottom: 8px; }
    .gauge-circle { width: 80px; height: 80px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; position: relative; }
    .gauge-circle::before { content: ''; position: absolute; inset: 4px; border-radius: 50%; background: #27272a; }
    .gauge-value { position: relative; z-index: 1; }

    .sub-items { flex: 1; }
    .sub-item { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .sub-label { font-size: 13px; color: #d4d4d8; }
    .sub-bar { flex: 1; margin: 0 16px; height: 8px; background: #3f3f46; border-radius: 4px; overflow: hidden; }
    .sub-fill { height: 100%; border-radius: 4px; }
    .sub-count { font-size: 13px; color: #a1a1aa; min-width: 60px; text-align: right; }

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

      ${phases.map(phase => `
        <div class="phase-section">
          <div class="phase-row">
            <div class="phase-gauge">
              <div class="phase-label">${phase.name}</div>
              <div class="gauge-circle" style="background: conic-gradient(${getGaugeColor(phase.percentage)} ${phase.percentage * 3.6}deg, #3f3f46 0deg);">
                <span class="gauge-value">${Math.round(phase.percentage)}%</span>
              </div>
              ${phase.itemCount ? `<div style="font-size: 11px; color: #71717a; margin-top: 4px;">${phase.itemCount.completed || 0} of ${phase.itemCount.total || 0}</div>` : ''}
            </div>
            ${phase.subItems ? `
              <div class="sub-items">
                ${phase.subItems.map(sub => `
                  <div class="sub-item">
                    <span class="sub-label">${sub.label}</span>
                    <div class="sub-bar">
                      <div class="sub-fill" style="width: ${sub.percentage}%; background: ${getGaugeColor(sub.percentage)};"></div>
                    </div>
                    <span class="sub-count">${sub.ordered !== undefined ? `${sub.ordered} of ${sub.total}` : sub.received !== undefined ? `${sub.received} of ${sub.total}` : `${sub.completed || 0} of ${sub.total || 0}`}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}
          </div>
        </div>
      `).join('')}
    </div>

    <div class="card">
      <div class="card-header">
        <span class="dot"></span>
        <h2>Project Schedule</h2>
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
          ${scheduleRows.map(row => {
            const dates = dateMap[row.type] || {};
            const isComplete = dates.completed || (row.percentage === 100);
            let dotClass = 'red';
            if (isComplete) dotClass = 'violet';
            else if (row.percentage >= 50) dotClass = 'green';
            else if (row.percentage > 0) dotClass = 'amber';

            let statusText = 'Not set';
            if (isComplete) statusText = 'Completed';
            else if (row.percentage > 0) statusText = `${row.percentage}%`;

            return `
              <tr>
                <td>
                  <div class="phase-cell">
                    <span class="status-dot ${dotClass}"></span>
                    ${row.phase}
                  </div>
                </td>
                <td>${dates.actual ? `<span class="date-target">${formatDate(dates.target)}</span>` : formatDate(dates.target)}</td>
                <td>${dates.actual ? `<span class="date-actual">${formatDate(dates.actual)}</span>` : '—'}</td>
                <td>${statusText}</td>
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
