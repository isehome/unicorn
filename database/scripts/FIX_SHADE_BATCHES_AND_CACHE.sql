-- 1. Ensure project_shade_batches exists
CREATE TABLE IF NOT EXISTS project_shade_batches (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
    original_filename text,
    original_headers text[], -- Stores the header row for reproduction
    created_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id)
);

-- 2. Ensure columns exist on project_shades (re-run safe)
ALTER TABLE project_shades 
ADD COLUMN IF NOT EXISTS shade_batch_id uuid REFERENCES project_shade_batches(id);

ALTER TABLE project_shades 
ADD COLUMN IF NOT EXISTS original_csv_row jsonb;

-- 3. Reload Supabase Schema Cache
-- This fixes the "Could not find the table ... in the schema cache" error
NOTIFY pgrst, 'reload config';
