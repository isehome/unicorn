/**
 * Bug Reports AI Processing Cron Job
 *
 * Runs every 3 minutes to process pending bug reports with Gemini AI.
 *
 * Endpoint: POST /api/cron/process-bugs
 * Schedule: every 3 minutes (cron: 0/3 * * * *)
 *
 * Flow:
 * 1. Query pending bug reports from database
 * 2. For each bug:
 *    - Update status to 'processing'
 *    - Analyze with Gemini (screenshot + errors + code context)
 *    - Generate markdown report
 *    - Commit to GitHub (new branch + PR)
 *    - Send enhanced email with AI analysis
 *    - Update status to 'analyzed'
 */

const { createClient } = require('@supabase/supabase-js');

// Lazy load these modules to avoid initialization errors
let analyzeWithGemini, generateMarkdown, commitBugReport, sendGraphEmail;

function loadModules() {
  if (!analyzeWithGemini) {
    const analyze = require('../bugs/analyze');
    analyzeWithGemini = analyze.analyzeWithGemini;
    generateMarkdown = analyze.generateMarkdown;
  }
  if (!commitBugReport) {
    const github = require('../bugs/github');
    commitBugReport = github.commitBugReport;
  }
  if (!sendGraphEmail) {
    const graph = require('../_graphMail');
    sendGraphEmail = graph.sendGraphEmail;
  }
}

// Lazy initialize Supabase client
let supabase;
function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
  }
  return supabase;
}

const BUG_REPORT_EMAIL = process.env.BUG_REPORT_EMAIL || 'stephe@isehome.com';
const MAX_BUGS_PER_RUN = 3; // Process up to 3 bugs per cron run to avoid timeouts

/**
 * Generate a sequential bug report ID
 */
async function generateBugId() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Count existing reports for today
  const { count } = await getSupabase()
    .from('bug_reports')
    .select('*', { count: 'exact', head: true })
    .like('bug_report_id', `BR-${today}-%`);

  const seq = (count || 0) + 1;
  return `BR-${today}-${String(seq).padStart(4, '0')}`;
}

/**
 * Build the enhanced email HTML with AI analysis
 */
