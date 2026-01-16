-- Add company SharePoint root URL for global parts documentation storage
-- This enables uploading submittals, manuals, schematics to SharePoint
-- organized by manufacturer folder structure

-- Add SharePoint root URL column
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS company_sharepoint_root_url TEXT;

-- Add comment explaining usage
COMMENT ON COLUMN public.company_settings.company_sharepoint_root_url IS
'Root SharePoint folder URL for company-wide document storage (submittals, manuals, etc.).
Folder structure will be: {root}/Parts/{Manufacturer}/{PartNumber}/submittals/, schematics/, manuals/';

-- Also add anon role to RLS policies (required for MSAL auth pattern)
DROP POLICY IF EXISTS company_settings_select_policy ON public.company_settings;
CREATE POLICY company_settings_select_policy ON public.company_settings
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS company_settings_insert_policy ON public.company_settings;
CREATE POLICY company_settings_insert_policy ON public.company_settings
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS company_settings_update_policy ON public.company_settings;
CREATE POLICY company_settings_update_policy ON public.company_settings
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Grant permissions to anon role as well
GRANT SELECT, INSERT, UPDATE ON public.company_settings TO anon;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Company SharePoint URL column added!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'New column: company_sharepoint_root_url';
  RAISE NOTICE 'Used for: Global parts document uploads';
  RAISE NOTICE 'Structure: {root}/Parts/{Manufacturer}/{PartNumber}/';
  RAISE NOTICE 'Subfolders: submittals/, schematics/, manuals/';
  RAISE NOTICE '========================================';
END $$;
