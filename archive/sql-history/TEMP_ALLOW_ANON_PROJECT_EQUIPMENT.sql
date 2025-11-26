-- TEMPORARY: Allow anon users to modify project_equipment for testing
-- This is to diagnose if the issue is authentication-related
-- REMOVE THIS AFTER TESTING!

DROP POLICY IF EXISTS project_equipment_modify_policy ON public.project_equipment;

-- Allow ALL operations for BOTH anon and authenticated users
CREATE POLICY project_equipment_modify_policy ON public.project_equipment
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Verify
SELECT
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'project_equipment'
ORDER BY policyname;
