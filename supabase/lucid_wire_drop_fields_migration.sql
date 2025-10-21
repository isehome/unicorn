-- Migration: Add Lucid-specific fields to wire_drops table
-- This ensures all Lucid custom properties are stored in dedicated columns
-- and can be displayed in green (as Lucid source data) in the UI

-- Add Lucid-sourced fields
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS drop_name TEXT;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS drop_type TEXT;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS wire_type TEXT;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS install_note TEXT;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS device TEXT;

-- Add shape visual properties
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS shape_color TEXT;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS shape_fill_color TEXT;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS shape_line_color TEXT;

-- Add timestamps for tracking Lucid sync
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS lucid_synced_at TIMESTAMPTZ;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_wire_drops_drop_type ON public.wire_drops(drop_type);
CREATE INDEX IF NOT EXISTS idx_wire_drops_wire_type ON public.wire_drops(wire_type);
CREATE INDEX IF NOT EXISTS idx_wire_drops_lucid_shape ON public.wire_drops(lucid_shape_id) WHERE lucid_shape_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.wire_drops.drop_name IS 'Drop identifier from Lucid diagram (e.g., "Living Room TV")';
COMMENT ON COLUMN public.wire_drops.room_name IS 'Room name from Lucid diagram (e.g., "Living Room")';
COMMENT ON COLUMN public.wire_drops.drop_type IS 'Type of drop from Lucid (e.g., "Keypad", "TV", "Camera")';
COMMENT ON COLUMN public.wire_drops.wire_type IS 'Cable type from Lucid (e.g., "18/4", "CAT6", "Fiber")';
COMMENT ON COLUMN public.wire_drops.install_note IS 'Installation notes from Lucid diagram';
COMMENT ON COLUMN public.wire_drops.device IS 'Device type from Lucid diagram';
COMMENT ON COLUMN public.wire_drops.shape_color IS 'Primary color of shape in Lucid diagram (hex format)';
COMMENT ON COLUMN public.wire_drops.shape_fill_color IS 'Fill color of shape in Lucid diagram (hex format)';
COMMENT ON COLUMN public.wire_drops.shape_line_color IS 'Line color of shape in Lucid diagram (hex format)';
COMMENT ON COLUMN public.wire_drops.lucid_synced_at IS 'Last time Lucid data was synced to this wire drop';
COMMENT ON COLUMN public.wire_drops.updated_at IS 'Last time any field was updated';

-- Create update trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_wire_drops_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wire_drops_updated_at_trigger ON public.wire_drops;
CREATE TRIGGER wire_drops_updated_at_trigger
  BEFORE UPDATE ON public.wire_drops
  FOR EACH ROW
  EXECUTE FUNCTION public.update_wire_drops_updated_at();
