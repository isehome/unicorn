-- AGGRESSIVE FIX: Check for triggers and ensure column is clean
-- Run this in Supabase SQL Editor

-- Step 1: Check for any triggers on global_parts that might interfere
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'global_parts';

-- Step 2: Check the actual column definition
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'global_parts'
AND column_name = 'required_for_prewire';

-- Step 3: Test a direct update to ensure the column accepts writes
DO $$
DECLARE
  test_id uuid;
  before_val boolean;
  after_val boolean;
BEGIN
  -- Get a test part
  SELECT id INTO test_id FROM global_parts LIMIT 1;

  -- Get current value
  SELECT required_for_prewire INTO before_val FROM global_parts WHERE id = test_id;
  RAISE NOTICE 'Before update: %', before_val;

  -- Update to opposite value
  UPDATE global_parts SET required_for_prewire = NOT COALESCE(before_val, false) WHERE id = test_id;

  -- Check new value
  SELECT required_for_prewire INTO after_val FROM global_parts WHERE id = test_id;
  RAISE NOTICE 'After update: %', after_val;

  -- Verify it changed
  IF after_val = NOT COALESCE(before_val, false) THEN
    RAISE NOTICE 'SUCCESS: Column is updating correctly at database level!';
  ELSE
    RAISE WARNING 'FAILED: Column did not update correctly!';
  END IF;

  -- Reset to original value
  UPDATE global_parts SET required_for_prewire = COALESCE(before_val, false) WHERE id = test_id;
END $$;

-- Step 4: Check for any computed columns or generated columns
SELECT column_name, is_generated, generation_expression
FROM information_schema.columns
WHERE table_name = 'global_parts'
AND column_name = 'required_for_prewire';

-- Step 5: Restart the PostgREST schema cache
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- Step 6: Final verification query
SELECT id, part_number, required_for_prewire, updated_at
FROM global_parts
ORDER BY updated_at DESC
LIMIT 5;
