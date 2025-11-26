-- Project Milestones System Migration
-- This creates a fixed milestone structure for project management
-- with automated completion tracking based on existing data

-- ============================================
-- 1. CREATE PROJECT MILESTONES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  milestone_type TEXT NOT NULL CHECK (milestone_type IN (
    'planning_design',
    'prewire_prep', 
    'prewire',
    'trim_prep',
    'trim', 
    'commissioning',
    'handoff_training'
  )),
  target_date DATE,
  actual_date DATE,
  auto_calculated BOOLEAN DEFAULT false, -- For dependent dates (prewire_prep, trim_prep)
  percent_complete INTEGER DEFAULT 0 CHECK (percent_complete >= 0 AND percent_complete <= 100),
  completed_manually BOOLEAN DEFAULT false, -- For PM override
  completion_notes TEXT,
  
  -- Auto-tracking fields
  last_auto_check TIMESTAMPTZ,
  auto_completion_data JSONB, -- Stores details of what's complete/incomplete
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  
  CONSTRAINT project_milestone_unique UNIQUE(project_id, milestone_type)
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON public.project_milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_project_milestones_type ON public.project_milestones(milestone_type);
CREATE INDEX IF NOT EXISTS idx_project_milestones_target_date ON public.project_milestones(target_date);

-- ============================================
-- 2. ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "dev_read_all" ON public.project_milestones;
DROP POLICY IF EXISTS "dev_insert_all" ON public.project_milestones;
DROP POLICY IF EXISTS "dev_update_all" ON public.project_milestones;
DROP POLICY IF EXISTS "dev_delete_all" ON public.project_milestones;

-- Create policies
CREATE POLICY "dev_read_all" ON public.project_milestones
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "dev_insert_all" ON public.project_milestones
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "dev_update_all" ON public.project_milestones
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "dev_delete_all" ON public.project_milestones
  FOR DELETE TO authenticated USING (true);

-- ============================================
-- 3. CREATE FUNCTION TO CHECK MILESTONE COMPLETION
-- ============================================

CREATE OR REPLACE FUNCTION check_milestone_completion(
  p_project_id UUID,
  p_milestone_type TEXT
) RETURNS JSONB AS $$
DECLARE
  result JSONB;
  is_complete BOOLEAN := false;
  completion_percent INTEGER := 0;
  details JSONB := '{}';
