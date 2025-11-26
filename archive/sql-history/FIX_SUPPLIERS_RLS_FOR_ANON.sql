-- Fix suppliers table RLS to allow anon users (same as project_equipment)
-- This allows vendor matching to create suppliers during CSV import

-- Drop existing policies
DROP POLICY IF EXISTS suppliers_read_all ON public.suppliers;
DROP POLICY IF EXISTS suppliers_write_authenticated ON public.suppliers;

-- Create new policies allowing anon and authenticated users
-- Allow SELECT for everyone
CREATE POLICY suppliers_select_policy ON public.suppliers
  FOR SELECT TO anon, authenticated
  USING (true);

-- Allow ALL operations (INSERT, UPDATE, DELETE) for anon and authenticated users
CREATE POLICY suppliers_modify_policy ON public.suppliers
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
  AND tablename = 'suppliers'
ORDER BY policyname;
