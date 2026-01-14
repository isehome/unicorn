# ESLint Build Warnings - Master Fix Instructions

**Created:** 2026-01-13
**Total Warnings:** 15 (across 11 files)
**Impact:** All fixes maintain identical functionality

---

## Overview

These are React Hooks dependency warnings and unused variable warnings. Each fix ensures ESLint compliance while maintaining identical functionality.

---

## Fix 1: PeopleManagement.js (Line 8) - UNUSED IMPORT

**File:** `src/components/PeopleManagement.js`
**Warning:** `'Camera' is defined but never used`

**Remove 'Camera' from the import on Line 8:**
```javascript
// Find and remove 'Camera' from the lucide-react import
// Example: { Camera, User, ... } → { User, ... }
```

---

## Fix 2: ProjectPermits.js (Line 61)

**File:** `src/components/ProjectPermits.js`
**Warning:** Missing dependency `autoPopulateTargetDates` in useCallback

**Change Line 61:**
```javascript
// OLD
}, [projectId]);

// NEW
}, [projectId, autoPopulateTargetDates]);
```

**Why Safe:** `autoPopulateTargetDates` is a stable async function defined in the same component.

---

## Fix 3: SecureDataManager.js (3 warnings - Lines 101, 208, 214)

**File:** `src/components/SecureDataManager.js`

### Fix 3a: Line 101
```javascript
// OLD
}, [projectId]);

// NEW
}, [projectId, loadData]);
```

### Fix 3b: Line 208
```javascript
// OLD
}, [equipmentSearch]);

// NEW
}, [equipmentSearch, equipment]);
```

### Fix 3c: Line 214
```javascript
// OLD
}, [formData.equipment_id]);

// NEW
}, [formData.equipment_id, equipment]);
```

---

## Fix 4: ServiceTicketDetail.js (Line 34) - UNUSED IMPORT

**File:** `src/components/Service/ServiceTicketDetail.js`
**Warning:** `'Loader2' is defined but never used`

**Remove 'Loader2' from the import on Line 34:**
```javascript
// Find and remove 'Loader2' from the lucide-react import
```

---

## Fix 5: WeekCalendarGrid.jsx (Line 331) - UNUSED VARIABLE

**File:** `src/components/Service/WeekCalendarGrid.jsx`
**Warning:** `'isMedium' is assigned a value but never used`

**Option A - Remove the variable:**
```javascript
// OLD (around line 331)
const isMedium = useMediaQuery('(min-width: 768px)');

// NEW - Delete this line entirely if not used
```

**Option B - Prefix with underscore if intentionally unused:**
```javascript
// OLD
const isMedium = useMediaQuery('(min-width: 768px)');

// NEW
const _isMedium = useMediaQuery('(min-width: 768px)');
```

---

## Fix 6: ShadeDetailPage.js (Line 493)

**File:** `src/components/Shades/ShadeDetailPage.js`
**Warning:** Ref value may change before cleanup runs

**Change Line 493:**
```javascript
// OLD
}, [shadeId]);

// NEW
}, [shadeId, pendingSavesRef]);
```

**Why Safe:** Refs created with `useRef()` are stable - they never change.

---

## Fix 7: WireDropsHub.js (Lines 14-29 and 65)

**File:** `src/components/WireDropsHub.js`
**Warning:** `hubItems` array recreated every render

### Step 1: Update import (Line 1)
```javascript
// OLD
import React, { useEffect } from 'react';

// NEW
import React, { useEffect, useMemo } from 'react';
```

### Step 2: Wrap hubItems in useMemo (Lines 14-29)
```javascript
// OLD
const hubItems = [
  {
    title: 'Wire Drops List',
    ...
  },
  {
    title: 'Lucid Chart Integration',
    ...
  }
];

// NEW
const hubItems = useMemo(() => [
  {
    title: 'Wire Drops List',
    ...
  },
  {
    title: 'Lucid Chart Integration',
    ...
  }
], []);
```

---

## Fix 8: PODetailsModal.js (Line 127)

**File:** `src/components/procurement/PODetailsModal.js`
**Warning:** Missing dependency `loadPODetails`

### Step 1: Wrap loadPODetails in useCallback (around Line 78)
```javascript
// OLD (Line 78)
const loadPODetails = async () => {
  // ... function body ...
};

// NEW
const loadPODetails = useCallback(async () => {
  // ... function body stays the same ...
}, [poId]);
```

### Step 2: Update dependency array (Line 127)
```javascript
// OLD
}, [isOpen, poId]);

// NEW
}, [isOpen, poId, loadPODetails]);
```

---

## Fix 9: POGenerationModal.js (Lines 147-191)

**File:** `src/components/procurement/POGenerationModal.js`
**Warning:** `formData` object recreated every render

