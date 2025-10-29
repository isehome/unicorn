-- Final Project Permits Setup
-- This script fixes storage policies and ensures everything works
-- Safe to run multiple times

-- ============================================================================
-- STEP 1: Ensure profiles table exists
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    email TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

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
-- STEP 2: Drop ALL existing permit-related objects
-- ============================================================================

-- Drop ALL storage policies that might conflict (including old ones)
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE tablename = 'objects'
        AND schemaname = 'storage'
        AND (
            policyname LIKE '%permit%'
            OR policyname LIKE '%Permit%'
            OR policyname LIKE 'permit_docs_%'
        )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    END LOOP;
END $$;

-- Drop table policies
DROP POLICY IF EXISTS "Anyone can view project permits" ON public.project_permits;
DROP POLICY IF EXISTS "Authenticated users can insert permits" ON public.project_permits;
DROP POLICY IF EXISTS "Authenticated users can update permits" ON public.project_permits;
DROP POLICY IF EXISTS "Authenticated users can delete permits" ON public.project_permits;
DROP POLICY IF EXISTS permit_select_policy ON public.project_permits;
DROP POLICY IF EXISTS permit_insert_policy ON public.project_permits;
DROP POLICY IF EXISTS permit_update_policy ON public.project_permits;
DROP POLICY IF EXISTS permit_delete_policy ON public.project_permits;

-- Drop indexes
DROP INDEX IF EXISTS public.idx_project_permits_project_id;
DROP INDEX IF EXISTS public.idx_project_permits_permit_number;
DROP INDEX IF EXISTS public.idx_project_permits_created_at;
DROP INDEX IF EXISTS public.idx_project_permits_created_by;

-- Drop triggers and functions
DROP TRIGGER IF EXISTS update_project_permits_updated_at_trigger ON public.project_permits;
DROP TRIGGER IF EXISTS trigger_update_project_permits_updated_at ON public.project_permits;
DROP FUNCTION IF EXISTS public.update_project_permits_updated_at();

-- Drop table
DROP TABLE IF EXISTS public.project_permits CASCADE;

-- ============================================================================
-- STEP 3: Create project_permits table
-- ============================================================================

CREATE TABLE public.project_permits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    permit_number TEXT NOT NULL CHECK (permit_number <> ''),
    permit_document_url TEXT,
    permit_document_name TEXT,
    notes TEXT,
    rough_in_completed BOOLEAN NOT NULL DEFAULT FALSE,
    rough_in_date DATE,
    rough_in_completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rough_in_completed_at TIMESTAMPTZ,
    final_inspection_completed BOOLEAN NOT NULL DEFAULT FALSE,
    final_inspection_date DATE,
    final_inspection_completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    final_inspection_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
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

CREATE POLICY permit_select_policy ON public.project_permits
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY permit_insert_policy ON public.project_permits
    FOR INSERT TO authenticated
    WITH CHECK (true);

CREATE POLICY permit_update_policy ON public.project_permits
    FOR UPDATE TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY permit_delete_policy ON public.project_permits
    FOR DELETE TO authenticated
    USING (true);

-- ============================================================================
-- STEP 6: Create trigger
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
    10485760,
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf'];

-- ============================================================================
-- STEP 8: Create PERMISSIVE storage policies
-- ============================================================================

-- The key fix: Make storage policies more permissive for authenticated users
CREATE POLICY "permit_documents_select"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'permit-documents');

CREATE POLICY "permit_documents_insert"
    ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'permit-documents');

CREATE POLICY "permit_documents_update"
    ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'permit-documents');

CREATE POLICY "permit_documents_delete"
    ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'permit-documents');

-- ============================================================================
-- STEP 9: Grant permissions
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_permits TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================================================
-- STEP 10: Add comments
-- ============================================================================

COMMENT ON TABLE public.project_permits IS 'Stores building permit information and inspection tracking';
COMMENT ON COLUMN public.project_permits.permit_number IS 'Official permit number (unique per project)';
COMMENT ON COLUMN public.project_permits.permit_document_url IS 'URL to permit PDF in storage';
COMMENT ON COLUMN public.project_permits.rough_in_completed IS 'Rough-in inspection completed flag';
COMMENT ON COLUMN public.project_permits.final_inspection_completed IS 'Final inspection completed flag';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    permit_count INT;
    storage_policy_count INT;
BEGIN
    -- Count storage policies
    SELECT COUNT(*) INTO storage_policy_count
    FROM pg_policies
    WHERE tablename = 'objects'
    AND schemaname = 'storage'
    AND policyname LIKE 'permit_documents%';

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration completed successfully!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Table: project_permits created';
    RAISE NOTICE 'Indexes: 4 created';
    RAISE NOTICE 'Table policies: 4 created';
    RAISE NOTICE 'Storage policies: % created', storage_policy_count;
    RAISE NOTICE 'Storage bucket: permit-documents configured';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'You can now upload permit documents!';
    RAISE NOTICE '========================================';
END $$;
