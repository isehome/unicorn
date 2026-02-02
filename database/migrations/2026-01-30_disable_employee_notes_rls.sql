-- ============================================================================
-- DISABLE RLS ON EMPLOYEE_NOTES TABLE
-- Created: 2026-01-30
--
-- Since we use MSAL (Microsoft Authentication) instead of Supabase Auth,
-- the auth.uid() function always returns NULL, making RLS policies fail.
--
-- The application handles authorization at the application layer.
-- ============================================================================

-- Disable RLS on employee_notes
ALTER TABLE employee_notes DISABLE ROW LEVEL SECURITY;

-- Drop all policies (clean up)
DROP POLICY IF EXISTS "Authors can view own notes" ON employee_notes;
DROP POLICY IF EXISTS "Managers can view report notes" ON employee_notes;
DROP POLICY IF EXISTS "Employees can view notes about self" ON employee_notes;
DROP POLICY IF EXISTS "Users can create notes" ON employee_notes;
DROP POLICY IF EXISTS "Authors can update own notes" ON employee_notes;
DROP POLICY IF EXISTS "Authors can delete own notes" ON employee_notes;
DROP POLICY IF EXISTS "Admins can manage all notes" ON employee_notes;
DROP POLICY IF EXISTS "Admins can view all notes" ON employee_notes;
DROP POLICY IF EXISTS "Owners full access" ON employee_notes;

-- Ensure authenticated users can access the table
GRANT ALL ON employee_notes TO authenticated;
GRANT ALL ON employee_notes TO anon;
