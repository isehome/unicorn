# UNICORN - Complete Project Documentation

## 📋 PROJECT OVERVIEW

**Application Name:** Unicorn
**Owner:** Steve / Intelligent Systems (Low-voltage installation company)
**Purpose:** Comprehensive project management for network cabling, wire drops, and AV installations
**Live URL:** Deployed on Vercel
**Development Notes:** Built incrementally with AI assistance; owner is not a programmer

---

## 🛠 TECHNOLOGY STACK

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 18.2.0 | UI Framework |
| React Router | 6.30.1 | Client-side routing |
| Tailwind CSS | 3.4.17 | Styling (utility-first) |
| Lucide React | 0.540.0 | Icons |
| React Query | 4.41.0 | Server state management |

### Backend & Database
| Technology | Purpose |
|------------|---------|
| Supabase | PostgreSQL database, real-time subscriptions, storage |
| Vercel | Hosting, serverless API functions |

### Authentication
| Technology | Purpose |
|------------|---------|
| Azure MSAL | Microsoft 365 OAuth authentication |
| @azure/msal-browser | 3.26.1 |
| @azure/msal-react | 2.1.1 |

### Integrations
| Service | Purpose | Status |
|---------|---------|--------|
| Microsoft Graph API | User profiles, calendar, contacts | ✅ Active |
| SharePoint/OneDrive | Photo storage for wire drops, issues, floor plans | ✅ Active |
| Lucid Charts | Floor plan visualization, wire drop mapping | ✅ Active |
| UniFi Network API | Network equipment data, client matching | ✅ Active |
| Brady Printer SDK | Label printing for equipment tags | ✅ Active |

### Key Libraries
| Library | Purpose |
|---------|---------|
| jspdf + jspdf-autotable | PDF generation for POs |
| papaparse | CSV parsing for equipment import |
| qrcode | QR code generation |
| html5-qrcode | QR code scanning |
| fuse.js | Fuzzy search |
| file-saver | File downloads |
| react-zoom-pan-pinch | Floor plan pan/zoom |

---

## 📁 PROJECT STRUCTURE

```
unicorn/
├── src/
│   ├── components/          # React components (50+ files)
│   │   ├── dashboard/       # Dashboard sub-components
│   │   ├── procurement/     # PO system components
│   │   ├── project-detail/  # Project view components
│   │   ├── photos/          # Photo viewer components
│   │   └── ui/              # Reusable UI components
│   ├── services/            # Business logic (30+ services)
│   ├── contexts/            # React contexts
│   │   ├── AuthContext.js   # MSAL authentication
│   │   ├── ThemeContext.js  # Dark/light mode
│   │   └── PrinterContext.js# Brady printer connection
│   ├── hooks/               # Custom React hooks
│   ├── lib/                 # Utilities (supabase client, cache)
│   ├── config/              # Configuration (authConfig.js)
│   ├── modules/             # Feature modules (wire-drops, issues)
│   ├── pages/               # Page components
│   └── utils/               # Helper functions
├── api/                     # Vercel serverless functions
├── database/                # SQL schema and migrations
├── docs/                    # Documentation
├── public/                  # Static assets
└── [config files]           # package.json, tailwind.config.js, etc.
```

---

## 👥 USER ROLES

### Technician (Field Worker)
- **Home:** TechnicianDashboardOptimized
- **Capabilities:**
  - View assigned projects
  - Complete wire drop stages (prewire, trim-out, commissioning)
  - Upload stage photos
  - Receive parts/equipment
  - Log issues with photos
  - Scan QR codes for equipment lookup

### Project Manager (PM)
- **Home:** PMDashboard
- **Capabilities:**
  - All technician capabilities PLUS:
  - Create/manage projects
  - Import equipment from CSV
  - Generate purchase orders
  - Manage vendors/suppliers
  - View progress gauges
  - Manage stakeholders
  - Configure integrations (Lucid, UniFi)

---

## 🔐 AUTHENTICATION FLOW

```
1. User clicks "Sign in with Microsoft"
2. MSAL redirects to Microsoft login
3. User authenticates with M365 credentials
4. Microsoft redirects back with auth code
5. MSAL exchanges code for tokens
6. AuthContext stores tokens, loads user profile from Graph API
7. Token auto-refresh runs in background (5 min before expiry)
```

**Key Files:**
- src/config/authConfig.js - MSAL configuration
- src/contexts/AuthContext.js - Auth state management
- src/components/Login.js - Login UI
- src/components/ProtectedRoute.js - Route protection

