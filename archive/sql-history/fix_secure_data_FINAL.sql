-- FINAL FIX: Drop ALL policies then recreate
-- This version drops every policy regardless of name

-- ============= DROP ALL EXISTING POLICIES =============
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    -- Drop all policies on equipment table
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'equipment' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.equipment', pol.policyname);
    END LOOP;
    
    -- Drop all policies on project_secure_data table
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'project_secure_data' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.project_secure_data', pol.policyname);
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

-- ============= EQUIPMENT TABLE - NEW POLICIES =============
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

-- ============= PROJECT_SECURE_DATA TABLE - NEW POLICIES =============
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

-- ============= SECURE_DATA_AUDIT_LOG TABLE - NEW POLICIES =============
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

-- ============= EQUIPMENT_CREDENTIALS TABLE - NEW POLICIES =============
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
