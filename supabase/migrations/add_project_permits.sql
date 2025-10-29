-- Migration: Add project permits table and storage
-- Description: Adds permit tracking with inspections, document storage, and full audit trail
-- Author: Claude Code
-- Date: 2025-01-29

-- ============================================================================
-- TABLE: project_permits
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.project_permits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

    -- Permit information
    permit_number TEXT NOT NULL,
    permit_document_url TEXT,
    permit_document_name TEXT,
    notes TEXT,

    -- Rough-in inspection
    rough_in_completed BOOLEAN NOT NULL DEFAULT FALSE,
    rough_in_date DATE,
    rough_in_completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rough_in_completed_at TIMESTAMPTZ,

    -- Final inspection
    final_inspection_completed BOOLEAN NOT NULL DEFAULT FALSE,
    final_inspection_date DATE,
    final_inspection_completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    final_inspection_completed_at TIMESTAMPTZ,

    -- Audit trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

    -- Constraints
    CONSTRAINT unique_permit_per_project UNIQUE (project_id, permit_number),
    CONSTRAINT permit_number_not_empty CHECK (permit_number <> '')
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_project_permits_project_id
    ON public.project_permits(project_id);

CREATE INDEX IF NOT EXISTS idx_project_permits_permit_number
    ON public.project_permits(permit_number);

CREATE INDEX IF NOT EXISTS idx_project_permits_created_at
    ON public.project_permits(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_permits_created_by
    ON public.project_permits(created_by);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.project_permits ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view all permits
CREATE POLICY "permit_select_policy"
    ON public.project_permits
    FOR SELECT
    TO authenticated
    USING (true);

-- Allow authenticated users to insert permits
CREATE POLICY "permit_insert_policy"
    ON public.project_permits
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Allow authenticated users to update permits
CREATE POLICY "permit_update_policy"
    ON public.project_permits
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Allow authenticated users to delete permits
CREATE POLICY "permit_delete_policy"
    ON public.project_permits
    FOR DELETE
    TO authenticated
    USING (true);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_project_permits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call the function before updates
CREATE TRIGGER trigger_update_project_permits_updated_at
    BEFORE UPDATE ON public.project_permits
    FOR EACH ROW
    EXECUTE FUNCTION public.update_project_permits_updated_at();

-- ============================================================================
-- STORAGE BUCKET
-- ============================================================================

-- Create storage bucket for permit documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'permit-documents',
    'permit-documents',
    false,
    10485760, -- 10MB limit
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf'];

-- ============================================================================
-- STORAGE POLICIES
-- ============================================================================

-- Allow authenticated users to view permit documents
CREATE POLICY "permit_docs_select_policy"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'permit-documents');

-- Allow authenticated users to upload permit documents
CREATE POLICY "permit_docs_insert_policy"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'permit-documents'
        AND (storage.foldername(name))[1] IS NOT NULL
    );

-- Allow authenticated users to update permit documents
CREATE POLICY "permit_docs_update_policy"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'permit-documents')
    WITH CHECK (bucket_id = 'permit-documents');

-- Allow authenticated users to delete permit documents
CREATE POLICY "permit_docs_delete_policy"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'permit-documents');

-- ============================================================================
-- TABLE COMMENTS
-- ============================================================================

COMMENT ON TABLE public.project_permits IS
    'Stores building permit information and inspection tracking for projects with full audit trail';

COMMENT ON COLUMN public.project_permits.id IS
    'Unique identifier for the permit record';

COMMENT ON COLUMN public.project_permits.project_id IS
    'Reference to the project this permit belongs to';

COMMENT ON COLUMN public.project_permits.permit_number IS
    'Official permit number from the building department (unique per project)';

COMMENT ON COLUMN public.project_permits.permit_document_url IS
    'URL to the permit PDF document stored in Supabase Storage';

COMMENT ON COLUMN public.project_permits.permit_document_name IS
    'Original filename of the uploaded permit document';

COMMENT ON COLUMN public.project_permits.notes IS
    'Optional notes about this permit';

COMMENT ON COLUMN public.project_permits.rough_in_completed IS
    'Indicates if rough-in inspection has been completed';

COMMENT ON COLUMN public.project_permits.rough_in_date IS
    'Date when rough-in inspection was performed';

COMMENT ON COLUMN public.project_permits.rough_in_completed_by IS
    'User who marked the rough-in inspection as completed';

COMMENT ON COLUMN public.project_permits.rough_in_completed_at IS
    'Timestamp when rough-in inspection was marked as completed';

COMMENT ON COLUMN public.project_permits.final_inspection_completed IS
    'Indicates if final inspection has been completed';

COMMENT ON COLUMN public.project_permits.final_inspection_date IS
    'Date when final inspection was performed';

COMMENT ON COLUMN public.project_permits.final_inspection_completed_by IS
    'User who marked the final inspection as completed';

COMMENT ON COLUMN public.project_permits.final_inspection_completed_at IS
    'Timestamp when final inspection was marked as completed';

COMMENT ON COLUMN public.project_permits.created_at IS
    'Timestamp when this permit record was created';

COMMENT ON COLUMN public.project_permits.created_by IS
    'User who created this permit record';

COMMENT ON COLUMN public.project_permits.updated_at IS
    'Timestamp when this permit record was last updated';

COMMENT ON COLUMN public.project_permits.updated_by IS
    'User who last updated this permit record';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant usage on the table to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_permits TO authenticated;
GRANT USAGE ON SEQUENCE project_permits_id_seq TO authenticated;

-- ============================================================================
-- VERIFICATION QUERIES (Optional - for testing)
-- ============================================================================

-- Verify table was created
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_permits';

-- Verify indexes were created
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'project_permits';

-- Verify RLS is enabled
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'project_permits';

-- Verify storage bucket was created
-- SELECT * FROM storage.buckets WHERE id = 'permit-documents';
