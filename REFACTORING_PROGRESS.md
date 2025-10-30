# Project Detail View Refactoring Progress

## Overview
The ProjectDetailView.js file is being refactored from a massive 2,332-line monolithic component into smaller, focused, maintainable pieces.

## Current Status

### ✅ Completed Work

#### 1. Cleanup Phase (Commit: 74aa951)
- Removed unused imports: `ExternalLink`, `Key`, `AlertCircle`, `ChevronDown`
- Removed unused service imports: `projectEquipmentService`, `projectProgressService`
- Removed unused `projectProgress` state and its database loading logic
- Removed unused `progress` variable (wire drop completion calculation)
- **Reduction**: 2,332 → 2,298 lines (34 lines removed)

#### 2. ProjectLinks Component Extraction (Commit: e05066f)
- Created `src/components/project-detail/ProjectLinks.jsx` (143 lines)
- Extracted bottom navigation buttons: Equipment, Receiving, Secure Data
- Extracted external link buttons: Photos, Files, Procurement, Portal Proposal
- **Reduction**: 2,298 → 2,212 lines (86 lines removed)

#### 3. IssuesSection Component Extraction (Commit: 02b92ac)
- Created `src/components/project-detail/IssuesSection.jsx` (115 lines)
- Extracted project issues list with resolved/unresolved filtering
- Extracted issue status badges and navigation to issue details
- Extracted "New Issue" button functionality
- **Reduction**: 2,212 → 2,153 lines (59 lines removed)

### 📊 Current State
- **ProjectDetailView.js**: 2,153 lines (from 2,332)
- **Total reduction so far**: 179 lines (8%)
- **New components created**: 2 (ProjectLinks.jsx, IssuesSection.jsx)

## Remaining Work

### Major Sections Still in Main File

These sections need to be extracted into separate components:

#### 1. IssuesSection (~100-150 lines)
- **Location**: Around line ~1995 (`toggleSection('issues')`)
- **Responsibilities**:
  - Display list of project issues
  - Filter by resolved/unresolved status
  - Create new issues
  - Update/resolve existing issues
- **State dependencies**:
  - `issues` array
  - `showResolvedIssues` toggle
  - Issue CRUD handlers
- **Suggested filename**: `src/components/project-detail/IssuesSection.jsx`

#### 2. TodosSection (~200-250 lines)
- **Location**: Around line ~1793 (`toggleSection('todos')`)
- **Responsibilities**:
  - Display todo list with drag-and-drop reordering
  - Add new todos
  - Mark todos complete/incomplete
  - Delete todos
  - Filter completed/incomplete
- **State dependencies**:
  - `todos` array
  - `showCompletedTodos` toggle
  - `newTodo` input state
  - Todo CRUD handlers
  - Drag and drop state variables
- **Suggested filename**: `src/components/project-detail/TodosSection.jsx`

#### 3. WireDropsSection (~400-500 lines) ⚠️ LARGEST SECTION
- **Location**: Around line ~1573 (`toggleSection('wireDrops')`)
- **Responsibilities**:
  - Display wire drops list with search/filter
  - Show wire drop details (location, status, photos)
  - Wire drop badges and visual indicators
  - Complex wire drop data transformations
- **State dependencies**:
  - `wireDrops` array
  - `wireDropQuery` search state
  - `filteredWireDrops` computed data
- **Suggested filename**: `src/components/project-detail/WireDropsSection.jsx`
- **Note**: This is the most complex section - consider breaking it into sub-components:
  - `WireDropCard.jsx` - Individual wire drop display
  - `WireDropSearch.jsx` - Search/filter controls

#### 4. StakeholdersSection (~300-400 lines)
- **Location**: Around line ~2071 (`toggleSection('people')`)
- **Responsibilities**:
  - Display internal and external stakeholders
  - Add new stakeholders
  - Edit stakeholder roles
  - Remove stakeholders
  - Expandable contact cards
  - Modal for adding stakeholders
- **State dependencies**:
  - `stakeholders` object (internal/external arrays)
  - `showAddStakeholder` modal state
  - `availableContacts`, `stakeholderRoles` arrays
  - Stakeholder CRUD handlers
  - `expandedContact`, `editingStakeholder` states
- **Suggested filename**: `src/components/project-detail/StakeholdersSection.jsx`
- **Additional components needed**:
  - `StakeholderCard.jsx` (likely already extracted somewhere)
  - `AddStakeholderModal.jsx` (may already exist)

#### 5. ProjectDetailsSection (Already extracted but in main file)
- **Location**: Around line ~1478 (`toggleSection('details')`)
- **Status**: Already isolated with clean toggle (completed in earlier work)
- **Could extract to**: `src/components/project-detail/ProjectDetailsSection.jsx`
- **Size**: ~90 lines

### Helper Functions & Utilities

These should be extracted into a utils file or custom hook:

#### Utility Functions (move to utils file)
- `formatDate()` - Date formatting (line ~66)
- `withAlpha()` - Color with alpha channel (line ~77)
- `statusChipStyle()` - Status styling (line ~88)

#### Custom Hooks to Create

**1. `useProjectData.js`**
```javascript
// Handles loading project data
export const useProjectData = (projectId) => {
  // Load project, wireDrops, todos, issues, stakeholders
  // Return: { project, wireDrops, todos, issues, stakeholders, loading, error }
}
```

