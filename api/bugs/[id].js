/**
 * Bug Report Single Item API
 *
 * GET /api/bugs/[id] - Get a single bug report with full details
 * DELETE /api/bugs/[id] - Delete a bug report (marks as fixed)
 * POST /api/bugs/[id] - Reanalyze a bug report (resets to pending)
 */

const { createClient } = require('@supabase/supabase-js');
const { deleteBugReport, getBugReportContent, getBugScreenshot } = require('./github');

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: 'Bug ID is required' });
  }

  try {
    // GET - Fetch single bug report
    if (req.method === 'GET') {
      const { data: bug, error } = await supabase
        .from('bug_reports')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Bug report not found' });
        }
        throw error;
      }

      // If there's a markdown file in GitHub, try to fetch it
      let markdownContent = null;
      if (bug.md_file_path) {
        try {
          markdownContent = await getBugReportContent(bug.md_file_path);
        } catch (githubError) {
          console.warn('[BugGet] Failed to fetch markdown from GitHub:', githubError.message);
          // Continue without markdown content
        }
      }

      // If screenshot is not in DB but bug has been processed, try to fetch from GitHub
      let screenshotBase64 = bug.screenshot_base64;
      if (!screenshotBase64 && bug.bug_report_id && bug.status === 'analyzed') {
        try {
          screenshotBase64 = await getBugScreenshot(bug.bug_report_id, bug.branch_name);
        } catch (githubError) {
          console.warn('[BugGet] Failed to fetch screenshot from GitHub:', githubError.message);
        }
      }

      return res.json({
        success: true,
        bug: {
          ...bug,
          screenshot_base64: screenshotBase64,
          markdown_content: markdownContent
        }
      });
    }

    // DELETE - Delete bug report (mark as fixed)
    if (req.method === 'DELETE') {
      // First get the bug to get GitHub info
      const { data: bug, error: fetchError } = await supabase
        .from('bug_reports')
        .select('id, bug_report_id, md_file_path, pr_number, branch_name')
        .eq('id', id)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          return res.status(404).json({ error: 'Bug report not found' });
        }
        throw fetchError;
      }

      // Delete from GitHub if applicable
      if (bug.md_file_path || bug.pr_number) {
        try {
          await deleteBugReport(bug.bug_report_id, bug.md_file_path, bug.pr_number);
        } catch (githubError) {
          console.warn('[BugDelete] GitHub cleanup failed:', githubError.message);
          // Continue with DB update even if GitHub fails
        }
      }

      // Mark as fixed in database (preserve record for tracking instead of hard delete)
      const { error: updateError } = await supabase
        .from('bug_reports')
        .update({
          status: 'fixed',
          fixed_at: new Date().toISOString(),
          auto_closed: false,
          fix_detection_log: [{ type: 'manual', timestamp: new Date().toISOString() }]
        })
        .eq('id', id);

      if (updateError) {
        throw updateError;
      }

      return res.json({
        success: true,
        message: 'Bug report marked as fixed',
        bugId: bug.bug_report_id
      });
    }

    // POST - Reanalyze bug report
    if (req.method === 'POST') {
      const { action } = req.body || {};

      if (action === 'reanalyze') {
        // Reset the bug to pending status for reprocessing
        const { data: bug, error } = await supabase
          .from('bug_reports')
          .update({
            status: 'pending',
            processed_at: null,
            processing_error: null,
            ai_summary: null,
            ai_severity: null,
            ai_suggested_files: [],
            ai_fix_prompt: null,
            // Keep the bug_report_id but clear GitHub info
            md_file_path: null,
            pr_url: null,
            pr_number: null,
            branch_name: null,
            analysis_email_sent_at: null
          })
          .eq('id', id)
          .select()
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            return res.status(404).json({ error: 'Bug report not found' });
          }
          throw error;
        }

        return res.json({
          success: true,
          message: 'Bug report queued for reanalysis',
          bug
        });
      }

      return res.status(400).json({ error: 'Invalid action. Use action: "reanalyze"' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('[BugAPI] Error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
};
