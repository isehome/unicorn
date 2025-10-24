# Project Milestones System - Fix Instructions

## Issue Identified
The runtime error "[object Object]" is occurring because the database migration for the milestone system hasn't been applied yet. The `project_milestone_status` view that the code is trying to query doesn't exist in the database.

## Solution
I've created a complete migration script that needs to be run in your Supabase SQL Editor to fix this issue.

## Steps to Apply the Fix

### 1. Open Supabase Dashboard
- Go to your Supabase project dashboard
- Navigate to the **SQL Editor** section (usually in the left sidebar)

### 2. Run the Migration
- Click on "New Query" or the "+" button to create a new SQL query
- Copy the entire contents of the file: `supabase/APPLY_MILESTONES_MIGRATION.sql`
- Paste it into the SQL Editor
- Click "Run" or press Cmd/Ctrl + Enter

### 3. Verify Success
You should see success messages in the output:
```
✅ Project Milestones Migration Complete!
```

### 4. Test the Application
1. Refresh your application in the browser
2. Navigate to a project view as a PM
3. You should now see the "Project Milestones" section without errors
4. Click "Initialize Milestones" if the button appears
5. The milestone tracking system should now be working

## What This Migration Does

The migration creates:
1. **`project_milestones` table** - Stores milestone data for each project
2. **Automated completion tracking** - Functions that check project data to determine milestone completion
3. **Date dependency triggers** - Automatically calculates prep milestone dates (14 days before main milestones)
4. **Security policies** - Proper row-level security for the new table
5. **Status view** - Enhanced view for querying milestone data with labels

## Milestone Types & Automation

The system now tracks 7 fixed milestone types:

1. **Planning & Design** - Auto-completes when Lucid diagram and portal proposal URLs exist
2. **Prewire Prep** - Auto-completes when all prewire-required equipment is ordered AND received
3. **Prewire** - Auto-completes when at least one prewire photo is uploaded
4. **Trim Prep** - Auto-completes when all non-prewire equipment is ordered AND received
5. **Trim** - Auto-completes when trim photos are uploaded AND room equipment is configured
6. **Commissioning** - Auto-completes when head-end equipment is configured
7. **Handoff/Training** - Requires manual completion by PM

## Troubleshooting

If you encounter any issues:

1. **Check for errors in the SQL output** - Look for red error messages after running the migration
2. **Verify table creation** - In Supabase, go to Table Editor and check if `project_milestones` table exists
3. **Check the view** - Verify that `project_milestone_status` view was created
4. **Clear browser cache** - Sometimes a hard refresh (Ctrl+Shift+R or Cmd+Shift+R) is needed

## Next Steps

Once the migration is applied successfully:
1. The runtime errors should be resolved
2. You can start using the automated milestone tracking system
3. Consider discussing the "fundamental changes" you mentioned in your screenshot for further enhancements

## Note About Your Screenshot
You mentioned having a screenshot with fundamental changes to milestone management. Once we have the current system working, we can review your proposed changes and implement them on top of this foundation.

Please share the screenshot so we can understand what specific changes you'd like to make to this milestone system.
