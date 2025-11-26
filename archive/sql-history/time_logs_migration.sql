-- ============================================
-- TIME LOGS TABLE MIGRATION
-- ============================================
-- This migration sets up comprehensive time tracking 
-- for users on projects with reporting capabilities

-- 1. Add new columns to time_logs table if they don't exist
ALTER TABLE public.time_logs 
ADD COLUMN IF NOT EXISTS user_email TEXT,
ADD COLUMN IF NOT EXISTS user_name TEXT,
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER GENERATED ALWAYS AS (
  CASE 
    WHEN check_out IS NOT NULL AND check_in IS NOT NULL 
    THEN EXTRACT(EPOCH FROM (check_out - check_in)) / 60
    ELSE NULL
  END
) STORED;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_time_logs_project_user ON public.time_logs(project_id, user_email);
CREATE INDEX IF NOT EXISTS idx_time_logs_check_in ON public.time_logs(check_in);
CREATE INDEX IF NOT EXISTS idx_time_logs_user_email ON public.time_logs(user_email);

-- 2. Create RLS policies for time_logs
-- Drop existing policies if they exist
DROP POLICY IF EXISTS dev_read_all ON public.time_logs;
DROP POLICY IF EXISTS dev_insert_all ON public.time_logs;
DROP POLICY IF EXISTS dev_update_all ON public.time_logs;
DROP POLICY IF EXISTS dev_delete_all ON public.time_logs;

-- Create new comprehensive policies
CREATE POLICY dev_read_all ON public.time_logs
  FOR SELECT TO anon, authenticated 
  USING (true);

CREATE POLICY dev_insert_all ON public.time_logs
  FOR INSERT TO anon, authenticated 
  WITH CHECK (true);

CREATE POLICY dev_update_all ON public.time_logs
  FOR UPDATE TO anon, authenticated 
  USING (true) 
  WITH CHECK (true);

CREATE POLICY dev_delete_all ON public.time_logs
  FOR DELETE TO anon, authenticated 
  USING (true);

-- 3. Create a view for aggregated time per user per project
CREATE OR REPLACE VIEW public.time_logs_summary AS
SELECT 
  tl.project_id,
  p.name as project_name,
  tl.user_email,
  tl.user_name,
  COUNT(*) as total_sessions,
  SUM(tl.duration_minutes) as total_minutes,
  ROUND((SUM(tl.duration_minutes) / 60.0)::numeric, 2) as total_hours,
  MIN(tl.check_in) as first_check_in,
  MAX(tl.check_out) as last_check_out,
  -- Active session info
  CASE 
    WHEN MAX(CASE WHEN tl.check_out IS NULL THEN 1 ELSE 0 END) = 1 
    THEN true 
    ELSE false 
  END as has_active_session,
  MAX(CASE WHEN tl.check_out IS NULL THEN tl.check_in ELSE NULL END) as active_session_start
FROM public.time_logs tl
LEFT JOIN public.projects p ON tl.project_id = p.id
WHERE tl.user_email IS NOT NULL
GROUP BY tl.project_id, p.name, tl.user_email, tl.user_name;

-- Grant permissions on the view
GRANT SELECT ON public.time_logs_summary TO anon, authenticated;

-- 4. Create a view for currently active sessions
CREATE OR REPLACE VIEW public.time_logs_active AS
SELECT 
  tl.*,
  p.name as project_name,
  EXTRACT(EPOCH FROM (NOW() - tl.check_in)) / 60 as minutes_elapsed,
  ROUND((EXTRACT(EPOCH FROM (NOW() - tl.check_in)) / 3600.0)::numeric, 2) as hours_elapsed
FROM public.time_logs tl
LEFT JOIN public.projects p ON tl.project_id = p.id
WHERE tl.check_out IS NULL;

-- Grant permissions on the view
GRANT SELECT ON public.time_logs_active TO anon, authenticated;

-- 5. Create function to get total time for a user on a project
CREATE OR REPLACE FUNCTION public.get_user_project_time(
  p_project_id UUID,
  p_user_email TEXT
)
RETURNS TABLE (
  total_minutes INTEGER,
  total_hours NUMERIC,
  total_sessions INTEGER,
  active_session BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(duration_minutes)::INTEGER, 0) as total_minutes,
    ROUND(COALESCE(SUM(duration_minutes) / 60.0, 0)::NUMERIC, 2) as total_hours,
    COUNT(*)::INTEGER as total_sessions,
    BOOL_OR(check_out IS NULL) as active_session
  FROM public.time_logs
  WHERE project_id = p_project_id 
    AND user_email = p_user_email;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_project_time(UUID, TEXT) TO anon, authenticated;

