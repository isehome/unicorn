-- Check what URLs are currently stored in the database
-- Run this in Supabase SQL Editor to see what SharePoint/OneDrive URLs exist

SELECT
    id,
    name,
    client_folder_url,
    one_drive_photos,
    one_drive_files,
    one_drive_procurement
FROM projects
ORDER BY created_at DESC
LIMIT 10;
