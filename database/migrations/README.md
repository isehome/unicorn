# Database Migrations

This directory contains SQL migrations for the Unicorn project.

## Migration Files

### Active Migrations (Run in Order)

1. **`final_project_permits_setup.sql`**
   - Creates `project_permits` table with full audit trail
   - Includes rough-in and final inspection tracking
   - Sets up Row Level Security (RLS) policies
   - Creates storage bucket for permit documents (Supabase Storage)
   - **Note**: Document storage now uses SharePoint, but bucket remains for backward compatibility
   - Status: ✅ Production Ready

2. **`test_add_client_folder_url.sql`**
   - Adds `client_folder_url` field to projects table
   - Enables single SharePoint folder URL management
   - Auto-creates 6 standard subfolders: Data, Design, Files, Photos, Business, Procurement
   - Status: 🧪 Testing on Vercel (remove TEST prefix once verified)

## Features Overview

### Permit Tracking System
- Permit number with unique constraint per project
- PDF document upload (stored in SharePoint Business folder)
- Rough-in inspection: checkbox, date, user, timestamp
- Final inspection: checkbox, date, user, timestamp
- Full audit trail: created_by, updated_by, timestamps
- Foreign keys reference `public.profiles` table

### SharePoint Folder Management
- Single `client_folder_url` field replaces multiple folder URLs
- Old fields (`one_drive_photos`, `one_drive_files`, `one_drive_procurement`) maintained for backward compatibility
- Non-destructive folder creation via `/api/sharepoint-init-folders`
- Standard subfolder structure auto-created on project save

## Running Migrations

### On Supabase Dashboard:
1. Go to SQL Editor
2. Copy contents of migration file
3. Execute SQL
4. Verify success messages in output

### Via Supabase CLI:
```bash
supabase db push
```

## Important Notes

- **Profiles Table**: Migrations assume `public.profiles` table exists with Microsoft auth integration
- **SharePoint**: Requires Azure app credentials (TENANT_ID, CLIENT_ID, CLIENT_SECRET) configured in Vercel
- **Non-Destructive**: All migrations are safe to run multiple times (use `IF NOT EXISTS` clauses)
- **Backward Compatible**: Old folder URL fields maintained for existing projects

## Cleanup History

Removed deprecated files (2024-10-29):
- ❌ `supabase/add_project_permits.sql` (superseded)
- ❌ `supabase/fix_project_permits.sql` (superseded)
- ❌ `migrations/add_project_permits.sql` (superseded)
- ❌ `migrations/complete_project_permits_setup.sql` (superseded)

Only final, tested migrations remain in this directory.
