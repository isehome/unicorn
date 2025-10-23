# Duplicate and Unused Components Audit

**Date:** October 22, 2025  
**Analysis:** Complete scan of src/components directory and routing usage

## Executive Summary

Found **4 confirmed unused/duplicate components** that can be safely deleted, plus **2 test pages** that may be kept or removed based on your needs.

---

## CONFIRMED UNUSED/DUPLICATE COMPONENTS (Safe to Delete)

### 1. **PMProjectView.js**
- **Status:** ❌ DUPLICATE - NOT USED
- **Replaced by:** PMProjectViewEnhanced.js
- **Routing:** PMProjectViewEnhanced is used for `/pm/project/:projectId` and `/pm-project/:projectId`
- **Imports:** No imports found anywhere in codebase
- **Recommendation:** **DELETE IMMEDIATELY** - This was the source of your confusion

### 2. **PMProjectViewWithLucid.js**
- **Status:** ❌ EXPERIMENTAL - NOT USED
- **Replaced by:** PMProjectViewEnhanced.js (which already includes Lucid integration)
- **Routing:** Not routed
- **Imports:** No imports found anywhere in codebase
- **Recommendation:** **DELETE** - Experimental version that's been superseded

### 3. **Dashboard.js**
- **Status:** ❌ OLD VERSION - NOT USED
- **Replaced by:** 
  - TechnicianDashboardOptimized.js (for technician view)
  - PMDashboard.js (for PM view)
- **Routing:** Not routed
- **Imports:** No imports found anywhere in codebase
- **Recommendation:** **DELETE** - Old dashboard replaced by role-specific optimized versions

### 4. **RichContactCard.js**
- **Status:** ❌ UNUSED - NOT USED
- **Alternative:** ContactCard.js is actively used
- **Routing:** Not routed
- **Imports:** No imports found anywhere in codebase
- **Recommendation:** **DELETE** - ContactCard.js serves the current needs

---

## TEST/DIAGNOSTIC COMPONENTS (Keep or Remove Based on Needs)

### 5. **LucidDiagnostic.js**
- **Status:** ✅ TEST PAGE - ROUTED
- **Routing:** `/lucid-test`
- **Purpose:** Diagnostic tool for testing Lucid Chart integration
- **Imports:** LucidIframeEmbed, LucidImageDisplay
- **Recommendation:** **KEEP if still debugging Lucid**, DELETE if Lucid is stable

### 6. **UnifiTestPage.js**
- **Status:** ✅ TEST PAGE - ROUTED
- **Routing:** `/unifi-test`
- **Purpose:** Test page for UniFi integration
- **Recommendation:** **KEEP if still testing UniFi**, DELETE if UniFi is stable

---

## ACTIVELY USED COMPONENTS (DO NOT DELETE)

These components are actively imported and/or routed:

### Core Routing Components
- ✅ TechnicianDashboardOptimized.js
- ✅ PMDashboard.js
- ✅ ProjectDetailView.js
- ✅ **PMProjectViewEnhanced.js** (the CORRECT one)
- ✅ PMIssuesPage.js
- ✅ IssueDetail.js
- ✅ WireDropDetailEnhanced.js
- ✅ WireDropsList.js
- ✅ WireDropsHub.js
- ✅ WireDropNew.js
- ✅ EquipmentListPage.js
- ✅ PeopleManagement.js
- ✅ SettingsPage.js
- ✅ SecureDataPage.js
- ✅ IssuesListPageOptimized.js
- ✅ TodosListPage.js
- ✅ PartsListPage.js
- ✅ PartDetailPage.js

### Reusable Components
- ✅ ContactCard.js (used in StakeholderSlots)
- ✅ EquipmentManager.js (used in ProjectDetailView)
- ✅ ProjectEquipmentManager.js (used in PMProjectViewEnhanced)
- ✅ LucidChartCarousel.js (used in ProjectDetailView & PMProjectViewEnhanced)
- ✅ LucidImageDisplay.js (used in LucidDiagnostic)
- ✅ LucidIframeEmbed.js (used in LucidDiagnostic)

### Infrastructure Components
- ✅ AppHeader.js
- ✅ BottomNavigation.js
- ✅ Login.js
- ✅ AuthCallback.js
- ✅ ProtectedRoute.js
- ✅ Navigation.js

---

## COMPONENT PATTERN ANALYSIS

### Naming Patterns Found:
1. **Base vs Enhanced:** 
   - Pattern: `Component.js` vs `ComponentEnhanced.js`
   - Found: PMProjectView.js (unused) vs PMProjectViewEnhanced.js (used)
   - Found: WireDropDetailEnhanced.js (used, no base version exists)
   
2. **Optimized Versions:**
   - TechnicianDashboardOptimized.js (used)
   - IssuesListPageOptimized.js (used)
   
3. **Experimental Versions:**
   - PMProjectViewWithLucid.js (unused - features merged into Enhanced)
   
4. **Test Pages:**
   - UnifiTestPage.js (routed for testing)
   - LucidDiagnostic.js (routed for testing)

---

## RECOMMENDED ACTIONS

### Immediate Deletions (Safe):
```bash
# Delete these 4 unused/duplicate components
rm src/components/PMProjectView.js
rm src/components/PMProjectViewWithLucid.js
rm src/components/Dashboard.js
rm src/components/RichContactCard.js
```

### Optional Deletions (After confirming not needed):
```bash
# Delete test pages if no longer needed
rm src/components/LucidDiagnostic.js  # After confirming Lucid is stable
rm src/components/UnifiTestPage.js     # After confirming UniFi is stable
```

### Git Cleanup (Optional but recommended):
After deleting, commit with clear message:
```bash
git add -A
git commit -m "chore: remove duplicate and unused components

- Remove PMProjectView.js (duplicate of PMProjectViewEnhanced)
- Remove PMProjectViewWithLucid.js (experimental, superseded)
- Remove Dashboard.js (replaced by role-specific dashboards)
- Remove RichContactCard.js (unused, ContactCard is sufficient)"
```

---

## NOTES

1. **No Base WireDrop Component Found:** WireDropDetailEnhanced exists but there's no base WireDropDetail component. This is fine - "Enhanced" is the only version.

2. **Both EquipmentManagers are Used:** EquipmentManager and ProjectEquipmentManager serve different purposes and are both actively used.

3. **Contact Cards:** ContactCard is the active version. RichContactCard appears to be an abandoned enhanced version.

