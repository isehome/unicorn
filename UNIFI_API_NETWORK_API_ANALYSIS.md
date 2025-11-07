# UniFi API Network API Implementation Analysis

**Date**: November 2024  
**Status**: Comprehensive analysis complete  
**Priority**: Critical fixes identified

## Executive Summary

Your UniFi API implementation has a **fundamental architectural flaw** for Network API (local controller) access:

### Current State
- **Cloud API (api.ui.com)**: ✅ Working perfectly
- **Network API (Local Controller)**: ❌ Broken - wrong endpoint paths, wrong port, hardcoded API key

### Root Cause
The code confuses two separate UniFi API systems:
1. **Cloud API** - Runs on `api.ui.com`, used for cloud-based hosts/devices
2. **Network API** - Runs on the local controller, used for direct network access

The implementation attempts to route Network API calls through cloud infrastructure, which fundamentally cannot work.

### Impact
- Local network clients cannot be queried
- Mobile technicians cannot access client data onsite
- Wire drop commissioning requires manual workarounds

---

## Part 1: Understanding the Two API Systems

### Cloud API (Site Manager API)
```
URL: https://api.ui.com
Endpoints: /v1/hosts, /v1/devices, /v1/clients
Authentication: Cloud API key via X-API-KEY header
Best for: Managing multiple sites/controllers from cloud
Currently: ✅ Working in your implementation
```

### Network API (Local Controller API)
```
URL: https://{controller-ip}:8443/api/...  OR  https://api.ui.com/v1/consoles/{id}/proxy/network/...
Endpoints: /api/s/{siteId}/stat/sta, /api/stat/sta, /api/self
Authentication: Network API key via X-API-KEY header
Best for: Direct controller access, local network data
Currently: ❌ NOT working in your implementation
```

---

## Part 2: Critical Issues Identified

### Issue 1: Hardcoded API Key Exposed (SECURITY)

**File**: `/api/unifi-proxy.js`, Line 90

```javascript
const hardcodedNetworkApiKey = 'j_ChcU0fSMHlxPoj8djPhkBYgFVy0LAq';
```

**Problem**: API key is exposed in source code  
**Risk**: Anyone with repository access can access your UniFi network  
**Fix**: Remove immediately, use environment variable instead

### Issue 2: Wrong Endpoint Paths

**File**: `/src/components/UnifiTestPage.js`, Lines 906-911

```javascript
// WRONG - These paths don't exist on direct controller
{ path: `/proxy/network/api/s/${siteIdPart}/stat/sta` }
{ path: `/proxy/network/integration/v1/clients` }
```

**Problem**: `/proxy/network/` endpoints only exist via api.ui.com proxy, not on direct controller  
**Correct**: Use `/api/s/{siteId}/stat/sta` for direct access  
**Result**: 404 errors when testing

### Issue 3: Wrong Port Number

**File**: `/src/components/UnifiTestPage.js`, Line 927

```javascript
// Results in: https://47.199.106.32/api/...  (port 443)
// Should be:  https://47.199.106.32:8443/api/...
```

**Problem**: UniFi uses port 8443, not 443  
**Result**: Connection refused errors

### Issue 4: Wrong Proxy Routing

**File**: `/src/components/UnifiTestPage.js`, Lines 922-925

```javascript
// Always uses Vercel proxy, even for local network
const proxyUrl = process.env.REACT_APP_UNIFI_PROXY_URL || '/api/unifi-proxy';
```

**Problem**:
- Vercel servers cannot access local networks (192.168.x.x)
- Local proxy (localhost:3001) exists but is never used
- Forces users to use WAN IP even on local network

**Result**: 
- Local network testing impossible
- Mobile technicians must use WAN IP (security risk if not port-forwarded properly)

---

## Part 3: Code Analysis

### File: `/api/unifi-proxy.js` (300 lines)

**What it does**: Routes requests to Cloud API or Network API

**Working Parts** (Lines 69-230):
- Cloud API routing: ✅ Correct implementation
- HTTPS handling: ✅ Proper certificate verification bypass
- Error handling: ✅ Good error messages
- Request forwarding: ✅ Correct

**Broken Parts**:
- Line 90: Hardcoded API key - DELETE
- Lines 79-85: Endpoint detection is backwards
- No verification that Network API key is provided

### File: `/src/services/unifiApi.js` (850 lines)

**What it does**: Client-side API wrapper

**Working Functions**:
- `fetchSites()`: ✅ Cloud API
- `fetchDevices()`: ✅ Cloud API with pagination
- `fetchSwitchPorts()`: ✅ Cloud API
- `testConnection()`: ✅ Cloud API

