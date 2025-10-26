-- Add RLS policies for project_equipment table to allow all operations for authenticated users

-- Allow SELECT for all users
DROP POLICY IF EXISTS project_equipment_read_all ON public.project_equipment;
CREATE POLICY project_equipment_read_all ON public.project_equipment
  FOR SELECT TO anon, authenticated USING (true);

-- Allow INSERT, UPDATE, DELETE for authenticated users
DROP POLICY IF EXISTS project_equipment_write_authenticated ON public.project_equipment;
CREATE POLICY project_equipment_write_authenticated ON public.project_equipment
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Verify policies were created
SELECT
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'project_equipment'
ORDER BY cmd, policyname;
