-- Migration: Add SharePoint metadata columns to wire_drop_stages
-- Date: 2026-01-13
-- Description: Adds sharepoint_drive_id and sharepoint_item_id columns to wire_drop_stages
--              These are needed for proper thumbnail generation via Microsoft Graph API
--              Without these columns, photos fail to load as thumbnails or full-screen
--
-- IMPORTANT: This is a NON-BREAKING migration - existing photos will continue to work
--            via the fallback image-proxy mechanism. New uploads will get proper metadata.

-- Step 1: Add the sharepoint_drive_id column
ALTER TABLE wire_drop_stages
ADD COLUMN IF NOT EXISTS sharepoint_drive_id TEXT;

-- Step 2: Add the sharepoint_item_id column
ALTER TABLE wire_drop_stages
ADD COLUMN IF NOT EXISTS sharepoint_item_id TEXT;

-- Step 3: Add comments for documentation
COMMENT ON COLUMN wire_drop_stages.sharepoint_drive_id IS 'SharePoint drive ID for Graph API thumbnail requests';
COMMENT ON COLUMN wire_drop_stages.sharepoint_item_id IS 'SharePoint item ID for Graph API thumbnail requests';

-- Verification query (run separately to confirm):
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'wire_drop_stages'
-- AND column_name IN ('sharepoint_drive_id', 'sharepoint_item_id');
