-- ============================================================
-- SERVICE TICKET ACTIVITY LOG
-- Tracks all changes to service tickets with timestamps and user info
-- ============================================================

-- Create activity log table
CREATE TABLE IF NOT EXISTS public.service_ticket_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.service_tickets(id) ON DELETE CASCADE,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_service_ticket_activity_ticket ON public.service_ticket_activity(ticket_id);
CREATE INDEX IF NOT EXISTS idx_service_ticket_activity_created ON public.service_ticket_activity(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_ticket_activity_type ON public.service_ticket_activity(action_type);

-- Add comments
COMMENT ON TABLE public.service_ticket_activity IS 'Activity log tracking all changes to service tickets';
COMMENT ON COLUMN public.service_ticket_activity.action_type IS 'Type of action: status_change, time_entry_added, time_entry_updated, time_entry_deleted, part_added, part_updated, part_removed, triage_note, assignment_change, photo_added, created, etc.';
COMMENT ON COLUMN public.service_ticket_activity.old_value IS 'Previous value (for changes)';
COMMENT ON COLUMN public.service_ticket_activity.new_value IS 'New value (for changes)';
COMMENT ON COLUMN public.service_ticket_activity.metadata IS 'Additional context data';

-- Enable RLS
ALTER TABLE public.service_ticket_activity ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS service_ticket_activity_read_all ON public.service_ticket_activity;
CREATE POLICY service_ticket_activity_read_all ON public.service_ticket_activity
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS service_ticket_activity_write_auth ON public.service_ticket_activity;
CREATE POLICY service_ticket_activity_write_auth ON public.service_ticket_activity
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_ticket_activity_write_anon ON public.service_ticket_activity;
CREATE POLICY service_ticket_activity_write_anon ON public.service_ticket_activity
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- DONE
-- ============================================================
SELECT 'Service ticket activity log table created successfully!' as status;
