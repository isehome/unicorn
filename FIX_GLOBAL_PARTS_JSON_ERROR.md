# Fix Global Parts JSON Coercion Error

## Problem
The "Cannot coerce the result to a single JSON object" error occurs when:
- Toggling the "required for Prewire" flag in equipment lists
- Saving parts in the Global Parts Manager

## Root Cause
The `global_parts` table contains two JSONB columns (`resource_links` and `attributes`) that cause serialization errors when the `upsert_global_part()` RPC function is called during CSV imports or when the table is queried.

## Solution
Remove the problematic JSON columns entirely from the database, since they are not needed (documentation is now stored in dedicated columns: `schematic_url`, `install_manual_urls`, `technical_manual_urls`).

## Instructions to Apply Fix

### Step 1: Go to Supabase Dashboard
1. Open your browser and go to https://supabase.com/dashboard
2. Select your project
3. Click on "SQL Editor" in the left sidebar

### Step 2: Run the Migration
1. Click "New Query" button
2. Copy and paste the **entire contents** of the file `supabase/remove_global_parts_json_fields.sql`
3. Click "Run" button

The migration will:
- Drop the `resource_links` column
- Drop the `attributes` column
- Update the `project_equipment_global_parts` view to remove references to these columns

### Step 3: Verify the Fix
After running the migration:
1. Refresh your application in the browser
2. Try toggling the "required for Prewire" flag in the equipment list
3. Try saving a part in the Global Parts Manager
4. The error should no longer occur

## Alternative: SQL Script Content
If you need to see the SQL script, here it is:

```sql
-- Remove JSON fields from global_parts table
-- These fields (resource_links and attributes) cause "Cannot coerce the result to a single JSON object" errors
-- User confirmed these fields are not needed

-- IMPORTANT: Drop the view FIRST before dropping the columns it references
DROP VIEW IF EXISTS public.project_equipment_global_parts;

-- Now drop the JSON columns
ALTER TABLE public.global_parts 
  DROP COLUMN IF EXISTS resource_links,
  DROP COLUMN IF EXISTS attributes;

-- Recreate the view without the JSON columns
CREATE OR REPLACE VIEW public.project_equipment_global_parts AS
  SELECT
    pe.id as project_equipment_id,
    pe.project_id,
    pe.part_number,
    gp.id as global_part_id,
    gp.name as global_part_name,
    gp.description as global_part_description,
    gp.manufacturer as global_part_manufacturer,
    gp.model as global_part_model,
    gp.is_wire_drop_visible,
    gp.is_inventory_item
  FROM public.project_equipment pe
  LEFT JOIN public.global_parts gp
    ON (gp.id = pe.global_part_id)
    OR (pe.global_part_id IS NULL AND gp.part_number = pe.part_number);

-- Drop the comment references since the columns no longer exist
COMMENT ON TABLE public.global_parts IS 
  'Master catalog containing one entry per unique part. Documentation is stored in separate fields (schematic_url, install_manual_urls, technical_manual_urls) rather than JSON.';
```

## What Was Changed in the Code
The following files were already updated to avoid selecting JSON fields:
- `src/services/partsService.js` - Explicit column selection, excludes JSON fields
- `src/components/GlobalPartsManager.js` - Explicit column selection
- `src/components/GlobalPartDocumentationEditor.js` - Explicit column selection
- `src/services/projectEquipmentService.js` - Already using explicit columns in joins

However, the root cause was the database-level RPC function `upsert_global_part()` which is called during CSV imports. Even though we excluded JSON fields in our application code, the RPC function would still trigger serialization of the entire row when returning the UUID, causing the error.

By removing these columns from the database entirely, the serialization issue is resolved at the source.
