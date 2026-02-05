---
id: BR-2026-02-05-0003
title: "Users are encountering an error when attempting to save service tickets, indicating a lack of robust error handling for API operations. Additionally, the customer's address is not displayed with a clickable map link, and triage notes text is unreadable due to light gray coloring. The BugReporter also failed to capture a screenshot due to a security error."
status: new
severity: critical
priority: p0
reported_at: 2026-02-05T21:30:28.090744+00:00
reported_by: Stephe Blansette <stephe@isehome.com>
app: unicorn
area: service
environment:
  url: https://unicorn-one.vercel.app/service/tickets/66ba3d03-0e1c-499a-b0ce-fe352dd5e02d
  browser: "Safari 26"
  os: "macOS 10.15"
labels: ["api", "error-handling", "ui", "ux", "data-display", "bug-reporter"]
assignee: ""
ai_analysis:
  summary: "Users are encountering an error when attempting to save service tickets, indicating a lack of robust error handling for API operations. Additionally, the customer's address is not displayed with a clickable map link, and triage notes text is unreadable due to light gray coloring. The BugReporter also failed to capture a screenshot due to a security error."
  root_cause: "The primary issue, 'error saving service tickets', likely stems from unhandled exceptions or API errors during the save operation. No specific console errors for this action were provided, suggesting the application either fails silently, presents a generic UI error without logging, or the BugReporter failed to capture the relevant logs. The screenshot capture failure (a `SecurityError` related to `toDataURL`) indicates an issue with the BugReporter component itself, possibly due to cross-origin resource handling when attempting to render the page content to a canvas."
  fix_prompt: |
    To address the 'error saving service tickets':
    
    1.  **Enhance Error Handling in `ServiceTicketForm`:**
        *   **File:** `src/features/service-tickets/components/ServiceTicketForm.jsx` (or `TicketDetail.jsx`)
        *   **Changes:** Locate the `handleSubmit` or `saveTicket` async function responsible for making the API call. Wrap the API call in a `try...catch` block. In the `catch` block, log the detailed error to `console.error()` and update the UI to display a user-friendly error message (e.g., a toast notification or inline error message).
        *   **Example:**
            javascript
            const handleSubmit = async (values) => {
              try {
                setIsLoading(true);
                await serviceTicketsApi.updateTicket(ticketId, values);
                // Handle success (e.g., show success toast, navigate)
                showToast('Ticket saved successfully!', 'success');
              } catch (error) {
                console.error('Failed to save service ticket:', error);
                // Display user-friendly error message
                showToast(error.message || 'Failed to save ticket. Please try again.', 'error');
              } finally {
                setIsLoading(false);
              }
            };
            
    
    2.  **Display Customer Address with Map Link:**
        *   **File:** `src/features/customers/components/ContactInfo.jsx` (or `CustomerDetails.jsx`)
        *   **Changes:** Ensure the `customer.address` property is rendered. Wrap the address text in an anchor tag that dynamically generates a Google Maps URL. If 'pole maps' is a specific internal or external integration, implement that. Otherwise, default to Google Maps.
        *   **Example:**
            jsx
            {customer.address && (
              <a 
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {customer.address}
              </a>
            )}
            
    
    3.  **Correct Triage Notes Readability:**
        *   **File:** `src/features/service-tickets/components/TriageNotes.jsx` (or a related CSS file like `TriageNotes.module.css`)
        *   **Changes:** Identify the CSS rule applying `color: lightgray` to the triage notes text. Change this to `color: white` or a more readable dark color if the background is light. If using CSS modules, update the specific class. If using inline styles, update the style object.
        *   **Example (CSS):**
            css
            .triage-notes-text {
              color: white; /* Change from lightgray */
            }
            
    
    4.  **Fix BugReporter Screenshot Capture:**
        *   **File:** `src/shared/components/BugReporter.jsx` (or `utils/bugReporter.js`)
        *   **Changes:** Investigate the `toDataURL` call, which is likely operating on an HTML Canvas. The `SecurityError` suggests a cross-origin issue (e.g., images or content from different domains being drawn to the canvas without `crossOrigin="anonymous"` or other security measures). Ensure all external resources drawn to the canvas have appropriate `crossOrigin` attributes set, or that any iframes are from the same origin or are correctly sandboxed.
  suggested_files:
    - "src/features/service-tickets/components/ServiceTicketForm.jsx"
    - "src/api/serviceTicketsApi.js"
    - "src/features/customers/components/ContactInfo.jsx"
    - "src/features/service-tickets/components/TriageNotes.jsx"
    - "src/shared/components/BugReporter.jsx"
  confidence: 0.7
---

## Summary

Users are encountering an error when attempting to save service tickets, indicating a lack of robust error handling for API operations. Additionally, the customer's address is not displayed with a clickable map link, and triage notes text is unreadable due to light gray coloring. The BugReporter also failed to capture a screenshot due to a security error.

## User Description

1. the customers address need to be shown in the contact area and provide a clickable link to a pole maps or Google Maps.  2 Test for the triage notes needs to be White not light gray so they are readable.    3 there is an error saving service tickets

## Steps to Reproduce

1. Navigate to https://unicorn-one.vercel.app/service/tickets/66ba3d03-0e1c-499a-b0ce-fe352dd5e02d
2. [Steps from user description need to be extracted manually]

## Expected Result

[To be determined from user description]

## Actual Result