function buildAnalysisEmailHtml(bugReport, analysis, bugId, prUrl) {
  const severityColors = {
    critical: '#dc2626',
    high: '#ea580c',
    medium: '#ca8a04',
    low: '#16a34a'
  };

  const severityColor = severityColors[analysis.severity] || '#6b7280';

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">AI Bug Analysis Complete</h1>
        <p style="color: rgba(255,255,255,0.8); margin: 8px 0 0 0;">${bugId}</p>
      </div>

      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; background: white; border-radius: 0 0 12px 12px;">

        <div style="display: flex; gap: 16px; margin-bottom: 24px;">
          <div style="background: ${severityColor}15; border: 1px solid ${severityColor}40; padding: 12px 16px; border-radius: 8px; flex: 1;">
            <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Severity</div>
            <div style="font-size: 18px; font-weight: 600; color: ${severityColor}; text-transform: uppercase;">${analysis.severity || 'Unknown'}</div>
          </div>
          <div style="background: #f3f4f6; padding: 12px 16px; border-radius: 8px; flex: 1;">
            <div style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Confidence</div>
            <div style="font-size: 18px; font-weight: 600; color: #374151;">${Math.round((analysis.confidence || 0.5) * 100)}%</div>
          </div>
        </div>

        <div style="background: #f9fafb; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 8px 0; color: #111827; font-size: 14px;">Summary</h3>
          <p style="margin: 0; color: #374151; font-size: 16px;">${analysis.summary || bugReport.description}</p>
        </div>

        <div style="background: #fef3c7; border: 1px solid #fcd34d; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 8px 0; color: #92400e; font-size: 14px;">Root Cause</h3>
          <p style="margin: 0; color: #78350f; font-size: 14px;">${analysis.root_cause || 'Unable to determine root cause.'}</p>
        </div>

        <div style="background: #ecfdf5; border: 1px solid #6ee7b7; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 12px 0; color: #065f46; font-size: 14px;">Suggested Fix</h3>
          <pre style="margin: 0; color: #064e3b; font-size: 13px; white-space: pre-wrap; font-family: 'SF Mono', Monaco, monospace; background: rgba(255,255,255,0.5); padding: 12px; border-radius: 6px;">${analysis.fix_prompt || 'Manual investigation required.'}</pre>
        </div>

        ${analysis.suggested_files?.length > 0 ? `
        <div style="margin-bottom: 20px;">
          <h3 style="margin: 0 0 12px 0; color: #111827; font-size: 14px;">Affected Files</h3>
          <ul style="margin: 0; padding-left: 20px; color: #374151;">
            ${analysis.suggested_files.map(f => `
              <li style="margin-bottom: 6px;">
                <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px;">${f.file || f}${f.line ? ':' + f.line : ''}</code>
                ${f.description ? `<br><span style="font-size: 13px; color: #6b7280;">${f.description}</span>` : ''}
              </li>
            `).join('')}
          </ul>
        </div>
        ` : ''}

        ${prUrl ? `
        <div style="background: #eff6ff; border: 1px solid #93c5fd; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 8px 0; color: #1e40af; font-size: 14px;">Pull Request Created</h3>
          <a href="${prUrl}" style="color: #2563eb; font-size: 14px;">${prUrl}</a>
        </div>
        ` : ''}

        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

        <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 8px 0; color: #18181b; font-size: 14px;">Reporter</h3>
          <p style="margin: 0; color: #52525b;">${bugReport.reported_by_name || 'Unknown'} (${bugReport.reported_by_email || 'No email'})</p>
        </div>

        <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 8px 0; color: #18181b; font-size: 14px;">Original Description</h3>
          <p style="margin: 0; color: #52525b; white-space: pre-wrap;">${bugReport.description}</p>
        </div>

        <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <h3 style="margin: 0 0 8px 0; color: #18181b; font-size: 14px;">Page URL</h3>
          <p style="margin: 0; color: #52525b;"><a href="${bugReport.url}">${bugReport.url}</a></p>
        </div>

        ${bugReport.console_errors?.length > 0 ? `
        <div style="background: #fef2f2; padding: 16px; border-radius: 8px; margin-bottom: 16px; border: 1px solid #fecaca;">
          <h3 style="margin: 0 0 8px 0; color: #dc2626; font-size: 14px;">Console Errors</h3>
          <pre style="margin: 0; color: #991b1b; font-size: 11px; overflow-x: auto; white-space: pre-wrap; font-family: 'SF Mono', Monaco, monospace;">${bugReport.console_errors.join('\n\n')}</pre>
        </div>
        ` : ''}

        ${bugReport.screenshot_base64 ? `
        <div style="margin-bottom: 16px;">
          <h3 style="margin: 0 0 8px 0; color: #18181b; font-size: 14px;">Screenshot</h3>
          <img src="${bugReport.screenshot_base64}" style="max-width: 100%; border: 1px solid #e4e4e7; border-radius: 8px;" alt="Bug screenshot" />
        </div>
        ` : ''}
      </div>

      <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 16px;">
        Generated by Unicorn AI Bug Analyzer
      </p>
    </div>
  `;
}

/**
 * Process a single bug report
 */
async function processBugReport(bugReport) {
  // Load modules on first use
  loadModules();

  const bugId = await generateBugId();

  console.log(`[ProcessBugs] Processing bug ${bugReport.id} as ${bugId}...`);

  // Update status to processing
  await getSupabase()
    .from('bug_reports')
    .update({
      status: 'processing',
      bug_report_id: bugId
    })
    .eq('id', bugReport.id);

  try {
    // Analyze with Gemini
    // Note: In serverless, we don't have direct filesystem access
    // So we'll pass null for rootDir and rely on the PAGE_FILE_MAP in analyze.js
    const analysis = await analyzeWithGemini(bugReport, process.cwd());

    console.log(`[ProcessBugs] AI analysis complete for ${bugId}:`, {
      summary: analysis.summary,
      severity: analysis.severity,
      confidence: analysis.confidence
    });

    // Generate markdown
    const markdown = generateMarkdown(bugReport, analysis, bugId);

    // Commit to GitHub
    let githubResult = null;
    try {
      githubResult = await commitBugReport(
        bugId,
        markdown,
        bugReport.screenshot_base64,
        analysis.summary || bugReport.description,
        analysis.filename_slug
      );
      console.log(`[ProcessBugs] GitHub PR created: ${githubResult.prUrl}`);
    } catch (githubError) {
      console.error(`[ProcessBugs] GitHub commit failed:`, githubError.message);
      // Continue without GitHub - we'll still send the email and update DB
    }

    // Send enhanced email
    try {
      const emailHtml = buildAnalysisEmailHtml(
        bugReport,
        analysis,
        bugId,
        githubResult?.prUrl
      );

      await sendGraphEmail({
        to: [BUG_REPORT_EMAIL],
        subject: `[Bug-${(analysis.severity || 'medium').toUpperCase()}] ${(analysis.summary || bugReport.description).substring(0, 50)}... - AI Analysis`,
        html: emailHtml
      });

      console.log(`[ProcessBugs] Analysis email sent for ${bugId}`);
    } catch (emailError) {
      console.error(`[ProcessBugs] Email send failed:`, emailError.message);
    }

    // Update database with results (including token usage)
    await getSupabase()
      .from('bug_reports')
      .update({
        status: 'analyzed',
        processed_at: new Date().toISOString(),
        ai_summary: analysis.summary,
        ai_severity: analysis.severity,
        ai_suggested_files: analysis.suggested_files || [],
        ai_fix_prompt: analysis.fix_prompt,
        ai_confidence: analysis.confidence || null,
        ai_token_usage: analysis.token_usage || null,
        ai_filename_slug: analysis.filename_slug || null,
        md_file_path: githubResult?.mdPath,
        pr_url: githubResult?.prUrl,
        pr_number: githubResult?.prNumber,
        branch_name: githubResult?.branch,
        analysis_email_sent_at: new Date().toISOString()
      })
      .eq('id', bugReport.id);

    // Clear screenshot from DB to save space (it's now in GitHub)
    if (githubResult) {
      await getSupabase()
        .from('bug_reports')
        .update({ screenshot_base64: null })
        .eq('id', bugReport.id);
    }

    return { success: true, bugId, analysis, githubResult };

  } catch (error) {
    console.error(`[ProcessBugs] Failed to process ${bugId}:`, error);

    // Update status to failed
    await getSupabase()
      .from('bug_reports')
      .update({
        status: 'failed',
        processing_error: error.message,
        processed_at: new Date().toISOString()
      })
      .eq('id', bugReport.id);

    return { success: false, bugId, error: error.message };
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('[Cron] Starting bug reports processing job...');

  // Check required environment variables
  const missingEnvVars = [];
  if (!process.env.GEMINI_API_KEY) missingEnvVars.push('GEMINI_API_KEY');
  if (!process.env.GITHUB_TOKEN) missingEnvVars.push('GITHUB_TOKEN');
  if (!process.env.SUPABASE_URL && !process.env.REACT_APP_SUPABASE_URL) missingEnvVars.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingEnvVars.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missingEnvVars.length > 0) {
    console.error('[Cron] Missing environment variables:', missingEnvVars);
    return res.status(500).json({
      error: 'Missing environment variables',
      missing: missingEnvVars
    });
  }

  try {
    // Query pending bug reports
    const { data: pendingBugs, error: fetchError } = await getSupabase()
      .from('bug_reports')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(MAX_BUGS_PER_RUN);

    if (fetchError) {
      console.error('[Cron] Failed to fetch pending bugs:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch pending bugs', details: fetchError.message });
    }

    if (!pendingBugs || pendingBugs.length === 0) {
      console.log('[Cron] No pending bug reports to process');
      return res.json({
        success: true,
        triggered_at: new Date().toISOString(),
        processed: 0,
        message: 'No pending bug reports'
      });
    }

    console.log(`[Cron] Found ${pendingBugs.length} pending bug reports`);

    // Process each bug
    const results = [];
    for (const bug of pendingBugs) {
      const result = await processBugReport(bug);
      results.push(result);
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    console.log(`[Cron] Bug processing complete: ${successful} succeeded, ${failed} failed`);

    return res.json({
      success: true,
      triggered_at: new Date().toISOString(),
      processed: results.length,
      successful,
      failed,
      results
    });

  } catch (error) {
    console.error('[Cron] Bug processing failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      triggered_at: new Date().toISOString()
    });
  }
};
