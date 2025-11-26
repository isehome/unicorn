-- ============================================================
-- Add UniFi Network Tracking Fields to Project Equipment
-- Allows equipment to be linked to UniFi network clients
-- ============================================================

-- Add UniFi tracking fields to project_equipment table
ALTER TABLE project_equipment ADD COLUMN IF NOT EXISTS
  unifi_client_mac TEXT;

ALTER TABLE project_equipment ADD COLUMN IF NOT EXISTS
  unifi_last_ip TEXT;

ALTER TABLE project_equipment ADD COLUMN IF NOT EXISTS
  unifi_last_seen TIMESTAMPTZ;

ALTER TABLE project_equipment ADD COLUMN IF NOT EXISTS
  unifi_data JSONB;

-- Create index for MAC lookups
CREATE INDEX IF NOT EXISTS idx_project_equipment_unifi_mac
  ON project_equipment(unifi_client_mac)
  WHERE unifi_client_mac IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN project_equipment.unifi_client_mac IS 'MAC address of assigned UniFi network client';
COMMENT ON COLUMN project_equipment.unifi_last_ip IS 'Most recent IP address from UniFi';
COMMENT ON COLUMN project_equipment.unifi_last_seen IS 'Last time device was seen online via UniFi';
COMMENT ON COLUMN project_equipment.unifi_data IS 'Full UniFi client data snapshot (JSON) including hostname, switch port, etc.';
