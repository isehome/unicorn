-- FINAL FIX: Drop and recreate the required_for_prewire column
-- This will fix any corruption or caching issues

-- Step 1: Drop the column completely
ALTER TABLE public.global_parts 
DROP COLUMN IF EXISTS required_for_prewire CASCADE;

-- Step 2: Recreate it fresh
ALTER TABLE public.global_parts 
ADD COLUMN required_for_prewire BOOLEAN NOT NULL DEFAULT false;

-- Step 3: Add index
CREATE INDEX idx_global_parts_required_for_prewire 
ON public.global_parts(required_for_prewire) 
WHERE required_for_prewire = true;

-- Step 4: Add comment
COMMENT ON COLUMN public.global_parts.required_for_prewire IS 
'Indicates if this part is required for the prewire phase';

-- Step 5: Force PostgREST to reload
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- Step 6: Verify it works
SELECT id, part_number, required_for_prewire 
FROM global_parts 
WHERE part_number = '16/2OFC-BK';
