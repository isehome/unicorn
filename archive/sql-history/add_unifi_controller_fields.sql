-- Add UniFi Network API fields to projects table
-- These fields store local controller configuration for accessing client data

-- Add UDM Pro local IP address (defaults to 192.168.1.1)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS unifi_controller_ip TEXT DEFAULT '192.168.1.1';

-- Add Network API key (stored encrypted, for local network access)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS unifi_network_api_key TEXT;

-- Add site ID (fetched from the controller, used for client queries)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS unifi_site_id TEXT;

-- Add site name (fetched from the controller, for display)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS unifi_site_name TEXT;

-- Add comments to document the columns
COMMENT ON COLUMN projects.unifi_controller_ip IS 'Local IP address of UniFi controller (e.g., 192.168.1.1). Only works when on the same network.';
COMMENT ON COLUMN projects.unifi_network_api_key IS 'Network API key for local controller access. Generate from: Network Application → Settings → System → Integrations';
COMMENT ON COLUMN projects.unifi_site_id IS 'Site ID from UniFi controller (auto-fetched from API)';
COMMENT ON COLUMN projects.unifi_site_name IS 'Site name from UniFi controller (auto-fetched from API)';
