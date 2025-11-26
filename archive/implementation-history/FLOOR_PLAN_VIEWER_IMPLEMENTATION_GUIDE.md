# Floor Plan Viewer Implementation Guide

## Overview
This guide provides complete instructions for setting up and using the Wire Drop Floor Plan Viewer feature. This feature allows users to view floor plans with highlighted wire drop locations, complete with pan/zoom capabilities optimized for mobile devices.

## Architecture Summary

The system consists of:
1. **Database Schema**: Tables for storing floor plan metadata and wire drop associations
2. **Lucid API Integration**: Export floor plan images from Lucid Chart documents
3. **Storage Service**: Upload and manage floor plan images in Supabase Storage
4. **Processing Pipeline**: Cache floor plans and associate wire drops with shapes
5. **Viewer Component**: Mobile-optimized viewer with pan/zoom and pulsing highlights

---

## SETUP INSTRUCTIONS

### Phase 1: Database Migration

Run the database migration to create the necessary tables and columns:

```bash
# In Supabase Dashboard SQL Editor, execute:
```
```sql
-- Or run from command line:
psql -h your-supabase-host -U postgres -d postgres -f supabase/floor_plan_viewer_migration.sql
```

This migration adds:
- `lucid_document_id` and `lucid_document_url` columns to `projects` table
- New `lucid_pages` table for caching floor plan metadata
- Shape association columns to `wire_drops` table (`lucid_shape_id`, `lucid_page_id`, `shape_x`, `shape_y`, `shape_width`, `shape_height`)

### Phase 2: Create Supabase Storage Bucket

**IMPORTANT MANUAL STEP**

1. Go to your Supabase Dashboard
2. Navigate to **Storage** section
3. Click **New Bucket**
4. Create a bucket named: `floor-plans`
5. Set it to **Public** (required for image access)
6. (Optional) Configure RLS policies if needed for your security requirements

Example RLS Policy for authenticated users:
```sql
-- Allow authenticated users to read floor plans
CREATE POLICY "Allow authenticated read access"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'floor-plans');

-- Allow authenticated users to upload floor plans
CREATE POLICY "Allow authenticated upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'floor-plans');
```

### Phase 3: Verify Lucid API Configuration

Ensure your Lucid API key is properly configured:

**Development (.env.local):**
```env
REACT_APP_LUCID_API_KEY=your_lucid_api_key_here
```

**Production (Vercel Environment Variables):**
```env
LUCID_API_KEY=your_lucid_api_key_here
```

The system uses:
- **Development**: Direct API calls with `REACT_APP_LUCID_API_KEY`
- **Production**: Proxy endpoint (`/api/lucid-proxy`) with server-side `LUCID_API_KEY`

---

## ADMIN WORKFLOW

### Step 1: Connect Lucid Document to Project

1. **Get Lucid Document ID**
   - Open your floor plan in Lucid Chart
   - Copy the URL (e.g., `https://lucid.app/lucidchart/abc-123-def/edit`)
   - Extract the document ID: `abc-123-def`

2. **Update Project Record**
   ```javascript
   // In your admin interface or directly in database:
   await supabase
     .from('projects')
     .update({
       lucid_document_id: 'abc-123-def',
       lucid_document_url: 'https://lucid.app/lucidchart/abc-123-def/edit'
     })
     .eq('id', projectId);
   ```

### Step 2: Process and Cache Floor Plans

Use the floor plan processor to export images and cache metadata:

```javascript
import { processAndCacheFloorPlans } from './services/floorPlanProcessor';

// In your admin interface component:
async function handleImportFloorPlans(projectId, lucidDocumentId) {
  try {
    console.log('Starting floor plan import...');
    
    const result = await processAndCacheFloorPlans(
      projectId,
      lucidDocumentId,
      // apiKey is optional - will use env var if not provided
    );
    
    console.log(`Successfully cached ${result.pages.length} floor plan pages`);
    console.log(`Extracted ${result.shapes.length} shapes`);
    
    // Proceed to mapping step
    return result;
  } catch (error) {
    console.error('Floor plan import failed:', error);
    alert(`Error: ${error.message}`);
  }
}
```

### Step 3: Map Wire Drops to Shapes

After processing floor plans, use the WireDropMapper component to associate wire drops with shapes:

