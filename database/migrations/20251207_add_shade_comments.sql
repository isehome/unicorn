-- Add shade comments table (follows issue_comments pattern)
-- Comments can be internal (visible only to staff) or external (visible on public portal)

CREATE TABLE IF NOT EXISTS public.shade_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shade_id UUID NOT NULL REFERENCES public.project_shades(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    comment_text TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT TRUE,
    author_id UUID,
    author_name TEXT,
    author_email TEXT,
    notification_pending BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient lookups by shade
CREATE INDEX IF NOT EXISTS idx_shade_comments_shade_id ON public.shade_comments(shade_id);
CREATE INDEX IF NOT EXISTS idx_shade_comments_project_id ON public.shade_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_shade_comments_is_internal ON public.shade_comments(is_internal);

-- RLS policies (include anon since we use MSAL, not Supabase Auth)
ALTER TABLE public.shade_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shade_comments_select" ON public.shade_comments
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "shade_comments_insert" ON public.shade_comments
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

CREATE POLICY "shade_comments_update" ON public.shade_comments
    FOR UPDATE TO anon, authenticated
    USING (true);

CREATE POLICY "shade_comments_delete" ON public.shade_comments
    FOR DELETE TO anon, authenticated
    USING (true);

-- Add approved_by_email to project_shades for external approver tracking
ALTER TABLE public.project_shades
ADD COLUMN IF NOT EXISTS approved_by_email TEXT;

-- Add comment about the approved_by field
COMMENT ON COLUMN public.project_shades.approved_by IS 'Name of approver (internal user displayName or external stakeholder name)';
COMMENT ON COLUMN public.project_shades.approved_by_email IS 'Email of approver for external stakeholders';

-- Add project-level shade approval tracking
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS shades_approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS shades_approved_by TEXT,
ADD COLUMN IF NOT EXISTS shades_approved_by_email TEXT;

COMMENT ON COLUMN public.projects.shades_approved_at IS 'Timestamp when all shades were approved';
COMMENT ON COLUMN public.projects.shades_approved_by IS 'Name of person who approved all shades';

-- Add notification_pending flag for shade approval notifications
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS shades_approval_notification_pending BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.projects.shades_approval_notification_pending IS 'Flag to track if notification needs to be sent for shade approval';