### Step 1: Update import (Line 1)
```javascript
// OLD
import React, { useState, useEffect, useCallback } from 'react';

// NEW
import React, { useState, useEffect, useCallback, useMemo } from 'react';
```

### Step 2: Wrap formData in useMemo (Lines 147-155)
```javascript
// OLD
const formData = {
  orderDate,
  requestedDeliveryDate,
  taxAmount,
  shippingCost,
  internalNotes,
  supplierNotes,
  shippingAddressId
};

// NEW
const formData = useMemo(() => ({
  orderDate,
  requestedDeliveryDate,
  taxAmount,
  shippingCost,
  internalNotes,
  supplierNotes,
  shippingAddressId
}), [orderDate, requestedDeliveryDate, taxAmount, shippingCost, internalNotes, supplierNotes, shippingAddressId]);
```

---

## Fix 10: ProcurementDashboard.js (Line 117)

**File:** `src/components/procurement/ProcurementDashboard.js`
**Warning:** Missing dependency `loadDashboardData`

**Change Line 117:**
```javascript
// OLD
}, [initialView]);

// NEW
}, [initialView, loadDashboardData]);
```

---

## Fix 11: SupplierEditModal.js (Lines 264 and 387)

**File:** `src/components/procurement/SupplierEditModal.js`
**Warning:** `sendVendorWelcomeEmail` recreated every render

### Wrap sendVendorWelcomeEmail in useCallback (Line 264)
```javascript
// OLD (Line 264)
const sendVendorWelcomeEmail = async (supplierName, supplierEmail) => {
  // ... function body ...
};

// NEW
const sendVendorWelcomeEmail = useCallback(async (supplierName, supplierEmail) => {
  // ... function body stays exactly the same ...
}, [acquireToken, formData.contact_name]);
```

---

## Fix 12: AdminPage.js (Lines 1782 and 1807) - LOOP FUNCTION CLOSURE

**File:** `src/pages/AdminPage.js`
**Warning:** Function declared in loop contains unsafe references to `skipped`

The issue is that `setImportProgress` callbacks inside loops reference `skipped` and `errors` variables that may change during iteration.

### Fix 12a: Line 1782
```javascript
// OLD (Line 1781-1783)
if (i % 50 === 0) {
  setImportProgress(prev => ({ ...prev, current: i + 1, skipped, errors: [...errors] }));
}

// NEW - Capture values before callback
if (i % 50 === 0) {
  const currentSkipped = skipped;
  const currentErrors = [...errors];
  setImportProgress(prev => ({ ...prev, current: i + 1, skipped: currentSkipped, errors: currentErrors }));
}
```

### Fix 12b: Lines 1807-1812
```javascript
// OLD (Lines 1807-1812)
setImportProgress(prev => ({
  ...prev,
  current: dataToImport.length - contactsToMerge.length + Math.min(i + BATCH_SIZE, contactsToInsert.length),
  skipped,
  errors: [...errors]
}));

// NEW - Capture values before callback
const currentSkipped = skipped;
const currentErrors = [...errors];
setImportProgress(prev => ({
  ...prev,
  current: dataToImport.length - contactsToMerge.length + Math.min(i + BATCH_SIZE, contactsToInsert.length),
  skipped: currentSkipped,
  errors: currentErrors
}));
```

**Why Safe:** Capturing variables before passing to setState ensures the callback uses the value at the time of the loop iteration, not a potentially stale reference.

---

## Summary Table

| # | File | Line | Fix Type | Risk |
|---|------|------|----------|------|
| 1 | PeopleManagement.js | 8 | Remove unused import | None |
| 2 | ProjectPermits.js | 61 | Add dependency | None |
| 3a | SecureDataManager.js | 101 | Add dependency | None |
| 3b | SecureDataManager.js | 208 | Add dependency | None |
| 3c | SecureDataManager.js | 214 | Add dependency | None |
| 4 | ServiceTicketDetail.js | 34 | Remove unused import | None |
| 5 | WeekCalendarGrid.jsx | 331 | Remove/prefix unused var | None |
| 6 | ShadeDetailPage.js | 493 | Add ref to deps | None |
| 7 | WireDropsHub.js | 14-29 | Wrap in useMemo | None |
| 8 | PODetailsModal.js | 78, 127 | useCallback + add dep | None |
| 9 | POGenerationModal.js | 147-155 | Wrap in useMemo | None |
| 10 | ProcurementDashboard.js | 117 | Add dependency | None |
| 11 | SupplierEditModal.js | 264 | Wrap in useCallback | None |
| 12a | AdminPage.js | 1782 | Fix loop closure | None |
| 12b | AdminPage.js | 1807 | Fix loop closure | None |

---

## Verification

After applying all fixes, run:
```bash
npm run build
```

Expected result: **0 warnings**

---

## Notes

- All fixes follow React best practices
- No functionality changes
- No UI/UX changes
- All fixes are backward compatible
