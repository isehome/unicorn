-- Add default shipping address to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS default_shipping_address_id UUID REFERENCES shipping_addresses(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_projects_default_shipping_address ON projects(default_shipping_address_id);

-- Add comment for documentation
COMMENT ON COLUMN projects.default_shipping_address_id IS 'Default shipping address for all POs in this project';
