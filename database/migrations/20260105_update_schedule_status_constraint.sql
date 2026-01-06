-- ============================================================
-- UPDATE schedule_status CHECK CONSTRAINT
-- Adds new workflow statuses: draft, pending_tech, pending_customer
-- ============================================================

-- Drop the old constraint and create a new one with all valid statuses
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'service_schedules_schedule_status_check'
  ) THEN
    ALTER TABLE service_schedules DROP CONSTRAINT service_schedules_schedule_status_check;
  END IF;

  -- Create new constraint with all workflow statuses
  -- draft: Initial state after drag-drop, can be moved/adjusted
  -- pending_tech: Committed, waiting for technician to accept calendar invite
  -- pending_customer: Tech accepted, waiting for customer to accept
  -- tentative: Legacy alias for draft (backwards compatibility)
  -- confirmed: All parties confirmed
  -- cancelled: Appointment cancelled
  ALTER TABLE service_schedules ADD CONSTRAINT service_schedules_schedule_status_check
    CHECK (schedule_status IN ('draft', 'pending_tech', 'pending_customer', 'tentative', 'confirmed', 'cancelled'));
END $$;

-- Add new columns for 3-step workflow tracking if they don't exist
DO $$
BEGIN
  -- When schedule was committed (locked from dragging)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_schedules' AND column_name = 'committed_at') THEN
    ALTER TABLE service_schedules ADD COLUMN committed_at TIMESTAMPTZ;
  END IF;

  -- Technician calendar response (accepted, declined, tentative)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_schedules' AND column_name = 'tech_calendar_response') THEN
    ALTER TABLE service_schedules ADD COLUMN tech_calendar_response TEXT;
  END IF;

  -- Customer calendar response
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_schedules' AND column_name = 'customer_calendar_response') THEN
    ALTER TABLE service_schedules ADD COLUMN customer_calendar_response TEXT;
  END IF;

  -- When technician accepted
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_schedules' AND column_name = 'technician_accepted_at') THEN
    ALTER TABLE service_schedules ADD COLUMN technician_accepted_at TIMESTAMPTZ;
  END IF;

  -- When customer accepted
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_schedules' AND column_name = 'customer_accepted_at') THEN
    ALTER TABLE service_schedules ADD COLUMN customer_accepted_at TIMESTAMPTZ;
  END IF;
END $$;

-- Update existing 'tentative' records to 'draft' for consistency
UPDATE service_schedules
SET schedule_status = 'draft'
WHERE schedule_status = 'tentative';

-- Add comments
COMMENT ON COLUMN service_schedules.schedule_status IS '3-step workflow: draft (editable), pending_tech (waiting tech accept), pending_customer (waiting customer), confirmed (all confirmed), cancelled';
COMMENT ON COLUMN service_schedules.committed_at IS 'When schedule was committed (locked from dragging)';
COMMENT ON COLUMN service_schedules.tech_calendar_response IS 'Technician calendar response: accepted, declined, tentative';
COMMENT ON COLUMN service_schedules.customer_calendar_response IS 'Customer calendar response: accepted, declined, tentative';

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Schedule status constraint updated for 3-step workflow!' as status;
