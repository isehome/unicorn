-- Check if suppliers table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'suppliers'
) as suppliers_table_exists;

-- Check suppliers table columns (if it exists)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'suppliers'
ORDER BY ordinal_position;

-- Check RLS policies on suppliers table
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'suppliers';
