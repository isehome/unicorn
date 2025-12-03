-- Migration: Auto-checkout users at 6:00 PM daily
-- Date: 2025-12-02
-- Description: Creates a scheduled job using pg_cron to automatically check out
--              all users who are still checked in at 6:00 PM local time.
--
-- PREREQUISITES:
-- 1. Enable pg_cron extension in Supabase Dashboard:
--    Database > Extensions > Search "pg_cron" > Enable
-- 2. Run this migration in the SQL Editor

-- Step 1: Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Step 2: Create the auto-checkout function
CREATE OR REPLACE FUNCTION public.auto_checkout_all_users()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Update all active check-ins (where check_out is NULL) to check out now
  UPDATE public.time_logs
  SET check_out = NOW()
  WHERE check_out IS NULL;

  -- Get the number of rows affected
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Log the action (optional - helps with debugging)
  RAISE NOTICE 'Auto-checkout completed: % users checked out at %', v_count, NOW();

  RETURN v_count;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.auto_checkout_all_users() IS
  'Automatically checks out all users who have active check-ins. Called by pg_cron at 6:00 PM daily.';

-- Step 3: Schedule the cron job to run at 6:00 PM daily (US Central Time)
-- Cron expression: minute hour day month day-of-week
-- '0 18 * * *' = At 18:00 (6 PM) every day
--
-- NOTE: pg_cron uses UTC by default. Adjust the hour based on your timezone:
-- - US Central (CST/UTC-6): Use '0 0 * * *' (midnight UTC = 6 PM CST)
-- - US Central (CDT/UTC-5): Use '0 23 * * *' (11 PM UTC = 6 PM CDT)
-- - US Eastern (EST/UTC-5): Use '0 23 * * *' (11 PM UTC = 6 PM EST)
-- - US Pacific (PST/UTC-8): Use '0 2 * * *' (2 AM UTC next day = 6 PM PST)
--
-- For US Central Time (assuming CDT during summer):
SELECT cron.unschedule('auto-checkout-daily') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'auto-checkout-daily'
);

SELECT cron.schedule(
  'auto-checkout-daily',           -- Job name (unique identifier)
  '0 23 * * *',                    -- 11 PM UTC = 6 PM CDT (Central Daylight Time)
  $$SELECT public.auto_checkout_all_users()$$
);

-- Grant execute permission to the cron scheduler
GRANT EXECUTE ON FUNCTION public.auto_checkout_all_users() TO postgres;

-- Step 4: Create a manual trigger function (for testing or manual use)
CREATE OR REPLACE FUNCTION public.trigger_auto_checkout()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  v_count := public.auto_checkout_all_users();
  RETURN format('Successfully checked out %s user(s)', v_count);
END;
$$;

COMMENT ON FUNCTION public.trigger_auto_checkout() IS
  'Manual trigger for auto-checkout. Can be called from the app or SQL editor for testing.';

-- Grant execute to authenticated users (for admin manual trigger)
GRANT EXECUTE ON FUNCTION public.trigger_auto_checkout() TO authenticated;
