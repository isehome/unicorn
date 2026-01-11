-- Add tracking for new global parts badge notification
-- This allows showing a badge on the navigation when new parts are added
-- and providing a filter to view only new/unreviewed parts

-- Add needs_review column to track parts that haven't been reviewed by admin
-- When a new part is created, this defaults to TRUE
ALTER TABLE global_parts
ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT TRUE;

-- Add comment for documentation
COMMENT ON COLUMN global_parts.needs_review IS 'Flag indicating part needs admin review (for new parts badge)';

-- Create index for efficient querying of parts needing review
CREATE INDEX IF NOT EXISTS idx_global_parts_needs_review
ON global_parts(needs_review)
WHERE needs_review = true;

-- Drop ALL existing update_global_part functions to avoid ambiguity
-- Using DO block to handle multiple overloads
DO $$
DECLARE
  func_oid oid;
BEGIN
  FOR func_oid IN
    SELECT oid FROM pg_proc WHERE proname = 'update_global_part'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', func_oid::regprocedure);
  END LOOP;
END;
$$;

-- Update the update_global_part RPC function to include needs_review
CREATE OR REPLACE FUNCTION update_global_part(
  p_part_id UUID,
  p_part_number TEXT DEFAULT NULL,
  p_name TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_manufacturer TEXT DEFAULT NULL,
  p_model TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_unit_of_measure TEXT DEFAULT NULL,
  p_quantity_on_hand INTEGER DEFAULT NULL,
  p_quantity_reserved INTEGER DEFAULT NULL,
  p_is_wire_drop_visible BOOLEAN DEFAULT NULL,
  p_is_inventory_item BOOLEAN DEFAULT NULL,
  p_required_for_prewire BOOLEAN DEFAULT NULL,
  p_schematic_url TEXT DEFAULT NULL,
  p_install_manual_urls TEXT[] DEFAULT NULL,
  p_technical_manual_urls TEXT[] DEFAULT NULL,
  p_needs_review BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  UPDATE global_parts
  SET
    part_number = COALESCE(p_part_number, part_number),
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    manufacturer = COALESCE(p_manufacturer, manufacturer),
    model = COALESCE(p_model, model),
    category = COALESCE(p_category, category),
    unit_of_measure = COALESCE(p_unit_of_measure, unit_of_measure),
    quantity_on_hand = COALESCE(p_quantity_on_hand, quantity_on_hand),
    quantity_reserved = COALESCE(p_quantity_reserved, quantity_reserved),
    is_wire_drop_visible = COALESCE(p_is_wire_drop_visible, is_wire_drop_visible),
    is_inventory_item = COALESCE(p_is_inventory_item, is_inventory_item),
    required_for_prewire = COALESCE(p_required_for_prewire, required_for_prewire),
    schematic_url = COALESCE(p_schematic_url, schematic_url),
    install_manual_urls = COALESCE(p_install_manual_urls, install_manual_urls),
    technical_manual_urls = COALESCE(p_technical_manual_urls, technical_manual_urls),
    needs_review = COALESCE(p_needs_review, needs_review)
  WHERE id = p_part_id
  RETURNING jsonb_build_object(
    'id', id,
    'part_number', part_number,
    'name', name,
    'needs_review', needs_review
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_global_part TO authenticated;
GRANT EXECUTE ON FUNCTION update_global_part TO anon;

-- Create function to get count of parts needing review
CREATE OR REPLACE FUNCTION get_new_parts_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INTEGER
  FROM global_parts
  WHERE needs_review = true;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_new_parts_count TO authenticated;
GRANT EXECUTE ON FUNCTION get_new_parts_count TO anon;

-- Create function to mark a part as reviewed
CREATE OR REPLACE FUNCTION mark_part_reviewed(p_part_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE global_parts
  SET needs_review = false
  WHERE id = p_part_id;

  RETURN FOUND;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION mark_part_reviewed TO authenticated;

-- Create function to mark all parts as reviewed
CREATE OR REPLACE FUNCTION mark_all_parts_reviewed()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE global_parts
  SET needs_review = false
  WHERE needs_review = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION mark_all_parts_reviewed TO authenticated;

-- Note: Run this migration in your Supabase SQL editor
-- Then the frontend will be able to track and display new parts notifications
