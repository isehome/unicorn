/**
 * Report Service
 * Generates comprehensive project reports for email distribution
 */

import { supabase } from '../lib/supabase';
import { milestoneService } from './milestoneService';

/**
 * Fetch comprehensive project status data
 * @param {string} projectId - Project UUID
 * @returns {Promise<Object>} Full project status data
 */
export const generateFullProjectReport = async (projectId) => {
  if (!projectId || !supabase) {
    throw new Error('Project ID and Supabase connection required');
  }

  // Fetch all data in parallel for efficiency
  const [
    projectResult,
    milestonesResult,
    wireDropsResult,
    equipmentResult,
    issuesResult,
    permitsResult
  ] = await Promise.all([
    // Project details
    supabase
      .from('projects')
      .select('id, project_number, name, address, address_line1, address_line2, city, state, zip, status, phase, created_at')
      .eq('id', projectId)
      .single(),
    // Milestones
    supabase
      .from('project_milestones')
      .select('milestone_type, target_date, actual_date, completed_manually')
      .eq('project_id', projectId)
      .order('milestone_type'),
    // Wire drops
    supabase
      .from('wire_drops')
      .select('id, label, location, floor, room, prewire_complete, trim_out, status')
      .eq('project_id', projectId),
    // Equipment
    supabase
      .from('project_equipment')
      .select('id, part_id, quantity, installed, delivered_confirmed, parts(name, part_number)')
      .eq('project_id', projectId),
    // Issues (all, not just open)
    supabase
      .from('issues')
      .select('id, title, description, status, priority, created_at, updated_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    // Permits
    supabase
      .from('project_permits')
      .select('id, permit_type, status, scheduled_date, completed_date')
      .eq('project_id', projectId)
  ]);

  if (projectResult.error) throw projectResult.error;

  const project = projectResult.data;
  const milestones = milestonesResult.data || [];
  const wireDrops = wireDropsResult.data || [];
  const equipment = equipmentResult.data || [];
  const issues = issuesResult.data || [];
  const permits = permitsResult.data || [];

  // Calculate wire drop progress
  const wireDropProgress = calculateWireDropProgress(wireDrops);

  // Calculate equipment status
  const equipmentStatus = calculateEquipmentStatus(equipment);

  // Get calculated percentages from milestone service (single source of truth)
  const calculatedPercentages = await milestoneService.getAllPercentagesOptimized(projectId);

  // Calculate milestone progress using calculated percentages as source of truth
  const milestoneProgress = calculateMilestoneProgress(milestones, calculatedPercentages);

  // Calculate issue stats
  const issueStats = calculateIssueStats(issues);

  // Calculate permit status
  const permitStatus = calculatePermitStatus(permits);

  // Build full address
  const fullAddress = buildFullAddress(project);

  return {
    project: {
      ...project,
      fullAddress
    },
    milestoneProgress,
    calculatedPercentages,  // Include for consumers that need the raw percentages
    wireDropProgress,
    equipmentStatus,
    issueStats,
    permitStatus,
    rawData: {
      milestones,
      wireDrops,
      equipment,
      issues,
      permits
    },
    generatedAt: new Date().toISOString()
  };
};

/**
 * Calculate wire drop progress metrics
 */
const calculateWireDropProgress = (wireDrops) => {
  const total = wireDrops.length;
  if (total === 0) {
    return { total: 0, prewireComplete: 0, trimComplete: 0, prewirePercent: 0, trimPercent: 0 };
  }

  const prewireComplete = wireDrops.filter(wd => wd.prewire_complete).length;
  const trimComplete = wireDrops.filter(wd => wd.trim_out).length;

  return {
    total,
    prewireComplete,
    trimComplete,
    prewirePercent: Math.round((prewireComplete / total) * 100),
    trimPercent: Math.round((trimComplete / total) * 100),
    byFloor: groupByFloor(wireDrops),
    byRoom: groupByRoom(wireDrops)
  };
};

/**
 * Group wire drops by floor
 */
const groupByFloor = (wireDrops) => {
  const floors = {};
  wireDrops.forEach(wd => {
    const floor = wd.floor || 'Unassigned';
    if (!floors[floor]) {
      floors[floor] = { total: 0, prewireComplete: 0, trimComplete: 0 };
    }
    floors[floor].total++;
    if (wd.prewire_complete) floors[floor].prewireComplete++;
    if (wd.trim_out) floors[floor].trimComplete++;
  });
  return floors;
};

/**
 * Group wire drops by room
 */
const groupByRoom = (wireDrops) => {
  const rooms = {};
  wireDrops.forEach(wd => {
    const room = wd.room || wd.location || 'Unassigned';
    if (!rooms[room]) {
      rooms[room] = { total: 0, prewireComplete: 0, trimComplete: 0 };
    }
    rooms[room].total++;
    if (wd.prewire_complete) rooms[room].prewireComplete++;
    if (wd.trim_out) rooms[room].trimComplete++;
  });
  return rooms;
};

/**
 * Calculate equipment status metrics
 */
const calculateEquipmentStatus = (equipment) => {
  const total = equipment.length;
  if (total === 0) {
    return { total: 0, delivered: 0, installed: 0, deliveredPercent: 0, installedPercent: 0 };
  }

  const delivered = equipment.filter(e => e.delivered_confirmed).length;
  const installed = equipment.filter(e => e.installed).length;

  return {
    total,
    delivered,
    installed,
    deliveredPercent: Math.round((delivered / total) * 100),
    installedPercent: Math.round((installed / total) * 100)
  };
};

/**
 * Calculate issue statistics
 */
const calculateIssueStats = (issues) => {
  const total = issues.length;
  const open = issues.filter(i => !['resolved', 'closed'].includes(i.status?.toLowerCase())).length;
  const blocked = issues.filter(i => i.status?.toLowerCase() === 'blocked').length;
  const resolved = issues.filter(i => ['resolved', 'closed'].includes(i.status?.toLowerCase())).length;

  return {
    total,
    open,
    blocked,
    resolved,
    openPercent: total > 0 ? Math.round((open / total) * 100) : 0
  };
};

/**
 * Calculate permit status
 */
const calculatePermitStatus = (permits) => {
  const total = permits.length;
  if (total === 0) {
    return { total: 0, completed: 0, scheduled: 0, pending: 0 };
  }

  const completed = permits.filter(p => p.status === 'completed' || p.completed_date).length;
  const scheduled = permits.filter(p => p.status === 'scheduled' && !p.completed_date).length;
  const pending = total - completed - scheduled;

  return {
    total,
    completed,
    scheduled,
    pending,
    completedPercent: Math.round((completed / total) * 100)
  };
};

/**
 * Build full address from components
 */
const buildFullAddress = (p) => {
  if (p?.address_line1 || p?.city || p?.state) {
    const streetAddress = [p.address_line1, p.address_line2].filter(Boolean).join(', ');
    const cityStateZip = [
      p.city,
      p.state ? (p.zip ? `${p.state} ${p.zip}` : p.state) : p.zip
    ].filter(Boolean).join(', ');
    return [streetAddress, cityStateZip].filter(Boolean).join(', ');
  }
  return p?.address || '';
};

/**
 * Fetch and categorize issues for a project, grouped by stakeholder
 * @param {string} projectId - Project UUID
 * @returns {Promise<Object>} Categorized issues data with stakeholder grouping
 */
export const generateIssueReport = async (projectId) => {
  if (!projectId || !supabase) {
    throw new Error('Project ID and Supabase connection required');
  }

  // Fetch all data in parallel
  const [
    projectResult,
    milestonesResult,
    issuesResult,
    projectStakeholdersResult,
    issueStakeholderTagsResult
  ] = await Promise.all([
    // Project details with address fields
    supabase
      .from('projects')
      .select('id, project_number, name, address, address_line1, address_line2, city, state, zip, status, phase')
      .eq('id', projectId)
      .single(),
    // Project milestones for status overview
    supabase
      .from('project_milestones')
      .select('milestone_type, target_date, actual_date, completed_manually')
      .eq('project_id', projectId)
      .order('milestone_type'),
    // All open issues
    supabase
      .from('issues')
      .select('id, title, description, status, priority, created_at, updated_at, notes')
      .eq('project_id', projectId)
      .neq('status', 'resolved')
      .neq('status', 'closed')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false }),
    // ALL project stakeholders (for filter dropdown - not just those with issues)
    supabase
      .from('project_stakeholders_detailed')
      .select('contact_id, contact_name, email, is_internal, role_name')
      .eq('project_id', projectId),
    // Issue stakeholder tags - join through project_stakeholders to contacts
    // Using proper foreign key relationships (not the view which may have issues)
    supabase
      .from('issue_stakeholder_tags')
      .select(`
        id,
        issue_id,
        tag_type,
        project_stakeholder_id,
        project_stakeholders!inner (
          id,
          contact_id,
          contacts!inner (
            id,
            full_name,
            email,
            is_internal
          ),
          stakeholder_roles!inner (
            name
          )
        )
      `)
  ]);

  if (projectResult.error) throw projectResult.error;

  const project = projectResult.data;
  const milestones = milestonesResult.data || [];
  const issues = issuesResult.data || [];
  const projectStakeholders = projectStakeholdersResult.data || [];

  // Debug: Log what we got from the database
  console.log('[ReportService] issues count:', issues.length);
  console.log('[ReportService] projectStakeholders:', projectStakeholders);
  console.log('[ReportService] issueStakeholderTagsResult:', issueStakeholderTagsResult);
  console.log('[ReportService] issueStakeholderTagsResult.data:', issueStakeholderTagsResult.data);
  console.log('[ReportService] issueStakeholderTagsResult.error:', issueStakeholderTagsResult.error);

  // Filter issue stakeholder tags to only those for this project's issues
  const issueIds = issues.map(i => i.id);
  console.log('[ReportService] issueIds:', issueIds);

  const allStakeholderTags = (issueStakeholderTagsResult.data || [])
    .filter(tag => issueIds.includes(tag.issue_id));

  console.log('[ReportService] allStakeholderTags after filtering:', allStakeholderTags);

  // Build stakeholder map from BOTH project stakeholders AND issue stakeholder tags
  const stakeholderMap = new Map(); // contact_id -> stakeholder info

  // First, add all project stakeholders (these appear in filter dropdown)
  projectStakeholders.forEach(s => {
    if (s.contact_id && !stakeholderMap.has(s.contact_id)) {
      stakeholderMap.set(s.contact_id, {
        id: s.contact_id,
        name: s.contact_name || 'Unknown',
        email: s.email || null,
        is_internal: s.is_internal,
        role: s.role_name || null
      });
    }
  });

  // Then add any stakeholders from issue tags that might not be project stakeholders
  const stakeholderIssuesMap = new Map(); // contact_id -> Set of issue_ids
  const issueStakeholdersMap = new Map(); // issue_id -> [stakeholders]

  allStakeholderTags.forEach(tag => {
    // Extract stakeholder data from nested join result
    // Structure: { issue_id, project_stakeholders: { contact_id, contacts: { full_name, ... }, stakeholder_roles: { name } } }
    const ps = tag.project_stakeholders;
    if (!ps) {
      console.warn('[ReportService] Tag missing project_stakeholders data:', tag);
      return;
    }

    const contact = ps.contacts;
    if (!contact) {
      console.warn('[ReportService] Tag missing contacts data:', tag);
      return;
    }

    const contactId = ps.contact_id || contact.id;
    if (!contactId) {
      console.warn('[ReportService] Tag missing contact_id:', tag);
      return;
    }

    const roleName = ps.stakeholder_roles?.name || null;

    // Track stakeholder info (add if not already from project stakeholders)
    if (!stakeholderMap.has(contactId)) {
      stakeholderMap.set(contactId, {
        id: contactId,
        name: contact.full_name || 'Unknown',
        email: contact.email || null,
        is_internal: contact.is_internal,
        role: roleName
      });
    }

    // Group issues by stakeholder
    if (!stakeholderIssuesMap.has(contactId)) {
      stakeholderIssuesMap.set(contactId, new Set());
    }
    stakeholderIssuesMap.get(contactId).add(tag.issue_id);

    // Track stakeholders per issue
    if (!issueStakeholdersMap.has(tag.issue_id)) {
      issueStakeholdersMap.set(tag.issue_id, []);
    }
    issueStakeholdersMap.get(tag.issue_id).push(stakeholderMap.get(contactId));
  });

  // Build stakeholder groups with their issues (only stakeholders that have issues)
  const stakeholderGroupsWithIssues = [];
  stakeholderMap.forEach((stakeholder, contactId) => {
    const issueIdsForStakeholder = stakeholderIssuesMap.get(contactId) || new Set();
    const stakeholderIssues = issues
      .filter(issue => issueIdsForStakeholder.has(issue.id))
      .map(issue => ({
        ...issue,
        isBlocked: (issue.status || '').toLowerCase() === 'blocked'
      }));

    if (stakeholderIssues.length > 0) {
      // Sort blocked to top
      stakeholderIssues.sort((a, b) => {
        if (a.isBlocked && !b.isBlocked) return -1;
        if (!a.isBlocked && b.isBlocked) return 1;
        return 0;
      });

      stakeholderGroupsWithIssues.push({
        stakeholder,
        issues: stakeholderIssues,
        blockedCount: stakeholderIssues.filter(i => i.isBlocked).length
      });
    }
  });

  // Sort stakeholder groups: external first, then by issue count
  stakeholderGroupsWithIssues.sort((a, b) => {
    // External stakeholders first
    if (a.stakeholder.is_internal !== b.stakeholder.is_internal) {
      return a.stakeholder.is_internal ? 1 : -1;
    }
    // Then by blocked count
    if (a.blockedCount !== b.blockedCount) {
      return b.blockedCount - a.blockedCount;
    }
    // Then by issue count
    return b.issues.length - a.issues.length;
  });

  // Build list of ALL stakeholders for filter dropdown (including those without issues)
  const allStakeholdersList = Array.from(stakeholderMap.values()).sort((a, b) => {
    // External first
    if (a.is_internal !== b.is_internal) return a.is_internal ? 1 : -1;
    // Then alphabetically
    return (a.name || '').localeCompare(b.name || '');
  });

  // Also categorize by internal/external for summary
  const internalIssues = [];
  const externalIssues = [];
  const blockedIssues = [];
  const unassignedIssues = [];

  issues.forEach(issue => {
    const isBlocked = (issue.status || '').toLowerCase() === 'blocked';
    const issueStakeholders = issueStakeholdersMap.get(issue.id) || [];
    const hasExternalStakeholder = issueStakeholders.some(s => s.is_internal === false);
    const hasAnyStakeholder = issueStakeholders.length > 0;

    const enrichedIssue = {
      ...issue,
      isBlocked,
      stakeholders: issueStakeholders
    };

    if (isBlocked) {
      blockedIssues.push(enrichedIssue);
    }

    if (!hasAnyStakeholder) {
      unassignedIssues.push(enrichedIssue);
    } else if (hasExternalStakeholder) {
      externalIssues.push(enrichedIssue);
    } else {
      internalIssues.push(enrichedIssue);
    }
  });

  // Calculate milestone progress
  const milestoneProgress = calculateMilestoneProgress(milestones);

  return {
    project: {
      ...project,
      fullAddress: buildFullAddress(project)
    },
    milestoneProgress,
    generatedAt: new Date().toISOString(),
    summary: {
      totalOpen: issues.length,
      internalCount: internalIssues.length,
      externalCount: externalIssues.length,
      blockedCount: blockedIssues.length,
      unassignedCount: unassignedIssues.length,
      stakeholderCount: stakeholderGroupsWithIssues.length,
      totalProjectStakeholders: allStakeholdersList.length
    },
    // All project stakeholders for filter dropdown
    allStakeholders: allStakeholdersList,
    // Only stakeholders that have issues (for display in issues tab)
    stakeholderGroups: stakeholderGroupsWithIssues,
    internalIssues,
    externalIssues,
    blockedIssues,
    unassignedIssues
  };
};

