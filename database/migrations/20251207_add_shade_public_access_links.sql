-- Create shade_public_access_links table for external designer portal access
CREATE TABLE IF NOT EXISTS public.shade_public_access_links (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    stakeholder_id uuid NOT NULL, -- References project_stakeholders assignment_id
    contact_email text NOT NULL,
    contact_name text,
    token_hash text NOT NULL,
    otp_hash text,
    otp_expires_at timestamptz,
    session_token_hash text,
    session_expires_at timestamptz,
    session_version integer DEFAULT 0,
    verification_attempts integer DEFAULT 0,
    metadata jsonb DEFAULT '{}',
    revoked_at timestamptz,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(project_id, stakeholder_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_shade_public_access_project ON public.shade_public_access_links(project_id);
CREATE INDEX IF NOT EXISTS idx_shade_public_access_stakeholder ON public.shade_public_access_links(stakeholder_id);
CREATE INDEX IF NOT EXISTS idx_shade_public_access_token ON public.shade_public_access_links(token_hash);

-- Enable RLS
ALTER TABLE public.shade_public_access_links ENABLE ROW LEVEL SECURITY;

-- RLS policy for development (allow all authenticated users)
CREATE POLICY shade_public_links_all ON public.shade_public_access_links
    FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.shade_public_access_links IS 'Stores secure access tokens for external designer shade review portal';
COMMENT ON COLUMN public.shade_public_access_links.stakeholder_id IS 'References project_stakeholders assignment_id';
COMMENT ON COLUMN public.shade_public_access_links.token_hash IS 'SHA-256 hash of the portal access token';
COMMENT ON COLUMN public.shade_public_access_links.otp_hash IS 'SHA-256 hash of the one-time verification code';
