-- ============================================================
-- Migration: Rename "onsite" columns to "delivered"
-- ============================================================
-- This updates terminology from "Onsite" to "Delivered" to better
-- reflect the equipment lifecycle:
--   Ordered → Received → Delivered → Installed
-- ============================================================

-- Rename columns in project_equipment table
ALTER TABLE project_equipment
  RENAME COLUMN onsite_confirmed TO delivered_confirmed;

ALTER TABLE project_equipment
  RENAME COLUMN onsite_confirmed_at TO delivered_confirmed_at;

ALTER TABLE project_equipment
  RENAME COLUMN onsite_confirmed_by TO delivered_confirmed_by;

-- Add comments to clarify the new terminology
COMMENT ON COLUMN project_equipment.delivered_confirmed IS 'Manual checkbox: Technician confirms equipment has been delivered to job site';
COMMENT ON COLUMN project_equipment.delivered_confirmed_at IS 'Timestamp when delivered status was confirmed';
COMMENT ON COLUMN project_equipment.delivered_confirmed_by IS 'User ID who confirmed delivered status';

-- Verification
DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Column Rename Complete';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'onsite_confirmed -> delivered_confirmed';
  RAISE NOTICE 'onsite_confirmed_at -> delivered_confirmed_at';
  RAISE NOTICE 'onsite_confirmed_by -> delivered_confirmed_by';
  RAISE NOTICE '';
  RAISE NOTICE 'Equipment Status Flow:';
  RAISE NOTICE '  1. Ordered - Auto (PO submitted)';
  RAISE NOTICE '  2. Received - Auto (Parts Receiving)';
  RAISE NOTICE '  3. Delivered - Manual (Technician checkbox)';
  RAISE NOTICE '  4. Installed - Manual/Auto (Wire drop link)';
  RAISE NOTICE '================================================';
END $$;
