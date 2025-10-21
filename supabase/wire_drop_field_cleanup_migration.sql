-- Wire Drop Field Cleanup Migration
-- Removes duplicate and deprecated fields based on user audit
-- Date: 2025-10-20

-- STEP 1: Data Migration - Preserve data before removing columns
-- Copy 'name' to 'drop_name' where drop_name is null or empty
UPDATE public.wire_drops
SET drop_name = name
WHERE (drop_name IS NULL OR drop_name = '')
  AND name IS NOT NULL
  AND name != '';

-- Merge 'type' into 'wire_type' where wire_type is null
UPDATE public.wire_drops
SET wire_type = type
WHERE (wire_type IS NULL OR wire_type = '')
  AND type IS NOT NULL
  AND type != '';

-- Merge useful 'location' data into notes where location provides additional info
UPDATE public.wire_drops
SET notes = CASE
  WHEN notes IS NULL OR notes = '' THEN 'Location: ' || location
  ELSE notes || E'\nLocation: ' || location
END
WHERE location IS NOT NULL
  AND location != ''
  AND location != room_name
  AND (notes IS NULL OR notes NOT LIKE '%' || location || '%');

-- STEP 2: Remove Duplicate Columns
-- Remove 'name' (duplicate of drop_name)
ALTER TABLE public.wire_drops DROP COLUMN IF EXISTS name;

-- Remove 'type' (duplicate of wire_type)
ALTER TABLE public.wire_drops DROP COLUMN IF EXISTS type;

-- Remove 'location' (duplicate of room_name)
ALTER TABLE public.wire_drops DROP COLUMN IF EXISTS location;

-- Remove 'device' (overlaps with drop_type)
ALTER TABLE public.wire_drops DROP COLUMN IF EXISTS device;

-- STEP 3: Tag deprecated legacy fields with comments (keep for now, review later)
COMMENT ON COLUMN public.wire_drops.prewire_photo IS 'DEPRECATED: Legacy photo system - replaced by wire_drop_stages. Review for removal.';
COMMENT ON COLUMN public.wire_drops.installed_photo IS 'DEPRECATED: Legacy photo system - replaced by wire_drop_stages. Review for removal.';
COMMENT ON COLUMN public.wire_drops.room_end_equipment IS 'DEPRECATED: Legacy equipment field - replaced by wire_drop_equipment_links. Review for removal.';
COMMENT ON COLUMN public.wire_drops.head_end_equipment IS 'DEPRECATED: Legacy equipment field - replaced by wire_drop_equipment_links. Review for removal.';

-- STEP 4: Add comments to shape position fields (needed for future "show on map" feature)
COMMENT ON COLUMN public.wire_drops.shape_x IS 'X coordinate in Lucid - needed for "show this shape on wire map" feature';
COMMENT ON COLUMN public.wire_drops.shape_y IS 'Y coordinate in Lucid - needed for "show this shape on wire map" feature';
COMMENT ON COLUMN public.wire_drops.shape_width IS 'Width in Lucid - needed for "show this shape on wire map" feature';
COMMENT ON COLUMN public.wire_drops.shape_height IS 'Height in Lucid - needed for "show this shape on wire map" feature';

-- STEP 5: Add comments to color fields (used for visual continuity)
COMMENT ON COLUMN public.wire_drops.shape_color IS 'Lucid shape color (hex) - used for icon/header color continuity';
COMMENT ON COLUMN public.wire_drops.shape_fill_color IS 'Lucid shape fill color (hex) - used for visual continuity';
COMMENT ON COLUMN public.wire_drops.shape_line_color IS 'Lucid shape line color (hex) - used for visual continuity';

-- STEP 6: Add comment to QR code field (core feature to implement)
COMMENT ON COLUMN public.wire_drops.qr_code_url IS 'QR code for wire drop scanning - CORE FEATURE to implement';

-- STEP 7: Update existing comments for clarity
COMMENT ON COLUMN public.wire_drops.drop_name IS 'Drop identifier - auto-generated as "room name + drop type + increment" on import, then editable';
COMMENT ON COLUMN public.wire_drops.wire_type IS 'Wire type (e.g., "18/4", "CAT6") - consolidated from type and wire_type fields';
COMMENT ON COLUMN public.wire_drops.notes IS 'Manual notes field - separate from install_note which comes from Lucid';
COMMENT ON COLUMN public.wire_drops.install_note IS 'Installation notes from Lucid customData - separate from manual notes';

-- Summary
-- This migration:
-- 1. Preserved data from duplicate fields
-- 2. Removed: name, type, location, device
-- 3. Tagged legacy fields for future review: prewire_photo, installed_photo, room_end_equipment, head_end_equipment
-- 4. Added documentation for fields needed for future features
-- 5. Consolidated wire type data into single wire_type field
