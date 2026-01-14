---
id: BR-2026-01-14-0001
title: "Users are unable to upload photos for service tickets, receiving a generic 'Upload failed' error."
status: new
severity: high
priority: p1
reported_at: 2026-01-14T11:14:17.423877+00:00
reported_by: Stephe Blansette <stephe@isehome.com>
app: unicorn
area: service
environment:
  url: https://unicorn-one.vercel.app/service/tickets/34552df7-0fc9-4350-83a9-15477f4db6e7
  browser: "Safari 26"
  os: "macOS"
labels: ["api", "network", "security", "error-handling", "safari", "cors", "upload"]
assignee: ""
ai_analysis:
  summary: "Users are unable to upload photos for service tickets, receiving a generic 'Upload failed' error."
  root_cause: "The `ServicePhotosManager`'s upload operation is failing. The generic `[object Object]` error payload suggests that the error handling for the network request (e.g., `fetch` or XHR) is not properly extracting and logging specific error details (such as a `TypeError` for network issues, a `Response` object for HTTP errors, or a custom error from the backend). This could be due to several factors: a misconfigured Cross-Origin Resource Sharing (CORS) policy for the upload endpoint, a restrictive Content Security Policy (CSP), a server-side validation failure that isn't parsed on the client, or a network connectivity issue.  The accompanying `SecurityError: The operation is insecure.` from the `BugReporter` component (when attempting `toDataURL` for a screenshot) indicates a general sensitivity to security contexts (like cross-origin resource handling or canvas tainting) in Safari. While this error is separate from the upload failure itself, it raises a red flag regarding the application's overall security configuration, making a CORS misconfiguration for the photo upload API a highly probable underlying cause, especially given Safari's strict security enforcement. The reported 'Safari 26' is highly likely a misreport, as a modern React app would not function on such an old browser; assuming a modern Safari version is necessary for relevant diagnostics."
  fix_prompt: |
    The primary issue is the `ServicePhotosManager` failing to upload photos, with a generic `[object Object]` error. The `SecurityError` also appearing hints at potential cross-origin or strict security policy issues in Safari. Addressing this requires a multi-pronged approach:
    
    1.  **Improve Error Logging (Client-side):**
        Locate the `uploadPhoto` or similar asynchronous function within the `ServicePhotosManager` component or a related photo upload utility file (e.g., `src/api/photoService.js`). Modify the `catch` block of the API request (e.g., `fetch` or `axios`) to log the full error details more robustly. Instead of `console.error('Upload failed: ', error)`, expand it to `console.error('Photo upload failed during API call:', error.message, error.stack, error);` and specifically check for `response.status` and `response.json()` if the error is an HTTP `Response` object. This will provide clearer diagnostics for future occurrences.
        
        *Conceptual Code Change (JS/TS example for a `fetch` based API call):*
        javascript
        // In src/components/ServiceTickets/ServicePhotosManager.js or src/api/photoService.js
        async function uploadPhoto(file) {
          try {
            // ... (API call setup)
            const response = await fetch('/api/upload-photo', { /* ... */ }); // Replace with your actual endpoint and method
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ message: response.statusText, details: 'Failed to parse error response.' }));
              throw new Error(`Upload failed with status ${response.status}: ${errorData.message}`, { cause: errorData });
            }
            return await response.json();
          } catch (error) {
            console.error('Photo upload failed:', error);
            if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
                console.error('Detailed Error: Likely a network issue, DNS error, or CORS preflight failure.');
            } else if (error.cause && error.cause.details) { // For errors thrown with a 'cause'
                console.error('Detailed Server Response:', error.cause);
            } else if (error.message) {
                console.error('Detailed Error Message:', error.message);
            } else { // Generic catch-all for unknown error objects
                console.error('Unknown error object details:', error);
            }
            throw error; // Re-throw to propagate
          }
        }
        
    
    2.  **Verify CORS Configuration (Backend):**
        On the backend server that handles your photo upload API (e.g., `/api/upload-photo`), ensure that Cross-Origin Resource Sharing (CORS) headers are correctly configured. Specifically, `Access-Control-Allow-Origin` must include `https://unicorn-one.vercel.app` for `POST` requests. Review the backend's CORS middleware or configuration files (e.g., `app.js`, `server.js`, or dedicated CORS configuration file).
    
    3.  **Review Content Security Policy (CSP) (Client & Server):**
        Check the application's `index.html` file (for `<meta http-equiv="Content-Security-Policy">`) and server-sent HTTP headers for any `Content-Security-Policy` directives. Ensure `connect-src` explicitly allows connections to your photo upload API endpoint. Strict CSPs can block network requests, leading to generic fetch errors. If client-side image manipulation (e.g., drawing user-uploaded images to a canvas for preview/resizing) occurs, also ensure `img-src` allows necessary sources and that `script-src` doesn't restrict `toDataURL` if it's used within an inline script context.
  suggested_files:
    - "src/components/ServiceTickets/ServicePhotosManager.js"
    - "src/api/photoService.js"
  confidence: 0.9
