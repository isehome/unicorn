# Lucid Wire Drop Fields Migration - Application Guide

## Error Analysis
The error "Error: Load failed (api.supabase.com)" typically occurs when:
1. Trying to load a SQL file directly via URL/API rather than through proper channels
2. Network connectivity issues
3. Authentication problems

## Correct Method: Apply via Supabase Dashboard

### Step-by-Step Instructions:

1. **Open Supabase Dashboard**
   - Go to https://app.supabase.com
   - Sign in to your account
   - Select your project

2. **Navigate to SQL Editor**
   - Click on "SQL Editor" in the left sidebar (icon looks like `</>`)
   - Click "New Query" button

3. **Copy and Paste the Migration**
   - Open the file: `supabase/lucid_wire_drop_fields_migration.sql`
   - Copy the entire contents (Cmd/Ctrl + A, then Cmd/Ctrl + C)
   - Paste into the SQL Editor query window (Cmd/Ctrl + V)

4. **Execute the Migration**
   - Click "Run" button (or press Cmd/Ctrl + Enter)
   - Wait for confirmation message: "Success. No rows returned"
   - This is normal - the migration alters table structure, it doesn't return rows

5. **Verify the Migration**
   - Go to "Table Editor" in left sidebar
   - Select "wire_drops" table
   - Check that new columns appear:
     - drop_name
     - drop_type
     - wire_type
     - install_note
     - device
     - shape_color
     - shape_fill_color
     - shape_line_color
     - lucid_synced_at
     - updated_at

## Alternative Method: Supabase CLI (if you have it installed)

```bash
# If you have Supabase CLI installed and linked to your project:
supabase db push --file supabase/lucid_wire_drop_fields_migration.sql

# Or execute directly:
psql -h db.<your-project-ref>.supabase.co -U postgres -d postgres -f supabase/lucid_wire_drop_fields_migration.sql
```

## What This Migration Does

### New Columns Added:
- **drop_name**: Drop identifier from Lucid (e.g., "Living Room TV")
- **drop_type**: Type of drop (e.g., "Keypad", "TV", "Camera")
- **wire_type**: Cable type (e.g., "18/4", "CAT6", "Fiber")
- **install_note**: Installation notes from Lucid
- **device**: Device type from Lucid
- **shape_color**: Primary color of shape in Lucid (hex)
- **shape_fill_color**: Fill color of shape (hex)
- **shape_line_color**: Line color of shape (hex)
- **lucid_synced_at**: Timestamp of last Lucid sync
- **updated_at**: Timestamp of last update

### Indexes Created:
- `idx_wire_drops_drop_type` - for filtering by drop type
- `idx_wire_drops_wire_type` - for filtering by wire type
- `idx_wire_drops_lucid_shape` - for finding Lucid-linked drops

### Trigger Created:
- Automatic `updated_at` timestamp update on any row modification

## After Migration is Applied

Once the migration is successfully applied, you can:

1. **Re-enable Enhanced Lucid Import**
   - The PMProjectViewEnhanced.js component can now use all Lucid fields
   - Wire drops imported from Lucid will have full property mapping

2. **Enhanced UI Display**
   - Lucid-sourced data will appear in green in the UI
   - All custom properties from Lucid diagrams will be preserved
   - Better filtering and searching capabilities

## Troubleshooting

### If Migration Fails with Permission Error:
- Ensure you're logged in as the project owner or have ADMIN role
- Check RLS policies aren't blocking the ALTER TABLE commands

### If Columns Already Exist:
- The migration uses `IF NOT EXISTS` so it's safe to run multiple times
- Existing columns won't be modified

### If You See "relation does not exist":
- Ensure you're connected to the correct database
- Check that the wire_drops table exists in your project

## Next Steps After Successful Migration

1. Test the Lucid import functionality in PMProjectViewEnhanced
2. Verify wire drops are created with all new fields populated
3. Check that the UI displays Lucid-sourced data in green
4. Confirm filtering and searching works with new fields

## Contact/Support

If you continue to experience issues:
1. Check Supabase status page: https://status.supabase.com
2. Review Supabase project logs in Dashboard > Logs
3. Verify your Supabase plan has sufficient database resources
