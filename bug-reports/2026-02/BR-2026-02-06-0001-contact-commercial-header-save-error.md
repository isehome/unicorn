---
id: BR-2026-02-06-0001
title: "Unable to save optional header for commercial jobs on contact details due to secure data access logging failure."
status: new
severity: high
priority: p1
reported_at: 2026-02-06T15:35:58.273058+00:00
reported_by: Alexander@isehome.com <Alexander@isehome.com>
app: unicorn
area: contacts
environment:
  url: https://unicorn-one.vercel.app/people
  browser: "Safari 26"
  os: "macOS"
labels: ["api", "backend", "logging", "data-persistence", "ui", "feature-management"]
assignee: ""
ai_analysis:
  summary: "Unable to save optional header for commercial jobs on contact details due to secure data access logging failure."
  root_cause: "A server-side logging mechanism, likely a security auditor or data access logger, is failing when a user attempts to save or update contact information, specifically when related to 'commercial jobs' and their 'optional header'. The console error `Failed to log contact secure data access: [object Object]` indicates that the logging function is likely receiving an error object or other non-stringifiable data without proper serialization, causing the logging process to fail. This failure probably prevents the entire contact save/update operation from completing successfully, resulting in the user being unable to persist the desired header."
  fix_prompt: |
    To resolve this issue, you'll need to address both the backend logging failure and ensure the 'optional header' for commercial jobs is correctly handled during contact save/update operations.
    
    **Backend (API/Service Layer):**
    1.  **Locate the Contact Save/Update Logic:** Identify the API endpoints and associated service functions responsible for handling `POST /people` (create contact) and `PUT /people/:id` (update contact) requests. Relevant files might include `src/server/services/contactService.js`, `src/server/controllers/peopleController.js`, or similar module handling contact persistence.
    2.  **Examine Secure Data Access Logging:** Pinpoint the code block or function call within this logic that attempts to log 'contact secure data access'. This could be a dedicated logging utility, a security middleware, or an inline call within the service function.
    3.  **Address `[object Object]` Error:** The `[object Object]` in the error message indicates that the logging function is receiving an object that it's not properly serializing or extracting information from before logging. Modify this logging call to explicitly stringify the object (e.g., `JSON.stringify(object)`) or extract specific, relevant properties (e.g., `error.message`, `error.details`) before passing them to the logger. This will provide more meaningful log entries and prevent the logging mechanism from failing.
    4.  **Verify Data Persistence for 'commercialJobHeader':** Ensure that the database schema for contacts includes a field (e.g., `commercialJobHeader` of type `string`) to store the optional header. Confirm that the backend service correctly maps, validates, and persists this field from the incoming request payload to the database.
    5.  **Review Security/Validation:** Double-check any validation or authorization rules applied to the `commercialJobHeader` field or the 'commercial job' flag itself, ensuring they are not inadvertently causing failures that manifest as logging errors or preventing data persistence.
    
    **Frontend (UI Component):**
    1.  **Contact Form Component:** In the React component responsible for creating/editing contacts (e.g., `src/components/forms/ContactForm.js` or `src/pages/People/ContactEditor.js`), verify that there is an input field for the 'Optional Header for Commercial Jobs'. This field should ideally be conditionally rendered based on whether the contact is designated as 'commercial' or associated with a commercial job type.
    2.  **Payload Submission:** Ensure that the value from this 'Optional Header' input field is correctly included in the request payload sent to the backend API when creating or updating a contact.
  suggested_files:
    - "src/server/services/contactService.js"
    - "src/server/middleware/securityLogger.js"
    - "src/components/forms/ContactForm.js"
  confidence: 0.85
---

## Summary

Unable to save optional header for commercial jobs on contact details due to secure data access logging failure.

## User Description

Need to put an optional header for commercial jobs

## Steps to Reproduce

1. Navigate to https://unicorn-one.vercel.app/people
2. [Steps from user description need to be extracted manually]

## Expected Result

[To be determined from user description]

## Actual Result

A server-side logging mechanism, likely a security auditor or data access logger, is failing when a user attempts to save or update contact information, specifically when related to 'commercial jobs' and their 'optional header'. The console error `Failed to log contact secure data access: [object Object]` indicates that the logging function is likely receiving an error object or other non-stringifiable data without proper serialization, causing the logging process to fail. This failure probably prevents the entire contact save/update operation from completing successfully, resulting in the user being unable to persist the desired header.

