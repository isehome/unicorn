-- ============================================
-- FIX RLS POLICIES FOR BRAIN TRAINING
-- The original policies checked profiles.id = auth.uid() but profiles.id
-- is NOT the Supabase auth user ID. We need to check by email instead.
-- Created: 2026-01-04
-- ============================================

-- Fix page_ai_context policy - check by email via auth.jwt()
DROP POLICY IF EXISTS "Only admin/owner can modify page context" ON page_ai_context;
DROP POLICY IF EXISTS "Only admin/owner/director can modify page context" ON page_ai_context;
CREATE POLICY "Only admin/owner/director can modify page context" ON page_ai_context
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.email = auth.jwt()->>'email'
      AND profiles.role IN ('admin', 'owner', 'director')
    )
  );

-- Fix ai_training_transcripts policy - check by email via auth.jwt()
DROP POLICY IF EXISTS "Only admin/owner can access transcripts" ON ai_training_transcripts;
DROP POLICY IF EXISTS "Only admin/owner/director can access transcripts" ON ai_training_transcripts;
CREATE POLICY "Only admin/owner/director can access transcripts" ON ai_training_transcripts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.email = auth.jwt()->>'email'
      AND profiles.role IN ('admin', 'owner', 'director')
    )
  );

-- Also create an index on profiles.email for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Comment on what we fixed
COMMENT ON POLICY "Only admin/owner/director can modify page context" ON page_ai_context IS
  'Fixed: Uses auth.jwt()->email instead of auth.uid() since profiles.id is not the Supabase auth user ID';
COMMENT ON POLICY "Only admin/owner/director can access transcripts" ON ai_training_transcripts IS
  'Fixed: Uses auth.jwt()->email instead of auth.uid() since profiles.id is not the Supabase auth user ID';
