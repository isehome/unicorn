# UniFi Direct Controller Authentication - CRITICAL UPDATE

## The Problem (Discovered November 2024)

**X-API-KEY authentication ONLY works for the Cloud API (api.ui.com), NOT for direct controller access.**

When accessing a UniFi controller directly (via WAN IP or hostname), you CANNOT use the Network API key with X-API-KEY header. This is why we're getting 401/504 errors even though the controller is accessible.

## How UniFi Authentication Actually Works

### Cloud API (api.ui.com) ✅
- Uses X-API-KEY header
- API key from UniFi Site Manager
- Works with our current implementation

### Direct Controller Access ❌
- Requires **session-based authentication**
- Must login with username/password first
- Gets a session cookie for subsequent requests
- Does NOT use X-API-KEY header

## Authentication Flow for Direct Controller

1. **Login Request**:
   ```
   POST https://controller:8443/api/login
   {
     "username": "admin_username",
     "password": "admin_password"
   }
   ```

2. **Receive Session Cookie**:
   - Response includes `unifises` cookie
   - Must be included in all subsequent requests

3. **Make API Calls**:
   ```
   GET https://controller:8443/api/s/default/stat/sta
   Cookie: unifises=xxxxxxxxxxxxx
   ```

4. **Logout** (optional):
   ```
   POST https://controller:8443/api/logout
   ```

## Important Notes

- **Local Admin Account Required**: Create a local admin account (not cloud account)
- **No MFA**: Local accounts bypass MFA requirements
- **Port 8443**: Direct controller uses 8443 (not 443)
- **Self-signed Certs**: Controllers use self-signed certificates

## Why Our Current Implementation Fails

We're sending:
```
X-API-KEY: network_api_key
```

But controllers expect:
```
Cookie: unifises=session_cookie
```

## Solution Options

### Option 1: Session Management (Complex)
- Implement login/logout flow
- Store session cookies
- Handle session expiration
- Security concerns with storing credentials

### Option 2: Use Cloud Proxy (Recommended)
- Access via api.ui.com with X-API-KEY
- Let UniFi handle the controller connection
- Works with existing implementation
- No session management needed

### Option 3: Local Proxy with Auth
- Run local proxy that handles login
- Proxy maintains session
- App uses simplified API

## Recommendation

For mobile access, use the Cloud API (api.ui.com) with the `/proxy/network/` endpoints. This:
- Works with X-API-KEY authentication
- Handles SSL certificates
- No session management
- Already implemented

Direct controller access should only be used for:
- Local development
- When cloud access is unavailable
- Special requirements

## Next Steps

1. **Update Documentation**: Clarify that Network API keys don't work for direct access
2. **Use Cloud Proxy**: Route through api.ui.com instead of direct WAN IP
3. **Or Implement Session Auth**: Add login/logout flow if direct access is required