-- SharePoint Photo Metadata Migration
-- Adds fields to store SharePoint drive/item IDs for proper thumbnail generation
-- Date: 2025-10-21

-- Add SharePoint metadata columns to wire_drop_stages table
ALTER TABLE public.wire_drop_stages
ADD COLUMN IF NOT EXISTS sharepoint_drive_id TEXT,
ADD COLUMN IF NOT EXISTS sharepoint_item_id TEXT,
ADD COLUMN IF NOT EXISTS photo_thumbnail_url TEXT;

-- Add comments to explain the fields
COMMENT ON COLUMN public.wire_drop_stages.sharepoint_drive_id IS 'SharePoint drive ID for the uploaded photo - used to generate proper thumbnails via Graph API';
COMMENT ON COLUMN public.wire_drop_stages.sharepoint_item_id IS 'SharePoint item ID for the uploaded photo - used to generate proper thumbnails via Graph API';
COMMENT ON COLUMN public.wire_drop_stages.photo_thumbnail_url IS 'Cached Graph API thumbnail URL - regenerated when needed';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_wire_drop_stages_sharepoint_item 
ON public.wire_drop_stages(sharepoint_item_id) 
WHERE sharepoint_item_id IS NOT NULL;

-- Note: photo_url will continue to store the embed URL for full resolution viewing
-- The new sharepoint_drive_id and sharepoint_item_id will be used to generate proper thumbnails
