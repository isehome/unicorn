-- Add HomeKit QR code photo columns to project_equipment table
-- This allows storing HomeKit QR code photos for equipment via SharePoint

ALTER TABLE project_equipment
ADD COLUMN IF NOT EXISTS homekit_qr_url TEXT,
ADD COLUMN IF NOT EXISTS homekit_qr_sharepoint_drive_id TEXT,
ADD COLUMN IF NOT EXISTS homekit_qr_sharepoint_item_id TEXT;

-- Add comment to document the columns
COMMENT ON COLUMN project_equipment.homekit_qr_url IS 'SharePoint URL for HomeKit QR code photo';
COMMENT ON COLUMN project_equipment.homekit_qr_sharepoint_drive_id IS 'SharePoint drive ID for direct API access';
COMMENT ON COLUMN project_equipment.homekit_qr_sharepoint_item_id IS 'SharePoint item ID for thumbnails and metadata';
