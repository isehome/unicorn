# Apply Prewire Classification Migration

## Issue
The "Required for prewire phase" checkbox is not saving because the `required_for_prewire` column doesn't exist in your database yet.

## Solution
Apply the migration to add this column to your database.

## Steps to Apply Migration

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard: https://supabase.com/dashboard
2. Select your project
3. Click on "SQL Editor" in the left sidebar
4. Click "New Query"
5. Copy and paste the entire contents of `supabase/add_prewire_classification.sql` into the editor
6. Click "Run" or press Cmd+Enter

### Option 2: Via Supabase CLI (If you have it installed)

```bash
# Apply the migration
supabase db push --file supabase/add_prewire_classification.sql
```

### Option 3: Via psql (If you have PostgreSQL client installed)

```bash
# Replace with your actual database connection string
psql "postgresql://[USER]:[PASSWORD]@[HOST]:[PORT]/[DATABASE]" -f supabase/add_prewire_classification.sql
```

## What This Migration Does

1. Adds a new `required_for_prewire` boolean column to the `global_parts` table (default: false)
2. Creates an index for faster filtering by prewire status
3. Creates a view `project_equipment_by_phase` to easily see prewire vs trim equipment

## After Applying

Once you've applied the migration:
1. Refresh your browser
2. Navigate back to the part detail page
3. Check the "Required for prewire phase" checkbox
4. Click "Save Changes"
5. The checkbox should now stay checked! ✅

## Verification

To verify the migration was applied successfully, you can run this query in the SQL Editor:

```sql
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'global_parts' 
AND column_name = 'required_for_prewire';
```

You should see one row with the column details.
