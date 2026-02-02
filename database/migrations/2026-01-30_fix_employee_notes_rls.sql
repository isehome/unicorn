-- ============================================================================
-- FIX EMPLOYEE NOTES RLS POLICIES
-- Created: 2026-01-30
--
-- The original INSERT policy was too restrictive. This fix:
-- 1. Allows employees to write notes about themselves
-- 2. Allows managers to write notes about their direct reports
-- 3. Allows admins to write notes about anyone
-- ============================================================================

-- Drop existing INSERT policy
DROP POLICY IF EXISTS "Users can create notes" ON employee_notes;

-- Create a more permissive INSERT policy
CREATE POLICY "Users can create notes" ON employee_notes
  FOR INSERT WITH CHECK (
    -- Must be the author
    auth.uid() = author_id
    AND (
      -- Can write about yourself
      subject_employee_id = auth.uid()
      OR
      -- Managers can write about their direct reports
      EXISTS (
        SELECT 1 FROM manager_relationships mr
        WHERE mr.manager_id = auth.uid()
        AND mr.employee_id = subject_employee_id
        AND mr.is_primary = true
        AND mr.end_date IS NULL
      )
      OR
      -- Admins/owners can write about anyone
      EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'owner')
      )
    )
  );

-- Also ensure there's an ALL policy for admins to manage everything
DROP POLICY IF EXISTS "Admins can manage all notes" ON employee_notes;
CREATE POLICY "Admins can manage all notes" ON employee_notes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- Grant permissions
GRANT ALL ON employee_notes TO authenticated;
