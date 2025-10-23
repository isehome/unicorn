# Room Alignment RLS Policy Fix

## Problem
The Room Alignment section was showing an RLS (Row-Level Security) policy error when trying to save room mappings:
```
new row violates row-level security policy for table 'project_room_aliases'
```

## Root Cause
**The real issue:** Your app uses **Microsoft/Azure AD authentication (MSAL)**, not Supabase Auth. 

When using Microsoft Auth:
- Users authenticate with Microsoft (via MSAL)
- The Supabase client doesn't have a Supabase user session
- All Supabase database requests are made as the **`anon`** (anonymous) role
- RLS policies that only allow `authenticated` users will reject these requests

The original RLS policies only allowed `authenticated` Supabase users, but since you're using Microsoft Auth instead, all requests were being rejected.

## Solution
Created a comprehensive migration file that:
- Ensures the `project_room_aliases` table exists with all required columns
- Drops any existing conflicting policies
- Creates new RLS policies that allow authenticated users to:
  - READ all room aliases (SELECT)
  - INSERT new room aliases
  - UPDATE existing room aliases
  - DELETE room aliases
- Adds proper indexes for performance
- Grants necessary permissions

## How to Apply the Fix

### Option 1: Via Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Open the file `supabase/fix_project_room_aliases_rls_for_anon.sql` ⚠️ **USE THIS FILE**
4. Copy its entire contents
5. Paste into the SQL Editor
6. Click **Run** to execute the migration
7. You should see success messages in the output

**Important:** Use `fix_project_room_aliases_rls_for_anon.sql`, NOT the other RLS file. The "for_anon" version allows anonymous users (which is what you need for Microsoft Auth).

### Option 2: Via Supabase CLI
```bash
# If you have Supabase CLI installed
supabase db push --file supabase/fix_project_room_aliases_rls.sql
```

## What This Fixes
After applying this migration:
1. ✅ Room Alignment section will work properly
2. ✅ You can map Lucid room names to Portal CSV room names
3. ✅ Room aliases will be saved successfully
4. ✅ Wire drops will link to correct rooms
5. ✅ Equipment will organize by room correctly

## Current Implementation Status

### Room Alignment Section ✓ COMPLETE
The Room Alignment UI in PMProjectViewEnhanced.js now:
- ✅ Shows ALL rooms from BOTH wire drops AND Lucid shapes
- ✅ Displays source information (how many wire drops, how many Lucid shapes)
- ✅ Provides dropdown to map each room to a CSV room
- ✅ Allows creating new rooms if needed
- ✅ Shows matched/unmatched status clearly
- ✅ Persists across page loads (doesn't require re-fetching Lucid data)

The data flow is:
1. **Persistent Data**: Loads room names from `wire_drops` table (already in database)
2. **Fresh Data**: Optionally loads room names from Lucid shapes (if Step 2 was executed)
3. **Combined View**: Shows all unique room names from both sources
4. **Mapping**: User maps each room to a CSV room or creates new
5. **Save**: Creates room alias entries (this was failing due to RLS)

## Testing After Fix
1. Navigate to a project with wire drops
2. Go to the Room Alignment section (Step 3)
3. Select a room mapping from the dropdown
4. Click "Apply"
5. Should see success (no RLS error)
6. Refresh page - room should still be mapped

## Related Files
- `src/components/PMProjectViewEnhanced.js` - UI component with Room Alignment section
- `src/services/projectRoomsService.js` - Service that saves room aliases
- `supabase/fix_project_room_aliases_rls_for_anon.sql` - **CORRECT migration for Microsoft Auth** ✅
- `supabase/fix_project_room_aliases_rls.sql` - Previous attempt (doesn't work with Microsoft Auth)
- `supabase/add_project_room_aliases.sql` - Original migration (may not have been applied)
- `src/contexts/AuthContext.js` - Uses Microsoft/Azure AD Auth (MSAL)
- `src/lib/supabase.js` - Supabase client (no auth session, operates as anon)

## Notes
- The Room Alignment section shows data from BOTH sources (wire drops + Lucid) to ensure no data is lost
- Wire drops are persistent in the database, so this data is always available
- Lucid shapes are only loaded when user clicks "Fetch Data" in Step 2
- Room mapping is stored as aliases to maintain data integrity

## Technical Details: Authentication Architecture

Your app uses a **hybrid authentication model**:

1. **User Authentication**: Microsoft/Azure AD (MSAL)
   - Users log in with their Microsoft accounts
   - Handled by `src/contexts/AuthContext.js`
   - Provides access to Microsoft Graph API

2. **Database Access**: Supabase (Anonymous Role)
   - Supabase client uses the `anon` key
   - No Supabase auth session is created
   - All database requests are made as the `anon` role
   - RLS policies must allow `anon` users

This is why the RLS policies needed to be updated to allow `anon` users - your app doesn't use Supabase's built-in authentication system.