---

## Summary

Users are unable to upload photos for service tickets, receiving a generic 'Upload failed' error.

## User Description

Could not upload photo for service tickets

## Steps to Reproduce

1. Navigate to https://unicorn-one.vercel.app/service/tickets/34552df7-0fc9-4350-83a9-15477f4db6e7
2. [Steps from user description need to be extracted manually]

## Expected Result

[To be determined from user description]

## Actual Result

The `ServicePhotosManager`'s upload operation is failing. The generic `[object Object]` error payload suggests that the error handling for the network request (e.g., `fetch` or XHR) is not properly extracting and logging specific error details (such as a `TypeError` for network issues, a `Response` object for HTTP errors, or a custom error from the backend). This could be due to several factors: a misconfigured Cross-Origin Resource Sharing (CORS) policy for the upload endpoint, a restrictive Content Security Policy (CSP), a server-side validation failure that isn't parsed on the client, or a network connectivity issue.

The accompanying `SecurityError: The operation is insecure.` from the `BugReporter` component (when attempting `toDataURL` for a screenshot) indicates a general sensitivity to security contexts (like cross-origin resource handling or canvas tainting) in Safari. While this error is separate from the upload failure itself, it raises a red flag regarding the application's overall security configuration, making a CORS misconfiguration for the photo upload API a highly probable underlying cause, especially given Safari's strict security enforcement. The reported 'Safari 26' is highly likely a misreport, as a modern React app would not function on such an old browser; assuming a modern Safari version is necessary for relevant diagnostics.

## Console Errors

```
[2026-01-14T11:13:48.804Z] [ServicePhotosManager] Upload failed: [object Object]

[2026-01-14T11:13:58.336Z] [BugReporter] Screenshot capture failed: SecurityError: The operation is insecure.
toDataURL@[native code]
@https://unicorn-one.vercel.app/static/js/main.e3a6fd1d.js:2:1071778
```

## Screenshot

![Screenshot](../attachments/BR-2026-01-14-0001/screenshot.jpg)

## AI Analysis

### Root Cause
The `ServicePhotosManager`'s upload operation is failing. The generic `[object Object]` error payload suggests that the error handling for the network request (e.g., `fetch` or XHR) is not properly extracting and logging specific error details (such as a `TypeError` for network issues, a `Response` object for HTTP errors, or a custom error from the backend). This could be due to several factors: a misconfigured Cross-Origin Resource Sharing (CORS) policy for the upload endpoint, a restrictive Content Security Policy (CSP), a server-side validation failure that isn't parsed on the client, or a network connectivity issue.

The accompanying `SecurityError: The operation is insecure.` from the `BugReporter` component (when attempting `toDataURL` for a screenshot) indicates a general sensitivity to security contexts (like cross-origin resource handling or canvas tainting) in Safari. While this error is separate from the upload failure itself, it raises a red flag regarding the application's overall security configuration, making a CORS misconfiguration for the photo upload API a highly probable underlying cause, especially given Safari's strict security enforcement. The reported 'Safari 26' is highly likely a misreport, as a modern React app would not function on such an old browser; assuming a modern Safari version is necessary for relevant diagnostics.

### Suggested Fix

