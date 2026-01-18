-- Add shelf requirement fields to project_equipment
-- For equipment that needs to sit on a shelf (not rack-mountable)

ALTER TABLE project_equipment
ADD COLUMN IF NOT EXISTS needs_shelf BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS shelf_u_height INTEGER DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN project_equipment.needs_shelf IS 'True if equipment needs shelf space instead of direct rack mounting';
COMMENT ON COLUMN project_equipment.shelf_u_height IS 'How many U of shelf space this equipment needs';
