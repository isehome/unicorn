-- Add avatar_color column to contacts table for user-selected avatar colors
-- This allows internal users to pick their own color for calendar/schedule views

-- Add the avatar_color column (stores hex color code like #8B5CF6)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS avatar_color TEXT;

-- Add comment for documentation
COMMENT ON COLUMN contacts.avatar_color IS 'User-selected hex color for avatar display in calendar views';
