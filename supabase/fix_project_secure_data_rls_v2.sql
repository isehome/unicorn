-- Fix RLS policies for project_secure_data table - Version 2
-- This version drops ALL policies first to ensure clean slate

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

-- Now create the correct policies

-- SELECT policy - authenticated users can view all secure data
CREATE POLICY "Secure data viewable by authenticated" 
  ON public.project_secure_data
  FOR SELECT 
  TO authenticated 
  USING (true);

-- INSERT policy - authenticated users can create secure data
CREATE POLICY "Secure data insertable by authenticated" 
  ON public.project_secure_data
  FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

-- UPDATE policy - authenticated users can update secure data
CREATE POLICY "Secure data updatable by authenticated" 
  ON public.project_secure_data
  FOR UPDATE 
  TO authenticated 
  USING (true)
  WITH CHECK (true);

-- DELETE policy - authenticated users can delete secure data
CREATE POLICY "Secure data deletable by authenticated" 
  ON public.project_secure_data
  FOR DELETE 
  TO authenticated 
  USING (true);