**2. `useTodoManagement.js`**
```javascript
// Handles all todo CRUD operations
export const useTodoManagement = (projectId, todos, setTodos) => {
  // Add, update, delete, reorder todos
  // Return: { handleAddTodo, handleUpdateTodo, handleDeleteTodo, etc. }
}
```

**3. `useIssueManagement.js`**
```javascript
// Handles all issue operations
export const useIssueManagement = (projectId, issues, setIssues) => {
  // Create, update, resolve issues
  // Return: { handleCreateIssue, handleUpdateIssue, handleResolveIssue }
}
```

**4. `useStakeholderManagement.js`**
```javascript
// Handles stakeholder operations
export const useStakeholderManagement = (projectId, stakeholders, setStakeholders) => {
  // Add, remove, edit stakeholders
  // Return: { handleAddStakeholder, handleRemoveStakeholder, etc. }
}
```

## Refactoring Strategy

### Recommended Order (Simplest to Most Complex)

1. ✅ **ProjectLinks** - DONE (143 lines extracted)
2. ✅ **IssuesSection** - DONE (115 lines extracted)
3. **ProjectDetailsSection** - Already isolated (~90 lines)
4. **TodosSection** - Moderate complexity with drag-and-drop (~200-250 lines)
5. **StakeholdersSection** - Complex with modals (~300-400 lines)
6. **WireDropsSection** - Most complex, break into sub-components (~400-500 lines)
7. **Extract utility functions** to utils file
8. **Create custom hooks** for data management

### Expected Final State

After completing all refactoring:

- **ProjectDetailView.js**: ~300-400 lines (just orchestration)
- **New component files**: 6-8 files
- **New hook files**: 4 files
- **Utils file**: 1 file
- **Total reduction**: ~85% in main file size

## How to Continue

### Step-by-Step Instructions

1. **Extract IssuesSection next** (simplest remaining section):
   ```bash
   # Create the component file
   touch src/components/project-detail/IssuesSection.jsx

   # Find the section starting around line 1995
   # Look for: onClick={() => toggleSection('issues')}
   # Copy the entire section including the expandedSection === 'issues' check
   # Move to new file with proper props
   ```

2. **Pattern to follow** (same as ProjectLinks):
   - Create new file in `src/components/project-detail/`
   - Import necessary icons and utilities
   - Accept all dependencies as props (styles, palette, data, handlers)
   - Wrap in `memo()` for performance
   - Import in ProjectDetailView.js
   - Replace the section with the component
   - Test build
   - Commit

3. **Testing after each extraction**:
   ```bash
   npm run build
   # Check for errors
   # Verify line count reduction
   ```

4. **Git commit pattern**:
   ```bash
   git add -A
   git commit -m "Refactor ProjectDetailView: extract [ComponentName]

   Created components/project-detail/[ComponentName].jsx to handle:
   - [responsibility 1]
   - [responsibility 2]

   Main file reduced from X to Y lines (Z lines removed)."
   ```

## Key Files Reference

### Already Modified
- ✅ `src/components/ProjectDetailView.js` - Main file being refactored
- ✅ `src/components/project-detail/ProjectLinks.jsx` - Extracted component
- ✅ `src/components/project-detail/IssuesSection.jsx` - Extracted component

### Files to Create
- `src/components/project-detail/ProjectDetailsSection.jsx`
- `src/components/project-detail/TodosSection.jsx`
- `src/components/project-detail/StakeholdersSection.jsx`
- `src/components/project-detail/WireDropsSection.jsx`
- `src/components/project-detail/WireDropCard.jsx` (sub-component)
- `src/hooks/useProjectData.js`
- `src/hooks/useTodoManagement.js`
- `src/hooks/useIssueManagement.js`
- `src/hooks/useStakeholderManagement.js`
- `src/utils/projectDetailHelpers.js` (for formatDate, withAlpha, statusChipStyle)

## Git Commits to Reference

- **74aa951** - Clean up ProjectDetailView: remove unused code before refactoring
- **e05066f** - Refactor ProjectDetailView: extract ProjectLinks component
- **02b92ac** - Refactor ProjectDetailView: extract IssuesSection component

## Notes

- All changes have been tested with `npm run build` - no errors
- All work is committed to git - safe to continue
- Follow the same pattern used for ProjectLinks extraction
- Each component should be ~100-500 lines max
- Keep components focused on a single responsibility
- Use `memo()` for performance optimization
- Pass all dependencies as props (don't create new context dependencies)

## Success Metrics

### Current Progress
- [x] Cleanup dead code
- [x] Extract ProjectLinks
- [x] Extract IssuesSection
- [ ] Extract ProjectDetailsSection
- [ ] Extract TodosSection
- [ ] Extract StakeholdersSection
- [ ] Extract WireDropsSection
- [ ] Create custom hooks
- [ ] Extract utility functions

### Target Goals
- **Main file**: Reduce to ~300-400 lines (from 2,332)
- **Modularity**: 10+ separate focused files
- **Maintainability**: Each file has single responsibility
- **Performance**: All components memoized
- **Testing**: All changes build successfully

---

**Last Updated**: Current session
**Next Step**: Extract ProjectDetailsSection component
**Current Line Count**: 2,153 lines in ProjectDetailView.js
