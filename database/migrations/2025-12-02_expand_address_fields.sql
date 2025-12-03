-- Migration: Expand address fields in contacts table
-- Date: 2025-12-02
-- Description: Adds individual address components (address1, address2, city, state, zip)
--              for structured address entry. The existing 'address' field will be used
--              to store the consolidated single-line display version.

-- Add individual address component columns
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address1 text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address2 text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS zip text;

-- Add comments for documentation
COMMENT ON COLUMN contacts.address IS 'Consolidated single-line address for display (auto-generated from components)';
COMMENT ON COLUMN contacts.address1 IS 'Street address line 1';
COMMENT ON COLUMN contacts.address2 IS 'Street address line 2 (apt, suite, etc.)';
COMMENT ON COLUMN contacts.city IS 'City name';
COMMENT ON COLUMN contacts.state IS 'State/Province abbreviation';
COMMENT ON COLUMN contacts.zip IS 'ZIP/Postal code';
