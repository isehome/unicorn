# UniFi API Integration Guide

This guide explains how to integrate and use the UniFi API in your application.

## Overview

The UniFi integration allows you to interact with your UniFi network infrastructure through api.ui.com. It includes:
- A secure serverless proxy (`api/unifi-proxy.js`) that keeps your API key safe
- A frontend service (`src/services/unifiApi.js`) with convenient methods for common operations
- Support for UniFi API endpoints

## Configuration

### 1. Environment Variables

Add the following to your `.env.local` file:

```bash
# UniFi API Configuration
REACT_APP_UNIFI_API_KEY=your_api_key_here
REACT_APP_UNIFI_CONTROLLER_URL=https://api.ui.com
```

**Current Configuration:**
- API Key: `Uz0CvgeS2Zn5O3y46DvNzloXw_fLDeVu`
- Controller URL: `https://api.ui.com`

### 2. Vercel Deployment

When deploying to Vercel, add the environment variables in your Vercel dashboard:
1. Go to your project settings
2. Navigate to Environment Variables
3. Add:
   - `REACT_APP_UNIFI_API_KEY`
   - `REACT_APP_UNIFI_CONTROLLER_URL`

## Usage

### Import the Service

```javascript
import unifiApi from '../services/unifiApi';
// or import specific functions
import { fetchSites, fetchDevices, fetchClients, fetchSwitchPorts } from '../services/unifiApi';
```

### Available Methods

#### Fetch All Sites/Hosts
Retrieves all UniFi sites (hosts) accessible with your API key

```javascript
const sites = await unifiApi.fetchSites();
console.log(sites);
```

#### Fetch Devices
Retrieves all UniFi devices (APs, switches, gateways, etc.) for a specific site

```javascript
const siteId = 'your-site-id';
const devices = await unifiApi.fetchDevices(siteId);
console.log(devices);
```

#### Fetch Connected Clients
Retrieves all currently connected clients for a specific site

```javascript
const siteId = 'your-site-id';
const clients = await unifiApi.fetchClients(siteId);
console.log(clients);
```

#### Fetch Switch Ports
Retrieves port configuration for a specific switch

```javascript
const siteId = 'your-site-id';
const deviceMac = 'aa:bb:cc:dd:ee:ff';
const ports = await unifiApi.fetchSwitchPorts(siteId, deviceMac);
console.log(ports);
```

#### Test Connection
Test connectivity to the UniFi API

```javascript
const isConnected = await unifiApi.testConnection();
console.log('Connected:', isConnected);
```

## Example Component

Here's a complete example of a React component that displays UniFi sites and devices:

```javascript
import React, { useState, useEffect } from 'react';
import unifiApi from '../services/unifiApi';

function UniFiDashboard() {
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [devices, setDevices] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch sites on mount
  useEffect(() => {
    async function loadSites() {
      try {
        setLoading(true);
        const sitesData = await unifiApi.fetchSites();
        setSites(sitesData);
        
        // Auto-select first site if available
        if (sitesData && sitesData.length > 0) {
          setSelectedSite(sitesData[0].id);
        }
        setError(null);
      } catch (err) {
        setError(err.message);
        console.error('Error fetching UniFi sites:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSites();
  }, []);

  // Fetch devices and clients when site is selected
  useEffect(() => {
    if (!selectedSite) return;

    async function loadSiteData() {
      try {
        setLoading(true);
        const [devicesData, clientsData] = await Promise.all([
          unifiApi.fetchDevices(selectedSite),
          unifiApi.fetchClients(selectedSite)
        ]);
        
        setDevices(devicesData);
        setClients(clientsData);
        setError(null);
      } catch (err) {
        setError(err.message);
        console.error('Error fetching site data:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSiteData();
  }, [selectedSite]);

  if (loading && sites.length === 0) return <div>Loading UniFi data...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="unifi-dashboard">
      <h2>UniFi Network Dashboard</h2>
      
      {/* Site Selector */}
      <section>
        <h3>Select Site</h3>
        <select 
          value={selectedSite || ''} 
          onChange={(e) => setSelectedSite(e.target.value)}
        >
          <option value="">-- Select a site --</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name || site.id}
            </option>
          ))}
        </select>
      </section>

      {selectedSite && (
        <>
          {/* Devices Section */}
          <section>
            <h3>Devices ({devices.length})</h3>
            <div className="devices-grid">
              {devices.length > 0 ? (
                devices.map((device, idx) => (
                  <div key={idx} className="device-card">
                    <h4>{device.name || device.model || 'Unnamed Device'}</h4>
                    <p>Type: {device.type}</p>
                    <p>MAC: {device.mac}</p>
                    <p>Model: {device.model}</p>
                    <p>Status: {device.state}</p>
                  </div>
                ))
              ) : (
                <p>No devices found</p>
              )}
            </div>
          </section>

          {/* Clients Section */}
          <section>
            <h3>Connected Clients ({clients.length})</h3>
            <div className="clients-grid">
              {clients.length > 0 ? (
                clients.map((client, idx) => (
                  <div key={idx} className="client-card">
                    <h4>{client.name || client.hostname || 'Unknown'}</h4>
                    <p>MAC: {client.mac}</p>
                    <p>IP: {client.ip}</p>
                    <p>Network: {client.network}</p>
                  </div>
                ))
              ) : (
                <p>No clients connected</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default UniFiDashboard;
```

## API Response Structure

The UniFi API returns JSON responses. The structure may vary by endpoint. Always inspect the response to understand the data format.

## Error Handling

The service automatically handles common errors:
- **401 Unauthorized**: Invalid API key
- **403 Forbidden**: No access to resource
- **404 Not Found**: Resource doesn't exist
- **429 Rate Limited**: Too many requests

```javascript
try {
  const devices = await unifiApi.getDevices();
} catch (error) {
  if (error.message.includes('Unauthorized')) {
    console.error('Invalid API key');
  } else if (error.message.includes('Rate limit')) {
    console.error('Too many requests, please wait');
  } else {
    console.error('API error:', error.message);
  }
}
```

## Security Notes

1. **Never expose your API key in client-side code** - Always use the proxy
2. **API keys are stored in environment variables** - They're not committed to git
3. **The proxy uses X-API-KEY header** - Standard authentication method
4. **CORS is configured** - Requests are properly handled

## Deployment Checklist

Before deploying to production:

- [ ] Add environment variables to Vercel
- [ ] Test API connectivity
- [ ] Verify CORS settings
- [ ] Check rate limits for your use case
- [ ] Test error handling
- [ ] Add loading states in UI
- [ ] Implement retry logic for failed requests (optional)

## Common Issues

### Issue: "API key not configured"
**Solution:** Ensure `REACT_APP_UNIFI_API_KEY` is set in your `.env.local` and Vercel environment variables

### Issue: "401 Unauthorized"
**Solution:** Verify your API key is correct. Get your API key from the UniFi Cloud Console at https://unifi.ui.com

### Issue: "404 Not Found"
**Solution:** Check the endpoint path is correct for the UniFi API

### Issue: CORS errors in development
**Solution:** The proxy should handle CORS. Ensure you're calling the proxy endpoint, not the UniFi API directly

## Further Documentation

For more information about the UniFi API, refer to:
- [UniFi Cloud Console](https://unifi.ui.com) - Manage your API keys and access
- UniFi API documentation (available through your UniFi account)

## Support

If you encounter issues:
1. Check the browser console for error messages
2. Verify your API key and controller URL
3. Test the endpoint in Postman or similar tool
4. Check Vercel function logs for backend errors
