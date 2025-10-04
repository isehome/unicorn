# Lucid Chart Wire Drop Integration - Setup Guide

## Overview

The Lucid Chart integration allows you to fetch wire map drawings from Lucid Chart and sync shape IDs with your wire drop database in Supabase. This integration uses a secure serverless proxy to keep your API key safe.

## Security Architecture

### Backend Proxy (Secure)
- API key is stored in environment variables
- Serverless function (`/api/lucid-proxy.js`) handles all Lucid API calls
- API key **never** exposed to the frontend/browser

### Frontend (Client)
- Only sends document IDs to the proxy
- Receives processed data from proxy
- No direct access to Lucid API key

## Local Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:
```bash
cp .env.example .env.local
```

Edit `.env.local` and add your Lucid API key:
```
REACT_APP_LUCID_API_KEY=your-actual-api-key-here
```

**Important:** Never commit `.env.local` to git (it's in .gitignore)

### 3. Start Development Server
```bash
npm start
```

The app will run on `http://localhost:3000`

### 4. Test the Integration

1. Navigate to: **Bottom Bar → Wire Drops → Lucid Chart Integration**
2. Enter a Lucid Chart document ID or paste a full URL
3. Click "Fetch Document"
4. View shapes and their data

## Production Deployment (Vercel)

### 1. Add Environment Variable to Vercel

There are two methods:

#### Method A: Vercel Dashboard (Recommended)
1. Go to your project on Vercel
2. Navigate to **Settings → Environment Variables**
3. Add new variable:
   - **Name:** `REACT_APP_LUCID_API_KEY`
   - **Value:** Your Lucid API key
   - **Environments:** Production, Preview, Development

#### Method B: Vercel CLI
```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Add the environment variable as a secret
vercel env add REACT_APP_LUCID_API_KEY

# When prompted:
# - Select all environments (Production, Preview, Development)
# - Paste your API key value
```

### 2. Deploy
```bash
vercel --prod
```

Or push to your git repository if you have automatic deployments enabled.

### 3. Verify Deployment

1. Visit your production URL
2. Navigate to Wire Drops → Lucid Chart Integration
3. Test with a document ID

## API Endpoints

### `/api/lucid-proxy`
- **Method:** POST
- **Body:** `{ "documentId": "your-doc-id" }`
- **Returns:** Lucid Chart document data
- **Authentication:** Uses server-side API key (not exposed)

## Getting Your Lucid API Key

1. Go to [Lucid Account Settings](https://lucid.app/users/settings/api)
2. Generate a new API key
3. Copy the key (starts with `key-...`)
4. Add to your `.env.local` file

## Extracting Document IDs

From a Lucid Chart URL like:
```
https://lucid.app/lucidchart/f0e89b19-d72d-4ab1-8cb9-2712dbca4bc1/edit
```

The document ID is:
```
f0e89b19-d72d-4ab1-8cb9-2712dbca4bc1
```

The app can also extract this automatically when you paste the full URL.

## Wire Drop Shape Structure

### Shape Properties
Each shape in Lucid Chart contains:
- **id** - Unique shape identifier (use this to link to wire_drops table)
- **class** - Shape type (e.g., ShapeCircleBlock, IsoscelesTriangleBlock)
- **text** - Display text from textAreas
- **customData** - Key-value pairs including:
  - `IS Drop`: "True" or "False"
  - `Wire Type`: e.g., "Cat 6e", "18/4", "Fiber"
  - `Room Name`: Room location
  - `Drop Name`: Drop identifier
  - `Device`: Device type
  - `UID`: Unique identifier
  - `Location`: Physical location
  - `QR code URL`: QR code for the drop

### Filtering Wire Drops
Use the "Show Wire Drops Only" checkbox to filter shapes where `IS Drop = "True"`.

## Next Steps - Phase 2 (Database Integration)

1. Add `lucid_shape_id` column to `wire_drops` table in Supabase
2. Create UI to link shapes to existing wire drops
3. Sync custom data from Lucid to Supabase
4. Add ability to push updates back to Lucid Chart
5. Visualize wire drop status on Lucid maps

## Troubleshooting

### "API key not configured" error
- Ensure `REACT_APP_LUCID_API_KEY` is set in `.env.local` (local)
- Ensure environment variable is set in Vercel (production)
- Restart dev server after adding env variable

### "Document not found" error
- Verify the document ID is correct
- Ensure your API key has access to the document
- Check document permissions in Lucid Chart

### "Unauthorized" error
- API key may be invalid or expired
- Generate a new API key in Lucid settings
- Update environment variable with new key

### Shapes not displaying
- Document may not have shapes with the expected structure
- Check the Raw JSON tab to see actual document structure
- Verify shapes have the `items.shapes` structure

## Security Best Practices

1. ✅ API key stored in environment variables only
2. ✅ Never commit `.env.local` to git
3. ✅ Use serverless proxy for all API calls
4. ✅ API key never sent to frontend/browser
5. ✅ Vercel secrets used for production deployment

## Files Modified/Created

- `api/lucid-proxy.js` - Serverless proxy function
- `src/services/lucidApi.js` - API client service
- `src/components/LucidTest.js` - Test page component
- `src/components/WireDropsHub.js` - Navigation hub
- `.env.local` - Local environment variables (not in git)
- `.env.example` - Template for environment variables
- `vercel.json` - Deployment configuration

## Support

For issues or questions:
- Check Lucid API documentation: https://developer.lucid.co/
- Review Vercel deployment logs
- Check browser console for errors
