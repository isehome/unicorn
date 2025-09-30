-- Complete fix for projects table
-- Run this entire script in Supabase SQL editor

-- 1. Ensure all necessary columns exist in projects table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS project_number text;

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS start_date date;

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS end_date date;

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- 2. Add check constraint for status field
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE public.projects 
ADD CONSTRAINT projects_status_check 
CHECK (status IN ('active', 'on_hold', 'completed', 'cancelled') OR status IS NULL);

-- 3. Create or replace the update trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;

CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. Update any existing NULL status values to 'active'
UPDATE public.projects 
SET status = 'active' 
WHERE status IS NULL;

-- 5. Verify the structure
SELECT 
    column_name, 
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'projects' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 6. Grant proper permissions
GRANT ALL ON public.projects TO authenticated;
GRANT ALL ON public.projects TO anon;
