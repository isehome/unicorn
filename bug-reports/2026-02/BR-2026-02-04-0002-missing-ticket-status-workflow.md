---
id: BR-2026-02-04-0002
title: "The existing ticket workflow lacks a 'work complete' status, preventing users from accurately representing a key step between installation completion and final closure."
status: new
severity: medium
priority: p2
reported_at: 2026-02-04T14:44:08.615276+00:00
reported_by: Stephe Blansette <stephe@isehome.com>
app: unicorn
area: service
environment:
  url: https://unicorn-one.vercel.app/service/tickets/c0a8a5d4-211f-40fd-9bf3-c9bea5b79077
  browser: "Safari 26"
  os: "macOS"
labels: ["feature-request", "workflow", "configuration", "ui", "api", "backend"]
assignee: ""
ai_analysis:
  summary: "The existing ticket workflow lacks a 'work complete' status, preventing users from accurately representing a key step between installation completion and final closure."
  root_cause: "The current application's ticket status definitions and workflow configuration do not include a 'work complete' status. This prevents users from accurately categorizing tickets that have completed the 'installation work' phase but are not yet ready to be marked as 'closed', missing a crucial intermediary step as described by the user. This is a configuration/feature gap rather than a bug causing an application malfunction. The reported console error regarding screenshot capture is unrelated to this workflow issue."
  fix_prompt: |
    This request is for a new feature or a configuration change rather than a direct fix for a technical error. The provided console error (`SecurityError: The operation is insecure.`) is unrelated to the user's description and should be investigated separately if it's impacting other functionality.
    
    To address the user's workflow requirement:
    
    1.  **Define New Status**: Add 'work complete' as a new valid status within the application's configuration for ticket statuses. This often involves updating a centralized configuration file, a database table, or an enumeration in the backend.
        *   **Logic**: Position 'work complete' in the workflow to follow 'Installation Completed' (or similar 'work completed' status) and precede 'Closed'.
    2.  **Database/Backend Updates**: If ticket statuses are stored in a database, add 'work complete' as an allowable value in the relevant status column or lookup table. Ensure backend APIs can accept and process this new status.
    3.  **Frontend UI Updates**: Modify the UI components responsible for displaying and updating ticket statuses (e.g., dropdowns, status badges, ticket detail views) to include 'work complete'. This typically involves:
        *   Updating a static list of statuses in a React component or context.
        *   Ensuring the API call to fetch available statuses (if dynamic) returns the new option.
    4.  **Business Logic Integration**: If there are specific actions, permissions, or notifications associated with transitioning to or from the 'work complete' status, implement the necessary backend business logic to support these.
    
    **Example File Locations for Frontend/Configuration:**
    (Exact paths and lines depend on the project structure, these are common patterns)
  suggested_files:
    - "src/config/ticketStatuses.js"
    - "src/features/tickets/components/TicketStatusSelector.js"
    - "src/api/ticketService.js"
    - "src/pages/service/TicketDetailPage.js"
  confidence: 0.75
---

## Summary

The existing ticket workflow lacks a 'work complete' status, preventing users from accurately representing a key step between installation completion and final closure.

## User Description

We need to add a different status so that when the ticket is completed like the installation work is completed it moves to needs to be built as the next step before closed so there needs to be one other status, which is work complete
Yeah

## Steps to Reproduce

1. Navigate to https://unicorn-one.vercel.app/service/tickets/c0a8a5d4-211f-40fd-9bf3-c9bea5b79077
2. [Steps from user description need to be extracted manually]

## Expected Result

[To be determined from user description]

## Actual Result

The current application's ticket status definitions and workflow configuration do not include a 'work complete' status. This prevents users from accurately categorizing tickets that have completed the 'installation work' phase but are not yet ready to be marked as 'closed', missing a crucial intermediary step as described by the user. This is a configuration/feature gap rather than a bug causing an application malfunction. The reported console error regarding screenshot capture is unrelated to this workflow issue.

## Console Errors

```
[2026-02-04T14:43:42.348Z] [BugReporter] Screenshot capture failed: SecurityError: The operation is insecure.
toDataURL@[native code]
@https://unicorn-one.vercel.app/static/js/main.0ed42994.js:2:1091074
```

## Screenshot

![Screenshot](../attachments/BR-2026-02-04-0002/screenshot.jpg)

## AI Analysis

### Root Cause
The current application's ticket status definitions and workflow configuration do not include a 'work complete' status. This prevents users from accurately categorizing tickets that have completed the 'installation work' phase but are not yet ready to be marked as 'closed', missing a crucial intermediary step as described by the user. This is a configuration/feature gap rather than a bug causing an application malfunction. The reported console error regarding screenshot capture is unrelated to this workflow issue.

### Suggested Fix

This request is for a new feature or a configuration change rather than a direct fix for a technical error. The provided console error (`SecurityError: The operation is insecure.`) is unrelated to the user's description and should be investigated separately if it's impacting other functionality.

To address the user's workflow requirement:

1.  **Define New Status**: Add 'work complete' as a new valid status within the application's configuration for ticket statuses. This often involves updating a centralized configuration file, a database table, or an enumeration in the backend.
    *   **Logic**: Position 'work complete' in the workflow to follow 'Installation Completed' (or similar 'work completed' status) and precede 'Closed'.
2.  **Database/Backend Updates**: If ticket statuses are stored in a database, add 'work complete' as an allowable value in the relevant status column or lookup table. Ensure backend APIs can accept and process this new status.
3.  **Frontend UI Updates**: Modify the UI components responsible for displaying and updating ticket statuses (e.g., dropdowns, status badges, ticket detail views) to include 'work complete'. This typically involves:
    *   Updating a static list of statuses in a React component or context.
    *   Ensuring the API call to fetch available statuses (if dynamic) returns the new option.
4.  **Business Logic Integration**: If there are specific actions, permissions, or notifications associated with transitioning to or from the 'work complete' status, implement the necessary backend business logic to support these.

**Example File Locations for Frontend/Configuration:**
(Exact paths and lines depend on the project structure, these are common patterns)

### Affected Files
- `src/config/ticketStatuses.js`: Add 'work complete' to the array or object defining available ticket statuses and their workflow transitions. This is typically where status names, IDs, and possibly their order are defined.
- `src/features/tickets/components/TicketStatusSelector.js`: Update the React component responsible for allowing users to select a ticket status (e.g., a dropdown or radio button group) to include 'work complete' as a selectable option. This might involve mapping over the updated `ticketStatuses` configuration.
- `src/api/ticketService.js`: Ensure the service layer handling API calls for ticket updates is correctly configured to send and receive the new 'work complete' status when a ticket's status is changed.
- `src/pages/service/TicketDetailPage.js`: Verify that the ticket detail page correctly displays the 'work complete' status once applied and that the status update mechanism correctly allows setting this status.

### Testing Steps
1. Navigate to a ticket details page (e.g., `https://unicorn-one.vercel.app/service/tickets/c0a8a5d4-211f-40fd-9bf3-c9bea5b79077`).
2. Locate the status change mechanism (e.g., a dropdown or button group). Verify that 'work complete' is now available as a selectable status option.
3. Change the ticket's status to 'work complete' and save the changes. Confirm that the ticket's status is successfully updated and displayed as 'work complete' on the detail page and any associated list views.
4. Attempt to transition a ticket from 'work complete' to 'closed' to ensure the workflow allows this subsequent step and that the transition is successful.

### AI Confidence
75%

---
*Generated by Unicorn AI Bug Analyzer at 2026-02-04T14:45:40.096Z*
