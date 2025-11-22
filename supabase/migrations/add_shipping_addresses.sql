-- Create shipping_addresses table
CREATE TABLE IF NOT EXISTS shipping_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL, -- e.g., "Main Office", "Warehouse", "Job Site"
  attention_to TEXT, -- Optional: person/department name
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
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS shipping_address_id UUID REFERENCES shipping_addresses(id) ON DELETE SET NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_shipping_addresses_default ON shipping_addresses(is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_shipping_address ON purchase_orders(shipping_address_id);

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
    -- Unset any other default addresses
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