**Required Environment Variables:**
```
REACT_APP_AZURE_CLIENT_ID=<Azure App Registration Client ID>
REACT_APP_AZURE_TENANT_ID=<Azure Tenant ID>
```

---

## 📊 DATABASE SCHEMA (Key Tables)

### Core Tables
| Table | Purpose |
|-------|---------|
| projects | Project records with client info, dates, URLs |
| wire_drops | Individual cable drop locations |
| wire_drop_stages | Stage completion (prewire/trim/commission) |
| project_equipment | Equipment instances per project |
| global_parts | Master parts catalog |
| project_rooms | Rooms/locations within projects |

### People & Assignments
| Table | Purpose |
|-------|---------|
| contacts | People (clients, vendors, team members) - includes address field for map integration |
| stakeholder_slots | Role definitions (PM, Lead Tech, etc.) |
| project_assignments | Who is assigned to which project |
| issue_assignments | Who is assigned to which issue |

### Issues & Tasks
| Table | Purpose |
|-------|---------|
| issues | Project issues/problems |
| issue_photos | Photos attached to issues |
| project_todos | Task/to-do items |

### Procurement
| Table | Purpose |
|-------|---------|
| suppliers | Vendor information |
| purchase_orders | PO headers |
| purchase_order_items | PO line items |
| po_tracking | Shipment tracking |

### Integration Support
| Table | Purpose |
|-------|---------|
| lucid_pages | Cached Lucid chart data |
| lucid_chart_cache | Floor plan image cache |
| wire_drop_equipment_links | Junction: wire drops to equipment |

---

## ⚡ KEY FEATURES

### 1. Wire Drop Management
**Three-Stage Workflow:**
1. **Prewire** - Initial cable run (photo required)
2. **Trim-Out** - Device mounting, termination (photo + equipment required)
3. **Commissioning** - Testing, head-end connection (photo required)

**Key Files:**
- src/services/wireDropService.js - CRUD + stage management
- src/components/WireDropDetailEnhanced.js - Detail view with all features
- src/components/WireDropsList.js - List view with filters
- src/components/PMProjectViewEnhanced.js - Main project management view


**Data Flow:**
```
Lucid Chart → Import Shapes → Create Wire Drops → Assign Equipment → Complete Stages
```

### 2. Equipment & Parts System
**Three-Tier Architecture:**
1. **Global Parts** (global_parts) - Master catalog, reusable across projects
2. **Project Equipment** (project_equipment) - Instances for specific project
3. **Wire Drop Links** (wire_drop_equipment_links) - Which equipment at which drop

**CSV Import Process:**
1. PM exports from D-Tools/proposal software
2. Upload CSV with Room, Part, Quantity columns
3. System splits quantities into individual instances
4. Auto-matches to global_parts catalog
5. Technician assigns instances to wire drops

**Key Files:**
- src/services/projectEquipmentService.js - Equipment operations
- src/services/partsService.js - Global parts management
- src/components/GlobalPartsManager.js - Parts catalog UI
- src/components/EquipmentListPage.js - Project equipment view

### 3. Progress Tracking (Milestone Gauges)
**Milestone Types:**
| Milestone | Calculation |
|-----------|-------------|
| Planning & Design | Has Lucid URL + Portal URL |
| Prewire Orders | % of prewire parts ordered (from submitted POs) |
| Prewire Receiving | % of prewire parts received |
| Prewire Stages | % of wire drops with prewire photo |
| Trim Orders | % of trim parts ordered |
| Trim Receiving | % of trim parts received |
| Trim Stages | % of wire drops with trim photo + equipment |
| Commissioning | % of wire drops commissioned |

**Key Files:**
- src/services/milestoneService.js - All calculation logic
- src/components/MilestoneGaugesDisplay.js - Gauge UI
- src/components/UnifiedProgressGauge.js - Individual gauge component

### 4. Procurement System
**Workflow:**
1. Equipment imported from CSV
2. PM reviews items grouped by supplier
3. Generate PO (auto-numbered: PO-2025-001-AMZN-001)
4. Submit PO (updates ordered quantities)
5. Add tracking numbers
6. Receive items (updates received quantities)
7. Milestone gauges auto-update

**Key Files:**
- src/services/purchaseOrderService.js - PO CRUD
- src/services/supplierService.js - Vendor management
- src/services/trackingService.js - Shipment tracking
- src/components/procurement/ - All procurement UI

### 5. Photo Storage (SharePoint)
**Folder Structure:**
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

