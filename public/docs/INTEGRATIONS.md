# Integrations Overview

## Active Integrations

| Integration | Purpose | Status | Documentation |
|-------------|---------|--------|---------------|
| Microsoft Graph | Auth, email, calendar | ✅ Active | [AUTHENTICATION.md](AUTHENTICATION.md) |
| SharePoint/OneDrive | Photo storage | ✅ Active | [SHAREPOINT.md](SHAREPOINT.md) |
| Lucid Charts | Floor plans, wire drop shapes | ✅ Active | See below |
| UniFi Network | Device/client data | ✅ Active | [UNIFI_INTEGRATION.md](UNIFI_INTEGRATION.md) |
| Brady Printer | Label printing | ✅ Active | See below |

---

## Microsoft Graph API

### What It Does
- User authentication via MSAL
- User profile information
- Calendar access (future)
- Email sending for notifications
- SharePoint/OneDrive file access

### Key Files
- `src/config/authConfig.js` - MSAL configuration
- `src/contexts/AuthContext.js` - Auth state management
- `api/graph-upload.js` - File uploads
- `api/graph-file.js` - File downloads
- `api/_graphMail.js` - Email helper

### Required Permissions
- `User.Read`
- `Calendars.Read`
- `Contacts.Read`
- `Mail.Send`
- `Files.ReadWrite.All`

See [AUTHENTICATION.md](AUTHENTICATION.md) for setup details.

---

## SharePoint / OneDrive

### What It Does
- Stores wire drop stage photos
- Stores issue photos
- Stores floor plan images
- Provides thumbnail generation

### Folder Structure
```
{project_sharepoint_url}/
├── wire_drops/
│   └── {Room}_{Drop}/
│       ├── PREWIRE_{timestamp}.jpg
│       ├── TRIM_{timestamp}.jpg
│       └── COMMISSION_{timestamp}.jpg
├── issues/
│   └── {Issue_Title}/
│       └── {timestamp}.jpg
└── floor_plans/
    └── {Page_Title}.png
```

### Key Files
- `src/services/sharePointStorageService.js` - Upload/download service
- `src/lib/thumbnailCache.js` - IndexedDB caching
- `src/components/CachedSharePointImage.js` - Smart image component
- `api/sharepoint-thumbnail.js` - Thumbnail proxy
- `api/sharepoint-init-folders.js` - Folder creation

### Configuration
Each project needs `one_drive_photos` URL set to the SharePoint folder.

See [SHAREPOINT.md](SHAREPOINT.md) for full documentation.

---

## Lucid Charts

### What It Does
- Import floor plan pages from Lucid documents
- Extract shape data (room names, drop types, wire types)
- Auto-create wire drops from selected shapes
- Display floor plans in carousel view

### Key Files
- `src/services/lucidApi.js` - API wrapper
- `src/services/lucidApiDirect.js` - Direct API calls
- `src/services/lucidCacheService.js` - Cache management
- `src/components/LucidChartCarousel.js` - Page carousel
- `src/components/LucidIframeEmbed.js` - Embedded view
- `api/lucid-proxy.js` - Serverless proxy

### Configuration
```bash
REACT_APP_LUCID_CLIENT_ID=your-client-id
REACT_APP_LUCID_CLIENT_SECRET=your-client-secret
```

### Usage Flow
1. PM adds Lucid document URL to project
2. Click "Fetch Shapes" to load document
3. View pages in carousel
4. Select shapes to create wire drops
5. Click "Create Wire Drops" to import

### Custom Data Fields
Lucid shapes should have custom data:
- `Room` or `Room Name` - Room location
- `Drop Type` - Type of drop (Speaker, TV, etc.)
- `Wire Type` - Cable type (Cat6, Speaker Wire, etc.)
- `Drop Name` - Specific name (auto-generated if missing)

---

## UniFi Network

### What It Does
- Fetch UniFi sites/hosts
- List network devices (APs, switches, gateways)
- List connected clients
- Match equipment to network clients by MAC address

### Key Files
- `src/services/unifiApi.js` - API wrapper
- `src/components/UnifiTestPage.js` - Test/debug page
- `src/components/UniFiClientSelectorEnhanced.jsx` - Client picker
- `api/unifi-proxy.js` - Serverless proxy

### Configuration
```bash
REACT_APP_UNIFI_API_KEY=your-api-key
```

Get API key from [UniFi Cloud Console](https://unifi.ui.com) → Settings → API.

### Usage
1. Configure UniFi controller URL on project
2. Navigate to UniFi test page or equipment detail
3. Select client to match to equipment
4. MAC address and client data stored on equipment

See [UNIFI_INTEGRATION.md](UNIFI_INTEGRATION.md) for full documentation.

---

## Brady Printer

### What It Does
- Connect to Brady label printers via Web SDK
- Print equipment labels with QR codes
- Generate asset tags

### Key Files
- `src/contexts/PrinterContext.js` - Printer connection state
- `src/services/bradyPrintService.js` - Print operations
- `src/services/labelRenderService.js` - Label rendering
- `src/components/PrinterConnection.js` - Connection UI

### Supported Printers
- Brady M211
- Brady M611
- Other Brady printers with Web SDK support

### Dependencies
- `@bradycorporation/brady-web-sdk`
- `qrcode` - For QR code generation

---

## Supabase

### What It Does
- PostgreSQL database
- Real-time subscriptions
- Row Level Security (RLS)
- File storage (legacy - now using SharePoint)

### Key Files
- `src/lib/supabase.js` - Client configuration
- `database/schema.sql` - Complete schema
- `database/migrations/` - Migration files

### Configuration
```bash
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
```

### Important Notes
- We use MSAL for auth, not Supabase Auth
- All RLS policies must include `anon` role
- See [AUTHENTICATION.md](AUTHENTICATION.md) for details

---

## Future Integrations

### AfterShip (Planned)
- Automatic shipment tracking
- Delivery date estimation
- Status webhooks

See [ROADMAP.md](ROADMAP.md) for details.

### D-Tools (Considered)
- Direct proposal import
- Equipment catalog sync

---

## API Function Reference

| Endpoint | Integration | Purpose |
|----------|-------------|---------|
| `/api/unifi-proxy` | UniFi | Proxy UniFi API calls |
| `/api/lucid-proxy` | Lucid | Proxy Lucid API calls |
| `/api/graph-upload` | SharePoint | Upload files |
| `/api/graph-file` | SharePoint | Download files |
| `/api/sharepoint-thumbnail` | SharePoint | Get thumbnails |
| `/api/sharepoint-init-folders` | SharePoint | Create folders |
| `/api/send-issue-notification` | Email | Send notifications |
| `/api/image-proxy` | General | Proxy external images |

---

## Troubleshooting Integrations

### General Steps
1. Check environment variables are set
2. Check API key/credentials are valid
3. Check Vercel function logs for errors
4. Test API directly (Postman, curl)

### Common Issues

| Integration | Issue | Solution |
|-------------|-------|----------|
| All | CORS errors | Use proxy API functions |
| SharePoint | 403 Forbidden | Check permissions, re-auth |
| Lucid | Empty response | Check document sharing settings |
| UniFi | 401 Unauthorized | Regenerate API key |
| Brady | Not connecting | Check USB/Bluetooth, restart printer |

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for more solutions.

---

*Last Updated: November 2025*