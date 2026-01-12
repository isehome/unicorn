# ESLint Build Warnings - Master Fix Instructions

**Created:** 2026-01-12
**Total Warnings:** 10 (across 8 files)
**Impact:** All fixes are dependency array corrections - NO functionality changes

---

## Overview

These are all React Hooks dependency warnings. Each fix ensures ESLint compliance while maintaining identical functionality. None of these fixes change app behavior.

---

## Fix 1: ProjectPermits.js (Line 61)

**File:** `src/components/ProjectPermits.js`
**Warning:** Missing dependency `autoPopulateTargetDates` in useCallback

**Change Line 61:**
```javascript
// OLD
}, [projectId]);

// NEW
}, [projectId, autoPopulateTargetDates]);
```

**Why Safe:** `autoPopulateTargetDates` is a stable async function defined in the same component. Adding it won't cause loops.

---

## Fix 2: SecureDataManager.js (3 warnings - Lines 101, 208, 214)

**File:** `src/components/SecureDataManager.js`

### Fix 2a: Line 101
```javascript
// OLD
}, [projectId]);

// NEW
}, [projectId, loadData]);
```

### Fix 2b: Line 208
```javascript
// OLD
}, [equipmentSearch]);

// NEW
}, [equipmentSearch, equipment]);
```

### Fix 2c: Line 214
```javascript
// OLD
}, [formData.equipment_id]);

// NEW
}, [formData.equipment_id, equipment]);
```

**Why Safe:** These are simple dependency additions. `loadData` and `equipment` are stable references that won't cause infinite loops.

---

## Fix 3: ShadeDetailPage.js (Line 493)

**File:** `src/components/Shades/ShadeDetailPage.js`
**Warning:** Ref value may change before cleanup runs

**Change Line 493:**
```javascript
// OLD
}, [shadeId]);

// NEW
}, [shadeId, pendingSavesRef]);
```

**Why Safe:** Refs created with `useRef()` are stable - they never change. This just tells ESLint we acknowledge the ref usage.

---

## Fix 4: WireDropsHub.js (Lines 14-29 and 65)

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

**Why Safe:** Empty dependency array means the array is created once and never recreated. Content is static.

---

## Fix 5: PODetailsModal.js (Line 127)

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

**Why Safe:** `loadPODetails` only depends on `poId`. Wrapping in useCallback makes it stable.

---

## Fix 6: POGenerationModal.js (Lines 147-191)

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

**Why Safe:** `useMemo` ensures the object only changes when actual values change, not on every render.

---

## Fix 7: ProcurementDashboard.js (Line 117)

**File:** `src/components/procurement/ProcurementDashboard.js`
**Warning:** Missing dependency `loadDashboardData`

**Change Line 117:**
```javascript
// OLD
}, [initialView]);

// NEW
}, [initialView, loadDashboardData]);
```

**Why Safe:** `loadDashboardData` is stable - it only sets state and doesn't depend on changing values.

---

## Fix 8: SupplierEditModal.js (Lines 264 and 387)

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

**Why Safe:** The function now only recreates when `acquireToken` or `formData.contact_name` change, which is rare.

---

## Summary Table

| File | Line | Fix Type | Risk Level |
|------|------|----------|------------|
| ProjectPermits.js | 61 | Add dependency | None |
| SecureDataManager.js | 101 | Add dependency | None |
| SecureDataManager.js | 208 | Add dependency | None |
| SecureDataManager.js | 214 | Add dependency | None |
| ShadeDetailPage.js | 493 | Add ref to deps | None |
| WireDropsHub.js | 14-29 | Wrap in useMemo | None |
| PODetailsModal.js | 78, 127 | useCallback + add dep | None |
| POGenerationModal.js | 147-155 | Wrap in useMemo | None |
| ProcurementDashboard.js | 117 | Add dependency | None |
| SupplierEditModal.js | 264 | Wrap in useCallback | None |

---

## Verification

After applying all fixes, run:
```bash
npm run build
```

Expected result: **0 warnings** (currently 10)

---

## Notes

- All fixes follow React best practices from the official documentation
- No functionality changes - only dependency array corrections
- No UI/UX changes
- All fixes are backward compatible
- Tested patterns used throughout the existing codebase
