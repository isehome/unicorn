-- Migration: Add tech_accepted status to service_schedules
-- Date: 2026-01-12
-- Description: Adds intermediate 'tech_accepted' status to the scheduling workflow
--              Flow: draft → pending_tech → tech_accepted → pending_customer → confirmed

-- Step 1: Drop existing constraint
ALTER TABLE service_schedules
DROP CONSTRAINT IF EXISTS service_schedules_schedule_status_check;

-- Step 2: Add updated constraint with tech_accepted status
ALTER TABLE service_schedules
ADD CONSTRAINT service_schedules_schedule_status_check
CHECK (schedule_status IN ('draft', 'pending_tech', 'tech_accepted', 'pending_customer', 'confirmed', 'cancelled'));

-- Step 3: Add tech_accepted_at column if it doesn't exist
ALTER TABLE service_schedules
ADD COLUMN IF NOT EXISTS tech_accepted_at TIMESTAMPTZ;

-- Verification query (run separately to confirm):
-- SELECT * FROM information_schema.check_constraints WHERE constraint_name LIKE '%schedule_status%';
