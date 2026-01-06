-- ============================================
-- FIX RLS POLICIES WITH CHECK FOR INSERT
-- The previous policy used FOR ALL with only USING clause,
-- but INSERT operations require WITH CHECK clause.
-- Created: 2026-01-05
-- ============================================

-- Drop all existing policies on page_ai_context
DROP POLICY IF EXISTS "Only admin/owner can modify page context" ON page_ai_context;
DROP POLICY IF EXISTS "Only admin/owner/director can modify page context" ON page_ai_context;
DROP POLICY IF EXISTS "page_ai_context_select_policy" ON page_ai_context;
DROP POLICY IF EXISTS "page_ai_context_insert_policy" ON page_ai_context;
DROP POLICY IF EXISTS "page_ai_context_update_policy" ON page_ai_context;
DROP POLICY IF EXISTS "page_ai_context_delete_policy" ON page_ai_context;

-- Create separate policies for each operation type

-- SELECT: Anyone authenticated can read (AI needs to read context)
CREATE POLICY "page_ai_context_select" ON page_ai_context
  FOR SELECT USING (auth.role() = 'authenticated');

-- INSERT: Admin/owner/director can insert
CREATE POLICY "page_ai_context_insert" ON page_ai_context
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.email = auth.jwt()->>'email'
      AND profiles.role IN ('admin', 'owner', 'director')
    )
  );

-- UPDATE: Admin/owner/director can update
CREATE POLICY "page_ai_context_update" ON page_ai_context
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.email = auth.jwt()->>'email'
      AND profiles.role IN ('admin', 'owner', 'director')
    )
  );

-- DELETE: Admin/owner/director can delete
CREATE POLICY "page_ai_context_delete" ON page_ai_context
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.email = auth.jwt()->>'email'
      AND profiles.role IN ('admin', 'owner', 'director')
    )
  );

-- Same fix for ai_training_transcripts
DROP POLICY IF EXISTS "Only admin/owner can access transcripts" ON ai_training_transcripts;
DROP POLICY IF EXISTS "Only admin/owner/director can access transcripts" ON ai_training_transcripts;
DROP POLICY IF EXISTS "ai_training_transcripts_select_policy" ON ai_training_transcripts;
DROP POLICY IF EXISTS "ai_training_transcripts_insert_policy" ON ai_training_transcripts;
DROP POLICY IF EXISTS "ai_training_transcripts_update_policy" ON ai_training_transcripts;
DROP POLICY IF EXISTS "ai_training_transcripts_delete_policy" ON ai_training_transcripts;

-- SELECT: Admin/owner/director can read transcripts
CREATE POLICY "ai_training_transcripts_select" ON ai_training_transcripts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.email = auth.jwt()->>'email'
      AND profiles.role IN ('admin', 'owner', 'director')
    )
  );

-- INSERT: Admin/owner/director can insert
CREATE POLICY "ai_training_transcripts_insert" ON ai_training_transcripts
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.email = auth.jwt()->>'email'
      AND profiles.role IN ('admin', 'owner', 'director')
    )
  );

-- UPDATE: Admin/owner/director can update
CREATE POLICY "ai_training_transcripts_update" ON ai_training_transcripts
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.email = auth.jwt()->>'email'
      AND profiles.role IN ('admin', 'owner', 'director')
    )
  );

-- DELETE: Admin/owner/director can delete
CREATE POLICY "ai_training_transcripts_delete" ON ai_training_transcripts
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.email = auth.jwt()->>'email'
      AND profiles.role IN ('admin', 'owner', 'director')
    )
  );

-- Ensure RLS is enabled on both tables
ALTER TABLE page_ai_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_training_transcripts ENABLE ROW LEVEL SECURITY;
