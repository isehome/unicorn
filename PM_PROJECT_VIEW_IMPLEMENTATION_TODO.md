# PM Project View - Complete Implementation TODO

## Current Status
The route `/pm/project/:projectId` uses `PMProjectViewEnhanced.js` component.

## Issues Found
1. ✅ URL fields (wiring_diagram_url, portal_proposal_url, one_drive_*) are in formData state but:
   - ❌ NOT loaded from database in loadProjectData()
   - ❌ NOT saved to database in handleSave()
   - ❌ NOT displayed in the UI form

2. ❌ Lucid integration not implemented:
   - State variables added but no functions
   - No UI for Lucid data display
   - No batch create functionality

## Required Changes to src/components/PMProjectViewEnhanced.js

### 1. Update loadProjectData() to load URL fields
```javascript
setFormData({
  name: currentProject.name || '',
  client: currentProject.client || '',
  address: currentProject.address || '',
  phase: currentProject.phase || '',
  status: currentProject.status || 'active',
  project_number: currentProject.project_number || '',
  description: currentProject.description || '',
  start_date: currentProject.start_date || '',
  end_date: currentProject.end_date || '',
  // ADD THESE:
  wiring_diagram_url: currentProject.wiring_diagram_url || '',
  portal_proposal_url: currentProject.portal_proposal_url || '',
  one_drive_photos: currentProject.one_drive_photos || '',
  one_drive_files: currentProject.one_drive_files || '',
  one_drive_procurement: currentProject.one_drive_procurement || ''
});
```

### 2. Update handleSave() to save URL fields
```javascript
const validFields = {
  name: formData.name,
  client: formData.client,
  address: formData.address,
  phase: formData.phase,
  status: formData.status,
  project_number: formData.project_number,
  description: formData.description,
  start_date: formData.start_date || null,
  end_date: formData.end_date || null,
  // ADD THESE:
  wiring_diagram_url: formData.wiring_diagram_url || null,
  portal_proposal_url: formData.portal_proposal_url || null,
  one_drive_photos: formData.one_drive_photos || null,
  one_drive_files: formData.one_drive_files || null,
  one_drive_procurement: formData.one_drive_procurement || null
};
```

### 3. Add URL Fields UI (after description field, in edit mode only)
```jsx
{editMode && (
  <div className="md:col-span-2 border-t border-gray-200 dark:border-gray-700 pt-4">
    <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-white flex items-center gap-2">
      <Link className="w-4 h-4" />
      Setup URLs
    </h3>
    
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          <FileText className="w-4 h-4 inline mr-1" />
          Wiring Diagram URL
        </label>
        <input
          type="url"
          name="wiring_diagram_url"
          value={formData.wiring_diagram_url}
          onChange={handleInputChange}
          placeholder="https://lucid.app/..."
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          <FileText className="w-4 h-4 inline mr-1" />
          Portal Proposal URL
        </label>
        <input
          type="url"
          name="portal_proposal_url"
          value={formData.portal_proposal_url}
          onChange={handleInputChange}
          placeholder="https://..."
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          <Camera className="w-4 h-4 inline mr-1" />
          OneDrive Photos
        </label>
        <input
          type="url"
          name="one_drive_photos"
          value={formData.one_drive_photos}
          onChange={handleInputChange}
          placeholder="https://..."
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          <FolderOpen className="w-4 h-4 inline mr-1" />
          OneDrive Files
        </label>
        <input
          type="url"
          name="one_drive_files"
          value={formData.one_drive_files}
          onChange={handleInputChange}
          placeholder="https://..."
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          <FolderOpen className="w-4 h-4 inline mr-1" />
          OneDrive Procurement
        </label>
        <input
          type="url"
          name="one_drive_procurement"
          value={formData.one_drive_procurement}
          onChange={handleInputChange}
          placeholder="https://..."
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg"
        />
      </div>
    </div>
  </div>
)}
```

### 4. Add Lucid Functions
See src/components/PMProjectView.js for reference - copy:
- loadLucidData()
- handleBatchCreateWireDrops()
- Add useEffect to load Lucid data when wiring_diagram_url changes

### 5. Add Lucid UI Section
Add before Phase Milestones section:
- Display Lucid stats (shapes count, droppable shapes)
- List of droppable shapes with checkboxes
- Select All / Deselect All buttons
- Batch Create button
- Logic to prevent duplicates

## Next Steps
1. Update loadProjectData to include URL fields
2. Update handleSave to save URL fields
3. Add URL fields UI in edit mode
4. Add Lucid functions
5. Add Lucid UI section
6. Test thoroughly
