# Wire Drop Equipment Assignment Improvements

## 🎯 Objective

Improve the wire drop equipment assignment flow in the technician's project view, making it easier and more robust to associate equipment with wire drops, particularly on the **Room End** side.

---

## 📋 Current State Analysis

### Existing Flow (Room End Tab)
**File**: [src/components/WireDropDetailEnhanced.js:1485-1607](src/components/WireDropDetailEnhanced.js#L1485-L1607)

**Current UX:**
1. User opens wire drop detail page
2. Clicks "Room" tab
3. Sees "Room End Equipment" section
4. Views **Selected equipment** as green pill badges
5. Scrolls to **"Choose equipment to link"** section
6. Selects checkboxes in grouped list (by room)
7. Clicks **"Save Room End"** button
8. Equipment links are saved

**Current Header Display** ([lines 959-1006](src/components/WireDropDetailEnhanced.js#L959-L1006)):
- Wire drop name
- Location/room name
- Info badges (Type, Floor, Room)
- **No equipment shown in header**

### Issues to Address

1. **❌ Equipment not visible in header**
   - User must scroll to "Room End Equipment" section to see what's connected
   - No quick visual indicator of assignment status

2. **❌ Multi-select complexity**
   - Wire drops are typically 1:1 with room equipment
   - Checkbox UI implies multiple selections needed
   - Not optimized for "select one device" use case

3. **❌ Room grouping can be overwhelming**
   - Long scrollable lists when project has many rooms
   - Hard to find the equipment you're looking for

4. **❌ No search/filter**
   - Large projects = lots of equipment
   - No quick way to find "Apple TV" or "Living Room TV"

5. **❌ Head-end side has no auto-association**
   - CAT6 drops always go to network switches
   - 22/4 wire always goes to alarm panel
   - Manual selection every time is tedious

---

## 🎨 Proposed Solution: Room End Improvements

### 1. Add Equipment Display to Header

**Location**: After info badges, before location text ([line 999](src/components/WireDropDetailEnhanced.js#L999))

**Visual Design:**
```jsx
{/* NEW: Connected Equipment Badge */}
{selectedRoomEquipmentDetails.length > 0 && (
  <div className="mt-3 flex items-center gap-3">
    <div className="flex items-center gap-2 px-4 py-2 rounded-lg border-2"
      style={{
        backgroundColor: mode === 'dark' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(187, 247, 208, 0.5)',
        borderColor: mode === 'dark' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(34, 197, 94, 0.6)'
      }}
    >
      <Monitor size={18} className="text-green-600 dark:text-green-400" />
      <div>
        <div className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">
          Room Equipment
        </div>
        <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
          {selectedRoomEquipmentDetails[0].name}
        </div>
        {selectedRoomEquipmentDetails[0].model && (
          <div className="text-xs text-gray-600 dark:text-gray-400">
            {selectedRoomEquipmentDetails[0].model}
          </div>
        )}
      </div>
      {selectedRoomEquipmentDetails.length > 1 && (
        <span className="ml-2 px-2 py-0.5 rounded-full bg-green-600 text-white text-xs font-bold">
          +{selectedRoomEquipmentDetails.length - 1}
        </span>
      )}
    </div>
  </div>
)}

{/* Show "Not Connected" state */}
{selectedRoomEquipmentDetails.length === 0 && (
  <div className="mt-3 flex items-center gap-3">
    <div className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed"
      style={{
        backgroundColor: mode === 'dark' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(243, 244, 246, 0.8)',
        borderColor: mode === 'dark' ? 'rgba(156, 163, 175, 0.3)' : 'rgba(156, 163, 175, 0.5)'
      }}
    >
      <AlertCircle size={18} className="text-gray-500 dark:text-gray-400" />
      <div>
        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
          Room Equipment
        </div>
        <div className="text-sm font-semibold text-gray-500 dark:text-gray-400">
          Not Connected
        </div>
      </div>
    </div>
  </div>
)}
```

**Result:**
- Equipment visible at top of page
- Clear connection status
- User sees what's assigned without scrolling

---

### 2. Improve Equipment Selector UX

**Replace**: Checkbox list ([lines 1545-1602](src/components/WireDropDetailEnhanced.js#L1545-L1602))

**With**: Searchable dropdown + quick filters

#### Option A: Searchable Dropdown (Recommended for Single Selection)

```jsx
<div className="space-y-4">
  {/* Search Box */}
  <div className="relative">
    <input
      type="text"
      placeholder="Search equipment (name, model, room)..."
      value={equipmentSearchQuery}
      onChange={(e) => setEquipmentSearchQuery(e.target.value)}
      className="w-full px-4 py-2 pl-10 rounded-lg border"
      style={{
        backgroundColor: mode === 'dark' ? '#374151' : '#FFFFFF',
        borderColor: mode === 'dark' ? '#4B5563' : '#D1D5DB',
        color: mode === 'dark' ? '#F9FAFB' : '#111827'
      }}
    />
    <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
  </div>

  {/* Quick Room Filters */}
  <div className="flex flex-wrap gap-2">
    <button
      onClick={() => setRoomFilter(null)}
      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
        roomFilter === null
          ? 'bg-violet-500 text-white'
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300'
      }`}
    >
      All Rooms
    </button>
    {projectRooms.map(room => (
      <button
        key={room.id}
        onClick={() => setRoomFilter(room.id)}
        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
          roomFilter === room.id
            ? 'bg-violet-500 text-white'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300'
        }`}
      >
        {room.name} ({equipmentCountsByRoom[room.id] || 0})
      </button>
    ))}
  </div>

  {/* Equipment List (Filtered) */}
  <div className="max-h-80 overflow-y-auto rounded-lg border" style={styles.card}>
    {filteredEquipment.length === 0 ? (
      <div className="p-8 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No equipment found matching "{equipmentSearchQuery}"
        </p>
      </div>
    ) : (
      <div className="divide-y" style={{ borderColor: styles.card.borderColor }}>
        {filteredEquipment.map(item => {
          const isSelected = roomEquipmentSelection.includes(item.id);
          return (
            <button
              key={item.id}
              onClick={() => toggleRoomEquipment(item.id)}
              className={`w-full px-4 py-3 text-left transition-colors ${
                isSelected
                  ? 'bg-green-50 dark:bg-green-900/20'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {item.name}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                    {item.project_rooms?.name} • {item.manufacturer} {item.model}
                  </div>
                  {item.part_number && (
                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                      P/N: {item.part_number}
                    </div>
                  )}
                </div>
                {isSelected && (
                  <CheckCircle size={20} className="text-green-600 dark:text-green-400 ml-3 flex-shrink-0" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    )}
  </div>

  {/* Quick Add New Equipment (Future Enhancement) */}
  <Button
    variant="ghost"
    icon={Plus}
    onClick={() => setShowAddEquipmentModal(true)}
    size="sm"
  >
    Add New Equipment
  </Button>
</div>
```

**Benefits:**
- Search across name, model, room, manufacturer
- Quick room filters for fast navigation
- Single-click selection (not checkbox)
- Visual feedback with checkmark
- Cleaner, more modern UX

---

#### Option B: Radio Buttons (For Strictly Single Selection)

If wire drops should only ever connect to ONE piece of room equipment:

```jsx
{filteredEquipment.map(item => (
  <label
    key={item.id}
    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all ${
      roomEquipmentSelection[0] === item.id
        ? 'bg-green-50 border-2 border-green-400 dark:bg-green-900/20 dark:border-green-500'
        : 'border-2 border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
    }`}
  >
    <input
      type="radio"
      name="room-equipment"
      className="mt-1 h-4 w-4 text-violet-500 focus:ring-violet-400"
      checked={roomEquipmentSelection[0] === item.id}
      onChange={() => setRoomEquipmentSelection([item.id])}
    />
    <div className="flex-1">
      <div className="font-medium text-gray-900 dark:text-gray-100">
        {item.name}
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-400">
        {item.project_rooms?.name} • {item.manufacturer} {item.model}
      </div>
    </div>
  </label>
))}
```

**Use when:**
- Business rule is "1 wire drop = 1 room device"
- Radio buttons enforce single selection
- Simpler state management

---

### 3. Better Visual Feedback on Save

**Replace**: Generic alert ([line 745](src/components/WireDropDetailEnhanced.js#L745))

**With**: Toast notification + visual confirmation

```jsx
const handleSaveRoomEnd = async () => {
  try {
    setSavingRoomEquipment(true);
    await wireDropService.updateEquipmentLinks(id, 'room_end', roomEquipmentSelection);

    // Success toast
    showToast({
      type: 'success',
      title: 'Room Equipment Saved',
      message: `Connected to ${selectedRoomEquipmentDetails[0]?.name}`,
      duration: 3000
    });

    // Reload to show in header
    await loadWireDrop();

    // Auto-scroll to header to show the result
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (err) {
    showToast({
      type: 'error',
      title: 'Save Failed',
      message: err.message || 'Failed to save room equipment',
      duration: 5000
    });
  } finally {
    setSavingRoomEquipment(false);
  }
};
```

---

### 4. Add "Suggested Equipment" Feature

Auto-suggest equipment based on wire drop context:

```jsx
// Calculate suggestions
const suggestedEquipment = useMemo(() => {
  if (!projectEquipment.length || !wireDrop) return [];

  const suggestions = [];
  const dropRoom = wireDrop.room_name?.toLowerCase();
  const dropType = wireDrop.type?.toLowerCase();

  // Same room + similar type
  const sameRoomEquipment = projectEquipment.filter(eq =>
    eq.project_rooms?.name?.toLowerCase() === dropRoom &&
    !roomEquipmentSelection.includes(eq.id)
  );

  // If CAT6, suggest network devices
  if (dropType?.includes('cat') || dropType?.includes('ethernet')) {
    const networkDevices = sameRoomEquipment.filter(eq =>
      eq.category?.toLowerCase().includes('network') ||
      eq.name.toLowerCase().includes('tv') ||
      eq.name.toLowerCase().includes('apple') ||
      eq.name.toLowerCase().includes('roku')
    );
    suggestions.push(...networkDevices);
  }

  // If HDMI, suggest displays/sources
  if (dropType?.includes('hdmi')) {
    const avDevices = sameRoomEquipment.filter(eq =>
      eq.name.toLowerCase().includes('tv') ||
      eq.name.toLowerCase().includes('display') ||
      eq.name.toLowerCase().includes('projector')
    );
    suggestions.push(...avDevices);
  }

  return suggestions.slice(0, 3); // Top 3
}, [projectEquipment, wireDrop, roomEquipmentSelection]);

// Display above equipment list
{suggestedEquipment.length > 0 && (
  <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-500/30">
    <div className="flex items-center gap-2 mb-2">
      <Sparkles size={16} className="text-blue-600 dark:text-blue-400" />
      <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
        Suggested Equipment
      </h4>
    </div>
    <div className="space-y-2">
      {suggestedEquipment.map(item => (
        <button
          key={item.id}
          onClick={() => setRoomEquipmentSelection([item.id])}
          className="w-full text-left px-3 py-2 rounded-md bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-600 hover:border-blue-500 transition-colors"
        >
          <div className="font-medium text-sm text-gray-900 dark:text-gray-100">
            {item.name}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400">
            {item.project_rooms?.name} • {item.model}
          </div>
        </button>
      ))}
    </div>
  </div>
)}
```

**Suggestions based on:**
- Same room as wire drop
- Wire drop type (CAT6 → network devices, HDMI → displays)
- Equipment category matching

---

## 🔌 Head-End Auto-Association

### Problem Statement

**Current UX:**
- User must manually select head-end equipment for every wire drop
- Repetitive: All CAT6 drops go to network switches, all 22/4 goes to alarm panel
- Time-consuming for large installations (50+ wire drops)

### Proposed Solution: Smart Auto-Association

#### 1. Create Head-End Association Rules

**New Table**: `wire_drop_type_head_end_rules`

```sql
CREATE TABLE wire_drop_type_head_end_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  wire_type TEXT NOT NULL,                    -- 'CAT6', '22/4', 'HDMI', 'Speaker', etc.
  default_equipment_id UUID REFERENCES project_equipment(id) ON DELETE SET NULL,
  auto_assign BOOLEAN DEFAULT true,           -- Enable/disable auto-assignment
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, wire_type)
);
```

**Example Data:**
| wire_type | default_equipment_id | auto_assign |
|-----------|---------------------|-------------|
| CAT6      | {US-24-250W switch} | true        |
| CAT6A     | {US-24-250W switch} | true        |
| 22/4      | {Vista 20P alarm}   | true        |
| HDMI      | {HDMI Matrix}       | false       |

#### 2. Auto-Assignment Logic

**Service**: `src/services/wireDropAutoAssignService.js`

```javascript
export const autoAssignHeadEnd = async (wireDropId, projectId) => {
  // 1. Get wire drop type
  const { data: wireDrop } = await supabase
    .from('wire_drops')
    .select('type')
    .eq('id', wireDropId)
    .single();

  // 2. Look up rule for this type
  const { data: rule } = await supabase
    .from('wire_drop_type_head_end_rules')
    .select('default_equipment_id, auto_assign')
    .eq('project_id', projectId)
    .eq('wire_type', wireDrop.type)
    .single();

  // 3. If rule exists and auto-assign enabled, apply it
  if (rule?.auto_assign && rule?.default_equipment_id) {
    await wireDropService.updateEquipmentLinks(
      wireDropId,
      'head_end',
      [rule.default_equipment_id]
    );
    return { autoAssigned: true, equipmentId: rule.default_equipment_id };
  }

  return { autoAssigned: false };
};
```

#### 3. UI for Managing Rules

**New Component**: `HeadEndAssociationRules.js`

**Location**: Project Settings or Wire Drops Settings page

```jsx
<div className="space-y-4">
  <h3 className="text-lg font-semibold">Head-End Association Rules</h3>
  <p className="text-sm text-gray-600 dark:text-gray-400">
    Define default head-end equipment for each wire type. New wire drops will auto-assign.
  </p>

  <table className="w-full border">
    <thead>
      <tr className="bg-gray-100 dark:bg-gray-800">
        <th className="px-4 py-2 text-left">Wire Type</th>
        <th className="px-4 py-2 text-left">Default Equipment</th>
        <th className="px-4 py-2 text-center">Auto-Assign</th>
        <th className="px-4 py-2"></th>
      </tr>
    </thead>
    <tbody>
      {wireTypes.map(type => (
        <tr key={type} className="border-t">
          <td className="px-4 py-2 font-mono text-sm">{type}</td>
          <td className="px-4 py-2">
            <select
              value={rules[type]?.default_equipment_id || ''}
              onChange={(e) => handleUpdateRule(type, 'equipment', e.target.value)}
              className="w-full px-2 py-1 rounded border"
            >
              <option value="">-- None --</option>
              {headEndEquipment.map(eq => (
                <option key={eq.id} value={eq.id}>
                  {eq.name} ({eq.model})
                </option>
              ))}
            </select>
          </td>
          <td className="px-4 py-2 text-center">
            <input
              type="checkbox"
              checked={rules[type]?.auto_assign || false}
              onChange={(e) => handleUpdateRule(type, 'auto_assign', e.target.checked)}
              className="h-4 w-4"
            />
          </td>
          <td className="px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleSaveRule(type)}
            >
              Save
            </Button>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

#### 4. Integration with Wire Drop Creation

**When creating a new wire drop:**

```javascript
const handleCreateWireDrop = async (wireDropData) => {
  // 1. Create wire drop
  const { data: newDrop } = await supabase
    .from('wire_drops')
    .insert(wireDropData)
    .select()
    .single();

  // 2. Auto-assign head-end if rule exists
  const { autoAssigned, equipmentId } = await autoAssignHeadEnd(
    newDrop.id,
    newDrop.project_id
  );

  // 3. Show toast notification
  if (autoAssigned) {
    showToast({
      type: 'info',
      title: 'Head-End Auto-Assigned',
      message: `${wireDropData.type} automatically connected to head-end equipment`,
      duration: 4000
    });
  }

  return newDrop;
};
```

#### 5. Override Capability

**In WireDropDetailEnhanced.js, Head-End tab:**

```jsx
{/* Show auto-assigned equipment with override option */}
{headEndAutoAssigned && (
  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-600 mb-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Zap size={16} className="text-blue-600 dark:text-blue-400" />
        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
          Auto-assigned to head-end equipment
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setHeadEndAutoAssigned(false)}
      >
        Change
      </Button>
    </div>
  </div>
)}
```

---

## 🚀 Implementation Phases

### Phase 1: Room End Header Display ✅
**Files:**
- `src/components/WireDropDetailEnhanced.js` (lines 959-1006)

**Changes:**
- Add equipment badge display after info badges
- Show connected/not connected state
- Link to Room tab when clicked

**Estimated Time**: 1-2 hours

---

### Phase 2: Improve Room Equipment Selector 🔄
**Files:**
- `src/components/WireDropDetailEnhanced.js` (lines 1545-1602)

**Changes:**
- Add search input state
- Add room filter state
- Implement filtered equipment list
- Replace checkboxes with clickable cards
- Add CheckCircle icon for selected state

**Estimated Time**: 2-3 hours

---

### Phase 3: Suggested Equipment 🎯
**Files:**
- `src/components/WireDropDetailEnhanced.js` (new `useMemo` hook)

**Changes:**
- Calculate suggestions based on room + type
- Display suggestion cards above main list
- One-click application

**Estimated Time**: 1-2 hours

---

### Phase 4: Head-End Auto-Association Rules 🔌
**Files:**
- `supabase/add_head_end_association_rules.sql` (new migration)
- `src/services/wireDropAutoAssignService.js` (new service)
- `src/components/HeadEndAssociationRules.js` (new settings component)
- `src/components/WireDropDetailEnhanced.js` (integrate auto-assign)

**Changes:**
- Create database table
- Build auto-assignment logic
- Create management UI
- Integrate with wire drop creation/editing

**Estimated Time**: 4-6 hours

---

### Phase 5: Better Save Feedback ✨
**Files:**
- `src/components/WireDropDetailEnhanced.js` (lines 741-753)
- `src/utils/toast.js` (if not exists, create toast system)

**Changes:**
- Replace `alert()` with toast notifications
- Auto-scroll to header after save
- Visual confirmation animation

**Estimated Time**: 1-2 hours

---

## 📊 Success Metrics

- **Time to assign**: Reduce from 30s → 10s per wire drop
- **Search adoption**: 60%+ of users use search instead of scrolling
- **Auto-assign rate**: 80%+ of head-end assignments automated
- **Error rate**: <5% incorrect assignments requiring correction
- **User satisfaction**: "Much easier" feedback from technicians

---

## 🔮 Future Enhancements

1. **Bulk Assignment**
   - Select multiple wire drops
   - Apply same head-end equipment to all
   - Useful for rack installations

2. **Equipment Templates**
   - Save common room setups ("Living Room TV Package")
   - One-click apply to new wire drops

3. **Visual Rack Layout**
   - Show switch port diagram
   - Click port to assign wire drop
   - Visual cable management

4. **Mobile Optimization**
   - Larger touch targets
   - Swipe gestures for quick assignment
   - Camera integration for barcode scanning

5. **AI Suggestions**
   - Learn from past assignments
   - "Users often connect CAT6 in Living Room to Apple TV"
   - Improve suggestions over time

---

## 🎯 Next Steps

**Immediate Focus**: Room End Tab Cleanup

1. ✅ Create this documentation
2. ⏭️ Implement header equipment display
3. ⏭️ Add search + filter to equipment selector
4. ⏭️ Add suggested equipment feature
5. ⏭️ Improve save feedback (toast notifications)

**Secondary Priority**: Head-End Auto-Association

6. ⏭️ Design database schema for rules
7. ⏭️ Build auto-assignment service
8. ⏭️ Create rules management UI
9. ⏭️ Integrate with wire drop workflows

---

## 📝 Questions to Resolve

1. **Single vs Multi-Select for Room End?**
   - Current: Multi-select (checkboxes)
   - Typical use: 1 wire drop = 1 device
   - **Decision needed**: Force single selection (radio) or keep multi-select?

2. **Auto-assign on creation vs on-demand?**
   - Auto on creation = faster but less control
   - On-demand = more explicit but extra step
   - **Decision needed**: Which UX pattern?

3. **Override warnings?**
   - If user changes auto-assigned equipment, show warning?
   - Or allow silent override?
   - **Decision needed**: Confirmation dialog?

4. **Project-level vs Global rules?**
   - Each project defines own rules?
   - Or global company-wide defaults?
   - **Decision needed**: Scope of rules?

---

## 📚 Related Files

**Components:**
- [src/components/WireDropDetailEnhanced.js](src/components/WireDropDetailEnhanced.js) - Main wire drop detail page
- [src/components/WireDropsList.js](src/components/WireDropsList.js) - List view
- [src/components/ProjectEquipmentManager.js](src/components/ProjectEquipmentManager.js) - Equipment BOM

**Services:**
- [src/services/wireDropService.js](src/services/wireDropService.js) - Wire drop CRUD
- [src/services/projectEquipmentService.js](src/services/projectEquipmentService.js) - Equipment management

**Database:**
- [supabase/schema.sql](supabase/schema.sql) - Main schema
- [supabase/project_equipment_import_and_linking.sql](supabase/project_equipment_import_and_linking.sql) - Equipment linking
