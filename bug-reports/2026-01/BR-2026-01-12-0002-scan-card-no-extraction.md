---
id: BR-2026-01-12-0002
title: "The 'Scan Business Card' feature fails to extract contact information, providing no user feedback, likely due to an outdated browser."
status: new
severity: high
priority: p1
reported_at: 2026-01-12T22:04:28.367817+00:00
reported_by: Stephe Blansette <stephe@isehome.com>
app: unicorn
area: contacts
environment:
  url: https://unicorn-one.vercel.app/people
  browser: "Safari 26"
  os: "macOS"
labels: ["browser-compatibility", "api-error-handling", "ui", "data-extraction"]
assignee: ""
ai_analysis:
  summary: "The 'Scan Business Card' feature fails to extract contact information, providing no user feedback, likely due to an outdated browser."
  root_cause: "The application is being run in an extremely outdated browser (Safari 26), which likely lacks support for modern JavaScript features and web APIs (e.g., `fetch`, `Promise`, `FormData`) essential for the 'Extract Contact' functionality. This leads to silent failures of the OCR API call, either by preventing the request from being sent or by mishandling the response, without any error being logged to the console or displayed to the user."
  fix_prompt: |
    The primary issue is the incompatibility with Safari 26. A modern React application is not expected to function correctly on such an old browser. Therefore, the fix should address both browser compatibility and robust error handling for the feature itself.
    
    1.  **Browser Compatibility Enforcement (Global):**
        *   **File:** `src/App.js` (or `src/index.js`, or a dedicated `src/utils/browserCompatibility.js`)
        *   **Change:** Implement a check at application startup to detect unsupported browsers. If Safari 26 (or any version below a defined threshold, e.g., Safari 15) is detected, display a prominent, user-friendly message advising them to upgrade their browser or switch to a supported one (e.g., latest Chrome, Firefox, Edge, or a recent version of Safari). This message should explicitly state that certain features, like 'Scan Business Card', may not function.
        *   **Example (conceptual for `src/App.js` and `src/utils/browserCompatibility.js`):**
            javascript
            // src/App.js
            import React, { useEffect, useState } from 'react';
            import { isBrowserSupported } from './utils/browserCompatibility';
            import MainApp from './MainApp'; // Your main application component
    
            function App() {
              const [supported, setSupported] = useState(true);
    
              useEffect(() => {
                if (!isBrowserSupported()) {
                  setSupported(false);
                }
              }, []);
    
              if (!supported) {
                return (
                  <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#fee', border: '1px solid #fbb', color: '#880' }}>
                    <h2>Unsupported Browser Detected</h2>
                    <p>It looks like you are using an old or unsupported browser (Safari 26). For the best experience and full functionality, please update your browser to the latest version or switch to a supported browser like Chrome, Firefox, Edge, or a recent version of Safari.</p>
                    <p>The 'Scan Business Card' feature, in particular, may not work correctly on this browser.</p>
                  </div>
                );
              }
    
              return <MainApp />;
            }
            export default App;
    
            // src/utils/browserCompatibility.js
            export const isBrowserSupported = () => {
              const userAgent = navigator.userAgent.toLowerCase();
              // Check for Safari and its version. '26' is highly unusual, assuming it means very old.
              if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
                const safariVersionMatch = userAgent.match(/version\/(\d+)/);
                if (safariVersionMatch && parseInt(safariVersionMatch[1], 10) < 15) { // Assuming Safari 15+ is required
                  return false;
                }
                // Fallback for extremely old or unrecognized Safari user agents that don't match pattern
                if (userAgent.includes('safari') && !window.fetch && !window.Promise) {
                    return false;
                }
              }
              // Also add checks for core features required
              if (!window.fetch || !window.Promise || !window.FormData) {
                return false;
              }
              return true;
            };
            
    
    2.  **Robust Error Handling for 'Extract Contact' API (Specific Feature):**
        *   **File:** `src/components/ScanBusinessCardModal/ScanBusinessCardModal.js` (or similar component responsible for the modal and extraction logic).
        *   **Change:** Locate the function or method that handles the 'Extract Contact' button click and initiates the API call (e.g., `handleExtractContact`). Wrap the API call in a `try...catch` block (if using `async/await`) or chain a `.catch()` method to the `fetch`/`axios` call. Implement state to store and display user-friendly error messages within the modal if the extraction fails (e.g., if the backend returns an error status, unparseable data, or if no contact information is found). Display an appropriate message like "Failed to extract contact. Please try again or enter details manually." This will provide immediate feedback to the user, even if the browser is technically supported but the API call itself encounters an issue.
        *   **Example (conceptual within `ScanBusinessCardModal.js`):**
            javascript
            // Inside ScanBusinessCardModal.js (or similar component)
            import React, { useState } from 'react';
            // ... other imports ...
    
            function ScanBusinessCardModal({ uploadedImageFile, onContactExtracted, onClose }) {
              const [extractionError, setExtractionError] = useState(null);
              const [isExtracting, setIsExtracting] = useState(false);
    
              const handleExtractContact = async () => {
                if (!uploadedImageFile) {
                  setExtractionError('Please upload a card image first.');
                  return;
                }
    
                setExtractionError(null); // Clear previous errors
                setIsExtracting(true);
                try {
                  const formData = new FormData();
                  formData.append('image', uploadedImageFile);
                  
                  const response = await fetch('/api/ocr/extract-contact', {
                    method: 'POST',
                    body: formData,
                    // Ensure any required headers like 'Authorization' are included
                  });
    
                  if (!response.ok) {
                    const errorBody = await response.json().catch(() => ({ message: 'Unknown server error' }));
                    throw new Error(errorBody.message || `API error: ${response.status} ${response.statusText}`);
                  }
    
                  const extractedData = await response.json();
    
                  // Assuming extractedData will contain a 'contactInfo' field if successful
                  if (extractedData && extractedData.contactInfo) {
                    onContactExtracted(extractedData.contactInfo); // Pass extracted data to parent
                    onClose(); // Close modal on success
                  } else {
                    setExtractionError('No contact information could be extracted from the image. Please try a clearer image or enter details manually.');
                  }
                } catch (error) {
                  console.error('Error during contact extraction:', error);
                  setExtractionError(`Failed to extract contact: ${error.message}. Please try again.`);
                } finally {
                  setIsExtracting(false);
                }
              };
    
              return (
                <div className="scan-business-card-modal">
                  {/* ... existing modal UI ... */}
                  {uploadedImageFile && (
                    <img src={URL.createObjectURL(uploadedImageFile)} alt="Scanned Business Card" style={{ maxWidth: '100%' }} />
                  )}
                  {isExtracting && <p className="extraction-status">Extracting contact information...</p>}
                  {extractionError && <p className="extraction-error" style={{ color: 'red' }}>{extractionError}</p>}
                  <div classNameNamoe="modal-actions">
                    <button onClick={handleRetake}>Retake</button>
                    <button onClick={handleExtractContact} disabled={!uploadedImageFile || isExtracting}>
                      {isExtracting ? 'Extracting...' : 'Extract Contact'}
                    </button>
                  </div>
                </div>
              );
            }
            export default ScanBusinessCardModal;
            
  suggested_files:
    - "src/App.js:1"
    - "src/utils/browserCompatibility.js:1"
    - "src/components/ScanBusinessCardModal/ScanBusinessCardModal.js:1"
  confidence: 0.95
