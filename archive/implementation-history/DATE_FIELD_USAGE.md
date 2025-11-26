# Date Field System - Usage Guide

This guide explains how to use the new date field system that provides proper visual hierarchy and color coding for dates throughout the application.

## Components Overview

- **DateField** - For displaying dates with automatic color coding (view mode)
- **DateInput** - For editing dates with clear empty state indicators (edit mode)

## Problem Solved

Previously, the application had these issues with date fields:
- ❌ Empty date fields showed today's date instead of "not set"
- ❌ No visual distinction between set/unset dates
- ❌ No color coding for date proximity (upcoming, past due)
- ❌ Completed section dates looked the same as active dates
- ❌ Upcoming dates weren't visually prominent

## Solution Overview

The new system provides:
- ✅ Shows "—" (dash) for unset dates
- ✅ Color codes dates based on proximity and urgency
- ✅ Greys out dates in completed sections
- ✅ Makes active/upcoming dates prominent
- ✅ Clear visual hierarchy: **active > upcoming > future > not set/completed**

## Color Coding System

| Status | Color | When | Visual Style |
|--------|-------|------|--------------|
| **Past Due** | Red | Date has passed | Bold, red, very visible |
| **Today** | Orange | Due today | Bold, orange, very visible |
| **Urgent** | Orange | Within 3 days | Semibold, orange, visible |
| **Upcoming** | Yellow | Within 7 days | Medium weight, yellow |
| **Future** | Blue | More than 7 days | Normal weight, blue |
| **Not Set** | Gray | No date entered | Faded, gray, shows "—" |
| **Completed** | Green (faded) | Section complete | Greyed out, strikethrough |

## Quick Start

### 1. Import the Components

```javascript
// For displaying dates (view mode)
import DateField, { DateFieldRow, DateBadge } from './components/ui/DateField';

// For editing dates (edit mode)
import DateInput from './components/ui/DateInput';
```

### 2. Basic Usage

```javascript
// Simple date display
<DateField
  date="2025-11-30"
  label="Target Date"
  isCompleted={false}
/>

// Date in a completed section (greyed out)
<DateField
  date="2025-11-20"
  label="Original Due Date"
  isCompleted={true}
/>

// No date set (shows "—")
<DateField
  date={null}
  label="Delivery Date"
/>
```

### 3. Variants

#### Default Variant (Full Display)
```javascript
<DateField
  date="2025-11-28"
  label="Delivery Date"
  showIcon={true}
  showBadge={true}
  showDescription={true}
  variant="default"
/>
```

#### Compact Variant (Single Line)
```javascript
<DateField
  date="2025-11-28"
  label="Target"
  showIcon={false}
  showBadge={true}
  variant="compact"
/>
```

#### Inline Variant (Just the Date)
```javascript
<DateField
  date="2025-11-28"
  variant="inline"
/>
```

### 4. Multiple Dates in a Row

```javascript
<DateFieldRow
  dates={[
    { date: targetDate, label: "Target Date" },
    { date: actualDate, label: "Completed", isCompleted: true }
  ]}
  showIcons={true}
/>
```

### 5. Badge Display (for lists/tables)

```javascript
<DateBadge
  date="2025-11-28"
  isCompleted={false}
/>
```

---

## Edit Mode - DateInput Component

For **edit mode**, use the `DateInput` component which shows a clear "—" indicator for empty fields:

### Basic Usage

```javascript
import DateInput from './components/ui/DateInput';

// Simple date input
<DateInput
  value={targetDate}
  onChange={(e) => setTargetDate(e.target.value)}
/>

// Required field (orange highlight when empty)
<DateInput
  value={orderDate}
  onChange={(e) => setOrderDate(e.target.value)}
  required={true}
/>

// With custom styling
<DateInput
  value={deliveryDate}
  onChange={(e) => setDeliveryDate(e.target.value)}
  className="text-sm"
/>
```

### Visual Indicators

The DateInput component automatically shows:
- **"—" dash** when empty (overlaid on the input)
- **Orange background** when empty AND required (highlights fields that need data)
- **Gray background** when empty and optional
- **White background** when filled (normal state)

### Example in a Form

```javascript
<div className="grid grid-cols-2 gap-4">
  <div>
    <label className="block text-sm font-medium mb-2">
      Order Date *
    </label>
    <DateInput
      value={formData.order_date}
      onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
      required={true}
    />
  </div>

  <div>
    <label className="block text-sm font-medium mb-2">
      Delivery Date (Optional)
    </label>
    <DateInput
      value={formData.delivery_date}
      onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
    />
  </div>
</div>
```