/**
 * Calculate milestone progress from milestone data
 *
 * IMPORTANT: Completion is determined by CALCULATED PERCENTAGES, not by actual_date fields.
 * The calculated percentage is the single source of truth for whether a phase is complete.
 * The actual_date field is only used to record WHEN something was completed, not to determine IF it's complete.
 *
 * @param {Array} milestones - Milestone records from project_milestones table
 * @param {Object} calculatedPercentages - Optional calculated percentages from milestoneService.getAllPercentagesOptimized()
 */
const calculateMilestoneProgress = (milestones, calculatedPercentages = null) => {
  const phaseOrder = [
    'planning_design',
    'prewire_prep',
    'prewire',
    'rough_in_inspection',
    'trim_prep',
    'trim',
    'final_inspection',
    'commissioning',
    'handoff_training'
  ];

  const phaseLabels = {
    planning_design: 'Planning & Design',
    prewire_prep: 'Prewire Prep',
    prewire: 'Prewire',
    rough_in_inspection: 'Rough-In Inspection',
    trim_prep: 'Trim Prep',
    trim: 'Trim',
    final_inspection: 'Final Inspection',
    commissioning: 'Commissioning',
    handoff_training: 'Handoff / Training'
  };

  // Map phase types to their percentage keys in calculatedPercentages
  // Phases with calculated gauges use percentage; others use manual flags
  const phaseToPercentageKey = {
    planning_design: 'planning_design',
    prewire_prep: 'prewire_prep',  // Combined orders + receiving
    prewire: 'prewire',  // Prewire stages percentage
    trim_prep: 'trim_prep',  // Combined orders + receiving
    trim: 'trim',  // Trim stages percentage
    commissioning: 'commissioning'  // Has percentage object
  };

  const milestoneMap = {};
  milestones.forEach(m => {
    milestoneMap[m.milestone_type] = m;
  });

  /**
   * Determine if a phase is complete.
   * SINGLE SOURCE OF TRUTH: Calculated percentage >= 100
   * For phases without calculated percentages (inspections, handoff), use manual completion flags.
   */
  const isPhaseComplete = (phase) => {
    const percentKey = phaseToPercentageKey[phase];

    // If we have calculated percentages and this phase has a gauge
    if (calculatedPercentages && percentKey) {
      const percentValue = calculatedPercentages[percentKey];

      // Handle object-style percentages (like commissioning: { percentage: 50 })
      if (percentValue && typeof percentValue === 'object' && 'percentage' in percentValue) {
        return percentValue.percentage >= 100;
      }

      // Handle direct number percentages
      if (typeof percentValue === 'number') {
        return percentValue >= 100;
      }
    }

    // For phases without calculated percentages (inspections, handoff_training),
    // fall back to manual completion flags
    const m = milestoneMap[phase];
    return !!(m?.actual_date || m?.completed_manually);
  };

  let completedCount = 0;
  let currentPhase = null;
  let nextPhase = null;

  phaseOrder.forEach((phase, idx) => {
    if (isPhaseComplete(phase)) {
      completedCount++;
    } else if (!currentPhase) {
      currentPhase = phase;
      if (idx < phaseOrder.length - 1) {
        nextPhase = phaseOrder[idx + 1];
      }
    }
  });

  const progressPercent = Math.round((completedCount / phaseOrder.length) * 100);

  return {
    completedCount,
    totalPhases: phaseOrder.length,
    progressPercent,
    currentPhase: currentPhase ? phaseLabels[currentPhase] : 'Complete',
    nextPhase: nextPhase ? phaseLabels[nextPhase] : null,
    milestones: phaseOrder.map(phase => ({
      type: phase,
      label: phaseLabels[phase],
      completed: isPhaseComplete(phase),
      targetDate: milestoneMap[phase]?.target_date,
      actualDate: milestoneMap[phase]?.actual_date
    }))
  };
};

