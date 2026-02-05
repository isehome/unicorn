---
id: BR-2026-02-05-0002
title: "The ticket status display/selector on the service ticket detail page does not reflect the ticket's actual current status."
status: new
severity: high
priority: p1
reported_at: 2026-02-05T19:08:44.343851+00:00
reported_by: Stephe Blansette <stephe@isehome.com>
app: unicorn
area: service
environment:
  url: https://unicorn-one.vercel.app/service/tickets/66ba3d03-0e1c-499a-b0ce-fe352dd5e02d
  browser: "Safari 26"
  os: "macOS 10.15"
labels: ["ui", "state-management", "data-synchronization", "frontend", "ticket-management"]
assignee: ""
ai_analysis:
  summary: "The ticket status display/selector on the service ticket detail page does not reflect the ticket's actual current status."
  root_cause: "The UI component responsible for rendering the ticket's status on the detail page (likely a dropdown or similar selector for 'Update status') is not correctly initialized with, or reactive to, the actual `status` property fetched from the ticket data. This often occurs due to one of the following: 1.  **Asynchronous data loading:** The component renders with a default or outdated status before the current ticket data, including its `status`, is fully fetched and processed. 2.  **Incorrect state management:** The component's internal state for the selected status is not being properly synchronized with the `status` prop received from the parent component, or the parent component isn't passing the most up-to-date `status`. 3.  **Binding issues:** The HTML control (e.g., `<select>` element) is not correctly bound to the `ticket.status` value, or there's a mismatch in value types/formats between the API and the UI.  *Note: The console error 'Screenshot capture failed: SecurityError' is related to the bug reporting tool itself attempting to capture a screenshot (e.g., from a tainted canvas/iframe) and is not directly related to the user's reported issue of the status display being incorrect.*"
  fix_prompt: |
    1.  **Identify Ticket Data Source:** Locate the React component responsible for fetching and displaying the ticket details. Based on the URL, this is likely a page-level component such as `src/features/tickets/pages/TicketDetailPage.jsx` (or `.tsx`). Ensure this component successfully fetches the complete `ticket` object, including its `status` property, from the API.
    2.  **Pass Status as Prop:** Verify that the `TicketDetailPage` (or equivalent parent component) correctly passes the `ticket.status` property as a prop to the child component responsible for rendering the status selector/display (e.g., `<TicketStatusSelector status={ticket.status} />`).
    3.  **Synchronize Child Component State:** In the child status selector component (e.g., `src/features/tickets/components/TicketStatusSelector.jsx` or `.tsx`):
        *   If using a controlled component (e.g., a `<select>` element), ensure its `value` prop is directly bound to `props.status` (or an internal state variable that is correctly initialized/updated from `props.status`). Use a `useEffect` hook to update internal state if `props.status` can change after initial render.
        *   Handle cases where `props.status` might be `null`, `undefined`, or empty during initial data loading. Consider showing a loading indicator or disabling the control until the actual status is available.
        *   Ensure that any internal state used for the selected status is initialized with `props.status` when the component mounts and is updated if `props.status` changes over the component's lifecycle.
    4.  **Value Matching:** Confirm that the status values received from the API (e.g., 'OPEN', 'IN_PROGRESS') exactly match the `value` attributes of the corresponding options in the HTML select element or other status control elements.
  suggested_files:
    - "src/features/tickets/pages/TicketDetailPage.jsx"
    - "src/features/tickets/components/TicketStatusSelector.jsx"
  confidence: 0.7
---

## Summary

The ticket status display/selector on the service ticket detail page does not reflect the ticket's actual current status.

## User Description

Update status should always show the current status.

## Steps to Reproduce

1. Navigate to https://unicorn-one.vercel.app/service/tickets/66ba3d03-0e1c-499a-b0ce-fe352dd5e02d
2. [Steps from user description need to be extracted manually]

## Expected Result

[To be determined from user description]

## Actual Result

The UI component responsible for rendering the ticket's status on the detail page (likely a dropdown or similar selector for 'Update status') is not correctly initialized with, or reactive to, the actual `status` property fetched from the ticket data. This often occurs due to one of the following:
1.  **Asynchronous data loading:** The component renders with a default or outdated status before the current ticket data, including its `status`, is fully fetched and processed.
2.  **Incorrect state management:** The component's internal state for the selected status is not being properly synchronized with the `status` prop received from the parent component, or the parent component isn't passing the most up-to-date `status`.
3.  **Binding issues:** The HTML control (e.g., `<select>` element) is not correctly bound to the `ticket.status` value, or there's a mismatch in value types/formats between the API and the UI.

