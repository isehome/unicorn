-- Add is_internal column to issue_comments table
ALTER TABLE public.issue_comments 
ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT TRUE;

-- Update existing comments to be internal by default (safety first)
UPDATE public.issue_comments 
SET is_internal = TRUE 
WHERE is_internal IS NULL;

-- Add comment to document the column
COMMENT ON COLUMN public.issue_comments.is_internal IS 'If true, comment is only visible to internal users. If false, visible on public portal.';