/**
 * Generate email body for a specific stakeholder
 * @param {Object} reportData - Data from generateIssueReport
 * @param {Object} stakeholderGroup - Specific stakeholder group to generate email for
 * @param {string} format - 'html' or 'text'
 * @returns {string} Formatted email body
 */
export const generateStakeholderEmail = (reportData, stakeholderGroup, format = 'html') => {
  const { project, milestoneProgress, generatedAt } = reportData;
  const { stakeholder, issues } = stakeholderGroup;

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const projectTitle = project?.name || project?.project_number || 'Project';
  const projectAddress = project?.fullAddress || project?.address || '';
  const reportDate = formatDate(generatedAt);
  const blockedCount = issues.filter(i => i.isBlocked).length;

  // Get key milestones with dates (prewire, trim, commissioning)
  const keyMilestones = milestoneProgress?.milestones?.filter(m =>
    ['prewire', 'trim', 'commissioning'].includes(m.type)
  ) || [];

  if (format === 'text') {
    let text = `PROJECT STATUS UPDATE\n`;
    text += `${'='.repeat(50)}\n\n`;
    text += `Hi ${stakeholder.name},\n\n`;
    text += `Here's a status update for ${projectTitle}.\n\n`;

    text += `PROJECT OVERVIEW\n`;
    text += `${'-'.repeat(30)}\n`;
    text += `Project: ${projectTitle}\n`;
    if (projectAddress) text += `Address: ${projectAddress}\n`;
    text += `Current Phase: ${milestoneProgress?.currentPhase || 'N/A'}\n`;
    text += `Overall Progress: ${milestoneProgress?.progressPercent || 0}%\n\n`;

    // Add milestone dates
    if (keyMilestones.length > 0) {
      text += `KEY MILESTONES\n`;
      text += `${'-'.repeat(30)}\n`;
      keyMilestones.forEach(m => {
        const status = m.completed ? '[COMPLETE]' : (m.targetDate ? '[SCHEDULED]' : '[PENDING]');
        const dateStr = m.actualDate ? `Completed: ${formatDate(m.actualDate)}` :
                       (m.targetDate ? `Target: ${formatDate(m.targetDate)}` : 'Not scheduled');
        text += `${status} ${m.label}: ${dateStr}\n`;
      });
      text += `\n`;
    }

    text += `YOUR OPEN ISSUES (${issues.length})\n`;
    text += `${'-'.repeat(30)}\n`;
    if (blockedCount > 0) {
      text += `** ${blockedCount} BLOCKED - Requires your attention **\n\n`;
    }

    issues.forEach((issue, idx) => {
      const blockedFlag = issue.isBlocked ? '[BLOCKED] ' : '';
      text += `${idx + 1}. ${blockedFlag}${issue.title}\n`;
      if (issue.description) {
        text += `   ${issue.description.substring(0, 200)}${issue.description.length > 200 ? '...' : ''}\n`;
      }
      text += `   Status: ${(issue.status || 'open').toUpperCase()}\n\n`;
    });

    text += `\nPlease let us know if you have any questions.\n`;
    text += `\n${'-'.repeat(50)}\n`;
    text += `Generated on ${reportDate}\n`;
    return text;
  }

  // HTML format - Professional email template
  let html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">

  <!-- Header -->
  <div style="text-align: center; margin-bottom: 24px;">
    <div style="font-size: 11px; letter-spacing: 2px; color: #8b5cf6; text-transform: uppercase; margin-bottom: 4px;">Intelligent Systems</div>
    <h1 style="margin: 0; font-size: 20px; color: #1f2937;">Project Status Update</h1>
  </div>

  <p style="color: #4b5563; margin-bottom: 20px; font-size: 15px;">Hi ${stakeholder.name},</p>
  <p style="color: #374151; margin-bottom: 24px; font-size: 15px;">Here's your latest status update for <strong>${projectTitle}</strong>.</p>

  <!-- Project Overview Card -->
  <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); padding: 24px; border-radius: 16px; color: white; margin-bottom: 24px;">
    <h2 style="margin: 0 0 4px 0; font-size: 20px; font-weight: 600;">${projectTitle}</h2>
    ${projectAddress ? `<p style="margin: 0 0 16px 0; opacity: 0.9; font-size: 14px;">${projectAddress}</p>` : ''}

    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px;">
      <div>
        <div style="font-size: 11px; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px;">Current Phase</div>
        <div style="font-size: 18px; font-weight: 600; margin-top: 4px;">${milestoneProgress?.currentPhase || 'In Progress'}</div>
      </div>
      <div style="text-align: right;">
        <div style="font-size: 11px; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px;">Progress</div>
        <div style="font-size: 32px; font-weight: 700; margin-top: 4px;">${milestoneProgress?.progressPercent || 0}%</div>
      </div>
    </div>

    <div style="background: rgba(255,255,255,0.3); border-radius: 9999px; height: 8px; margin-top: 16px;">
      <div style="background: white; border-radius: 9999px; height: 8px; width: ${milestoneProgress?.progressPercent || 0}%;"></div>
    </div>
  </div>

  <!-- Milestone Timeline -->
  ${keyMilestones.length > 0 ? `
  <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #e5e7eb;">
    <h3 style="margin: 0 0 16px 0; font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px;">Key Milestones</h3>
    <div style="display: flex; justify-content: space-between; gap: 12px;">
      ${keyMilestones.map(m => {
        const bgColor = m.completed ? '#dcfce7' : (m.targetDate ? '#fef3c7' : '#f3f4f6');
        const textColor = m.completed ? '#166534' : (m.targetDate ? '#92400e' : '#6b7280');
        const dateDisplay = m.actualDate ? formatDate(m.actualDate) :
                           (m.targetDate ? formatDate(m.targetDate) : 'TBD');
        const statusLabel = m.completed ? 'Complete' : (m.targetDate ? 'Target' : 'Pending');
        return `
      <div style="flex: 1; text-align: center; padding: 12px; background: ${bgColor}; border-radius: 10px;">
        <div style="font-size: 12px; font-weight: 600; color: ${textColor}; margin-bottom: 4px;">${m.label}</div>
        <div style="font-size: 14px; color: ${textColor}; font-weight: 500;">${dateDisplay}</div>
        <div style="font-size: 10px; color: ${textColor}; opacity: 0.8; margin-top: 2px;">${statusLabel}</div>
      </div>`;
      }).join('')}
    </div>
  </div>` : ''}

  <!-- Issues Section -->
  <div style="background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; margin-bottom: 24px;">
    <div style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
      <h3 style="margin: 0; font-size: 16px; color: #1f2937;">Your Open Issues</h3>
      <div style="display: flex; gap: 8px;">
        <span style="background: #e0e7ff; color: #4f46e5; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 500;">${issues.length} total</span>
        ${blockedCount > 0 ? `<span style="background: #fee2e2; color: #dc2626; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 500;">${blockedCount} blocked</span>` : ''}
      </div>
    </div>`;

  if (blockedCount > 0) {
    html += `
    <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; margin: 0;">
      <strong style="color: #dc2626;">Action Required:</strong>
      <span style="color: #991b1b;"> ${blockedCount} issue${blockedCount > 1 ? 's are' : ' is'} blocked and needs your attention.</span>
    </div>`;
  }

  issues.forEach((issue, idx) => {
    const isLast = idx === issues.length - 1;
    const borderBottom = isLast ? '' : 'border-bottom: 1px solid #f3f4f6;';
    const bgColor = issue.isBlocked ? '#fef2f2' : '#fff';
    const statusColor = issue.isBlocked ? '#dc2626' :
                       (issue.status === 'in_progress' ? '#2563eb' : '#d97706');

    html += `
    <div style="padding: 16px 20px; ${borderBottom} background: ${bgColor};">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
        <div style="flex: 1;">
          ${issue.isBlocked ? '<span style="background: #dc2626; color: white; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; margin-right: 8px; text-transform: uppercase;">Blocked</span>' : ''}
          <strong style="color: #1f2937; font-size: 14px;">${issue.title}</strong>
          ${issue.description ? `<p style="margin: 6px 0 0 0; color: #6b7280; font-size: 13px; line-height: 1.5;">${issue.description.substring(0, 150)}${issue.description.length > 150 ? '...' : ''}</p>` : ''}
        </div>
        <span style="background: ${statusColor}15; color: ${statusColor}; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap; text-transform: uppercase;">
          ${(issue.status || 'open').replace('_', ' ')}
        </span>
      </div>
    </div>`;
  });

  html += `
  </div>

  <!-- Footer -->
  <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
    Please let us know if you have any questions or need clarification on any of these items.
  </p>

  <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center;">
    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
      Generated on ${reportDate} • Intelligent Systems
    </p>
  </div>
