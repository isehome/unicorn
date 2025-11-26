-- ============================================================================
-- DIAGNOSE: Check authentication and RLS setup for permits
-- Run this in Supabase SQL Editor to understand the issue
-- ============================================================================

-- 1. Check if RLS is enabled on the table
SELECT
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
AND tablename = 'project_permits';

-- 2. Check all RLS policies on project_permits
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual::text as using_expression,
    with_check::text as with_check_expression
FROM pg_policies
WHERE tablename = 'project_permits'
ORDER BY cmd, policyname;

-- 3. Check table permissions (grants)
SELECT
    grantee,
    privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
AND table_name = 'project_permits';

-- 4. Compare with a working table (wire_drops)
SELECT
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE tablename = 'wire_drops'
ORDER BY cmd, policyname;

-- 5. Check current user context
SELECT
    current_user as current_user,
    session_user as session_user,
    current_role as current_role;

-- 6. Test if you can see any permits
SELECT COUNT(*) as permit_count FROM public.project_permits;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Diagnosis Complete - Review Results Above';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'What to look for:';
    RAISE NOTICE '1. RLS should be TRUE for project_permits';
    RAISE NOTICE '2. You should see 4 policies (SELECT, INSERT, UPDATE, DELETE)';
    RAISE NOTICE '3. Roles should show PUBLIC or similar';
    RAISE NOTICE '4. Compare policies with wire_drops (should be similar)';
    RAISE NOTICE '5. Current user should be "authenticator" or similar';
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
END $$;
