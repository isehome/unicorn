-- Add anon policy for company_settings so client app can read/write settings
-- The client app uses the anon key since MSAL users don't have Supabase sessions

-- Allow anon role to read company settings
DROP POLICY IF EXISTS company_settings_anon_select ON public.company_settings;
CREATE POLICY company_settings_anon_select ON public.company_settings
  FOR SELECT TO anon USING (true);

-- Allow anon role to insert company settings
DROP POLICY IF EXISTS company_settings_anon_insert ON public.company_settings;
CREATE POLICY company_settings_anon_insert ON public.company_settings
  FOR INSERT TO anon WITH CHECK (true);

-- Allow anon role to update company settings
DROP POLICY IF EXISTS company_settings_anon_update ON public.company_settings;
CREATE POLICY company_settings_anon_update ON public.company_settings
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Grant permissions to anon role
GRANT SELECT, INSERT, UPDATE ON public.company_settings TO anon;
