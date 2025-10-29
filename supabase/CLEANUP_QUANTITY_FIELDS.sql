-- ============================================================
-- CLEANUP QUANTITY FIELDS
-- Simplify to 3-field system: Required, Ordered (calculated), Received
-- ============================================================

-- Step 1: Rename planned_quantity to quantity_required (clearer naming)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_equipment'
    AND column_name = 'planned_quantity'
  ) THEN
    ALTER TABLE project_equipment
    RENAME COLUMN planned_quantity TO quantity_required;
  END IF;
END $$;

-- Step 2: Remove ordered_quantity (we calculate this from PO items)
-- First, drop any constraints that reference ordered_quantity
ALTER TABLE project_equipment
DROP CONSTRAINT IF EXISTS project_equipment_quantity_check;

-- Drop the column
ALTER TABLE project_equipment
DROP COLUMN IF EXISTS ordered_quantity;

-- Step 3: Update quantity_received constraint
-- It should only check against quantity_required now
ALTER TABLE project_equipment
ADD CONSTRAINT quantity_received_check
CHECK (quantity_received >= 0 AND quantity_received <= quantity_required);

-- Step 4: Update comments for clarity
COMMENT ON COLUMN project_equipment.quantity_required IS
  'Total quantity required for this project';

COMMENT ON COLUMN project_equipment.quantity_received IS
  'Total quantity received on site (from all sources: POs, manual receiving, etc.)';

-- Step 5: Create a view for easy querying with calculated fields
CREATE OR REPLACE VIEW project_equipment_with_po_status AS
SELECT
  pe.*,

  -- Calculate quantity in draft POs
  COALESCE(SUM(
    CASE WHEN po.status = 'draft'
    THEN poi.quantity_ordered
    ELSE 0 END
  ), 0) as quantity_in_draft_pos,

  -- Calculate quantity in submitted/confirmed POs (actually ordered)
  COALESCE(SUM(
    CASE WHEN po.status IN ('submitted', 'confirmed', 'partially_received', 'received')
    THEN poi.quantity_ordered
    ELSE 0 END
  ), 0) as quantity_ordered,

  -- Calculate quantity still needed
  pe.quantity_required - COALESCE(SUM(poi.quantity_ordered), 0) as quantity_needed,

  -- Status flags for UI
  CASE
    WHEN COALESCE(SUM(CASE WHEN po.status = 'draft' THEN poi.quantity_ordered ELSE 0 END), 0) > 0
      AND COALESCE(SUM(CASE WHEN po.status IN ('submitted', 'confirmed', 'partially_received', 'received') THEN poi.quantity_ordered ELSE 0 END), 0) = 0
    THEN true
    ELSE false
  END as has_draft_po_only,

  CASE
    WHEN pe.quantity_required <= COALESCE(SUM(poi.quantity_ordered), 0)
    THEN true
    ELSE false
  END as is_fully_ordered

FROM project_equipment pe
LEFT JOIN purchase_order_items poi ON poi.project_equipment_id = pe.id
LEFT JOIN purchase_orders po ON po.id = poi.po_id
GROUP BY pe.id;

-- Grant permissions
GRANT SELECT ON project_equipment_with_po_status TO anon, authenticated;

COMMENT ON VIEW project_equipment_with_po_status IS
  'Equipment with calculated PO quantities. Use this view instead of querying project_equipment directly when you need order status.';

-- Step 6: Update indexes
DROP INDEX IF EXISTS idx_equipment_ordered;
CREATE INDEX idx_equipment_required ON project_equipment(project_id, quantity_required);
CREATE INDEX idx_equipment_received ON project_equipment(project_id, quantity_received);

-- Step 7: Remove old ordered_confirmed column if it exists
ALTER TABLE project_equipment
DROP COLUMN IF EXISTS ordered_confirmed;

ALTER TABLE project_equipment
DROP COLUMN IF EXISTS onsite_confirmed;

COMMENT ON TABLE project_equipment IS
  'Project equipment list with quantity tracking.
  - quantity_required: What the project needs (from CSV import)
  - quantity_received: What has been received on site (updated via PO receiving or manual entry)
  - Quantity ordered is calculated from purchase_order_items (not stored here)';
