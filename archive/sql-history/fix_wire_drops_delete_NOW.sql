-- IMMEDIATE FIX for wire_drops delete functionality
-- Run this SQL in your Supabase SQL Editor to fix the delete issue

-- ============================================
-- 1. CHECK AND ADD DELETE POLICY FOR WIRE_DROPS
-- ============================================

-- First, let's check what policies exist
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies 
WHERE tablename = 'wire_drops';

-- Drop any existing delete policy to ensure clean state
DROP POLICY IF EXISTS dev_delete_all ON public.wire_drops;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.wire_drops;
DROP POLICY IF EXISTS "Allow authenticated users to delete" ON public.wire_drops;

-- Create a proper DELETE policy that allows authenticated users to delete
CREATE POLICY "Enable delete for authenticated users" ON public.wire_drops
  FOR DELETE 
  TO authenticated 
  USING (true);

-- Verify the policy was created
SELECT 
  policyname,
  cmd 
FROM pg_policies 
WHERE tablename = 'wire_drops' 
  AND cmd = 'DELETE';

-- ============================================
-- 2. ENSURE CASCADE DELETE FOR RELATED TABLES
-- ============================================

-- Check and fix foreign key constraints to ensure CASCADE delete
-- This ensures when a wire_drop is deleted, all related records are also deleted

-- First, let's see what foreign keys exist
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND ccu.table_name = 'wire_drops';

-- If any of these don't have CASCADE delete, we need to fix them
-- This will update the foreign key constraints if needed

-- Fix wire_drop_stages foreign key
ALTER TABLE public.wire_drop_stages 
  DROP CONSTRAINT IF EXISTS wire_drop_stages_wire_drop_id_fkey;
  
ALTER TABLE public.wire_drop_stages 
  ADD CONSTRAINT wire_drop_stages_wire_drop_id_fkey 
  FOREIGN KEY (wire_drop_id) 
  REFERENCES public.wire_drops(id) 
  ON DELETE CASCADE;

-- Fix wire_drop_room_end foreign key (if table exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wire_drop_room_end') THEN
    ALTER TABLE public.wire_drop_room_end 
      DROP CONSTRAINT IF EXISTS wire_drop_room_end_wire_drop_id_fkey;
      
    ALTER TABLE public.wire_drop_room_end 
      ADD CONSTRAINT wire_drop_room_end_wire_drop_id_fkey 
      FOREIGN KEY (wire_drop_id) 
      REFERENCES public.wire_drops(id) 
      ON DELETE CASCADE;
  END IF;
END $$;

-- Fix wire_drop_head_end foreign key (if table exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'wire_drop_head_end') THEN
    ALTER TABLE public.wire_drop_head_end 
      DROP CONSTRAINT IF EXISTS wire_drop_head_end_wire_drop_id_fkey;
      
    ALTER TABLE public.wire_drop_head_end 
      ADD CONSTRAINT wire_drop_head_end_wire_drop_id_fkey 
      FOREIGN KEY (wire_drop_id) 
      REFERENCES public.wire_drops(id) 
      ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================
-- 3. VERIFY THE FIX
-- ============================================

-- Check that all policies are in place
SELECT 
  tablename,
  policyname,
  cmd,
  roles::text
FROM pg_policies 
WHERE tablename = 'wire_drops'
ORDER BY cmd;

-- Check that foreign keys have CASCADE delete
SELECT
    tc.table_name AS "Child Table", 
    ccu.table_name AS "Parent Table",
    rc.delete_rule AS "Delete Rule"
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND ccu.table_name = 'wire_drops';

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Wire drops DELETE functionality has been FIXED!';
  RAISE NOTICE '✅ Authenticated users can now delete wire drops';
  RAISE NOTICE '✅ Related tables will cascade delete automatically';
  RAISE NOTICE '';
  RAISE NOTICE 'Test the fix by trying to delete a wire drop in your app.';
END $$;
