-- Check if csv_batch_id column exists in project_equipment
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'project_equipment'
  AND column_name = 'csv_batch_id';

-- Check if equipment_import_batches table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name = 'equipment_import_batches'
) as batch_table_exists;

-- Count equipment by project (replace with your project ID)
SELECT
  project_id,
  COUNT(*) as total_equipment,
  COUNT(csv_batch_id) as with_batch_id,
  COUNT(*) - COUNT(csv_batch_id) as without_batch_id
FROM project_equipment
WHERE project_id = 'ad2943ed-fc31-4be9-9e0f-091677dd9f43'  -- Your project ID from console
GROUP BY project_id;

-- Sample of equipment records to see csv_batch_id values
SELECT
  id,
  name,
  csv_batch_id,
  created_at
FROM project_equipment
WHERE project_id = 'ad2943ed-fc31-4be9-9e0f-091677dd9f43'
ORDER BY created_at DESC
LIMIT 10;
