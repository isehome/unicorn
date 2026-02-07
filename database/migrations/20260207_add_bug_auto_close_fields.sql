-- Add fields for automatic bug fix detection
-- The close-fixed-bugs cron checks if ai_suggested_files were modified on main
-- and flags bugs as 'likely_fixed' for human confirmation, or 'fixed' if a
-- commit message explicitly references the bug ID.
-- 2026-02-07

-- New columns for tracking fix detection
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS fixed_at TIMESTAMPTZ;
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS auto_closed BOOLEAN DEFAULT false;
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS fix_detection_log JSONB DEFAULT '[]'::jsonb;

-- Index for the cron query: find analyzed bugs with open PRs
CREATE INDEX IF NOT EXISTS idx_bug_reports_analyzed_open
  ON bug_reports(status, created_at)
  WHERE status IN ('analyzed', 'likely_fixed') AND pr_number IS NOT NULL;
