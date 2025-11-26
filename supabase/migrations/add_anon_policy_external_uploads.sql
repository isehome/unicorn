-- Add anon policy for issue_external_uploads so client app can read uploads
-- The client app uses the anon key since MSAL users don't have Supabase sessions

-- Allow anon role to read external uploads (needed for internal staff viewing)
DROP POLICY IF EXISTS issue_external_uploads_anon_select ON public.issue_external_uploads;
CREATE POLICY issue_external_uploads_anon_select ON public.issue_external_uploads
  FOR SELECT TO anon USING (true);

-- Allow anon role to update external uploads (for approve/reject actions)
DROP POLICY IF EXISTS issue_external_uploads_anon_update ON public.issue_external_uploads;
CREATE POLICY issue_external_uploads_anon_update ON public.issue_external_uploads
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Allow anon role to delete external uploads (for cleanup)
DROP POLICY IF EXISTS issue_external_uploads_anon_delete ON public.issue_external_uploads;
CREATE POLICY issue_external_uploads_anon_delete ON public.issue_external_uploads
  FOR DELETE TO anon USING (true);