*Note: The console error 'Screenshot capture failed: SecurityError' is related to the bug reporting tool itself attempting to capture a screenshot (e.g., from a tainted canvas/iframe) and is not directly related to the user's reported issue of the status display being incorrect.*

## Console Errors

```
[2026-02-05T19:07:54.320Z] [BugReporter] Screenshot capture failed: SecurityError: The operation is insecure.
toDataURL@[native code]
@https://unicorn-one.vercel.app/static/js/main.bf25ccd9.js:2:1096571
```

## Screenshot

![Screenshot](../attachments/BR-2026-02-05-0002/screenshot.jpg)

## AI Analysis

### Root Cause
The UI component responsible for rendering the ticket's status on the detail page (likely a dropdown or similar selector for 'Update status') is not correctly initialized with, or reactive to, the actual `status` property fetched from the ticket data. This often occurs due to one of the following:
1.  **Asynchronous data loading:** The component renders with a default or outdated status before the current ticket data, including its `status`, is fully fetched and processed.
2.  **Incorrect state management:** The component's internal state for the selected status is not being properly synchronized with the `status` prop received from the parent component, or the parent component isn't passing the most up-to-date `status`.
3.  **Binding issues:** The HTML control (e.g., `<select>` element) is not correctly bound to the `ticket.status` value, or there's a mismatch in value types/formats between the API and the UI.

*Note: The console error 'Screenshot capture failed: SecurityError' is related to the bug reporting tool itself attempting to capture a screenshot (e.g., from a tainted canvas/iframe) and is not directly related to the user's reported issue of the status display being incorrect.*

### Suggested Fix

1.  **Identify Ticket Data Source:** Locate the React component responsible for fetching and displaying the ticket details. Based on the URL, this is likely a page-level component such as `src/features/tickets/pages/TicketDetailPage.jsx` (or `.tsx`). Ensure this component successfully fetches the complete `ticket` object, including its `status` property, from the API.
2.  **Pass Status as Prop:** Verify that the `TicketDetailPage` (or equivalent parent component) correctly passes the `ticket.status` property as a prop to the child component responsible for rendering the status selector/display (e.g., `<TicketStatusSelector status={ticket.status} />`).
3.  **Synchronize Child Component State:** In the child status selector component (e.g., `src/features/tickets/components/TicketStatusSelector.jsx` or `.tsx`):
    *   If using a controlled component (e.g., a `<select>` element), ensure its `value` prop is directly bound to `props.status` (or an internal state variable that is correctly initialized/updated from `props.status`). Use a `useEffect` hook to update internal state if `props.status` can change after initial render.
    *   Handle cases where `props.status` might be `null`, `undefined`, or empty during initial data loading. Consider showing a loading indicator or disabling the control until the actual status is available.
    *   Ensure that any internal state used for the selected status is initialized with `props.status` when the component mounts and is updated if `props.status` changes over the component's lifecycle.
4.  **Value Matching:** Confirm that the status values received from the API (e.g., 'OPEN', 'IN_PROGRESS') exactly match the `value` attributes of the corresponding options in the HTML select element or other status control elements.

### Affected Files
- `src/features/tickets/pages/TicketDetailPage.jsx`: Review data fetching logic to ensure the `ticket.status` is loaded correctly and passed as a prop to the status control component.
- `src/features/tickets/components/TicketStatusSelector.jsx`: Modify this component to ensure its displayed/selected status is initialized from `props.status` and updates reactively as `props.status` changes.

### Testing Steps
1. 1. Navigate to a ticket detail page (e.g., https://unicorn-one.vercel.app/service/tickets/66ba3d03-0e1c-499a-b0ce-fe352dd5e02d).
2. 2. Observe the 'Update status' control/display. Verify that it accurately shows the current status of the ticket as retrieved from the backend (e.g., if the backend says 'Open', the UI shows 'Open').
3. 3. Change the ticket status using the 'Update status' control on the page and verify that the display immediately reflects the newly selected status.
4. 4. Refresh the page after changing status and verify that the correct, updated status is displayed upon initial load.

### AI Confidence
70%

---
*Generated by Unicorn AI Bug Analyzer at 2026-02-05T19:09:24.493Z*
