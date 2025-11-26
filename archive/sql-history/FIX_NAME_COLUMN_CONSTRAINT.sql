-- FIX FOR NAME COLUMN NOT NULL CONSTRAINT ERROR
-- This fixes the "null value in column 'name' violates not-null constraint" error
-- Run this AFTER the FIX_WIRE_DROPS_STRUCTURE_NOW.sql migration
-- Date: 2025-10-21

-- ============================================
-- OPTION 1: Make the name column nullable (if it exists)
-- ============================================
ALTER TABLE public.wire_drops 
ALTER COLUMN name DROP NOT NULL;

-- ============================================
-- OPTION 2: If you want to keep both columns in sync
-- Create a trigger to automatically copy drop_name to name
-- ============================================
CREATE OR REPLACE FUNCTION sync_name_with_drop_name()
RETURNS TRIGGER AS $$
BEGIN
    -- If drop_name is provided but name is not, copy drop_name to name
    IF NEW.drop_name IS NOT NULL AND NEW.name IS NULL THEN
        NEW.name = NEW.drop_name;
    END IF;
    -- If name is null but drop_name has a value, use drop_name
    IF NEW.name IS NULL AND NEW.drop_name IS NOT NULL THEN
        NEW.name = NEW.drop_name;
    END IF;
    -- If both are null, set a default
    IF NEW.name IS NULL AND NEW.drop_name IS NULL THEN
        NEW.name = 'Unnamed Drop';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS sync_wire_drop_names ON public.wire_drops;

-- Create the trigger for INSERT
CREATE TRIGGER sync_wire_drop_names
BEFORE INSERT OR UPDATE ON public.wire_drops
FOR EACH ROW
EXECUTE FUNCTION sync_name_with_drop_name();

-- ============================================
-- STEP 3: Update existing records where name is null
-- ============================================
UPDATE public.wire_drops 
SET name = COALESCE(drop_name, 'Unnamed Drop')
WHERE name IS NULL;

-- ============================================
-- STEP 4: Refresh schema cache
-- ============================================
NOTIFY pgrst, 'reload schema';

-- ============================================
-- VERIFICATION QUERY
-- ============================================
/*
-- Check the constraints on the name column:
SELECT 
    column_name,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'wire_drops'
    AND column_name IN ('name', 'drop_name')
ORDER BY column_name;
*/