```jsx
import WireDropMapper from './components/WireDropMapper';

function AdminFloorPlanSetup({ projectId, documentData }) {
  const [showMapper, setShowMapper] = useState(false);
  
  async function handleProcessComplete(result) {
    // Floor plans cached, now show mapper
    setShowMapper(true);
  }
  
  return (
    <div>
      {showMapper ? (
        <WireDropMapper
          projectId={projectId}
          documentData={documentData}
          onSave={() => {
            alert('Wire drop associations saved!');
            setShowMapper(false);
          }}
          onCancel={() => setShowMapper(false)}
        />
      ) : (
        <button onClick={() => handleImportFloorPlans(projectId, lucidDocId)}>
          Import Floor Plans
        </button>
      )}
    </div>
  );
}
```

The WireDropMapper features:
- **Auto-matching**: Automatically matches wire drops to shapes by name/location
- **Manual linking**: Click a shape, then click a wire drop to link them
- **Visual feedback**: Shows which items are already associated
- **Batch save**: Save all associations at once

### Step 4: Verify Setup

After mapping, verify that wire drops are properly associated:

```sql
-- Check wire drops with floor plan associations
SELECT 
  id,
  name,
  location,
  lucid_shape_id,
  lucid_page_id,
  shape_x,
  shape_y
FROM wire_drops
WHERE project_id = 'your-project-id'
  AND lucid_shape_id IS NOT NULL;
```

---

## USER WORKFLOW

### Viewing a Wire Drop on Floor Plan

1. **Navigate to Wire Drop Details**
   - Go to wire drop details page: `/wire-drops/:id`

2. **Click "View on Floor Plan" Button**
   - Only visible if wire drop is linked to a shape
   - Navigates to: `/projects/:projectId/floor-plan?wireDropId=:id`

3. **Interactive Floor Plan Viewer**
   - Floor plan loads at 150% zoom centered on wire drop location
   - Wire drop location pulses with blue highlight
   - Pan by dragging
   - Pinch to zoom on mobile
   - Zoom controls available (+ / - / Reset / Center buttons)

### Preloading Floor Plans

Floor plans are automatically preloaded when viewing a project to improve performance:

```jsx
import { usePreloadFloorPlans } from './hooks/usePreloadFloorPlans';

function ProjectPage() {
  const { projectId } = useParams();
  const { loaded, progress } = usePreloadFloorPlans(projectId);
  
  return (
    <div>
      {!loaded && (
        <div className="preload-indicator">
          Loading floor plans... {progress}%
        </div>
      )}
      {/* Project content */}
    </div>
  );
}
```

---

## API REFERENCE

### Floor Plan Processor

```javascript
import { 
  processAndCacheFloorPlans,
  getCachedFloorPlans,
  getFloorPlanPage,
  deleteCachedFloorPlans,
  areFloorPlansCached
} from './services/floorPlanProcessor';

// Process and cache all floor plans for a project
const result = await processAndCacheFloorPlans(projectId, lucidDocumentId, apiKey);
// Returns: { pages: Array, shapes: Array }

// Get cached floor plans
const pages = await getCachedFloorPlans(projectId);

// Get specific page
const page = await getFloorPlanPage(projectId, pageId);

// Check if cached
const isCached = await areFloorPlansCached(projectId);

// Delete cached floor plans
await deleteCachedFloorPlans(projectId);
```

### Storage Service

```javascript
import { 
  uploadFloorPlanImage,
  deleteFloorPlanImage,
  deleteProjectFloorPlans,
  getFloorPlanImageUrl
} from './services/storageService';

// Upload image
const url = await uploadFloorPlanImage(imageBlob, projectId, pageId);

// Delete specific image
await deleteFloorPlanImage(projectId, pageId);

// Delete all project floor plans
await deleteProjectFloorPlans(projectId);

// Get public URL
const url = getFloorPlanImageUrl(projectId, pageId);
```

### Lucid API Extensions

```javascript
import { 
  exportDocumentPage,
  calculateContentBoundingBox
} from './services/lucidApi';

// Export page as PNG
const imageBlob = await exportDocumentPage(documentId, pageNumber, apiKey);

// Calculate bounding box for shapes
const bbox = calculateContentBoundingBox(shapes);
// Returns: { x, y, width, height }
```

---

## PERFORMANCE CONSIDERATIONS

