---
id: BR-2026-02-12-0003
title: "Activity log fails to load or update when performing ticket actions such as adding photos"
status: new
severity: high
priority: p1
reported_at: 2026-02-12T15:29:16.155727+00:00
reported_by: Stephe Blansette <stephe@isehome.com>
app: unicorn
area: service
environment:
  url: https://unicorn-one.vercel.app/service/tickets/4626401c-d10d-47dc-b9f5-0ad4d6132c92
  browser: "Safari 26"
  os: "macOS"
labels: ["api", "activity-log", "error-handling", "service-tickets"]
assignee: ""
ai_analysis:
  summary: "Activity log fails to load or update when performing ticket actions such as adding photos"
  root_cause: "The TicketActivityLog component and ticketActivityService are failing to retrieve activity data, specifically triggered when the UI attempts to refresh the log after a user action (like uploading a photo). The console errors indicate a failure in the fetch operation, and the generic '[object Object]' output suggests the error handling is not capturing the specific API error response (likely a 400 or 500 error from the activity endpoint)."
  fix_prompt: |
    1. Enhance error logging in `src/services/ticketActivityService.ts` to stringify error objects or log specific response details (status, message) instead of just '[object Object]'.
    2. In `src/services/ticketActivityService.ts`, verify the `getActivities` function correctly handles the ticket UUID and that the API endpoint URL is correctly formatted.
    3. In `src/components/tickets/TicketActivityLog.tsx` (or the relevant UI component), ensure that the `fetchActivities` call is properly awaited and that the state update for 'activities' handles empty or error responses without crashing the UI.
    4. Check the photo upload logic to ensure that after a successful upload, the call to refresh the activity log passes the correct ticket ID context.
  suggested_files:
    - "src/services/ticketActivityService.ts:15"
    - "src/components/tickets/TicketActivityLog.tsx:45"
  confidence: 0.9
---

## Summary

Activity log fails to load or update when performing ticket actions such as adding photos

## User Description

Getting failed to load activity when adding photos and things like that looks like activity logging is not working correctly

## Steps to Reproduce

1. Navigate to https://unicorn-one.vercel.app/service/tickets/4626401c-d10d-47dc-b9f5-0ad4d6132c92
2. [Steps from user description need to be extracted manually]

## Expected Result

[To be determined from user description]

## Actual Result

The TicketActivityLog component and ticketActivityService are failing to retrieve activity data, specifically triggered when the UI attempts to refresh the log after a user action (like uploading a photo). The console errors indicate a failure in the fetch operation, and the generic '[object Object]' output suggests the error handling is not capturing the specific API error response (likely a 400 or 500 error from the activity endpoint).

## Console Errors

```
[2026-02-12T15:28:52.673Z] [ticketActivityService] Error fetching activity: [object Object]

[2026-02-12T15:28:52.673Z] [TicketActivityLog] Error loading activities: [object Object]

[2026-02-12T15:28:59.395Z] [BugReporter] Screenshot capture failed: SecurityError: The operation is insecure.
toDataURL@[native code]
@https://unicorn-one.vercel.app/static/js/main.b153b336.js:2:1097339
```

## Screenshot

![Screenshot](../attachments/BR-2026-02-12-0003/screenshot.jpg)

## AI Analysis

### Root Cause
The TicketActivityLog component and ticketActivityService are failing to retrieve activity data, specifically triggered when the UI attempts to refresh the log after a user action (like uploading a photo). The console errors indicate a failure in the fetch operation, and the generic '[object Object]' output suggests the error handling is not capturing the specific API error response (likely a 400 or 500 error from the activity endpoint).

### Suggested Fix

1. Enhance error logging in `src/services/ticketActivityService.ts` to stringify error objects or log specific response details (status, message) instead of just '[object Object]'.
2. In `src/services/ticketActivityService.ts`, verify the `getActivities` function correctly handles the ticket UUID and that the API endpoint URL is correctly formatted.
3. In `src/components/tickets/TicketActivityLog.tsx` (or the relevant UI component), ensure that the `fetchActivities` call is properly awaited and that the state update for 'activities' handles empty or error responses without crashing the UI.
4. Check the photo upload logic to ensure that after a successful upload, the call to refresh the activity log passes the correct ticket ID context.

### Affected Files
- `src/services/ticketActivityService.ts` (line 15): Improve error handling in the fetch call to log detailed error messages and verify the endpoint URL construction.
- `src/components/tickets/TicketActivityLog.tsx` (line 45): Ensure the component correctly handles the error state when the service fails and verify the refresh trigger logic.

### Testing Steps
1. Navigate to a ticket page (e.g., /service/tickets/4626401c-d10d-47dc-b9f5-0ad4d6132c92).
2. Upload a photo to the ticket.
3. Observe if the 'failed to load activity' message appears in the activity log section.
4. Check the browser console to ensure the error is now descriptive instead of '[object Object]'.
5. Verify that the activity log correctly displays the new 'photo added' entry after the fix.

### AI Confidence
90%

---
*Generated by Unicorn AI Bug Analyzer at 2026-02-12T15:30:29.822Z*
