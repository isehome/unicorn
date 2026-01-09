---
id: BR-2026-01-09-0003
title: "Users are unable to import CSV files on the Admin Skills page, encountering a generic 'TypeError: Load failed' error."
status: new
severity: critical
priority: p0
reported_at: 2026-01-09T11:23:28.956367+00:00
reported_by: Stephe Blansette <stephe@isehome.com>
app: unicorn
area: admin
environment:
  url: https://unicorn-one.vercel.app/admin
  browser: "Safari 26"
  os: "macOS 10.15"
labels: ["api", "error-handling", "network", "safari", "file-upload", "admin"]
assignee: ""
ai_analysis:
  summary: "Users are unable to import CSV files on the Admin Skills page, encountering a generic 'TypeError: Load failed' error."
  root_cause: "The CSV import functionality, likely handled by the `SkillsManager` module, is failing during a network request (e.g., an API call to upload the CSV data). In Safari, low-level network failures (such as a CORS policy violation, inability to connect to the server, or an invalid request configuration) often manifest as a generic `TypeError: Load failed`. The current error handling within `SkillsManager` catches this error but logs the raw error object as `[object Object]`, obscuring the specific details of the underlying network problem."
  fix_prompt: |
    1. **Improve Error Logging:** Locate the `importCsv` or similar function within the `SkillsManager` module (e.g., `src/modules/skills/SkillsManager.js`). Enhance the error handling (specifically the `catch` block for network requests) to log the full error details (e.g., `error.message`, `error.name`, `error.stack`, and if applicable, `response.status`, `response.statusText`, and `response.json()` for HTTP errors). This will provide more clarity on the exact network issue.
    2. **Inspect Network Request in Safari Dev Tools:** Replicate the bug using Safari's developer tools. Open the 'Network' tab and observe the request made when attempting to import the CSV. Look for any failed requests, their status codes, and specific browser-reported errors (e.g., CORS preflight failures).
    3. **Verify CORS Configuration:** If the network request shows a CORS error, ensure that the backend API endpoint responsible for handling CSV imports (e.g., `/api/admin/skills/import`) has the appropriate `Access-Control-Allow-Origin` headers configured to permit requests from `https://unicorn-one.vercel.app`.
  suggested_files:
    - "src/modules/skills/SkillsManager.js:-1"
    - "src/api/adminApi.js:-1"
    - "backend/src/controllers/skillsController.js:-1"
  confidence: 0.9
---

## Summary

Users are unable to import CSV files on the Admin Skills page, encountering a generic 'TypeError: Load failed' error.

## User Description

I get this error when importing CVS files; TypeError: Load failed

## Steps to Reproduce

1. Navigate to https://unicorn-one.vercel.app/admin
2. [Steps from user description need to be extracted manually]

## Expected Result

[To be determined from user description]

## Actual Result

The CSV import functionality, likely handled by the `SkillsManager` module, is failing during a network request (e.g., an API call to upload the CSV data). In Safari, low-level network failures (such as a CORS policy violation, inability to connect to the server, or an invalid request configuration) often manifest as a generic `TypeError: Load failed`. The current error handling within `SkillsManager` catches this error but logs the raw error object as `[object Object]`, obscuring the specific details of the underlying network problem.

## Console Errors

```
[2026-01-08T16:19:11.969Z] [SkillsManager] Load failed: [object Object]

[2026-01-08T16:19:12.063Z] [SkillsManager] Load failed: [object Object]

[2026-01-08T16:34:44.117Z] [SkillsManager] Load failed: [object Object]

[2026-01-09T11:23:01.303Z] [BugReporter] Submit failed: [object Object]

[2026-01-09T11:23:09.730Z] [BugReporter] Submit failed: [object Object]
```

## Screenshot

![Screenshot](../attachments/BR-2026-01-09-0003/screenshot.jpg)

## AI Analysis

### Root Cause
The CSV import functionality, likely handled by the `SkillsManager` module, is failing during a network request (e.g., an API call to upload the CSV data). In Safari, low-level network failures (such as a CORS policy violation, inability to connect to the server, or an invalid request configuration) often manifest as a generic `TypeError: Load failed`. The current error handling within `SkillsManager` catches this error but logs the raw error object as `[object Object]`, obscuring the specific details of the underlying network problem.

### Suggested Fix

1. **Improve Error Logging:** Locate the `importCsv` or similar function within the `SkillsManager` module (e.g., `src/modules/skills/SkillsManager.js`). Enhance the error handling (specifically the `catch` block for network requests) to log the full error details (e.g., `error.message`, `error.name`, `error.stack`, and if applicable, `response.status`, `response.statusText`, and `response.json()` for HTTP errors). This will provide more clarity on the exact network issue.
2. **Inspect Network Request in Safari Dev Tools:** Replicate the bug using Safari's developer tools. Open the 'Network' tab and observe the request made when attempting to import the CSV. Look for any failed requests, their status codes, and specific browser-reported errors (e.g., CORS preflight failures).
3. **Verify CORS Configuration:** If the network request shows a CORS error, ensure that the backend API endpoint responsible for handling CSV imports (e.g., `/api/admin/skills/import`) has the appropriate `Access-Control-Allow-Origin` headers configured to permit requests from `https://unicorn-one.vercel.app`.

### Affected Files
- `src/modules/skills/SkillsManager.js` (line -1): Locate the `importCsv` or similar function responsible for handling CSV uploads. Modify its `try...catch` block to log more detailed error information, specifically for `TypeError` instances that might originate from `fetch` or `XMLHttpRequest` failures. Ensure the full error object's properties are logged (e.g., `console.error('CSV import failed:', error.name, error.message, error);`).
- `src/api/adminApi.js` (line -1): If the `SkillsManager` delegates to a separate API client, ensure the `importSkillsCsv` or similar function here also has robust error handling and logs full details for network-related errors.
- `backend/src/controllers/skillsController.js` (line -1): Verify the server-side CORS configuration for the CSV import endpoint. Ensure it allows requests from the frontend origin. Also, check server logs for any errors occurring when the client attempts to upload the file, even if the client sees a generic network error.

### Testing Steps
1. 1. Navigate to https://unicorn-one.vercel.app/admin in Safari (preferably a version close to 15.6.1 if 'Safari 26' was a typo).
2. 2. Go to the 'Skills' tab.
3. 3. Click 'Import CSV' and attempt to upload a valid CSV file.
4. 4. Verify that the import completes successfully without error messages in the UI.
5. 5. Check the browser's developer console for any new errors or improved error logs that specifically detail the cause of the `TypeError: Load failed` if the issue persists.

### AI Confidence
90%

---
*Generated by Unicorn AI Bug Analyzer at 2026-01-09T11:25:29.097Z*