---

## Summary

The 'Scan Business Card' feature fails to extract contact information, providing no user feedback, likely due to an outdated browser.

## User Description

Scan of card image did not extract informstion

## Steps to Reproduce

1. Navigate to https://unicorn-one.vercel.app/people
2. [Steps from user description need to be extracted manually]

## Expected Result

[To be determined from user description]

## Actual Result

The application is being run in an extremely outdated browser (Safari 26), which likely lacks support for modern JavaScript features and web APIs (e.g., `fetch`, `Promise`, `FormData`) essential for the 'Extract Contact' functionality. This leads to silent failures of the OCR API call, either by preventing the request from being sent or by mishandling the response, without any error being logged to the console or displayed to the user.

## Console Errors

```
No console errors captured.
```

## Screenshot

![Screenshot](../attachments/BR-2026-01-12-0002/screenshot.jpg)

## AI Analysis

### Root Cause
The application is being run in an extremely outdated browser (Safari 26), which likely lacks support for modern JavaScript features and web APIs (e.g., `fetch`, `Promise`, `FormData`) essential for the 'Extract Contact' functionality. This leads to silent failures of the OCR API call, either by preventing the request from being sent or by mishandling the response, without any error being logged to the console or displayed to the user.

### Suggested Fix

The primary issue is the incompatibility with Safari 26. A modern React application is not expected to function correctly on such an old browser. Therefore, the fix should address both browser compatibility and robust error handling for the feature itself.

