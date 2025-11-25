-- ============================================================
-- Fix Duplicate Stakeholders Issue
-- ============================================================
-- This script:
-- 1. Removes duplicate stakeholder assignments
-- 2. Ensures proper unique constraints exist
-- 3. Prevents future duplicates

BEGIN;

-- Step 1: Identify and log duplicates before cleanup
DO $$
DECLARE
  duplicate_count integer;
BEGIN
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT project_id, contact_id, stakeholder_role_id, COUNT(*) as cnt
    FROM public.project_stakeholders
    GROUP BY project_id, contact_id, stakeholder_role_id
    HAVING COUNT(*) > 1
  ) duplicates;

  RAISE NOTICE 'Found % duplicate stakeholder assignments', duplicate_count;
END $$;

-- Step 2: Create a temporary table with unique stakeholders (keeping the oldest)
CREATE TEMP TABLE stakeholders_to_keep AS
SELECT DISTINCT ON (project_id, contact_id, stakeholder_role_id)
  id,
  project_id,
  contact_id,
  stakeholder_role_id
FROM public.project_stakeholders
ORDER BY project_id, contact_id, stakeholder_role_id, created_at ASC;

-- Step 3: Delete duplicate records (keeping only the ones in stakeholders_to_keep)
DELETE FROM public.project_stakeholders
WHERE id NOT IN (SELECT id FROM stakeholders_to_keep);

-- Step 4: Ensure the unique constraint exists
-- First, drop it if it exists with a different name
DO $$
BEGIN
  -- Drop any existing constraints with different names
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_contact_role_per_project'
    AND conrelid = 'public.project_stakeholders'::regclass
  ) THEN
    ALTER TABLE public.project_stakeholders
      DROP CONSTRAINT unique_contact_role_per_project;
  END IF;
END $$;

-- Add the constraint with the correct name
ALTER TABLE public.project_stakeholders
  ADD CONSTRAINT unique_project_contact_role
  UNIQUE (project_id, contact_id, stakeholder_role_id);

-- Step 5: Verify the fix
DO $$
DECLARE
  remaining_duplicates integer;
  total_stakeholders integer;
BEGIN
  -- Check for remaining duplicates
  SELECT COUNT(*) INTO remaining_duplicates
  FROM (
    SELECT project_id, contact_id, stakeholder_role_id, COUNT(*) as cnt
    FROM public.project_stakeholders
    GROUP BY project_id, contact_id, stakeholder_role_id
    HAVING COUNT(*) > 1
  ) duplicates;

  -- Get total count
  SELECT COUNT(*) INTO total_stakeholders
  FROM public.project_stakeholders;

  RAISE NOTICE 'Cleanup complete!';
  RAISE NOTICE 'Total stakeholder assignments: %', total_stakeholders;
  RAISE NOTICE 'Remaining duplicates: %', remaining_duplicates;

  IF remaining_duplicates > 0 THEN
    RAISE WARNING 'Still have % duplicate assignments! Manual intervention required.', remaining_duplicates;
  END IF;
END $$;

COMMIT;

-- Display summary of stakeholders by project
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
ORDER BY p.name, sr.name;
