-- Migration: Add customer_invite_sent_at column to service_schedules
-- Date: 2026-01-12
-- Description: Fixes missing column that causes calendar response processing to fail

-- Add customer_invite_sent_at column to track when customer invitation was sent
ALTER TABLE service_schedules
ADD COLUMN IF NOT EXISTS customer_invite_sent_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN service_schedules.customer_invite_sent_at IS 'When the customer confirmation email was sent (after tech accepts)';

SELECT 'Added customer_invite_sent_at column to service_schedules' as status;
