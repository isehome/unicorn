-- ============================================================
-- WEEKLY PLANNING & CUSTOMER CONFIRMATION SYSTEM
-- Adds tentative scheduling, confirmation tokens, and schedule status tracking
-- ============================================================

-- ============================================================
-- PART 1: Add schedule_status to service_schedules
-- (existing 'status' field is for on_site/completed workflow)
-- ============================================================

DO $$
BEGIN
  -- Schedule status for tentative/confirmed workflow
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_schedules' AND column_name = 'schedule_status') THEN
    ALTER TABLE service_schedules ADD COLUMN schedule_status TEXT DEFAULT 'tentative';
  END IF;

  -- Calendar event ID to track Microsoft 365 calendar event
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_schedules' AND column_name = 'calendar_event_id') THEN
    ALTER TABLE service_schedules ADD COLUMN calendar_event_id TEXT;
  END IF;

  -- Confirmation tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_schedules' AND column_name = 'confirmed_at') THEN
    ALTER TABLE service_schedules ADD COLUMN confirmed_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_schedules' AND column_name = 'confirmed_by') THEN
    ALTER TABLE service_schedules ADD COLUMN confirmed_by TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_schedules' AND column_name = 'confirmation_method') THEN
    ALTER TABLE service_schedules ADD COLUMN confirmation_method TEXT;
  END IF;

  -- Reschedule request tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_schedules' AND column_name = 'reschedule_requested_at') THEN
    ALTER TABLE service_schedules ADD COLUMN reschedule_requested_at TIMESTAMPTZ;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_schedules' AND column_name = 'reschedule_reason') THEN
    ALTER TABLE service_schedules ADD COLUMN reschedule_reason TEXT;
  END IF;

  -- Duration for block sizing (default 2 hours = 120 min)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_schedules' AND column_name = 'estimated_duration_minutes') THEN
    ALTER TABLE service_schedules ADD COLUMN estimated_duration_minutes INTEGER DEFAULT 120;
  END IF;
END $$;

-- Add check constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'service_schedules_schedule_status_check'
  ) THEN
    ALTER TABLE service_schedules ADD CONSTRAINT service_schedules_schedule_status_check
      CHECK (schedule_status IN ('tentative', 'confirmed', 'cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'service_schedules_confirmation_method_check'
  ) THEN
    ALTER TABLE service_schedules ADD CONSTRAINT service_schedules_confirmation_method_check
      CHECK (confirmation_method IS NULL OR confirmation_method IN ('portal', 'phone', 'email', 'sms', 'internal'));
  END IF;
END $$;

-- Add comments
COMMENT ON COLUMN service_schedules.schedule_status IS 'Scheduling workflow: tentative (awaiting confirmation), confirmed (customer confirmed), cancelled';
COMMENT ON COLUMN service_schedules.calendar_event_id IS 'Microsoft Graph calendar event ID for sync';
COMMENT ON COLUMN service_schedules.confirmed_at IS 'When the schedule was confirmed';
COMMENT ON COLUMN service_schedules.confirmed_by IS 'Who confirmed: customer name or staff name';
COMMENT ON COLUMN service_schedules.confirmation_method IS 'How confirmed: portal, phone, email, sms, internal';
COMMENT ON COLUMN service_schedules.estimated_duration_minutes IS 'Estimated duration in minutes (default 120 = 2 hours)';

-- ============================================================
-- PART 2: Customer Confirmation Tokens Table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_schedule_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.service_schedules(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.service_tickets(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  otp_code TEXT,
  otp_expires_at TIMESTAMPTZ,
  session_token TEXT,
  session_expires_at TIMESTAMPTZ,
  is_revoked BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_schedule_confirmations_token_hash ON public.service_schedule_confirmations(token_hash);
CREATE INDEX IF NOT EXISTS idx_schedule_confirmations_schedule ON public.service_schedule_confirmations(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_confirmations_ticket ON public.service_schedule_confirmations(ticket_id);
CREATE INDEX IF NOT EXISTS idx_schedule_confirmations_expires ON public.service_schedule_confirmations(expires_at);

-- Comments
COMMENT ON TABLE public.service_schedule_confirmations IS 'Token-based access for customer schedule confirmation portal';
COMMENT ON COLUMN public.service_schedule_confirmations.token IS 'Plain token sent to customer (not stored after creation)';
COMMENT ON COLUMN public.service_schedule_confirmations.token_hash IS 'SHA-256 hash of token for lookup';
COMMENT ON COLUMN public.service_schedule_confirmations.otp_code IS 'One-time password for verification';
COMMENT ON COLUMN public.service_schedule_confirmations.session_token IS 'Session token issued after OTP verification';

-- ============================================================
-- PART 3: Add index for schedule queries
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_service_schedules_schedule_status ON public.service_schedules(schedule_status);
CREATE INDEX IF NOT EXISTS idx_service_schedules_date_tech ON public.service_schedules(scheduled_date, technician_id);

-- ============================================================
-- PART 4: Row Level Security
-- ============================================================

ALTER TABLE public.service_schedule_confirmations ENABLE ROW LEVEL SECURITY;

-- Read policies
DROP POLICY IF EXISTS schedule_confirmations_read_all ON public.service_schedule_confirmations;
CREATE POLICY schedule_confirmations_read_all ON public.service_schedule_confirmations
  FOR SELECT TO anon, authenticated USING (true);

-- Write policies
DROP POLICY IF EXISTS schedule_confirmations_write_auth ON public.service_schedule_confirmations;
CREATE POLICY schedule_confirmations_write_auth ON public.service_schedule_confirmations
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS schedule_confirmations_write_anon ON public.service_schedule_confirmations;
CREATE POLICY schedule_confirmations_write_anon ON public.service_schedule_confirmations
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- PART 5: Update timestamp trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_schedule_confirmations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_schedule_confirmations_timestamp ON public.service_schedule_confirmations;
CREATE TRIGGER trigger_update_schedule_confirmations_timestamp
  BEFORE UPDATE ON public.service_schedule_confirmations
  FOR EACH ROW
  EXECUTE FUNCTION update_schedule_confirmations_timestamp();

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Weekly Planning & Customer Confirmation schema migration complete!' as status;
