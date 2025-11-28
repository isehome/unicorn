# STYLES.md - Unicorn Design System

## ⚠️ CRITICAL: Use This Style System

This project has a **custom style system** defined in `src/styles/styleSystem.js`. 
DO NOT use arbitrary Tailwind colors. Use the defined system.

---

## 🎨 Brand Colors

| Name | Hex | Usage |
|------|-----|-------|
| **Primary** | `#8B5CF6` | Main accent, buttons, links |
| **Primary Hover** | `#7C3AED` | Button hover states |
| **Primary Light** | `#A78BFA` | Light accents |
| **Secondary** | `#ACB3D1` | Secondary elements |
| **Success** | `#94AF32` | Success states (olive green) |
| **Warning** | `#F59E0B` | Warning states (amber) |
| **Danger** | `#EF4444` | Error states (red) |
| **Info** | `#3B82F6` | Info states (blue) |

### Tailwind Class Mapping
```jsx
// Primary (violet)
bg-violet-500        // #8B5CF6 - Primary
bg-violet-600        // #7C3AED - Primary hover
bg-violet-400        // #A78BFA - Primary light
text-violet-500
border-violet-500

// Status colors - USE THESE EXACT CLASSES
bg-emerald-500       // Success (but prefer brand success)
bg-amber-500         // Warning  
bg-red-500           // Danger
bg-blue-500          // Info
```

---

## 🌗 Light/Dark Mode Palettes

### DO NOT Hardcode Colors - Use These Patterns

#### Page Background
```jsx
// ✅ CORRECT
className="bg-zinc-50 dark:bg-zinc-950"  // or use CSS var
style={{ backgroundColor: 'var(--color-page-bg)' }}

// ❌ WRONG
className="bg-white dark:bg-gray-900"  // Wrong grays!
className="bg-gray-50"                  // Missing dark mode!
```

#### Cards
```jsx
// ✅ CORRECT
className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800"

// ❌ WRONG  
className="bg-white dark:bg-gray-800"  // Wrong gray scale
```

#### Text
```jsx
// ✅ CORRECT - Primary text
className="text-zinc-900 dark:text-zinc-100"

// ✅ CORRECT - Secondary text
className="text-zinc-600 dark:text-zinc-400"

// ✅ CORRECT - Subtle/muted text
className="text-zinc-500 dark:text-zinc-500"

// ❌ WRONG
className="text-gray-900 dark:text-gray-100"  // Wrong gray scale!
```

#### Borders
```jsx
// ✅ CORRECT
className="border-zinc-200 dark:border-zinc-700"

// ❌ WRONG
className="border-gray-200 dark:border-gray-700"  // Wrong scale!
```

---

## 📊 Progress Bar Colors

Progress gauges use specific colors based on percentage:

| Range | Color | Hex | Tailwind |
|-------|-------|-----|----------|
| 0-25% | Red | `#EF4444` | `bg-red-500` |
| 25-50% | Amber | `#F59E0B` | `bg-amber-500` |
| 50-75% | Blue | `#3B82F6` | `bg-blue-500` |
| 75-99% | Success (olive) | `#94AF32` | Custom |
| 100% | Violet | `#8B5CF6` | `bg-violet-500` |

### Implementation
```jsx
const getProgressColor = (percentage) => {
  if (percentage === 100) return '#8B5CF6'; // violet - complete
  if (percentage >= 75) return '#94AF32';   // olive - high
  if (percentage >= 50) return '#3B82F6';   // blue - good
  if (percentage >= 25) return '#F59E0B';   // amber - medium
  return '#EF4444';                          // red - low
};
```

---

## 📅 Date Display Standards

### Display Mode (Read-Only)
Use `DateField` component from `/src/components/ui/DateField.js`

| State | Light Mode | Dark Mode | When |
|-------|------------|-----------|------|
| Past Due | `#DC2626` | `#F87171` | Date has passed |
| Urgent | `#EA580C` | `#FB923C` | Within 3 days |
| Upcoming | `#CA8A04` | `#FACC15` | Within 7 days |
| Future | `#2563EB` | `#60A5FA` | More than 7 days |
| Not Set | `#9CA3AF` | `#6B7280` | No date (shows "—") |
| Completed | `#6B7280` | `#9CA3AF` | Section complete |

### Edit Mode (Input Fields)
Use `DateInput` component from `/src/components/ui/DateInput.js`

**Empty date inputs:**
```jsx
// Light: Orange background
className="bg-orange-50 border-orange-300"

// Dark: Orange tint
style={{ backgroundColor: 'rgba(194, 65, 12, 0.2)' }}
className="border-orange-700"
```

**Filled date inputs:**
```jsx
// Normal styling
className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
```

---

## 🔽 Collapsible Sections Standard

**CRITICAL: Follow this pattern exactly for ALL collapsible sections**

### Rules:
1. Chevron ALWAYS on the LEFT (first element)
2. Use `ChevronRight` when collapsed, `ChevronDown` when expanded
3. Use `flex items-center gap-2` (NOT `justify-between`)

### Correct Pattern:
```jsx
import { ChevronRight, ChevronDown } from 'lucide-react';

<button 
  onClick={() => setCollapsed(!collapsed)}
  className="flex items-center gap-2 w-full p-3 rounded-lg"
>
  {collapsed ? (
    <ChevronRight className="w-5 h-5" />
  ) : (
    <ChevronDown className="w-5 h-5" />
  )}
  <SectionIcon className="w-5 h-5" />
  <span>Section Title</span>
</button>
```

