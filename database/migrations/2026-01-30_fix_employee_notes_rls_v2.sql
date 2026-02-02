-- ============================================================================
-- FIX EMPLOYEE NOTES RLS POLICIES - V2
-- Created: 2026-01-30
--
-- COMPLETE FIX: Drops ALL policies and recreates them properly
-- Run this to fix 401 Unauthorized errors on employee_notes
-- ============================================================================

-- First, drop ALL existing policies on employee_notes
DROP POLICY IF EXISTS "Authors can view own notes" ON employee_notes;
DROP POLICY IF EXISTS "Managers can view report notes" ON employee_notes;
DROP POLICY IF EXISTS "Employees can view notes about self" ON employee_notes;
DROP POLICY IF EXISTS "Users can create notes" ON employee_notes;
DROP POLICY IF EXISTS "Authors can update own notes" ON employee_notes;
DROP POLICY IF EXISTS "Authors can delete own notes" ON employee_notes;
DROP POLICY IF EXISTS "Admins can manage all notes" ON employee_notes;
DROP POLICY IF EXISTS "Admins can view all notes" ON employee_notes;

-- Ensure RLS is enabled
ALTER TABLE employee_notes ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- SELECT POLICIES
-- ============================================================================

-- Authors can always see their own notes
CREATE POLICY "Authors can view own notes" ON employee_notes
  FOR SELECT USING (auth.uid() = author_id);

-- Employees can see non-private notes about themselves
CREATE POLICY "Employees can view notes about self" ON employee_notes
  FOR SELECT USING (
    subject_employee_id = auth.uid() AND NOT is_private
  );

-- Managers can see non-private notes about their direct reports
CREATE POLICY "Managers can view report notes" ON employee_notes
  FOR SELECT USING (
    NOT is_private AND
    EXISTS (
      SELECT 1 FROM manager_relationships mr
      WHERE mr.manager_id = auth.uid()
      AND mr.employee_id = employee_notes.subject_employee_id
      AND mr.is_primary = true
      AND mr.end_date IS NULL
    )
  );

-- Admins/owners can view all notes
CREATE POLICY "Admins can view all notes" ON employee_notes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- ============================================================================
-- INSERT POLICY
-- ============================================================================

-- Users can create notes if:
-- 1. They are the author AND
-- 2. They're writing about themselves, OR
-- 3. They're a manager of the subject, OR
-- 4. They're an admin/owner
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
      OR
      -- Admin/owner can write about anyone
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'owner')
      )
    )
  );

-- ============================================================================
-- UPDATE POLICY
-- ============================================================================

-- Authors can update their own notes
CREATE POLICY "Authors can update own notes" ON employee_notes
  FOR UPDATE USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- ============================================================================
-- DELETE POLICY
-- ============================================================================

-- Authors can delete their own notes
CREATE POLICY "Authors can delete own notes" ON employee_notes
  FOR DELETE USING (auth.uid() = author_id);

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT ALL ON employee_notes TO authenticated;

-- ============================================================================
-- VERIFICATION
-- Run this query to verify policies were created:
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'employee_notes';
-- ============================================================================
