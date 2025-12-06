-- Rename columns safely
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_shades' AND column_name = 'measured_width') THEN
        ALTER TABLE project_shades RENAME COLUMN measured_width TO m1_width;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_shades' AND column_name = 'measured_height') THEN
        ALTER TABLE project_shades RENAME COLUMN measured_height TO m1_height;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_shades' AND column_name = 'measure_width_top') THEN
        ALTER TABLE project_shades RENAME COLUMN measure_width_top TO m1_measure_width_top;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_shades' AND column_name = 'measure_width_middle') THEN
        ALTER TABLE project_shades RENAME COLUMN measure_width_middle TO m1_measure_width_middle;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_shades' AND column_name = 'measure_width_bottom') THEN
        ALTER TABLE project_shades RENAME COLUMN measure_width_bottom TO m1_measure_width_bottom;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_shades' AND column_name = 'measure_height_left') THEN
        ALTER TABLE project_shades RENAME COLUMN measure_height_left TO m1_measure_height_left;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_shades' AND column_name = 'measure_height_center') THEN
        ALTER TABLE project_shades RENAME COLUMN measure_height_center TO m1_measure_height_center;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_shades' AND column_name = 'measure_height_right') THEN
        ALTER TABLE project_shades RENAME COLUMN measure_height_right TO m1_measure_height_right;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_shades' AND column_name = 'mount_depth') THEN
        ALTER TABLE project_shades RENAME COLUMN mount_depth TO m1_mount_depth;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_shades' AND column_name = 'obstruction_notes') THEN
        ALTER TABLE project_shades RENAME COLUMN obstruction_notes TO m1_obstruction_notes;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_shades' AND column_name = 'field_verified') THEN
        ALTER TABLE project_shades RENAME COLUMN field_verified TO m1_complete;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_shades' AND column_name = 'field_verified_at') THEN
        ALTER TABLE project_shades RENAME COLUMN field_verified_at TO m1_date;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_shades' AND column_name = 'field_verified_by') THEN
        ALTER TABLE project_shades RENAME COLUMN field_verified_by TO m1_by;
    END IF;
END $$;

-- Add new columns safely using IF NOT EXISTS
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS m1_photos text[];
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS m2_width text;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS m2_height text;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS m2_measure_width_top text;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS m2_measure_width_middle text;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS m2_measure_width_bottom text;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS m2_measure_height_left text;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS m2_measure_height_center text;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS m2_measure_height_right text;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS m2_mount_depth text;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS m2_obstruction_notes text;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS m2_complete boolean default false;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS m2_date timestamptz;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS m2_by uuid;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS m1_mount_type text;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS m2_mount_type text;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS m2_photos text[];

-- Design & Install Columns
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS design_review_status text default 'pending';
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS fabric_url text;
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS install_instructions text;

-- Integration Column for Equipment Linking
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS equipment_id uuid;

-- Add constraint safely
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_shades_design_review_status_check') THEN
        ALTER TABLE project_shades ADD CONSTRAINT project_shades_design_review_status_check CHECK (design_review_status IN ('pending', 'sent', 'approved', 'rejected'));
    END IF;
END $$;