The primary issue, 'error saving service tickets', likely stems from unhandled exceptions or API errors during the save operation. No specific console errors for this action were provided, suggesting the application either fails silently, presents a generic UI error without logging, or the BugReporter failed to capture the relevant logs. The screenshot capture failure (a `SecurityError` related to `toDataURL`) indicates an issue with the BugReporter component itself, possibly due to cross-origin resource handling when attempting to render the page content to a canvas.

## Console Errors

```
[2026-02-05T21:29:02.377Z] [BugReporter] Screenshot capture failed: SecurityError: The operation is insecure.
toDataURL@[native code]
@https://unicorn-one.vercel.app/static/js/main.bf25ccd9.js:2:1096571
```

## Screenshot

![Screenshot](../attachments/BR-2026-02-05-0003/screenshot.jpg)

## AI Analysis

### Root Cause
The primary issue, 'error saving service tickets', likely stems from unhandled exceptions or API errors during the save operation. No specific console errors for this action were provided, suggesting the application either fails silently, presents a generic UI error without logging, or the BugReporter failed to capture the relevant logs. The screenshot capture failure (a `SecurityError` related to `toDataURL`) indicates an issue with the BugReporter component itself, possibly due to cross-origin resource handling when attempting to render the page content to a canvas.

### Suggested Fix

To address the 'error saving service tickets':

1.  **Enhance Error Handling in `ServiceTicketForm`:**
    *   **File:** `src/features/service-tickets/components/ServiceTicketForm.jsx` (or `TicketDetail.jsx`)
    *   **Changes:** Locate the `handleSubmit` or `saveTicket` async function responsible for making the API call. Wrap the API call in a `try...catch` block. In the `catch` block, log the detailed error to `console.error()` and update the UI to display a user-friendly error message (e.g., a toast notification or inline error message).
    *   **Example:**
        javascript
        const handleSubmit = async (values) => {
          try {
            setIsLoading(true);
            await serviceTicketsApi.updateTicket(ticketId, values);
            // Handle success (e.g., show success toast, navigate)
            showToast('Ticket saved successfully!', 'success');
          } catch (error) {
            console.error('Failed to save service ticket:', error);
            // Display user-friendly error message
            showToast(error.message || 'Failed to save ticket. Please try again.', 'error');
          } finally {
            setIsLoading(false);
          }
        };
        

2.  **Display Customer Address with Map Link:**
    *   **File:** `src/features/customers/components/ContactInfo.jsx` (or `CustomerDetails.jsx`)
    *   **Changes:** Ensure the `customer.address` property is rendered. Wrap the address text in an anchor tag that dynamically generates a Google Maps URL. If 'pole maps' is a specific internal or external integration, implement that. Otherwise, default to Google Maps.
    *   **Example:**
        jsx
        {customer.address && (
          <a 
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {customer.address}
          </a>
        )}
        

3.  **Correct Triage Notes Readability:**
    *   **File:** `src/features/service-tickets/components/TriageNotes.jsx` (or a related CSS file like `TriageNotes.module.css`)
    *   **Changes:** Identify the CSS rule applying `color: lightgray` to the triage notes text. Change this to `color: white` or a more readable dark color if the background is light. If using CSS modules, update the specific class. If using inline styles, update the style object.
    *   **Example (CSS):**
        css
        .triage-notes-text {
          color: white; /* Change from lightgray */
        }
        

4.  **Fix BugReporter Screenshot Capture:**
    *   **File:** `src/shared/components/BugReporter.jsx` (or `utils/bugReporter.js`)
    *   **Changes:** Investigate the `toDataURL` call, which is likely operating on an HTML Canvas. The `SecurityError` suggests a cross-origin issue (e.g., images or content from different domains being drawn to the canvas without `crossOrigin="anonymous"` or other security measures). Ensure all external resources drawn to the canvas have appropriate `crossOrigin` attributes set, or that any iframes are from the same origin or are correctly sandboxed.

### Affected Files
- `src/features/service-tickets/components/ServiceTicketForm.jsx`: Add try...catch block for API save operations and display user-friendly error messages.
- `src/api/serviceTicketsApi.js`: Ensure API functions propagate errors correctly so they can be caught by calling components.
- `src/features/customers/components/ContactInfo.jsx`: Render customer address as a clickable link to Google Maps.
- `src/features/service-tickets/components/TriageNotes.jsx`: Update CSS to change triage notes text color from light gray to white for readability.
- `src/shared/components/BugReporter.jsx`: Investigate and fix the SecurityError related to toDataURL to enable proper screenshot capture.

### Testing Steps
1. 1. Navigate to a service ticket detail page (e.g., `https://unicorn-one.vercel.app/service/tickets/66ba3d03-0e1c-499a-b0ce-fe352dd5e02d`).
2. 2. Modify some fields in the ticket form and click 'Save'. Verify that the ticket saves successfully and appropriate success/error feedback is displayed to the user. (Simulate an API error if possible to test error handling).
3. 3. On the service ticket detail page, locate the customer contact area. Verify that the customer's address is displayed and is a clickable link that opens Google Maps (or the specified map service) in a new tab.
4. 4. On the service ticket detail page, locate the 'Triage Notes' section. Verify that the text inside this section is clearly visible with white text, not light gray.
5. 5. Attempt to use the BugReporter tool. Verify that a screenshot is captured successfully without any `SecurityError` in the console.
6. 6. Check the browser console for any new JavaScript errors during any of the above steps.

### AI Confidence
70%

---
*Generated by Unicorn AI Bug Analyzer at 2026-02-05T21:33:29.629Z*