**Broken Functions**:
- `fetchClients()`: ❌ Stubbed, returns empty array
- `testClientEndpoints()`: ❌ Only tests Cloud API endpoints
- No Network API support anywhere

**Root Issue**: All functions hardcoded to use Cloud API through single proxy

### File: `/src/components/UnifiTestPage.js` (1189 lines)

**What it does**: Visual test interface

**Working Section**:
- Lines 1-882: Cloud API testing works fine

**Broken Section** (Lines 883-978):
- `handleLocalNetworkApiTest()` function
- Wrong endpoint paths: `/proxy/network/...` instead of `/api/...`
- Wrong port: 443 instead of 8443
- Wrong proxy: Vercel instead of localhost:3001

### File: `/local-unifi-proxy.js` (162 lines)

**Status**: ✅ **Correctly implemented**

This local proxy is perfect for what it does:
- Runs on localhost:3001
- Handles self-signed certificates
- Forwards to local controller
- Adds CORS headers

**But**: The test page never routes to it!

---

## Part 4: Why It Doesn't Work

### Scenario: User Tests Local Network API

```
Input:
  Controller: 192.168.1.1
  Network API Key: j_ChcU0fSMHlxPoj8djPhkBYgFVy0LAq

Current Behavior:
  1. Test page constructs: https://192.168.1.1/proxy/network/api/s/default/stat/sta
  2. Sends to Vercel proxy: /api/unifi-proxy
  3. Vercel tries to reach: https://192.168.1.1:443/proxy/network/api/s/default/stat/sta
  
Result: ❌ TIMEOUT
  - Vercel servers cannot access local network (192.168.1.1)
  - Even if they could, the path is wrong
  - Even if path was right, port is wrong (443 not 8443)
  - Even if port was right, /proxy/network/ doesn't exist on controller
```

### Correct Behavior (After Fixes)

```
Input:
  Controller: 192.168.1.1
  Network API Key: valid_network_api_key

Fixed Behavior:
  1. Test page detects local IP (192.168.1.1)
  2. Routes to local proxy: http://localhost:3001/proxy
  3. Local proxy constructs: https://192.168.1.1:8443/api/s/default/stat/sta
  4. Controller responds: 200 OK with client data
  
Result: ✅ CLIENT DATA RETRIEVED
```

---

## Part 5: Specific Code Changes Required

### Change 1: Remove Hardcoded API Key

**File**: `/api/unifi-proxy.js`  
**Lines**: 90-91

Delete these lines:
```javascript
const hardcodedNetworkApiKey = 'j_ChcU0fSMHlxPoj8djPhkBYgFVy0LAq';
const networkApiKey = customNetworkApiKey || hardcodedNetworkApiKey;
```

Replace with:
```javascript
const networkApiKey = customNetworkApiKey;
```

### Change 2: Fix Endpoint Paths

**File**: `/src/components/UnifiTestPage.js`  
**Lines**: 906-911

Change from:
```javascript
const testEndpoints = [
  { path: `/proxy/network/api/s/${siteIdPart}/stat/sta` },
  { path: `/proxy/network/api/s/default/stat/sta` },
  { path: `/proxy/network/integration/v1/clients` },
  { path: `/proxy/network/integration/v1/sites/${siteIdPart}/clients` },
];
```

Change to:
```javascript
const testEndpoints = [
  { path: `/api/s/${siteIdPart}/stat/sta`, label: 'Active Clients (Site-specific)' },
  { path: `/api/s/default/stat/sta`, label: 'Active Clients (Default Site)' },
  { path: `/api/stat/sta`, label: 'All Clients' },
];
```

### Change 3: Fix Port

**File**: `/src/components/UnifiTestPage.js`  
**Lines**: 926-927

Change from:
```javascript
const protocol = controllerAddress.startsWith('http') ? '' : 'https://';
const fullUrl = `${protocol}${controllerAddress}${endpointConfig.path}`;
```

Change to:
```javascript
const protocol = controllerAddress.startsWith('http') ? '' : 'https://';
const port = controllerAddress.includes(':') ? '' : ':8443';
const fullUrl = `${protocol}${controllerAddress}${port}${endpointConfig.path}`;
```

### Change 4: Fix Proxy Routing

**File**: `/src/components/UnifiTestPage.js`  
**Lines**: 922-925

Change from:
```javascript
const proxyUrl = process.env.REACT_APP_UNIFI_PROXY_URL ||
                (process.env.REACT_APP_UNIFI_PROXY_ORIGIN
                  ? `${process.env.REACT_APP_UNIFI_PROXY_ORIGIN}/api/unifi-proxy`
                  : '/api/unifi-proxy');
```

