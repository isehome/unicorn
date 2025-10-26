-- Remove all existing RLS policies on project_equipment
DROP POLICY IF EXISTS project_equipment_write ON public.project_equipment;
DROP POLICY IF EXISTS project_equipment_select ON public.project_equipment;
DROP POLICY IF EXISTS dev_read_all ON public.project_equipment;
DROP POLICY IF EXISTS dev_insert_all ON public.project_equipment;
DROP POLICY IF EXISTS dev_update_all ON public.project_equipment;
DROP POLICY IF EXISTS dev_delete_all ON public.project_equipment;
DROP POLICY IF EXISTS project_equipment_read_all ON public.project_equipment;
DROP POLICY IF EXISTS project_equipment_write_authenticated ON public.project_equipment;

-- Create simple, clear policies
-- Allow SELECT for everyone (anon + authenticated)
CREATE POLICY project_equipment_select_policy ON public.project_equipment
  FOR SELECT TO anon, authenticated
  USING (true);

-- Allow ALL operations (INSERT, UPDATE, DELETE) for authenticated users only
CREATE POLICY project_equipment_modify_policy ON public.project_equipment
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Verify only 2 policies exist now
SELECT
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'project_equipment'
ORDER BY policyname;
