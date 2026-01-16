-- Add submittal document fields to global_parts table
-- These fields store manufacturer submittal PDFs for end-of-project documentation

-- External URL field (for links to manufacturer websites)
ALTER TABLE public.global_parts
ADD COLUMN IF NOT EXISTS submittal_pdf_url TEXT;

-- SharePoint upload fields (for uploaded documents)
ALTER TABLE public.global_parts
ADD COLUMN IF NOT EXISTS submittal_sharepoint_url TEXT;

ALTER TABLE public.global_parts
ADD COLUMN IF NOT EXISTS submittal_sharepoint_drive_id TEXT;

ALTER TABLE public.global_parts
ADD COLUMN IF NOT EXISTS submittal_sharepoint_item_id TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.global_parts.submittal_pdf_url IS 'External URL to manufacturer submittal PDF (e.g., product spec sheet from manufacturer website)';
COMMENT ON COLUMN public.global_parts.submittal_sharepoint_url IS 'SharePoint URL for uploaded submittal PDF document';
COMMENT ON COLUMN public.global_parts.submittal_sharepoint_drive_id IS 'SharePoint drive ID for Graph API thumbnail/download access';
COMMENT ON COLUMN public.global_parts.submittal_sharepoint_item_id IS 'SharePoint item ID for Graph API thumbnail/download access';

-- Index for parts that have submittals (useful for filtering)
CREATE INDEX IF NOT EXISTS idx_global_parts_has_submittal
ON public.global_parts((submittal_pdf_url IS NOT NULL OR submittal_sharepoint_url IS NOT NULL));
