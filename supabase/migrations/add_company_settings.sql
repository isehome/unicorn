-- Create company_settings table for storing company information used in PO generation
-- This stores company-wide settings (not project-specific)

CREATE TABLE IF NOT EXISTS public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Company Information
  company_name TEXT NOT NULL CHECK (company_name <> ''),

  -- Orders Contact
  orders_contact_name TEXT,
  orders_contact_email TEXT,
  orders_contact_phone TEXT,

  -- Accounting Contact
  accounting_contact_name TEXT,
  accounting_contact_email TEXT,
  accounting_contact_phone TEXT,

  -- Company Logo (SharePoint)
  company_logo_url TEXT,
  company_logo_sharepoint_drive_id TEXT,
  company_logo_sharepoint_item_id TEXT,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read company settings
CREATE POLICY company_settings_select_policy ON public.company_settings
  FOR SELECT TO authenticated
  USING (true);

-- Allow authenticated users to insert/update (typically only one row will exist)
CREATE POLICY company_settings_insert_policy ON public.company_settings
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY company_settings_update_policy ON public.company_settings
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_company_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_company_settings_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.company_settings TO authenticated;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Company settings table created!';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Features:';
  RAISE NOTICE '  - Store company name and logo';
  RAISE NOTICE '  - Orders contact information';
  RAISE NOTICE '  - Accounting contact information';
  RAISE NOTICE '  - For use in PO generation';
  RAISE NOTICE '========================================';
END $$;
