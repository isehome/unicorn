# AGENT.md - Unicorn Project Guidelines

**⚠️ AI ASSISTANT: Read this ENTIRE file before writing any code.**

---

# PART 1: WHAT THIS APP IS

## Overview

**Unicorn** is a project management application for low-voltage installations (network cabling, AV systems, wire drops).

**Owner:** Steve / Intelligent Systems
**Tech Level:** Non-programmer (needs copy-paste ready code)
**Stack:** React 18, Supabase, Azure MSAL, Tailwind CSS, Vercel

---

## User Roles

### Technician (Field Worker)
- View assigned projects
- Complete wire drop stages (prewire → trim-out → commissioning)
- Upload stage photos
- Receive parts/equipment
- Log issues with photos

### Project Manager (PM)
- Everything technicians can do, PLUS:
- Create/manage projects
- Import equipment from CSV
- Generate purchase orders
- Manage vendors
- View progress gauges
- Configure integrations (Lucid, UniFi)

---

## Core Features

### 1. Wire Drop Management

Wire drops are cable installation points. Each goes through 3 stages:

| Stage | What Happens | Required |
|-------|--------------|----------|
| **Prewire** | Cable run from head-end to location | Photo |
| **Trim-Out** | Mount device, terminate cable | Photo + Equipment |
| **Commissioning** | Test, connect to network | Photo |

**Flow:**
```
Import from Lucid → Create Wire Drops → Assign Equipment → Complete Stages → Done
```

### 2. Equipment System (3 Tiers)

| Tier | Table | Purpose |
|------|-------|---------|
| Global Parts | `global_parts` | Master catalog (reusable) |
| Project Equipment | `project_equipment` | Instances for a project (from CSV import) |
| Wire Drop Links | `wire_drop_equipment_links` | Which equipment at which drop |

**CSV Import Flow:**
1. PM exports from D-Tools/proposal software
2. Upload CSV (Room, Part, Quantity columns)
3. System creates individual instances
4. Technician assigns to wire drops

### 3. Progress Gauges (Milestones)

| Gauge | What It Measures |
|-------|------------------|
| Planning | Has Lucid URL + Portal URL |
| Prewire Orders | % of prewire parts on submitted POs |
| Prewire Receiving | % of prewire parts received |
| Prewire Stages | % of wire drops with prewire photo |
| Trim Orders | % of trim parts ordered |
| Trim Receiving | % of trim parts received |
| Trim Stages | % of wire drops with trim photo + equipment |
| Commissioning | % of wire drops commissioned |

### 4. Procurement (Purchase Orders)

**Flow:**
```
Equipment imported → Group by supplier → Generate PO → Submit → Add tracking → Receive items
```

**PO Numbering:** `ProjectName-PO-2025-001-AMZN-001` (ProjectPrefix-Year-Sequence-Supplier-PerSupplierSeq)

#### Internal Inventory POs
When equipment can be fulfilled from warehouse stock (not ordered from external suppliers), the system creates an **Internal Inventory PO**:
- Supplier: "Internal Inventory" (auto-created)
- Auto-submitted immediately after creation
- Triggers inventory decrement on submit (not on receive)

**Why decrement on submit (not receive)?**
- **Reservation logic**: Once a PM commits to pulling inventory for a project, those items are "spoken for"
- **Prevents double-allocation**: Other projects can't claim the same inventory
- **Accurate availability**: Shows what's truly available vs. what's reserved
- **Simplicity**: No need to track "reserved but not pulled" state separately

This is the standard "allocate on commit" pattern used in warehouse management systems.

### 5. Photo Storage (SharePoint)

Photos stored in SharePoint with structure:
```
{project_url}/wire_drops/{Room}_{Drop}/PREWIRE_{timestamp}.jpg
{project_url}/issues/{Issue_Title}/{timestamp}.jpg
```

### 6. Integrations

| Integration | Purpose |
|-------------|---------|
| **Lucid Charts** | Import floor plans, create wire drops from shapes |
| **UniFi** | Match equipment to network clients by MAC |
| **SharePoint** | Photo storage |
| **Brady Printer** | Print equipment labels |

---

## Key Database Tables

| Table | Purpose |
|-------|---------|
| `projects` | Project records |
| `wire_drops` | Cable drop locations |
| `wire_drop_stages` | Stage completion tracking |
| `project_equipment` | Equipment per project |
| `global_parts` | Master parts catalog |
| `purchase_orders` | PO headers |
| `purchase_order_items` | PO line items |
| `issues` | Problems/issues |
| `contacts` | People |
| `suppliers` | Vendors |

---

## Key Files to Know

| Purpose | File |
|---------|------|
| Wire drop logic | `src/services/wireDropService.js` |
| Milestone calculations | `src/services/milestoneService.js` |
| Equipment management | `src/services/projectEquipmentService.js` |
| Auth context | `src/contexts/AuthContext.js` |
| Theme context | `src/contexts/ThemeContext.js` |
| Style system | `src/styles/styleSystem.js` |
| Main PM view | `src/components/PMProjectViewEnhanced.js` |
| Wire drop detail | `src/components/WireDropDetailEnhanced.js` |
| Date input component | `src/components/ui/DateInput.js` |
| Todo detail modal | `src/components/TodoDetailModal.js` |
| Calendar service | `src/services/microsoftCalendarService.js` |

---

# PART 2: HOW TO WORK ON THIS APP

## Project Structure

```
unicorn/
├── src/
│   ├── components/         # React components
│   ├── services/           # Business logic
│   ├── contexts/           # React contexts
│   ├── hooks/              # Custom hooks
│   ├── lib/                # Utilities
│   ├── styles/             # Style system
│   └── config/             # Configuration
├── api/                    # Vercel serverless functions
├── database/
│   ├── migrations/         # SQL migrations
│   └── scripts/            # SQL utilities
├── docs/                   # Documentation (UPDATE AFTER CHANGES)
└── AGENT.md                # This file
```

