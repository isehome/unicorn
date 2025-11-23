-- Add PO submission tracking fields
-- This allows tracking which user officially submitted the PO and when

-- Add submission tracking fields to purchase_orders table
DO $$
BEGIN
  -- Add submitted_by field if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'submitted_by'
  ) THEN
    ALTER TABLE purchase_orders
    ADD COLUMN submitted_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;

  -- Add submitted_at field if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_orders' AND column_name = 'submitted_at'
  ) THEN
    ALTER TABLE purchase_orders
    ADD COLUMN submitted_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create index for better performance when querying by submitter
CREATE INDEX IF NOT EXISTS idx_purchase_orders_submitted_by
ON purchase_orders(submitted_by);

-- Create index for querying by submission date
CREATE INDEX IF NOT EXISTS idx_purchase_orders_submitted_at
ON purchase_orders(submitted_at DESC);

-- Add comments for documentation
COMMENT ON COLUMN purchase_orders.submitted_by IS 'User who officially submitted the PO';
COMMENT ON COLUMN purchase_orders.submitted_at IS 'Timestamp when the PO was officially submitted';

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'PO submission tracking fields added successfully!';
  RAISE NOTICE '- submitted_by: Tracks which user submitted the PO';
  RAISE NOTICE '- submitted_at: Timestamp of when PO was submitted';
END $$;
