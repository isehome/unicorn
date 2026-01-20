-- Migration: Create project_equipment_connections table
-- Purpose: Track intra-rack connections between devices (power, network, HDMI, etc.)
-- This enables drag-and-drop connection management in the rack layout UI

-- Create the equipment connections table
CREATE TABLE IF NOT EXISTS project_equipment_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Source device (the one providing the outlet/port - UPS, PDU, switch, etc.)
  source_equipment_id UUID NOT NULL REFERENCES project_equipment(id) ON DELETE CASCADE,
  source_port_number INTEGER NOT NULL,           -- Which outlet/port (1, 2, 3...)
  source_port_type VARCHAR(20),                  -- 'ups', 'surge', 'network', etc.

  -- Target device (the one consuming/connected)
  target_equipment_id UUID NOT NULL REFERENCES project_equipment(id) ON DELETE CASCADE,
  target_port_number INTEGER DEFAULT 1,          -- Which input (most devices = 1)

  -- Connection metadata
  connection_type VARCHAR(20) NOT NULL,          -- 'power', 'network', 'hdmi', 'audio', etc.
  cable_label VARCHAR(100),                      -- Optional label for the cable
  notes TEXT,                                    -- Optional notes about the connection

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints: One device per outlet/port for a given connection type
  CONSTRAINT unique_source_port UNIQUE(source_equipment_id, source_port_number, connection_type),
  -- Constraints: One power source per device input (can have multiple network connections though)
  CONSTRAINT unique_target_port_power UNIQUE(target_equipment_id, target_port_number, connection_type)
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_equipment_connections_project
  ON project_equipment_connections(project_id);

CREATE INDEX IF NOT EXISTS idx_equipment_connections_source
  ON project_equipment_connections(source_equipment_id);

CREATE INDEX IF NOT EXISTS idx_equipment_connections_target
  ON project_equipment_connections(target_equipment_id);

CREATE INDEX IF NOT EXISTS idx_equipment_connections_type
  ON project_equipment_connections(connection_type);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_equipment_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_equipment_connections_updated_at ON project_equipment_connections;
CREATE TRIGGER trigger_equipment_connections_updated_at
  BEFORE UPDATE ON project_equipment_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_equipment_connections_updated_at();

-- RLS Policies - permissive for all (auth handled by MSAL at app level)
ALTER TABLE project_equipment_connections ENABLE ROW LEVEL SECURITY;

-- Allow all operations - simple permissive policy
CREATE POLICY "equipment_connections_all_access" ON project_equipment_connections
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Grant permissions
GRANT ALL ON project_equipment_connections TO authenticated;
GRANT SELECT ON project_equipment_connections TO anon;

-- Add comment for documentation
COMMENT ON TABLE project_equipment_connections IS 'Tracks connections between equipment within a rack (power, network, HDMI, etc.)';
COMMENT ON COLUMN project_equipment_connections.source_equipment_id IS 'Equipment providing the outlet/port (UPS, PDU, switch)';
COMMENT ON COLUMN project_equipment_connections.source_port_number IS 'Which port/outlet on the source device (1-indexed)';
COMMENT ON COLUMN project_equipment_connections.source_port_type IS 'Type of port: ups (battery backup), surge (surge only), network, hdmi, etc.';
COMMENT ON COLUMN project_equipment_connections.target_equipment_id IS 'Equipment connected to the port (consuming device)';
COMMENT ON COLUMN project_equipment_connections.target_port_number IS 'Which input on the target device (usually 1 for power)';
COMMENT ON COLUMN project_equipment_connections.connection_type IS 'Category: power, network, hdmi, audio, video, etc.';
