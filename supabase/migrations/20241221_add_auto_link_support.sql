-- Auto-Link Support for Knowledge Base to Global Parts
-- Adds tracking columns for automated document-to-part linking
-- Also adds job_runs table for tracking nightly cron jobs

-- ============================================
-- ENHANCE global_part_documents TABLE
-- ============================================

-- Add source tracking (manual vs auto-linked)
ALTER TABLE global_part_documents
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto-linked', 'ai-suggested'));

-- Add confidence score for auto-linked docs (0.0-1.0)
ALTER TABLE global_part_documents
ADD COLUMN IF NOT EXISTS confidence FLOAT;

-- Track what field was matched on
ALTER TABLE global_part_documents
ADD COLUMN IF NOT EXISTS matched_on TEXT
    CHECK (matched_on IN ('model', 'part_number', 'manufacturer', 'sku', 'name'));

-- Link back to knowledge_documents for traceability
ALTER TABLE global_part_documents
ADD COLUMN IF NOT EXISTS knowledge_doc_id UUID REFERENCES knowledge_documents(id) ON DELETE SET NULL;

-- Index for finding auto-linked docs
CREATE INDEX IF NOT EXISTS idx_global_part_documents_source
ON global_part_documents(source);

CREATE INDEX IF NOT EXISTS idx_global_part_documents_knowledge_doc
ON global_part_documents(knowledge_doc_id);

-- ============================================
-- JOB RUNS TABLE (for cron job tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS job_runs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_name TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    stats JSONB DEFAULT '{}',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying job history
CREATE INDEX IF NOT EXISTS idx_job_runs_name_started
ON job_runs(job_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_runs_status
ON job_runs(status);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE job_runs ENABLE ROW LEVEL SECURITY;

-- Anyone can view job runs (for admin dashboard)
CREATE POLICY "Anyone can view job runs"
ON job_runs FOR SELECT
TO anon, authenticated
USING (true);

-- Service role can manage job runs
CREATE POLICY "Service role can manage job runs"
ON job_runs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get recent job runs
CREATE OR REPLACE FUNCTION get_recent_job_runs(
    p_job_name TEXT DEFAULT NULL,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    id UUID,
    job_name TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    status TEXT,
    stats JSONB,
    error_message TEXT,
    duration_seconds NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        jr.id,
        jr.job_name,
        jr.started_at,
        jr.completed_at,
        jr.status,
        jr.stats,
        jr.error_message,
        EXTRACT(EPOCH FROM (jr.completed_at - jr.started_at)) as duration_seconds
    FROM job_runs jr
    WHERE (p_job_name IS NULL OR jr.job_name = p_job_name)
    ORDER BY jr.started_at DESC
    LIMIT p_limit;
END;
$$;

-- Function to auto-link documents to parts (called by cron job)
-- Returns summary of what was linked
CREATE OR REPLACE FUNCTION auto_link_knowledge_to_parts()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_docs_processed INT := 0;
    v_links_created INT := 0;
    v_doc RECORD;
    v_part RECORD;
    v_confidence FLOAT;
    v_matched_on TEXT;
    v_doc_title_lower TEXT;
BEGIN
    -- Loop through all ready knowledge documents
    FOR v_doc IN
        SELECT kd.id, kd.title, kd.file_name, km.name as manufacturer_name
        FROM knowledge_documents kd
        LEFT JOIN knowledge_manufacturers km ON kd.manufacturer_id = km.id
        WHERE kd.status = 'ready'
    LOOP
        v_docs_processed := v_docs_processed + 1;
        v_doc_title_lower := LOWER(v_doc.title || ' ' || v_doc.file_name);

        -- Try to match against global_parts
        FOR v_part IN
            SELECT id, part_number, name, manufacturer, model
            FROM global_parts
            WHERE
                -- Match on model (highest priority)
                (model IS NOT NULL AND model != '' AND v_doc_title_lower ILIKE '%' || LOWER(model) || '%')
                OR
                -- Match on part_number
                (part_number IS NOT NULL AND part_number != '' AND v_doc_title_lower ILIKE '%' || LOWER(part_number) || '%')
                OR
                -- Match on manufacturer from doc
                (v_doc.manufacturer_name IS NOT NULL AND manufacturer IS NOT NULL
                 AND LOWER(manufacturer) = LOWER(v_doc.manufacturer_name))
        LOOP
            -- Determine confidence and match type
            IF v_part.model IS NOT NULL AND v_doc_title_lower ILIKE '%' || LOWER(v_part.model) || '%' THEN
                v_confidence := 0.95;
                v_matched_on := 'model';
            ELSIF v_part.part_number IS NOT NULL AND v_doc_title_lower ILIKE '%' || LOWER(v_part.part_number) || '%' THEN
                v_confidence := 0.90;
                v_matched_on := 'part_number';
            ELSE
                v_confidence := 0.60;
                v_matched_on := 'manufacturer';
            END IF;

            -- Insert link if it doesn't exist
            INSERT INTO global_part_documents (
                part_id,
                document_type,
                label,
                url,
                source,
                confidence,
                matched_on,
                knowledge_doc_id
            )
            SELECT
                v_part.id,
                CASE
                    WHEN v_doc.title ILIKE '%spec%' THEN 'datasheet'
                    WHEN v_doc.title ILIKE '%install%' THEN 'instruction'
                    WHEN v_doc.title ILIKE '%manual%' THEN 'manual'
                    WHEN v_doc.title ILIKE '%schematic%' OR v_doc.title ILIKE '%wiring%' THEN 'schematic'
                    ELSE 'other'
                END,
                v_doc.title,
                (SELECT file_url FROM knowledge_documents WHERE id = v_doc.id),
                'auto-linked',
                v_confidence,
                v_matched_on,
                v_doc.id
            WHERE NOT EXISTS (
                SELECT 1 FROM global_part_documents
                WHERE part_id = v_part.id
                AND knowledge_doc_id = v_doc.id
            );

            IF FOUND THEN
                v_links_created := v_links_created + 1;
            END IF;
        END LOOP;
    END LOOP;

    RETURN jsonb_build_object(
        'docs_processed', v_docs_processed,
        'links_created', v_links_created,
        'completed_at', NOW()
    );
END;
$$;
