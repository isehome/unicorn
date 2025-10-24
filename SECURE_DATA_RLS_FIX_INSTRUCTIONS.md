# Secure Data RLS Fix Instructions

## Issue
Getting error when saving secure data: "new row violates row-level security policy for table 'project_secure_data'"

## Root Cause
The RLS policies were using `FOR ALL` which can be problematic. The fix creates explicit policies for each operation type (SELECT, INSERT, UPDATE, DELETE).

## Solution

### Step 1: Run the SQL Fix
Open your Supabase SQL Editor and run the contents of:
```
supabase/fix_secure_data_rls_FINAL_V2.sql
```

This SQL will:
1. Drop ALL existing policies on these tables:
   - `project_secure_data`
   - `equipment`
   - `secure_data_audit_log`
   - `equipment_credentials`

2. Create new explicit policies for each operation:
   - SELECT (view/read)
   - INSERT (create)
   - UPDATE (edit)
   - DELETE (remove)

3. Show a verification query at the end to confirm policies were created

### Step 2: Verify the Fix
After running the SQL, check the output of the verification query at the bottom. You should see policies for each table with clear names like:
- `secure_data_select_policy`
- `secure_data_insert_policy`
- `secure_data_update_policy`
- `secure_data_delete_policy`

### Step 3: Test in the App
1. Navigate to the Secure Data section in your technician project view
2. Try to add new secure data credentials
3. The save should work without RLS errors

## What Changed
- **Before**: Used `FOR ALL` policies which caused conflicts
- **After**: Separate explicit policies for each operation type with no conflicts

## If Still Having Issues
1. Check browser console for any errors
2. Verify you're logged in as an authenticated user (not anonymous)
3. Check that the SQL ran completely without errors
4. Hard refresh your browser (Cmd+Shift+R or Ctrl+Shift+R) to clear any cached code