## Real-World Examples

### Example 1: Purchase Order Dates

```javascript
// In PODetailsModal.js
<div className="grid grid-cols-2 gap-4">
  <div>
    <label>Order Date</label>
    <DateField
      date={po.order_date}
      isCompleted={po.status === 'received'}
      showIcon={true}
      showBadge={false}
      variant="compact"
    />
  </div>

  <div>
    <label>Requested Delivery Date</label>
    <DateField
      date={po.requested_delivery_date}
      isCompleted={po.status === 'received'}
      showIcon={true}
      showBadge={true}
      showDescription={true}
      variant="compact"
    />
  </div>
</div>
```

### Example 2: Milestone Dates

```javascript
// In MilestoneGaugesDisplay.js
const isCompleted = !!milestone.actual_date;

<div className="space-y-1">
  {milestone.target_date && (
    <DateField
      date={milestone.target_date}
      label="Target"
      isCompleted={isCompleted}
      showIcon={false}
      showBadge={!isCompleted}
      showDescription={!isCompleted}
      variant="compact"
    />
  )}

  {milestone.actual_date && (
    <DateField
      date={milestone.actual_date}
      label="Completed"
      isCompleted={true}
      showIcon={false}
      variant="compact"
    />
  )}
</div>
```

### Example 3: Project List View

```javascript
// In project list cards
<DateBadge
  date={project.target_completion_date}
  isCompleted={project.status === 'completed'}
/>
```

## Using Date Utilities Directly

If you need custom date formatting or status detection:

```javascript
import { formatDateWithStatus, getDateStatus, formatDate } from '../utils/dateUtils';

// Get date with status info
const dateInfo = formatDateWithStatus('2025-11-28', false);
console.log(dateInfo.formatted); // "Nov 28, 2025"
console.log(dateInfo.status.label); // "Urgent"
console.log(dateInfo.classes.text); // "text-orange-600 dark:text-orange-400 font-semibold"

// Just format a date
const formatted = formatDate('2025-11-28', { format: 'short' }); // "Nov 28, 2025"

// Get date status only
const status = getDateStatus('2025-11-28', false);
console.log(status.description); // "2 days away"
```

## Customizing Thresholds

You can customize when dates show as "warning" or "urgent":

```javascript
<DateField
  date="2025-12-05"
  label="Delivery Date"
  thresholds={{
    warningDays: 14,  // Show warning when within 14 days (default: 7)
    urgentDays: 5     // Show urgent when within 5 days (default: 3)
  }}
/>
```

## Migration Guide

### Before (Old Way)
```javascript
<p className="text-gray-900 dark:text-white">
  {po.order_date ? new Date(po.order_date).toLocaleDateString() : 'N/A'}
</p>
```

### After (New Way)
```javascript
<DateField
  date={po.order_date}
  variant="compact"
/>
```

## Best Practices

1. **Always use `isCompleted` for finished sections**
   - Set `isCompleted={true}` when the milestone/section is done
   - This greys out dates to show they're no longer active

2. **Show badges for important dates**
   - Use `showBadge={true}` for target dates that need attention
   - Skip badges for completed or historical dates

3. **Show descriptions for target dates**
   - Use `showDescription={true}` to show "3 days away" text
   - Helps users quickly understand urgency

4. **Use compact variant in tight spaces**
   - List views, tables, sidebars → use `variant="compact"`
   - Detail pages with space → use `variant="default"`

5. **Use inline variant for minimal display**
   - When you just need the date without any wrapper
   - Example: inline with other text

## Components Updated

The following components have been updated to use the new date system:

1. ✅ `MilestoneGaugesDisplay.js` - Milestone target and actual dates
2. ✅ `PODetailsModal.js` - Purchase order dates with urgency indicators

## Next Steps

To complete the migration, update these components:

- [ ] `PMProjectViewEnhanced.js` - Project milestone dates
- [ ] `ProcurementDashboard.js` - PO list dates
- [ ] `ProjectDetailView.js` - Project dates
- [ ] Any other components displaying dates

## Support

For questions or issues with the date system, refer to:
- `/src/utils/dateUtils.js` - Core date logic
- `/src/components/ui/DateField.js` - Date field components
- This documentation file

---

**Version:** 1.0
**Last Updated:** 2025-11-23
