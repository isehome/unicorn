-- Fix: global_parts write policy was only for 'authenticated' role,
-- but the app uses MSAL auth (not Supabase auth), so all client
-- requests come in as 'anon'. This caused CSV imports to silently
-- fail when trying to insert new parts into the global database.
DROP POLICY IF EXISTS global_parts_write_authenticated ON global_parts;

CREATE POLICY global_parts_write_all ON global_parts
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
