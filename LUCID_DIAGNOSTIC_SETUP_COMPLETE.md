# Lucid Charts API Diagnostic Setup - Complete ✅

## Overview
The Lucid Charts diagnostic page has been enhanced with multiple display methods and comprehensive testing capabilities. The page is easily accessible via the QR code button in the bottom navigation bar.

## Important: Lucid Embed Methods

The diagnostic page supports three embed methods:
1. **Token-based embed**: No public share required BUT needs API permissions for `POST /embeds/token` endpoint (may return 403 if not available in your Lucid plan)
2. **Cookie-based embed**: Works for users already signed into Lucid with document access (no API required)
3. **Public embed**: Optional, only if you explicitly want public visibility

**Note:** If you're getting a 403 error for token-based embeds, your API key may not have permission to generate embed tokens. This is a limitation of some Lucid plans. Use cookie-based or public embeds as alternatives.

## What's Been Implemented

### 1. Enhanced Diagnostic Page (`/lucid-test`)
- **Location**: `src/components/LucidDiagnostic.js`
- **Access**: Click the QR code button in the bottom navigation bar
- **Features**:
  - Document ID extraction from Lucid URLs
  - Metadata fetching
  - Contents fetching
  - Individual page PNG download testing
  - Multiple display methods:
    - **PNG Display** (API-based image export)
    - **Iframe Embed with 3 options**:
      - Token-based (no public share needed!)
      - Cookie-based (uses existing Lucid session)
      - Public (only if explicitly shared)

### 2. LucidImageDisplay Component
- **Location**: `src/components/LucidImageDisplay.js`
- **Purpose**: Display Lucid charts as PNG images using the API
- **Features**:
  - Automatic page loading
  - Multi-page navigation
  - Download button for current page
  - Refresh functionality
  - DPI configuration for quality/size balance

### 3. Enhanced LucidIframeEmbed Component
- **Location**: `src/components/LucidIframeEmbed.js`
- **Purpose**: Display Lucid charts in iframes with multiple authentication methods
- **Three Embed Methods**:
  1. **Token-based**: Auto-generates temporary access tokens (no public share required!)
  2. **Cookie-based**: Uses viewer's existing Lucid session
  3. **Public**: For explicitly shared documents

### 3. Working API Proxy
- **Location**: `api/lucid-proxy.js`
- **Endpoint**: `/api/lucid-proxy`
- **Fixed Issues**:
  - ✅ Correct export endpoint: `GET /documents/{id}?pageId={pageId}`
  - ✅ Proper Accept header with DPI: `image/png;dpi=72`
  - ✅ Base64 image encoding working

## How to Test

### Step 1: Access the Diagnostic Page
1. Open the app
2. Click the **QR Code** button in the bottom navigation bar (labeled "Lucid Test")

### Step 2: Test Basic API Connectivity
1. Enter a Lucid Chart URL (format: `https://lucid.app/lucidchart/YOUR-DOC-ID/edit`)
2. Click **Extract ID** - Should extract and display the document ID
3. Click **Fetch Metadata** - Should retrieve document title and page info
4. Click **Fetch Contents** - Should retrieve page data and shapes

### Step 3: Test PNG Export
1. After fetching contents, you'll see a list of pages
2. Click **Download PNG** on any page
3. The browser should download a PNG image of that page
4. Check if it's an actual image or a placeholder

### Step 4: Test Display Methods
After extracting a document ID, multiple display options become available:

#### Option 1: PNG Display (API-based)
- Click **Show PNG Display**
- The chart loads as PNG images via the API
- Navigate between pages if multiple exist
- Use download button to save current page

#### Option 2: Iframe Embed (Three Methods)
- Click **Show Iframe Embed**
- Select embed method from dropdown:
  - **Token** (Recommended): No public share or login required!
  - **Cookie**: Works if user has Lucid access
  - **Public**: Only if document is publicly shared

## Current Status

### ✅ Working
- Document ID extraction
- Metadata fetching
- Contents fetching  
- PNG export via proxy (with proper DPI header)
- PNG display component
- Download functionality
- Navigation to diagnostic page via QR button

### ⚠️ Notes & Common Issues

#### 403 Forbidden Error for Embed Tokens
If you're getting a 403 error when generating embed tokens, this means your API key doesn't have permission for the `/embeds/token` endpoint. This is common with:
- Free Lucid accounts
- Basic/Standard plans
- API keys with limited scopes

**Workarounds:**
1. Use **cookie-based embeds** - Works if users have Lucid accounts with access
2. Use **PNG export** - If your API supports image export
3. Share the document publicly (last resort)

#### Other Limitations
- PNG export requires API key with export permissions
- Token-based embeds require premium API access
- Cookie-based embeds work without any API, using existing Lucid sessions
- Some Lucid plans limit or don't include API access

## Environment Variables Required
```env
# In .env.local or Vercel environment
LUCID_API_TOKEN=your_api_token_here
```

## Troubleshooting Guide

### 403 Forbidden Errors

**For Embed Tokens:**
- Your API key lacks permission for `/embeds/token`
- Solution: Use cookie-based embeds instead
- Alternative: Upgrade Lucid plan or request API permissions

**For Document Access:**
- The API key doesn't have access to the specific document
- Solution: Ensure the API key owner has access to the document

### PNG Export Not Working

1. **Check API Response**:
   - Open browser console (F12)
   - Look for "Image data URL details" logs
   - Check if receiving actual image data or placeholder

2. **Verify API Key Permissions**:
   - Ensure API key has export permissions
   - Some plans don't include image export API

3. **Test Different Documents**:
   - Try various Lucid documents
   - Simpler documents may work better

4. **Monitor Network Tab**:
   - Check the `/api/lucid-proxy` requests
   - Look for any 4xx or 5xx errors
   - Verify Accept header includes DPI

### Working Alternatives

If API features are limited:
1. **Cookie-based embeds** - Best for internal teams with Lucid accounts
2. **Direct Lucid links** - Open charts in Lucid directly
3. **Manual exports** - Export from Lucid UI and host images separately

## Usage in Other Components

### PNG Display Component:

```jsx
import LucidImageDisplay from './components/LucidImageDisplay';

<LucidImageDisplay 
  documentId="your-document-id-or-url"
  title="My Lucid Chart"
  height="600px"
  dpi={96}  // Higher for better quality
/>
```

### Iframe Embed Component:

```jsx
import LucidIframeEmbed from './components/LucidIframeEmbed';

// Token-based (no public share needed!)
<LucidIframeEmbed 
  documentId="your-document-id"
  title="My Chart"
  embedMethod="token"
/>

// Cookie-based (for users with Lucid access)
<LucidIframeEmbed 
  documentId="your-document-id"
  title="My Chart"
  embedMethod="cookie"
/>

// Public (only if explicitly shared)
<LucidIframeEmbed 
  documentId="your-document-id"
  title="My Chart"
  embedMethod="public"
/>
```

## Support

The diagnostic page provides comprehensive testing and debugging capabilities. Use it to:
- Verify API connectivity
- Test different documents
- Compare display methods
- Download charts for offline use

All diagnostic results are displayed with detailed error messages to help identify and resolve issues.
