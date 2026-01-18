-- =====================================================
-- RACK EQUIPMENT LINK MIGRATION
-- Migration: 20260118_rack_equipment_link.sql
--
-- This migration adds:
-- 1. Link between project_racks and project_equipment (the rack itself as a line item)
-- 2. is_rack flag on global_parts to identify rack equipment
-- 3. total_u on global_parts for rack parts (to know the U height of the rack)
-- =====================================================

-- -----------------------------------------------------
-- PART 1: Add equipment_id to project_racks
-- Links the rack record to its equipment line item
-- -----------------------------------------------------
ALTER TABLE project_racks
ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES project_equipment(id) ON DELETE SET NULL;

-- Add index for the foreign key
CREATE INDEX IF NOT EXISTS idx_project_racks_equipment_id ON project_racks(equipment_id);

-- -----------------------------------------------------
-- PART 2: Add is_rack flag to global_parts
-- Identifies parts that are racks (42U, 12U, wall mount, etc.)
-- -----------------------------------------------------
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS is_rack BOOLEAN DEFAULT FALSE;

-- Add index for fast filtering of rack parts
CREATE INDEX IF NOT EXISTS idx_global_parts_is_rack ON global_parts(is_rack) WHERE is_rack = true;

-- -----------------------------------------------------
-- PART 3: Ensure total_u column exists on global_parts
-- For racks, this is the rack height (42, 24, 12, etc.)
-- For equipment, this is already u_height, but we can use total_u for racks
-- Actually, we'll just use u_height for racks too since it's the same concept
-- A 42U rack takes 42U of "space" conceptually
-- -----------------------------------------------------

-- The u_height column should already exist from the previous migration
-- For racks: u_height = total rack height (42, 24, 12, etc.)
-- For equipment: u_height = how many U the equipment takes

-- -----------------------------------------------------
-- PART 4: Comments for documentation
-- -----------------------------------------------------
COMMENT ON COLUMN project_racks.equipment_id IS 'Links to the project_equipment line item representing this rack (e.g., "Middle Atlantic 42U Rack")';
COMMENT ON COLUMN global_parts.is_rack IS 'True if this part is a rack enclosure (42U floor rack, 12U wall mount, etc.)';
