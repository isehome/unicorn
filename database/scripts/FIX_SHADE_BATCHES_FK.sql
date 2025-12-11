-- The app uses MSAL (Microsoft) Auth, but the table was created referencing Supabase Auth users.
-- This causes the "violates foreign key constraint" error.

-- Fix: Drop the constraint so MSAL User IDs can be stored.
ALTER TABLE project_shade_batches 
DROP CONSTRAINT IF EXISTS project_shade_batches_created_by_fkey;

-- Ensure schema cache is reloaded
NOTIFY pgrst, 'reload config';
