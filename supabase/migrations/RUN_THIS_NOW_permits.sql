-- ============================================================================
-- QUICK SETUP: Project Permits for Production
-- Run this in Supabase SQL Editor
-- Safe to run multiple times
-- ============================================================================

-- Step 1: Ensure profiles table exists (should already exist from Microsoft auth)
-- Just verify it's there, don't recreate

-- Step 2: Create project_permits table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.project_permits (
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

-- Step 3: Enable RLS
ALTER TABLE public.project_permits ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop old policies if they exist (cleanup)
DROP POLICY IF EXISTS permit_select_policy ON public.project_permits;
DROP POLICY IF EXISTS permit_insert_policy ON public.project_permits;
DROP POLICY IF EXISTS permit_update_policy ON public.project_permits;
DROP POLICY IF EXISTS permit_delete_policy ON public.project_permits;

-- Step 5: Create new permissive policies
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

-- Step 6: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_permits_project_id ON public.project_permits(project_id);
CREATE INDEX IF NOT EXISTS idx_project_permits_permit_number ON public.project_permits(permit_number);
CREATE INDEX IF NOT EXISTS idx_project_permits_created_at ON public.project_permits(created_at DESC);

-- Step 7: Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_project_permits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_project_permits_updated_at ON public.project_permits;

CREATE TRIGGER trigger_update_project_permits_updated_at
    BEFORE UPDATE ON public.project_permits
    FOR EACH ROW
    EXECUTE FUNCTION public.update_project_permits_updated_at();

-- Step 8: Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_permits TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SUCCESS! Permit system is ready to use!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'You can now:';
    RAISE NOTICE '  - Add permits to projects';
    RAISE NOTICE '  - Upload permit documents';
    RAISE NOTICE '  - Track inspections';
    RAISE NOTICE '========================================';
END $$;