The primary issue is the `ServicePhotosManager` failing to upload photos, with a generic `[object Object]` error. The `SecurityError` also appearing hints at potential cross-origin or strict security policy issues in Safari. Addressing this requires a multi-pronged approach:

1.  **Improve Error Logging (Client-side):**
    Locate the `uploadPhoto` or similar asynchronous function within the `ServicePhotosManager` component or a related photo upload utility file (e.g., `src/api/photoService.js`). Modify the `catch` block of the API request (e.g., `fetch` or `axios`) to log the full error details more robustly. Instead of `console.error('Upload failed: ', error)`, expand it to `console.error('Photo upload failed during API call:', error.message, error.stack, error);` and specifically check for `response.status` and `response.json()` if the error is an HTTP `Response` object. This will provide clearer diagnostics for future occurrences.
    
    *Conceptual Code Change (JS/TS example for a `fetch` based API call):*
    javascript
    // In src/components/ServiceTickets/ServicePhotosManager.js or src/api/photoService.js
    async function uploadPhoto(file) {
      try {
        // ... (API call setup)
        const response = await fetch('/api/upload-photo', { /* ... */ }); // Replace with your actual endpoint and method
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: response.statusText, details: 'Failed to parse error response.' }));
          throw new Error(`Upload failed with status ${response.status}: ${errorData.message}`, { cause: errorData });
        }
        return await response.json();
      } catch (error) {
        console.error('Photo upload failed:', error);
        if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
            console.error('Detailed Error: Likely a network issue, DNS error, or CORS preflight failure.');
        } else if (error.cause && error.cause.details) { // For errors thrown with a 'cause'
            console.error('Detailed Server Response:', error.cause);
        } else if (error.message) {
            console.error('Detailed Error Message:', error.message);
        } else { // Generic catch-all for unknown error objects
            console.error('Unknown error object details:', error);
        }
        throw error; // Re-throw to propagate
      }
    }
    

2.  **Verify CORS Configuration (Backend):**
    On the backend server that handles your photo upload API (e.g., `/api/upload-photo`), ensure that Cross-Origin Resource Sharing (CORS) headers are correctly configured. Specifically, `Access-Control-Allow-Origin` must include `https://unicorn-one.vercel.app` for `POST` requests. Review the backend's CORS middleware or configuration files (e.g., `app.js`, `server.js`, or dedicated CORS configuration file).

3.  **Review Content Security Policy (CSP) (Client & Server):**
    Check the application's `index.html` file (for `<meta http-equiv="Content-Security-Policy">`) and server-sent HTTP headers for any `Content-Security-Policy` directives. Ensure `connect-src` explicitly allows connections to your photo upload API endpoint. Strict CSPs can block network requests, leading to generic fetch errors. If client-side image manipulation (e.g., drawing user-uploaded images to a canvas for preview/resizing) occurs, also ensure `img-src` allows necessary sources and that `script-src` doesn't restrict `toDataURL` if it's used within an inline script context.

### Affected Files
- `src/components/ServiceTickets/ServicePhotosManager.js`: Improve error handling within the `uploadPhoto` function to log detailed network and server response errors.
- `src/api/photoService.js`: If API calls are abstracted into a separate service, update the photo upload function there to provide more descriptive error logging.

### Testing Steps
1. Navigate to a service ticket details page (e.g., https://unicorn-one.vercel.app/service/tickets/34552df7-0fc9-4350-83a9-15477f4db6e7) in Safari on macOS.
2. Attempt to upload a new photo for the service ticket.
3. Verify that the photo uploads successfully and is displayed on the ticket without errors.
4. If the upload still fails, carefully examine the browser console for the *new, detailed* error messages provided by the improved logging to pinpoint the exact underlying issue (e.g., 'Network Error', 'CORS Error', 'Server responded with...', 'Validation failed: XYZ').
5. Test photo uploads in another supported browser (e.g., Chrome, Firefox) to ensure no regressions and to see if the issue is Safari-specific.

### AI Confidence
90%

---
*Generated by Unicorn AI Bug Analyzer at 2026-01-14T11:16:17.685Z*
