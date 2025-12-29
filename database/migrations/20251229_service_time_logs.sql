-- ============================================================
-- SERVICE TIME TRACKING SYSTEM
-- Adds time tracking (check-in/check-out) for service tickets
-- Same pattern as project time_logs but for service tickets
-- ============================================================

-- ============================================================
-- PART 1: Create service_time_logs table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.service_time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.service_tickets(id) ON DELETE CASCADE,
  technician_id UUID REFERENCES public.profiles(id),
  technician_email TEXT,
  technician_name TEXT,
  check_in TIMESTAMPTZ NOT NULL,
  check_out TIMESTAMPTZ,
  notes TEXT,
  is_manual_entry BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES public.profiles(id),
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_service_time_logs_ticket ON public.service_time_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_service_time_logs_technician ON public.service_time_logs(technician_id);
CREATE INDEX IF NOT EXISTS idx_service_time_logs_technician_email ON public.service_time_logs(technician_email);
CREATE INDEX IF NOT EXISTS idx_service_time_logs_check_in ON public.service_time_logs(check_in);

-- Add comments
COMMENT ON TABLE public.service_time_logs IS 'Time tracking entries for service tickets';
COMMENT ON COLUMN public.service_time_logs.is_manual_entry IS 'True if entry was added manually (not via check-in/out)';

-- ============================================================
-- PART 2: Add hourly_rate to service_tickets
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'service_tickets' AND column_name = 'hourly_rate') THEN
    ALTER TABLE service_tickets ADD COLUMN hourly_rate NUMERIC DEFAULT 150;
  END IF;
END $$;

COMMENT ON COLUMN public.service_tickets.hourly_rate IS 'Per-ticket hourly labor rate for billing';

-- ============================================================
-- PART 3: Row Level Security
-- ============================================================

ALTER TABLE public.service_time_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_time_logs_read_all ON public.service_time_logs;
CREATE POLICY service_time_logs_read_all ON public.service_time_logs
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS service_time_logs_write_auth ON public.service_time_logs;
CREATE POLICY service_time_logs_write_auth ON public.service_time_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_time_logs_write_anon ON public.service_time_logs;
CREATE POLICY service_time_logs_write_anon ON public.service_time_logs
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- PART 4: RPC Functions for Check-in/Check-out
-- ============================================================

