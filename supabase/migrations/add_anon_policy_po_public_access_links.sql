-- Add anon policy for po_public_access_links so client app can create/manage vendor portal links
-- The client app uses the anon key since MSAL users don't have Supabase sessions

-- Allow anon role to read po_public_access_links
DROP POLICY IF EXISTS po_public_access_links_anon_select ON public.po_public_access_links;
CREATE POLICY po_public_access_links_anon_select ON public.po_public_access_links
  FOR SELECT TO anon USING (true);

-- Allow anon role to insert po_public_access_links
DROP POLICY IF EXISTS po_public_access_links_anon_insert ON public.po_public_access_links;
CREATE POLICY po_public_access_links_anon_insert ON public.po_public_access_links
  FOR INSERT TO anon WITH CHECK (true);

-- Allow anon role to update po_public_access_links
DROP POLICY IF EXISTS po_public_access_links_anon_update ON public.po_public_access_links;
CREATE POLICY po_public_access_links_anon_update ON public.po_public_access_links
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Grant permissions to anon role
GRANT SELECT, INSERT, UPDATE ON public.po_public_access_links TO anon;
