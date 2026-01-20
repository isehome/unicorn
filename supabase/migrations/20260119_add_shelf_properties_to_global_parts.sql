-- Add shelf properties to global_parts as equipment preferences
-- These serve as defaults for new project_equipment instances

-- Flag to mark that this part type needs shelf space (not rack-mountable)
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS needs_shelf BOOLEAN DEFAULT FALSE;

-- How many U of shelf space this equipment type needs
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS shelf_u_height INTEGER DEFAULT NULL;

-- How many of this item can fit side-by-side on a shelf
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS max_items_per_shelf INTEGER DEFAULT 1;

-- Comments for clarity
COMMENT ON COLUMN global_parts.needs_shelf IS 'True if this part type needs shelf space instead of direct rack mounting (default for new instances)';
COMMENT ON COLUMN global_parts.shelf_u_height IS 'How many U of shelf space this equipment type needs (default for new instances)';
COMMENT ON COLUMN global_parts.max_items_per_shelf IS 'How many of this item can fit side-by-side on a shelf (default for new instances)';
