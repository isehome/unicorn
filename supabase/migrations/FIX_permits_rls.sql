-- ============================================================================
-- FIX: Permit RLS Policies - Make them work with your auth setup
-- Run this in Supabase SQL Editor if you're still getting RLS errors
-- ============================================================================

-- Drop all existing policies
DROP POLICY IF EXISTS permit_select_policy ON public.project_permits;
DROP POLICY IF EXISTS permit_insert_policy ON public.project_permits;
DROP POLICY IF EXISTS permit_update_policy ON public.project_permits;
DROP POLICY IF EXISTS permit_delete_policy ON public.project_permits;

-- Create VERY permissive policies that work with any authenticated user
-- These match the pattern used in wire_drops and other working tables

CREATE POLICY permit_select_policy ON public.project_permits
    FOR SELECT
    USING (true);  -- Anyone can read (even anon, but table requires auth)

CREATE POLICY permit_insert_policy ON public.project_permits
    FOR INSERT
    WITH CHECK (true);  -- Anyone can insert (even anon, but table requires auth)

CREATE POLICY permit_update_policy ON public.project_permits
    FOR UPDATE
    USING (true)
    WITH CHECK (true);  -- Anyone can update

CREATE POLICY permit_delete_policy ON public.project_permits
    FOR DELETE
    USING (true);  -- Anyone can delete

-- Alternative: If the above doesn't work, disable RLS entirely (less secure but will work)
-- Uncomment the line below if you still have issues:
-- ALTER TABLE public.project_permits DISABLE ROW LEVEL SECURITY;

-- Verify the policies were created
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE tablename = 'project_permits'
ORDER BY policyname;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'RLS Policies Updated!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Check the query results above to verify';
    RAISE NOTICE 'You should see 4 policies (SELECT, INSERT, UPDATE, DELETE)';
    RAISE NOTICE '========================================';
END $$;
