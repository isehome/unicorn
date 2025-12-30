-- ============================================================
-- RETELL AI INTEGRATION FOR UNICORN SERVICE CRM
-- ============================================================

-- 1. Customer SLA Tiers
CREATE TABLE IF NOT EXISTS public.customer_sla_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    response_time_hours INTEGER NOT NULL DEFAULT 24,
    available_24_7 BOOLEAN NOT NULL DEFAULT FALSE,
    priority_routing BOOLEAN NOT NULL DEFAULT FALSE,
    direct_technician_access BOOLEAN NOT NULL DEFAULT FALSE,
    monthly_cost NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default tiers
INSERT INTO public.customer_sla_tiers (name, description, response_time_hours, available_24_7, priority_routing, direct_technician_access, monthly_cost)
VALUES
    ('standard', 'Standard support - business hours, 24hr response', 24, FALSE, FALSE, FALSE, 0),
    ('priority', 'Priority support - extended hours, 4hr response', 4, FALSE, TRUE, FALSE, 99),
    ('premium', 'Premium 24/7 support - immediate response, direct tech access', 1, TRUE, TRUE, TRUE, 299)
ON CONFLICT (name) DO NOTHING;

-- 2. Customer SLA Assignments
CREATE TABLE IF NOT EXISTS public.customer_sla_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    sla_tier_id UUID NOT NULL REFERENCES public.customer_sla_tiers(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    auto_renew BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    CONSTRAINT customer_sla_unique_active UNIQUE (contact_id, sla_tier_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_sla_contact ON public.customer_sla_assignments(contact_id);

-- 3. Retell Call Logs
CREATE TABLE IF NOT EXISTS public.retell_call_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id TEXT NOT NULL UNIQUE,
    agent_id TEXT NOT NULL,
    from_number TEXT,
    to_number TEXT,
    direction TEXT CHECK (direction IN ('inbound', 'outbound')),
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    customer_identified BOOLEAN DEFAULT FALSE,
    customer_name TEXT,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    duration_seconds INTEGER,
    call_status TEXT CHECK (call_status IN ('in_progress', 'completed', 'transferred', 'voicemail', 'no_answer', 'error')),
    transferred_to TEXT,
    voicemail_left BOOLEAN DEFAULT FALSE,
    call_summary TEXT,
    issue_category TEXT,
    issue_resolved BOOLEAN,
    sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'frustrated', 'angry')),
    ticket_id UUID REFERENCES public.service_tickets(id) ON DELETE SET NULL,
    transcript TEXT,
    retell_metadata JSONB,
    post_call_analysis JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retell_calls_contact ON public.retell_call_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_retell_calls_ticket ON public.retell_call_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_retell_calls_from ON public.retell_call_logs(from_number);
CREATE INDEX IF NOT EXISTS idx_retell_calls_time ON public.retell_call_logs(start_time);

-- 4. Enhanced Customer Lookup Function
-- Drop existing function first (return type changed)
DROP FUNCTION IF EXISTS find_customer_by_phone(text);

CREATE OR REPLACE FUNCTION find_customer_by_phone(phone_input TEXT)
RETURNS TABLE (
    contact_id UUID,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    contact_company TEXT,
    contact_address TEXT,
    sla_tier TEXT,
    sla_24_7 BOOLEAN,
    sla_response_hours INTEGER,
    projects JSONB,
    recent_tickets JSONB,
    equipment_summary JSONB,
    total_projects INTEGER,
    open_tickets INTEGER
) AS $$
DECLARE
    normalized_phone TEXT;
