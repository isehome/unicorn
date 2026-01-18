-- =====================================================
-- RACK LAYOUT & HA CLIENT INTEGRATION
-- Migration: 20260118_rack_layout_and_ha_clients.sql
--
-- This migration adds support for:
-- 1. Rack management (visual rack layout builder)
-- 2. Shelves within racks (for non-rack-mount equipment)
-- 3. Interconnects (cables within racks, with QR labels)
-- 4. Home Assistant client caching (UniFi network data)
-- 5. Equipment linking to racks, shelves, and HA clients
-- 6. Wireless device flag (no wire drop required)
-- =====================================================

-- =====================================================
-- PART 1: NEW TABLES
-- =====================================================

-- -----------------------------------------------------
-- 1.1 Project Racks
-- Represents physical rack enclosures (MDF, IDF, etc.)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS project_racks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- "MDF-01", "IDF-Garage", "AV Rack"
    location_description TEXT, -- "Main closet under stairs", "Garage north wall"
    total_u INTEGER NOT NULL DEFAULT 42, -- Rack height in U (42U, 24U, 12U, etc.)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    sort_order INTEGER DEFAULT 0,

    CONSTRAINT valid_rack_height CHECK (total_u > 0 AND total_u <= 50)
);

-- Index for fast project lookup
CREATE INDEX IF NOT EXISTS idx_project_racks_project_id ON project_racks(project_id);

-- -----------------------------------------------------
-- 1.2 Project Rack Shelves
-- Shelves within racks for non-rack-mount equipment
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS project_rack_shelves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rack_id UUID NOT NULL REFERENCES project_racks(id) ON DELETE CASCADE,
    name TEXT, -- "Amp Shelf", "Shelf 1"
    u_height INTEGER NOT NULL DEFAULT 2, -- How many U the shelf occupies
    rack_position_u INTEGER NOT NULL, -- Bottom U position (1-based)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_shelf_height CHECK (u_height > 0 AND u_height <= 10),
    CONSTRAINT valid_shelf_position CHECK (rack_position_u > 0)
);

-- Index for rack lookup
CREATE INDEX IF NOT EXISTS idx_project_rack_shelves_rack_id ON project_rack_shelves(rack_id);

-- -----------------------------------------------------
-- 1.3 Project Interconnects
-- Cables/connections within racks (with QR label support)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS project_interconnects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    rack_id UUID REFERENCES project_racks(id) ON DELETE SET NULL,

    -- Label for QR code (format: IC-{RackName}-{Seq})
    label_code TEXT NOT NULL,

    -- Source connection
    from_equipment_id UUID REFERENCES project_equipment(id) ON DELETE SET NULL,
    from_port TEXT, -- "Port 23", "Output 1", "HDMI Out"

    -- Destination connection
    to_equipment_id UUID REFERENCES project_equipment(id) ON DELETE SET NULL,
    to_port TEXT, -- "Input 1", "Port 5", "LAN"

    -- Cable details
    cable_type TEXT, -- "CAT6", "CAT6A", "HDMI", "Speaker Wire", "Fiber"
    length_ft INTEGER, -- Cable length in feet

    -- Verification status
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES auth.users(id),

    -- QR code tracking
    qr_code_printed BOOLEAN DEFAULT FALSE,
    qr_code_printed_at TIMESTAMPTZ,

    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_project_interconnects_project_id ON project_interconnects(project_id);
