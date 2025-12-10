-- Migration: Add headrail_style column to project_shades
-- Date: 2025-12-10
-- Description: Adds headrail_style field for tracking shade headrail configuration
--              Options: Pocket, Fascia, Fascia + Top Back Cover, Top Back Cover

ALTER TABLE public.project_shades
ADD COLUMN IF NOT EXISTS headrail_style TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.project_shades.headrail_style IS 'Headrail style: Pocket, Fascia, Fascia + Top Back Cover, Top Back Cover';
