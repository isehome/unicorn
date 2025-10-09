-- Add unifi_url column to projects table
-- This column stores the UniFi Network Controller URL for the project

ALTER TABLE projects ADD COLUMN IF NOT EXISTS unifi_url TEXT;

-- Add a comment to document the column
COMMENT ON COLUMN projects.unifi_url IS 'Link to UniFi Network Controller for this project';