### ❌ WRONG Patterns:
```jsx
// WRONG: Chevron on right
<button className="flex items-center justify-between">
  <span>Title</span>
  <ChevronDown />  // NO! Chevron should be LEFT
</button>

// WRONG: Up/Down pattern
{collapsed ? <ChevronDown /> : <ChevronUp />}  // NO! Use Right/Down
```

---

## 🃏 Card Styles

### Standard Card
```jsx
<div className="
  bg-white dark:bg-zinc-900 
  border border-zinc-200 dark:border-zinc-700 
  rounded-lg 
  shadow-sm
  p-4
">
  {/* content */}
</div>
```

### Interactive Card (Hover Effect)
```jsx
<div className="
  bg-white dark:bg-zinc-900 
  border border-zinc-200 dark:border-zinc-700 
  rounded-lg 
  shadow-sm
  p-4
  transition-all duration-200
  hover:shadow-lg hover:border-violet-300 dark:hover:border-violet-700
  cursor-pointer
">
  {/* content */}
</div>
```

### Project Card (Left Border Accent)
```jsx
<div className="
  bg-white dark:bg-zinc-900 
  border border-zinc-200 dark:border-zinc-700 
  border-l-4 border-l-violet-500
  rounded-lg 
  p-4
">
  {/* content */}
</div>
```

---

## 🔘 Button Styles

### Primary Button
```jsx
<button className="
  px-4 py-2 
  bg-violet-500 hover:bg-violet-600 
  text-white 
  rounded-lg 
  transition-colors
  font-medium
">
  Button Text
</button>
```

### Secondary Button
```jsx
<button className="
  px-4 py-2 
  bg-zinc-100 dark:bg-zinc-800 
  hover:bg-zinc-200 dark:hover:bg-zinc-700
  text-zinc-700 dark:text-zinc-300
  border border-zinc-300 dark:border-zinc-600
  rounded-lg 
  transition-colors
">
  Button Text
</button>
```

### Danger Button
```jsx
<button className="
  px-4 py-2 
  bg-red-500 hover:bg-red-600 
  text-white 
  rounded-lg 
  transition-colors
">
  Delete
</button>
```

---

## 📝 Input Styles

### Text Input
```jsx
<input className="
  w-full 
  px-3 py-2 
  bg-white dark:bg-zinc-800 
  border border-zinc-300 dark:border-zinc-600 
  rounded-lg 
  text-zinc-900 dark:text-zinc-100
  placeholder-zinc-400 dark:placeholder-zinc-500
  focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500
  transition-colors
" />
```

### Select
```jsx
<select className="
  w-full 
  px-3 py-2 
  bg-white dark:bg-zinc-800 
  border border-zinc-300 dark:border-zinc-600 
  rounded-lg 
  text-zinc-900 dark:text-zinc-100
  focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500
">
  <option>Option 1</option>
</select>
```

---

## 🏷️ Badge/Chip Styles

### Status Badge
```jsx
// Active/Success
<span className="px-2 py-1 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-medium">
  Active
</span>

// Pending/Warning
<span className="px-2 py-1 bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-full text-xs font-medium">
  Pending
</span>

// Error/Danger
<span className="px-2 py-1 bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 rounded-full text-xs font-medium">
  Error
</span>

// Info/Default
<span className="px-2 py-1 bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400 rounded-full text-xs font-medium">
  Info
</span>
```

---

## 📐 Spacing Standards

| Usage | Class | Pixels |
|-------|-------|--------|
| Card padding | `p-4` | 16px |
| Section gap | `gap-4` or `space-y-4` | 16px |
| Button padding | `px-4 py-2` | 16px / 8px |
| Input padding | `px-3 py-2` | 12px / 8px |
| Small gap | `gap-2` | 8px |
| Large gap | `gap-6` | 24px |

---

## 🔤 Typography

### Font Family
Inter is the primary font (loaded in index.css)

### Text Sizes
```jsx
text-xs    // 12px - Labels, badges
text-sm    // 14px - Secondary text, captions
text-base  // 16px - Body text (default)
text-lg    // 18px - Subheadings
text-xl    // 20px - Section titles
text-2xl   // 24px - Page titles
text-3xl   // 30px - Large headings
```

### Font Weights
```jsx
font-normal   // 400 - Body text
font-medium   // 500 - Emphasis, buttons
font-semibold // 600 - Subheadings
font-bold     // 700 - Headings
```

---

## ✅ Quick Reference Checklist

Before submitting code, verify:

- [ ] Using `zinc` scale (not `gray`) for neutrals
- [ ] All colors have dark mode variants
- [ ] Progress bars use correct color scale
- [ ] Cards follow standard pattern
- [ ] Buttons use defined styles
- [ ] Collapsible sections have chevron on LEFT
- [ ] Date inputs use orange for empty state
- [ ] Focus states use violet ring

---

## 📁 Key Style Files

| File | Purpose |
|------|---------|
| `src/styles/styleSystem.js` | Master style definitions, CSS variables |
| `src/index.css` | Tailwind imports, base styles, animations |
| `tailwind.config.js` | Tailwind config, safelist |
| `src/contexts/ThemeContext.js` | Theme provider, mode switching |
| `src/components/ui/DateField.js` | Date display component |
| `src/components/ui/DateInput.js` | Date input component |

---

*Always reference this document when styling components.*
*Last Updated: November 2025*