### File Location Rules

| Creating... | Put in... |
|-------------|-----------|
| React component | `src/components/` |
| Service class | `src/services/` |
| API endpoint | `api/` |
| SQL migration | `database/migrations/` |
| Documentation | `docs/` |

### NEVER
- ❌ Create files in root directory
- ❌ Create .md files outside `docs/`
- ❌ Create .sql files outside `database/`
- ❌ Create duplicate components (V2, New, etc.)

---

## Styling System

### Use ZINC, Not GRAY

```jsx
// ✅ CORRECT
bg-zinc-50 dark:bg-zinc-950
bg-white dark:bg-zinc-900
text-zinc-900 dark:text-zinc-100
text-zinc-600 dark:text-zinc-400
border-zinc-200 dark:border-zinc-700

// ❌ WRONG
bg-gray-50    // Never use gray!
bg-gray-900   // Never use gray!
```

### Dark Mode Required

Every color MUST have a `dark:` variant:

```jsx
// ✅ CORRECT
className="bg-white dark:bg-zinc-900"
className="text-zinc-900 dark:text-zinc-100"

// ❌ WRONG
className="bg-white"              // Missing dark!
className="text-zinc-900"         // Missing dark!
```

### Brand Colors - CRITICAL

**⚠️ DO NOT USE Tailwind's green/emerald classes for success states!**

| Purpose | Color | Usage |
|---------|-------|-------|
| Primary | `#8B5CF6` | `violet-500`, `violet-600` (hover) |
| Success | `#94AF32` | **INLINE STYLES ONLY** - see below |
| Warning | `#F59E0B` | `amber-500` |
| Danger | `#EF4444` | `red-500` |
| Info | `#3B82F6` | `blue-500` |

### ⚠️ SUCCESS/GREEN COLOR - MUST USE BRAND OLIVE GREEN

**NEVER use these Tailwind classes:**
- ❌ `text-green-*` (any shade)
- ❌ `bg-green-*` (any shade)
- ❌ `text-emerald-*` (any shade)
- ❌ `bg-emerald-*` (any shade)
- ❌ `#10B981`, `#22c55e`, `#16a34a` (emerald/green hex codes)

**ALWAYS use brand olive green `#94AF32`:**
```jsx
// ✅ CORRECT - Use inline styles for success/green
style={{ color: '#94AF32' }}
style={{ backgroundColor: 'rgba(148, 175, 50, 0.15)', color: '#94AF32' }}
style={{ accentColor: '#94AF32' }}  // for checkboxes

// ✅ CORRECT - Import from styleSystem
import { brandColors, stakeholderColors } from '../styles/styleSystem';
style={{ color: brandColors.success }}  // '#94AF32'

// ❌ WRONG - Tailwind green/emerald classes
className="text-green-600 bg-green-100"
className="text-emerald-500 bg-emerald-100"
```

