-- ============================================================
-- OPTION B: Remove ALL Orders & Accounting Stakeholders
-- ============================================================
-- This completely removes all Orders and Accounting stakeholder
-- assignments from all projects. The app will re-add them fresh.

BEGIN;

-- Step 1: Show what we're about to delete
SELECT
  'BEFORE REMOVAL' as status,
  sr.name as role_name,
  COUNT(*) as total_assignments
FROM public.project_stakeholders ps
JOIN public.stakeholder_roles sr ON ps.stakeholder_role_id = sr.id
WHERE sr.name IN ('Orders', 'Accounting')
GROUP BY sr.name;

-- Show breakdown by project
SELECT
  p.name as project_name,
  sr.name as role_name,
  COUNT(*) as assignment_count
FROM public.project_stakeholders ps
JOIN public.projects p ON ps.project_id = p.id
JOIN public.stakeholder_roles sr ON ps.stakeholder_role_id = sr.id
WHERE sr.name IN ('Orders', 'Accounting')
GROUP BY p.name, sr.name
ORDER BY p.name, sr.name;

-- Step 2: Delete ALL Orders and Accounting assignments
DELETE FROM public.project_stakeholders
WHERE stakeholder_role_id IN (
  SELECT id
  FROM public.stakeholder_roles
  WHERE name IN ('Orders', 'Accounting')
);

-- Step 3: Show results
SELECT
  'AFTER REMOVAL' as status,
  COUNT(*) as remaining_orders_accounting
FROM public.project_stakeholders ps
JOIN public.stakeholder_roles sr ON ps.stakeholder_role_id = sr.id
WHERE sr.name IN ('Orders', 'Accounting');

COMMIT;

-- Verification - should return 0 rows
SELECT
  p.name as project_name,
  sr.name as role_name,
  COUNT(*) as assignment_count
FROM public.project_stakeholders ps
JOIN public.projects p ON ps.project_id = p.id
JOIN public.stakeholder_roles sr ON ps.stakeholder_role_id = sr.id
WHERE sr.name IN ('Orders', 'Accounting')
GROUP BY p.name, sr.name;
