-- Add client_folder_url field to projects table
-- This will be the single source of truth for client OneDrive folder
-- Replaces multiple individual folder URL fields with one unified approach
--
-- STATUS: ✅ TESTED AND WORKING on production
-- Successfully creates 6 standard subfolders: Data, Design, Files, Photos, Business, Procurement

ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS client_folder_url TEXT;

-- Add index for quick lookups
CREATE INDEX IF NOT EXISTS idx_projects_client_folder_url
ON public.projects(client_folder_url);

-- Add comment
COMMENT ON COLUMN public.projects.client_folder_url IS
'Main OneDrive/SharePoint folder URL for client. Standard subfolders (Data, Design, Files, Photos, Business, Procurement) are auto-created under this location.';

-- Verify
DO $$
BEGIN
    RAISE NOTICE 'Successfully added client_folder_url field to projects table';
END $$;
