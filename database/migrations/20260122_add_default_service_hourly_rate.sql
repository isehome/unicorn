-- ============================================================
-- Migration: Add default service hourly rate to company_settings
-- Date: 2026-01-22
-- Description: Adds a company-wide default hourly rate for service tickets
-- Bug: BR-2026-01-12-0001 - Hourly rate defaults to hardcoded $150/hr
-- ============================================================

-- Add the column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'company_settings' AND column_name = 'default_service_hourly_rate') THEN
    ALTER TABLE company_settings ADD COLUMN default_service_hourly_rate NUMERIC DEFAULT 150;
  END IF;
END $$;

COMMENT ON COLUMN public.company_settings.default_service_hourly_rate IS 'Default hourly rate for service tickets when not overridden at the ticket level';
