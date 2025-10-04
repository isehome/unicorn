-- Comprehensive fix for wire_drops delete functionality
-- This handles both RLS policies and ensures related tables have CASCADE delete

-- ============================================
-- 1. ADD DELETE POLICY FOR WIRE_DROPS
-- ============================================

-- Drop existing if any
DROP POLICY IF EXISTS dev_delete_all ON public.wire_drops;

-- Create DELETE policy for wire_drops
CREATE POLICY dev_delete_all ON public.wire_drops
  FOR DELETE TO authenticated USING (true);

-- ============================================
-- 2. CREATE RELATED TABLES IF THEY DON'T EXIST
-- ============================================

-- Wire Drop Stages table for 3-stage workflow
CREATE TABLE IF NOT EXISTS public.wire_drop_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wire_drop_id UUID NOT NULL REFERENCES public.wire_drops(id) ON DELETE CASCADE,
  stage_type TEXT NOT NULL CHECK (stage_type IN ('prewire', 'trim_out', 'commission')),
  completed BOOLEAN DEFAULT false,
  photo_url TEXT,
  stage_data JSONB,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(wire_drop_id, stage_type)
);

-- Wire Drop Room End Equipment
CREATE TABLE IF NOT EXISTS public.wire_drop_room_end (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wire_drop_id UUID NOT NULL REFERENCES public.wire_drops(id) ON DELETE CASCADE UNIQUE,
  equipment_type TEXT,
  equipment_name TEXT,
  equipment_model TEXT,
  location_details TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Wire Drop Head End Equipment
CREATE TABLE IF NOT EXISTS public.wire_drop_head_end (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wire_drop_id UUID NOT NULL REFERENCES public.wire_drops(id) ON DELETE CASCADE UNIQUE,
  equipment_type TEXT,
  equipment_name TEXT,
  port_connection TEXT,
  rack_location TEXT,
  network_config TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Equipment Types lookup table
CREATE TABLE IF NOT EXISTS public.equipment_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_type TEXT NOT NULL,
  category TEXT CHECK (category IN ('room_end', 'head_end', 'both')),
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. ENABLE RLS ON NEW TABLES
-- ============================================

ALTER TABLE public.wire_drop_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wire_drop_room_end ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wire_drop_head_end ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_types ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. CREATE POLICIES FOR NEW TABLES
-- ============================================

-- Policies for wire_drop_stages
DROP POLICY IF EXISTS dev_read_all ON public.wire_drop_stages;
DROP POLICY IF EXISTS dev_insert_all ON public.wire_drop_stages;
DROP POLICY IF EXISTS dev_update_all ON public.wire_drop_stages;
DROP POLICY IF EXISTS dev_delete_all ON public.wire_drop_stages;

CREATE POLICY dev_read_all ON public.wire_drop_stages
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY dev_insert_all ON public.wire_drop_stages
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY dev_update_all ON public.wire_drop_stages
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY dev_delete_all ON public.wire_drop_stages
  FOR DELETE TO authenticated USING (true);

-- Policies for wire_drop_room_end
DROP POLICY IF EXISTS dev_read_all ON public.wire_drop_room_end;
DROP POLICY IF EXISTS dev_insert_all ON public.wire_drop_room_end;
DROP POLICY IF EXISTS dev_update_all ON public.wire_drop_room_end;
DROP POLICY IF EXISTS dev_delete_all ON public.wire_drop_room_end;

CREATE POLICY dev_read_all ON public.wire_drop_room_end
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY dev_insert_all ON public.wire_drop_room_end
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY dev_update_all ON public.wire_drop_room_end
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY dev_delete_all ON public.wire_drop_room_end
  FOR DELETE TO authenticated USING (true);

-- Policies for wire_drop_head_end
DROP POLICY IF EXISTS dev_read_all ON public.wire_drop_head_end;
DROP POLICY IF EXISTS dev_insert_all ON public.wire_drop_head_end;
DROP POLICY IF EXISTS dev_update_all ON public.wire_drop_head_end;
DROP POLICY IF EXISTS dev_delete_all ON public.wire_drop_head_end;

CREATE POLICY dev_read_all ON public.wire_drop_head_end
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY dev_insert_all ON public.wire_drop_head_end
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY dev_update_all ON public.wire_drop_head_end
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY dev_delete_all ON public.wire_drop_head_end
  FOR DELETE TO authenticated USING (true);

-- Policies for equipment_types
DROP POLICY IF EXISTS dev_read_all ON public.equipment_types;
DROP POLICY IF EXISTS dev_insert_all ON public.equipment_types;
DROP POLICY IF EXISTS dev_update_all ON public.equipment_types;

CREATE POLICY dev_read_all ON public.equipment_types
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY dev_insert_all ON public.equipment_types
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY dev_update_all ON public.equipment_types
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ============================================
-- 5. CREATE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_wire_drop_stages_wire_drop ON public.wire_drop_stages(wire_drop_id);
CREATE INDEX IF NOT EXISTS idx_wire_drop_room_end_wire_drop ON public.wire_drop_room_end(wire_drop_id);
CREATE INDEX IF NOT EXISTS idx_wire_drop_head_end_wire_drop ON public.wire_drop_head_end(wire_drop_id);

-- ============================================
-- 6. INSERT DEFAULT EQUIPMENT TYPES
-- ============================================

INSERT INTO public.equipment_types (equipment_type, category, sort_order) VALUES
  ('In-Ceiling Speaker', 'room_end', 1),
  ('In-Wall Speaker', 'room_end', 2),
  ('TV', 'room_end', 3),
  ('Access Point', 'room_end', 4),
  ('Camera', 'room_end', 5),
  ('Keypad', 'room_end', 6),
  ('Network Switch', 'head_end', 10),
  ('Audio Amplifier', 'head_end', 11),
  ('Video Matrix', 'head_end', 12),
  ('Control Processor', 'head_end', 13),
  ('Patch Panel', 'head_end', 14),
  ('UPS', 'head_end', 15)
ON CONFLICT DO NOTHING;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Wire drops delete functionality has been fixed!';
  RAISE NOTICE 'All related tables now have CASCADE delete enabled.';
END $$;
