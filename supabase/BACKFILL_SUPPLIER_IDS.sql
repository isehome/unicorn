-- ============================================================
-- BACKFILL SUPPLIER IDs
-- Links existing equipment to suppliers based on supplier name
-- ============================================================

-- This script fixes equipment that has supplier (text) but no supplier_id (UUID)
-- Run this if you're getting "Cannot create POs: Selected items are missing supplier_id"

-- Step 1: Show equipment that needs fixing
SELECT
  pe.id,
  pe.name,
  pe.supplier as supplier_name,
  pe.supplier_id,
  s.id as matched_supplier_id,
  s.name as matched_supplier_name
FROM project_equipment pe
LEFT JOIN suppliers s ON LOWER(TRIM(pe.supplier)) = LOWER(TRIM(s.name))
WHERE pe.supplier IS NOT NULL
  AND pe.supplier_id IS NULL
ORDER BY pe.supplier, pe.name
LIMIT 100;

-- Step 2: Update equipment with matching supplier_ids
UPDATE project_equipment pe
SET supplier_id = s.id
FROM suppliers s
WHERE LOWER(TRIM(pe.supplier)) = LOWER(TRIM(s.name))
  AND pe.supplier IS NOT NULL
  AND pe.supplier_id IS NULL;

-- Step 3: Show how many were updated
SELECT
  COUNT(*) FILTER (WHERE supplier_id IS NOT NULL) as items_with_supplier_id,
  COUNT(*) FILTER (WHERE supplier IS NOT NULL AND supplier_id IS NULL) as items_still_missing_supplier_id,
  COUNT(*) as total_items
FROM project_equipment
WHERE supplier IS NOT NULL;

-- Step 4: Show remaining items that couldn't be matched
SELECT
  DISTINCT pe.supplier as unmatched_supplier_name,
  COUNT(*) as item_count
FROM project_equipment pe
LEFT JOIN suppliers s ON LOWER(TRIM(pe.supplier)) = LOWER(TRIM(s.name))
WHERE pe.supplier IS NOT NULL
  AND pe.supplier_id IS NULL
  AND s.id IS NULL
GROUP BY pe.supplier
ORDER BY item_count DESC;

COMMENT ON TABLE project_equipment IS
  'Equipment items now have both supplier (text name) and supplier_id (foreign key to suppliers table). The supplier_id is used for PO generation.';
