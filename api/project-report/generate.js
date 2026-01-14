/**
 * Generate Project Progress Report
 * Creates HTML email with gauges and issues for external stakeholders
 */

const { createClient } = require('@supabase/supabase-js');
const { systemSendMail } = require('../_systemGraph');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

    // Fetch milestone data
    const { data: milestones } = await supabase
      .from('project_milestone_status')
      .select('*')
      .eq('project_id', projectId)
      .single();

    // Fetch issues with external stakeholders
    const { data: issues } = await supabase
      .from('issues')
      .select(`
        *,
        issue_stakeholder_tags (
          id,
          contact_id,
          is_external,
          contacts (
            id,
            name,
            email,
            company
          )
        )
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    // Separate issues by type
    const externalIssues = (issues || []).filter(issue =>
      issue.issue_stakeholder_tags?.some(tag => tag.is_external)
    );
    const internalIssues = (issues || []).filter(issue =>
      !issue.issue_stakeholder_tags?.some(tag => tag.is_external)
    );
    const blockedIssues = (issues || []).filter(issue =>
      (issue.status || '').toLowerCase() === 'blocked'
    );

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
      externalIssues,
      internalIssues,
      blockedIssues,
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

function generateReportHtml({ project, milestones, externalIssues, internalIssues, blockedIssues, todos, includeTodos }) {
  const gaugeData = [
    { label: 'Planning', value: milestones?.planning_complete ? 100 : 0 },
    { label: 'Prewire Orders', value: milestones?.prewire_ordered_pct || 0 },
    { label: 'Prewire Received', value: milestones?.prewire_received_pct || 0 },
    { label: 'Prewire Stages', value: milestones?.prewire_stage_pct || 0 },
    { label: 'Trim Orders', value: milestones?.trim_ordered_pct || 0 },
    { label: 'Trim Received', value: milestones?.trim_received_pct || 0 },
    { label: 'Trim Stages', value: milestones?.trim_stage_pct || 0 },
    { label: 'Commissioning', value: milestones?.commissioning_pct || 0 },
  ];

  const getGaugeColor = (pct) => {
    if (pct === 100) return '#8B5CF6';
    if (pct >= 75) return '#94AF32';
    if (pct >= 50) return '#3B82F6';
    if (pct >= 25) return '#F59E0B';
    return '#EF4444';
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
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

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Update - ${project.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; color: #1f2937; }
    .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 32px; border-bottom: 2px solid #8B5CF6; padding-bottom: 24px; }
    .header h1 { color: #8B5CF6; margin: 0 0 8px 0; font-size: 28px; }
    .header p { color: #6b7280; margin: 0; font-size: 14px; }
    .section { margin-bottom: 32px; }
    .section-title { font-size: 18px; font-weight: 600; color: #374151; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
    .section-title::before { content: ''; width: 4px; height: 20px; background: #8B5CF6; border-radius: 2px; }
    .gauges { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
    .gauge { text-align: center; padding: 16px; background: #f9fafb; border-radius: 8px; }
    .gauge-value { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
    .gauge-label { font-size: 12px; color: #6b7280; }
    .gauge-bar { height: 6px; background: #e5e7eb; border-radius: 3px; margin-top: 8px; overflow: hidden; }
    .gauge-fill { height: 100%; border-radius: 3px; }
    .issue { padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 12px; }
    .issue-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
    .issue-title { font-weight: 600; color: #111827; margin: 0; }
    .badge { padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; text-transform: uppercase; }
    .issue-meta { font-size: 12px; color: #6b7280; margin-top: 8px; }
    .issue-description { font-size: 14px; color: #4b5563; margin: 8px 0 0 0; }
    .blocked-banner { background: #FEF2F2; border: 1px solid #FECACA; color: #991B1B; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; }
    .todo { padding: 12px 16px; border-left: 3px solid #8B5CF6; background: #f9fafb; margin-bottom: 8px; }
    .todo-title { font-weight: 500; margin: 0; }
    .todo-due { font-size: 12px; color: #6b7280; margin-top: 4px; }
    .footer { text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; }
    @media (max-width: 600px) { .gauges { grid-template-columns: repeat(2, 1fr); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${project.name}</h1>
      <p>Weekly Progress Report - ${formatDate(new Date().toISOString())}</p>
      ${project.address ? `<p style="margin-top: 8px;">${project.address}</p>` : ''}
    </div>

    <div class="section">
      <div class="section-title">Project Progress</div>
      <div class="gauges">
        ${gaugeData.map(g => `
          <div class="gauge">
            <div class="gauge-value" style="color: ${getGaugeColor(g.value)}">${Math.round(g.value)}%</div>
            <div class="gauge-label">${g.label}</div>
            <div class="gauge-bar">
              <div class="gauge-fill" style="width: ${g.value}%; background: ${getGaugeColor(g.value)}"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    ${blockedIssues.length > 0 ? `
    <div class="section">
      <div class="section-title">Blocked Items (${blockedIssues.length})</div>
      <div class="blocked-banner">
        <strong>Attention Required:</strong> The following items are blocked and require action to proceed.
      </div>
      ${blockedIssues.map(issue => `
        <div class="issue" style="border-left: 4px solid #EF4444;">
          <div class="issue-header">
            <h4 class="issue-title">${issue.title}</h4>
            <span class="badge" style="background: #FEE2E2; color: #991B1B;">BLOCKED</span>
          </div>
          ${issue.description ? `<p class="issue-description">${issue.description}</p>` : ''}
          <div class="issue-meta">Created: ${formatDate(issue.created_at)}</div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${externalIssues.length > 0 ? `
    <div class="section">
      <div class="section-title">External Stakeholder Items (${externalIssues.length})</div>
      ${externalIssues.filter(i => (i.status || '').toLowerCase() !== 'blocked').map(issue => `
        <div class="issue">
          <div class="issue-header">
            <h4 class="issue-title">${issue.title}</h4>
            <span class="badge" style="background: ${(statusColor[(issue.status || '').toLowerCase()] || '#6b7280') + '20'}; color: ${statusColor[(issue.status || '').toLowerCase()] || '#6b7280'}">
              ${issue.status || 'Open'}
            </span>
          </div>
          ${issue.description ? `<p class="issue-description">${issue.description}</p>` : ''}
          <div class="issue-meta">
            Priority: <span style="color: ${priorityColor[issue.priority] || '#6b7280'}">${issue.priority || 'Medium'}</span>
            - Created: ${formatDate(issue.created_at)}
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${includeTodos && todos.length > 0 ? `
    <div class="section">
      <div class="section-title">Upcoming Tasks (${todos.length})</div>
      ${todos.slice(0, 10).map(todo => `
        <div class="todo">
          <p class="todo-title">${todo.title}</p>
          ${todo.due_by ? `<p class="todo-due">Due: ${formatDate(todo.due_by)}</p>` : ''}
        </div>
      `).join('')}
      ${todos.length > 10 ? `<p style="color: #6b7280; font-size: 12px;">+ ${todos.length - 10} more tasks</p>` : ''}
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
