-- Add avatar_color column to profiles table for user-selected avatar colors
-- This allows any authenticated user to pick their own color for avatars

-- Add the avatar_color column (stores hex color code like #8B5CF6)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_color TEXT;

-- Add comment for documentation
COMMENT ON COLUMN profiles.avatar_color IS 'User-selected hex color for avatar display in calendar and schedule views';
