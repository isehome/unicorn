---
id: BR-2026-02-23-0001
title: "Add a manual hour logging section to the Technician Project Details page"
status: new
severity: medium
priority: p2
reported_at: 2026-02-23T20:56:18.818474+00:00
reported_by: Stephe Blansette <stephe@isehome.com>
app: unicorn
area: projects
environment:
  url: https://unicorn-one.vercel.app/project/af691f5d-158c-4795-a33b-05eb7c16348b
  browser: "Safari 26"
  os: "macOS 10.15"
labels: ["ui", "feature-request", "projects", "auth"]
assignee: ""
ai_analysis:
  summary: "Add a manual hour logging section to the Technician Project Details page"
  root_cause: "The Technician Project Detail page currently lacks a UI component and associated state/API logic to allow technicians to manually input and record their labor hours. Additionally, console errors indicate an 'Authorization header' issue when fetching Lucid data, which may be the service intended to handle this data."
  fix_prompt: |
    1. Create a new component `TimeLogSection` that follows the existing accordion/card UI pattern seen in the screenshot.
    2. Add this component to the project details view (likely `src/pages/ProjectDetail.js` or a similar component). 
    3. The section should include a form with fields for 'Date', 'Hours Worked', and 'Description/Notes', along with a 'Submit' button.
    4. Implement a list view within this section to display previously logged hours for the project.
    5. Ensure the API request to save hours includes the correct Authorization header, as the console logs show 'Missing or malformed Authorization header' errors occurring on this page.
    6. Update the project data fetching logic to include these manual logs.
  suggested_files:
    - "src/pages/ProjectDetail.js:150"
    - "src/components/projects/TimeLogSection.js:1"
    - "src/services/api.js:45"
  confidence: 0.9
---

## Summary

Add a manual hour logging section to the Technician Project Details page

## User Description

need a section inside the technician project details that allows technicians to manually log their hours.

## Steps to Reproduce

1. Navigate to https://unicorn-one.vercel.app/project/af691f5d-158c-4795-a33b-05eb7c16348b
2. [Steps from user description need to be extracted manually]

## Expected Result

[To be determined from user description]

## Actual Result

The Technician Project Detail page currently lacks a UI component and associated state/API logic to allow technicians to manually input and record their labor hours. Additionally, console errors indicate an 'Authorization header' issue when fetching Lucid data, which may be the service intended to handle this data.

## Console Errors

```
[2026-02-23T20:51:54.775Z] Failed to fetch Lucid data: Error: Missing or malformed Authorization header
@https://unicorn-one.vercel.app/static/js/5763.e12c8b65.chunk.js:1:3093

[2026-02-23T20:52:02.627Z] Failed to fetch Lucid data: Error: Missing or malformed Authorization header
@https://unicorn-one.vercel.app/static/js/5763.e12c8b65.chunk.js:1:3093
```

## Screenshot

![Screenshot](../attachments/BR-2026-02-23-0001/screenshot.jpg)

## AI Analysis

### Root Cause
The Technician Project Detail page currently lacks a UI component and associated state/API logic to allow technicians to manually input and record their labor hours. Additionally, console errors indicate an 'Authorization header' issue when fetching Lucid data, which may be the service intended to handle this data.

### Suggested Fix

1. Create a new component `TimeLogSection` that follows the existing accordion/card UI pattern seen in the screenshot.
2. Add this component to the project details view (likely `src/pages/ProjectDetail.js` or a similar component). 
3. The section should include a form with fields for 'Date', 'Hours Worked', and 'Description/Notes', along with a 'Submit' button.
4. Implement a list view within this section to display previously logged hours for the project.
5. Ensure the API request to save hours includes the correct Authorization header, as the console logs show 'Missing or malformed Authorization header' errors occurring on this page.
6. Update the project data fetching logic to include these manual logs.

### Affected Files
- `src/pages/ProjectDetail.js` (line 150): Import and add the new TimeLogSection component to the list of project detail accordions.
- `src/components/projects/TimeLogSection.js` (line 1): Create this new component to handle the UI for manual hour entry and display.
- `src/services/api.js` (line 45): Investigate and fix the Authorization header logic for 'Lucid' data fetches to prevent the 401/403 errors seen in the console.

### Testing Steps
1. Navigate to a project detail page (e.g., /project/af691f5d-158c-4795-a33b-05eb7c16348b).
2. Verify that a new 'Time Logs' section appears in the list of project details.
3. Expand the section and fill out the manual log form (Date: Today, Hours: 4, Note: 'Testing').
4. Click 'Submit' and verify the log appears in the list and the console shows no Authorization errors.
5. Refresh the page to ensure the logged hours persist.

### AI Confidence
90%

---
*Generated by Unicorn AI Bug Analyzer at 2026-02-23T20:57:36.364Z*
