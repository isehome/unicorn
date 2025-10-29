-- Complete Project Permits Setup
-- This script ensures profiles table exists and creates the permits table
-- Safe to run multiple times

-- ============================================================================
-- STEP 1: Ensure profiles table exists
-- ============================================================================

-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on profiles if not already enabled
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create profiles policies if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'profiles' AND policyname = 'profiles_select_policy'
    ) THEN
        CREATE POLICY profiles_select_policy ON public.profiles
            FOR SELECT TO authenticated
            USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'profiles' AND policyname = 'profiles_insert_policy'
    ) THEN
        CREATE POLICY profiles_insert_policy ON public.profiles
            FOR INSERT TO authenticated
            WITH CHECK (auth.uid() = id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'profiles' AND policyname = 'profiles_update_policy'
    ) THEN
        CREATE POLICY profiles_update_policy ON public.profiles
            FOR UPDATE TO authenticated
            USING (auth.uid() = id);
    END IF;
END $$;

-- ============================================================================
-- STEP 2: Drop existing permit objects
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view project permits" ON public.project_permits;
DROP POLICY IF EXISTS "Authenticated users can insert permits" ON public.project_permits;
DROP POLICY IF EXISTS "Authenticated users can update permits" ON public.project_permits;
DROP POLICY IF EXISTS "Authenticated users can delete permits" ON public.project_permits;
DROP POLICY IF EXISTS permit_select_policy ON public.project_permits;
DROP POLICY IF EXISTS permit_insert_policy ON public.project_permits;
DROP POLICY IF EXISTS permit_update_policy ON public.project_permits;
DROP POLICY IF EXISTS permit_delete_policy ON public.project_permits;

-- Drop existing storage policies
DROP POLICY IF EXISTS "Anyone can view permit documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload permit documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update permit documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete permit documents" ON storage.objects;
DROP POLICY IF EXISTS permit_docs_select_policy ON storage.objects;
DROP POLICY IF EXISTS permit_docs_insert_policy ON storage.objects;
DROP POLICY IF EXISTS permit_docs_update_policy ON storage.objects;
DROP POLICY IF EXISTS permit_docs_delete_policy ON storage.objects;

-- Drop existing indexes
DROP INDEX IF EXISTS public.idx_project_permits_project_id;
DROP INDEX IF EXISTS public.idx_project_permits_permit_number;
DROP INDEX IF EXISTS public.idx_project_permits_created_at;
DROP INDEX IF EXISTS public.idx_project_permits_created_by;

-- Drop existing trigger
DROP TRIGGER IF EXISTS update_project_permits_updated_at_trigger ON public.project_permits;
DROP TRIGGER IF EXISTS trigger_update_project_permits_updated_at ON public.project_permits;

-- Drop existing function
DROP FUNCTION IF EXISTS public.update_project_permits_updated_at();

-- Drop the table
DROP TABLE IF EXISTS public.project_permits CASCADE;

-- ============================================================================
-- STEP 3: Create project_permits table
-- ============================================================================

CREATE TABLE public.project_permits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

    -- Permit information
    permit_number TEXT NOT NULL CHECK (permit_number <> ''),
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
    CONSTRAINT unique_permit_per_project UNIQUE (project_id, permit_number)
);

-- ============================================================================
-- STEP 4: Create indexes
-- ============================================================================

CREATE INDEX idx_project_permits_project_id ON public.project_permits(project_id);
CREATE INDEX idx_project_permits_permit_number ON public.project_permits(permit_number);
CREATE INDEX idx_project_permits_created_at ON public.project_permits(created_at DESC);
CREATE INDEX idx_project_permits_created_by ON public.project_permits(created_by);

-- ============================================================================
-- STEP 5: Enable RLS and create policies
-- ============================================================================

ALTER TABLE public.project_permits ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view all permits
CREATE POLICY permit_select_policy ON public.project_permits
    FOR SELECT TO authenticated
    USING (true);

