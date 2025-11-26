-- ============================================================
-- Fix Stakeholder Duplicates (Orders & Accounting)
-- ============================================================
-- This targets the project_stakeholders table (unified table)
-- Constraint: unique (project_id, contact_id, stakeholder_role_id)

BEGIN;

-- Step 1: Show current duplicates
SELECT
  'BEFORE CLEANUP' as status,
  COUNT(*) as total_records,
  (SELECT COUNT(*) FROM (
    SELECT project_id, contact_id, stakeholder_role_id
    FROM public.project_stakeholders
    GROUP BY project_id, contact_id, stakeholder_role_id
    HAVING COUNT(*) > 1
  ) dups) as duplicate_combinations
FROM public.project_stakeholders;

-- Step 2: Show which projects/contacts have duplicates
SELECT
  p.name as project_name,
  sr.name as role_name,
  c.full_name as contact_name,
  c.email,
  COUNT(*) as duplicate_count
FROM public.project_stakeholders ps
JOIN public.projects p ON ps.project_id = p.id
JOIN public.contacts c ON ps.contact_id = c.id
JOIN public.stakeholder_roles sr ON ps.stakeholder_role_id = sr.id
GROUP BY p.name, sr.name, c.full_name, c.email
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Step 3: Delete duplicates
-- Keep only the oldest record for each (project_id, contact_id, stakeholder_role_id)
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

-- Step 4: Verify the constraint exists
DO $$
BEGIN
  -- Check if constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_project_contact_role'
    AND conrelid = 'public.project_stakeholders'::regclass
  ) THEN
    -- Try alternate constraint name from migration
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'unique_contact_role_per_project'
      AND conrelid = 'public.project_stakeholders'::regclass
    ) THEN
      -- Add the constraint
      ALTER TABLE public.project_stakeholders
        ADD CONSTRAINT unique_project_contact_role
        UNIQUE (project_id, contact_id, stakeholder_role_id);
      RAISE NOTICE 'Unique constraint added to project_stakeholders';
    ELSE
      RAISE NOTICE 'Constraint exists as unique_contact_role_per_project';
    END IF;
  ELSE
    RAISE NOTICE 'Constraint already exists on project_stakeholders';
  END IF;
END $$;

-- Step 5: Show results
SELECT
  'AFTER CLEANUP' as status,
  COUNT(*) as total_records,
  (SELECT COUNT(*) FROM (
    SELECT project_id, contact_id, stakeholder_role_id
    FROM public.project_stakeholders
    GROUP BY project_id, contact_id, stakeholder_role_id
    HAVING COUNT(*) > 1
  ) dups) as remaining_duplicates
FROM public.project_stakeholders;

COMMIT;

-- Final verification - should return NO rows
SELECT
  p.name as project_name,
  sr.name as role_name,
  c.full_name as contact_name,
  c.email,
  COUNT(*) as duplicate_count
FROM public.project_stakeholders ps
JOIN public.projects p ON ps.project_id = p.id
JOIN public.contacts c ON ps.contact_id = c.id
JOIN public.stakeholder_roles sr ON ps.stakeholder_role_id = sr.id
GROUP BY p.name, sr.name, c.full_name, c.email
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
