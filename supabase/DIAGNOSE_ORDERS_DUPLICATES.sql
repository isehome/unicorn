-- ============================================================
-- Diagnose Orders Duplicates
-- ============================================================
-- Find out WHY we still have duplicate Orders

-- Step 1: Show ALL Orders entries with full details
SELECT
  ps.id,
  ps.project_id,
  p.name as project_name,
  ps.contact_id,
  c.full_name as contact_name,
  c.email,
  ps.stakeholder_role_id,
  sr.name as role_name,
  ps.created_at,
  ps.is_primary
FROM public.project_stakeholders ps
LEFT JOIN public.projects p ON ps.project_id = p.id
LEFT JOIN public.contacts c ON ps.contact_id = c.id
LEFT JOIN public.stakeholder_roles sr ON ps.stakeholder_role_id = sr.id
WHERE sr.name = 'Orders'
ORDER BY p.name, ps.created_at;

-- Step 2: Check if constraint exists
SELECT
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
FROM pg_constraint
WHERE conrelid = 'public.project_stakeholders'::regclass
  AND contype = 'u'; -- unique constraints only

-- Step 3: Find exact duplicates
SELECT
  project_id,
  contact_id,
  stakeholder_role_id,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ') as record_ids
FROM public.project_stakeholders
GROUP BY project_id, contact_id, stakeholder_role_id
HAVING COUNT(*) > 1;

-- Step 4: Show NULL values that might be causing issues
SELECT
  'NULL contact_id or role_id' as issue,
  COUNT(*) as affected_records
FROM public.project_stakeholders ps
JOIN public.stakeholder_roles sr ON ps.stakeholder_role_id = sr.id
WHERE sr.name IN ('Orders', 'Accounting')
  AND (ps.contact_id IS NULL OR ps.stakeholder_role_id IS NULL);
