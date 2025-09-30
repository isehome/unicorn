-- Add missing columns to projects table

-- Add status column with default value
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS status text 
CHECK (status IN ('active', 'on_hold', 'completed', 'cancelled')) 
DEFAULT 'active';

-- Add project_number column
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS project_number text;

-- Add description column  
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS description text;

-- Update any existing projects to have active status if null
UPDATE public.projects 
SET status = 'active' 
WHERE status IS NULL;
