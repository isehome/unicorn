-- ============================================================
-- ADD INITIAL CUSTOMER COMMENT FIELD
-- Captures the customer's original description of the issue
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_tickets' AND column_name = 'initial_customer_comment') THEN
    ALTER TABLE service_tickets ADD COLUMN initial_customer_comment TEXT;
  END IF;
END $$;

COMMENT ON COLUMN service_tickets.initial_customer_comment IS 'Customer''s original description of the issue when they first called/texted/emailed';

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Initial customer comment column added successfully!' as status;
