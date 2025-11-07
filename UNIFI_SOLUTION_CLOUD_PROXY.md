# UniFi Network API - Use Cloud Proxy for Client Data

## The Solution: Use api.ui.com Instead of Direct Controller

Instead of connecting directly to your controller's WAN IP, use UniFi's cloud proxy which handles authentication properly.

## How to Set It Up

### 1. Get Your Console/Host ID
- Go to https://unifi.ui.com
- Login to your UniFi account
- Click on your controller
- Look at the URL - it will contain your console ID
- Example: `https://unifi.ui.com/consoles/ABC123DEF456.../sites/default/`

### 2. Use These Endpoints

Instead of:
```
https://YOUR_WAN_IP:8443/api/s/default/stat/sta
```

Use:
```
https://api.ui.com/proxy/network/api/s/default/stat/sta
```

Or with console ID:
```
https://api.ui.com/v1/consoles/{CONSOLE_ID}/proxy/network/api/s/default/stat/sta
```

### 3. Authentication
- Use your **Cloud API Key** (from UniFi Site Manager)
- Pass it as `X-API-KEY` header
- This is already implemented in our app!

## In the App

1. **Don't use WAN IP** for the controller URL
2. **Use**: `https://api.ui.com`
3. **Enter**: Your Cloud API key (not Network API key)
4. **Test**: The endpoints will automatically route through the cloud

## Why This Works

- UniFi's cloud handles the controller authentication
- No need for session management
- Works with API keys (already implemented)
- Handles SSL certificates automatically
- Works from anywhere (not just on-site)

## Testing in the App

1. In "UniFi API Configuration" section:
   - API Key: Your Cloud API key
   - Console URL: Leave as `https://api.ui.com`

2. Click "Connect to UniFi"

3. Select your site

4. The app will automatically use `/proxy/network/` endpoints

## Benefits

✅ Works with existing implementation
✅ No code changes needed
✅ Works from mobile devices
✅ Works remotely (not just on-site)
✅ No session management
✅ No SSL certificate issues

## The Key Insight

We were trying to connect directly to the controller (which requires login/session), but we should be using UniFi's cloud proxy (which works with API keys).

The `/proxy/network/` prefix in the API path tells api.ui.com to proxy the request to your controller.