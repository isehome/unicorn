-- COMPREHENSIVE WIRE DROPS STRUCTURE FIX
-- This migration fixes all column mismatches between the code and database
-- Run this in Supabase SQL Editor to fix the "floor" column error and other issues
-- Date: 2025-10-21

-- ============================================
-- STEP 1: Add all missing columns that the code expects
-- ============================================

-- Core columns needed by wireDropService.js
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS floor text;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS device text;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS shape_data jsonb;

-- Ensure all required columns exist
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS room_name text;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS drop_name text;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS drop_type text;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS wire_type text;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS install_note text;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS uid text;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS schematic_reference text;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS qr_code_url text;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS project_room_id uuid;

-- Lucid integration columns
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS lucid_shape_id text;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS lucid_page_id text;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS lucid_synced_at timestamptz;

-- Shape color columns
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS shape_color text;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS shape_fill_color text;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS shape_line_color text;

-- Shape position columns (for future map feature)
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS shape_x numeric;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS shape_y numeric;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS shape_width numeric;
ALTER TABLE public.wire_drops ADD COLUMN IF NOT EXISTS shape_height numeric;

-- ============================================
-- STEP 2: Add helpful comments
-- ============================================

COMMENT ON COLUMN public.wire_drops.floor IS 'Floor/level where the wire drop is located (from Lucid customData)';
COMMENT ON COLUMN public.wire_drops.device IS 'Specific device information (from Lucid customData)';
COMMENT ON COLUMN public.wire_drops.location IS 'Location details - may duplicate room_name but kept for backward compatibility';
COMMENT ON COLUMN public.wire_drops.room_name IS 'Room name - primary location identifier';
COMMENT ON COLUMN public.wire_drops.drop_name IS 'Drop identifier - auto-generated as "room name + drop type + increment"';
COMMENT ON COLUMN public.wire_drops.drop_type IS 'Type of drop (Speaker, Display, Camera, etc.)';
COMMENT ON COLUMN public.wire_drops.wire_type IS 'Wire/cable type (CAT6, Fiber, etc.)';
COMMENT ON COLUMN public.wire_drops.install_note IS 'Installation notes from Lucid customData';
COMMENT ON COLUMN public.wire_drops.notes IS 'Manual notes field - separate from install_note';
COMMENT ON COLUMN public.wire_drops.shape_data IS 'Complete shape data from Lucid for offline access';
COMMENT ON COLUMN public.wire_drops.qr_code_url IS 'QR code for wire drop scanning - CORE FEATURE to implement';

-- Lucid integration comments
COMMENT ON COLUMN public.wire_drops.lucid_shape_id IS 'Unique ID of the shape in Lucid diagram';
COMMENT ON COLUMN public.wire_drops.lucid_page_id IS 'Page ID in Lucid document where shape exists';
COMMENT ON COLUMN public.wire_drops.lucid_synced_at IS 'Last sync timestamp with Lucid';

-- Shape visual comments
COMMENT ON COLUMN public.wire_drops.shape_color IS 'Lucid shape color (hex) - used for visual continuity';
COMMENT ON COLUMN public.wire_drops.shape_fill_color IS 'Lucid shape fill color (hex) - used for visual continuity';
COMMENT ON COLUMN public.wire_drops.shape_line_color IS 'Lucid shape line color (hex) - used for visual continuity';

-- Shape position comments
COMMENT ON COLUMN public.wire_drops.shape_x IS 'X coordinate in Lucid - needed for "show this shape on wire map" feature';
COMMENT ON COLUMN public.wire_drops.shape_y IS 'Y coordinate in Lucid - needed for "show this shape on wire map" feature';
COMMENT ON COLUMN public.wire_drops.shape_width IS 'Width in Lucid - needed for "show this shape on wire map" feature';
COMMENT ON COLUMN public.wire_drops.shape_height IS 'Height in Lucid - needed for "show this shape on wire map" feature';

-- ============================================
-- STEP 3: Add indexes for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_wire_drops_floor ON public.wire_drops(floor);
CREATE INDEX IF NOT EXISTS idx_wire_drops_project_floor ON public.wire_drops(project_id, floor);
CREATE INDEX IF NOT EXISTS idx_wire_drops_room_name ON public.wire_drops(room_name);
CREATE INDEX IF NOT EXISTS idx_wire_drops_drop_type ON public.wire_drops(drop_type);
CREATE INDEX IF NOT EXISTS idx_wire_drops_lucid_shape ON public.wire_drops(lucid_shape_id);
CREATE INDEX IF NOT EXISTS idx_wire_drops_project_room ON public.wire_drops(project_id, room_name);

-- ============================================
-- STEP 4: Add foreign key constraint for project_room_id if missing
-- ============================================

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'wire_drops_project_room_id_fkey'
    ) THEN
        ALTER TABLE public.wire_drops 
        ADD CONSTRAINT wire_drops_project_room_id_fkey 
        FOREIGN KEY (project_room_id) 
        REFERENCES public.project_rooms(id) 
        ON DELETE SET NULL;
    END IF;
END $$;

-- ============================================
-- STEP 5: Ensure RLS policies are correct
-- ============================================

-- Enable RLS if not already enabled
ALTER TABLE public.wire_drops ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them
DROP POLICY IF EXISTS "Users can view all wire drops" ON public.wire_drops;
DROP POLICY IF EXISTS "Authenticated users can insert wire drops" ON public.wire_drops;
DROP POLICY IF EXISTS "Authenticated users can update wire drops" ON public.wire_drops;
DROP POLICY IF EXISTS "Authenticated users can delete wire drops" ON public.wire_drops;

-- Create comprehensive policies
CREATE POLICY "Users can view all wire drops" ON public.wire_drops
    FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert wire drops" ON public.wire_drops
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update wire drops" ON public.wire_drops
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete wire drops" ON public.wire_drops
    FOR DELETE USING (auth.role() = 'authenticated');

-- ============================================
-- STEP 6: Refresh schema cache
-- ============================================

-- Notify PostgREST to reload the schema
NOTIFY pgrst, 'reload schema';

-- ============================================
-- VERIFICATION QUERY - Run this after migration to verify
-- ============================================
/*
SELECT 
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'wire_drops'
    AND column_name IN (
        'floor', 'device', 'location', 'room_name', 'drop_name', 
        'drop_type', 'wire_type', 'shape_data', 'lucid_shape_id'
    )
ORDER BY column_name;
*/

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
-- If this migration completes without errors, your wire drops table 
-- should now have all the columns that the application code expects.
-- The "floor" column error should be resolved.
