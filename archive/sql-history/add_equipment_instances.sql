-- Add instance tracking and flexible metadata to project_equipment
-- This allows each CSV line item with quantity > 1 to be split into individual instances

-- Add new columns
ALTER TABLE public.project_equipment
  ADD COLUMN IF NOT EXISTS instance_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS instance_name TEXT,
  ADD COLUMN IF NOT EXISTS parent_import_group UUID,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS unifi_device_mac TEXT,
  ADD COLUMN IF NOT EXISTS unifi_device_serial TEXT,
  ADD COLUMN IF NOT EXISTS received_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_by TEXT,
  ADD COLUMN IF NOT EXISTS received_quantity INTEGER DEFAULT 0;

-- Create index for instance lookups
CREATE INDEX IF NOT EXISTS idx_project_equipment_parent_group
  ON public.project_equipment(parent_import_group)
  WHERE parent_import_group IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_equipment_instance
  ON public.project_equipment(project_id, part_number, room_id, instance_number);

CREATE INDEX IF NOT EXISTS idx_project_equipment_unifi_mac
  ON public.project_equipment(unifi_device_mac)
  WHERE unifi_device_mac IS NOT NULL;

-- Add comment explaining the schema
COMMENT ON COLUMN public.project_equipment.instance_number IS
  'Instance number for this equipment within its room/part type. Starts at 1 for each unique part in each room.';

COMMENT ON COLUMN public.project_equipment.instance_name IS
  'Human-readable instance name like "Living Room - Speaker 1"';

COMMENT ON COLUMN public.project_equipment.parent_import_group IS
  'UUID linking all instances created from the same CSV line (e.g., if CSV had qty=4, all 4 instances share this)';

COMMENT ON COLUMN public.project_equipment.metadata IS
  'Flexible JSON storage for device-specific data (UniFi API responses, port mappings, custom fields, etc.)';

COMMENT ON COLUMN public.project_equipment.unifi_device_mac IS
  'MAC address of UniFi device for API matching';

COMMENT ON COLUMN public.project_equipment.unifi_device_serial IS
  'Serial number of UniFi device';

COMMENT ON COLUMN public.project_equipment.received_date IS
  'Date this specific instance was received (allows partial receiving)';

COMMENT ON COLUMN public.project_equipment.received_by IS
  'User who received this instance';

COMMENT ON COLUMN public.project_equipment.received_quantity IS
  'For instance tracking, always 0 or 1. 1 = received, 0 = not received';

-- Verify columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'project_equipment'
  AND column_name IN (
    'instance_number',
    'instance_name',
    'parent_import_group',
    'metadata',
    'unifi_device_mac',
    'unifi_device_serial',
    'received_date',
    'received_by',
    'received_quantity'
  )
ORDER BY ordinal_position;
