-- ============================================
-- BRAIN TRAINING AUTO-SAVE ENHANCEMENT
-- Adds columns to support live auto-saving of transcripts
-- Created: 2026-01-04
-- ============================================

-- Add auto-save related columns to ai_training_transcripts
ALTER TABLE ai_training_transcripts
  ADD COLUMN IF NOT EXISTS is_complete BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS extracted_data JSONB;

-- Create an index on is_complete for finding incomplete sessions
CREATE INDEX IF NOT EXISTS idx_training_transcripts_complete
  ON ai_training_transcripts(is_complete);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_ai_training_transcripts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_training_transcripts_updated ON ai_training_transcripts;
CREATE TRIGGER ai_training_transcripts_updated
  BEFORE UPDATE ON ai_training_transcripts
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_training_transcripts_timestamp();

-- Make page_context_id nullable since we're creating transcripts before page context
ALTER TABLE ai_training_transcripts
  ALTER COLUMN page_context_id DROP NOT NULL;

-- Add director role to policies (directors can also train)
DROP POLICY IF EXISTS "Only admin/owner can modify page context" ON page_ai_context;
CREATE POLICY "Only admin/owner/director can modify page context" ON page_ai_context
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner', 'director')
    )
  );

DROP POLICY IF EXISTS "Only admin/owner can access transcripts" ON ai_training_transcripts;
CREATE POLICY "Only admin/owner/director can access transcripts" ON ai_training_transcripts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner', 'director')
    )
  );

-- Comment on the new columns
COMMENT ON COLUMN ai_training_transcripts.is_complete IS 'Whether the training session has been completed and finalized';
COMMENT ON COLUMN ai_training_transcripts.completed_at IS 'When the session was marked as complete';
COMMENT ON COLUMN ai_training_transcripts.updated_at IS 'Last time this transcript was updated (for auto-save)';
COMMENT ON COLUMN ai_training_transcripts.extracted_data IS 'AI-extracted structured data from the transcript';
