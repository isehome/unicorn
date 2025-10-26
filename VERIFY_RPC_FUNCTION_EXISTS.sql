-- ================================================================
-- VERIFY RPC FUNCTION EXISTS
-- ================================================================
-- Run this to check if the update_global_part function was created
-- ================================================================

-- Check if the function exists
SELECT
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'update_global_part';

-- If the above returns no rows, the function doesn't exist
-- If it returns rows, you should see the function definition

-- Also check for the simpler prewire function
SELECT
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname = 'update_part_prewire_status';