**When to use brand olive green (#94AF32):**
- Completed/success status badges
- Received/installed indicators
- Checkmarks for completion
- External stakeholder indicators
- Progress bars at 75-99%
- Any "positive" state that isn't 100% complete

**Reference:** `src/styles/styleSystem.js` contains:
- `brandColors.success` = `#94AF32`
- `stakeholderColors.external.text` = `#94AF32`

---

## UI/UX Principles

### Clean UI - Hide Destructive Actions
**Delete buttons should be hidden from list views.** Place them inside edit/detail modals only.

```jsx
// ✅ CORRECT - Delete button inside edit modal (only visible when editing)
{showModal && (
  <div className="modal">
    <form>
      {/* form fields */}

      <div className="flex justify-between">
        {editingItem && (
          <Button variant="danger" onClick={handleDelete} icon={Trash2}>
            Delete
          </Button>
        )}
        <div className="flex gap-3 ml-auto">
          <Button variant="secondary" onClick={handleClose}>Cancel</Button>
          <Button variant="primary" type="submit">Save</Button>
        </div>
      </div>
    </form>
  </div>
)}

// ❌ WRONG - Delete button visible in list view
<div className="flex gap-2">
  <button onClick={handleEdit}><Edit /></button>
  <button onClick={handleDelete}><Trash2 /></button>  {/* NO! Hide this */}
</div>
```

### Clickable Avatars for Edit
Instead of separate edit buttons, make the avatar/icon clickable to open edit mode:

```jsx
// ✅ CORRECT - Avatar opens edit modal
<button
  onClick={() => handleEdit(item)}
  className="w-16 h-16 rounded-full transition-transform hover:scale-105 active:scale-95"
>
  <User className="w-8 h-8" />
</button>

// ❌ WRONG - Separate edit button clutters UI
<div className="flex gap-2">
  <div className="w-12 h-12 rounded-full"><User /></div>
  <button onClick={handleEdit}><Edit /></button>
</div>
```

### Inline Links (Not Block)
Clickable links should only span the text width, not the full container:

```jsx
// ✅ CORRECT - Inline link (clickable area = text only)
<div>
  <a href={`mailto:${email}`} className="inline text-violet-600 hover:underline">
    {email}
  </a>
</div>

// ❌ WRONG - Block link (entire row is clickable)
<a href={`mailto:${email}`} className="block text-violet-600">
  {email}
</a>
```

### Client-Side Search Filtering
For lists under ~500 items, filter client-side for instant response:

```jsx
// ✅ CORRECT - Fetch once, filter in memory
const { contacts: allContacts } = useContacts();

const filteredContacts = useMemo(() => {
  const term = searchTerm.toLowerCase();
  return allContacts.filter(c => c.name?.toLowerCase().includes(term));
}, [allContacts, searchTerm]);

// ❌ WRONG - Server query on every keystroke (causes page refresh feel)
const { contacts } = useContacts({ search: searchTerm });
```

---

## Component Patterns

### Card
```jsx
<div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-sm p-4">
```

### Primary Button
```jsx
<button className="px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg font-medium transition-colors">
```

### Secondary Button
```jsx
<button className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-600 rounded-lg transition-colors">
```

### Text Input
```jsx
<input className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 rounded-lg text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500" />
```

### Date Input - Use DateInput Component
**Always use the `DateInput` component for date fields.** It handles:
- Empty state: Grey background with "—" dash placeholder
- Filled state: Normal white/dark background with date value
- Prevents Safari/browser from showing past dates in red
- Consistent styling across light/dark modes

```jsx
import DateInput from './ui/DateInput';

// ✅ CORRECT - Use DateInput component
<DateInput
  value={dueDate}
  onChange={(e) => setDueDate(e.target.value)}
  disabled={saving}
/>

// ❌ WRONG - Raw HTML date input (inconsistent styling, browser quirks)
<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
```

**DateInput Styling Standards:**
- Empty: `bg-zinc-100 dark:bg-zinc-800` with grey dash "—"
- Filled: `bg-white dark:bg-zinc-700` with normal text
- NO orange/red backgrounds for empty or past dates
- Overrides WebKit datetime styling to prevent browser color changes

### Time Input
Time inputs should be wide enough to display the time clearly:

```jsx
// ✅ CORRECT - Wide enough, 16px font for iOS
<input
  type="time"
  value={startTime}
  onChange={(e) => setStartTime(e.target.value)}
  disabled={!dateIsSet}
  className={`w-32 px-3 py-2 border rounded-lg focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 ${
    !dateIsSet
      ? 'border-zinc-300 dark:border-zinc-600 bg-zinc-100 dark:bg-zinc-800 text-zinc-400 cursor-not-allowed'
      : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-50'
  }`}
  style={{ fontSize: '16px' }}  // Prevents iOS zoom
/>

// ❌ WRONG - Too narrow, no iOS zoom prevention
<input type="time" className="w-24 px-2 py-2" />
```

### Calendar Scheduling Section (for Todos)
When displaying calendar-related fields (Do Date, Start Time, Duration), group them in a dedicated section:

```jsx
<div className="p-4 rounded-xl border" style={{ borderColor: styles.card.borderColor, backgroundColor: withAlpha(palette.info, 0.05) }}>
  <div className="flex items-center gap-2 mb-3">
    <CalendarPlus size={18} style={{ color: palette.info }} />
    <span className="text-sm font-medium" style={styles.textPrimary}>
      Calendar Scheduling
    </span>
  </div>
  <div className="grid gap-4 grid-cols-3">
    <div>
      <label className="block text-xs font-medium mb-1.5" style={styles.textSecondary}>Do Date</label>
      <DateInput value={doBy} onChange={(e) => setDoBy(e.target.value)} />
    </div>
    <div>
      <label className="block text-xs font-medium mb-1.5" style={styles.textSecondary}>Start Time</label>
      <input type="time" ... />
    </div>
    <div>
      <label className="block text-xs font-medium mb-1.5" style={styles.textSecondary}>Duration (hrs)</label>
      <input type="number" ... />
    </div>
  </div>
</div>
```

### Status Badges
```jsx
// Success - USE INLINE STYLES with brand olive green (#94AF32)
<span
  className="px-2 py-1 rounded-full text-xs font-medium"
  style={{ backgroundColor: 'rgba(148, 175, 50, 0.15)', color: '#94AF32' }}
>
  Completed
</span>

// Warning - Tailwind amber is OK
<span className="px-2 py-1 bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-full text-xs font-medium">

// Error - Tailwind red is OK
<span className="px-2 py-1 bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 rounded-full text-xs font-medium">

// ❌ WRONG - Never use emerald/green Tailwind classes!
<span className="bg-emerald-100 text-emerald-700">  // NO!
<span className="bg-green-100 text-green-700">     // NO!
```

### Collapsible Sections
```jsx
// Layout: [Icon][Title] .............. [Badge][gap][Chevron]
// - Title only, NO descriptions
// - No gray backgrounds - use style={styles.card}
// - Badge (if any) on RIGHT, before chevron
// - ChevronRight rotates 90° when open
<button
  onClick={() => toggleSection('sectionName')}
  className="w-full flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md"
  style={styles.card}
>
  <div className="flex items-center gap-3">
    <Icon size={20} style={styles.textPrimary} />
    <span className="font-medium" style={styles.textPrimary}>Title</span>
  </div>
  <div className="flex items-center gap-3">
    {count > 0 && (
      <span className="px-2 py-0.5 text-xs rounded-full" style={styles.badge}>
        {count}
      </span>
    )}
    <ChevronRight
      size={20}
      className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
      style={styles.textSecondary}
    />
  </div>
</button>

{/* Expanded content */}
{isExpanded && (
  <div className="mt-4 rounded-2xl border p-4" style={styles.card}>
    {/* content */}
  </div>
)}
```

### Dropdown / Select
```jsx
<select
  value={selectedValue}
  onChange={(e) => setSelectedValue(e.target.value)}
  className="rounded-lg border px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
  style={{
    backgroundColor: mode === 'dark' ? '#0F172A' : '#FFFFFF',
    borderColor: mode === 'dark' ? '#1F2937' : '#D1D5DB'
  }}
>
  <option value="all">All Items</option>
  <option value="option1">Option 1</option>
</select>
```

### Navigation Link Buttons
```jsx
// Used for Equipment List, Receiving, Secure Data navigation
<button
  onClick={() => navigate(`/projects/${projectId}/equipment`)}
  className="flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md group"
  style={styles.card}
>
  <div className="flex items-center gap-3">
    <Package size={20} style={styles.textPrimary} />
    <span className="font-medium" style={styles.textPrimary}>Equipment List</span>
  </div>
  <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" style={styles.textSecondary} />
</button>
```

### Map Links - Use Apple Maps URLs
**Always use Apple Maps URLs for address links.** They open in the user's default maps app on iOS/macOS (usually Apple Maps), while still working on other platforms via browser.

```jsx
// ✅ CORRECT - Apple Maps URL (opens in default maps app on iOS/macOS)
const getMapUrl = (address) => {
  const encoded = encodeURIComponent(address);
  return `https://maps.apple.com/?q=${encoded}`;
};

