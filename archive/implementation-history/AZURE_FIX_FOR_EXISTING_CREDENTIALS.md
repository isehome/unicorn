# Fix for Existing Azure Credentials

## Current Situation
You already have Azure credentials in Vercel for frontend authentication:
- ✅ `REACT_APP_AZURE_CLIENT_ID`
- ✅ `REACT_APP_AZURE_TENANT_ID`

However, the backend upload API (`/api/graph-upload.js`) cannot access variables with the `REACT_APP_` prefix. These are only for the React build process.

The backend needs:
- ❌ `AZURE_TENANT_ID` (without REACT_APP_ prefix)
- ❌ `AZURE_CLIENT_ID` (without REACT_APP_ prefix)
- ❌ `AZURE_CLIENT_SECRET` (new variable needed)

---

## Quick Fix Steps

### Step 1: Get Your Existing Azure App Registration

1. **Go to Azure Portal**: https://portal.azure.com
2. **Navigate to App Registrations**
3. **Find your existing app** (the one whose Client ID matches your `REACT_APP_AZURE_CLIENT_ID`)
4. **Click on it** to open the overview page

### Step 2: Add Backend Permissions (if not already added)

1. **Click "API permissions"** in the left sidebar
2. **Check if you already have**:
   - `Files.ReadWrite.All` (Application permission)
   - `Sites.ReadWrite.All` (Application permission)
   
3. **If missing, add them**:
   - Click "+ Add a permission"
   - Select "Microsoft Graph"
   - Select "Application permissions" (NOT Delegated)
   - Search for and add:
     - `Files.ReadWrite.All`
     - `Sites.ReadWrite.All`
   - Click "Add permissions"
   - **Click "Grant admin consent"** and confirm

### Step 3: Create a Client Secret (if you don't have one)

1. **Click "Certificates & secrets"** in the left sidebar
2. **Under "Client secrets"**, click "+ New client secret"
3. **Fill in**:
   - Description: `Backend Upload Service`
   - Expires: Choose appropriate duration (e.g., 24 months)
4. **Click "Add"**
5. **IMMEDIATELY COPY THE VALUE** (you can't see it again!)
   - This is your `AZURE_CLIENT_SECRET`

### Step 4: Add Three New Environment Variables to Vercel

Go back to your Vercel Environment Variables page and add:

**1. AZURE_TENANT_ID**
- Click "+ Add New"
- Name: `AZURE_TENANT_ID`
- Value: Copy the value from your existing `REACT_APP_AZURE_TENANT_ID`
  - OR get it from Azure Portal → App Registration → Overview → Directory (tenant) ID
- Environment: All (Production, Preview, Development)
- Click "Save"

**2. AZURE_CLIENT_ID**
- Click "+ Add New"
- Name: `AZURE_CLIENT_ID`
- Value: Copy the value from your existing `REACT_APP_AZURE_CLIENT_ID`
  - OR get it from Azure Portal → App Registration → Overview → Application (client) ID
- Environment: All (Production, Preview, Development)
- Click "Save"

**3. AZURE_CLIENT_SECRET**
- Click "+ Add New"
- Name: `AZURE_CLIENT_SECRET`
- Value: Paste the client secret value you copied in Step 3
- Environment: All (Production, Preview, Development)
- Click "Save"

### Step 5: Verify Your Environment Variables

After adding, you should have these six variables:

**For Frontend (keep these)**:
- ✅ `REACT_APP_AZURE_CLIENT_ID`
- ✅ `REACT_APP_AZURE_TENANT_ID`

**For Backend (just added)**:
- ✅ `AZURE_TENANT_ID`
- ✅ `AZURE_CLIENT_ID`
- ✅ `AZURE_CLIENT_SECRET`

**Plus your other existing variables**:
- ✅ `REACT_APP_LUCID_API_KEY`
- ✅ `REACT_APP_SUPABASE_BUCKET`
- ✅ `UNIFI_API_KEY`
- ✅ Supabase credentials

### Step 6: Redeploy

After adding the variables, redeploy your app:

1. Go to "Deployments" tab in Vercel
2. Click the three dots on the latest deployment
3. Select "Redeploy"
4. Wait 2-3 minutes for deployment

### Step 7: Test

1. Go to https://unicorn-one.vercel.app
2. Navigate to a wire drop
3. Try uploading a photo
4. Should now work without the "Server missing Azure credentials" error

---

## Why This Happened

The `REACT_APP_` prefix is a special convention used by Create React App (and similar build tools):
- Variables with this prefix are embedded into the React frontend during build
- They are NOT available to backend/serverless functions
- Backend functions need plain variable names without the prefix

So you need **both sets**:
- `REACT_APP_*` for frontend authentication
- Regular names for backend API uploads

---

## Security Note

You're using the same Azure app registration for both frontend and backend. This is fine, but make sure:
1. The app has both Delegated permissions (for frontend) and Application permissions (for backend)
2. The Client Secret is kept secure and only in backend environment variables
3. Never expose `AZURE_CLIENT_SECRET` to the frontend

---

## Troubleshooting

### "Still getting the same error"
- Make sure you added all THREE new variables (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)
- Verify the names are exact (no typos, no REACT_APP_ prefix)
- Confirm you redeployed after adding them

### "Token error: 403"
- Go back to Azure Portal → API permissions
- Verify `Files.ReadWrite.All` and `Sites.ReadWrite.All` show green checkmarks under "Admin consent"
- If not, click "Grant admin consent for [Organization]"

### "Can't find my app registration"
- Look for an app with the same Client ID as your `REACT_APP_AZURE_CLIENT_ID`
- It might be named something like "Unicorn" or similar

### "Don't have a client secret"
- You need to create one in Azure Portal (Step 3 above)
- Client secrets are not shown after creation, so you must create a new one
