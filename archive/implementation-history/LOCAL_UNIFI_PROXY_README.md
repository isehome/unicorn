# Local UniFi Network API Proxy

## Why Do We Need This?

The UniFi controller's Network API **does not support CORS** (Cross-Origin Resource Sharing), which means web browsers block direct requests from your app to the controller. This is a security feature built into all modern browsers.

**The problem:**
- Your app runs on `localhost:3000` (or vercel domain)
- Your UniFi controller runs on `192.168.1.1` (different origin)
- Browser blocks the request with CORS error

**The solution:**
- Run this simple proxy on your local machine
- The proxy runs on `localhost:3001` (same origin as your app)
- The proxy forwards requests to your controller and adds CORS headers
- Browser allows the request because it's to `localhost`

## How to Use

### Step 1: Start the Local Proxy

Open Terminal in your project folder and run:

```bash
node local-unifi-proxy.js
```

You should see:

```
╔═══════════════════════════════════════════════════════════════╗
║         Local UniFi Network API Proxy Server                  ║
╚═══════════════════════════════════════════════════════════════╝

✓ Server running on http://localhost:3001

...
```

**Keep this terminal window open** while you're testing the UniFi API.

### Step 2: Use the UniFi Test Page

1. Go to your app's UniFi Test Page
2. Scroll to the "Local Network API - Client Data" section (green border)
3. Enter your controller's IP address (e.g., `192.168.1.1`)
4. Enter your Network API key
5. Click "Test Local Network API"

The app will now send requests to `http://localhost:3001/proxy/...` which forwards them to your controller.

## How to Get Your Network API Key

1. Open your UniFi controller web interface
2. Go to **Settings** → **System** → **Advanced** → **Integrations**
3. Click "Create New API Key"
4. Give it a name (e.g., "Wire Drop Testing")
5. Copy the API key and paste it into the app

**Important:** Save the API key somewhere safe - you can't view it again after creation!

## Troubleshooting

### "Cannot connect to local proxy"

**Problem:** The proxy isn't running
**Solution:** Run `node local-unifi-proxy.js` in Terminal

### "Port 3001 is already in use"

**Problem:** Something else is using port 3001
**Solution:**
- Find and stop the other app using that port, OR
- Edit `local-unifi-proxy.js` and change `const PORT = 3001;` to a different number

### "Connection refused" or "ECONNREFUSED"

**Problem:** Wrong controller IP address or controller is offline
**Solution:**
- Verify your controller's IP address (check your router or UniFi app)
- Make sure you're on the same local network as the controller
- Try accessing `https://192.168.1.1` (your IP) in your browser to verify it's reachable

### SSL Certificate Errors in Proxy Logs

**This is normal!** The proxy automatically accepts self-signed certificates from your controller. You'll see warnings in the proxy logs but the requests will still work.

## How It Works (Technical Details)

1. Your browser sends a request to `http://localhost:3001/proxy/network/api/...`
2. The proxy adds these headers to the request:
   - `X-API-KEY`: Your Network API key
   - Removes browser CORS restrictions
3. The proxy forwards the request to `https://192.168.1.1/proxy/network/api/...`
4. The proxy accepts the controller's self-signed SSL certificate
5. The proxy receives the response and adds CORS headers
6. Your browser receives the response and displays the data

## Security Notes

- This proxy only runs on your local machine
- It only accepts connections from `localhost` (your computer)
- It's not exposed to the internet
- The API key is only sent from your browser → proxy → controller (all on your local network)
- **Do not** run this proxy on a public server - it disables SSL verification for convenience

## Alternative: Server-Side Implementation

For production use, you should implement the UniFi API calls on your backend server (Next.js API routes or Vercel serverless functions) rather than from the browser. This avoids CORS entirely and keeps your API keys secure.
