-- Fix RLS policies for wire_drop_equipment_links table
-- This script ensures users can properly delete equipment links

-- First, check if RLS is enabled
ALTER TABLE wire_drop_equipment_links ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Users can view wire drop equipment links" ON wire_drop_equipment_links;
DROP POLICY IF EXISTS "Users can create wire drop equipment links" ON wire_drop_equipment_links;
DROP POLICY IF EXISTS "Users can update wire drop equipment links" ON wire_drop_equipment_links;
DROP POLICY IF EXISTS "Users can delete wire drop equipment links" ON wire_drop_equipment_links;

-- Create comprehensive policies for authenticated users
-- View policy
CREATE POLICY "Users can view wire drop equipment links"
ON wire_drop_equipment_links
FOR SELECT
TO authenticated
USING (true);

-- Insert policy
CREATE POLICY "Users can create wire drop equipment links"
ON wire_drop_equipment_links
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Update policy
CREATE POLICY "Users can update wire drop equipment links"
ON wire_drop_equipment_links
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- DELETE policy - THIS IS THE KEY ONE THAT'S LIKELY MISSING
CREATE POLICY "Users can delete wire drop equipment links"
ON wire_drop_equipment_links
FOR DELETE
TO authenticated
USING (true);

-- Also ensure the foreign key constraints allow deletion
-- Check if cascade delete is set properly
ALTER TABLE wire_drop_equipment_links
DROP CONSTRAINT IF EXISTS wire_drop_equipment_links_wire_drop_id_fkey,
ADD CONSTRAINT wire_drop_equipment_links_wire_drop_id_fkey 
FOREIGN KEY (wire_drop_id) 
REFERENCES wire_drops(id) 
ON DELETE CASCADE;

ALTER TABLE wire_drop_equipment_links
DROP CONSTRAINT IF EXISTS wire_drop_equipment_links_project_equipment_id_fkey,
ADD CONSTRAINT wire_drop_equipment_links_project_equipment_id_fkey 
FOREIGN KEY (project_equipment_id) 
REFERENCES project_equipment(id) 
ON DELETE CASCADE;

-- Verify the table structure
SELECT 
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'wire_drop_equipment_links'
ORDER BY ordinal_position;

-- Test query to see existing links (replace with actual wire drop ID)
-- SELECT * FROM wire_drop_equipment_links WHERE wire_drop_id = 'YOUR-WIRE-DROP-ID';

-- Manual delete test (replace with actual IDs)
-- DELETE FROM wire_drop_equipment_links 
-- WHERE wire_drop_id = 'YOUR-WIRE-DROP-ID' 
-- AND link_side = 'room_end';

COMMENT ON TABLE wire_drop_equipment_links IS 'Equipment links with proper RLS policies for all operations including DELETE';