**Key Files:**
- src/services/sharePointStorageService.js - Upload/download
- src/lib/thumbnailCache.js - IndexedDB caching
- src/components/CachedSharePointImage.js - Smart image component

### 6. Lucid Charts Integration
**Purpose:** Import floor plans and wire drop shapes from Lucid diagrams

**Features:**
- Carousel view of all pages
- Shape data extraction (room, drop type, wire type)
- Auto-create wire drops from selected shapes
- Color preservation from diagram shapes

**Key Files:**
- src/services/lucidApi.js - API wrapper
- src/services/lucidApiDirect.js - Direct API calls
- src/components/LucidChartCarousel.js - Page carousel
- api/lucid-proxy.js - Serverless proxy (handles CORS)

### 7. UniFi Network Integration
**Purpose:** Match installed equipment to UniFi clients for network validation

**Features:**
- Fetch sites, devices, clients from UniFi Cloud
- Match equipment by MAC address
- Store client data on equipment records

**Key Files:**
- src/services/unifiApi.js - API wrapper
- src/components/UnifiTestPage.js - Test/debug page
- src/components/UniFiClientSelectorEnhanced.jsx - Client picker
- api/unifi-proxy.js - Serverless proxy (keeps API key secure)

### 8. Permit Management
**Purpose:** Track and manage city/municipal permits for projects

**Features:**
- Upload permit documents
- Track expiration dates and status
- Link permits to specific projects

**Key Files:**
- src/services/permitService.js - Permit CRUD operations
- src/components/ProjectPermits.js - Permit management UI
- src/components/PermitForm.js - Add/Edit permit form

### 9. Offline Support
**Purpose:** Allow technicians to view data when connectivity is lost

**Features:**
- Detects offline status automatically
- Displays offline warning banner
- Caches key data for read-only access

**Key Files:**
- src/components/OfflineGuard.js - Protects routes/components
- src/components/OfflineBanner.js - UI notification


---

## 🔌 API FUNCTIONS (Vercel Serverless)

| Endpoint | Purpose |
|----------|---------|
| /api/unifi-proxy | Proxy UniFi API calls |
| /api/lucid-proxy | Proxy Lucid API calls |
| /api/ubiquity-proxy | Legacy UniFi proxy |
| /api/image-proxy | Proxy external images |
| /api/graph-upload | Upload to SharePoint |
| /api/graph-file | Download from SharePoint |
| /api/sharepoint-thumbnail | Get SharePoint thumbnails |
| /api/sharepoint-init-folders | Create folder structure |
| /api/sharepoint-resolve-sharing-link | Resolve SharePoint sharing links |
| /api/send-issue-notification | Email notifications |
| /api/process-pending-issue-notifications | Batch process notifications |
| /api/public-po | Public PO view |
| /api/public-issue | Public issue view |
| /api/unifi-test-connection | Test UniFi API connection |

---

## 🎨 STYLING CONVENTIONS

**Framework:** Tailwind CSS (utility-first)

**Color Scheme:**
- Primary: Violet (violet-500, violet-600)
- Success: Green (green-500)
- Warning: Yellow (yellow-500)
- Error: Red (red-500)
- Neutral: Gray scale

**Dark Mode:** Supported via ThemeContext
- Use dark: prefix for dark mode styles
- Example: bg-white dark:bg-gray-800

**Component Patterns:**
```jsx
// Card pattern
<div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4">

// Button pattern
<button className="px-4 py-2 bg-violet-500 text-white rounded-lg hover:bg-violet-600">

// Input pattern
<input className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
```

---

## 🚀 DEPLOYMENT

**Platform:** Vercel

**Build Command:** npm run build
**Output Directory:** build

**Environment Variables Required:**
```
# Supabase
REACT_APP_SUPABASE_URL=
REACT_APP_SUPABASE_ANON_KEY=

# Azure AD
REACT_APP_AZURE_CLIENT_ID=
REACT_APP_AZURE_TENANT_ID=

# UniFi (optional)
REACT_APP_UNIFI_API_KEY=

# Lucid (optional)
REACT_APP_LUCID_CLIENT_ID=
REACT_APP_LUCID_CLIENT_SECRET=
```

---

## 🐛 COMMON ISSUES & SOLUTIONS

### Authentication Hangs
**Symptom:** Login redirects but never completes
**Solution:** Check Azure app registration redirect URIs include your domain

### Photos Not Loading
**Symptom:** Blank images or broken thumbnails
**Solution:** Verify SharePoint URL is correct on project, check CORS settings

