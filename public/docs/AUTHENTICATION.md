# Authentication Architecture

## Overview

This application uses a **hybrid authentication model**:

1. **User Authentication**: Microsoft MSAL (Azure AD) - handles user login/logout
2. **Database**: Supabase - handles data storage with Row Level Security (RLS)

## Important: Why This Matters for RLS Policies

Because we use **Microsoft MSAL for authentication** (not Supabase Auth), the Supabase client connects using the **anon key**. This means:

- The Supabase client is always connected as the `anon` role
- The `authenticated` role in Supabase RLS policies **does NOT apply**
- All RLS policies must include `anon` to work properly

## Correct RLS Policy Pattern

When creating RLS policies for any table, **always include both roles**:

```sql
-- Correct: Include both anon and authenticated
CREATE POLICY "table_name_select" ON public.table_name
FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "table_name_insert" ON public.table_name
FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "table_name_update" ON public.table_name
FOR UPDATE TO anon, authenticated
USING (true) WITH CHECK (true);

CREATE POLICY "table_name_delete" ON public.table_name
FOR DELETE TO anon, authenticated
USING (true);
```

## Common Mistake

```sql
-- WRONG: This will fail because our client uses anon key
CREATE POLICY "table_name_insert" ON public.table_name
FOR INSERT TO authenticated  -- Missing anon!
WITH CHECK (true);
```

## How Authentication Flow Works

1. User clicks "Sign in with Microsoft"
2. MSAL redirects to Microsoft login
3. User authenticates with Microsoft Azure AD
4. MSAL receives access token for Microsoft Graph API
5. App stores user info from Microsoft token
6. **Supabase client uses anon key** (no Supabase session exists)

## Token Usage

| Token Type | Source | Used For |
|------------|--------|----------|
| Microsoft Access Token | MSAL | Microsoft Graph API (email, calendar, SharePoint) |
| Supabase Anon Key | Environment Variable | Database operations |

## Security Considerations

- RLS policies still protect data - they just need to include `anon` role
- For sensitive operations, consider adding additional checks (e.g., checking `created_by` matches a known user)
- The Microsoft token provides user identity; Supabase provides data storage

## Future Consideration

If tighter security is needed, consider:
1. Creating a Supabase Edge Function that validates Microsoft tokens
2. Using Supabase custom JWT claims
3. Implementing a backend service that bridges MSAL → Supabase auth
