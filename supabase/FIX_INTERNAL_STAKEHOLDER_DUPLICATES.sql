-- ============================================================
-- Fix INTERNAL Stakeholder Duplicates (Orders & Accounting)
-- ============================================================
-- This targets the project_internal_stakeholders table
-- which has constraint: unique (project_id, role_id)

BEGIN;

-- Step 1: Show current duplicates
SELECT
  'BEFORE CLEANUP - Internal Stakeholders' as status,
  COUNT(*) as total_records,
  (SELECT COUNT(*) FROM (
    SELECT project_id, role_id
    FROM public.project_internal_stakeholders
    GROUP BY project_id, role_id
    HAVING COUNT(*) > 1
  ) dups) as duplicate_combinations
FROM public.project_internal_stakeholders;

-- Step 2: Show which projects have duplicates
SELECT
  p.name as project_name,
  sr.name as role_name,
  pis.email,
  COUNT(*) as duplicate_count
FROM public.project_internal_stakeholders pis
JOIN public.projects p ON pis.project_id = p.id
JOIN public.stakeholder_roles sr ON pis.role_id = sr.id
GROUP BY p.name, sr.name, pis.email
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Step 3: Delete duplicates from project_internal_stakeholders
-- Keep only the oldest record for each (project_id, role_id) combination
DELETE FROM public.project_internal_stakeholders
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY project_id, role_id
        ORDER BY created_at ASC, id ASC
      ) as row_num
    FROM public.project_internal_stakeholders
  ) ranked
  WHERE row_num > 1
);

-- Step 4: Verify the constraint exists
DO $$
BEGIN
  -- Check if constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'project_internal_stakeholders_unique'
    AND conrelid = 'public.project_internal_stakeholders'::regclass
  ) THEN
    -- Add the constraint
    ALTER TABLE public.project_internal_stakeholders
      ADD CONSTRAINT project_internal_stakeholders_unique
      UNIQUE (project_id, role_id);
    RAISE NOTICE 'Unique constraint added to project_internal_stakeholders';
  ELSE
    RAISE NOTICE 'Constraint already exists on project_internal_stakeholders';
  END IF;
END $$;

-- Step 5: Show results
SELECT
  'AFTER CLEANUP - Internal Stakeholders' as status,
  COUNT(*) as total_records,
  (SELECT COUNT(*) FROM (
    SELECT project_id, role_id
    FROM public.project_internal_stakeholders
    GROUP BY project_id, role_id
    HAVING COUNT(*) > 1
  ) dups) as remaining_duplicates
FROM public.project_internal_stakeholders;

COMMIT;

-- Final verification - should return NO rows
SELECT
  p.name as project_name,
  sr.name as role_name,
  pis.email,
  COUNT(*) as duplicate_count
FROM public.project_internal_stakeholders pis
JOIN public.projects p ON pis.project_id = p.id
JOIN public.stakeholder_roles sr ON pis.role_id = sr.id
GROUP BY p.name, sr.name, pis.email
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
