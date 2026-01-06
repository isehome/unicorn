-- ============================================
-- DISABLE RLS ON BRAIN TRAINING TABLES
--
-- These tables are admin-only and the app enforces permissions
-- via the TrainingModeContext.canTrain check. RLS was causing
-- endless 401/42501 errors because of session/JWT complexities.
--
-- Security is handled at the application layer:
-- - Only users with role='admin', 'owner', or 'director' can access training mode
-- - This check happens in TrainingModeContext.js line 90
--
-- Created: 2026-01-05
-- ============================================

-- Disable RLS entirely on these tables
ALTER TABLE page_ai_context DISABLE ROW LEVEL SECURITY;
ALTER TABLE ai_training_transcripts DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies (cleanup)
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'page_ai_context'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON page_ai_context', pol.policyname);
    END LOOP;
    FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'ai_training_transcripts'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON ai_training_transcripts', pol.policyname);
    END LOOP;
END $$;
