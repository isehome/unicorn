-- Rename existing columns to be M1 (primary/first measurement)
ALTER TABLE project_shades 
RENAME COLUMN measured_width TO m1_width;

ALTER TABLE project_shades 
RENAME COLUMN measured_height TO m1_height;

ALTER TABLE project_shades 
RENAME COLUMN measure_width_top TO m1_measure_width_top;

ALTER TABLE project_shades 
RENAME COLUMN measure_width_middle TO m1_measure_width_middle;

ALTER TABLE project_shades 
RENAME COLUMN measure_width_bottom TO m1_measure_width_bottom;

ALTER TABLE project_shades 
RENAME COLUMN measure_height_left TO m1_measure_height_left;

ALTER TABLE project_shades 
RENAME COLUMN measure_height_center TO m1_measure_height_center;

ALTER TABLE project_shades 
RENAME COLUMN measure_height_right TO m1_measure_height_right;

ALTER TABLE project_shades 
RENAME COLUMN mount_depth TO m1_mount_depth;

ALTER TABLE project_shades 
RENAME COLUMN obstruction_notes TO m1_obstruction_notes;

ALTER TABLE project_shades 
RENAME COLUMN field_verified TO m1_complete;

ALTER TABLE project_shades 
RENAME COLUMN field_verified_at TO m1_date;

ALTER TABLE project_shades 
RENAME COLUMN field_verified_by TO m1_by;

-- Add M1 specific photo field (distinct from general install photos)
ALTER TABLE project_shades ADD COLUMN m1_photos text[];

-- Create M2 (Verification) columns
ALTER TABLE project_shades ADD COLUMN m2_width text;
ALTER TABLE project_shades ADD COLUMN m2_height text;

ALTER TABLE project_shades ADD COLUMN m2_measure_width_top text;
ALTER TABLE project_shades ADD COLUMN m2_measure_width_middle text;
ALTER TABLE project_shades ADD COLUMN m2_measure_width_bottom text;

ALTER TABLE project_shades ADD COLUMN m2_measure_height_left text;
ALTER TABLE project_shades ADD COLUMN m2_measure_height_center text;
ALTER TABLE project_shades ADD COLUMN m2_measure_height_right text;

ALTER TABLE project_shades ADD COLUMN m2_mount_depth text;
ALTER TABLE project_shades ADD COLUMN m2_obstruction_notes text;

ALTER TABLE project_shades ADD COLUMN m2_complete boolean default false;
ALTER TABLE project_shades ADD COLUMN m2_date timestamptz;
ALTER TABLE project_shades ADD COLUMN m2_by uuid;
ALTER TABLE project_shades ADD COLUMN m2_photos text[];

-- Additional fields for Design Workflow and Installation
ALTER TABLE project_shades ADD COLUMN design_review_status text default 'pending' check (design_review_status in ('pending', 'sent', 'approved', 'rejected'));
ALTER TABLE project_shades ADD COLUMN fabric_url text;
ALTER TABLE project_shades ADD COLUMN install_instructions text;
-- install_photos already exists in the original schema, but we'll ensure it's treated as "General/Planning" photos now
