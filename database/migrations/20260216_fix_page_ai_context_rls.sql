-- =============================================================================
-- Fix page_ai_context RLS - add missing policy
--
-- The Feb 11 migration (20260211_enable_rls_unprotected_tables.sql) re-enabled
-- RLS on this table, but the Jan 5 migration (20260105_disable_rls_brain_training.sql)
-- had already dropped all policies. Result: RLS enabled + zero policies = all access denied.
--
-- This caused a storm of 401 errors on the Admin AI Agent tab (initializeFromRegistry
-- loops through all 58 routes, each hitting page_ai_context with SELECT then INSERT).
--
-- Also fix ai_training_transcripts which has the same conflict.
--
-- Applied: 2026-02-16
-- =============================================================================

-- page_ai_context: add permissive policy for anon + authenticated
DROP POLICY IF EXISTS "authenticated_full_access" ON public.page_ai_context;
CREATE POLICY "authenticated_full_access" ON public.page_ai_context
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ai_training_transcripts: same fix
DROP POLICY IF EXISTS "authenticated_full_access" ON public.ai_training_transcripts;
CREATE POLICY "authenticated_full_access" ON public.ai_training_transcripts
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
