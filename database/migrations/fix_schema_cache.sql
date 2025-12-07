-- Force PostgREST to reload the schema cache to detect the newly added column
-- Run this in the Supabase SQL Editor
NOTIFY pgrst, 'reload schema';
