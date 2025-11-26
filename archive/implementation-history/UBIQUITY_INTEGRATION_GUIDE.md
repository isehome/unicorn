# Ubiquity API Integration Guide

This guide explains how to integrate and use Ubiquity API services in the Unicorn application.

## Overview

The Ubiquity integration uses a serverless proxy pattern to keep your API key secure on the backend while allowing frontend components to access Ubiquity services.

### Architecture

```
Frontend (React)
    ↓
src/services/ubiquityApi.js
    ↓
api/ubiquity-proxy.js (Serverless Function)
    ↓
Ubiquity API
```

## Setup Instructions

### 1. Configure API Base URL

Open `api/ubiquity-proxy.js` and update the API base URL:

```javascript
// Replace this placeholder with your actual Ubiquity API base URL
const UBIQUITY_API_BASE_URL = 'https://api.ubiquity.example.com';
```

Common Ubiquity API endpoints might include:
- `https://api.ui.com` - Main Ubiquity API
- `https://unifi.ui.com/api` - UniFi-specific API
- Or your self-hosted controller URL

### 2. Add API Key to Environment Variables

#### Local Development (.env.local)

Add your API key to `.env.local`:

```bash
REACT_APP_UBIQUITY_API_KEY=your_api_key_here
```

#### Production (Vercel)

Add the environment variable in Vercel:

1. Go to your Vercel project dashboard
2. Navigate to Settings → Environment Variables
3. Add: `REACT_APP_UBIQUITY_API_KEY` with your API key value
4. Redeploy the application

### 3. Verify Authentication Headers

Different Ubiquity services may use different authentication methods. Update the headers in `api/ubiquity-proxy.js` if needed:

```javascript
headers: {
  'Authorization': `Bearer ${apiKey}`,  // Bearer token (most common)
  // OR
  'X-API-Key': apiKey,                  // API key header
  // OR
  'Authorization': `Basic ${Buffer.from(`user:${apiKey}`).toString('base64')}`,
  
  'Content-Type': 'application/json',
  'Accept': 'application/json'
}
```

## Usage Examples

### Basic API Call

```javascript
import { callUbiquityApi } from '../services/ubiquityApi';

// Get devices
const devices = await callUbiquityApi('devices');

// Get specific device
const device = await callUbiquityApi('devices/device-id-123');

// With query parameters
const data = await callUbiquityApi('sites', {
  params: {
    status: 'active',
    limit: 50
  }
});
```

### Using Convenience Methods

```javascript
import { getDevices, getSites, getDeviceDetails } from '../services/ubiquityApi';

// Get all devices
const devices = await getDevices();

// Get all sites
const sites = await getSites();

// Get specific device details
const deviceInfo = await getDeviceDetails('device-id-123');
```

### Using Full URLs

If you need to call a specific URL:

```javascript
import { callUbiquityApiUrl } from '../services/ubiquityApi';

const data = await callUbiquityApiUrl('https://custom.api.url/endpoint');
```

### Error Handling

```javascript
import { callUbiquityApi, UbiquityApiError } from '../services/ubiquityApi';

try {
  const data = await callUbiquityApi('devices');
  console.log('Devices:', data);
} catch (error) {
  if (error instanceof UbiquityApiError) {
    console.error('API Error:', error.message);
    console.error('Status:', error.status);
    console.error('Details:', error.details);
    
    // Handle specific error types
    if (error.status === 401) {
      // Handle unauthorized
    } else if (error.status === 429) {
      // Handle rate limit
    }
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## React Component Example

```javascript
import React, { useState, useEffect } from 'react';
import { getDevices, getSites, UbiquityApiError } from '../services/ubiquityApi';

