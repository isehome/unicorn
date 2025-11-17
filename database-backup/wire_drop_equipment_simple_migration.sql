-- Wire Drop Equipment Features - Simple Migration
-- Just adds the three required columns
-- Run this in Supabase SQL Editor

-- Add new columns to project_equipment table
ALTER TABLE project_equipment 
ADD COLUMN IF NOT EXISTS homekit_qr_photo TEXT,
ADD COLUMN IF NOT EXISTS homekit_setup_code TEXT,
ADD COLUMN IF NOT EXISTS unifi_synced_at TIMESTAMPTZ;

-- That's it! The features will work now.
-- Verify by running:
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'project_equipment' 
-- AND column_name IN ('homekit_qr_photo', 'homekit_setup_code', 'unifi_synced_at');
