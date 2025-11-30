-- =====================================================
-- FIX INSTALLED_BY FOREIGN KEY CONSTRAINT
-- =====================================================
-- Issue: installed_by references auth.users(id) but may receive
-- invalid UUID or empty string instead of proper null handling
-- =====================================================

-- Drop the problematic constraint if it exists
ALTER TABLE project_equipment
DROP CONSTRAINT IF EXISTS project_equipment_installed_by_fkey;

-- Re-add with proper NULL handling and ON DELETE behavior
-- Using profiles table for consistency with the codebase pattern
ALTER TABLE project_equipment
ADD CONSTRAINT project_equipment_installed_by_fkey
FOREIGN KEY (installed_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- Also fix similar constraints for other *_by columns if they exist
ALTER TABLE project_equipment
DROP CONSTRAINT IF EXISTS project_equipment_delivered_confirmed_by_fkey;

ALTER TABLE project_equipment
ADD CONSTRAINT project_equipment_delivered_confirmed_by_fkey
FOREIGN KEY (delivered_confirmed_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE project_equipment
DROP CONSTRAINT IF EXISTS project_equipment_received_by_fkey;

ALTER TABLE project_equipment
ADD CONSTRAINT project_equipment_received_by_fkey
FOREIGN KEY (received_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE project_equipment
DROP CONSTRAINT IF EXISTS project_equipment_ordered_confirmed_by_fkey;

ALTER TABLE project_equipment
ADD CONSTRAINT project_equipment_ordered_confirmed_by_fkey
FOREIGN KEY (ordered_confirmed_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- Verify the constraints are in place
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'project_equipment'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name LIKE '%_by';

SELECT 'Fixed installed_by and related foreign key constraints' as status;
