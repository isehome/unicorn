# Azure Credentials Setup for Photo Upload

## Problem
Wire drop photo uploads are failing with error: "Server missing Azure credentials"

The Microsoft Graph upload API (`/api/graph-upload.js`) requires three environment variables that are not configured in Vercel:
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

## Solution Overview

You need to:
1. Create an Azure App Registration (if not already done)
2. Configure API permissions for Microsoft Graph
3. Create a client secret
4. Add the credentials to Vercel environment variables

---

## Step 1: Create Azure App Registration

### Option A: If You Already Have an App Registration
If you're already using Microsoft authentication in this app, you likely have an app registration. You can reuse it or create a new one specifically for backend uploads.

### Option B: Create New App Registration

1. **Go to Azure Portal**
   - Navigate to https://portal.azure.com
   - Sign in with your Microsoft account

2. **Navigate to App Registrations**
   - Search for "App registrations" in the top search bar
   - Click on "App registrations"

3. **Create New Registration**
   - Click "+ New registration"
   - Fill in the details:
     - **Name**: `Unicorn Backend Upload Service` (or similar)
     - **Supported account types**: Select the appropriate option for your organization
     - **Redirect URI**: Leave blank (not needed for backend service)
   - Click **Register**

4. **Note Your Credentials**
   After registration, you'll see the overview page. Copy these values:
   - **Application (client) ID** → This is your `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → This is your `AZURE_TENANT_ID`

---

## Step 2: Configure API Permissions

1. **Navigate to API Permissions**
   - In your app registration, click on "API permissions" in the left sidebar

2. **Add Microsoft Graph Permissions**
   - Click "+ Add a permission"
   - Select "Microsoft Graph"
   - Select "Application permissions" (not Delegated)
   - Add these permissions:
     - `Files.ReadWrite.All` - For uploading files to SharePoint/OneDrive
     - `Sites.ReadWrite.All` - For accessing SharePoint sites
   - Click "Add permissions"

3. **Grant Admin Consent**
   - Click "Grant admin consent for [Your Organization]"
   - Confirm by clicking "Yes"
   - Wait for the status to show green checkmarks

---

## Step 3: Create Client Secret

1. **Navigate to Certificates & Secrets**
   - In your app registration, click "Certificates & secrets" in the left sidebar

2. **Create New Client Secret**
   - Under "Client secrets" section, click "+ New client secret"
   - Fill in:
     - **Description**: `Unicorn Upload Service Secret`
     - **Expires**: Choose appropriate duration (e.g., 24 months)
   - Click **Add**

3. **Copy the Secret Value**
   - **IMPORTANT**: Copy the secret **Value** immediately (not the "Secret ID")
   - This is your `AZURE_CLIENT_SECRET`
   - **You cannot view this value again after you leave this page!**
   - Store it securely

---

## Step 4: Add Environment Variables to Vercel

1. **Go to Vercel Dashboard**
   - Navigate to https://vercel.com
   - Click on your project: **unicorn**

2. **Access Settings**
   - Click on the **"Settings"** tab at the top

3. **Navigate to Environment Variables**
   - In the left sidebar, click on **"Environment Variables"**

4. **Add the Three Required Variables**

   **Variable 1: AZURE_TENANT_ID**
   - Click "+ Add New"
   - Name: `AZURE_TENANT_ID`
   - Value: [Paste your Directory (tenant) ID from Step 1]
   - Environment: Select all (Production, Preview, Development)
   - Click "Save"

   **Variable 2: AZURE_CLIENT_ID**
   - Click "+ Add New"
   - Name: `AZURE_CLIENT_ID`
   - Value: [Paste your Application (client) ID from Step 1]
   - Environment: Select all (Production, Preview, Development)
   - Click "Save"

   **Variable 3: AZURE_CLIENT_SECRET**
   - Click "+ Add New"
   - Name: `AZURE_CLIENT_SECRET`
   - Value: [Paste your client secret value from Step 3]
   - Environment: Select all (Production, Preview, Development)
   - Click "Save"

5. **Verify All Three Variables Are Added**
   You should now see three new environment variables:
   - ✅ AZURE_TENANT_ID
   - ✅ AZURE_CLIENT_ID
   - ✅ AZURE_CLIENT_SECRET

---

## Step 5: Redeploy the Application

After adding the environment variables, you need to redeploy:

### Option A: Automatic Redeployment
Vercel might automatically redeploy after adding environment variables. Check the "Deployments" tab.

### Option B: Manual Trigger
If it doesn't auto-deploy:
1. Go to the "Deployments" tab
2. Click the three dots (⋮) on the latest deployment
3. Select "Redeploy"
4. Confirm the redeployment

### Option C: Push a Commit
Make a small change to your repository and push it to trigger a deployment.

---

## Step 6: Test the Upload

After deployment completes (usually 2-3 minutes):

1. **Navigate to your app**: https://unicorn-one.vercel.app
2. **Go to a wire drop** that needs a photo
3. **Try uploading a photo** for prewire or trim out stage
4. **Verify**:
   - ✅ Photo uploads successfully
   - ✅ No "Server missing Azure credentials" error
   - ✅ Photo appears in wire drop detail view

---

## Troubleshooting

### Error: "Token error: 401"
- **Cause**: Client ID or Client Secret is incorrect
- **Fix**: Double-check the values in Vercel match exactly with Azure Portal

### Error: "Token error: 403"
- **Cause**: Missing API permissions or admin consent not granted
- **Fix**: 
  1. Go back to Azure Portal → App Registration → API permissions
  2. Verify permissions are added: `Files.ReadWrite.All` and `Sites.ReadWrite.All`
  3. Make sure "Admin consent" shows green checkmarks
  4. If not, click "Grant admin consent" again

### Error: "Graph error: 403 Forbidden"
- **Cause**: The app doesn't have access to the SharePoint site
- **Fix**: The app needs to be granted access to your SharePoint site. Contact your SharePoint administrator to grant the app access, or:
  1. Go to SharePoint Admin Center
  2. Navigate to "Advanced" → "API access"
  3. Approve the pending request for your app

### Error: "Invalid tenant"
- **Cause**: Tenant ID is incorrect
- **Fix**: Verify you copied the "Directory (tenant) ID" correctly from the Azure Portal

### Photos Upload But Don't Appear
- **Cause**: SharePoint URL might not be configured in the project
- **Fix**: 
  1. Go to project settings in your app
  2. Verify the OneDrive/SharePoint folder URL is set in `one_drive_photos` field
  3. Make sure the URL is a valid SharePoint sharing link

---

## Security Best Practices

1. **Client Secret Rotation**
   - Set an expiration date for your client secret
   - Before it expires, create a new one and update Vercel
   - Delete old secrets after rotating

2. **Least Privilege**
   - Only grant the minimum permissions needed
   - Current setup uses: `Files.ReadWrite.All` and `Sites.ReadWrite.All`

3. **Monitor Usage**
   - Regularly check Azure Portal logs for unusual API activity
   - Monitor Vercel function logs for errors

4. **Separate Environments**
   - Consider using different app registrations for production vs development

---

## Quick Reference

After setup, your configuration should be:

**Azure Portal**:
- ✅ App Registration created
- ✅ API Permissions: `Files.ReadWrite.All`, `Sites.ReadWrite.All`
- ✅ Admin consent granted
- ✅ Client secret created

**Vercel Environment Variables**:
- ✅ `AZURE_TENANT_ID` = Your Directory (tenant) ID
- ✅ `AZURE_CLIENT_ID` = Your Application (client) ID
- ✅ `AZURE_CLIENT_SECRET` = Your client secret value

**Code Files** (already in place):
- ✅ `/api/graph-upload.js` - Backend upload API
- ✅ `src/services/sharePointStorageService.js` - Frontend service
- ✅ `src/services/wireDropService.js` - Wire drop integration

---

## Need Help?

If you encounter issues:
1. Check Vercel function logs for detailed error messages
2. Verify all three environment variables are set correctly
3. Ensure API permissions have admin consent in Azure Portal
4. Confirm the SharePoint URL is configured in your project settings