// ❌ WRONG - Google Maps URL (always opens Google, not user's default)
const getMapUrl = (address) => {
  const encoded = encodeURIComponent(address);
  return `https://maps.google.com/?q=${encoded}`;  // NO!
};
```

### List Item with Clickable Avatar (People/Contacts Pattern)
```jsx
// Avatar is clickable to open edit modal - NO separate edit button in list
// Contact info (email, phone, address) are inline clickable links
<div className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4">
  <div className="flex items-start gap-4">
    <button
      onClick={() => handleEdit(person)}
      className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0 transition-transform hover:scale-105 active:scale-95"
      style={{ backgroundColor: `${accentColor}20` }}
    >
      <User className="w-8 h-8" style={{ color: accentColor }} />
    </button>
    <div className="flex-1 min-w-0">
      <h3 className="font-semibold text-zinc-900 dark:text-white">{name}</h3>
      <p className="text-sm" style={{ color: accentColor }}>{role}</p>
      <div className="mt-2 space-y-1">
        {/* Links are INLINE - clickable area is only the text width */}
        <div><a href={`mailto:${email}`} className="inline text-sm text-violet-600 hover:underline">{email}</a></div>
        <div><a href={`tel:${phone}`} className="inline text-sm text-violet-600 hover:underline">{phone}</a></div>
        <div><a href={mapUrl} className="inline text-sm text-violet-600 hover:underline">{address}</a></div>
      </div>
    </div>
  </div>
</div>
```

### Mobile-Responsive List Items
```jsx
// For equipment/parts lists on mobile - name on top, actions below
<div className="px-3 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-xl transition">
  {/* Top row: Chevron + Name */}
  <div className="flex items-center gap-3">
    <button className="flex-shrink-0 text-gray-400">
      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
    </button>
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{item.name}</p>
    </div>
  </div>

  {/* Bottom row: Status/Actions (indented under name) */}
  <div className="flex items-center gap-4 mt-2 ml-7">
    <label className="inline-flex items-center gap-1.5 text-xs">
      <input type="checkbox" className="h-4 w-4 rounded" />
      <span className="font-medium">Status</span>
    </label>
  </div>
</div>
```

### Page Container
```jsx
// Standard full-width page container
<div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20">
  <div className="max-w-7xl mx-auto px-4 py-6">
    {/* page content */}
  </div>
</div>
```

### AppHeader - Page Title & Back Button
The AppHeader component (`src/components/AppHeader.js`) handles the top navigation bar globally.

**DO NOT create custom back buttons or page titles in page components.** The AppHeader:
- Automatically shows a back button for all pages except `/`, `/pm-dashboard`, `/login`
- Displays the page title based on the current route

**When adding a new page:**
1. Add a route mapping in `AppHeader.js` inside the `pageTitle` useMemo:
```jsx
// In AppHeader.js pageTitle useMemo
if (p.startsWith('/your-new-page')) return 'Your Page Title';
```

2. Your page component should NOT include:
   - Custom back buttons (AppHeader handles this)
   - Page title headers (AppHeader displays the title)

3. Your page CAN include:
   - Subtitle/context info (e.g., project name)
   - Status indicators
   - Page-specific controls

```jsx
// ✅ CORRECT - Let AppHeader handle back button and title
const MyPage = () => {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 pb-20">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Optional: context info like project name */}
        <p className="text-zinc-600 dark:text-zinc-400 mb-6">Project: {projectName}</p>
        {/* Page content */}
      </div>
    </div>
  );
};

// ❌ WRONG - Don't duplicate back button or page title
const MyPage = () => {
  return (
    <div>
      <button onClick={() => navigate(-1)}>← Back</button>  {/* NO! */}
      <h1>My Page Title</h1>  {/* NO! AppHeader shows this */}
    </div>
  );
};
```

### Progress Colors
```jsx
const getProgressColor = (pct) => {
  if (pct === 100) return '#8B5CF6'; // violet
  if (pct >= 75) return '#94AF32';   // olive/success
  if (pct >= 50) return '#3B82F6';   // blue
  if (pct >= 25) return '#F59E0B';   // amber
  return '#EF4444';                   // red
};
```

---

## Database Rules

### Timestamp + User Tracking - MANDATORY

**⚠️ CRITICAL: Every timestamp field MUST have a corresponding user field!**

When setting any `*_at` timestamp field, you MUST also capture the authenticated user in a corresponding `*_by` field.

---

#### ⚠️ IMPORTANT: MSAL Auth vs Supabase Auth

**This app uses Microsoft MSAL for authentication, NOT Supabase Auth!**

This means:
- `supabase.auth.getUser()` will ALWAYS return `null`
- You MUST get the user from React's `useAuth()` hook in components
- You MUST pass the user ID explicitly from components to services

```javascript
// ❌ WRONG - This will ALWAYS be null in our app!
const { data: { user } } = await supabase.auth.getUser();
// user is null because we use MSAL, not Supabase Auth

// ✅ CORRECT - Get user from MSAL auth context in component
import { useAuth } from '../contexts/AuthContext';

