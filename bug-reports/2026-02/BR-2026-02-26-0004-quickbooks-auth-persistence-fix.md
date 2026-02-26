---
id: BR-2026-02-26-0004
title: "QuickBooks connection frequently disconnects, requiring manual re-sync due to missing authorization headers in API requests."
status: new
severity: high
priority: p1
reported_at: 2026-02-26T17:56:56.901844+00:00
reported_by: Stephe Blansette <stephe@isehome.com>
app: unicorn
area: service
environment:
  url: https://unicorn-one.vercel.app/service/tickets/7e402747-a01f-44b9-afab-64129cb95608
  browser: "Safari 26"
  os: "macOS 10.15"
labels: ["api", "authentication", "quickbooks", "integration"]
assignee: ""
ai_analysis:
  summary: "QuickBooks connection frequently disconnects, requiring manual re-sync due to missing authorization headers in API requests."
  root_cause: "The application is failing to maintain a persistent connection with QuickBooks because the 'Authorization' header is missing or malformed during API calls. This suggests that either the user's session token is not being correctly retrieved from storage (localStorage/Cookies) before the export request, or the QuickBooks OAuth refresh token logic is missing/failing, causing the connection to expire prematurely. The console errors show multiple concurrent failures across different 'pages' of the export process, confirming a systemic failure to provide credentials."
  fix_prompt: |
    1. Review the API client configuration (likely in a file like `src/api/client.js` or `src/utils/api.js`) to ensure that the `Authorization` header is dynamically attached to every request using an interceptor.
    2. Implement or fix the QuickBooks OAuth refresh token flow. When a 401 error is received from the QuickBooks-related endpoints, the app should attempt to use a refresh token to get a new access token before forcing the user to re-sync.
    3. Verify that the token storage mechanism (e.g., `localStorage.getItem('token')`) is reliable and that the token isn't being cleared by a race condition or Safari's strict privacy settings (ITP).
    4. In the Service Ticket export logic, add a check to validate the connection status before initiating the export, and if the token is missing, attempt a silent refresh rather than immediately showing the 're-sync' UI.
  suggested_files:
    - "src/api/axiosConfig.js:15"
    - "src/services/quickbooksService.js:45"
    - "src/pages/service/tickets/[id].js:120"
  confidence: 0.9
---

## Summary

QuickBooks connection frequently disconnects, requiring manual re-sync due to missing authorization headers in API requests.

## User Description

when trying to send Service Ticket to Quickbooks, the screen shows that we need to re sync and connect the quickbooks account.   this happens all the time.   we need this connections to stay persistent.

## Steps to Reproduce

1. Navigate to https://unicorn-one.vercel.app/service/tickets/7e402747-a01f-44b9-afab-64129cb95608
2. [Steps from user description need to be extracted manually]

## Expected Result

[To be determined from user description]

## Actual Result

The application is failing to maintain a persistent connection with QuickBooks because the 'Authorization' header is missing or malformed during API calls. This suggests that either the user's session token is not being correctly retrieved from storage (localStorage/Cookies) before the export request, or the QuickBooks OAuth refresh token logic is missing/failing, causing the connection to expire prematurely. The console errors show multiple concurrent failures across different 'pages' of the export process, confirming a systemic failure to provide credentials.

## Console Errors

```
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

[2026-02-26T17:43:04.546Z] Error loading bugs: Error: Missing or malformed Authorization header
@https://unicorn-one.vercel.app/static/js/7153.ac583385.chunk.js:1:60904

[2026-02-26T17:44:45.715Z] Error loading bugs: Error: Missing or malformed Authorization header
@https://unicorn-one.vercel.app/static/js/7153.ac583385.chunk.js:1:60904

[2026-02-26T17:55:50.261Z] [BugReporter] Screenshot capture failed: SecurityError: The operation is insecure.
toDataURL@[native code]
@https://unicorn-one.vercel.app/static/js/main.bc205644.js:2:1099883
```

## Screenshot

![Screenshot](../attachments/BR-2026-02-26-0004/screenshot.jpg)

## AI Analysis

### Root Cause
The application is failing to maintain a persistent connection with QuickBooks because the 'Authorization' header is missing or malformed during API calls. This suggests that either the user's session token is not being correctly retrieved from storage (localStorage/Cookies) before the export request, or the QuickBooks OAuth refresh token logic is missing/failing, causing the connection to expire prematurely. The console errors show multiple concurrent failures across different 'pages' of the export process, confirming a systemic failure to provide credentials.

### Suggested Fix

1. Review the API client configuration (likely in a file like `src/api/client.js` or `src/utils/api.js`) to ensure that the `Authorization` header is dynamically attached to every request using an interceptor.
2. Implement or fix the QuickBooks OAuth refresh token flow. When a 401 error is received from the QuickBooks-related endpoints, the app should attempt to use a refresh token to get a new access token before forcing the user to re-sync.
3. Verify that the token storage mechanism (e.g., `localStorage.getItem('token')`) is reliable and that the token isn't being cleared by a race condition or Safari's strict privacy settings (ITP).
4. In the Service Ticket export logic, add a check to validate the connection status before initiating the export, and if the token is missing, attempt a silent refresh rather than immediately showing the 're-sync' UI.

### Affected Files
- `src/api/axiosConfig.js` (line 15): Ensure the request interceptor correctly pulls the latest auth token from storage for every outgoing request.
- `src/services/quickbooksService.js` (line 45): Implement logic to handle token expiration and trigger a refresh token flow instead of requiring manual user intervention.
- `src/pages/service/tickets/[id].js` (line 120): Update the export handler to gracefully handle 'Missing Authorization' errors by attempting to re-authenticate the session.

### Testing Steps
1. Connect a QuickBooks account and wait for the initial access token to expire (usually 60 minutes).
2. Attempt to export a Service Ticket to QuickBooks without manually refreshing the page.
3. Verify that the API client automatically refreshes the token or correctly attaches the existing token to the request.
4. Check the browser console to ensure no 'Missing or malformed Authorization header' errors appear during the export process.
5. Test specifically in Safari to ensure Intelligent Tracking Prevention (ITP) isn't clearing the session storage.

### AI Confidence
90%

---
*Generated by Unicorn AI Bug Analyzer at 2026-02-26T17:58:03.927Z*
