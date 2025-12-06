-- Add pocket dimensions for Measure 1
alter table project_shades
add column if not exists m1_pocket_width text,
add column if not exists m1_pocket_height text, -- Height/Drop
add column if not exists m1_pocket_depth text; -- Depth (front to back)

-- Add pocket dimensions for Measure 2
alter table project_shades
add column if not exists m2_pocket_width text,
add column if not exists m2_pocket_height text,
add column if not exists m2_pocket_depth text;

-- Add optional mounting section type if not covered by mount_type
alter table project_shades
add column if not exists mounting_section_type text; -- e.g. 'pocket', 'surface', 'recessed'
