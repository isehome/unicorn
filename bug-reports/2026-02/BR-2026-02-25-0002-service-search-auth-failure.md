---
id: BR-2026-02-25-0002
title: "Search on Service Dashboard returns no results due to authentication token acquisition failure"
status: new
severity: high
priority: p1
reported_at: 2026-02-25T13:48:09.843934+00:00
reported_by: Stephe Blansette <stephe@isehome.com>
app: unicorn
area: service
environment:
  url: https://unicorn-one.vercel.app/service?search=sta
  browser: "Safari 26"
  os: "macOS 10.15"
labels: ["auth", "api", "search", "service-module"]
assignee: ""
ai_analysis:
  summary: "Search on Service Dashboard returns no results due to authentication token acquisition failure"
  root_cause: "The console logs show a 'monitor_window_timeout' error from MSAL (Auth). This indicates the application failed to acquire a valid access token silently in the background. Consequently, the API request to fetch filtered service tickets based on the 'search=sta' query parameter is either failing or being sent without authorization, leading to an empty result set ('Filtered Tickets (0)') despite 12 open tickets existing."
  fix_prompt: |
    1. In the authentication service (likely `src/services/authService.js` or a similar MSAL configuration file), implement a fallback mechanism for 'monitor_window_timeout' errors. If `acquireTokenSilent` fails with a timeout, trigger `acquireTokenRedirect` or `acquireTokenPopup` to refresh the session.
    2. In `src/pages/ServiceDashboard.js`, ensure the data fetching logic (e.g., a `useEffect` hook) correctly handles API errors. Instead of defaulting to an empty array `[]` on failure, it should display an error state to the user.
    3. Verify that the `search` query parameter from the URL is being correctly passed to the `ticketService.getTickets` (or equivalent) function and that the backend call includes the search term in the request headers or query string.
  suggested_files:
    - "src/services/authService.js:45"
    - "src/pages/ServiceDashboard.js:80"
    - "src/services/ticketService.js:25"
  confidence: 0.9
---

## Summary

Search on Service Dashboard returns no results due to authentication token acquisition failure

## User Description

search does not work

## Steps to Reproduce

1. Navigate to https://unicorn-one.vercel.app/service?search=sta
2. [Steps from user description need to be extracted manually]

## Expected Result

[To be determined from user description]

## Actual Result

The console logs show a 'monitor_window_timeout' error from MSAL (Auth). This indicates the application failed to acquire a valid access token silently in the background. Consequently, the API request to fetch filtered service tickets based on the 'search=sta' query parameter is either failing or being sent without authorization, leading to an empty result set ('Filtered Tickets (0)') despite 12 open tickets existing.

## Console Errors

```
[2026-02-25T13:33:19.201Z] [Auth] Token acquisition error: BrowserAuthError: monitor_window_timeout: Token acquisition in iframe failed due to timeout.  For more visit: aka.ms/msaljs/browser-errors
cA@https://unicorn-one.vercel.app/static/js/main.bc205644.js:2:563283
@https://unicorn-one.vercel.app/static/js/main.bc205644.js:2:718919

[2026-02-25T13:42:59.872Z] [ServiceTicketService] Failed to add note: [object Object]

[2026-02-25T13:42:59.872Z] [ServiceTicketService] Failed to add ticket note: Error: new row for relation "service_ticket_notes" violates check constraint "service_ticket_notes_note_type_check"
addNote@https://unicorn-one.vercel.app/static/js/210.54cf474e.chunk.js:1:5544

[2026-02-25T13:46:09.965Z] [ticketActivityService] Error fetching activity: [object Object]

[2026-02-25T13:46:09.965Z] [TicketActivityLog] Error loading activities: [object Object]

[2026-02-25T13:46:23.104Z] [ticketActivityService] Error fetching activity: [object Object]

[2026-02-25T13:46:23.104Z] [TicketActivityLog] Error loading activities: [object Object]

[2026-02-25T13:46:31.129Z] [BugReporter] Screenshot capture failed: SecurityError: The operation is insecure.
toDataURL@[native code]
@https://unicorn-one.vercel.app/static/js/main.bc205644.js:2:1099883
```

## Screenshot

![Screenshot](../attachments/BR-2026-02-25-0002/screenshot.jpg)

## AI Analysis

### Root Cause
The console logs show a 'monitor_window_timeout' error from MSAL (Auth). This indicates the application failed to acquire a valid access token silently in the background. Consequently, the API request to fetch filtered service tickets based on the 'search=sta' query parameter is either failing or being sent without authorization, leading to an empty result set ('Filtered Tickets (0)') despite 12 open tickets existing.

### Suggested Fix

1. In the authentication service (likely `src/services/authService.js` or a similar MSAL configuration file), implement a fallback mechanism for 'monitor_window_timeout' errors. If `acquireTokenSilent` fails with a timeout, trigger `acquireTokenRedirect` or `acquireTokenPopup` to refresh the session.
2. In `src/pages/ServiceDashboard.js`, ensure the data fetching logic (e.g., a `useEffect` hook) correctly handles API errors. Instead of defaulting to an empty array `[]` on failure, it should display an error state to the user.
3. Verify that the `search` query parameter from the URL is being correctly passed to the `ticketService.getTickets` (or equivalent) function and that the backend call includes the search term in the request headers or query string.

### Affected Files
- `src/services/authService.js` (line 45): Add error handling for monitor_window_timeout in the token acquisition logic.
- `src/pages/ServiceDashboard.js` (line 80): Update the ticket fetching useEffect to include the search parameter as a dependency and handle auth errors gracefully.
- `src/services/ticketService.js` (line 25): Ensure the getTickets method correctly handles the search parameter and includes the bearer token.

### Testing Steps
1. Clear browser cache and cookies to force a fresh login session.
2. Navigate to the Service Dashboard and verify the 'Token acquisition error' no longer appears in the console.
3. Type 'sta' into the search box and verify that tickets containing that string are displayed in the 'Filtered Tickets' section.
4. Verify that the URL updates to include '?search=sta' and that refreshing the page maintains the search results.

### AI Confidence
90%

---
*Generated by Unicorn AI Bug Analyzer at 2026-02-25T13:52:38.056Z*
