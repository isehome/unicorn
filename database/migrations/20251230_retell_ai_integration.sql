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
-- This function finds customers by phone and returns their projects WITH team members
-- Matches by: contact name = projects.client, contact company = projects.client,
--             or contact has "Client" stakeholder role on project
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
) AS $func$
DECLARE
    normalized_phone TEXT;
    matched_contact_id UUID;
    matched_contact_name TEXT;
    matched_contact_company TEXT;
BEGIN
    normalized_phone := regexp_replace(phone_input, '[^0-9]', '', 'g');
    IF length(normalized_phone) = 11 AND normalized_phone LIKE '1%' THEN
        normalized_phone := substring(normalized_phone from 2);
    END IF;

    -- Find contact (exclude internal staff)
    SELECT c.id, c.name, c.company INTO matched_contact_id, matched_contact_name, matched_contact_company
    FROM contacts c
    WHERE (regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE '%' || normalized_phone
       OR regexp_replace(c.phone, '[^0-9]', '', 'g') = '1' || normalized_phone)
      AND (c.is_internal = false OR c.is_internal IS NULL)
    LIMIT 1;

    IF matched_contact_id IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH contact_sla AS (
        SELECT csa.contact_id, cst.name as tier_name, cst.available_24_7, cst.response_time_hours
        FROM customer_sla_assignments csa
        JOIN customer_sla_tiers cst ON csa.sla_tier_id = cst.id
        WHERE csa.contact_id = matched_contact_id
          AND (csa.end_date IS NULL OR csa.end_date > CURRENT_DATE)
        LIMIT 1
    ),
    -- Find projects where contact is the client (by name, company, or stakeholder role)
    client_projects AS (
        SELECT p.id, p.name, p.address, p.phase, p.status, p.created_at, p.unifi_site_id,
               CASE WHEN p.status IN ('active', 'in_progress') THEN 0 ELSE 1 END as status_order
        FROM projects p
        WHERE p.client = matched_contact_name OR p.client = matched_contact_company
        UNION
        SELECT p.id, p.name, p.address, p.phase, p.status, p.created_at, p.unifi_site_id,
               CASE WHEN p.status IN ('active', 'in_progress') THEN 0 ELSE 1 END as status_order
        FROM projects p
        JOIN project_stakeholders ps ON ps.project_id = p.id
        JOIN stakeholder_roles sr ON ps.stakeholder_role_id = sr.id
        WHERE ps.contact_id = matched_contact_id AND sr.name = 'Client'
    ),
    -- Get team members (PM, Lead Tech) for each project
    projects_with_team AS (
        SELECT
            cp.id, cp.name, cp.address, cp.phase, cp.status, cp.unifi_site_id,
            jsonb_agg(jsonb_build_object('name', c.name, 'role', sr.name, 'phone', c.phone) ORDER BY sr.sort_order)
            FILTER (WHERE sr.category = 'internal' AND sr.name IN ('Project Manager', 'Lead Technician')) as team
        FROM client_projects cp
        LEFT JOIN project_stakeholders ps ON ps.project_id = cp.id
        LEFT JOIN contacts c ON ps.contact_id = c.id
        LEFT JOIN stakeholder_roles sr ON ps.stakeholder_role_id = sr.id
        GROUP BY cp.id, cp.name, cp.address, cp.phase, cp.status, cp.unifi_site_id, cp.status_order, cp.created_at
        ORDER BY cp.status_order, cp.created_at DESC
    ),
    contact_tickets AS (
        SELECT jsonb_agg(jsonb_build_object('id', st.id, 'ticket_number', st.ticket_number, 'title', st.title, 'status', st.status)) as tickets,
               COUNT(*) FILTER (WHERE st.status NOT IN ('closed', 'resolved', 'cancelled'))::INTEGER as open_count
        FROM service_tickets st
        WHERE st.contact_id = matched_contact_id
    ),
    contact_equipment AS (
        SELECT jsonb_agg(DISTINCT jsonb_build_object('category', COALESCE(gp.category, pe.equipment_type, 'general'), 'manufacturer', COALESCE(gp.manufacturer, pe.manufacturer, 'Unknown'))) as equipment
        FROM project_equipment pe
        LEFT JOIN global_parts gp ON pe.global_part_id = gp.id
        JOIN client_projects cp ON pe.project_id = cp.id
        LIMIT 20
    )
    SELECT
        mc.id, mc.name, mc.email, mc.phone, mc.company,
        COALESCE(mc.address, (SELECT address FROM client_projects LIMIT 1)),
        COALESCE(cs.tier_name, 'standard'), COALESCE(cs.available_24_7, FALSE), COALESCE(cs.response_time_hours, 24),
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pt.id, 'name', pt.name, 'address', pt.address, 'phase', pt.phase, 'status', pt.status, 'team', pt.team, 'unifi_site_id', pt.unifi_site_id)) FROM projects_with_team pt), '[]'::jsonb),
        COALESCE(ct.tickets, '[]'::jsonb),
        COALESCE(ce.equipment, '[]'::jsonb),
        (SELECT COUNT(*)::INTEGER FROM client_projects),
        COALESCE(ct.open_count, 0)
    FROM contacts mc
    LEFT JOIN contact_sla cs ON cs.contact_id = mc.id
    CROSS JOIN contact_tickets ct
    CROSS JOIN contact_equipment ce
    WHERE mc.id = matched_contact_id;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

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