BEGIN
  CASE p_milestone_type
    -- Planning & Design: Check for wiring diagram and portal URLs
    WHEN 'planning_design' THEN
      SELECT 
        CASE 
          WHEN wiring_diagram_url IS NOT NULL AND portal_proposal_url IS NOT NULL THEN true
          ELSE false
        END,
        CASE
          WHEN wiring_diagram_url IS NOT NULL AND portal_proposal_url IS NOT NULL THEN 100
          WHEN wiring_diagram_url IS NOT NULL OR portal_proposal_url IS NOT NULL THEN 50
          ELSE 0
        END,
        jsonb_build_object(
          'wiring_diagram', wiring_diagram_url IS NOT NULL,
          'portal_proposal', portal_proposal_url IS NOT NULL
        )
      INTO is_complete, completion_percent, details
      FROM projects WHERE id = p_project_id;
      
    -- Prewire Prep: All prewire items ordered AND received
    WHEN 'prewire_prep' THEN
      WITH prewire_stats AS (
        SELECT 
          COUNT(*) FILTER (WHERE gp.required_for_prewire = true) as total,
          COUNT(*) FILTER (WHERE gp.required_for_prewire = true AND pe.ordered_confirmed = true) as ordered,
          COUNT(*) FILTER (WHERE gp.required_for_prewire = true AND pe.onsite_confirmed = true) as received
        FROM project_equipment pe
        JOIN global_parts gp ON pe.global_part_id = gp.id
        WHERE pe.project_id = p_project_id
      )
      SELECT 
        CASE WHEN total > 0 AND ordered = total AND received = total THEN true ELSE false END,
        CASE 
          WHEN total = 0 THEN 0
          WHEN received = total THEN 100
          WHEN ordered = total THEN 75
          WHEN ordered > 0 THEN ROUND((ordered::numeric / total * 50)::numeric, 0)
          ELSE 0
        END,
        jsonb_build_object(
          'total_items', total,
          'ordered', ordered,
          'received', received,
          'all_ordered', ordered = total AND total > 0,
          'all_received', received = total AND total > 0
        )
      INTO is_complete, completion_percent, details
      FROM prewire_stats;
      
    -- Prewire: Check for prewire stage photos
    WHEN 'prewire' THEN
      WITH prewire_photo_stats AS (
        SELECT 
          COUNT(DISTINCT wd.id) as total_drops,
          COUNT(DISTINCT CASE WHEN wds.photo_url IS NOT NULL THEN wd.id END) as drops_with_photos
        FROM wire_drops wd
        LEFT JOIN wire_drop_stages wds ON wd.id = wds.wire_drop_id AND wds.stage_type = 'prewire'
        WHERE wd.project_id = p_project_id
      )
      SELECT 
        CASE WHEN drops_with_photos > 0 THEN true ELSE false END,
        CASE 
          WHEN total_drops = 0 THEN 0
          ELSE ROUND((drops_with_photos::numeric / total_drops * 100)::numeric, 0)
        END,
        jsonb_build_object(
          'total_drops', total_drops,
          'drops_with_photos', drops_with_photos,
          'has_photos', drops_with_photos > 0
        )
      INTO is_complete, completion_percent, details
      FROM prewire_photo_stats;
      
    -- Trim Prep: All non-prewire items ordered AND received  
    WHEN 'trim_prep' THEN
      WITH trim_stats AS (
        SELECT 
          COUNT(*) FILTER (WHERE gp.required_for_prewire != true OR gp.required_for_prewire IS NULL) as total,
          COUNT(*) FILTER (WHERE (gp.required_for_prewire != true OR gp.required_for_prewire IS NULL) AND pe.ordered_confirmed = true) as ordered,
          COUNT(*) FILTER (WHERE (gp.required_for_prewire != true OR gp.required_for_prewire IS NULL) AND pe.onsite_confirmed = true) as received
        FROM project_equipment pe
        JOIN global_parts gp ON pe.global_part_id = gp.id
        WHERE pe.project_id = p_project_id
      )
      SELECT 
        CASE WHEN total > 0 AND ordered = total AND received = total THEN true ELSE false END,
        CASE 
          WHEN total = 0 THEN 0
          WHEN received = total THEN 100
          WHEN ordered = total THEN 75
          WHEN ordered > 0 THEN ROUND((ordered::numeric / total * 50)::numeric, 0)
          ELSE 0
        END,
        jsonb_build_object(
          'total_items', total,
          'ordered', ordered,
          'received', received,
          'all_ordered', ordered = total AND total > 0,
          'all_received', received = total AND total > 0
        )
      INTO is_complete, completion_percent, details
      FROM trim_stats;
      
    -- Trim: Check for trim photos AND room equipment
    WHEN 'trim' THEN
      WITH trim_stats AS (
        SELECT 
          (SELECT COUNT(*) > 0 FROM wire_drop_stages wds 
           JOIN wire_drops wd ON wds.wire_drop_id = wd.id
           WHERE wd.project_id = p_project_id 
           AND wds.stage_type = 'trim_out' 
           AND wds.photo_url IS NOT NULL) as has_photos,
          (SELECT COUNT(*) > 0 FROM wire_drop_room_end wdre
           JOIN wire_drops wd ON wdre.wire_drop_id = wd.id
           WHERE wd.project_id = p_project_id) as has_room_equipment
      )
      SELECT 
        has_photos AND has_room_equipment,
        CASE 
          WHEN has_photos AND has_room_equipment THEN 100
          WHEN has_photos OR has_room_equipment THEN 50
          ELSE 0
        END,
        jsonb_build_object(
          'has_trim_photos', has_photos,
          'has_room_equipment', has_room_equipment
        )
      INTO is_complete, completion_percent, details
      FROM trim_stats;
      
    -- Commissioning: Check for head-end equipment
    WHEN 'commissioning' THEN
      SELECT 
        COUNT(*) > 0,
        CASE WHEN COUNT(*) > 0 THEN 100 ELSE 0 END,
        jsonb_build_object(
          'head_end_count', COUNT(*),
          'has_head_end', COUNT(*) > 0
        )
      INTO is_complete, completion_percent, details
      FROM wire_drop_head_end wdhe
      JOIN wire_drops wd ON wdhe.wire_drop_id = wd.id
      WHERE wd.project_id = p_project_id;
      
    -- Handoff/Training: Manual only
    WHEN 'handoff_training' THEN
      SELECT 
        completed_manually,
        CASE WHEN completed_manually THEN 100 ELSE 0 END,
        jsonb_build_object('manual_only', true)
      INTO is_complete, completion_percent, details
      FROM project_milestones
      WHERE project_id = p_project_id AND milestone_type = p_milestone_type;
      
      -- Default to not complete if no record exists
      IF is_complete IS NULL THEN
        is_complete := false;
        completion_percent := 0;
      END IF;
  END CASE;
  
  result := jsonb_build_object(
    'is_complete', is_complete,
    'percent_complete', completion_percent,
    'details', details,
    'checked_at', NOW()
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4. CREATE TRIGGER TO UPDATE DEPENDENT DATES
-- ============================================

CREATE OR REPLACE FUNCTION update_dependent_milestone_dates()
RETURNS TRIGGER AS $$
BEGIN
  -- If updating a prewire date, update prewire_prep date (14 days before)
  IF NEW.milestone_type = 'prewire' AND NEW.target_date IS NOT NULL THEN
    INSERT INTO project_milestones (project_id, milestone_type, target_date, auto_calculated)
    VALUES (NEW.project_id, 'prewire_prep', NEW.target_date - INTERVAL '14 days', true)
    ON CONFLICT (project_id, milestone_type)
    DO UPDATE SET 
      target_date = EXCLUDED.target_date,
      auto_calculated = true,
      updated_at = NOW();
  END IF;
  
  -- If updating a trim date, update trim_prep date (14 days before)
  IF NEW.milestone_type = 'trim' AND NEW.target_date IS NOT NULL THEN
    INSERT INTO project_milestones (project_id, milestone_type, target_date, auto_calculated)
    VALUES (NEW.project_id, 'trim_prep', NEW.target_date - INTERVAL '14 days', true)
    ON CONFLICT (project_id, milestone_type)
    DO UPDATE SET 
      target_date = EXCLUDED.target_date,
      auto_calculated = true,
      updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_dependent_dates
AFTER INSERT OR UPDATE OF target_date ON public.project_milestones
FOR EACH ROW
EXECUTE FUNCTION update_dependent_milestone_dates();

-- ============================================
-- 5. MIGRATE EXISTING MILESTONE DATA
-- ============================================

-- Migrate any existing milestone data from project_phase_milestones
INSERT INTO project_milestones (project_id, milestone_type, target_date, actual_date, completion_notes)
SELECT 
  ppm.project_id,
  CASE 
    WHEN pp.name ILIKE '%planning%' THEN 'planning_design'
    WHEN pp.name ILIKE '%pre%wire%' OR pp.name ILIKE '%prewire%' THEN 'prewire'
    WHEN pp.name ILIKE '%trim%' THEN 'trim'
    WHEN pp.name ILIKE '%final%' OR pp.name ILIKE '%commission%' THEN 'commissioning'
    WHEN pp.name ILIKE '%complete%' OR pp.name ILIKE '%handoff%' THEN 'handoff_training'
    ELSE NULL
  END as milestone_type,
  ppm.target_date,
  ppm.actual_date,
  ppm.notes
FROM project_phase_milestones ppm
JOIN project_phases pp ON ppm.phase_id = pp.id
WHERE CASE 
    WHEN pp.name ILIKE '%planning%' THEN 'planning_design'
    WHEN pp.name ILIKE '%pre%wire%' OR pp.name ILIKE '%prewire%' THEN 'prewire'
    WHEN pp.name ILIKE '%trim%' THEN 'trim'
    WHEN pp.name ILIKE '%final%' OR pp.name ILIKE '%commission%' THEN 'commissioning'
    WHEN pp.name ILIKE '%complete%' OR pp.name ILIKE '%handoff%' THEN 'handoff_training'
  END IS NOT NULL
ON CONFLICT (project_id, milestone_type) DO NOTHING;

-- ============================================
-- 6. CREATE VIEW FOR MILESTONE STATUS
-- ============================================

CREATE OR REPLACE VIEW project_milestone_status AS
SELECT 
  pm.*,
  p.name as project_name,
  p.client as project_client,
  p.project_number,
  CASE 
    WHEN pm.milestone_type = 'planning_design' THEN 'Planning and Design'
    WHEN pm.milestone_type = 'prewire_prep' THEN 'Prewire Prep'
    WHEN pm.milestone_type = 'prewire' THEN 'Prewire'
    WHEN pm.milestone_type = 'trim_prep' THEN 'Trim Prep'
    WHEN pm.milestone_type = 'trim' THEN 'Trim'
    WHEN pm.milestone_type = 'commissioning' THEN 'Commissioning'
    WHEN pm.milestone_type = 'handoff_training' THEN 'Handoff / Training'
  END as milestone_label,
  CASE
    WHEN pm.milestone_type = 'planning_design' THEN 1
    WHEN pm.milestone_type = 'prewire_prep' THEN 2
    WHEN pm.milestone_type = 'prewire' THEN 3
    WHEN pm.milestone_type = 'trim_prep' THEN 4
    WHEN pm.milestone_type = 'trim' THEN 5
    WHEN pm.milestone_type = 'commissioning' THEN 6
    WHEN pm.milestone_type = 'handoff_training' THEN 7
  END as sort_order
FROM project_milestones pm
JOIN projects p ON pm.project_id = p.id;

-- Grant access to the view
GRANT SELECT ON public.project_milestone_status TO anon, authenticated;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Project milestones system has been successfully created!';
  RAISE NOTICE 'Milestones will automatically track completion based on:';
  RAISE NOTICE '  - Planning: Lucid and portal URLs';
  RAISE NOTICE '  - Prewire Prep: Prewire equipment ordered/received';
  RAISE NOTICE '  - Prewire: Prewire stage photos';
  RAISE NOTICE '  - Trim Prep: Trim equipment ordered/received';
  RAISE NOTICE '  - Trim: Trim photos and room equipment';
  RAISE NOTICE '  - Commissioning: Head-end equipment';
  RAISE NOTICE '  - Handoff: Manual completion';
END $$;