-- 6. Create function to check in a user
CREATE OR REPLACE FUNCTION public.time_log_check_in(
  p_project_id UUID,
  p_user_email TEXT,
  p_user_name TEXT DEFAULT NULL
)
RETURNS public.time_logs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result public.time_logs;
BEGIN
  -- Check if user already has an active session for this project
  IF EXISTS (
    SELECT 1 FROM public.time_logs 
    WHERE project_id = p_project_id 
      AND user_email = p_user_email 
      AND check_out IS NULL
  ) THEN
    RAISE EXCEPTION 'User already has an active check-in for this project';
  END IF;
  
  -- Insert new time log
  INSERT INTO public.time_logs (
    project_id,
    user_email,
    user_name,
    check_in
  ) VALUES (
    p_project_id,
    p_user_email,
    COALESCE(p_user_name, p_user_email),
    NOW()
  )
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.time_log_check_in(UUID, TEXT, TEXT) TO anon, authenticated;

-- 7. Create function to check out a user
CREATE OR REPLACE FUNCTION public.time_log_check_out(
  p_project_id UUID,
  p_user_email TEXT
)
RETURNS public.time_logs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result public.time_logs;
BEGIN
  -- Update the most recent active session
  UPDATE public.time_logs
  SET check_out = NOW()
  WHERE id = (
    SELECT id 
    FROM public.time_logs 
    WHERE project_id = p_project_id 
      AND user_email = p_user_email 
      AND check_out IS NULL
    ORDER BY check_in DESC
    LIMIT 1
  )
  RETURNING * INTO v_result;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active check-in found for this user and project';
  END IF;
  
  RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.time_log_check_out(UUID, TEXT) TO anon, authenticated;

-- 8. Create function to get active session for a user/project
CREATE OR REPLACE FUNCTION public.get_active_session(
  p_project_id UUID,
  p_user_email TEXT
)
RETURNS SETOF public.time_logs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT * 
  FROM public.time_logs 
  WHERE project_id = p_project_id 
    AND user_email = p_user_email 
    AND check_out IS NULL
  ORDER BY check_in DESC
  LIMIT 1;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_active_session(UUID, TEXT) TO anon, authenticated;

-- 9. Create a function to get project time summary for all users
CREATE OR REPLACE FUNCTION public.get_project_time_summary(
  p_project_id UUID
)
RETURNS TABLE (
  user_email TEXT,
  user_name TEXT,
  total_minutes INTEGER,
  total_hours NUMERIC,
  total_sessions INTEGER,
  first_check_in TIMESTAMPTZ,
  last_activity TIMESTAMPTZ,
  has_active_session BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tl.user_email,
    tl.user_name,
    SUM(tl.duration_minutes)::INTEGER as total_minutes,
    ROUND((SUM(tl.duration_minutes) / 60.0)::NUMERIC, 2) as total_hours,
    COUNT(*)::INTEGER as total_sessions,
    MIN(tl.check_in) as first_check_in,
    MAX(COALESCE(tl.check_out, tl.check_in)) as last_activity,
    BOOL_OR(tl.check_out IS NULL) as has_active_session
  FROM public.time_logs tl
  WHERE tl.project_id = p_project_id
    AND tl.user_email IS NOT NULL
  GROUP BY tl.user_email, tl.user_name
  ORDER BY total_hours DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_project_time_summary(UUID) TO anon, authenticated;

-- 10. Create weekly time summary function
CREATE OR REPLACE FUNCTION public.get_weekly_time_summary(
  p_user_email TEXT DEFAULT NULL,
  p_weeks_back INTEGER DEFAULT 4
)
RETURNS TABLE (
  week_start DATE,
  week_end DATE,
  project_id UUID,
  project_name TEXT,
  total_minutes INTEGER,
  total_hours NUMERIC,
  session_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE_TRUNC('week', tl.check_in)::DATE as week_start,
    (DATE_TRUNC('week', tl.check_in) + INTERVAL '6 days')::DATE as week_end,
    tl.project_id,
    p.name as project_name,
    SUM(tl.duration_minutes)::INTEGER as total_minutes,
    ROUND((SUM(tl.duration_minutes) / 60.0)::NUMERIC, 2) as total_hours,
    COUNT(*)::INTEGER as session_count
  FROM public.time_logs tl
  LEFT JOIN public.projects p ON tl.project_id = p.id
  WHERE tl.check_out IS NOT NULL
    AND tl.check_in >= DATE_TRUNC('week', CURRENT_DATE - (p_weeks_back * INTERVAL '1 week'))
    AND (p_user_email IS NULL OR tl.user_email = p_user_email)
  GROUP BY DATE_TRUNC('week', tl.check_in), tl.project_id, p.name
  ORDER BY week_start DESC, total_hours DESC;
END;
$$;

-- Grant execute permission  
GRANT EXECUTE ON FUNCTION public.get_weekly_time_summary(TEXT, INTEGER) TO anon, authenticated;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
-- This migration provides:
-- 1. Proper user tracking with email and name
-- 2. Automatic duration calculation
-- 3. Summary views for reporting
-- 4. Functions for check in/out operations
-- 5. Time aggregation by user and project
-- 6. Weekly time reporting capabilities
-- 
-- To apply this migration, run:
-- psql $DATABASE_URL -f time_logs_migration.sql
