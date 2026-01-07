-- Bug Reports Queue Table
-- Stores bug reports for background AI processing
-- Created: 2026-01-07

CREATE TABLE IF NOT EXISTS bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Reporter info
  reported_by_email TEXT,
  reported_by_name TEXT,

  -- Bug context
  url TEXT NOT NULL,
  user_agent TEXT,
  description TEXT NOT NULL,
  console_errors JSONB DEFAULT '[]'::JSONB,
  screenshot_base64 TEXT, -- Temporary storage until processed

  -- Processing status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'analyzed', 'failed')),
  processed_at TIMESTAMPTZ,
  processing_error TEXT,

  -- AI analysis results (summary stored here for quick access in admin UI)
  bug_report_id TEXT,  -- e.g., BR-2026-01-07-0001
  md_file_path TEXT,   -- e.g., bug-reports/2026-01/BR-2026-01-07-0001.md
  ai_summary TEXT,
  ai_severity TEXT CHECK (ai_severity IS NULL OR ai_severity IN ('critical', 'high', 'medium', 'low', 'trivial')),
  ai_suggested_files JSONB DEFAULT '[]'::JSONB,
  ai_fix_prompt TEXT,

  -- GitHub integration
  pr_url TEXT,
  pr_number INTEGER,
  branch_name TEXT,

  -- Email tracking
  initial_email_sent_at TIMESTAMPTZ,
  analysis_email_sent_at TIMESTAMPTZ
);

-- Index for cron job to efficiently find pending bugs
CREATE INDEX IF NOT EXISTS idx_bug_reports_status_pending
  ON bug_reports(status, created_at)
  WHERE status = 'pending';

-- Index for admin UI listing
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_desc
  ON bug_reports(created_at DESC);

-- Index for looking up by bug report ID
CREATE INDEX IF NOT EXISTS idx_bug_reports_bug_id
  ON bug_reports(bug_report_id)
  WHERE bug_report_id IS NOT NULL;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_bug_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_bug_reports_updated_at ON bug_reports;
CREATE TRIGGER trigger_bug_reports_updated_at
  BEFORE UPDATE ON bug_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_bug_reports_updated_at();

-- Enable Row Level Security
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone authenticated can create bug reports
CREATE POLICY "Authenticated users can create bug reports"
  ON bug_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: Directors and above can read all bug reports
CREATE POLICY "Directors and above can read bug reports"
  ON bug_reports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.email = auth.jwt()->>'email'
      AND profiles.role IN ('director', 'admin', 'owner')
    )
  );

-- Policy: Admins and owners can update/delete bug reports
CREATE POLICY "Admins can manage bug reports"
  ON bug_reports
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.email = auth.jwt()->>'email'
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- Policy: Service role (for cron jobs) has full access
CREATE POLICY "Service role has full access to bug reports"
  ON bug_reports
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to generate sequential bug report ID
CREATE OR REPLACE FUNCTION generate_bug_report_id()
RETURNS TEXT AS $$
DECLARE
  today_date TEXT;
  seq_num INTEGER;
  new_id TEXT;
BEGIN
  today_date := TO_CHAR(NOW(), 'YYYY-MM-DD');

  -- Count existing reports for today
  SELECT COUNT(*) + 1 INTO seq_num
  FROM bug_reports
  WHERE bug_report_id LIKE 'BR-' || today_date || '-%';

  -- Format: BR-YYYY-MM-DD-####
  new_id := 'BR-' || today_date || '-' || LPAD(seq_num::TEXT, 4, '0');

  RETURN new_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE bug_reports IS 'Stores bug reports submitted by users for AI analysis and tracking';
COMMENT ON COLUMN bug_reports.status IS 'Processing status: pending (waiting), processing (AI analyzing), analyzed (complete), failed (error)';
COMMENT ON COLUMN bug_reports.bug_report_id IS 'Human-readable ID like BR-2026-01-07-0001';
COMMENT ON COLUMN bug_reports.md_file_path IS 'Path to the markdown file in the git repository';
