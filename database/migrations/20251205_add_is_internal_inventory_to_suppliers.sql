-- Migration: Add is_internal_inventory flag to suppliers table
-- This simplifies internal inventory handling by treating it as a real vendor with a flag
-- instead of string matching against supplier name

-- Add the flag column
ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS is_internal_inventory BOOLEAN DEFAULT FALSE;

-- Update existing "Internal Inventory" supplier to have the flag set
UPDATE suppliers
SET is_internal_inventory = TRUE
WHERE name = 'Internal Inventory';

-- Add index for efficient queries on the flag
CREATE INDEX IF NOT EXISTS idx_suppliers_is_internal_inventory
ON suppliers(is_internal_inventory)
WHERE is_internal_inventory = TRUE;

-- Add a comment explaining the column
COMMENT ON COLUMN suppliers.is_internal_inventory IS
'When true, this supplier represents internal warehouse inventory. PO submissions for this supplier will decrement global_parts.quantity_on_hand instead of expecting external fulfillment.';
