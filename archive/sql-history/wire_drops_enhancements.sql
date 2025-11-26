-- Wire Drops Enhancement Migration
-- Adds fields for room name, floor, and shape data storage for offline access

-- Add new columns to wire_drops table
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS room_name TEXT;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS floor TEXT;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS shape_data JSONB;

-- Add index for floor-based filtering
CREATE INDEX IF NOT EXISTS idx_wire_drops_floor ON public.wire_drops(floor);
CREATE INDEX IF NOT EXISTS idx_wire_drops_project_floor ON public.wire_drops(project_id, floor);

-- Add comment for documentation
COMMENT ON COLUMN public.wire_drops.room_name IS 'Room name copied from Lucid shape data, editable';
COMMENT ON COLUMN public.wire_drops.floor IS 'Floor identifier for filtering and organization';
COMMENT ON COLUMN public.wire_drops.shape_data IS 'Complete shape data from Lucid for offline access';
