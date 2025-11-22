-- =====================================================
-- COMPLETE PROCUREMENT SETUP MIGRATION
-- Combines all procurement-related migrations into one
-- =====================================================

-- =====================================================
-- PART 1: Add inventory fields to global_parts
-- =====================================================

-- Add inventory management fields to global_parts table
DO $$
BEGIN
  -- Add columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'global_parts' AND column_name = 'quantity_on_hand') THEN
    ALTER TABLE global_parts ADD COLUMN quantity_on_hand INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'global_parts' AND column_name = 'reorder_point') THEN
    ALTER TABLE global_parts ADD COLUMN reorder_point INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'global_parts' AND column_name = 'reorder_quantity') THEN
    ALTER TABLE global_parts ADD COLUMN reorder_quantity INTEGER DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'global_parts' AND column_name = 'warehouse_location') THEN
    ALTER TABLE global_parts ADD COLUMN warehouse_location TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'global_parts' AND column_name = 'last_inventory_check') THEN
    ALTER TABLE global_parts ADD COLUMN last_inventory_check TIMESTAMPTZ;
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN global_parts.quantity_on_hand IS 'Current stock level available across all projects';
COMMENT ON COLUMN global_parts.reorder_point IS 'Minimum quantity before reordering (optional)';
COMMENT ON COLUMN global_parts.reorder_quantity IS 'Standard order quantity when restocking (optional)';
COMMENT ON COLUMN global_parts.warehouse_location IS 'Physical location in warehouse (optional)';
COMMENT ON COLUMN global_parts.last_inventory_check IS 'Last time inventory was physically verified';

-- Create index for inventory queries
CREATE INDEX IF NOT EXISTS idx_global_parts_inventory
ON global_parts(quantity_on_hand)
WHERE is_inventory_item = true;

-- Add constraint to ensure quantity_on_hand is not negative (only if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'global_parts' AND constraint_name = 'chk_quantity_on_hand_non_negative'
  ) THEN
    ALTER TABLE global_parts ADD CONSTRAINT chk_quantity_on_hand_non_negative CHECK (quantity_on_hand >= 0);
  END IF;
END $$;

-- =====================================================
-- PART 2: Create shipping_addresses table
-- =====================================================

-- Create shipping_addresses table
CREATE TABLE IF NOT EXISTS shipping_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  attention_to TEXT,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT DEFAULT 'USA',
  phone TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add shipping_address_id to purchase_orders table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'purchase_orders' AND column_name = 'shipping_address_id') THEN
    ALTER TABLE purchase_orders
    ADD COLUMN shipping_address_id UUID REFERENCES shipping_addresses(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_shipping_addresses_default
ON shipping_addresses(is_default)
WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_shipping_address
ON purchase_orders(shipping_address_id);

-- Add comments for documentation
COMMENT ON TABLE shipping_addresses IS 'Stores shipping/delivery addresses for purchase orders';
COMMENT ON COLUMN shipping_addresses.name IS 'Friendly name for the address (e.g., "Main Office")';
COMMENT ON COLUMN shipping_addresses.is_default IS 'Whether this is the default shipping address';
COMMENT ON COLUMN purchase_orders.shipping_address_id IS 'Reference to shipping address for delivery';

-- Function to ensure only one default address
CREATE OR REPLACE FUNCTION ensure_single_default_shipping_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE shipping_addresses
    SET is_default = false
    WHERE is_default = true AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain single default
DROP TRIGGER IF EXISTS trigger_ensure_single_default_shipping_address ON shipping_addresses;
CREATE TRIGGER trigger_ensure_single_default_shipping_address
  BEFORE INSERT OR UPDATE ON shipping_addresses
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_default_shipping_address();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_shipping_address_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_shipping_address_timestamp ON shipping_addresses;
CREATE TRIGGER trigger_update_shipping_address_timestamp
  BEFORE UPDATE ON shipping_addresses
  FOR EACH ROW
  EXECUTE FUNCTION update_shipping_address_timestamp();

-- =====================================================
-- PART 3: Add project default shipping address
-- =====================================================

-- Add default shipping address to projects table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'projects' AND column_name = 'default_shipping_address_id') THEN
    ALTER TABLE projects
    ADD COLUMN default_shipping_address_id UUID REFERENCES shipping_addresses(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_projects_default_shipping_address
ON projects(default_shipping_address_id);

-- Add comment for documentation
COMMENT ON COLUMN projects.default_shipping_address_id IS 'Default shipping address for all POs in this project';

-- =====================================================
-- DONE!
-- =====================================================
SELECT 'All procurement setup migrations completed successfully!' as status;
