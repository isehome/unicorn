-- Fix global_parts that have room names incorrectly prepended
-- This script extracts the clean product name from the model field
-- and removes room name patterns from the name field

-- First, let's see what we're dealing with (preview)
-- SELECT id, part_number, name, model 
-- FROM global_parts 
-- WHERE name LIKE '% - %' 
-- LIMIT 20;

-- Update strategy:
-- 1. If model is set and name contains " - ", use model as name
-- 2. If name matches pattern "Room Name - Product Name N", extract "Product Name"

-- Step 1: Update parts where model is available (safest approach)
UPDATE global_parts
SET 
  name = COALESCE(NULLIF(TRIM(model), ''), name),
  updated_at = NOW()
WHERE 
  model IS NOT NULL 
  AND TRIM(model) != ''
  AND name LIKE '% - %';

-- Step 2: For parts without model, try to extract clean name
-- Pattern: "Room Name - Product Name N" -> "Product Name"
-- This removes the room prefix and trailing instance number
UPDATE global_parts
SET 
  name = TRIM(
    REGEXP_REPLACE(
      SUBSTRING(name FROM POSITION(' - ' IN name) + 3),  -- Get everything after " - "
      '\s+\d+$',  -- Remove trailing number (instance number)
      ''
    )
  ),
  updated_at = NOW()
WHERE 
  (model IS NULL OR TRIM(model) = '')
  AND name LIKE '% - %'
  AND POSITION(' - ' IN name) > 0;

-- Verify the fix
SELECT 
  COUNT(*) as remaining_with_room_pattern
FROM global_parts 
WHERE name LIKE '% - %';
