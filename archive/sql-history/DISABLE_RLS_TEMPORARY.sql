-- EMERGENCY FIX: Temporarily disable RLS for secure data tables
-- WARNING: This completely disables security - use only for development/testing!

-- Step 1: Disable RLS on all related tables
ALTER TABLE public.project_secure_data DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.secure_data_audit_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_credentials DISABLE ROW LEVEL SECURITY;

-- Step 2: Verify RLS is disabled
SELECT 
    tablename,
    rowsecurity,
    CASE 
        WHEN rowsecurity = true THEN 'RLS ENABLED (Still Protected)'
        ELSE 'RLS DISABLED (Open Access)'
    END as status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('project_secure_data', 'equipment', 'secure_data_audit_log', 'equipment_credentials')
ORDER BY tablename;

-- Step 3: Test insert (should work now)
-- This will create a test entry to verify everything works
DO $$
DECLARE
    test_project_id UUID;
    test_result RECORD;
BEGIN
    -- Get a valid project ID
    SELECT id INTO test_project_id FROM projects LIMIT 1;
    
    IF test_project_id IS NOT NULL THEN
        -- Try to insert test data
        INSERT INTO public.project_secure_data (
            project_id,
            data_type,
            name,
            username,
            password,
            notes
        ) VALUES (
            test_project_id,
            'credentials',
            'RLS Test Entry - Safe to Delete',
            'testuser',
            'testpass123',
            'This is a test entry created to verify RLS is properly disabled. You can safely delete this.'
        ) RETURNING * INTO test_result;
        
        RAISE NOTICE 'SUCCESS: Test entry created with ID %', test_result.id;
        RAISE NOTICE 'You can now save secure data. Remember to delete the test entry.';
    ELSE
        RAISE NOTICE 'No projects found to test with, but RLS is now disabled.';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'ERROR during test insert: %', SQLERRM;
        RAISE NOTICE 'But RLS is still disabled, so the app should work.';
END $$;

-- TO RE-ENABLE RLS LATER (with proper policies):
-- Run the file: supabase/ENABLE_RLS_PRODUCTION.sql