function UbiquityDeviceList() {
  const [devices, setDevices] = useState([]);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load sites and devices in parallel
      const [sitesData, devicesData] = await Promise.all([
        getSites(),
        getDevices()
      ]);
      
      setSites(sitesData);
      setDevices(devicesData);
    } catch (err) {
      if (err instanceof UbiquityApiError) {
        setError(`API Error: ${err.message} (Status: ${err.status})`);
      } else {
        setError(`Failed to load data: ${err.message}`);
      }
      console.error('Error loading Ubiquity data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading Ubiquity data...</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;

  return (
    <div>
      <h2>Sites: {sites.length}</h2>
      <h2>Devices: {devices.length}</h2>
      
      <div className="grid grid-cols-2 gap-4">
        {devices.map(device => (
          <div key={device.id} className="border p-4 rounded">
            <h3>{device.name}</h3>
            <p>Status: {device.status}</p>
            <p>Model: {device.model}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default UbiquityDeviceList;
```

## API Response Structure

The proxy returns responses directly from the Ubiquity API. Common response structures:

### Devices Response
```json
{
  "devices": [
    {
      "id": "device-id-123",
      "name": "Device Name",
      "model": "US-8-150W",
      "status": "online",
      "ip": "192.168.1.10",
      "mac": "AA:BB:CC:DD:EE:FF",
      "version": "4.3.21.11325"
    }
  ]
}
```

### Sites Response
```json
{
  "sites": [
    {
      "id": "site-id-123",
      "name": "Site Name",
      "description": "Site Description",
      "devices": 5,
      "status": "active"
    }
  ]
}
```

## Troubleshooting

### API Key Issues

**Problem**: Getting 401 Unauthorized errors
**Solutions**:
1. Verify `REACT_APP_UBIQUITY_API_KEY` is set in environment variables
2. Check the API key is valid and not expired
3. Ensure authentication header format matches API requirements
4. Redeploy after adding environment variables

### CORS Issues

**Problem**: CORS errors in browser console
**Solution**: The proxy already sets appropriate CORS headers. If you still see CORS errors:
1. Verify you're calling `/api/ubiquity-proxy` not the Ubiquity API directly
2. Check Vercel deployment logs for errors

### Base URL Issues

**Problem**: 404 errors for all API calls
**Solutions**:
1. Verify `UBIQUITY_API_BASE_URL` in `api/ubiquity-proxy.js` is correct
2. Test the base URL directly in a browser or Postman
3. Check if the API requires specific URL formats

### Rate Limiting

**Problem**: Getting 429 Too Many Requests errors
**Solutions**:
1. Implement request caching in your components
2. Add debouncing to rapid API calls
3. Use React Query for automatic caching and deduplication

## Testing

### Test the Proxy Endpoint

```bash
# Test with curl (after deploying)
curl "https://your-app.vercel.app/api/ubiquity-proxy?endpoint=devices" \
  -H "Content-Type: application/json"
```

### Test Locally

```bash
# Start the development server
npm start

# The proxy will be available at:
# http://localhost:3000/api/ubiquity-proxy
```

## Security Notes

1. **API Key Storage**: Never commit `.env.local` to version control
2. **Backend Proxy**: Always use the proxy, never call Ubiquity API directly from frontend
3. **CORS**: The proxy allows all origins (`*`) - restrict this in production if needed
4. **Rate Limiting**: Consider implementing rate limiting on the proxy
5. **Input Validation**: The proxy validates required parameters but add more as needed

## Adding New Endpoints

To add support for new Ubiquity API endpoints:

1. Add convenience method to `src/services/ubiquityApi.js`:

```javascript
export async function getNewEndpoint(id) {
  return await callUbiquityApi(`new-endpoint/${id}`);
}
```

2. Update the default export:

```javascript
export default {
  callUbiquityApi,
  callUbiquityApiUrl,
  getDevices,
  getSites,
  getNewEndpoint,  // Add here
  UbiquityApiError
};
```

3. Use in components:

```javascript
import { getNewEndpoint } from '../services/ubiquityApi';

const data = await getNewEndpoint('some-id');
```

## Next Steps

1. **Configure the API Base URL** in `api/ubiquity-proxy.js`
2. **Add your API key** to environment variables
3. **Test the integration** with a simple component
4. **Verify authentication headers** match your API requirements
5. **Deploy to Vercel** and test in production

For support with Ubiquity API specifics, refer to:
- Ubiquity API Documentation: https://help.ui.com/
- UniFi Developer Documentation: https://ubntwiki.com/
