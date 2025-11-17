-- Wire Drop Equipment System Features Migration
-- Adds: Automatic room reassignment, UniFi integration, HomeKit QR storage
-- Run this in Supabase SQL Editor

-- Add HomeKit fields to project_equipment table
ALTER TABLE project_equipment 
ADD COLUMN IF NOT EXISTS homekit_qr_photo TEXT,
ADD COLUMN IF NOT EXISTS homekit_setup_code TEXT,
ADD COLUMN IF NOT EXISTS unifi_synced_at TIMESTAMPTZ;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_equipment_room_name 
ON project_equipment(project_id, room_name);

CREATE INDEX IF NOT EXISTS idx_project_equipment_mac 
ON project_equipment(mac_address);

CREATE INDEX IF NOT EXISTS idx_wire_drops_room 
ON wire_drops(project_id, room_name);

-- Create RPC function for updating equipment rooms
CREATE OR REPLACE FUNCTION update_equipment_rooms(
  p_project_id UUID,
  p_changes JSONB
)
RETURNS JSONB 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_change JSONB;
BEGIN
  -- Loop through each change and update
  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes)
  LOOP
    UPDATE project_equipment
    SET 
      room_name = (v_change->>'newRoom')::TEXT,
      location = (v_change->>'newRoom')::TEXT,
      updated_at = NOW()
    WHERE 
      project_id = p_project_id 
      AND id = (v_change->>'equipmentId')::UUID;
    
    IF FOUND THEN
      v_updated_count := v_updated_count + 1;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true, 
    'updated', v_updated_count,
    'timestamp', NOW()
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_equipment_rooms(UUID, JSONB) TO authenticated;

-- Add comments for documentation
COMMENT ON COLUMN project_equipment.homekit_qr_photo IS 'URL to HomeKit QR code photo stored in Supabase Storage';
COMMENT ON COLUMN project_equipment.homekit_setup_code IS '8-digit HomeKit setup code (format: XXXX-XXXX)';
COMMENT ON COLUMN project_equipment.unifi_synced_at IS 'Timestamp of last UniFi client data sync';
COMMENT ON FUNCTION update_equipment_rooms(UUID, JSONB) IS 'Batch update equipment room assignments with change tracking';