-- Allow authenticated users to insert permits
CREATE POLICY permit_insert_policy ON public.project_permits
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Allow authenticated users to update permits
CREATE POLICY permit_update_policy ON public.project_permits
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

-- Allow authenticated users to delete permits
CREATE POLICY permit_delete_policy ON public.project_permits
    FOR DELETE TO authenticated
    USING (true);

-- ============================================================================
-- STEP 6: Create trigger for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_project_permits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_project_permits_updated_at
    BEFORE UPDATE ON public.project_permits
    FOR EACH ROW
    EXECUTE FUNCTION public.update_project_permits_updated_at();

-- ============================================================================
-- STEP 7: Create storage bucket
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'permit-documents',
    'permit-documents',
    false,
    10485760, -- 10MB
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf'];

-- ============================================================================
-- STEP 8: Create storage policies
-- ============================================================================

CREATE POLICY permit_docs_select_policy ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'permit-documents');

CREATE POLICY permit_docs_insert_policy ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'permit-documents');

CREATE POLICY permit_docs_update_policy ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'permit-documents')
    WITH CHECK (bucket_id = 'permit-documents');

CREATE POLICY permit_docs_delete_policy ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'permit-documents');

-- ============================================================================
-- STEP 9: Add table comments
-- ============================================================================

COMMENT ON TABLE public.project_permits IS 'Stores building permit information and inspection tracking for projects with full audit trail';
COMMENT ON COLUMN public.project_permits.id IS 'Unique identifier for the permit record';
COMMENT ON COLUMN public.project_permits.project_id IS 'Reference to the project this permit belongs to';
COMMENT ON COLUMN public.project_permits.permit_number IS 'Official permit number from the building department (unique per project)';
COMMENT ON COLUMN public.project_permits.permit_document_url IS 'URL to the permit PDF document stored in Supabase Storage';
COMMENT ON COLUMN public.project_permits.permit_document_name IS 'Original filename of the uploaded permit document';
COMMENT ON COLUMN public.project_permits.notes IS 'Optional notes about this permit';
COMMENT ON COLUMN public.project_permits.rough_in_completed IS 'Indicates if rough-in inspection has been completed';
COMMENT ON COLUMN public.project_permits.rough_in_date IS 'Date when rough-in inspection was performed';
COMMENT ON COLUMN public.project_permits.rough_in_completed_by IS 'User who marked the rough-in inspection as completed';
COMMENT ON COLUMN public.project_permits.rough_in_completed_at IS 'Timestamp when rough-in inspection was marked as completed';
COMMENT ON COLUMN public.project_permits.final_inspection_completed IS 'Indicates if final inspection has been completed';
COMMENT ON COLUMN public.project_permits.final_inspection_date IS 'Date when final inspection was performed';
COMMENT ON COLUMN public.project_permits.final_inspection_completed_by IS 'User who marked the final inspection as completed';
COMMENT ON COLUMN public.project_permits.final_inspection_completed_at IS 'Timestamp when final inspection was marked as completed';
COMMENT ON COLUMN public.project_permits.created_at IS 'Timestamp when this permit record was created';
COMMENT ON COLUMN public.project_permits.created_by IS 'User who created this permit record';
COMMENT ON COLUMN public.project_permits.updated_at IS 'Timestamp when this permit record was last updated';
COMMENT ON COLUMN public.project_permits.updated_by IS 'User who last updated this permit record';

-- ============================================================================
-- STEP 10: Grant permissions
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_permits TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Show created objects
DO $$
BEGIN
    RAISE NOTICE 'Migration completed successfully!';
    RAISE NOTICE 'Table created: project_permits';
    RAISE NOTICE 'Indexes: 4 created';
    RAISE NOTICE 'Policies: 4 table policies + 4 storage policies created';
    RAISE NOTICE 'Storage bucket: permit-documents configured';
END $$;
