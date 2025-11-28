-- Migration: Add 'installed' field to project_equipment table
-- Purpose: Track installation status for phase 2 trim milestone objectives
-- When equipment is linked to a wire drop, it should be auto-marked as installed
-- For items without wires (lights, battery-powered shades), allow manual check

-- Add installed boolean column to project_equipment
ALTER TABLE project_equipment
ADD COLUMN IF NOT EXISTS installed BOOLEAN DEFAULT FALSE;

-- Add installed timestamp and user tracking
ALTER TABLE project_equipment
ADD COLUMN IF NOT EXISTS installed_at TIMESTAMPTZ;

ALTER TABLE project_equipment
ADD COLUMN IF NOT EXISTS installed_by UUID REFERENCES auth.users(id);

-- Add index for filtering by installed status
CREATE INDEX IF NOT EXISTS idx_project_equipment_installed
ON project_equipment(project_id, installed);

-- Add comments for documentation
COMMENT ON COLUMN project_equipment.installed IS 'True when equipment is installed. Auto-set when linked to a wire drop, or can be manually toggled for items without wires (lights, battery devices).';
COMMENT ON COLUMN project_equipment.installed_at IS 'Timestamp when equipment was marked as installed.';
COMMENT ON COLUMN project_equipment.installed_by IS 'User ID who marked the equipment as installed.';

-- Verify the columns were added
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'project_equipment'
  AND column_name IN ('installed', 'installed_at', 'installed_by')
ORDER BY column_name;
