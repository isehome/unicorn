-- Create project_permits table for tracking building permits and inspections
-- This includes permit documents, inspection dates, and full audit trail

-- Create the project_permits table
CREATE TABLE IF NOT EXISTS public.project_permits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

    -- Permit information
    permit_number TEXT NOT NULL,
    permit_document_url TEXT, -- URL to PDF stored in Supabase Storage
    permit_document_name TEXT, -- Original filename of the permit document

    -- Rough-in inspection
    rough_in_completed BOOLEAN DEFAULT FALSE,
    rough_in_date DATE,
    rough_in_completed_by UUID REFERENCES public.profiles(id),
    rough_in_completed_at TIMESTAMPTZ,

    -- Final inspection
    final_inspection_completed BOOLEAN DEFAULT FALSE,
    final_inspection_date DATE,
    final_inspection_completed_by UUID REFERENCES public.profiles(id),
    final_inspection_completed_at TIMESTAMPTZ,

    -- Notes field for additional information
    notes TEXT,

    -- Audit trail
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES public.profiles(id),

    -- Ensure permit numbers are unique per project
    CONSTRAINT unique_permit_per_project UNIQUE (project_id, permit_number)
);

-- Enable Row Level Security
ALTER TABLE public.project_permits ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for project_permits
-- Policy: Anyone authenticated can view permits
CREATE POLICY "Anyone can view project permits"
    ON public.project_permits
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Policy: Authenticated users can insert permits
CREATE POLICY "Authenticated users can insert permits"
    ON public.project_permits
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Policy: Authenticated users can update permits
CREATE POLICY "Authenticated users can update permits"
    ON public.project_permits
    FOR UPDATE
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Policy: Authenticated users can delete permits
CREATE POLICY "Authenticated users can delete permits"
    ON public.project_permits
    FOR DELETE
    USING (auth.role() = 'authenticated');

-- Create indexes for better query performance
CREATE INDEX idx_project_permits_project_id ON public.project_permits(project_id);
CREATE INDEX idx_project_permits_permit_number ON public.project_permits(permit_number);
CREATE INDEX idx_project_permits_created_at ON public.project_permits(created_at DESC);

-- Create trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_project_permits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_project_permits_updated_at_trigger
    BEFORE UPDATE ON public.project_permits
    FOR EACH ROW
    EXECUTE FUNCTION update_project_permits_updated_at();

-- Create storage bucket for permit documents (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('permit-documents', 'permit-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for permit documents bucket
-- Policy: Anyone authenticated can view permit documents
CREATE POLICY "Anyone can view permit documents"
    ON storage.objects
    FOR SELECT
    USING (bucket_id = 'permit-documents' AND auth.role() = 'authenticated');

-- Policy: Authenticated users can upload permit documents
CREATE POLICY "Authenticated users can upload permit documents"
    ON storage.objects
    FOR INSERT
    WITH CHECK (bucket_id = 'permit-documents' AND auth.role() = 'authenticated');

-- Policy: Authenticated users can update permit documents
CREATE POLICY "Authenticated users can update permit documents"
    ON storage.objects
    FOR UPDATE
    USING (bucket_id = 'permit-documents' AND auth.role() = 'authenticated')
    WITH CHECK (bucket_id = 'permit-documents' AND auth.role() = 'authenticated');

-- Policy: Authenticated users can delete permit documents
CREATE POLICY "Authenticated users can delete permit documents"
    ON storage.objects
    FOR DELETE
    USING (bucket_id = 'permit-documents' AND auth.role() = 'authenticated');

-- Add comment to table for documentation
COMMENT ON TABLE public.project_permits IS 'Stores building permit information and inspection tracking for projects with full audit trail';
COMMENT ON COLUMN public.project_permits.permit_number IS 'Official permit number from the building department';
COMMENT ON COLUMN public.project_permits.permit_document_url IS 'URL to the permit PDF document stored in Supabase Storage';
COMMENT ON COLUMN public.project_permits.rough_in_completed IS 'Indicates if rough-in inspection has been completed';
COMMENT ON COLUMN public.project_permits.rough_in_date IS 'Date of rough-in inspection';
COMMENT ON COLUMN public.project_permits.rough_in_completed_by IS 'User who marked rough-in inspection as completed';
COMMENT ON COLUMN public.project_permits.rough_in_completed_at IS 'Timestamp when rough-in was marked as completed';
COMMENT ON COLUMN public.project_permits.final_inspection_completed IS 'Indicates if final inspection has been completed';
COMMENT ON COLUMN public.project_permits.final_inspection_date IS 'Date of final inspection';
COMMENT ON COLUMN public.project_permits.final_inspection_completed_by IS 'User who marked final inspection as completed';
COMMENT ON COLUMN public.project_permits.final_inspection_completed_at IS 'Timestamp when final inspection was marked as completed';
