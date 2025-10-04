# Lucid Chart Carousel - Complete System Analysis

## Current Architecture Overview

### 1. Request Flow (As Designed)
```
1. User visits project page with lucid_chart_url
2. LucidChartCarousel component mounts
3. Extract document ID from URL
4. Fetch document contents (page list) from Lucid API
5. For each page:
   a. Check Supabase cache table for existing image
   b. If cached and not expired, return Supabase storage URL
   c. If not cached:
      - Call Lucid API to export page as PNG
      - Upload blob to Supabase storage
      - Save cache entry in database
      - Return public URL
6. Display images in carousel
```

## Identified Issues

### 1. **Environment Variables in Browser**
- `process.env.REACT_APP_LUCID_API_KEY` is only available after build/restart
- Browser can't access API key if not properly loaded
- **Solution**: Verify with `console.log(process.env.REACT_APP_LUCID_API_KEY)` in browser console

### 2. **CORS and Direct API Calls**
- Browser making direct calls to Lucid API (`https://api.lucid.co`)
- Lucid API might block CORS requests from localhost
- **Current Code**: `exportDocumentPage` in `lucidApi.js` makes direct fetch
- **Issue**: This will fail in browser due to CORS

### 3. **Supabase Storage Setup**
- The snippet errors suggest SQL editor issues, not necessarily our SQL
- Storage bucket might not be created properly
- Storage policies might not be applied correctly

### 4. **API Proxy for Production**
- We have `/api/lucid-proxy.js` for production
- In development, we're trying direct calls (which fail due to CORS)

## Simplified Approach

### Option 1: Use Proxy in Development Too
Instead of direct API calls, always use the proxy:

```javascript
// lucidApi.js - Always use proxy
export const exportDocumentPage = async (documentId, pageNumber) => {
  const response = await fetch('/api/lucid-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      action: 'exportPage',
      documentId, 
      pageNumber 
    })
  });
  return await response.blob();
};
```

### Option 2: Serverless Function Approach
Create a Vercel/Netlify function to handle all Lucid API calls:
- Keeps API key secure on server
- No CORS issues
- Handles caching server-side

### Option 3: Direct Base64 Embedding (Simplest)
Skip Supabase storage entirely for now:
1. Fetch image from API (through proxy)
2. Convert to base64
3. Display directly in img tag
4. Cache in localStorage or memory

## Debugging Steps

### 1. Check API Key Access
```javascript
// In browser console
console.log('API Key exists:', !!process.env.REACT_APP_LUCID_API_KEY);
console.log('First 4 chars:', process.env.REACT_APP_LUCID_API_KEY?.substring(0, 4));
```

### 2. Test CORS
```javascript
// In browser console
fetch('https://api.lucid.co/ping')
  .then(r => console.log('CORS OK'))
  .catch(e => console.log('CORS blocked:', e));
```

### 3. Test Supabase Storage
```javascript
// Check if bucket exists
const { data, error } = await supabase.storage.listBuckets();
console.log('Buckets:', data);
console.log('Has lucid-chart-cache:', data?.some(b => b.name === 'lucid-chart-cache'));
```

### 4. Test Direct API Call
```javascript
// This will likely fail due to CORS
const testDirectAPI = async () => {
  const response = await fetch(
    'https://api.lucid.co/documents/YOUR_DOC_ID?pageNumber=0',
    {
      headers: {
        'Authorization': 'Bearer YOUR_API_KEY',
        'Lucid-Api-Version': '1',
        'Accept': 'image/png'
      }
    }
  );
  console.log('Response:', response);
};
```

## Recommended Fix

### Immediate Solution: Simplify to Base64
```javascript
// Simplified getCachedPageImage
export const getCachedPageImage = async (documentId, pageIndex) => {
  try {
    // For now, skip Supabase and just get image
    const blob = await exportDocumentPageViaProxy(documentId, pageIndex);
    
    // Convert to base64
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Failed to get image:', error);
    return createPlaceholderImage(`Page ${pageIndex + 1}`);
  }
};
```

### Long-term Solution: Server-side Handling
1. Create API endpoint that handles all Lucid operations
2. Cache images on server or CDN
3. Return URLs to frontend
4. No CORS issues, no API key exposure

## Quick Test Script
```javascript
// Complete test to identify the issue
const debugLucidCarousel = async () => {
  console.log('=== Lucid Carousel Debug ===');
  
  // 1. Check environment
  console.log('1. API Key exists:', !!process.env.REACT_APP_LUCID_API_KEY);
  
  // 2. Test CORS
  try {
    await fetch('https://api.lucid.co/ping');
    console.log('2. CORS: OK');
  } catch (e) {
    console.log('2. CORS: Blocked (expected)');
  }
  
  // 3. Test Supabase
  const { supabase } = await import('./lib/supabase');
  const { data: buckets } = await supabase.storage.listBuckets();
  console.log('3. Storage buckets:', buckets?.map(b => b.name));
  
  // 4. Test proxy
  try {
    const response = await fetch('/api/lucid-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true })
    });
    console.log('4. Proxy status:', response.status);
  } catch (e) {
    console.log('4. Proxy error:', e.message);
  }
};

// Run in browser console
debugLucidCarousel();
```

## The Real Problem
The system is trying to make direct API calls from the browser to Lucid API, which will be blocked by CORS. We need to either:
1. Use the proxy endpoint for ALL environments
2. Create a simpler base64 approach that doesn't rely on Supabase storage
3. Build a proper backend service to handle these operations

The Supabase snippet errors are likely unrelated - they appear when trying to run SQL from saved snippets that don't exist in your project.