const MyComponent = () => {
  const { user } = useAuth();  // MSAL user from Microsoft Graph

  // user.id = Microsoft Graph user ID (UUID)
  // user.displayName = "Steve Blansette" (display name from Microsoft)

  const handleAction = async () => {
    // Pass user explicitly to service functions
    await myService.updateSomething(itemId, user.id);
  };
};
```

---

#### User ID Storage: UUID vs Display Name

**⚠️ CRITICAL: Different tables store user info differently!**

| Table | Field | Stores | Example Value |
|-------|-------|--------|---------------|
| `project_equipment` | `*_by` fields | UUID | `abc123-def456-...` |
| `purchase_orders` | `*_by` fields | UUID | `abc123-def456-...` |
| `purchase_order_items` | `received_by` | UUID | `abc123-def456-...` |
| `wire_drop_stages` | `completed_by` | **DISPLAY NAME** | `"Steve Blansette"` |
| `profiles` | `id` | UUID | `abc123-def456-...` |

**Why does `wire_drop_stages.completed_by` store display name?**
- Historical design decision for simpler UI display
- When checking a wire drop stage checkbox, the display name is stored directly
- This avoids a lookup when displaying "Completed by: Steve Blansette"

**How to detect UUID vs Display Name:**
```javascript
// Check if value looks like a UUID (36 chars with dashes in specific positions)
const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

if (isUUID) {
  // Look up display name from profiles table
  const { data } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', value)
    .single();
  displayName = data?.full_name || data?.email || 'Unknown User';
} else {
  // It's already a display name - use directly
  displayName = value;
}
```

---

#### Fallback User Lookups for Auto-Completed Status

When equipment status is auto-completed by another part of the system (e.g., Installed status derived from wire drop completion), the direct `*_by` field may be null. You MUST implement fallback lookups.

**Example: Equipment Status User Resolution**

```javascript
// In DateDetailModal or similar component showing "Completed by: ___"

const resolveUserForStatus = async (equipmentId, statusType) => {
  // 1. First try the direct field on project_equipment
  const { data: equipment } = await supabase
    .from('project_equipment')
    .select(`${statusType}_by`)
    .eq('id', equipmentId)
    .single();

  if (equipment?.[`${statusType}_by`]) {
    return await lookupUserName(equipment[`${statusType}_by`]);
  }

  // 2. Fallback lookups based on status type
  switch (statusType) {
    case 'ordered':
    case 'received':
      // Look in purchase_order_items -> purchase_orders
      const { data: poItems } = await supabase
        .from('purchase_order_items')
        .select('purchase_order_id')
        .eq('project_equipment_id', equipmentId);

      if (poItems?.length > 0) {
        const { data: po } = await supabase
          .from('purchase_orders')
          .select('submitted_by, created_by')
          .eq('id', poItems[0].purchase_order_id)
          .single();

        const userId = statusType === 'ordered'
          ? (po?.submitted_by || po?.created_by)
          : po?.created_by;

        if (userId) return await lookupUserName(userId);
      }
      break;

    case 'installed':
      // Look in wire_drop_stages via wire_drop_equipment_links
      const { data: links } = await supabase
        .from('wire_drop_equipment_links')
        .select('wire_drop_id')
        .eq('project_equipment_id', equipmentId);

      if (links?.length > 0) {
        const wireDropIds = links.map(l => l.wire_drop_id);
        const { data: stages } = await supabase
          .from('wire_drop_stages')
          .select('completed_by, completed_at')
          .eq('stage_type', 'trim_out')
          .eq('completed', true)
          .in('wire_drop_id', wireDropIds)
          .order('completed_at', { ascending: false })
          .limit(1);

        const completedBy = stages?.[0]?.completed_by;
        if (completedBy) {
          // IMPORTANT: Check if UUID or display name!
          const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(completedBy);
          if (isUUID) {
            return await lookupUserName(completedBy);
          } else {
            // Already a display name - return directly
            return completedBy;
          }
        }
      }
      break;
  }

  return null; // No user found
};
```

---

#### Profile Sync on Login

When users authenticate via MSAL, their profile is synced to Supabase's `profiles` table for audit trail lookups:

```javascript
// In AuthContext.js - loadUserProfile function
// This runs after successful MSAL authentication

const enrichedUser = {
  id: profile.id,           // Microsoft Graph user ID
  email: profile.mail,
  displayName: profile.displayName,
  // ... other fields
};

