-- ============================================================
-- Fix: Update sync_procurement_boolean_flags trigger function
-- ============================================================
-- The column was renamed from onsite_confirmed to delivered_confirmed,
-- but the trigger function was not updated. This causes the error:
--   "record 'new' has no field 'onsite_confirmed'"
-- when receiving parts/equipment.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_procurement_boolean_flags()
RETURNS TRIGGER AS $$
BEGIN
  -- Update ordered_confirmed based on ordered_quantity
  NEW.ordered_confirmed := (NEW.ordered_quantity > 0);

  -- Update delivered_confirmed based on received_quantity matching planned
  -- (Previously was onsite_confirmed, renamed to delivered_confirmed)
  NEW.delivered_confirmed := (
    NEW.received_quantity > 0 AND
    NEW.received_quantity >= COALESCE(NEW.planned_quantity, 0)
  );

  -- Set timestamps if changing from false to true
  IF OLD.ordered_confirmed = false AND NEW.ordered_confirmed = true THEN
    NEW.ordered_confirmed_at := NOW();
  END IF;

  IF OLD.delivered_confirmed = false AND NEW.delivered_confirmed = true THEN
    NEW.delivered_confirmed_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Verification
DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Trigger function updated successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Changed references from:';
  RAISE NOTICE '  onsite_confirmed -> delivered_confirmed';
  RAISE NOTICE '  onsite_confirmed_at -> delivered_confirmed_at';
  RAISE NOTICE '';
  RAISE NOTICE 'Parts receiving should now work correctly.';
  RAISE NOTICE '================================================';
END $$;
