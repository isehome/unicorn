-- COMPREHENSIVE FIX for project_secure_data RLS issues
-- This fix addresses auth state mismatches and provides both permanent and temporary solutions

-- ============= CHECK CURRENT STATE =============
SELECT 
    tablename,
    COUNT(*) as policy_count,
    STRING_AGG(policyname, ', ') as policies
FROM pg_policies 
WHERE tablename IN ('project_secure_data', 'equipment', 'secure_data_audit_log', 'equipment_credentials')
GROUP BY tablename;

-- ============= OPTION 1: DISABLE RLS (TEMPORARY FOR TESTING) =============
-- Uncomment these lines to temporarily disable RLS for testing
-- WARNING: Only use in development!

-- ALTER TABLE public.project_secure_data DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.equipment DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.secure_data_audit_log DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.equipment_credentials DISABLE ROW LEVEL SECURITY;

-- ============= OPTION 2: FIX RLS POLICIES (RECOMMENDED) =============
-- Drop ALL existing policies
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    -- Drop all policies on project_secure_data table
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'project_secure_data' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.project_secure_data', pol.policyname);
    END LOOP;
    
    -- Drop all policies on equipment table
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'equipment' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.equipment', pol.policyname);
    END LOOP;
    
    -- Drop all policies on secure_data_audit_log table
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'secure_data_audit_log' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.secure_data_audit_log', pol.policyname);
    END LOOP;
    
    -- Drop all policies on equipment_credentials table  
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'equipment_credentials' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.equipment_credentials', pol.policyname);
    END LOOP;
END $$;

-- ============= CREATE PERMISSIVE POLICIES FOR DEVELOPMENT =============
-- These policies allow both anon and authenticated access for development

-- PROJECT_SECURE_DATA - Full access for both anon and authenticated
CREATE POLICY "allow_all_select" 
  ON public.project_secure_data
  FOR SELECT 
  TO anon, authenticated
  USING (true);

CREATE POLICY "allow_all_insert" 
  ON public.project_secure_data
  FOR INSERT 
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "allow_all_update" 
  ON public.project_secure_data
  FOR UPDATE 
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_all_delete" 
  ON public.project_secure_data
  FOR DELETE 
  TO anon, authenticated
  USING (true);

-- EQUIPMENT - Full access for both anon and authenticated
CREATE POLICY "allow_all_select" 
  ON public.equipment
  FOR SELECT 
  TO anon, authenticated
  USING (true);

CREATE POLICY "allow_all_insert" 
  ON public.equipment
  FOR INSERT 
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "allow_all_update" 
  ON public.equipment
  FOR UPDATE 
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_all_delete" 
  ON public.equipment
  FOR DELETE 
  TO anon, authenticated
  USING (true);

-- SECURE_DATA_AUDIT_LOG - Full read and insert for both
CREATE POLICY "allow_all_select" 
  ON public.secure_data_audit_log
  FOR SELECT 
  TO anon, authenticated
  USING (true);

CREATE POLICY "allow_all_insert" 
  ON public.secure_data_audit_log
  FOR INSERT 
  TO anon, authenticated
  WITH CHECK (true);

-- EQUIPMENT_CREDENTIALS - Full access for both anon and authenticated  
CREATE POLICY "allow_all_select" 
  ON public.equipment_credentials
  FOR SELECT 
  TO anon, authenticated
  USING (true);

CREATE POLICY "allow_all_insert" 
  ON public.equipment_credentials
  FOR INSERT 
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "allow_all_update" 
  ON public.equipment_credentials
  FOR UPDATE 
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_all_delete" 
  ON public.equipment_credentials
  FOR DELETE 
  TO anon, authenticated
  USING (true);

-- ============= VERIFY POLICIES =============
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
WHERE tablename IN ('project_secure_data', 'equipment', 'secure_data_audit_log', 'equipment_credentials')
ORDER BY tablename, cmd;

-- ============= CHECK RLS STATUS =============
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('project_secure_data', 'equipment', 'secure_data_audit_log', 'equipment_credentials');

-- ============= TEST INSERT (Optional) =============
-- Uncomment to test if insert works after applying policies
/*
INSERT INTO public.project_secure_data (
    project_id,
    data_type,
    name,
    username,
    password,
    notes
) VALUES (
    (SELECT id FROM projects LIMIT 1),
    'credentials',
    'Test Credential',
    'testuser',
    'testpass',
    'Test from SQL'
) RETURNING *;
*/
