-- Add filename_slug column to bug_reports table
-- This stores the AI-generated short descriptive name for the bug report file

ALTER TABLE bug_reports
ADD COLUMN IF NOT EXISTS ai_filename_slug TEXT;

COMMENT ON COLUMN bug_reports.ai_filename_slug IS 'AI-generated short descriptive slug for filename (e.g., "login-button-broken")';
