-- Create shade_photos table for proper photo storage with full metadata
-- This follows the same pattern as wire_drop_stages for consistency

CREATE TABLE IF NOT EXISTS shade_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shade_id UUID NOT NULL REFERENCES project_shades(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    measurement_set TEXT NOT NULL CHECK (measurement_set IN ('m1', 'm2')),

    -- SharePoint storage metadata
    photo_url TEXT NOT NULL,
    sharepoint_drive_id TEXT,
    sharepoint_item_id TEXT,
    file_name TEXT,
    file_size INTEGER,

    -- Audit fields
    uploaded_by UUID REFERENCES profiles(id),
    uploaded_by_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES profiles(id),
    updated_by_name TEXT,

    -- Soft delete support
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES profiles(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_shade_photos_shade_id ON shade_photos(shade_id);
CREATE INDEX IF NOT EXISTS idx_shade_photos_project_id ON shade_photos(project_id);
CREATE INDEX IF NOT EXISTS idx_shade_photos_measurement_set ON shade_photos(shade_id, measurement_set);
CREATE INDEX IF NOT EXISTS idx_shade_photos_not_deleted ON shade_photos(shade_id) WHERE deleted_at IS NULL;

-- Enable RLS
ALTER TABLE shade_photos ENABLE ROW LEVEL SECURITY;

-- RLS Policies (same pattern as other tables)
CREATE POLICY "Users can view shade photos for their projects" ON shade_photos
    FOR SELECT USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert shade photos for their projects" ON shade_photos
    FOR INSERT WITH CHECK (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update shade photos for their projects" ON shade_photos
    FOR UPDATE USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete shade photos for their projects" ON shade_photos
    FOR DELETE USING (
        project_id IN (
            SELECT project_id FROM project_members WHERE user_id = auth.uid()
        )
    );

-- Add comment for documentation
COMMENT ON TABLE shade_photos IS 'Stores verification photos for shade measurements with full SharePoint metadata for thumbnail generation and deletion';
