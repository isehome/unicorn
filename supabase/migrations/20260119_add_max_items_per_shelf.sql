-- Add max_items_per_shelf field for side-by-side equipment display on shelves
-- This allows specifying how many devices can fit side-by-side on a shelf

ALTER TABLE project_equipment
ADD COLUMN IF NOT EXISTS max_items_per_shelf INTEGER DEFAULT 1;

COMMENT ON COLUMN project_equipment.max_items_per_shelf IS 'Number of items that can fit side-by-side on a shelf (default 1)';
