-- Fix RLS policies for feature flag tables
-- Bug #12: Admin users cannot modify feature flags - RLS rejection
-- Root cause: Policies used 'TO authenticated' but app uses MSAL auth (not Supabase auth)
-- so requests come through as 'anon' role. Must use 'TO anon, authenticated'.
-- 2026-02-06

-- ============================================================
-- Fix user_feature_flags
-- ============================================================
DROP POLICY IF EXISTS user_feature_flags_select ON public.user_feature_flags;
DROP POLICY IF EXISTS user_feature_flags_insert ON public.user_feature_flags;
DROP POLICY IF EXISTS user_feature_flags_update ON public.user_feature_flags;
DROP POLICY IF EXISTS user_feature_flags_delete ON public.user_feature_flags;

CREATE POLICY user_feature_flags_select ON public.user_feature_flags
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY user_feature_flags_insert ON public.user_feature_flags
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY user_feature_flags_update ON public.user_feature_flags
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY user_feature_flags_delete ON public.user_feature_flags
  FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- Fix role_feature_flags
-- ============================================================
DROP POLICY IF EXISTS role_feature_flags_select ON public.role_feature_flags;
DROP POLICY IF EXISTS role_feature_flags_insert ON public.role_feature_flags;
DROP POLICY IF EXISTS role_feature_flags_update ON public.role_feature_flags;
DROP POLICY IF EXISTS role_feature_flags_delete ON public.role_feature_flags;

CREATE POLICY role_feature_flags_select ON public.role_feature_flags
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY role_feature_flags_insert ON public.role_feature_flags
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY role_feature_flags_update ON public.role_feature_flags
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY role_feature_flags_delete ON public.role_feature_flags
  FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- Fix feature_flags base table too (for completeness)
-- ============================================================
DROP POLICY IF EXISTS feature_flags_select ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_insert ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_update ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_delete ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_read_all ON public.feature_flags;
DROP POLICY IF EXISTS feature_flags_write_auth ON public.feature_flags;

CREATE POLICY feature_flags_select ON public.feature_flags
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY feature_flags_insert ON public.feature_flags
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY feature_flags_update ON public.feature_flags
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY feature_flags_delete ON public.feature_flags
  FOR DELETE TO anon, authenticated USING (true);