Change to:
```javascript
let proxyUrl;
if (controllerAddress.startsWith('192.168.') || 
    controllerAddress === 'localhost' || 
    controllerAddress.startsWith('127.')) {
  // Local network: use local proxy
  proxyUrl = process.env.REACT_APP_LOCAL_PROXY_URL || 'http://localhost:3001/proxy';
} else {
  // Remote: use Vercel proxy
  proxyUrl = process.env.REACT_APP_UNIFI_PROXY_URL ||
            (process.env.REACT_APP_UNIFI_PROXY_ORIGIN
              ? `${process.env.REACT_APP_UNIFI_PROXY_ORIGIN}/api/unifi-proxy`
              : '/api/unifi-proxy');
}
```

---

## Part 6: Documentation Issues

### UNIFI_INTEGRATION_GUIDE.md
**Issue**: Doesn't explain Cloud API vs Network API difference  
**Fix**: Add section explaining both APIs

### LOCAL_UNIFI_PROXY_README.md
**Issue**: Contains `/proxy/network/` examples that are incorrect  
**Fix**: Update to use correct `/api/s/...` paths

### UNIFI_MOBILE_SETUP.md
**Issue**: Suggests using WAN IP, but local network access should use local proxy  
**Fix**: Add section for local network vs remote access

---

## Part 7: Testing Plan

### Prerequisites
```bash
# 1. Start local development
npm run dev  # App on http://localhost:3000

# 2. Start local proxy (in another terminal)
node local-unifi-proxy.js  # Proxy on http://localhost:3001

# 3. Have Network API key from UniFi controller
# Settings → System → Advanced → Integrations → Create API Key
```

### Test 1: Cloud API (Should still work)
```
1. Go to UniFi Test page
2. Enter manual URL: https://api.ui.com
3. Click "Test Connection"
4. Expected: ✅ Sites load
```

### Test 2: Local Network (New - After fixes)
```
1. Go to UniFi Test page
2. Enter Controller IP: 192.168.1.1
3. Enter Network API Key: your_network_api_key
4. Click "Get Client Data"
5. Expected: ✅ Client data appears

Why it works:
  - Detects 192.168.x.x is local
  - Uses localhost:3001 proxy
  - Proxy reaches controller at port 8443
  - Correct endpoint /api/s/default/stat/sta
```

### Test 3: Remote Access (After fixes)
```
1. Go to UniFi Test page
2. Enter Controller WAN IP: 47.199.106.32
3. Enter Network API Key: your_network_api_key
4. Click "Get Client Data"
5. Expected: ✅ Client data appears (if port-forwarded)

Why it works:
  - Detects WAN IP
  - Uses Vercel proxy (can reach public IPs)
  - Correct endpoint /api/s/default/stat/sta
  - Correct port :8443
```

---

## Part 8: Implementation Status

### Summary Table

| Component | Cloud API | Network API | Notes |
|-----------|-----------|-------------|-------|
| API Service | ✅ Working | ❌ Missing | `fetchClients()` not implemented |
| Proxy Handler | ✅ Working | ⚠️ Partial | Infrastructure exists, config wrong |
| Test Page | ✅ Working | ❌ Broken | Wrong paths, wrong port, wrong proxy |
| Local Proxy | ✅ Correct | ⚠️ Unused | Code is correct but never called |
| Documentation | ✅ Decent | ❌ Wrong | Needs correction |

### Effort Required

- **Remove hardcoded key**: 5 minutes
- **Fix endpoint paths**: 5 minutes
- **Fix port number**: 5 minutes
- **Fix proxy routing**: 15 minutes
- **Update documentation**: 30 minutes
- **Test all scenarios**: 30 minutes

**Total**: ~90 minutes to fix completely

---

## Part 9: Recommendations

### Immediate (Critical)
1. Remove hardcoded API key
2. Fix endpoint paths
3. Fix port number
4. Add proxy routing logic

### Short-term (High Priority)
1. Implement `fetchClients()` function
2. Update documentation
3. Test with real UniFi controller
4. Add error messages for common failures

### Medium-term (Nice to Have)
1. Add controller version detection
2. Add automatic endpoint discovery
3. Cache API responses
4. Add client refresh capability

---

## Conclusion

Your UniFi API implementation is **95% correct for Cloud API** but **completely non-functional for Network API**.

The good news: All the infrastructure is there. You just need to fix configuration and routing logic. No major rewrite needed.

The bad news: Until these changes are made, local Network API access is impossible.

**Recommendation**: Implement all four critical changes (10-15 minutes of work) before attempting to use local Network API functionality.

---

**Files needing changes**:
- `/api/unifi-proxy.js` (1 fix)
- `/src/components/UnifiTestPage.js` (3 fixes)
- Documentation files (clarity improvements)

**Expected outcome after fixes**: Full working local and remote Network API access
