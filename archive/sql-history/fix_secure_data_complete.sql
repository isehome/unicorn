-- Comprehensive fix for Secure Data Manager
-- This fixes RLS policies for equipment, project_secure_data, and audit log tables

-- ============= EQUIPMENT TABLE RLS =============
-- Drop existing equipment policies
DROP POLICY IF EXISTS "Equipment viewable by everyone" ON public.equipment;
DROP POLICY IF EXISTS "Equipment editable by authenticated users" ON public.equipment;

-- Create new equipment policies
CREATE POLICY "Equipment viewable by authenticated" 
  ON public.equipment
  FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Equipment insertable by authenticated" 
  ON public.equipment
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Equipment updatable by authenticated" 
  ON public.equipment
  FOR UPDATE 
  TO authenticated 
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Equipment deletable by authenticated" 
  ON public.equipment
  FOR DELETE 
  TO authenticated 
  USING (true);

-- ============= PROJECT_SECURE_DATA TABLE RLS =============
-- Drop ALL existing policies on project_secure_data
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'project_secure_data' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.project_secure_data', pol.policyname);
    END LOOP;
END $$;

-- Create new project_secure_data policies
CREATE POLICY "Secure data viewable by authenticated" 
  ON public.project_secure_data
  FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Secure data insertable by authenticated" 
  ON public.project_secure_data
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Secure data updatable by authenticated" 
  ON public.project_secure_data
  FOR UPDATE 
  TO authenticated 
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Secure data deletable by authenticated" 
  ON public.project_secure_data
  FOR DELETE 
  TO authenticated 
  USING (true);

-- ============= SECURE_DATA_AUDIT_LOG TABLE RLS =============
-- Drop existing audit log policies
DROP POLICY IF EXISTS "Audit log viewable by authenticated" ON public.secure_data_audit_log;
DROP POLICY IF EXISTS "Audit log insertable by authenticated" ON public.secure_data_audit_log;

-- Create new audit log policies
CREATE POLICY "Audit log viewable by authenticated" 
  ON public.secure_data_audit_log
  FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Audit log insertable by authenticated" 
  ON public.secure_data_audit_log
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

-- ============= EQUIPMENT_CREDENTIALS TABLE RLS =============
-- Drop existing equipment credentials policies
DROP POLICY IF EXISTS "Equipment credentials viewable by authenticated" ON public.equipment_credentials;
DROP POLICY IF EXISTS "Equipment credentials editable by authenticated" ON public.equipment_credentials;

-- Create new equipment credentials policies
CREATE POLICY "Equipment credentials viewable by authenticated" 
  ON public.equipment_credentials
  FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Equipment credentials insertable by authenticated" 
  ON public.equipment_credentials
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Equipment credentials updatable by authenticated" 
  ON public.equipment_credentials
  FOR UPDATE 
  TO authenticated 
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Equipment credentials deletable by authenticated" 
  ON public.equipment_credentials
  FOR DELETE 
  TO authenticated 
  USING (true);