</div>`;

  return html;
};

/**
 * Generate full project report email body
 * @param {Object} reportData - Data from generateIssueReport
 * @param {string} format - 'html' or 'text'
 * @returns {string} Formatted email body
 */
export const generateEmailBody = (reportData, format = 'html') => {
  const { project, milestoneProgress, generatedAt, summary, stakeholderGroups, unassignedIssues } = reportData;

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const projectTitle = project?.name || project?.project_number || 'Project';
  const projectAddress = project?.fullAddress || project?.address || '';
  const reportDate = formatDate(generatedAt);

  // Get key milestones with dates (prewire, trim, commissioning)
  const keyMilestones = milestoneProgress?.milestones?.filter(m =>
    ['prewire', 'trim', 'commissioning'].includes(m.type)
  ) || [];

  if (format === 'text') {
    let text = `PROJECT STATUS REPORT\n`;
    text += `${'='.repeat(50)}\n\n`;
    text += `Project: ${projectTitle}\n`;
    if (projectAddress) text += `Address: ${projectAddress}\n`;
    text += `Report Date: ${reportDate}\n`;
    text += `Current Phase: ${milestoneProgress?.currentPhase || 'N/A'}\n`;
    text += `Overall Progress: ${milestoneProgress?.progressPercent || 0}%\n\n`;

    // Add milestone dates
    if (keyMilestones.length > 0) {
      text += `KEY MILESTONES\n`;
      text += `${'-'.repeat(30)}\n`;
      keyMilestones.forEach(m => {
        const status = m.completed ? '[COMPLETE]' : (m.targetDate ? '[SCHEDULED]' : '[PENDING]');
        const dateStr = m.actualDate ? `Completed: ${formatDate(m.actualDate)}` :
                       (m.targetDate ? `Target: ${formatDate(m.targetDate)}` : 'Not scheduled');
        text += `${status} ${m.label}: ${dateStr}\n`;
      });
      text += `\n`;
    }

    text += `ISSUE SUMMARY\n`;
    text += `${'-'.repeat(30)}\n`;
    text += `Total Open Issues: ${summary.totalOpen}\n`;
    text += `Blocked Issues: ${summary.blockedCount}\n`;
    text += `External Stakeholder Issues: ${summary.externalCount}\n`;
    text += `Internal Stakeholder Issues: ${summary.internalCount}\n`;
    text += `Unassigned Issues: ${summary.unassignedCount}\n\n`;

    text += `ISSUES BY STAKEHOLDER\n`;
    text += `${'='.repeat(50)}\n`;

    stakeholderGroups.forEach(group => {
      const typeLabel = group.stakeholder.is_internal ? '[Internal]' : '[External]';
      text += `\n${typeLabel} ${group.stakeholder.name}`;
      if (group.stakeholder.role) text += ` (${group.stakeholder.role})`;
      if (group.stakeholder.email) text += `\n   Email: ${group.stakeholder.email}`;
      text += `\n${'-'.repeat(40)}\n`;

      group.issues.forEach((issue, idx) => {
        const blockedFlag = issue.isBlocked ? '[BLOCKED] ' : '';
        text += `${idx + 1}. ${blockedFlag}${issue.title}\n`;
        text += `   Status: ${(issue.status || 'open').toUpperCase()}\n`;
        if (issue.description) {
          text += `   ${issue.description.substring(0, 100)}${issue.description.length > 100 ? '...' : ''}\n`;
        }
      });
    });

    if (unassignedIssues.length > 0) {
      text += `\n[Unassigned Issues]\n${'-'.repeat(40)}\n`;
      unassignedIssues.forEach((issue, idx) => {
        const blockedFlag = issue.isBlocked ? '[BLOCKED] ' : '';
        text += `${idx + 1}. ${blockedFlag}${issue.title}\n`;
      });
    }

    text += `\n${'='.repeat(50)}\n`;
    text += `Generated on ${reportDate} • Intelligent Systems\n`;

    return text;
  }

  // HTML format with project status header, milestones, and stakeholder grouping
  let html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">

  <!-- Header -->
  <div style="text-align: center; margin-bottom: 24px;">
    <div style="font-size: 11px; letter-spacing: 2px; color: #8b5cf6; text-transform: uppercase; margin-bottom: 4px;">Intelligent Systems</div>
    <h1 style="margin: 0; font-size: 22px; color: #1f2937;">Project Status Report</h1>
  </div>

  <!-- Project Overview Card -->
  <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); padding: 24px; border-radius: 16px; color: white; margin-bottom: 24px;">
    <h2 style="margin: 0 0 4px 0; font-size: 22px; font-weight: 600;">${projectTitle}</h2>
    ${projectAddress ? `<p style="margin: 0 0 16px 0; opacity: 0.9; font-size: 14px;">${projectAddress}</p>` : ''}

    <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-top: 20px;">
      <div style="flex: 1; min-width: 120px;">
        <div style="font-size: 11px; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px;">Current Phase</div>
        <div style="font-size: 18px; font-weight: 600; margin-top: 4px;">${milestoneProgress?.currentPhase || 'In Progress'}</div>
      </div>
      <div style="flex: 1; min-width: 120px;">
        <div style="font-size: 11px; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px;">Progress</div>
        <div style="font-size: 32px; font-weight: 700; margin-top: 4px;">${milestoneProgress?.progressPercent || 0}%</div>
      </div>
      <div style="flex: 1; min-width: 120px;">
        <div style="font-size: 11px; opacity: 0.8; text-transform: uppercase; letter-spacing: 1px;">Open Issues</div>
        <div style="font-size: 32px; font-weight: 700; margin-top: 4px;">${summary.totalOpen}</div>
      </div>
    </div>

    <div style="background: rgba(255,255,255,0.3); border-radius: 9999px; height: 8px; margin-top: 20px;">
      <div style="background: white; border-radius: 9999px; height: 8px; width: ${milestoneProgress?.progressPercent || 0}%;"></div>
    </div>
  </div>

  <!-- Milestone Timeline -->
  ${keyMilestones.length > 0 ? `
  <div style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid #e5e7eb;">
    <h3 style="margin: 0 0 16px 0; font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px;">Key Milestones</h3>
    <div style="display: flex; justify-content: space-between; gap: 12px;">
      ${keyMilestones.map(m => {
        const bgColor = m.completed ? '#dcfce7' : (m.targetDate ? '#fef3c7' : '#f3f4f6');
        const textColor = m.completed ? '#166534' : (m.targetDate ? '#92400e' : '#6b7280');
        const dateDisplay = m.actualDate ? formatDate(m.actualDate) :
                           (m.targetDate ? formatDate(m.targetDate) : 'TBD');
        const statusLabel = m.completed ? 'Complete' : (m.targetDate ? 'Target' : 'Pending');
        return `
      <div style="flex: 1; text-align: center; padding: 12px; background: ${bgColor}; border-radius: 10px;">
        <div style="font-size: 12px; font-weight: 600; color: ${textColor}; margin-bottom: 4px;">${m.label}</div>
        <div style="font-size: 14px; color: ${textColor}; font-weight: 500;">${dateDisplay}</div>
        <div style="font-size: 10px; color: ${textColor}; opacity: 0.8; margin-top: 2px;">${statusLabel}</div>
      </div>`;
      }).join('')}
    </div>
  </div>` : ''}

  <!-- Issue Summary Stats -->
  <div style="display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap;">
    <div style="background: #fee2e2; padding: 12px 20px; border-radius: 10px; text-align: center; min-width: 90px; flex: 1;">
      <div style="font-size: 24px; font-weight: bold; color: #dc2626;">${summary.blockedCount}</div>
      <div style="font-size: 11px; color: #b91c1c; text-transform: uppercase; letter-spacing: 0.5px;">Blocked</div>
    </div>
    <div style="background: #fef3c7; padding: 12px 20px; border-radius: 10px; text-align: center; min-width: 90px; flex: 1;">
      <div style="font-size: 24px; font-weight: bold; color: #d97706;">${summary.externalCount}</div>
      <div style="font-size: 11px; color: #b45309; text-transform: uppercase; letter-spacing: 0.5px;">External</div>
    </div>
    <div style="background: #dbeafe; padding: 12px 20px; border-radius: 10px; text-align: center; min-width: 90px; flex: 1;">
      <div style="font-size: 24px; font-weight: bold; color: #2563eb;">${summary.internalCount}</div>
      <div style="font-size: 11px; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.5px;">Internal</div>
    </div>
    ${summary.unassignedCount > 0 ? `
    <div style="background: #f3f4f6; padding: 12px 20px; border-radius: 10px; text-align: center; min-width: 90px; flex: 1;">
      <div style="font-size: 24px; font-weight: bold; color: #6b7280;">${summary.unassignedCount}</div>
      <div style="font-size: 11px; color: #4b5563; text-transform: uppercase; letter-spacing: 0.5px;">Unassigned</div>
    </div>` : ''}
  </div>`;

  // Issues grouped by stakeholder
  stakeholderGroups.forEach(group => {
    const isExternal = !group.stakeholder.is_internal;
    const headerBg = isExternal ? '#fef3c7' : '#dbeafe';
    const headerColor = isExternal ? '#92400e' : '#1e40af';
    const borderColor = isExternal ? '#fcd34d' : '#93c5fd';

    html += `
  <div style="margin-bottom: 20px; border: 1px solid ${borderColor}; border-radius: 12px; overflow: hidden;">
    <div style="background: ${headerBg}; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <span style="font-weight: 600; color: ${headerColor};">${group.stakeholder.name}</span>
        ${group.stakeholder.role ? `<span style="color: ${headerColor}; opacity: 0.7; font-size: 13px;"> - ${group.stakeholder.role}</span>` : ''}
        <span style="font-size: 11px; padding: 2px 8px; border-radius: 10px; margin-left: 8px; background: ${isExternal ? '#f59e0b20' : '#3b82f620'}; color: ${headerColor};">
          ${isExternal ? 'External' : 'Internal'}
        </span>
      </div>
      <div style="display: flex; gap: 8px;">
        <span style="background: white; padding: 4px 10px; border-radius: 6px; font-size: 12px; color: #666;">
          ${group.issues.length} issue${group.issues.length > 1 ? 's' : ''}
        </span>
        ${group.blockedCount > 0 ? `<span style="background: #dc2626; color: white; padding: 4px 10px; border-radius: 6px; font-size: 12px;">${group.blockedCount} blocked</span>` : ''}
      </div>
    </div>`;

    group.issues.forEach((issue, idx) => {
      const isLast = idx === group.issues.length - 1;
      const borderBottom = isLast ? '' : 'border-bottom: 1px solid #e5e7eb;';
      const bgColor = issue.isBlocked ? '#fef2f2' : '#fff';
      const statusColor = issue.isBlocked ? '#dc2626' : '#6b7280';

      html += `
    <div style="padding: 12px 15px; ${borderBottom} background: ${bgColor};">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
        <div style="flex: 1;">
          ${issue.isBlocked ? '<span style="background: #dc2626; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-right: 6px;">BLOCKED</span>' : ''}
          <strong style="color: #1a1a1a; font-size: 14px;">${issue.title}</strong>
          ${issue.description ? `<p style="margin: 5px 0 0 0; color: #666; font-size: 12px;">${issue.description.substring(0, 120)}${issue.description.length > 120 ? '...' : ''}</p>` : ''}
        </div>
        <span style="background: ${statusColor}15; color: ${statusColor}; padding: 3px 8px; border-radius: 4px; font-size: 11px; white-space: nowrap;">
          ${(issue.status || 'open').toUpperCase()}
        </span>
      </div>
    </div>`;
    });

    html += `</div>`;
  });

  // Unassigned issues
  if (unassignedIssues.length > 0) {
    html += `
  <div style="margin-bottom: 20px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
    <div style="background: #f3f4f6; padding: 12px 15px;">
      <span style="font-weight: 600; color: #374151;">Unassigned Issues</span>
      <span style="background: white; padding: 4px 10px; border-radius: 6px; font-size: 12px; color: #666; margin-left: 10px;">
        ${unassignedIssues.length} issue${unassignedIssues.length > 1 ? 's' : ''}
      </span>
    </div>`;

    unassignedIssues.forEach((issue, idx) => {
      const isLast = idx === unassignedIssues.length - 1;
      const borderBottom = isLast ? '' : 'border-bottom: 1px solid #e5e7eb;';

      html += `
    <div style="padding: 12px 15px; ${borderBottom}">
      <strong style="color: #1a1a1a; font-size: 14px;">${issue.title}</strong>
    </div>`;
    });

    html += `</div>`;
  }

  if (summary.totalOpen === 0) {
    html += `
  <div style="background: #d1fae5; padding: 25px; border-radius: 12px; text-align: center; color: #065f46;">
    <strong style="font-size: 16px;">No open issues at this time!</strong>
    <p style="margin: 10px 0 0 0; opacity: 0.8;">Great job keeping everything on track.</p>
  </div>`;
  }

  html += `
  <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; text-align: center;">
    <p style="color: #9ca3af; font-size: 12px; margin: 0;">
      Generated on ${reportDate} • Intelligent Systems
    </p>
  </div>
</div>`;

  return html;
};

/**
 * Generate email subject line
 * @param {Object} project - Project data
 * @param {string} reportType - Type of report
 * @param {Object} stakeholder - Optional stakeholder for personalized subject
 * @returns {string} Email subject
 */
export const generateEmailSubject = (project, reportType = 'Status Report', stakeholder = null) => {
  const projectName = project?.name || project?.project_number || 'Project';
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (stakeholder) {
    return `${projectName} - Action Items for ${stakeholder.name} (${date})`;
  }

  return `${projectName} - ${reportType} (${date})`;
};

export const reportService = {
  generateFullProjectReport,
  generateIssueReport,
  generateEmailBody,
  generateStakeholderEmail,
  generateEmailSubject
};
