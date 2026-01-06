-- ============================================
-- PERMISSIVE RLS FOR BRAIN TRAINING (DEBUG)
-- The auth.jwt()->>'email' approach isn't working.
-- Let's try a simpler approach - allow authenticated users.
-- Created: 2026-01-05
-- ============================================

-- Drop ALL existing policies on page_ai_context
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'page_ai_context'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON page_ai_context', pol.policyname);
    END LOOP;
END $$;

-- Drop ALL existing policies on ai_training_transcripts
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'ai_training_transcripts'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON ai_training_transcripts', pol.policyname);
    END LOOP;
END $$;

-- Simple policy: Any authenticated user can do anything
-- We'll tighten this later once it's working
CREATE POLICY "authenticated_full_access" ON page_ai_context
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_full_access" ON ai_training_transcripts
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Ensure RLS is enabled
ALTER TABLE page_ai_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_training_transcripts ENABLE ROW LEVEL SECURITY;
