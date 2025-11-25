-- ============================================================
-- AGGRESSIVE Duplicate Stakeholder Removal
-- ============================================================
-- This script forcefully removes ALL duplicate stakeholder assignments
-- keeping only the oldest one for each unique combination

BEGIN;

-- Show what we're about to delete
SELECT
  'BEFORE CLEANUP' as status,
  COUNT(*) as total_records,
  COUNT(*) - COUNT(DISTINCT (project_id, contact_id, stakeholder_role_id)) as duplicates_to_remove
FROM public.project_stakeholders;

-- Delete duplicates, keeping only the oldest record for each unique combination
DELETE FROM public.project_stakeholders
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY project_id, contact_id, stakeholder_role_id
        ORDER BY created_at ASC, id ASC
      ) as row_num
    FROM public.project_stakeholders
  ) ranked
  WHERE row_num > 1
);

-- Show results
SELECT
  'AFTER CLEANUP' as status,
  COUNT(*) as total_records,
  COUNT(*) - COUNT(DISTINCT (project_id, contact_id, stakeholder_role_id)) as remaining_duplicates
FROM public.project_stakeholders;

-- Add the constraint if it doesn't exist
DO $$
BEGIN
  -- Try to add the constraint
  BEGIN
    ALTER TABLE public.project_stakeholders
      ADD CONSTRAINT unique_project_contact_role
      UNIQUE (project_id, contact_id, stakeholder_role_id);
    RAISE NOTICE 'Unique constraint added successfully';
  EXCEPTION
    WHEN duplicate_table THEN
      RAISE NOTICE 'Constraint already exists';
    WHEN unique_violation THEN
      RAISE WARNING 'Cannot add constraint - duplicates still exist!';
    WHEN OTHERS THEN
      RAISE WARNING 'Error adding constraint: %', SQLERRM;
  END;
END $$;

COMMIT;

-- Final verification - this should return NO rows
SELECT
  p.name as project_name,
  sr.name as role_name,
  c.full_name as contact_name,
  c.email,
  COUNT(*) as assignment_count
FROM public.project_stakeholders ps
JOIN public.projects p ON ps.project_id = p.id
JOIN public.contacts c ON ps.contact_id = c.id
JOIN public.stakeholder_roles sr ON ps.stakeholder_role_id = sr.id
GROUP BY p.name, sr.name, c.full_name, c.email
HAVING COUNT(*) > 1
ORDER BY assignment_count DESC;
