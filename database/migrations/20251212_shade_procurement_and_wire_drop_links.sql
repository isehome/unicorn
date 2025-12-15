-- Migration: Add procurement tracking to shades and wire drop linking
-- Date: 2024-12-12

-- =============================================================================
-- PART 1: Add procurement tracking fields to project_shades
-- These fields mirror the equipment procurement workflow
-- =============================================================================

-- Ordered tracking
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS ordered boolean DEFAULT false;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS ordered_at timestamptz;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS ordered_by uuid REFERENCES auth.users(id);
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS ordered_quantity integer DEFAULT 1;

-- Received tracking
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS received boolean DEFAULT false;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS received_at timestamptz;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES auth.users(id);

-- Installed tracking (for wire drop trim_out completion)
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS installed boolean DEFAULT false;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS installed_at timestamptz;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS installed_by uuid REFERENCES auth.users(id);

-- PO/Order reference
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS po_number text;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS order_notes text;

-- Final ordered dimensions (manually validated)
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS ordered_width text;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS ordered_height text;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS ordered_depth text;

-- Dimension validation tracking
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS dimensions_validated boolean DEFAULT false;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS dimensions_validated_at timestamptz;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS dimensions_validated_by uuid REFERENCES auth.users(id);

-- =============================================================================
-- PART 2: Create wire_drop_shade_links table
-- Links shades to wire drops (parallel to wire_drop_equipment_links)
-- =============================================================================

CREATE TABLE IF NOT EXISTS wire_drop_shade_links (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    wire_drop_id uuid REFERENCES wire_drops(id) ON DELETE CASCADE NOT NULL,
    project_shade_id uuid REFERENCES project_shades(id) ON DELETE CASCADE NOT NULL,
    link_side text DEFAULT 'room_end' CHECK (link_side IN ('room_end', 'head_end')),
    sort_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id),

    -- Each shade can only be linked once per wire drop per side
    CONSTRAINT unique_shade_wire_drop_link UNIQUE (wire_drop_id, project_shade_id, link_side)
);

-- Enable RLS
ALTER TABLE wire_drop_shade_links ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view wire_drop_shade_links"
    ON wire_drop_shade_links FOR SELECT
    USING (true);

CREATE POLICY "Users can insert wire_drop_shade_links"
    ON wire_drop_shade_links FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Users can update wire_drop_shade_links"
    ON wire_drop_shade_links FOR UPDATE
    USING (true);

CREATE POLICY "Users can delete wire_drop_shade_links"
    ON wire_drop_shade_links FOR DELETE
    USING (true);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_wire_drop_shade_links_wire_drop_id
    ON wire_drop_shade_links(wire_drop_id);

CREATE INDEX IF NOT EXISTS idx_wire_drop_shade_links_shade_id
    ON wire_drop_shade_links(project_shade_id);

-- =============================================================================
-- PART 3: Create helper view for shade receiving (similar to equipment)
-- =============================================================================

CREATE OR REPLACE VIEW shade_procurement_summary AS
SELECT
    ps.project_id,
    p.name as project_name,
    COUNT(*) as total_shades,
    COUNT(*) FILTER (WHERE ps.ordered = true) as ordered_count,
    COUNT(*) FILTER (WHERE ps.received = true) as received_count,
    COUNT(*) FILTER (WHERE ps.installed = true) as installed_count,
    COUNT(*) FILTER (WHERE ps.ordered = false) as pending_order_count
FROM project_shades ps
JOIN projects p ON p.id = ps.project_id
GROUP BY ps.project_id, p.name;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE wire_drop_shade_links IS 'Links shades to wire drops for installation tracking';
COMMENT ON COLUMN project_shades.ordered IS 'Whether the shade has been ordered from vendor';
COMMENT ON COLUMN project_shades.received IS 'Whether the shade has been received on site';
COMMENT ON COLUMN project_shades.installed IS 'Whether the shade has been physically installed';
COMMENT ON COLUMN project_shades.ordered_width IS 'Final validated width dimension for ordering';
COMMENT ON COLUMN project_shades.ordered_height IS 'Final validated height dimension for ordering';
COMMENT ON COLUMN project_shades.ordered_depth IS 'Final validated depth dimension for ordering';
COMMENT ON COLUMN project_shades.dimensions_validated IS 'Whether dimensions have been manually reviewed and validated for ordering';
