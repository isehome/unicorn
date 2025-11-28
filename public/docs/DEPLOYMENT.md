# Deployment Guide

## Overview

Unicorn is deployed on **Vercel** with a **Supabase** backend and **Azure AD** authentication.

---

## Prerequisites

Before deploying, ensure you have:

1. **Vercel Account** - [vercel.com](https://vercel.com)
2. **Supabase Project** - [supabase.com](https://supabase.com)
3. **Azure App Registration** - [portal.azure.com](https://portal.azure.com)
4. **GitHub Repository** - Connected to Vercel for auto-deploy

---

## Environment Variables

### Required Variables

Set these in Vercel Dashboard → Project → Settings → Environment Variables:

```bash
# Supabase
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJ...your-anon-key

# Azure AD (Microsoft Authentication)
REACT_APP_AZURE_CLIENT_ID=your-azure-app-client-id
REACT_APP_AZURE_TENANT_ID=your-azure-tenant-id
```

### Optional Variables

```bash
# UniFi Integration
REACT_APP_UNIFI_API_KEY=your-unifi-api-key

# Lucid Charts Integration
REACT_APP_LUCID_CLIENT_ID=your-lucid-client-id
REACT_APP_LUCID_CLIENT_SECRET=your-lucid-client-secret

# Tracking Service (AfterShip)
AFTERSHIP_API_KEY=your-aftership-key
```

---

## Azure AD Setup

### 1. Create App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Configure:
   - Name: `Unicorn App`
   - Supported account types: Single tenant (or multi if needed)
   - Redirect URI: `https://your-app.vercel.app` (Web platform)

### 2. Configure Authentication

1. Go to **Authentication** tab
2. Add redirect URIs:
   - `https://your-app.vercel.app`
   - `http://localhost:3000` (for development)
3. Enable **ID tokens** under Implicit grant
4. Save changes

### 3. API Permissions

Add these Microsoft Graph permissions:
- `User.Read` (Delegated)
- `Calendars.Read` (Delegated)
- `Contacts.Read` (Delegated)
- `Mail.Send` (Delegated)
- `Files.ReadWrite.All` (Delegated) - for SharePoint

Grant admin consent if required.

### 4. Get Credentials

- **Client ID**: Found on app Overview page
- **Tenant ID**: Found on app Overview page (Directory ID)

---

## Supabase Setup

### 1. Create Project

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Create new project
3. Note the project URL and anon key

### 2. Apply Database Schema

Run migrations in order:
```bash
# Connect to Supabase SQL Editor
# Run files from database/migrations/ in date order
```

Or use the complete schema:
```bash
# Run database/schema.sql for full schema
# Run database/seed.sql for initial data
```

### 3. Configure RLS Policies

**IMPORTANT**: We use MSAL for auth, not Supabase Auth.

All RLS policies must include `anon` role:
```sql
CREATE POLICY "policy_name" ON public.table_name
FOR ALL TO anon, authenticated
USING (true);
```

See [AUTHENTICATION.md](AUTHENTICATION.md) for details.

---

## Vercel Deployment

### 1. Connect Repository

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **Add New** → **Project**
3. Import your GitHub repository
4. Configure build settings:
   - Framework: Create React App
   - Build Command: `npm run build`
   - Output Directory: `build`

### 2. Add Environment Variables

Add all required variables from above.

### 3. Deploy

Push to main branch - Vercel auto-deploys.

### 4. Verify Deployment

1. Visit your Vercel URL
2. Test login flow
3. Verify database connection
4. Test photo uploads
5. Check API functions

---

## Local Development

### 1. Clone Repository
```bash
git clone https://github.com/your-repo/unicorn.git
cd unicorn
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Create .env.local
```bash
# Copy from .env.example or create new
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
REACT_APP_AZURE_CLIENT_ID=your-client-id
REACT_APP_AZURE_TENANT_ID=your-tenant-id
```

### 4. Run Development Server
```bash
npm start
```

App runs at `http://localhost:3000`

### 5. Test API Functions Locally
```bash
# Install Vercel CLI
npm i -g vercel

# Run with serverless functions
vercel dev
```

---

## Deployment Checklist

Before deploying to production:

- [ ] All environment variables set in Vercel
- [ ] Azure redirect URIs include production URL
- [ ] Database migrations applied
- [ ] RLS policies verified (include anon role)
- [ ] Build succeeds locally (`npm run build`)
- [ ] Authentication flow works
- [ ] Photo uploads work
- [ ] API functions respond correctly

---

## Troubleshooting Deployment

### Build Fails
- Check for TypeScript/ESLint errors
- Verify all imports exist
- Check environment variables are set

### Auth Doesn't Work
- Verify Azure redirect URIs match exactly
- Check client ID and tenant ID
- Clear browser cache/cookies

### Database Errors
- Check Supabase URL and key
- Verify RLS policies include anon role
- Check table exists and has correct schema

### API Functions Fail
- Check function logs in Vercel dashboard
- Verify environment variables for API functions
- Check CORS configuration

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for more solutions.

---

## Updating Production

### Standard Update
```bash
git add .
git commit -m "feat: description"
git push origin main
# Vercel auto-deploys
```

### Database Migration
1. Test migration locally first
2. Run in Supabase SQL Editor
3. Deploy code changes
4. Verify application works

### Environment Variable Change
1. Update in Vercel Dashboard
2. Redeploy (or wait for next deploy)

---

*Last Updated: November 2025*