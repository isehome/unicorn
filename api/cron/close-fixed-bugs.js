/**
 * Auto-Close Fixed Bug Reports Cron Job
 *
 * Runs every 10 minutes to detect bugs whose suggested files were modified on main.
 *
 * Endpoint: POST /api/cron/close-fixed-bugs
 * Schedule: every 10 minutes (cron: */10 * * * *)
 *
 * Detection logic:
 *   1. Query analyzed bugs that have open PRs
 *   2. For each bug, check if ai_suggested_files were modified on main since the bug was created
 *   3. Also check if any commit message explicitly references the bug ID
 *   4. If commit message references bug ID → auto-close (high confidence, status = 'fixed')
 *   5. If only files were modified → flag as 'likely_fixed' (needs human confirmation)
 *   6. Clean up GitHub artifacts (close PR, delete branch, delete markdown) only for 'fixed'
 *
 * This avoids false positives from unrelated file changes.
 */

const { requireCron } = require('../_authMiddleware');
const { createClient } = require('@supabase/supabase-js');

// Lazy load GitHub module
let github;
function loadGitHub() {
  if (!github) {
    github = require('../bugs/github');
  }
  return github;
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

const MAX_BUGS_PER_RUN = 5; // Avoid Vercel function timeouts

/**
 * Extract file path string from ai_suggested_files entry
 * Handles both formats: { file: "path" } and plain "path" strings
 */
function extractFilePath(entry) {
  if (typeof entry === 'string') return entry;
  if (entry && typeof entry === 'object' && entry.file) return entry.file;
  return null;
}

/**
 * Check a single bug report for fix signals
 */
async function checkBugForFixes(bug) {
  const { getCommitsForFile } = loadGitHub();

  const suggestedFiles = bug.ai_suggested_files || [];
  const filePaths = suggestedFiles.map(extractFilePath).filter(Boolean);

  if (filePaths.length === 0) {
    return { action: 'skip', reason: 'No suggested files to check' };
  }

  const sinceDate = bug.created_at;
  const bugId = bug.bug_report_id; // e.g., BR-2026-02-06-0001

  const detectionLog = [];
  let filesModified = 0;
  let commitReferencesBug = false;
  let allCommits = [];

  // Check each suggested file for modifications on main
  for (const filePath of filePaths) {
    const result = await getCommitsForFile(filePath, sinceDate, 'main');

    detectionLog.push({
      file: filePath,
      modified: result.modified,
      commits: result.commits || [],
      error: result.error || null
    });

    if (result.modified) {
      filesModified++;
      allCommits.push(...(result.commits || []));

      // Check if any commit message references this specific bug
      for (const commit of (result.commits || [])) {
        const msg = (commit.message || '').toLowerCase();
        if (bugId && msg.includes(bugId.toLowerCase())) {
          commitReferencesBug = true;
        }
        // Also check for PR number reference like "Bug #12" or "#12"
        if (bug.pr_number && msg.includes(`#${bug.pr_number}`)) {
          commitReferencesBug = true;
        }
      }
    }
  }

  // Decision logic:
  // - Commit explicitly references bug ID → auto-close (high confidence)
  // - Files modified but no explicit reference → flag as likely_fixed
  // - No files modified → skip
  if (commitReferencesBug) {
    return {
      action: 'auto_close',
      reason: `Commit message references ${bugId || 'PR #' + bug.pr_number}`,
      filesModified,
      totalFiles: filePaths.length,
      detectionLog
    };
  }

  if (filesModified > 0) {
    return {
      action: 'likely_fixed',
      reason: `${filesModified}/${filePaths.length} suggested files modified on main (no explicit bug reference in commits)`,
      filesModified,
      totalFiles: filePaths.length,
      detectionLog
    };
  }

  return {
    action: 'skip',
    reason: `0/${filePaths.length} suggested files modified since ${sinceDate}`,
    filesModified: 0,
    totalFiles: filePaths.length,
    detectionLog
  };
}

/**
 * Fully close a bug: close PR, delete branch, delete markdown, update DB
 */
async function autoCloseBug(bug, detectionResult) {
  const { closePullRequest, deleteBranch, deleteFile } = loadGitHub();

  const actions = [];

  // Close PR
  if (bug.pr_number) {
    try {
      await closePullRequest(bug.pr_number);
      actions.push({ action: 'close_pr', pr: bug.pr_number, success: true });
      console.log(`[CloseBugs] Closed PR #${bug.pr_number}`);
    } catch (err) {
      actions.push({ action: 'close_pr', pr: bug.pr_number, success: false, error: err.message });
      console.warn(`[CloseBugs] Failed to close PR #${bug.pr_number}:`, err.message);
    }
  }

  // Delete branch
  if (bug.branch_name) {
    try {
      await deleteBranch(bug.branch_name);
      actions.push({ action: 'delete_branch', branch: bug.branch_name, success: true });
      console.log(`[CloseBugs] Deleted branch ${bug.branch_name}`);
    } catch (err) {
      actions.push({ action: 'delete_branch', branch: bug.branch_name, success: false, error: err.message });
    }
  }

  // Delete markdown file from main (if it exists there)
  if (bug.md_file_path) {
    try {
      await deleteFile(bug.md_file_path, `Auto-close: ${bug.bug_report_id} fixed`, 'main');
      actions.push({ action: 'delete_md', path: bug.md_file_path, success: true });
    } catch (err) {
      actions.push({ action: 'delete_md', path: bug.md_file_path, success: false, error: err.message });
    }
  }

  // Update database
  await getSupabase()
    .from('bug_reports')
    .update({
      status: 'fixed',
      fixed_at: new Date().toISOString(),
      auto_closed: true,
      fix_detection_log: [
        ...(detectionResult.detectionLog || []),
        { type: 'auto_close', actions, timestamp: new Date().toISOString() }
      ]
    })
    .eq('id', bug.id);

  return actions;
}

/**
 * Flag a bug as likely fixed (no GitHub cleanup, just update status)
 */
async function flagLikelyFixed(bug, detectionResult) {
  await getSupabase()
    .from('bug_reports')
    .update({
      status: 'likely_fixed',
      fix_detection_log: [
        ...(detectionResult.detectionLog || []),
        {
          type: 'likely_fixed',
          reason: detectionResult.reason,
          filesModified: detectionResult.filesModified,
          totalFiles: detectionResult.totalFiles,
          timestamp: new Date().toISOString()
        }
      ]
    })
    .eq('id', bug.id);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireCron(req, res)) return;

  console.log('[CloseBugs] Starting close-fixed-bugs job...');

  // Check required environment variables
  const missingEnvVars = [];
  if (!process.env.GITHUB_TOKEN) missingEnvVars.push('GITHUB_TOKEN');
  if (!process.env.SUPABASE_URL && !process.env.REACT_APP_SUPABASE_URL) missingEnvVars.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingEnvVars.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missingEnvVars.length > 0) {
    console.error('[CloseBugs] Missing environment variables:', missingEnvVars);
    return res.status(500).json({ error: 'Missing environment variables', missing: missingEnvVars });
  }

  try {
    // Query analyzed bugs with open PRs
    const { data: bugs, error: fetchError } = await getSupabase()
      .from('bug_reports')
      .select('id, bug_report_id, created_at, ai_suggested_files, pr_number, branch_name, md_file_path, status')
      .in('status', ['analyzed'])
      .not('pr_number', 'is', null)
      .order('created_at', { ascending: true })
      .limit(MAX_BUGS_PER_RUN);

    if (fetchError) {
      console.error('[CloseBugs] Failed to fetch bugs:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch bugs', details: fetchError.message });
    }

    if (!bugs || bugs.length === 0) {
      console.log('[CloseBugs] No analyzed bugs with PRs to check');
      return res.json({
        success: true,
        triggered_at: new Date().toISOString(),
        checked: 0,
        message: 'No analyzed bugs with PRs to check'
      });
    }

    console.log(`[CloseBugs] Found ${bugs.length} analyzed bugs to check`);

    const results = [];

    for (const bug of bugs) {
      const bugLabel = bug.bug_report_id || bug.id.substring(0, 8);
      console.log(`[CloseBugs] Checking ${bugLabel}...`);

      try {
        const detection = await checkBugForFixes(bug);
        console.log(`[CloseBugs] ${bugLabel}: ${detection.action} - ${detection.reason}`);

        if (detection.action === 'auto_close') {
          const actions = await autoCloseBug(bug, detection);
          results.push({
            bugId: bugLabel,
            action: 'auto_closed',
            reason: detection.reason,
            actions
          });
          console.log(`[CloseBugs] ${bugLabel}: AUTO-CLOSED (commit referenced bug)`);

        } else if (detection.action === 'likely_fixed') {
          await flagLikelyFixed(bug, detection);
          results.push({
            bugId: bugLabel,
            action: 'likely_fixed',
            reason: detection.reason
          });
          console.log(`[CloseBugs] ${bugLabel}: FLAGGED as likely_fixed`);

        } else {
          results.push({
            bugId: bugLabel,
            action: 'skipped',
            reason: detection.reason
          });
        }

      } catch (bugError) {
        console.error(`[CloseBugs] Error checking ${bugLabel}:`, bugError.message);
        results.push({
          bugId: bugLabel,
          action: 'error',
          error: bugError.message
        });
      }
    }

    const summary = {
      auto_closed: results.filter(r => r.action === 'auto_closed').length,
      likely_fixed: results.filter(r => r.action === 'likely_fixed').length,
      skipped: results.filter(r => r.action === 'skipped').length,
      errors: results.filter(r => r.action === 'error').length
    };

    console.log(`[CloseBugs] Complete:`, summary);

    return res.json({
      success: true,
      triggered_at: new Date().toISOString(),
      checked: bugs.length,
      summary,
      results
    });

  } catch (error) {
    console.error('[CloseBugs] Job failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message,
      triggered_at: new Date().toISOString()
    });
  }
};
