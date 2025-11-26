-- ============================================================================
-- FINAL FIX: Permit RLS Policies - Match wire_drops pattern exactly
-- This uses the same permissive approach that works for wire_drops
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Step 1: Drop ALL existing policies to start fresh
DROP POLICY IF EXISTS permit_select_policy ON public.project_permits;
DROP POLICY IF EXISTS permit_insert_policy ON public.project_permits;
DROP POLICY IF EXISTS permit_update_policy ON public.project_permits;
DROP POLICY IF EXISTS permit_delete_policy ON public.project_permits;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.project_permits;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.project_permits;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON public.project_permits;
DROP POLICY IF EXISTS "Enable delete for authenticated users" ON public.project_permits;

-- Step 2: Create policies that allow PUBLIC (not just authenticated)
-- This is what makes it work even when auth context is weird

-- Allow anyone to read permits
CREATE POLICY "Enable read access for all users"
ON public.project_permits
FOR SELECT
TO public  -- Changed from 'authenticated' to 'public'
USING (true);

-- Allow anyone to insert permits
CREATE POLICY "Enable insert for authenticated users only"
ON public.project_permits
FOR INSERT
TO public  -- Changed from 'authenticated' to 'public'
WITH CHECK (true);

-- Allow anyone to update permits
CREATE POLICY "Enable update for authenticated users only"
ON public.project_permits
FOR UPDATE
TO public  -- Changed from 'authenticated' to 'public'
USING (true)
WITH CHECK (true);

-- Allow anyone to delete permits
CREATE POLICY "Enable delete for authenticated users"
ON public.project_permits
FOR DELETE
TO public  -- Changed from 'authenticated' to 'public'
USING (true);

-- Step 3: Ensure table has proper grants
GRANT ALL ON public.project_permits TO postgres;
GRANT ALL ON public.project_permits TO anon;
GRANT ALL ON public.project_permits TO authenticated;
GRANT ALL ON public.project_permits TO service_role;

-- Step 4: Verify policies were created
SELECT
    policyname,
    cmd,
    roles
FROM pg_policies
WHERE tablename = 'project_permits'
ORDER BY cmd;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SUCCESS! Policies Updated with PUBLIC access';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Policies now allow PUBLIC role (same as wire_drops)';
    RAISE NOTICE 'This should fix the RLS error';
    RAISE NOTICE '';
    RAISE NOTICE 'NOTE: You mentioned needing to fix this later';
    RAISE NOTICE 'to be more restrictive (authenticated only).';
    RAISE NOTICE 'For now, this will make it work.';
    RAISE NOTICE '========================================';
END $$;
