-- Check which stakeholder-related tables exist
SELECT
  tablename,
  schemaname
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE '%stakeholder%'
ORDER BY tablename;

-- Also check for constraints on any stakeholder tables
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name LIKE '%stakeholder%'
ORDER BY tc.table_name, tc.constraint_type;
