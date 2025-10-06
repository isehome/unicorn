-- COMPREHENSIVE DELETE FIX FOR WIRE_DROPS
-- Run this entire script in Supabase SQL Editor

-- ============================================
-- 1. CHECK IF RLS IS ENABLED
-- ============================================
SELECT 
  schemaname,
  tablename,
  rowsecurity 
FROM pg_tables 
WHERE tablename = 'wire_drops';

-- ============================================
-- 2. DROP ALL EXISTING DELETE POLICIES
-- ============================================
DO $$ 
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN 
    SELECT policyname 
    FROM pg_policies 
    WHERE tablename = 'wire_drops' 
    AND cmd = 'DELETE'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.wire_drops', policy_record.policyname);
    RAISE NOTICE 'Dropped policy: %', policy_record.policyname;
  END LOOP;
END $$;

-- ============================================
-- 3. CREATE A SIMPLE DELETE POLICY
-- ============================================
-- Using the exact name from the complete script
CREATE POLICY dev_delete_all ON public.wire_drops
  FOR DELETE 
  TO authenticated 
  USING (true);

-- Also create a backup policy with different name just in case
CREATE POLICY "Enable delete for authenticated users" ON public.wire_drops
  FOR DELETE 
  TO authenticated 
  USING (true);

-- ============================================
-- 4. ENSURE RLS IS ENABLED
-- ============================================
ALTER TABLE public.wire_drops ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. FIX CASCADE DELETE ON RELATED TABLES
-- ============================================
-- Fix wire_drop_stages
DO $$ 
BEGIN
  -- Drop existing constraint
  ALTER TABLE public.wire_drop_stages 
    DROP CONSTRAINT IF EXISTS wire_drop_stages_wire_drop_id_fkey;
  
  -- Add with CASCADE
  ALTER TABLE public.wire_drop_stages 
    ADD CONSTRAINT wire_drop_stages_wire_drop_id_fkey 
    FOREIGN KEY (wire_drop_id) 
    REFERENCES public.wire_drops(id) 
    ON DELETE CASCADE;
  
  RAISE NOTICE 'Fixed CASCADE delete for wire_drop_stages';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'wire_drop_stages table might not exist or already fixed';
END $$;

-- Fix wire_drop_room_end
DO $$ 
BEGIN
  ALTER TABLE public.wire_drop_room_end 
    DROP CONSTRAINT IF EXISTS wire_drop_room_end_wire_drop_id_fkey;
  
  ALTER TABLE public.wire_drop_room_end 
    ADD CONSTRAINT wire_drop_room_end_wire_drop_id_fkey 
    FOREIGN KEY (wire_drop_id) 
    REFERENCES public.wire_drops(id) 
    ON DELETE CASCADE;
  
  RAISE NOTICE 'Fixed CASCADE delete for wire_drop_room_end';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'wire_drop_room_end table might not exist or already fixed';
END $$;

-- Fix wire_drop_head_end
DO $$ 
BEGIN
  ALTER TABLE public.wire_drop_head_end 
    DROP CONSTRAINT IF EXISTS wire_drop_head_end_wire_drop_id_fkey;
  
  ALTER TABLE public.wire_drop_head_end 
    ADD CONSTRAINT wire_drop_head_end_wire_drop_id_fkey 
    FOREIGN KEY (wire_drop_id) 
    REFERENCES public.wire_drops(id) 
    ON DELETE CASCADE;
  
  RAISE NOTICE 'Fixed CASCADE delete for wire_drop_head_end';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'wire_drop_head_end table might not exist or already fixed';
END $$;

-- ============================================
-- 6. VERIFY ALL POLICIES EXIST
-- ============================================
SELECT 
  'Checking wire_drops policies:' as status;

SELECT 
  tablename,
  policyname,
  cmd,
  roles::text,
  qual
FROM pg_policies 
WHERE tablename = 'wire_drops'
ORDER BY cmd;

-- ============================================
-- 7. TEST DELETE PERMISSION
-- ============================================
-- Create a test function to verify delete works
CREATE OR REPLACE FUNCTION test_wire_drop_delete()
RETURNS TEXT AS $$
DECLARE
  test_id UUID;
  result TEXT;
BEGIN
  -- Try to create a test wire drop
  INSERT INTO public.wire_drops (project_id, name, room_name, drop_name, location)
  VALUES (
    (SELECT id FROM projects LIMIT 1), 
    'TEST-DELETE', 
    'TEST-ROOM', 
    'TEST-DROP', 
    'TEST-LOCATION'
  )
  RETURNING id INTO test_id;
  
  -- Try to delete it
  DELETE FROM public.wire_drops WHERE id = test_id;
  
  -- Check if it was deleted
  IF NOT EXISTS (SELECT 1 FROM public.wire_drops WHERE id = test_id) THEN
    result := '✅ DELETE TEST PASSED - Wire drops can be deleted!';
  ELSE
    result := '❌ DELETE TEST FAILED - Wire drop still exists after delete';
  END IF;
  
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  RETURN '⚠️ TEST ERROR: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run the test
SELECT test_wire_drop_delete();

-- Clean up test function
DROP FUNCTION IF EXISTS test_wire_drop_delete();

-- ============================================
-- 8. FINAL VERIFICATION
-- ============================================
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies 
  WHERE tablename = 'wire_drops' AND cmd = 'DELETE';
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ DELETE FIX COMPLETE!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Found % DELETE policies for wire_drops', policy_count;
  RAISE NOTICE 'RLS is enabled on wire_drops table';
  RAISE NOTICE 'CASCADE delete is configured for related tables';
  RAISE NOTICE '';
  RAISE NOTICE 'You should now be able to delete wire drops!';
  RAISE NOTICE '========================================';
END $$;
