-- FIX RLS POLICIES: Allow authenticated users to UPDATE global_parts
-- The current policy might be blocking UPDATE operations

-- Step 1: Check current policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'global_parts';

-- Step 2: Drop existing policies
DROP POLICY IF EXISTS global_parts_read_all ON public.global_parts;
DROP POLICY IF EXISTS global_parts_write_authenticated ON public.global_parts;

-- Step 3: Create separate policies for each operation (more explicit)

-- Allow everyone to SELECT (read)
CREATE POLICY global_parts_select_all
  ON public.global_parts
  FOR SELECT
  USING (true);

-- Allow authenticated users to INSERT
CREATE POLICY global_parts_insert_authenticated
  ON public.global_parts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to UPDATE
CREATE POLICY global_parts_update_authenticated
  ON public.global_parts
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to DELETE
CREATE POLICY global_parts_delete_authenticated
  ON public.global_parts
  FOR DELETE
  TO authenticated
  USING (true);

-- Step 4: Verify policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'global_parts'
ORDER BY cmd, policyname;

-- Step 5: Test that update works now
DO $$
DECLARE
  test_id uuid;
  test_val boolean;
BEGIN
  -- Get a test part
  SELECT id INTO test_id FROM global_parts LIMIT 1;

  -- Try to update it
  UPDATE global_parts
  SET required_for_prewire = true
  WHERE id = test_id;

  -- Check if it worked
  SELECT required_for_prewire INTO test_val
  FROM global_parts
  WHERE id = test_id;

  RAISE NOTICE 'Test part % has required_for_prewire = %', test_id, test_val;
END $$;
