# UniFi UDM Pro - Complete Authentication Solution

## What We Discovered

After extensive testing of your UDM Pro at `47.199.106.32`, here's what we found:

### ✅ Working:
- Controller is accessible on port 443
- Correct API paths: `/v1/sites/{siteId}/clients` (new API) or `/proxy/network/api/s/default/stat/sta` (legacy)
- Network structure and connectivity is correct

### ❌ Not Working:
- **API Key authentication does NOT work for direct UDM Pro access**
- The Cloud API key `Uz0CvgeS2Zn5O3y46DvNzloXw_fLDeVu` only works for `api.ui.com` Cloud API
- Cloud API does NOT provide client data endpoints
- Your SSO account (`service@isehome.com`) requires 2FA/MFA

## The Solution: Local Admin Account

### Step 1: Create Local Admin User (YOU ARE DOING THIS NOW)

On your UDM Pro:
1. Go to `https://47.199.106.32`
2. Navigate to: **Settings → System → Admins**
3. Click **"Add Admin"**
4. Create a new user:
   - **Username**: `api-local` (or any name you prefer)
   - **Password**: (choose a strong password)
   - **Role**: Administrator or Limited Administrator
   - **Important**: Do NOT link to ui.com account
   - **Important**: This will be a LOCAL ONLY account

This local account will:
- ✅ Bypass 2FA/MFA requirements
- ✅ Work for API authentication
- ✅ Not require SSO
- ✅ Be usable for programmatic access

### Step 2: Authentication Flow (What I'll Implement)

Once you have the local admin credentials, the authentication works like this:

```
1. POST to /api/auth/login
   Body: {"username": "api-local", "password": "your_password"}

2. Receive session cookie (TOKEN=xxxxx)

3. Use cookie for all subsequent requests:
   GET /proxy/network/api/s/default/stat/sta
   Cookie: TOKEN=xxxxx

4. Session lasts several hours before re-login needed
```

### Step 3: Implementation (What I'll Code)

I will create:

1. **New API endpoint**: `/api/unifi-session-auth`
   - Accepts username/password
   - Logs into UDM Pro
   - Returns session cookie to app
   - Stores cookie for subsequent requests

2. **Updated UI**:
   - Add username/password fields
   - Store credentials securely (not in browser)
   - Automatic re-login on session expiration

3. **Updated proxy**:
   - Use session cookies instead of API keys for UDM Pro
   - Handle session expiration
   - Automatic re-authentication

## What This Means for Your App

**For Technicians on Mobile:**
1. Enter UDM Pro IP: `47.199.106.32`
2. Enter username: `api-local`
3. Enter password: (the one you set)
4. App automatically logs in and gets client data
5. Works from iPhone/iPad while on-site

**Security:**
- Credentials are sent to Vercel proxy only
- Proxy logs into UDM Pro
- App never stores UDM Pro credentials
- Session cookies expire automatically

## Next Steps

1. ✅ **YOU**: Create the local admin account on UDM Pro
2. ⏳ **ME**: Implement session-based authentication in proxy
3. ⏳ **ME**: Update UI to accept username/password
4. ⏳ **TEST**: Verify client data retrieval works

## Alternative: If You Can't Create Local Admin

If for some reason you can't create a local admin (company policy, etc.), the alternatives are:

1. **Use Cloud API for site/device data** (already working)
   - Can get sites, devices, switch ports
   - Cannot get client MAC/hostname data

2. **Manual 2FA flow** (complex)
   - Would require email/push notification handling
   - Not suitable for automated mobile access

The local admin account is by far the best solution.

---

**Once you've created the local admin account, give me the username and password, and I'll implement the complete authentication system.**