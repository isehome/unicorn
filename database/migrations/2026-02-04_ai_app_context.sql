-- AI App Context Table
-- Stores editable business knowledge that the AI agent uses to understand the app
-- Instead of hardcoding "what is Unicorn" in code, store it here so it's editable

CREATE TABLE IF NOT EXISTS ai_app_context (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,           -- 'company', 'app', 'workflow', 'terminology', etc.
    key TEXT NOT NULL,                -- 'name', 'description', 'services', etc.
    value TEXT NOT NULL,              -- The actual content
    description TEXT,                 -- Admin hint about what this field is for
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES profiles(id),
    UNIQUE(category, key)
);

-- Enable RLS
ALTER TABLE ai_app_context ENABLE ROW LEVEL SECURITY;

-- Everyone can read (AI needs to read this)
CREATE POLICY "ai_app_context_read" ON ai_app_context
    FOR SELECT USING (true);

-- Only admins can write
CREATE POLICY "ai_app_context_write" ON ai_app_context
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'owner')
        )
    );

-- Insert default values
INSERT INTO ai_app_context (category, key, value, description) VALUES
    -- Company info
    ('company', 'name', 'ISE (Integrated Smart Environments)', 'Company name'),
    ('company', 'description', 'Low-voltage and smart home installation company based in Indianapolis', 'Brief company description'),
    ('company', 'services', 'Motorized shades and window treatments, Home automation (Control4, Lutron), Networking (Ubiquiti UniFi), Audio/video systems (Sonos, Apple TV), Structured cabling and prewire', 'Services offered'),
    ('company', 'manufacturers', 'Lutron, Control4, Ubiquiti, Sonos, Apple, Hunter Douglas, Graber', 'Key manufacturers/brands'),

    -- App info
    ('app', 'name', 'Unicorn', 'App name'),
    ('app', 'purpose', 'Project management and field operations for smart home installations', 'What the app does'),
    ('app', 'users', 'Technicians (field work), Project Managers (oversight), Directors/Admins (management)', 'Who uses the app'),

    -- Workflow stages
    ('workflow', 'stages', 'Prewire → Trim-out → Commissioning → Service', 'Project lifecycle stages'),
    ('workflow', 'prewire', 'Installing cables, wire drops, and rough-in before drywall goes up. Technicians label and photograph all runs.', 'Prewire stage description'),
    ('workflow', 'trimout', 'Installing devices after drywall: shades, switches, outlets, equipment racks. Requires accurate measurements.', 'Trim-out stage description'),
    ('workflow', 'commissioning', 'Programming and testing all systems. Control4/Lutron programming, network configuration, shade calibration.', 'Commissioning stage description'),
    ('workflow', 'service', 'Ongoing support, troubleshooting, and maintenance for completed projects.', 'Service stage description'),

    -- Terminology
    ('terminology', 'shades', 'Also called: blinds, window treatments, window coverings. All refer to motorized shades.', 'Shade terminology'),
    ('terminology', 'wire_drops', 'Cable runs from structured wiring panel to device locations. Each drop has a label and destination.', 'Wire drop terminology'),
    ('terminology', 'prewire', 'The initial rough-in phase before drywall. All cables must be run during this phase.', 'Prewire terminology'),
    ('terminology', 'low_voltage', 'Wiring that carries data/signal rather than power (Cat6, coax, speaker wire). What ISE specializes in.', 'Low voltage terminology'),

    -- Data model hints for AI
    ('data', 'contact_to_project', 'Contacts are clients/homeowners. Each contact can have multiple projects (homes/jobs).', 'Contact-Project relationship'),
    ('data', 'project_contents', 'Projects contain: shades (window treatments), equipment (devices), wire_drops (cables), issues, procurement items.', 'What projects contain'),
    ('data', 'equipment_examples', 'Equipment includes: Apple TV, Sonos speakers, UniFi switches, Control4 controllers, Lutron processors, TVs, amplifiers.', 'Equipment examples')

ON CONFLICT (category, key) DO UPDATE SET
    value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = NOW();

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_ai_app_context_category ON ai_app_context(category);

-- Function to get all context as JSON (for AI)
CREATE OR REPLACE FUNCTION get_ai_app_context()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT json_object_agg(
        category,
        (SELECT json_object_agg(key, value) FROM ai_app_context ac2 WHERE ac2.category = ac1.category)
    )
    FROM (SELECT DISTINCT category FROM ai_app_context) ac1;
$$;

COMMENT ON TABLE ai_app_context IS 'Editable business knowledge for the AI agent. Update these values to change what the AI knows about the company and app.';
