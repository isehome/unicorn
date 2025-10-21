# Fix: Invalid Client Secret Error

## Error Message
```
Token error: 401 {"error":"invalid_client","error_description":"AADSTS7000215: Invalid client secret provided. Ensure the secret being sent in the request is the client secret value, not the client secret ID
```

## Problem
When you created the client secret in Azure Portal, you copied the **Secret ID** instead of the **Secret Value**.

In Azure Portal, after creating a client secret, you see two columns:
- ❌ **Secret ID** - This is what you probably copied (wrong)
- ✅ **Value** - This is what you need (only shown once at creation)

## Solution

Since the secret value is only shown once when you create it, you need to create a **new client secret** and use that value.

### Step 1: Create a New Client Secret

1. **Go to Azure Portal**: https://portal.azure.com
2. **Navigate to App Registrations**
3. **Find your app** (ID: 9354e408-e171-4585-8af5-5244bd339f51)
4. **Click "Certificates & secrets"** in the left sidebar
5. **Under "Client secrets"**, click **"+ New client secret"**
6. **Fill in**:
   - Description: `Unicorn Backend Upload - Oct 2025`
   - Expires: 24 months (or your preference)
7. **Click "Add"**

### Step 2: Copy the CORRECT Value

**CRITICAL**: After clicking "Add", you'll see the new secret appear with TWO columns:

| Description | Value | Secret ID | Expires |
|-------------|-------|-----------|---------|
| Unicorn Backend Upload - Oct 2025 | `abc123...xyz789` | `12345678-abcd-efgh...` | 10/21/2027 |

**COPY THE "VALUE" COLUMN** - This is a long string that looks like random characters (e.g., `abc123XYZ456...`)

**DO NOT COPY THE "SECRET ID"** - This is a UUID/GUID that looks like `12345678-1234-1234-1234-123456789abc`

### Step 3: Update Vercel Environment Variable

1. **Go to Vercel Dashboard**: https://vercel.com
2. **Click on your project**: unicorn
3. **Go to Settings → Environment Variables**
4. **Find `AZURE_CLIENT_SECRET`**
5. **Click the three dots (⋮)** next to it
6. **Click "Edit"**
7. **Paste the NEW secret VALUE** (from Step 2)
8. **Click "Save"**

### Step 4: Delete the Old Secret (Optional but Recommended)

1. **Go back to Azure Portal** → Your App → Certificates & secrets
2. **Find the old secret** you created earlier
3. **Click "Delete"** to remove it (since you won't use it anymore)
4. This keeps your secrets list clean and secure

### Step 5: Redeploy

1. **Go to Vercel** → Deployments tab
2. **Click the three dots** on the latest deployment
3. **Click "Redeploy"**
4. **Wait 2-3 minutes** for deployment to complete

### Step 6: Test Upload

1. **Go to your app**: https://unicorn-one.vercel.app
2. **Navigate to a wire drop**
3. **Try uploading a photo**
4. **Should now work!**

---

## Visual Guide: Which Value to Copy

When you see the client secret screen in Azure Portal, it looks like this:

```
Client secrets
+ New client secret

Description                          | Value        | Secret ID              | Expires
-------------------------------------|--------------|------------------------|----------
Unicorn Backend Upload - Oct 2025    | •••••••••••• | a1b2c3d4-e5f6-...     | 10/21/2027
                                     | (Click to copy value)
```

**Immediately after creating**, the Value column will show the actual secret:
```
Description                          | Value                    | Secret ID              | Expires
-------------------------------------|--------------------------|------------------------|----------
Unicorn Backend Upload - Oct 2025    | abc123XYZ456...def789   | a1b2c3d4-e5f6-...     | 10/21/2027
                                     | ← COPY THIS!             | ← NOT this!
```

After you navigate away, the Value column changes to dots and you can never see it again:
```
Description                          | Value        | Secret ID              | Expires
-------------------------------------|--------------|------------------------|----------
Unicorn Backend Upload - Oct 2025    | •••••••••••• | a1b2c3d4-e5f6-...     | 10/21/2027
                                     | (Hidden forever)
```

---

## Why This Happens

Azure shows two identifiers for each client secret:
- **Secret ID**: A UUID that identifies which secret in the list
- **Secret Value**: The actual secret string used for authentication

The Secret Value is only shown once for security reasons. If you close the page without copying it, you must create a new secret.

---

## Quick Checklist

- [ ] Went to Azure Portal → App Registrations
- [ ] Found my app (ID: 9354e408-e171-4585-8af5-5244bd339f51)
- [ ] Created a NEW client secret
- [ ] Copied the VALUE column (long random string)
- [ ] Updated `AZURE_CLIENT_SECRET` in Vercel with the new value
- [ ] Saved the change in Vercel
- [ ] Redeployed the app
- [ ] Tested photo upload - SUCCESS!