-- Check-in function: Creates a new time entry with check_in timestamp
CREATE OR REPLACE FUNCTION service_time_check_in(
  p_ticket_id UUID,
  p_user_email TEXT,
  p_user_name TEXT,
  p_user_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_existing_session UUID;
  v_new_id UUID;
BEGIN
  -- Check for existing active session
  SELECT id INTO v_existing_session
  FROM service_time_logs
  WHERE ticket_id = p_ticket_id
    AND technician_email = p_user_email
    AND check_out IS NULL;

  IF v_existing_session IS NOT NULL THEN
    RAISE EXCEPTION 'User already has an active check-in for this ticket';
  END IF;

  -- Create new check-in
  INSERT INTO service_time_logs (
    ticket_id,
    technician_id,
    technician_email,
    technician_name,
    check_in,
    is_manual_entry,
    created_by,
    created_by_name
  ) VALUES (
    p_ticket_id,
    p_user_id,
    p_user_email,
    p_user_name,
    NOW(),
    FALSE,
    p_user_id,
    p_user_name
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check-out function: Updates the most recent active session with check_out
CREATE OR REPLACE FUNCTION service_time_check_out(
  p_ticket_id UUID,
  p_user_email TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
BEGIN
  -- Find active session
  SELECT id INTO v_session_id
  FROM service_time_logs
  WHERE ticket_id = p_ticket_id
    AND technician_email = p_user_email
    AND check_out IS NULL
  ORDER BY check_in DESC
  LIMIT 1;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'No active check-in found for this user on this ticket';
  END IF;

  -- Update with check-out
  UPDATE service_time_logs
  SET check_out = NOW(),
      notes = COALESCE(p_notes, notes),
      updated_at = NOW()
  WHERE id = v_session_id;

  RETURN v_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get active session for a user on a ticket
CREATE OR REPLACE FUNCTION get_service_active_session(
  p_ticket_id UUID,
  p_user_email TEXT
)
RETURNS TABLE (
  id UUID,
  ticket_id UUID,
  technician_email TEXT,
  technician_name TEXT,
  check_in TIMESTAMPTZ,
  elapsed_minutes INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    stl.id,
    stl.ticket_id,
    stl.technician_email,
    stl.technician_name,
    stl.check_in,
    EXTRACT(EPOCH FROM (NOW() - stl.check_in))::INTEGER / 60 as elapsed_minutes
  FROM service_time_logs stl
  WHERE stl.ticket_id = p_ticket_id
    AND stl.technician_email = p_user_email
    AND stl.check_out IS NULL
  ORDER BY stl.check_in DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get time summary for a ticket (all technicians)
CREATE OR REPLACE FUNCTION get_service_ticket_time_summary(
  p_ticket_id UUID
)
RETURNS TABLE (
  technician_id UUID,
  technician_email TEXT,
  technician_name TEXT,
  total_minutes INTEGER,
  total_hours NUMERIC,
  session_count INTEGER,
  has_active_session BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    stl.technician_id,
    stl.technician_email,
    stl.technician_name,
    COALESCE(SUM(
      CASE
        WHEN stl.check_out IS NOT NULL THEN
          EXTRACT(EPOCH FROM (stl.check_out - stl.check_in))::INTEGER / 60
        ELSE 0
      END
    ), 0)::INTEGER as total_minutes,
    ROUND(COALESCE(SUM(
      CASE
        WHEN stl.check_out IS NOT NULL THEN
          EXTRACT(EPOCH FROM (stl.check_out - stl.check_in)) / 3600
        ELSE 0
      END
    ), 0)::NUMERIC, 2) as total_hours,
    COUNT(*)::INTEGER as session_count,
    BOOL_OR(stl.check_out IS NULL) as has_active_session
  FROM service_time_logs stl
  WHERE stl.ticket_id = p_ticket_id
  GROUP BY stl.technician_id, stl.technician_email, stl.technician_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get technician's service time across date range
CREATE OR REPLACE FUNCTION get_technician_service_time(
  p_user_email TEXT,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  ticket_id UUID,
  ticket_number TEXT,
  customer_name TEXT,
  work_date DATE,
  total_minutes INTEGER,
  total_hours NUMERIC,
  session_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    stl.ticket_id,
    st.ticket_number,
    st.customer_name,
    stl.check_in::DATE as work_date,
    COALESCE(SUM(
      CASE
        WHEN stl.check_out IS NOT NULL THEN
          EXTRACT(EPOCH FROM (stl.check_out - stl.check_in))::INTEGER / 60
        ELSE 0
      END
    ), 0)::INTEGER as total_minutes,
    ROUND(COALESCE(SUM(
      CASE
        WHEN stl.check_out IS NOT NULL THEN
          EXTRACT(EPOCH FROM (stl.check_out - stl.check_in)) / 3600
        ELSE 0
      END
    ), 0)::NUMERIC, 2) as total_hours,
    COUNT(*)::INTEGER as session_count
  FROM service_time_logs stl
  JOIN service_tickets st ON st.id = stl.ticket_id
  WHERE stl.technician_email = p_user_email
    AND stl.check_in::DATE >= p_start_date
    AND stl.check_in::DATE <= p_end_date
    AND stl.check_out IS NOT NULL
  GROUP BY stl.ticket_id, st.ticket_number, st.customer_name, stl.check_in::DATE
  ORDER BY stl.check_in::DATE DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PART 5: Manual Entry Functions
-- ============================================================

-- Create a manual time entry (for forgotten check-ins)
CREATE OR REPLACE FUNCTION create_service_time_manual_entry(
  p_ticket_id UUID,
  p_technician_email TEXT,
  p_technician_name TEXT,
  p_check_in TIMESTAMPTZ,
  p_check_out TIMESTAMPTZ,
  p_notes TEXT DEFAULT NULL,
  p_created_by_id UUID DEFAULT NULL,
  p_created_by_name TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_new_id UUID;
BEGIN
  -- Validate check_out is after check_in
  IF p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'Check-out time must be after check-in time';
  END IF;

  INSERT INTO service_time_logs (
    ticket_id,
    technician_email,
    technician_name,
    check_in,
    check_out,
    notes,
    is_manual_entry,
    created_by,
    created_by_name
  ) VALUES (
    p_ticket_id,
    p_technician_email,
    p_technician_name,
    p_check_in,
    p_check_out,
    p_notes,
    TRUE,
    p_created_by_id,
    p_created_by_name
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update an existing time entry
CREATE OR REPLACE FUNCTION update_service_time_entry(
  p_entry_id UUID,
  p_check_in TIMESTAMPTZ,
  p_check_out TIMESTAMPTZ,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Validate check_out is after check_in
  IF p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'Check-out time must be after check-in time';
  END IF;

  UPDATE service_time_logs
  SET check_in = p_check_in,
      check_out = p_check_out,
      notes = COALESCE(p_notes, notes),
      updated_at = NOW()
  WHERE id = p_entry_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PART 6: Update timestamp trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_service_time_logs_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_service_time_logs_timestamp ON public.service_time_logs;
CREATE TRIGGER trigger_update_service_time_logs_timestamp
  BEFORE UPDATE ON public.service_time_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_service_time_logs_timestamp();

-- ============================================================
-- PART 7: Auto-checkout function (optional cron job)
-- ============================================================

-- Auto-checkout all open sessions at end of day (6 PM)
CREATE OR REPLACE FUNCTION auto_checkout_service_time_logs()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE service_time_logs
  SET check_out = DATE_TRUNC('day', check_in) + INTERVAL '18 hours', -- 6 PM same day
      notes = COALESCE(notes || ' ', '') || '[Auto-checkout at 6 PM]',
      updated_at = NOW()
  WHERE check_out IS NULL
    AND check_in < DATE_TRUNC('day', NOW());

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Service time tracking tables and functions created successfully!' as status;