BEGIN
    -- Normalize phone (remove formatting, handle country code)
    normalized_phone := regexp_replace(phone_input, '[^0-9]', '', 'g');
    IF length(normalized_phone) = 11 AND normalized_phone LIKE '1%' THEN
        normalized_phone := substring(normalized_phone from 2);
    END IF;

    RETURN QUERY
    WITH matched_contact AS (
        SELECT c.*
        FROM contacts c
        WHERE regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE '%' || normalized_phone
           OR regexp_replace(c.phone, '[^0-9]', '', 'g') = '1' || normalized_phone
        LIMIT 1
    ),
    contact_sla AS (
        SELECT
            csa.contact_id,
            cst.name as tier_name,
            cst.available_24_7,
            cst.response_time_hours
        FROM customer_sla_assignments csa
        JOIN customer_sla_tiers cst ON csa.sla_tier_id = cst.id
        WHERE csa.contact_id = (SELECT id FROM matched_contact)
          AND (csa.end_date IS NULL OR csa.end_date > CURRENT_DATE)
        ORDER BY cst.response_time_hours ASC
        LIMIT 1
    ),
    contact_projects AS (
        SELECT
            jsonb_agg(jsonb_build_object(
                'id', p.id,
                'name', p.name,
                'address', p.address,
                'phase', p.phase
            ) ORDER BY p.created_at DESC) as projects,
            COUNT(*)::INTEGER as total
        FROM projects p
        WHERE p.client = (SELECT name FROM matched_contact)
           OR p.id IN (
               SELECT DISTINCT c2.project_id
               FROM contacts c2
               WHERE c2.id = (SELECT id FROM matched_contact)
           )
    ),
    contact_tickets AS (
        SELECT
            jsonb_agg(jsonb_build_object(
                'id', st.id,
                'ticket_number', st.ticket_number,
                'title', st.title,
                'status', st.status,
                'created_at', st.created_at
            ) ORDER BY st.created_at DESC) as tickets,
            COUNT(*) FILTER (WHERE st.status NOT IN ('closed', 'resolved', 'cancelled'))::INTEGER as open_count
        FROM service_tickets st
        WHERE st.contact_id = (SELECT id FROM matched_contact)
           OR st.customer_phone LIKE '%' || normalized_phone || '%'
        LIMIT 5
    ),
    contact_equipment AS (
        SELECT jsonb_agg(DISTINCT jsonb_build_object(
            'category', COALESCE(pe.category, 'general'),
            'manufacturer', COALESCE(gp.manufacturer, pe.manufacturer, 'Unknown'),
            'model', COALESCE(gp.model, pe.model)
        )) as equipment
        FROM project_equipment pe
        LEFT JOIN global_parts gp ON pe.global_part_id = gp.id
        JOIN projects p ON pe.project_id = p.id
        WHERE p.client = (SELECT name FROM matched_contact)
           OR p.id IN (SELECT project_id FROM contacts WHERE id = (SELECT id FROM matched_contact))
        LIMIT 20
    )
    SELECT
        mc.id as contact_id,
        mc.name as contact_name,
        mc.email as contact_email,
        mc.phone as contact_phone,
        mc.company as contact_company,
        COALESCE(mc.address, (SELECT address FROM projects WHERE client = mc.name LIMIT 1)) as contact_address,
        COALESCE(cs.tier_name, 'standard') as sla_tier,
        COALESCE(cs.available_24_7, FALSE) as sla_24_7,
        COALESCE(cs.response_time_hours, 24) as sla_response_hours,
        COALESCE(cp.projects, '[]'::jsonb) as projects,
        COALESCE(ct.tickets, '[]'::jsonb) as recent_tickets,
        COALESCE(ce.equipment, '[]'::jsonb) as equipment_summary,
        COALESCE(cp.total, 0) as total_projects,
        COALESCE(ct.open_count, 0) as open_tickets
    FROM matched_contact mc
    LEFT JOIN contact_sla cs ON cs.contact_id = mc.id
    CROSS JOIN contact_projects cp
    CROSS JOIN contact_tickets ct
    CROSS JOIN contact_equipment ce;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Add AI columns to service_tickets
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_tickets' AND column_name = 'source') THEN
        ALTER TABLE service_tickets ADD COLUMN source TEXT DEFAULT 'manual';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_tickets' AND column_name = 'source_reference') THEN
        ALTER TABLE service_tickets ADD COLUMN source_reference TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_tickets' AND column_name = 'ai_triage_notes') THEN
        ALTER TABLE service_tickets ADD COLUMN ai_triage_notes TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_tickets' AND column_name = 'troubleshooting_attempted') THEN
        ALTER TABLE service_tickets ADD COLUMN troubleshooting_attempted BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_tickets' AND column_name = 'troubleshooting_steps') THEN
        ALTER TABLE service_tickets ADD COLUMN troubleshooting_steps TEXT;
    END IF;
END $$;

-- 6. RLS Policies
ALTER TABLE public.customer_sla_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_sla_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retell_call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sla_tiers_read ON public.customer_sla_tiers;
CREATE POLICY sla_tiers_read ON public.customer_sla_tiers FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS sla_assignments_all ON public.customer_sla_assignments;
CREATE POLICY sla_assignments_all ON public.customer_sla_assignments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS retell_logs_all ON public.retell_call_logs;
CREATE POLICY retell_logs_all ON public.retell_call_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

SELECT 'Retell AI integration migration complete!' as status;
