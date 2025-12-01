-- Add formal address fields to projects table
-- Replaces single 'address' field with structured address components

-- Add new address columns
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS address_line1 TEXT,
ADD COLUMN IF NOT EXISTS address_line2 TEXT,
ADD COLUMN IF NOT EXISTS city TEXT,
ADD COLUMN IF NOT EXISTS state TEXT,
ADD COLUMN IF NOT EXISTS zip TEXT;

-- Migrate existing address data to address_line1
UPDATE projects
SET address_line1 = address
WHERE address IS NOT NULL AND address_line1 IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN projects.address_line1 IS 'Primary street address';
COMMENT ON COLUMN projects.address_line2 IS 'Secondary address line (suite, unit, etc.)';
COMMENT ON COLUMN projects.city IS 'City name';
COMMENT ON COLUMN projects.state IS 'State abbreviation (e.g., TX, CA)';
COMMENT ON COLUMN projects.zip IS 'ZIP/Postal code';

-- Create index on city and state for filtering/sorting
CREATE INDEX IF NOT EXISTS idx_projects_city ON projects(city);
CREATE INDEX IF NOT EXISTS idx_projects_state ON projects(state);
