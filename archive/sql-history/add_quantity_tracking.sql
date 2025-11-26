-- Add quantity tracking fields to project_equipment
-- This enables tracking ordered vs received quantities instead of just boolean flags

-- Add new quantity columns
ALTER TABLE public.project_equipment
  ADD COLUMN IF NOT EXISTS ordered_quantity NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS received_quantity NUMERIC DEFAULT 0;

-- Add constraint: can't receive more than ordered (or planned if no order quantity set)
-- Drop constraint if it exists, then recreate (handles idempotency)
ALTER TABLE public.project_equipment
  DROP CONSTRAINT IF EXISTS check_received_lte_ordered;

ALTER TABLE public.project_equipment
  ADD CONSTRAINT check_received_lte_ordered
  CHECK (received_quantity <= GREATEST(COALESCE(ordered_quantity, 0), COALESCE(planned_quantity, 0)));

-- Add index for filtering by procurement status
CREATE INDEX IF NOT EXISTS idx_project_equipment_quantities
  ON public.project_equipment(project_id, ordered_quantity, received_quantity)
  WHERE ordered_quantity > 0 OR received_quantity > 0;

-- Add helpful comments
COMMENT ON COLUMN public.project_equipment.ordered_quantity IS
  'Number of units ordered from supplier (0 = not yet ordered)';
COMMENT ON COLUMN public.project_equipment.received_quantity IS
  'Number of units received on-site or in warehouse (cannot exceed ordered_quantity)';

-- Migrate existing boolean data to quantities
-- If ordered_confirmed = true, set ordered_quantity = planned_quantity
-- If onsite_confirmed = true, set received_quantity = planned_quantity
UPDATE public.project_equipment
SET
  ordered_quantity = CASE
    WHEN ordered_confirmed = true AND ordered_quantity = 0
    THEN COALESCE(planned_quantity, 0)
    ELSE ordered_quantity
  END,
  received_quantity = CASE
    WHEN onsite_confirmed = true AND received_quantity = 0
    THEN COALESCE(planned_quantity, 0)
    ELSE received_quantity
  END
WHERE
  (ordered_confirmed = true AND ordered_quantity = 0)
  OR (onsite_confirmed = true AND received_quantity = 0);

-- Keep boolean flags in sync for backward compatibility
-- Create trigger to auto-update boolean flags when quantities change
CREATE OR REPLACE FUNCTION public.sync_procurement_boolean_flags()
RETURNS TRIGGER AS $$
BEGIN
  -- Update ordered_confirmed based on ordered_quantity
  NEW.ordered_confirmed := (NEW.ordered_quantity > 0);

  -- Update onsite_confirmed based on received_quantity matching planned
  NEW.onsite_confirmed := (
    NEW.received_quantity > 0 AND
    NEW.received_quantity >= COALESCE(NEW.planned_quantity, 0)
  );

  -- Set timestamps if changing from false to true
  IF OLD.ordered_confirmed = false AND NEW.ordered_confirmed = true THEN
    NEW.ordered_confirmed_at := NOW();
  END IF;

  IF OLD.onsite_confirmed = false AND NEW.onsite_confirmed = true THEN
    NEW.onsite_confirmed_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_procurement_flags ON public.project_equipment;
CREATE TRIGGER trg_sync_procurement_flags
  BEFORE UPDATE ON public.project_equipment
  FOR EACH ROW
  WHEN (
    OLD.ordered_quantity IS DISTINCT FROM NEW.ordered_quantity OR
    OLD.received_quantity IS DISTINCT FROM NEW.received_quantity
  )
  EXECUTE FUNCTION public.sync_procurement_boolean_flags();

-- Grant necessary permissions
GRANT SELECT, UPDATE ON public.project_equipment TO authenticated;
