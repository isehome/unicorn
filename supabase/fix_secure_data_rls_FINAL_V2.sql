-- DEFINITIVE FIX for project_secure_data RLS policies
-- This creates explicit policies for each operation

-- ============= DROP ALL EXISTING POLICIES =============
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

-- ============= PROJECT_SECURE_DATA - EXPLICIT POLICIES =============
-- Create separate policies for each operation to avoid conflicts

CREATE POLICY "secure_data_select_policy" 
  ON public.project_secure_data
  FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "secure_data_insert_policy" 
  ON public.project_secure_data
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "secure_data_update_policy" 
  ON public.project_secure_data
  FOR UPDATE 
  TO authenticated 
  USING (true)
  WITH CHECK (true);

CREATE POLICY "secure_data_delete_policy" 
  ON public.project_secure_data
  FOR DELETE 
  TO authenticated 
  USING (true);

-- ============= EQUIPMENT - EXPLICIT POLICIES =============
CREATE POLICY "equipment_select_policy" 
  ON public.equipment
  FOR SELECT 
  TO authenticated, anon
  USING (true);

CREATE POLICY "equipment_insert_policy" 
  ON public.equipment
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "equipment_update_policy" 
  ON public.equipment
  FOR UPDATE 
  TO authenticated 
  USING (true)
  WITH CHECK (true);

CREATE POLICY "equipment_delete_policy" 
  ON public.equipment
  FOR DELETE 
  TO authenticated 
  USING (true);

-- ============= SECURE_DATA_AUDIT_LOG - EXPLICIT POLICIES =============
CREATE POLICY "audit_log_select_policy" 
  ON public.secure_data_audit_log
  FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "audit_log_insert_policy" 
  ON public.secure_data_audit_log
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

-- ============= EQUIPMENT_CREDENTIALS - EXPLICIT POLICIES =============
CREATE POLICY "equipment_creds_select_policy" 
  ON public.equipment_credentials
  FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "equipment_creds_insert_policy" 
  ON public.equipment_credentials
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "equipment_creds_update_policy" 
  ON public.equipment_credentials
  FOR UPDATE 
  TO authenticated 
  USING (true)
  WITH CHECK (true);

CREATE POLICY "equipment_creds_delete_policy" 
  ON public.equipment_credentials
  FOR DELETE 
  TO authenticated 
  USING (true);

-- Verify policies were created
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies 
WHERE tablename IN ('project_secure_data', 'equipment', 'secure_data_audit_log', 'equipment_credentials')
ORDER BY tablename, cmd;