### Lucid Import Fails
**Symptom:** Failed to fetch shapes error
**Solution:** Verify Lucid API credentials, check document is shared properly

### UniFi Connection Fails
**Symptom:** Unauthorized or empty device list
**Solution:** Regenerate UniFi API key, verify site access

### Milestone Gauges Wrong
**Symptom:** Percentages don't match expected values
**Solution:** Check required_for_prewire flags on global_parts, verify equipment is linked

---

## 📈 PERFORMANCE NOTES

**Implemented Optimizations:**
- Lazy loading for route components (React.lazy)
- React Query caching (5 min stale time)
- IndexedDB thumbnail caching (7 day expiry)
- Debounced search inputs

**Known Areas for Improvement:**
- Some components still make direct Supabase calls (should use React Query)
- Large equipment lists could benefit from virtualization
- Floor plan images could use progressive loading

---

## 🔄 DATA FLOW EXAMPLES

### Creating a Wire Drop from Lucid
```
1. PM enters Lucid document URL on project
2. Click Fetch Shapes -> lucidApi.getDocument()
3. Select shapes representing wire drops
4. Click Create Wire Drops -> wireDropService.createWireDrop()
5. System auto-creates 3 stages (prewire, trim, commission)
6. Wire drop appears in list, ready for technician
```

### Completing a Wire Drop Stage
```
1. Technician opens wire drop detail
2. Selects stage tab (Prewire/Trim/Commission)
3. Takes photo -> sharePointStorageService.uploadWireDropPhoto()
4. (For Trim) Selects equipment from room inventory
5. Marks stage complete -> wireDropService.updateStage()
6. Milestone gauge recalculates automatically
```

### Ordering Equipment
```
1. PM imports CSV -> projectEquipmentService.importFromCSV()
2. Navigate to Procurement page
3. Items grouped by supplier automatically
4. Select items, click Generate PO
5. Review PO, add shipping, click Submit
6. PO status -> submitted, ordered_quantity updated
7. Prewire Orders gauge increases
```

---

## 📝 DEVELOPMENT GUIDELINES

### For AI Assistants Helping with This Project

1. **Always provide complete, copy-paste ready code**
2. **Specify exact file paths and line numbers for edits**
3. **Test suggestions mentally before recommending**
4. **Explain what changes do and why**
5. **Use existing patterns found in codebase:**
   - Services in /src/services/ follow class-based pattern
   - Components use functional React with hooks
   - Tailwind for all styling
   - React Query for server state where possible

### Code Conventions
- Components: PascalCase (e.g., WireDropDetail.js)
- Services: camelCase classes (e.g., wireDropService)
- Hooks: use prefix (e.g., useNetworkStatus.js)
- Constants: SCREAMING_SNAKE_CASE

### When Making Changes
1. Identify affected files
2. Check for related services/components
3. Consider impact on milestone calculations
4. Test authentication still works
5. Verify dark mode compatibility

---

## 📞 SUPPORT CONTEXT

**Owner:** Steve (Intelligent Systems)
**Technical Level:** Non-programmer, relies on AI assistance
**Preferred Help Style:**
- Step-by-step instructions
- Copy-paste ready solutions
- Explain in plain terms
- Show file paths explicitly

**Current Focus Areas:**
- Code cleanup and organization
- Documentation consolidation
- Performance optimization
- Feature completion (procurement, UniFi)

---

## 📍 Contact Address & Map Integration
**Changed:** 2025-12-02
**Files:** `src/components/PeopleManagement.js`, `src/modules/people/index.js`, `database/migrations/2025-12-02_expand_address_fields.sql`

Contacts now support full structured address entry with map integration:

**Database fields:**
- `address1` - Street address line 1
- `address2` - Apt, Suite, Unit, etc. (optional)
- `city` - City name
- `state` - State abbreviation (2 chars)
- `zip` - ZIP/Postal code
- `address` - Auto-consolidated single-line display version

**UI Features:**
- Full address form in People Management modal (Street, Apt/Suite, City, State, ZIP)
- Addresses automatically consolidated to single line for display
- Email, phone, and address are clickable inline links (text-width only, no icons)
- Email opens mail client, phone initiates call, address opens Google Maps
- Delete button inside edit modal only (clean UI - no delete in list view)
- Avatar is clickable to open edit (no separate edit button)
- Client-side search filtering for instant response

---

*Last Updated: December 2025*
*Document Version: 1.0*
