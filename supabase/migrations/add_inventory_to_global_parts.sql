-- Add inventory management fields to global_parts table
-- This allows tracking stock levels at the global part level rather than per-project

ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS quantity_on_hand INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS reorder_point INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS reorder_quantity INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS warehouse_location TEXT,
ADD COLUMN IF NOT EXISTS last_inventory_check TIMESTAMPTZ;

-- Add comments for documentation
COMMENT ON COLUMN global_parts.quantity_on_hand IS 'Current stock level available across all projects';
COMMENT ON COLUMN global_parts.reorder_point IS 'Minimum quantity before reordering (optional)';
COMMENT ON COLUMN global_parts.reorder_quantity IS 'Standard order quantity when restocking (optional)';
COMMENT ON COLUMN global_parts.warehouse_location IS 'Physical location in warehouse (optional)';
COMMENT ON COLUMN global_parts.last_inventory_check IS 'Last time inventory was physically verified';

-- Create index for inventory queries
CREATE INDEX IF NOT EXISTS idx_global_parts_inventory ON global_parts(quantity_on_hand) WHERE is_inventory_item = true;

-- Add constraint to ensure quantity_on_hand is not negative
ALTER TABLE global_parts
ADD CONSTRAINT chk_quantity_on_hand_non_negative CHECK (quantity_on_hand >= 0);
