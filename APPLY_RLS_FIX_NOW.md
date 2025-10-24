# CRITICAL: Apply RLS Fix for Secure Data

## The Problem
You're getting: `new row violates row-level security policy for table "project_secure_data"`

This is a database-level issue that requires running SQL in Supabase.

## The Solution
I've created a complete fix in `supabase/fix_secure_data_complete.sql` that will:
- Fix equipment table RLS (so equipment loads)
- Fix project_secure_data table RLS (so you can save)
- Fix audit log table RLS (so logging works)
- Fix equipment_credentials table RLS (so linking works)

## EXACT STEPS TO FIX

### Step 1: Open Supabase
1. Go to https://supabase.com
2. Log in to your account
3. Select your project

### Step 2: Go to SQL Editor
1. Click on "SQL Editor" in the left sidebar
2. Click "New Query" button

### Step 3: Copy the SQL
1. Open `supabase/fix_secure_data_complete.sql` in VS Code
2. Press Cmd+A (Mac) or Ctrl+A (Windows) to select all
3. Press Cmd+C (Mac) or Ctrl+C (Windows) to copy

### Step 4: Paste and Run
1. Go back to Supabase SQL Editor
2. Click in the query window
3. Press Cmd+V (Mac) or Ctrl+V (Windows) to paste
4. Click the green "RUN" button

### Step 5: Wait for Success
- You should see "Success. No rows returned" or similar
- If you see any errors, copy them and show me

### Step 6: Test
1. Go back to your app
2. Refresh the page (F5 or Cmd+R)
3. Go to Secure Data section
4. Click "Add Secure Data"
5. Try to save - the error should be GONE

## If It Still Doesn't Work
If after running the SQL you still get the error:
1. Copy the EXACT error message
2. Check browser console (F12) for any errors
3. Tell me what you see

## What This SQL Does
```
1. Drops all old equipment policies
2. Creates new equipment policies (for authenticated users)
3. Drops all old project_secure_data policies  
4. Creates new project_secure_data policies (for authenticated users)
5. Drops all old audit_log policies
6. Creates new audit_log policies (for authenticated users)
7. Drops all old equipment_credentials policies
8. Creates new equipment_credentials policies (for authenticated users)
```

All policies allow `authenticated` users full access (SELECT, INSERT, UPDATE, DELETE).

## Why This Will Work
The error happens because the current RLS policies are either:
- Missing entirely
- Set to wrong user type (e.g., 'anon' instead of 'authenticated')
- Using wrong policy format

This SQL completely replaces all policies with correct ones for authenticated users.
