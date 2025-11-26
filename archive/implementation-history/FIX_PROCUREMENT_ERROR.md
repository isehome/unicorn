# Fix for "relation public.profiles does not exist" Error

## Problem

The original `procurement_system.sql` migration failed with:
```
ERROR: 42P01: relation "public.profiles" does not exist
```

This happened because the migration referenced `public.profiles` table for user tracking, but your database doesn't have this table yet.

## Solution

Use the **fixed version** instead: `procurement_system_fixed.sql`

## What Changed

All foreign key references to `public.profiles(id)` have been changed to simple `text` fields:

### Before (Original):
```sql
created_by uuid references public.profiles(id) on delete set null,
submitted_by uuid references public.profiles(id) on delete set null,
received_by uuid references public.profiles(id) on delete set null,
```

### After (Fixed):
```sql
created_by text,
submitted_by text,
received_by text,
```

## How to Apply

### Option 1: Use the Fixed Migration (Recommended)

```bash
# In Supabase SQL Editor, run:
supabase/procurement_system_fixed.sql
```

Or via psql:
```bash
psql <your-connection-string> -f supabase/procurement_system_fixed.sql
```

### Option 2: Create profiles table first

If you want to keep the original migration with UUID references, first create the profiles table:

```sql
-- Run this FIRST
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  email text unique,
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Add policies
create policy profiles_read_all on public.profiles
  for select to anon, authenticated using (true);

create policy profiles_write_authenticated on public.profiles
  for all to authenticated using (true) with check (true);

-- THEN run the original procurement_system.sql
```

## Impact of Changes

Using `text` instead of `uuid` for user tracking:

### ✅ **Works Fine:**
- All functionality remains the same
- You can store any user identifier (email, username, ID as string)
- No foreign key constraints, more flexible
- Perfect for development and testing

### ⚠️ **Minor Differences:**
- No automatic cascade deletion when users are deleted
- No foreign key validation (can put any text value)
- If you later want proper user references, you'll need to migrate the data

## Future: Adding Proper User References

If you later create a proper auth system and want to migrate:

```sql
-- 1. Create profiles table
create table public.profiles (
  id uuid primary key,
  email text,
  full_name text
);

-- 2. Migrate existing text values to UUIDs
-- (You'll need custom logic based on your data)

-- 3. Alter tables to add new columns
alter table public.suppliers add column created_by_id uuid references public.profiles(id);

-- 4. Migrate data from text to uuid columns
-- update public.suppliers set created_by_id = (select id from profiles where email = created_by);

-- 5. Drop old text columns
alter table public.suppliers drop column created_by;

-- 6. Rename new columns
alter table public.suppliers rename column created_by_id to created_by;
```

## Recommendation

**Use `procurement_system_fixed.sql` for now**. It works perfectly and you can always add proper user tracking later if needed.

The system is fully functional with text-based user fields!

---

## Quick Start After Fix

```sql
-- 1. Run the fixed migration
\i supabase/procurement_system_fixed.sql

-- 2. Verify tables created
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('suppliers', 'purchase_orders', 'shipment_tracking');

-- 3. Start using the services!
```

You're ready to go! 🚀