## Console Errors

```
[2026-02-06T15:25:16.490Z] Failed to log contact secure data access: [object Object]

[2026-02-06T15:25:51.808Z] Failed to log contact secure data access: [object Object]
```

## Screenshot

![Screenshot](../attachments/BR-2026-02-06-0001/screenshot.jpg)

## AI Analysis

### Root Cause
A server-side logging mechanism, likely a security auditor or data access logger, is failing when a user attempts to save or update contact information, specifically when related to 'commercial jobs' and their 'optional header'. The console error `Failed to log contact secure data access: [object Object]` indicates that the logging function is likely receiving an error object or other non-stringifiable data without proper serialization, causing the logging process to fail. This failure probably prevents the entire contact save/update operation from completing successfully, resulting in the user being unable to persist the desired header.

### Suggested Fix

To resolve this issue, you'll need to address both the backend logging failure and ensure the 'optional header' for commercial jobs is correctly handled during contact save/update operations.

**Backend (API/Service Layer):**
1.  **Locate the Contact Save/Update Logic:** Identify the API endpoints and associated service functions responsible for handling `POST /people` (create contact) and `PUT /people/:id` (update contact) requests. Relevant files might include `src/server/services/contactService.js`, `src/server/controllers/peopleController.js`, or similar module handling contact persistence.
2.  **Examine Secure Data Access Logging:** Pinpoint the code block or function call within this logic that attempts to log 'contact secure data access'. This could be a dedicated logging utility, a security middleware, or an inline call within the service function.
3.  **Address `[object Object]` Error:** The `[object Object]` in the error message indicates that the logging function is receiving an object that it's not properly serializing or extracting information from before logging. Modify this logging call to explicitly stringify the object (e.g., `JSON.stringify(object)`) or extract specific, relevant properties (e.g., `error.message`, `error.details`) before passing them to the logger. This will provide more meaningful log entries and prevent the logging mechanism from failing.
4.  **Verify Data Persistence for 'commercialJobHeader':** Ensure that the database schema for contacts includes a field (e.g., `commercialJobHeader` of type `string`) to store the optional header. Confirm that the backend service correctly maps, validates, and persists this field from the incoming request payload to the database.
5.  **Review Security/Validation:** Double-check any validation or authorization rules applied to the `commercialJobHeader` field or the 'commercial job' flag itself, ensuring they are not inadvertently causing failures that manifest as logging errors or preventing data persistence.

**Frontend (UI Component):**
1.  **Contact Form Component:** In the React component responsible for creating/editing contacts (e.g., `src/components/forms/ContactForm.js` or `src/pages/People/ContactEditor.js`), verify that there is an input field for the 'Optional Header for Commercial Jobs'. This field should ideally be conditionally rendered based on whether the contact is designated as 'commercial' or associated with a commercial job type.
2.  **Payload Submission:** Ensure that the value from this 'Optional Header' input field is correctly included in the request payload sent to the backend API when creating or updating a contact.

### Affected Files
- `src/server/services/contactService.js`: Review the contact creation/update methods to ensure the 'commercialJobHeader' field is correctly saved and locate the secure data access logging call to implement proper error/data serialization (e.g., `JSON.stringify()`) to prevent `[object Object]` errors.
- `src/server/middleware/securityLogger.js`: If security logging is handled by a dedicated middleware, examine its implementation to ensure it robustly handles and serializes all types of input data, preventing `[object Object]` from being logged for internal errors.
- `src/components/forms/ContactForm.js`: Verify that the 'Optional Header for Commercial Jobs' input field is present, correctly rendered (possibly conditionally), and that its value is properly bound to the component's state and included in the API request payload upon submission.

### Testing Steps
1. Navigate to the /people page and initiate the creation of a new contact.
2. During contact creation, activate the 'commercial job' option (if available) and enter distinct text into the 'Optional Header' field.
3. Save the new contact and verify that the contact is created successfully and the 'Optional Header' content is correctly displayed in the contact details and persisted in the database.
4. Edit an existing contact, toggle its 'commercial job' status, add or modify its 'Optional Header', and save. Verify the update is successful and the header is saved as expected.
5. Monitor server logs to confirm that 'contact secure data access' messages are now logged with proper, detailed information (without `[object Object]`) and that no new logging errors occur.

### AI Confidence
85%

---
*Generated by Unicorn AI Bug Analyzer at 2026-02-06T15:37:00.572Z*