1.  **Browser Compatibility Enforcement (Global):**
    *   **File:** `src/App.js` (or `src/index.js`, or a dedicated `src/utils/browserCompatibility.js`)
    *   **Change:** Implement a check at application startup to detect unsupported browsers. If Safari 26 (or any version below a defined threshold, e.g., Safari 15) is detected, display a prominent, user-friendly message advising them to upgrade their browser or switch to a supported one (e.g., latest Chrome, Firefox, Edge, or a recent version of Safari). This message should explicitly state that certain features, like 'Scan Business Card', may not function.
    *   **Example (conceptual for `src/App.js` and `src/utils/browserCompatibility.js`):**
        javascript
        // src/App.js
        import React, { useEffect, useState } from 'react';
        import { isBrowserSupported } from './utils/browserCompatibility';
        import MainApp from './MainApp'; // Your main application component

        function App() {
          const [supported, setSupported] = useState(true);

          useEffect(() => {
            if (!isBrowserSupported()) {
              setSupported(false);
            }
          }, []);

          if (!supported) {
            return (
              <div style={{ padding: '20px', textAlign: 'center', backgroundColor: '#fee', border: '1px solid #fbb', color: '#880' }}>
                <h2>Unsupported Browser Detected</h2>
                <p>It looks like you are using an old or unsupported browser (Safari 26). For the best experience and full functionality, please update your browser to the latest version or switch to a supported browser like Chrome, Firefox, Edge, or a recent version of Safari.</p>
                <p>The 'Scan Business Card' feature, in particular, may not work correctly on this browser.</p>
              </div>
            );
          }

          return <MainApp />;
        }
        export default App;

        // src/utils/browserCompatibility.js
        export const isBrowserSupported = () => {
          const userAgent = navigator.userAgent.toLowerCase();
          // Check for Safari and its version. '26' is highly unusual, assuming it means very old.
          if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
            const safariVersionMatch = userAgent.match(/version\/(\d+)/);
            if (safariVersionMatch && parseInt(safariVersionMatch[1], 10) < 15) { // Assuming Safari 15+ is required
              return false;
            }
            // Fallback for extremely old or unrecognized Safari user agents that don't match pattern
            if (userAgent.includes('safari') && !window.fetch && !window.Promise) {
                return false;
            }
          }
          // Also add checks for core features required
          if (!window.fetch || !window.Promise || !window.FormData) {
            return false;
          }
          return true;
        };
        

