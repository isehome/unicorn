# Wire Drop Auto-Naming Fix Instructions

## The Problem
The wire drop auto-naming feature IS implemented but database errors are preventing it from working.

## The Solution - Apply These 2 SQL Migrations

### Step 1: Fix Missing Columns
1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy and paste the entire contents of: `supabase/FIX_WIRE_DROPS_STRUCTURE_NOW.sql`
4. Click "Run" 
5. You should see "Success. No rows returned" message

### Step 2: Fix Name Column Constraint  
1. Still in SQL Editor
2. Copy and paste the entire contents of: `supabase/FIX_NAME_COLUMN_CONSTRAINT.sql`
3. Click "Run"
4. You should see "Success. No rows returned" message

### Step 3: Verify The Fix
Run this verification query in SQL Editor:
```sql
SELECT 
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
    AND table_name = 'wire_drops'
    AND column_name IN (
        'floor', 'device', 'location', 'room_name', 'drop_name', 
        'drop_type', 'wire_type', 'shape_data', 'name'
    )
ORDER BY column_name;
```

You should see all columns listed with proper data types.

## What The Auto-Naming Feature Does

When creating a wire drop:
1. Select a room (e.g., "Living Room")  
2. Click a drop type button (e.g., "Speaker")
3. The system automatically generates: "Living Room Speaker 1"
4. If you add another speaker in the same room, it becomes: "Living Room Speaker 2"
5. The numbering is smart - it fills gaps and continues from the highest number

## Where to Find The Feature

### For Technicians - Creating Wire Drops:
- Go to any project
- Click "Wire Drops" section
- Click "Add Wire Drop" 
- You'll see:
  - Room selection dropdown
  - Quick drop type buttons (Speaker, Display, Camera, etc.)
  - Real-time name preview as you select options
  - Wire type selection

### For PM - Bulk Import from Lucid:
- In PM Project View with Lucid diagram
- Select shapes in Lucid
- Click "Create Wire Drops from Selected"
- Auto-names are generated based on room and device type

## UI Features Already Implemented

✅ Room selection dropdown
✅ Quick drop type buttons  
✅ Auto-generated naming (Room + Type + Number)
✅ Real-time name preview
✅ Simplified wire type selection
✅ Clean, mobile-friendly interface
✅ Color-coded wire types
✅ Lucid shape colors displayed
✅ Progress indicators (Prewire/Install/Commission)

## After Applying The Fixes

The wire drop creation will work perfectly with:
- Automatic naming: "Living Room Speaker 1", "Living Room Speaker 2"  
- Smart numbering that handles gaps
- Clean UI optimized for technicians
- No more database errors

## Need Help?

If you still see errors after running both migrations:
1. Check the browser console for specific error messages
2. Try refreshing the app (Ctrl+R or Cmd+R)
3. Clear your browser cache if needed
