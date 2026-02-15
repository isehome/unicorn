-- =============================================================================
-- Enable RLS on all unprotected public tables
--
-- These 12 tables had NO RLS at all (flagged as ERROR by Supabase Security Advisor).
-- We enable RLS and add permissive policies for anon + authenticated so existing
-- app behaviour is unchanged.  These policies can be tightened later to check
-- auth.uid() once the MSAL→Supabase token exchange is deployed.
--
-- Applied: 2026-02-11
-- =============================================================================

-- 1. shipping_addresses
ALTER TABLE public.shipping_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON public.shipping_addresses
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 2. app_preferences
ALTER TABLE public.app_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON public.app_preferences
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 3. project_contacts
ALTER TABLE public.project_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON public.project_contacts
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 4. issue_project_contacts
ALTER TABLE public.issue_project_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON public.issue_project_contacts
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 5. project_assignments
ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON public.project_assignments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 6. stakeholder_slots
ALTER TABLE public.stakeholder_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON public.stakeholder_slots
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 7. issue_assignments
ALTER TABLE public.issue_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON public.issue_assignments
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 8. retell_network_cache
ALTER TABLE public.retell_network_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON public.retell_network_cache
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 9. project_shade_batches
ALTER TABLE public.project_shade_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON public.project_shade_batches
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 10. employee_notes
ALTER TABLE public.employee_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON public.employee_notes
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- =============================================================================
-- 2 tables that had policies but RLS was never turned on
-- (policy_exists_rls_disabled ERROR)
-- =============================================================================

-- 11. ai_training_transcripts  (policy "authenticated_full_access" already exists)
ALTER TABLE public.ai_training_transcripts ENABLE ROW LEVEL SECURITY;

-- 12. page_ai_context  (policy "authenticated_full_access" already exists)
ALTER TABLE public.page_ai_context ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 1 table with RLS enabled but no policy (causes INFO-level notice)
-- =============================================================================

-- 13. role_types  (read-only reference table)
CREATE POLICY "authenticated_read_access" ON public.role_types
  FOR SELECT TO anon, authenticated USING (true);