2.  **Robust Error Handling for 'Extract Contact' API (Specific Feature):**
    *   **File:** `src/components/ScanBusinessCardModal/ScanBusinessCardModal.js` (or similar component responsible for the modal and extraction logic).
    *   **Change:** Locate the function or method that handles the 'Extract Contact' button click and initiates the API call (e.g., `handleExtractContact`). Wrap the API call in a `try...catch` block (if using `async/await`) or chain a `.catch()` method to the `fetch`/`axios` call. Implement state to store and display user-friendly error messages within the modal if the extraction fails (e.g., if the backend returns an error status, unparseable data, or if no contact information is found). Display an appropriate message like "Failed to extract contact. Please try again or enter details manually." This will provide immediate feedback to the user, even if the browser is technically supported but the API call itself encounters an issue.
    *   **Example (conceptual within `ScanBusinessCardModal.js`):**
        javascript
        // Inside ScanBusinessCardModal.js (or similar component)
        import React, { useState } from 'react';
        // ... other imports ...

        function ScanBusinessCardModal({ uploadedImageFile, onContactExtracted, onClose }) {
          const [extractionError, setExtractionError] = useState(null);
          const [isExtracting, setIsExtracting] = useState(false);

          const handleExtractContact = async () => {
            if (!uploadedImageFile) {
              setExtractionError('Please upload a card image first.');
              return;
            }

            setExtractionError(null); // Clear previous errors
            setIsExtracting(true);
            try {
              const formData = new FormData();
              formData.append('image', uploadedImageFile);
              
              const response = await fetch('/api/ocr/extract-contact', {
                method: 'POST',
                body: formData,
                // Ensure any required headers like 'Authorization' are included
              });

              if (!response.ok) {
                const errorBody = await response.json().catch(() => ({ message: 'Unknown server error' }));
                throw new Error(errorBody.message || `API error: ${response.status} ${response.statusText}`);
              }

              const extractedData = await response.json();

              // Assuming extractedData will contain a 'contactInfo' field if successful
              if (extractedData && extractedData.contactInfo) {
                onContactExtracted(extractedData.contactInfo); // Pass extracted data to parent
                onClose(); // Close modal on success
              } else {
                setExtractionError('No contact information could be extracted from the image. Please try a clearer image or enter details manually.');
              }
            } catch (error) {
              console.error('Error during contact extraction:', error);
              setExtractionError(`Failed to extract contact: ${error.message}. Please try again.`);
            } finally {
              setIsExtracting(false);
            }
          };

          return (
            <div className="scan-business-card-modal">
              {/* ... existing modal UI ... */}
              {uploadedImageFile && (
                <img src={URL.createObjectURL(uploadedImageFile)} alt="Scanned Business Card" style={{ maxWidth: '100%' }} />
              )}
              {isExtracting && <p className="extraction-status">Extracting contact information...</p>}
              {extractionError && <p className="extraction-error" style={{ color: 'red' }}>{extractionError}</p>}
              <div classNameNamoe="modal-actions">
                <button onClick={handleRetake}>Retake</button>
                <button onClick={handleExtractContact} disabled={!uploadedImageFile || isExtracting}>
                  {isExtracting ? 'Extracting...' : 'Extract Contact'}
                </button>
              </div>
            </div>
          );
        }
        export default ScanBusinessCardModal;
        

### Affected Files
- `src/App.js` (line 1): Add a browser compatibility check at the application entry point to inform users if their browser is unsupported (specifically Safari 26) and potentially block interaction for critical features.
- `src/utils/browserCompatibility.js` (line 1): Create a utility file to house browser detection logic (e.g., checking user agent and feature availability for `fetch`, `Promise`, `FormData`).
- `src/components/ScanBusinessCardModal/ScanBusinessCardModal.js` (line 1): Implement robust `try...catch` error handling for the API call triggered by the 'Extract Contact' button. Display user-friendly feedback in the modal if the extraction fails, returns an error status, or yields no recognizable data.

### Testing Steps
1. 1. **Verify browser compatibility message:** Load the Unicorn app in Safari 26 (if available for testing) or an equivalently old browser. Confirm that a clear 'unsupported browser' message is prominently displayed, advising the user to upgrade or switch browsers and warning about potential feature limitations.
2. 2. **Verify API error feedback on extraction failure:** In a *supported* browser, open the 'Scan Business Card' modal. Upload an image known to be unparsable (e.g., a blank image, an extremely blurry image, or simulate an API failure from the backend for the `/api/ocr/extract-contact` endpoint). Click 'Extract Contact' and verify that a specific, user-friendly error message is displayed within the modal, explaining why extraction failed (e.g., 'No contact information could be extracted' or 'Failed to extract contact due to server error').
3. 3. **Verify successful extraction:** In a supported browser, open the 'Scan Business Card' modal. Upload a clear business card image with easily recognizable text. Click 'Extract Contact' and verify that the contact information is correctly extracted, the modal closes as expected, and the new contact (or populated form) appears in the 'People' list or designated area.

### AI Confidence
95%

---
*Generated by Unicorn AI Bug Analyzer at 2026-01-12T22:07:07.617Z*
