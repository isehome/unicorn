-- Add insert policy for time_logs
CREATE POLICY IF NOT EXISTS dev_insert_all ON public.time_logs
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Add update policy for time_logs  
CREATE POLICY IF NOT EXISTS dev_update_all ON public.time_logs
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Add delete policy for time_logs
CREATE POLICY IF NOT EXISTS dev_delete_all ON public.time_logs
  FOR DELETE TO anon, authenticated USING (true);

-- Add metadata column to time_logs if it doesn't exist
ALTER TABLE public.time_logs ADD COLUMN IF NOT EXISTS metadata JSONB;
