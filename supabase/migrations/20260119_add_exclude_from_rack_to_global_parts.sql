-- Add exclude_from_rack preference to global_parts
-- When true, all equipment of this part type will be hidden from rack layout views

ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS exclude_from_rack BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN global_parts.exclude_from_rack IS 'When true, equipment of this part type is excluded from rack layout views (e.g., cables, small accessories)';
