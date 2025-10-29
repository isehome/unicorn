-- ============================================================
-- FLAG SEED SUPPLIERS
-- Marks fake seed suppliers as test data for easy identification
-- ============================================================

-- Add column to track seed/test suppliers if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'suppliers'
    AND column_name = 'is_seed_data'
  ) THEN
    ALTER TABLE suppliers
    ADD COLUMN is_seed_data BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Flag known seed suppliers from procurement_system_fixed.sql
UPDATE suppliers
SET is_seed_data = true, notes = COALESCE(notes || E'\n', '') || 'SEED DATA - Created from SQL migration (not from real import)'
WHERE name IN (
  'Amazon Business',
  'Crestron Electronics',
  'Control4',
  'Home Depot Pro',
  'Origin Acoustics'
)
AND is_seed_data IS NOT true; -- Don't update if already flagged

-- Add comment
COMMENT ON COLUMN suppliers.is_seed_data IS
  'True if this supplier was created from SQL seed data (not from real CSV import). These can be safely deleted or hidden in production.';

-- Optional: Delete seed suppliers entirely (commented out for safety)
-- Uncomment the following lines if you want to delete seed suppliers instead of just flagging them:
/*
DELETE FROM suppliers
WHERE is_seed_data = true
AND id NOT IN (
  SELECT DISTINCT supplier_id FROM project_equipment WHERE supplier_id IS NOT NULL
  UNION
  SELECT DISTINCT supplier_id FROM purchase_orders WHERE supplier_id IS NOT NULL
);
*/

-- Show results
SELECT
  name,
  short_code,
  is_seed_data,
  is_active,
  contact_name,
  email,
  notes
FROM suppliers
ORDER BY is_seed_data DESC, name;
