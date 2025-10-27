-- ============================================================
-- BACKFILL AND CREATE MISSING SUPPLIERS
-- Creates missing suppliers, then links equipment to them
-- ============================================================

-- Step 1: Find all unique supplier names from equipment that aren't in suppliers table
WITH missing_suppliers AS (
  SELECT DISTINCT
    TRIM(pe.supplier) as supplier_name
  FROM project_equipment pe
  LEFT JOIN suppliers s ON LOWER(TRIM(pe.supplier)) = LOWER(TRIM(s.name))
  WHERE pe.supplier IS NOT NULL
    AND pe.supplier != ''
    AND s.id IS NULL
)
SELECT
  supplier_name,
  -- Generate short code from first 3-5 characters
  CASE
    WHEN LENGTH(REGEXP_REPLACE(UPPER(supplier_name), '[^A-Z0-9]', '', 'g')) >= 3
    THEN SUBSTRING(REGEXP_REPLACE(UPPER(supplier_name), '[^A-Z0-9]', '', 'g'), 1, 5)
    ELSE UPPER(SUBSTRING(supplier_name, 1, 3))
  END as suggested_short_code
FROM missing_suppliers
ORDER BY supplier_name;

-- Step 2: Create missing suppliers automatically
INSERT INTO suppliers (name, short_code, is_active, notes)
SELECT DISTINCT
  TRIM(pe.supplier) as name,
  -- Generate short code: take first letter of each word (up to 5) or first 3-5 chars
  CASE
    -- Multi-word: first letter of each word
    WHEN TRIM(pe.supplier) ~ '\s' THEN
      UPPER(SUBSTRING(
        (SELECT STRING_AGG(SUBSTRING(word, 1, 1), '')
         FROM UNNEST(STRING_TO_ARRAY(TRIM(pe.supplier), ' ')) AS word),
        1, 5
      ))
    -- Single word: first 3-5 characters
    ELSE
      UPPER(SUBSTRING(REGEXP_REPLACE(TRIM(pe.supplier), '[^A-Z0-9]', '', 'gi'), 1, 5))
  END as short_code,
  true as is_active,
  'Auto-created from equipment backfill' as notes
FROM project_equipment pe
LEFT JOIN suppliers s ON LOWER(TRIM(pe.supplier)) = LOWER(TRIM(s.name))
WHERE pe.supplier IS NOT NULL
  AND pe.supplier != ''
  AND s.id IS NULL
  AND TRIM(pe.supplier) NOT IN (SELECT name FROM suppliers)
ON CONFLICT (short_code) DO UPDATE
  SET short_code = EXCLUDED.short_code || FLOOR(RANDOM() * 99)::TEXT;

-- Step 3: Now link ALL equipment to their suppliers
UPDATE project_equipment pe
SET supplier_id = s.id
FROM suppliers s
WHERE LOWER(TRIM(pe.supplier)) = LOWER(TRIM(s.name))
  AND pe.supplier IS NOT NULL
  AND pe.supplier_id IS NULL;

-- Step 4: Verify - show counts
SELECT
  COUNT(*) FILTER (WHERE supplier_id IS NOT NULL) as items_with_supplier_id,
  COUNT(*) FILTER (WHERE supplier IS NOT NULL AND supplier_id IS NULL) as items_still_missing_supplier_id,
  COUNT(*) as total_items
FROM project_equipment
WHERE supplier IS NOT NULL;

-- Step 5: Show newly created suppliers
SELECT
  name,
  short_code,
  is_active,
  notes,
  created_at
FROM suppliers
WHERE notes = 'Auto-created from equipment backfill'
ORDER BY created_at DESC;

-- Step 6: Verify all equipment now has supplier_id
SELECT
  pe.name,
  pe.supplier as supplier_name,
  pe.supplier_id,
  s.name as matched_supplier_name,
  s.short_code
FROM project_equipment pe
LEFT JOIN suppliers s ON pe.supplier_id = s.id
WHERE pe.supplier IS NOT NULL
ORDER BY pe.supplier, pe.name
LIMIT 20;
