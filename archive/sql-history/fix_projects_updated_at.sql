-- Fix for projects table missing updated_at field
-- Run this in your Supabase SQL editor

-- Add updated_at column if it doesn't exist
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Create or replace trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;

-- Create trigger for projects table
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Verify the column was added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'projects' 
AND column_name = 'updated_at';
