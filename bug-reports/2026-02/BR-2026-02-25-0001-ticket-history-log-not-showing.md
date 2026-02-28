---
id: BR-2026-02-25-0001
title: "Ticket activity log and history are not displaying due to failed data fetching and a database constraint violation on ticket notes."
status: new
severity: high
priority: p1
reported_at: 2026-02-25T13:46:44.352183+00:00
reported_by: Stephe Blansette <stephe@isehome.com>
app: unicorn
area: service
environment:
  url: https://unicorn-one.vercel.app/service/tickets/c9674a6d-1b32-4776-a159-9d10cd58b01e
  browser: "Safari 26"
  os: "macOS 10.15"
labels: ["service-tickets", "api", "authentication", "database"]
assignee: ""
ai_analysis:
  summary: "Ticket activity log and history are not displaying due to failed data fetching and a database constraint violation on ticket notes."
  root_cause: "The 'history log' (Activity Log) is failing to load because the `ticketActivityService` is encountering an error (likely a 401 Unauthorized or a failed query). Additionally, attempts to add or view 'issues' (notes) are failing due to a database check constraint violation (`service_ticket_notes_note_type_check`) where the frontend is sending an invalid `note_type`. The MSAL `monitor_window_timeout` error in Safari suggests that authentication tokens are not being refreshed correctly, which blocks API calls."
  fix_prompt: |
    1. In `src/services/ticketActivityService.ts`, update the `fetchActivity` function to properly log error details instead of `[object Object]` and ensure it handles 401 errors by triggering a re-authentication flow. 2. In `src/services/ServiceTicketService.ts`, locate the `addNote` function and verify the `note_type` being sent to the backend. It must match the allowed values in the database constraint (likely 'internal', 'customer', or 'system'). 3. In the UI component `src/components/tickets/TicketActivityLog.tsx` (or similar), ensure that the loading and error states are handled so the user sees a 'Failed to load' message instead of a blank area. 4. To address the Safari-specific MSAL timeout, ensure the MSAL configuration uses `allowRedirectInIframe: true` or handles the `monitor_window_timeout` by falling back to `acquireTokenRedirect`.
  suggested_files:
    - "src/services/ticketActivityService.ts:15"
    - "src/services/ServiceTicketService.ts:45"
    - "src/components/tickets/TicketActivityLog.tsx:60"
  confidence: 0.9
---

## Summary

Ticket activity log and history are not displaying due to failed data fetching and a database constraint violation on ticket notes.

## User Description

issue and history log is not showing

## Steps to Reproduce

1. Navigate to https://unicorn-one.vercel.app/service/tickets/c9674a6d-1b32-4776-a159-9d10cd58b01e
2. [Steps from user description need to be extracted manually]

## Expected Result

[To be determined from user description]

## Actual Result

The 'history log' (Activity Log) is failing to load because the `ticketActivityService` is encountering an error (likely a 401 Unauthorized or a failed query). Additionally, attempts to add or view 'issues' (notes) are failing due to a database check constraint violation (`service_ticket_notes_note_type_check`) where the frontend is sending an invalid `note_type`. The MSAL `monitor_window_timeout` error in Safari suggests that authentication tokens are not being refreshed correctly, which blocks API calls.

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

![Screenshot](../attachments/BR-2026-02-25-0001/screenshot.jpg)

## AI Analysis

### Root Cause
The 'history log' (Activity Log) is failing to load because the `ticketActivityService` is encountering an error (likely a 401 Unauthorized or a failed query). Additionally, attempts to add or view 'issues' (notes) are failing due to a database check constraint violation (`service_ticket_notes_note_type_check`) where the frontend is sending an invalid `note_type`. The MSAL `monitor_window_timeout` error in Safari suggests that authentication tokens are not being refreshed correctly, which blocks API calls.

### Suggested Fix

1. In `src/services/ticketActivityService.ts`, update the `fetchActivity` function to properly log error details instead of `[object Object]` and ensure it handles 401 errors by triggering a re-authentication flow. 2. In `src/services/ServiceTicketService.ts`, locate the `addNote` function and verify the `note_type` being sent to the backend. It must match the allowed values in the database constraint (likely 'internal', 'customer', or 'system'). 3. In the UI component `src/components/tickets/TicketActivityLog.tsx` (or similar), ensure that the loading and error states are handled so the user sees a 'Failed to load' message instead of a blank area. 4. To address the Safari-specific MSAL timeout, ensure the MSAL configuration uses `allowRedirectInIframe: true` or handles the `monitor_window_timeout` by falling back to `acquireTokenRedirect`.

### Affected Files
- `src/services/ticketActivityService.ts` (line 15): Improve error handling and logging in the activity fetch request.
- `src/services/ServiceTicketService.ts` (line 45): Correct the note_type value passed to the API to satisfy the database check constraint.
- `src/components/tickets/TicketActivityLog.tsx` (line 60): Add error state UI to inform the user when the history log fails to load.

### Testing Steps
1. Open a service ticket in Safari 26 on macOS 10.15.
2. Verify if the 'History' or 'Activity Log' section displays a loading spinner or data.
3. Attempt to add a note to the ticket and check the console for 'service_ticket_notes_note_type_check' errors.
4. Clear browser cache/cookies to trigger a fresh MSAL login and verify token acquisition works without timeout.

### AI Confidence
90%

---
*Generated by Unicorn AI Bug Analyzer at 2026-02-25T13:51:05.935Z*
