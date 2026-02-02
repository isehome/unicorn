-- ============================================================================
-- FIX EMPLOYEE NOTES RLS POLICIES - V3
-- Created: 2026-01-30
--
-- SIMPLER FIX: Use a single permissive ALL policy for admins/owners
-- ============================================================================

-- Drop ALL existing policies on employee_notes
DROP POLICY IF EXISTS "Authors can view own notes" ON employee_notes;
DROP POLICY IF EXISTS "Managers can view report notes" ON employee_notes;
DROP POLICY IF EXISTS "Employees can view notes about self" ON employee_notes;
DROP POLICY IF EXISTS "Users can create notes" ON employee_notes;
DROP POLICY IF EXISTS "Authors can update own notes" ON employee_notes;
DROP POLICY IF EXISTS "Authors can delete own notes" ON employee_notes;
DROP POLICY IF EXISTS "Admins can manage all notes" ON employee_notes;
DROP POLICY IF EXISTS "Admins can view all notes" ON employee_notes;
DROP POLICY IF EXISTS "Owners full access" ON employee_notes;

-- Ensure RLS is enabled
ALTER TABLE employee_notes ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- ADMIN/OWNER FULL ACCESS (checked first due to being more permissive)
-- ============================================================================

CREATE POLICY "Owners full access" ON employee_notes
  FOR ALL
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'owner')
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'owner')
  );

-- ============================================================================
-- SELECT POLICIES (for non-admins)
-- ============================================================================

-- Authors can always see their own notes
CREATE POLICY "Authors can view own notes" ON employee_notes
  FOR SELECT USING (auth.uid() = author_id);

-- Employees can see non-private notes about themselves
CREATE POLICY "Employees can view notes about self" ON employee_notes
  FOR SELECT USING (
    subject_employee_id = auth.uid() AND is_private = false
  );

-- Managers can see non-private notes about their direct reports
CREATE POLICY "Managers can view report notes" ON employee_notes
  FOR SELECT USING (
    is_private = false AND
    EXISTS (
      SELECT 1 FROM manager_relationships mr
      WHERE mr.manager_id = auth.uid()
      AND mr.employee_id = employee_notes.subject_employee_id
      AND mr.is_primary = true
      AND mr.end_date IS NULL
    )
  );

-- ============================================================================
-- INSERT POLICY (for non-admins)
-- ============================================================================

CREATE POLICY "Users can create notes" ON employee_notes
  FOR INSERT WITH CHECK (
    auth.uid() = author_id
    AND (
      -- Writing about yourself
      subject_employee_id = auth.uid()
      OR
      -- Manager writing about direct report
      EXISTS (
        SELECT 1 FROM manager_relationships mr
        WHERE mr.manager_id = auth.uid()
        AND mr.employee_id = subject_employee_id
        AND mr.is_primary = true
        AND mr.end_date IS NULL
      )
    )
  );

-- ============================================================================
-- UPDATE POLICY (for non-admins)
-- ============================================================================

CREATE POLICY "Authors can update own notes" ON employee_notes
  FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- ============================================================================
-- DELETE POLICY (for non-admins)
-- ============================================================================

CREATE POLICY "Authors can delete own notes" ON employee_notes
  FOR DELETE USING (auth.uid() = author_id);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT ALL ON employee_notes TO authenticated;