### Rate Limiting
- Lucid API: 75 requests per 5 seconds
- The processor includes 100ms delays between page exports
- For large documents (10+ pages), processing may take 1-2 minutes

### Image Size
- Floor plan images are exported as PNG
- Typical size: 500KB - 2MB per page
- Images are cached in Supabase Storage
- Browser caching improves subsequent loads

### Pre-loading Strategy
- Images are preloaded when project page is opened
- Uses `usePreloadFloorPlans` hook
- Shows progress indicator
- Prevents delays when clicking "View on Floor Plan"

---

## TROUBLESHOOTING

### Issue: Floor plans not appearing

**Check:**
1. Storage bucket exists and is named `floor-plans`
2. Bucket is set to Public
3. Database migration ran successfully
4. `lucid_pages` table has records for the project

**Query to verify:**
```sql
SELECT * FROM lucid_pages WHERE project_id = 'your-project-id';
```

### Issue: Wire drop shape not highlighted

**Check:**
1. Wire drop has `lucid_shape_id` and `lucid_page_id` set
2. Shape coordinates are within bounding box
3. Page bounding box is calculated correctly

**Query to verify:**
```sql
SELECT 
  wd.name,
  wd.lucid_shape_id,
  wd.shape_x,
  wd.shape_y,
  lp.bounding_box
FROM wire_drops wd
JOIN lucid_pages lp ON wd.lucid_page_id = lp.page_id
WHERE wd.id = 'your-wire-drop-id';
```

### Issue: Export fails with 429 error

**Solution:**
- You've hit the rate limit (75 requests per 5 seconds)
- Wait 5 seconds and retry
- For large documents, process in smaller batches

### Issue: Images not uploading to storage

**Check:**
1. Storage bucket permissions
2. Bucket is named exactly `floor-plans`
3. RLS policies allow upload (if configured)
4. Supabase service role key is valid

---

## DATABASE SCHEMA

### lucid_pages Table
```sql
CREATE TABLE lucid_pages (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id),
  page_id TEXT NOT NULL,
  page_title TEXT,
  page_index INTEGER,
  image_url TEXT,
  image_width INTEGER,
  image_height INTEGER,
  bounding_box JSONB, -- { x, y, width, height }
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(project_id, page_id)
);
```

### wire_drops Extensions
```sql
ALTER TABLE wire_drops ADD COLUMN lucid_shape_id TEXT;
ALTER TABLE wire_drops ADD COLUMN lucid_page_id TEXT;
ALTER TABLE wire_drops ADD COLUMN shape_x NUMERIC;
ALTER TABLE wire_drops ADD COLUMN shape_y NUMERIC;
ALTER TABLE wire_drops ADD COLUMN shape_width NUMERIC;
ALTER TABLE wire_drops ADD COLUMN shape_height NUMERIC;
```

### projects Extensions
```sql
ALTER TABLE projects ADD COLUMN lucid_document_id TEXT;
ALTER TABLE projects ADD COLUMN lucid_document_url TEXT;
```

---

## FUTURE ENHANCEMENTS

Potential improvements (not yet implemented):
- **Edit Mode**: Drag shapes to update positions
- **Multi-select**: Highlight multiple wire drops at once
- **Offline Mode**: Download floor plans for offline viewing
- **AR Mode**: Overlay floor plan on camera view (iOS feature)
- **Annotations**: Add notes directly on floor plans
- **Version History**: Track changes to floor plan associations

---

## SUPPORT

For issues or questions:
1. Check this implementation guide
2. Review console logs for error details
3. Verify database schema with migration script
4. Check Supabase Storage bucket configuration
5. Confirm Lucid API key is valid

## Files Created

**Services:**
- `src/services/lucidApi.js` (extended)
- `src/services/storageService.js`
- `src/services/floorPlanProcessor.js`

**Components:**
- `src/components/WireDropMapper.jsx`
- `src/pages/FloorPlanViewer.jsx`
- `src/components/WireDropDetail.js` (extended)

**Hooks:**
- `src/hooks/usePreloadFloorPlans.js`

**Styles:**
- `src/styles/FloorPlanViewer.css`

**Database:**
- `supabase/floor_plan_viewer_migration.sql`

**Routes:**
- `/projects/:projectId/floor-plan?wireDropId=:id`
