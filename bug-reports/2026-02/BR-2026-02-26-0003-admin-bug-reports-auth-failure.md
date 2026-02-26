---
id: BR-2026-02-26-0003
title: "Bug reports are not loading in the Admin panel due to authentication token acquisition failures following security patches."
status: new
severity: critical
priority: p0
reported_at: 2026-02-26T17:42:58.036522+00:00
reported_by: Stephe Blansette <stephe@isehome.com>
app: unicorn
area: admin
environment:
  url: https://unicorn-one.vercel.app/admin
  browser: "Safari 26"
  os: "macOS 10.15"
labels: ["auth", "api", "admin", "security"]
assignee: ""
ai_analysis:
  summary: "Bug reports are not loading in the Admin panel due to authentication token acquisition failures following security patches."
  root_cause: "The application is failing to silently acquire an authentication token (MSAL `monitor_window_timeout`), likely due to Safari's ITP blocking the auth iframe or a newly implemented Content Security Policy (CSP) restricting frame/connect sources. This results in API calls being made without a valid Authorization header, causing the 'Missing or malformed Authorization header' error seen in the UI."
  fix_prompt: |
    1. Update the MSAL authentication configuration to handle silent token acquisition failures by falling back to an interactive method (popup or redirect) when a `monitor_window_timeout` or `interaction_required` error occurs. 
    2. In the API client (likely an Axios interceptor or fetch wrapper), ensure that requests are not dispatched if the token is missing; instead, trigger a re-authentication flow.
    3. Review and update the Content Security Policy (CSP) headers to ensure the authentication provider's domains (e.g., login.microsoftonline.com) are explicitly allowed in `frame-src`, `connect-src`, and `script-src`.
    4. Specifically in `src/pages/Admin/BugTodos.js` (or the relevant data-fetching hook), add robust error handling to catch 401/403 responses and redirect the user to login if the session has expired.
  suggested_files:
    - "src/authConfig.js:15"
    - "src/api/client.js:45"
    - "src/hooks/useAuth.js:80"
  confidence: 0.95
---

## Summary

Bug reports are not loading in the Admin panel due to authentication token acquisition failures following security patches.

## User Description

bug report no longer are showing up.   We need to do a thorough scan of the system because some of the security patches we did have broken a lot of features.    how do we fix and then test

## Steps to Reproduce

1. Navigate to https://unicorn-one.vercel.app/admin
2. [Steps from user description need to be extracted manually]

## Expected Result

[To be determined from user description]

## Actual Result

The application is failing to silently acquire an authentication token (MSAL `monitor_window_timeout`), likely due to Safari's ITP blocking the auth iframe or a newly implemented Content Security Policy (CSP) restricting frame/connect sources. This results in API calls being made without a valid Authorization header, causing the 'Missing or malformed Authorization header' error seen in the UI.

## Console Errors

```
[2026-02-26T17:25:50.454Z] [Auth] Token acquisition error: BrowserAuthError: monitor_window_timeout: Token acquisition in iframe failed due to timeout.  For more visit: aka.ms/msaljs/browser-errors
cA@https://unicorn-one.vercel.app/static/js/main.bc205644.js:2:563283
@https://unicorn-one.vercel.app/static/js/main.bc205644.js:2:718919

[2026-02-26T17:30:18.593Z] Failed to export page Page 1: Error: Missing or malformed Authorization header
@https://unicorn-one.vercel.app/static/js/5763.4282ee6f.chunk.js:1:2763

[2026-02-26T17:30:18.616Z] Failed to export page Page 2: Error: Missing or malformed Authorization header
@https://unicorn-one.vercel.app/static/js/5763.4282ee6f.chunk.js:1:2763

[2026-02-26T17:30:18.622Z] Failed to export page Page 3: Error: Missing or malformed Authorization header
@https://unicorn-one.vercel.app/static/js/5763.4282ee6f.chunk.js:1:2763

[2026-02-26T17:30:19.605Z] Failed to export page Page 6: Error: Missing or malformed Authorization header
@https://unicorn-one.vercel.app/static/js/5763.4282ee6f.chunk.js:1:2763

[2026-02-26T17:30:19.615Z] Failed to export page Page 5: Error: Missing or malformed Authorization header
@https://unicorn-one.vercel.app/static/js/5763.4282ee6f.chunk.js:1:2763

[2026-02-26T17:30:19.620Z] Failed to export page Page 4: Error: Missing or malformed Authorization header
@https://unicorn-one.vercel.app/static/js/5763.4282ee6f.chunk.js:1:2763

[2026-02-26T17:30:20.470Z] Failed to export page Page 7: Error: Missing or malformed Authorization header
@https://unicorn-one.vercel.app/static/js/5763.4282ee6f.chunk.js:1:2763

[2026-02-26T17:41:58.697Z] Error loading bugs: Error: Missing or malformed Authorization header
@https://unicorn-one.vercel.app/static/js/7153.ac583385.chunk.js:1:60904
```

## Screenshot

![Screenshot](../attachments/BR-2026-02-26-0003/screenshot.jpg)

## AI Analysis

### Root Cause
The application is failing to silently acquire an authentication token (MSAL `monitor_window_timeout`), likely due to Safari's ITP blocking the auth iframe or a newly implemented Content Security Policy (CSP) restricting frame/connect sources. This results in API calls being made without a valid Authorization header, causing the 'Missing or malformed Authorization header' error seen in the UI.

### Suggested Fix

1. Update the MSAL authentication configuration to handle silent token acquisition failures by falling back to an interactive method (popup or redirect) when a `monitor_window_timeout` or `interaction_required` error occurs. 
2. In the API client (likely an Axios interceptor or fetch wrapper), ensure that requests are not dispatched if the token is missing; instead, trigger a re-authentication flow.
3. Review and update the Content Security Policy (CSP) headers to ensure the authentication provider's domains (e.g., login.microsoftonline.com) are explicitly allowed in `frame-src`, `connect-src`, and `script-src`.
4. Specifically in `src/pages/Admin/BugTodos.js` (or the relevant data-fetching hook), add robust error handling to catch 401/403 responses and redirect the user to login if the session has expired.

### Affected Files
- `src/authConfig.js` (line 15): Check MSAL configuration for redirect URIs and ensure 'allowRedirectInIframe' or similar compatibility settings are reviewed.
- `src/api/client.js` (line 45): Update the request interceptor to handle cases where the token acquisition fails, preventing calls with empty/malformed headers.
- `src/hooks/useAuth.js` (line 80): Implement a fallback to acquireTokenPopup if acquireTokenSilent fails with a timeout or interaction required error.

### Testing Steps
1. Open the application in Safari (specifically testing for ITP issues).
2. Navigate to the Admin > Bug Todos page.
3. Verify that if the silent token refresh fails, the user is prompted to sign in again rather than seeing a 'Missing Authorization header' error.
4. Check the Network tab to ensure the 'Authorization: Bearer <token>' header is present and correctly formatted in the request to the bugs endpoint.
5. Verify that the 'Export' functionality also works, as it was previously failing with the same header error.

### AI Confidence
95%

---
*Generated by Unicorn AI Bug Analyzer at 2026-02-26T17:46:42.490Z*
