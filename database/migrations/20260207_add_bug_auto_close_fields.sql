-- Add fields for bug fix tracking and review workflow
-- When an AI agent fixes a bug, it sets status='pending_review' and writes a fix_summary.
-- The admin reviews the summary in the UI and clicks 'Fixed' to close the PR and clean up.
-- 2026-02-07

-- Tracking columns
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS fixed_at TIMESTAMPTZ;
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS auto_closed BOOLEAN DEFAULT false;
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS fix_detection_log JSONB DEFAULT '[]'::jsonb;
ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS fix_summary TEXT;

-- Index for pending_review bugs (shown differently in the UI)
CREATE INDEX IF NOT EXISTS idx_bug_reports_pending_review
  ON bug_reports(status, created_at)
  WHERE status = 'pending_review' AND pr_number IS NOT NULL;