// Sync to Supabase for later lookups
await supabase
  .from('profiles')
  .upsert({
    id: enrichedUser.id,
    email: enrichedUser.email,
    full_name: enrichedUser.displayName,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
```

This ensures that UUID-based user lookups can resolve to display names even for users who haven't logged in recently.

---

#### Standard User Lookup Helper

Use this pattern when looking up user display names:

```javascript
const fetchUserName = async (uid, currentUser) => {
  if (!uid) return { name: null, found: false };

  // 1. If this is the current logged-in user, use their display name directly
  //    (avoids profile table lookup which may not be synced yet)
  if (currentUser?.id === uid && currentUser?.displayName) {
    return { name: currentUser.displayName, found: true };
  }

  // 2. Try to look up from profiles table
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', uid)
    .single();

  if (!error && data) {
    const resolvedName = data.full_name || data.email;
    if (resolvedName) {
      return { name: resolvedName, found: true };
    }
  }

  // 3. Fallback for current user if profile lookup failed
  if (currentUser?.id === uid) {
    return {
      name: currentUser.displayName || currentUser.email || 'Current User',
      found: true
    };
  }

  return { name: null, found: false };
};
```

---

#### Service Function Pattern

When writing service functions that update timestamps:

```javascript
// ✅ CORRECT - Accept userId as parameter
async updateStatus(equipmentId, status, userId) {
  if (!userId) {
    throw new Error('User ID is required for status updates');
  }

  const updates = {
    [`${status}_confirmed`]: true,
    [`${status}_confirmed_at`]: new Date().toISOString(),
    [`${status}_confirmed_by`]: userId  // Passed from component
  };

  return await supabase
    .from('project_equipment')
    .update(updates)
    .eq('id', equipmentId);
}

// ❌ WRONG - Trying to get user in service (will be null!)
async updateStatus(equipmentId, status) {
  const { data: { user } } = await supabase.auth.getUser();
  // user is ALWAYS null because we use MSAL!
}
```

---

**Standard field naming pattern:**
| Action Field | Timestamp Field | User Field |
|--------------|-----------------|------------|
| `completed` | `completed_at` | `completed_by` |
| `submitted` | `submitted_at` | `submitted_by` |
| `approved` | `approved_at` | `approved_by` |
| `received` | `received_at` / `received_date` | `received_by` |
| `delivered_confirmed` | `delivered_confirmed_at` | `delivered_confirmed_by` |
| `installed` | `installed_at` | `installed_by` |
| `cancelled` | `cancelled_at` | `cancelled_by` |
| N/A | `created_at` | `created_by` |
| N/A | `updated_at` | `updated_by` |

**Rules Summary:**
1. NEVER use `supabase.auth.getUser()` - it returns null (we use MSAL)
2. ALWAYS get user from `useAuth()` hook in components
3. ALWAYS pass userId explicitly from components to services
4. NEVER set a timestamp without also setting the corresponding user field
5. When displaying user info, check if value is UUID or display name
6. Implement fallback lookups for auto-completed statuses
7. Profile sync on login enables UUID → display name resolution

### RLS Policies - CRITICAL

We use MSAL (not Supabase Auth). ALL policies MUST include `anon`:

```sql
-- ✅ CORRECT
CREATE POLICY "name" ON public.table
FOR ALL TO anon, authenticated
USING (true);

-- ❌ WRONG (will silently fail!)
CREATE POLICY "name" ON public.table
FOR ALL TO authenticated  -- Missing anon!
USING (true);
```

### Migration Format
```sql
-- File: database/migrations/YYYY-MM-DD_description.sql
ALTER TABLE table ADD COLUMN IF NOT EXISTS col type;
```

---

## Documentation Rules

### MANDATORY: Update Docs After Every Change

| Change Type | Update File |
|-------------|-------------|
| New feature | `docs/PROJECT_OVERVIEW.md` |
| Wire drops | `docs/WIRE_DROPS.md` |
| Equipment | `docs/EQUIPMENT.md` |
| Procurement | `docs/PROCUREMENT.md` |
| Milestones | `docs/MILESTONES.md` |
| Auth/RLS | `docs/AUTHENTICATION.md` |
| Integrations | `docs/INTEGRATIONS.md` |
| Bug fix | `docs/TROUBLESHOOTING.md` |
| Styling | `docs/STYLES.md` |

### Update Format
```markdown
### Feature Name
**Changed:** YYYY-MM-DD
**Files:** `src/components/File.js`
Description of change.
```

---

## Code Standards

### React Component
```jsx
import { useState } from 'react';
import { Icon } from 'lucide-react';

const MyComponent = ({ prop }) => {
  const [state, setState] = useState(null);
  
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg p-4">
      {/* content */}
    </div>
  );
};

export default MyComponent;
```

### Service Class
```javascript
import { supabase } from '../lib/supabase';

class MyService {
  async getData() {
    const { data, error } = await supabase.from('table').select('*');
    if (error) throw error;
    return data;
  }
}

export const myService = new MyService();
```

---

## Environment Variables

```bash
REACT_APP_SUPABASE_URL=
REACT_APP_SUPABASE_ANON_KEY=
REACT_APP_AZURE_CLIENT_ID=
REACT_APP_AZURE_TENANT_ID=
REACT_APP_UNIFI_API_KEY=        # Optional
REACT_APP_LUCID_CLIENT_ID=      # Optional
REACT_APP_LUCID_CLIENT_SECRET=  # Optional
```

---

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/unifi-proxy` | UniFi API proxy |
| `/api/lucid-proxy` | Lucid API proxy |
| `/api/graph-upload` | SharePoint upload |
| `/api/graph-file` | SharePoint download |
| `/api/sharepoint-thumbnail` | Get thumbnails |
| `/api/public-po` | Public PO view |

---

## Mobile App UX - CRITICAL

**⚠️ This is a MOBILE-FIRST app used by field technicians. It MUST behave like a native app, NOT a web page!**

### Core Principle

The app should feel solid and stable. Pages should NOT:
- Pan, scroll, or zoom unexpectedly
- Jump around when inputs receive focus
- Have double-tap delays
- Feel "web-like" with browser default behaviors

### Input Elements - Prevent iOS Zoom/Scroll

iOS Safari zooms in when the font size of an input is less than 16px. **Always use minimum 16px font size on inputs:**

```jsx
// ✅ CORRECT - Prevents iOS auto-zoom
<input
  type="number"
  inputMode="numeric"
  pattern="[0-9]*"
  className="..."
  style={{ fontSize: '16px' }}  // Critical for iOS!
/>

// ❌ WRONG - Will cause iOS zoom
<input
  type="number"
  className="text-sm"  // 14px - too small, causes zoom!
/>
```

### Touch-Friendly Buttons

All buttons must be touch-friendly with proper event handling:

```jsx
// ✅ CORRECT - Mobile-optimized button
<button
  type="button"
  onTouchEnd={(e) => {
    e.preventDefault();  // Prevents double-firing
    handleAction();
  }}
  onClick={handleAction}
  className="min-h-[44px] min-w-[44px] touch-manipulation active:bg-blue-800 transition-colors"
>
  Action
</button>

// ❌ WRONG - Missing touch handling
<button onClick={handleAction} className="px-2 py-1">
  Too small, no touch handling
</button>
```

**Required Button Attributes:**
- `type="button"` - Prevents accidental form submission
- `onTouchEnd` with `e.preventDefault()` - Handles touch events properly
- `min-h-[44px]` - Apple's minimum touch target (44x44 points)
- `touch-manipulation` - Disables double-tap zoom
- `active:` state - Visual feedback on touch

### Number Inputs for Mobile

When receiving quantities or entering numbers:

```jsx
// ✅ CORRECT - Mobile-optimized number input
<input
  type="number"
  inputMode="numeric"    // Shows number pad on mobile
  pattern="[0-9]*"       // iOS numeric keyboard
  min="0"
  style={{ fontSize: '16px' }}
  className="..."
/>
```

### State Management for Mobile Forms

Mobile keyboards and touch events can cause state issues. Track form values redundantly:

```jsx
// ✅ CORRECT - Redundant state tracking for mobile
const [quantity, setQuantity] = useState(0);
const [pendingQuantity, setPendingQuantity] = useState(null);

const handleChange = (e) => {
  const val = parseInt(e.target.value, 10) || 0;
  setQuantity(val);
  setPendingQuantity(val);  // Backup in case state gets weird
};

const handleSave = () => {
  const valueToSave = pendingQuantity !== null ? pendingQuantity : quantity;
  // Use valueToSave...
};
```

### Prevent Page Scrolling/Bouncing

Add to the app's root CSS or index.html:

```css
/* Prevents overscroll bounce */
html, body {
  overscroll-behavior: none;
}

/* Prevents pull-to-refresh on mobile */
body {
  overscroll-behavior-y: contain;
}
```

### Mobile Testing Checklist

Before any feature is complete, test on a real phone:

- [ ] Tap buttons - do they respond immediately?
- [ ] Tap inputs - does the page zoom/scroll unexpectedly?
- [ ] Enter text - does the keyboard cause layout shifts?
- [ ] Submit forms - does the page jump around?
- [ ] Scroll content - is it smooth, no rubber-banding issues?
- [ ] Use in portrait AND landscape mode

---

## Common Issues

| Problem | Solution |
|---------|----------|
| Auth hangs | Check Azure redirect URIs |
| Photos not loading | Verify SharePoint URL on project |
| RLS errors | Add `anon` to policy |
| Wrong milestone % | Check `required_for_prewire` flags |
| Page zooms on iOS input | Add `style={{ fontSize: '16px' }}` to input |
| Buttons unresponsive on mobile | Add `onTouchEnd` handler with `e.preventDefault()` |
| Form resets on mobile | Track state redundantly with pendingValue pattern |

---

## Checklist Before Finishing

- [ ] Used `zinc` (not `gray`)
- [ ] All colors have `dark:` variants
- [ ] **NO `green-*` or `emerald-*` Tailwind classes** - use `#94AF32` inline styles
- [ ] **All timestamps have corresponding user fields** (`*_at` paired with `*_by`)
- [ ] **User ID comes from `useAuth()` hook, NOT `supabase.auth.getUser()`**
- [ ] **Service functions accept userId as parameter (don't try to get it internally)**
- [ ] **UUID vs Display Name handled correctly** (check `wire_drop_stages.completed_by`)
- [ ] **Date inputs use `DateInput` component** (not raw `<input type="date">`)
- [ ] **Map/address links use Apple Maps** (`maps.apple.com`, not `maps.google.com`)
- [ ] Files in correct locations
- [ ] Database policies include `anon`
- [ ] Updated relevant doc in `docs/`
- [ ] Removed console.log statements (except diagnostic ones during development)

### Mobile UX Checklist (CRITICAL for field technician pages)
- [ ] All inputs have `style={{ fontSize: '16px' }}` to prevent iOS zoom
- [ ] All buttons have `type="button"` and `onTouchEnd` handlers
- [ ] All interactive elements are at least 44x44px (`min-h-[44px]`)
- [ ] Buttons have `touch-manipulation` class to prevent double-tap zoom
- [ ] Form state is tracked redundantly for mobile reliability
- [ ] Tested on actual mobile device - no unexpected scrolling/zooming

---

## How to Help Steve

1. **Provide complete, copy-paste ready code**
2. **Include exact file paths**
3. **Explain in plain terms**
4. **Show documentation updates in same response**
5. **Follow all patterns above exactly**

---

**This file is the single source of truth. Follow it exactly.**

---

# PART 3: AI & VOICE COPILOT ARCHITECTURE

## Overview

The AI integration in Unicorn follows the **"Copilot" Architecture** (Option B).
- **Goal**: A "Field Partner" that assists via voice/chat.
- **Rule**: The AI acts as a **Power User**, using "Tools" to click buttons, navigate, and save data. It DOES NOT access the database directly.
- **Safety**: App logic (validations, state) remains the source of truth.

## Core Components

### 1. Global AI Provider (`VoiceCopilotContext.js`)
- Manages the WebSocket connection to Gemini Live.
- Handles Audio I/O (Microphone & Speaker).
- Manages the "Tool Registry".

### 2. Tool Registry System
Capabilities are "injected" based on the current page to give context-aware skills.

**Global Tools (Always Available):**
- `navigate_to(url)`
- `search_contacts(query)`
- `create_task(title)`

**Context Tools (Page Specific):**
- **ShadeManager**: `registerTool({ set_measurement, list_shades })`
- **IssueManager**: `registerTool({ update_priority, close_issue })`

### 3. User Settings (`AISettings.js`)
- **Persona Config**: Users can adjust the "verbosity" and "personality" of their helper.
- **Voice Selection**: Choose TTS voice (Puck/Charon).
- **Custom Instructions**: Stored in `user_preferences` table.

## Implementation Guidelines

### A. How to Add a New Skill
1.  **Define the Tool**:
    ```javascript
    const myTool = {
      name: "update_status",
      description: "Updates the status of the current item",
      parameters: { status: "string" },
      execute: async ({ status }) => { await updateStatus(status); }
    };
    ```
2.  **Register on Mount**:
    ```javascript
    useEffect(() => {
      registerTools([myTool]);
      return () => unregisterTools([myTool]);
    }, []);
    ```

### B. The "Listener" Persona
- The AI is instructed to be concise.
- It proactively asks for missing data ("Width is set. What is the Height?").
- It validates inputs using the App's own validation logic (via the Tool).

## Key Files
- `src/contexts/VoiceCopilotContext.js` (The Brain)
- `src/components/UserSettings/AISettings.js` (The Configuration)
- `src/hooks/useVoiceMeasurement.js` (Legacy/Specific prototype logic, moving to Registry)

---

# PART 4: EXTERNAL PORTALS (PUBLIC ACCESS)

## Overview

External portals allow stakeholders (designers, clients) to access project information without logging into the main app. They use:
- **Token-based authentication** with SHA-256 hashing
- **OTP verification** via email
- **Session tokens** stored in browser localStorage

## Portal Types

| Portal | Route | API | Purpose |
|--------|-------|-----|---------|
| Issue Portal | `/public/issues/:token` | `/api/public-issue` | View/comment on issues |
| Shade Portal | `/shade-portal/:token` | `/api/public-shade` | Review shade measurements |

## Key Architecture

### Token Flow
1. Internal user generates link → token created + hashed → stored in DB
2. External user visits URL with token
3. API hashes incoming token → compares to DB hash
4. If match, show OTP verification
5. After OTP verified, create session token → stored in localStorage

### Files
| Component | File |
|-----------|------|
| Issue Portal UI | `src/pages/PublicIssuePortal.js` |
| Shade Portal UI | `src/pages/PublicShadePortal.js` |
| Issue API | `api/public-issue.js` |
| Shade API | `api/public-shade.js` |
| Shade Link Service | `src/services/shadePublicAccessService.js` |

### Database Tables
- `issue_public_access_links` - Issue portal tokens
- `shade_public_access_links` - Shade portal tokens

## Standalone Portal Pattern

**External portals must be STANDALONE** - they cannot use internal contexts like `ThemeContext` because:
1. External users are not authenticated
2. Portals may be embedded or opened separately
3. Must work without any app state

```jsx
// ✅ CORRECT - Inline styles, no context dependencies
const PublicShadePortal = () => {
  const styles = {
    container: { minHeight: '100vh', backgroundColor: '#f9fafb' },
    card: { backgroundColor: '#ffffff', borderRadius: '12px', padding: '24px' }
  };

  return <div style={styles.container}>...</div>;
};

// ❌ WRONG - Depends on ThemeContext (will crash for external users)
const PublicShadePortal = () => {
  const { mode } = useTheme();  // External users don't have this!
  return <div className={mode === 'dark' ? 'bg-zinc-900' : 'bg-white'}>...</div>;
};
```

## External Links in Portals

### Lutron Fabric Search Links
**Use `/search/results` endpoint** - it auto-executes the search:

```jsx
// ✅ CORRECT - Auto-executes search
href={`https://www.lutronfabrics.com/us/en/search/results?q=${encodeURIComponent(fabricCode)}`}

// ❌ WRONG - Just shows search page, doesn't execute
href={`https://www.lutronfabrics.com/us/en/search?q=${encodeURIComponent(fabricCode)}`}
```

### Link Click Handlers
Always add `onClick={(e) => e.stopPropagation()}` to prevent parent handlers from blocking:

```jsx
<a
  href={fabricUrl}
  target="_blank"
  rel="noopener noreferrer"
  onClick={(e) => e.stopPropagation()}  // Critical!
>
  {fabricCode}
</a>
```

## Service Role vs RLS

External portal APIs use Supabase **service role key** to bypass RLS. However:
- Some tables may have restrictive RLS that blocks even service role
- Handle missing data gracefully (don't block the portal)

```javascript
// ✅ CORRECT - Handle RLS blocking gracefully
const project = await fetchProject(link.project_id);
if (!project) {
  console.log('[PublicShade] Project not found (RLS?)', link.project_id);
  // Continue without project data - don't block the portal
}

// ❌ WRONG - Blocking on missing project
if (!project) {
  return { status: 'invalid', reason: 'project_not_found' };
}
```

## Comments System (Reusable Pattern)

Both Issue and Shade portals use the same comment pattern:
- Comments stored in `{type}_comments` table
- `is_internal` flag for internal-only comments (not shown to external users)
- Collapsible by default on external portal
- External users can add comments (marked as external)

### Comment Table Schema
```sql
CREATE TABLE shade_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shade_id UUID REFERENCES project_shades(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id),
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Troubleshooting External Portals

| Issue | Cause | Fix |
|-------|-------|-----|
| "Link not found" | Token hash mismatch | Check hashing algorithm matches (SHA-256) |
| Project shows null | RLS blocking service role | Add policy: `CREATE POLICY service_role_select ON projects FOR SELECT TO service_role USING (true);` |
| Fabric link doesn't search | Using `/search` not `/search/results` | Change URL to `/search/results?q=` |
| Link doesn't open | Missing stopPropagation | Add `onClick={(e) => e.stopPropagation()}` |
| Orphaned links | Project deleted | Run cleanup: `DELETE FROM shade_public_access_links WHERE project_id NOT IN (SELECT id FROM projects);` |