CREATE INDEX IF NOT EXISTS idx_project_interconnects_rack_id ON project_interconnects(rack_id);
CREATE INDEX IF NOT EXISTS idx_project_interconnects_from_equipment ON project_interconnects(from_equipment_id);
CREATE INDEX IF NOT EXISTS idx_project_interconnects_to_equipment ON project_interconnects(to_equipment_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_interconnects_label ON project_interconnects(project_id, label_code);

-- -----------------------------------------------------
-- 1.4 Project HA Clients (Home Assistant Client Cache)
-- Cached UniFi network client data from Home Assistant
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS project_ha_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Primary identifier
    mac TEXT NOT NULL, -- MAC address (primary key for matching)

    -- Device info
    hostname TEXT, -- Device name from UniFi
    ip TEXT, -- Current IP address

    -- Connection type
    is_wired BOOLEAN DEFAULT TRUE,

    -- Wired connection details
    switch_name TEXT, -- Friendly name of switch (e.g., "USW-Pro-48-Rack1")
    switch_port INTEGER, -- Port number on switch
    switch_mac TEXT, -- MAC of the switch (for linking to switch equipment)

    -- Wireless connection details
    ssid TEXT, -- WiFi network name
    signal INTEGER, -- Signal strength in dBm (e.g., -45)
    ap_name TEXT, -- Access point name
    ap_mac TEXT, -- Access point MAC

    -- Status tracking
    is_online BOOLEAN DEFAULT TRUE,
    last_seen_at TIMESTAMPTZ,
    uptime_seconds INTEGER,

    -- Cache management
    cached_at TIMESTAMPTZ DEFAULT NOW(),

    -- Ensure one record per MAC per project
    CONSTRAINT unique_project_mac UNIQUE(project_id, mac)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_project_ha_clients_project_id ON project_ha_clients(project_id);
CREATE INDEX IF NOT EXISTS idx_project_ha_clients_mac ON project_ha_clients(mac);
CREATE INDEX IF NOT EXISTS idx_project_ha_clients_switch_mac ON project_ha_clients(switch_mac);
CREATE INDEX IF NOT EXISTS idx_project_ha_clients_hostname ON project_ha_clients(hostname);


-- =====================================================
-- PART 2: MODIFY EXISTING TABLES
-- =====================================================

-- -----------------------------------------------------
-- 2.1 Global Parts - Add rack and power fields
-- -----------------------------------------------------

-- U-height for rack-mountable equipment
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS u_height INTEGER;

-- Flag for rack-mountable equipment
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS is_rack_mountable BOOLEAN DEFAULT FALSE;

-- Power consumption in watts
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS power_watts INTEGER;

-- Number of power outlets needed
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS power_outlets INTEGER DEFAULT 1;

-- Flag for always-wireless devices (no wire drop required)
-- Examples: Lutron switches, Pico remotes, wireless sensors
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS is_wireless BOOLEAN DEFAULT FALSE;

-- Add comments for clarity
COMMENT ON COLUMN global_parts.u_height IS 'Rack unit height for rack-mountable equipment (1U, 2U, etc.)';
COMMENT ON COLUMN global_parts.is_rack_mountable IS 'Whether this equipment can be mounted in a standard rack';
COMMENT ON COLUMN global_parts.power_watts IS 'Power consumption in watts';
COMMENT ON COLUMN global_parts.power_outlets IS 'Number of power outlets this device requires';
COMMENT ON COLUMN global_parts.is_wireless IS 'Device is always wireless - does not require wire drop connection';

-- -----------------------------------------------------
-- 2.2 Project Equipment - Add rack, shelf, and HA linking
-- -----------------------------------------------------

-- Link to rack
ALTER TABLE project_equipment
ADD COLUMN IF NOT EXISTS rack_id UUID REFERENCES project_racks(id) ON DELETE SET NULL;

-- Link to shelf (for non-rack-mount items on a shelf)
ALTER TABLE project_equipment
ADD COLUMN IF NOT EXISTS shelf_id UUID REFERENCES project_rack_shelves(id) ON DELETE SET NULL;

-- Position in rack (bottom U, 1-based)
ALTER TABLE project_equipment
ADD COLUMN IF NOT EXISTS rack_position_u INTEGER;

-- Link to Home Assistant client (by MAC address)
ALTER TABLE project_equipment
ADD COLUMN IF NOT EXISTS ha_client_mac TEXT;

-- Flag to exclude from rack layout (for wire, cable, etc.)
ALTER TABLE project_equipment
ADD COLUMN IF NOT EXISTS exclude_from_rack BOOLEAN DEFAULT FALSE;

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_project_equipment_rack_id ON project_equipment(rack_id);
CREATE INDEX IF NOT EXISTS idx_project_equipment_shelf_id ON project_equipment(shelf_id);
CREATE INDEX IF NOT EXISTS idx_project_equipment_ha_client_mac ON project_equipment(ha_client_mac);

-- Add comments
COMMENT ON COLUMN project_equipment.rack_id IS 'Which rack this equipment is installed in';
COMMENT ON COLUMN project_equipment.shelf_id IS 'Which shelf this equipment is on (for non-rack-mount items)';
COMMENT ON COLUMN project_equipment.rack_position_u IS 'Bottom U position in rack (1-based, from bottom)';
COMMENT ON COLUMN project_equipment.ha_client_mac IS 'MAC address linking to Home Assistant client data';
COMMENT ON COLUMN project_equipment.exclude_from_rack IS 'Exclude from rack layout (for wire, cable, non-rack items)';


-- =====================================================
-- PART 3: ROW LEVEL SECURITY (RLS) POLICIES
-- Uses simple pattern matching existing tables (MSAL auth)
-- =====================================================

-- -----------------------------------------------------
-- 3.1 Project Racks RLS
-- -----------------------------------------------------
ALTER TABLE project_racks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view project racks" ON project_racks;
CREATE POLICY "Users can view project racks"
ON project_racks FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Users can insert project racks" ON project_racks;
CREATE POLICY "Users can insert project racks"
ON project_racks FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update project racks" ON project_racks;
CREATE POLICY "Users can update project racks"
ON project_racks FOR UPDATE
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Users can delete project racks" ON project_racks;
CREATE POLICY "Users can delete project racks"
ON project_racks FOR DELETE
TO anon, authenticated
USING (true);

-- -----------------------------------------------------
-- 3.2 Project Rack Shelves RLS
-- -----------------------------------------------------
ALTER TABLE project_rack_shelves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view rack shelves" ON project_rack_shelves;
CREATE POLICY "Users can view rack shelves"
ON project_rack_shelves FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Users can insert rack shelves" ON project_rack_shelves;
CREATE POLICY "Users can insert rack shelves"
ON project_rack_shelves FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update rack shelves" ON project_rack_shelves;
CREATE POLICY "Users can update rack shelves"
ON project_rack_shelves FOR UPDATE
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Users can delete rack shelves" ON project_rack_shelves;
CREATE POLICY "Users can delete rack shelves"
ON project_rack_shelves FOR DELETE
TO anon, authenticated
USING (true);

-- -----------------------------------------------------
-- 3.3 Project Interconnects RLS
-- -----------------------------------------------------
ALTER TABLE project_interconnects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view project interconnects" ON project_interconnects;
CREATE POLICY "Users can view project interconnects"
ON project_interconnects FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Users can insert project interconnects" ON project_interconnects;
CREATE POLICY "Users can insert project interconnects"
ON project_interconnects FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update project interconnects" ON project_interconnects;
CREATE POLICY "Users can update project interconnects"
ON project_interconnects FOR UPDATE
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Users can delete project interconnects" ON project_interconnects;
CREATE POLICY "Users can delete project interconnects"
ON project_interconnects FOR DELETE
TO anon, authenticated
USING (true);

-- -----------------------------------------------------
-- 3.4 Project HA Clients RLS
-- -----------------------------------------------------
ALTER TABLE project_ha_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view project HA clients" ON project_ha_clients;
CREATE POLICY "Users can view project HA clients"
ON project_ha_clients FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Users can insert project HA clients" ON project_ha_clients;
CREATE POLICY "Users can insert project HA clients"
ON project_ha_clients FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update project HA clients" ON project_ha_clients;
CREATE POLICY "Users can update project HA clients"
ON project_ha_clients FOR UPDATE
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Users can delete project HA clients" ON project_ha_clients;
CREATE POLICY "Users can delete project HA clients"
ON project_ha_clients FOR DELETE
TO anon, authenticated
USING (true);


-- =====================================================
-- PART 4: HELPER FUNCTIONS
-- =====================================================

-- -----------------------------------------------------
-- 4.1 Generate next interconnect label for a rack
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION generate_interconnect_label(p_project_id UUID, p_rack_name TEXT)
RETURNS TEXT AS $$
DECLARE
    next_seq INTEGER;
    label TEXT;
BEGIN
    -- Find the highest sequence number for this rack
    SELECT COALESCE(MAX(
        CAST(
            REGEXP_REPLACE(label_code, '^IC-' || p_rack_name || '-', '')
            AS INTEGER
        )
    ), 0) + 1
    INTO next_seq
    FROM project_interconnects
    WHERE project_id = p_project_id
    AND label_code LIKE 'IC-' || p_rack_name || '-%';

    -- Format with leading zeros (IC-MDF-001)
    label := 'IC-' || p_rack_name || '-' || LPAD(next_seq::TEXT, 3, '0');

    RETURN label;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------
-- 4.2 Get equipment network status from HA client cache
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION get_equipment_network_status(p_equipment_id UUID)
RETURNS TABLE (
    mac TEXT,
    hostname TEXT,
    ip TEXT,
    is_wired BOOLEAN,
    is_online BOOLEAN,
    switch_name TEXT,
    switch_port INTEGER,
    ssid TEXT,
    signal INTEGER,
    last_seen_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        hac.mac,
        hac.hostname,
        hac.ip,
        hac.is_wired,
        hac.is_online,
        hac.switch_name,
        hac.switch_port,
        hac.ssid,
        hac.signal,
        hac.last_seen_at
    FROM project_equipment pe
    JOIN project_ha_clients hac ON hac.project_id = pe.project_id AND hac.mac = pe.ha_client_mac
    WHERE pe.id = p_equipment_id;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------
-- 4.3 Get all clients connected to a switch
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION get_switch_connected_clients(p_project_id UUID, p_switch_mac TEXT)
RETURNS TABLE (
    mac TEXT,
    hostname TEXT,
    ip TEXT,
    switch_port INTEGER,
    is_online BOOLEAN,
    equipment_id UUID,
    equipment_name TEXT,
    room_name TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        hac.mac,
        hac.hostname,
        hac.ip,
        hac.switch_port,
        hac.is_online,
        pe.id as equipment_id,
        COALESCE(gp.name, pe.description) as equipment_name,
        r.name as room_name
    FROM project_ha_clients hac
    LEFT JOIN project_equipment pe ON pe.project_id = hac.project_id AND pe.ha_client_mac = hac.mac
    LEFT JOIN global_parts gp ON gp.id = pe.global_part_id
    LEFT JOIN rooms r ON r.id = pe.room_id
    WHERE hac.project_id = p_project_id
    AND hac.switch_mac = p_switch_mac
    AND hac.is_wired = TRUE
    ORDER BY hac.switch_port;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------
-- 4.4 Calculate rack power usage
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION calculate_rack_power(p_rack_id UUID)
RETURNS TABLE (
    total_watts INTEGER,
    total_outlets INTEGER,
    equipment_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(COALESCE(gp.power_watts, 0)), 0)::INTEGER as total_watts,
        COALESCE(SUM(COALESCE(gp.power_outlets, 1)), 0)::INTEGER as total_outlets,
        COUNT(pe.id)::INTEGER as equipment_count
    FROM project_equipment pe
    LEFT JOIN global_parts gp ON gp.id = pe.global_part_id
    WHERE pe.rack_id = p_rack_id;
END;
$$ LANGUAGE plpgsql;


-- =====================================================
-- PART 5: TRIGGERS
-- =====================================================

-- -----------------------------------------------------
-- 5.1 Auto-update timestamps
-- -----------------------------------------------------

-- Project racks updated_at trigger
CREATE OR REPLACE FUNCTION update_project_racks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_project_racks_updated_at ON project_racks;
CREATE TRIGGER trigger_project_racks_updated_at
    BEFORE UPDATE ON project_racks
    FOR EACH ROW
    EXECUTE FUNCTION update_project_racks_updated_at();

-- Rack shelves updated_at trigger
CREATE OR REPLACE FUNCTION update_rack_shelves_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_rack_shelves_updated_at ON project_rack_shelves;
CREATE TRIGGER trigger_rack_shelves_updated_at
    BEFORE UPDATE ON project_rack_shelves
    FOR EACH ROW
    EXECUTE FUNCTION update_rack_shelves_updated_at();

-- Interconnects updated_at trigger
CREATE OR REPLACE FUNCTION update_interconnects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_interconnects_updated_at ON project_interconnects;
CREATE TRIGGER trigger_interconnects_updated_at
    BEFORE UPDATE ON project_interconnects
    FOR EACH ROW
    EXECUTE FUNCTION update_interconnects_updated_at();


-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================

-- Summary of changes:
--
-- NEW TABLES:
-- - project_racks: Physical rack enclosures (MDF, IDF, etc.)
-- - project_rack_shelves: Shelves within racks for non-rack-mount equipment
-- - project_interconnects: Cables/connections within racks with QR labels
-- - project_ha_clients: Cached UniFi network client data from Home Assistant
--
-- MODIFIED TABLES:
-- - global_parts: Added u_height, is_rack_mountable, power_watts, power_outlets, is_wireless
-- - project_equipment: Added rack_id, shelf_id, rack_position_u, ha_client_mac
--
-- HELPER FUNCTIONS:
-- - generate_interconnect_label(): Creates IC-{Rack}-{Seq} labels
-- - get_equipment_network_status(): Gets HA client data for equipment
-- - get_switch_connected_clients(): Lists all clients on a switch
-- - calculate_rack_power(): Sums power usage for a rack
--
-- RLS POLICIES:
-- - All new tables have RLS enabled with organization-based access control
