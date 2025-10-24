# Project Secure Data RLS Fix

## Problem
When trying to save secure data in the technician project, you get this error:
```
new row violates row-level security policy for table "project_secure_data"
```

## Root Cause
The original RLS policies used a broad `for all` policy that wasn't properly handling INSERT operations. The policy needs to be split into specific policies for each operation (SELECT, INSERT, UPDATE, DELETE).

## Solution
The fix has been created in `supabase/fix_project_secure_data_rls.sql`

## How to Apply

### Option 1: Using Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard
2. Navigate to the **SQL Editor** section
3. Click "New Query"
4. Copy and paste the contents of `supabase/fix_project_secure_data_rls.sql`
5. Click "Run" to execute the SQL

### Option 2: Using Supabase CLI (if installed)
```bash
# From your project directory
supabase db push --file supabase/fix_project_secure_data_rls.sql
```

## What the Fix Does
The migration:
1. Drops the old broad "for all" policy that wasn't working correctly
2. Creates four specific policies:
   - **SELECT policy**: Allows authenticated users to view secure data
   - **INSERT policy**: Allows authenticated users to create secure data
   - **UPDATE policy**: Allows authenticated users to update secure data  
   - **DELETE policy**: Allows authenticated users to delete secure data

## Testing
After applying the fix:
1. Go to the Secure Data section in your technician project
2. Try to add new secure data
3. The save operation should now work without the RLS policy error

## Technical Details
The issue was that PostgreSQL RLS policies with `for all` can sometimes have ambiguous behavior for INSERT operations. By splitting into explicit policies for each operation, we ensure that:
- The `using` clause is used for SELECT, UPDATE, and DELETE to determine which rows can be accessed
- The `with check` clause is used for INSERT and UPDATE to validate new/modified data
- Each operation has clear, explicit permissions

## Related Files
- `src/components/SecureDataManager.js` - The component that saves secure data
- `supabase/project_enhancements_equipment_secure.sql` - Original migration that created the table
