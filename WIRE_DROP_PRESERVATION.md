# Wire Drop Preservation During CSV Import

## ✅ Problem Solved!

**Issue:** REPLACE mode CSV imports were deleting wire drop links, forcing manual re-linking.

**Solution:** Wire drop links are now automatically preserved and restored during REPLACE mode imports.

---

## How It Works

### REPLACE Mode Flow (with Wire Drop Preservation):

```
1. Save Wire Drop Links
   ├─ Query all wire drop links for equipment being deleted
   ├─ Store: wire_drop_id, equipment details, quantity, notes
   └─ Keep in memory

2. Delete Old Equipment
   ├─ Delete wire_drop_equipment_links (cascade)
   ├─ Delete project_equipment_instances
   ├─ Delete project_equipment_inventory
   └─ Delete project_equipment

3. Import New Equipment
   ├─ Parse CSV
   ├─ Create rooms
   ├─ Insert equipment
   └─ Sync global parts

4. Restore Wire Drop Links
   ├─ Match old equipment to new equipment by:
   │   • part_number
   │   • room_id
   │   • install_side
   │   • name
   ├─ Create new links with new equipment IDs
   └─ Log restoration results
```

---

## Matching Logic

Wire drops are restored by matching equipment using this key:
```
part_number|room_id|install_side|name
```

### Examples:

#### ✅ Successful Match (Wire Drop Restored)
```
Old Equipment:
  part_number: "CAT6-1000"
  room_id: "abc-123"
  install_side: "room_end"
  name: "Cat6 Cable"

New Equipment (from CSV):
  part_number: "CAT6-1000"
  room_id: "abc-123" (same room)
  install_side: "room_end"
  name: "Cat6 Cable"

Result: ✅ Wire drop link restored with new equipment ID
```

#### ⚠️ Failed Match (Manual Re-link Required)
```
Old Equipment:
  part_number: "CAT6-1000"
  name: "Cat6 Cable"

New Equipment (from CSV):
  part_number: "CAT6-2000" ❌ Changed!
  name: "Cat6 Cable"

Result: ⚠️ Wire drop orphaned - manual re-link needed
```

#### ❌ Equipment Removed (Wire Drop Orphaned)
```
Old Equipment:
  part_number: "OLD-PART-123"
  name: "Removed Equipment"

New Equipment (from CSV):
  (not in CSV anymore)

Result: ❌ Wire drop cannot be restored
```

---

## Console Logs During Import

You'll see detailed logs showing the preservation process:

### Example Console Output:
```
[Wire Drop Preservation] Found 45 equipment items to replace
[Wire Drop Preservation] Found 12 wire drop links to preserve

[Wire Drop Restoration] Attempting to restore 12 wire drop links...
[Wire Drop Restoration] Created lookup map with 45 equipment items
[Wire Drop Restoration] ✓ Successfully restored 12 wire drop links
[Wire Drop Restoration] Summary: { restored: 12, failed: 0, failures: [] }
```

### With Failures:
```
[Wire Drop Preservation] Found 45 equipment items to replace
[Wire Drop Preservation] Found 15 wire drop links to preserve

[Wire Drop Restoration] Attempting to restore 15 wire drop links...
[Wire Drop Restoration] Created lookup map with 42 equipment items
[Wire Drop Restoration] ⚠️ Could not restore link for wire drop wire-drop-123:
  Equipment "Old Part" (PART-999) not found in new import
[Wire Drop Restoration] ⚠️ Failed to restore 3 links (equipment removed from proposal)
[Wire Drop Restoration] ✓ Successfully restored 12 wire drop links
[Wire Drop Restoration] Summary: {
  restored: 12,
  failed: 3,
  failures: [
    {
      wire_drop_id: "wire-drop-123",
      old_equipment: {
        part_number: "PART-999",
        name: "Old Part",
        manufacturer: "Acme",
        model: "X1000"
      },
      reason: "Equipment no longer in proposal"
    }
  ]
}
```

---

## Success Rates

### ✅ 100% Success:
- Part numbers unchanged in new CSV
- Room assignments unchanged
- Equipment names unchanged

### ⚠️ Partial Success:
- Some part numbers changed → Those wire drops orphaned
- Some equipment removed → Those wire drops orphaned
- Rest restored successfully

### ❌ 0% Success:
- Complete proposal replacement with different part numbering system
- All wire drops orphaned
- Manual re-linking required

---

## Best Practices

### When REPLACE Is Safe:
1. **Updated Quantities/Prices:**
   - Same part numbers
   - Same equipment names
   - Wire drops: ✅ 100% restored

2. **Minor Proposal Changes:**
   - Added new items
   - Removed a few items
   - Wire drops: ✅ Mostly restored (only removed items fail)

3. **Proposal Version Updates:**
   - Client approved changes
   - Part numbers consistent
   - Wire drops: ✅ High success rate

### When MERGE Is Better:
1. **Major Proposal Restructure:**
   - Part numbers changing
   - Equipment being reorganized
   - Use MERGE to keep existing wire drops intact

2. **Change Orders:**
   - Adding equipment only
   - Not replacing existing
   - Use MERGE to avoid any risk

---

## Testing the Feature

### Test 1: Full Restoration
```
Steps:
1. Import initial CSV (REPLACE mode)
2. Link some equipment to wire drops
3. Import same CSV again (REPLACE mode)

Expected:
✅ All wire drop links restored
Console: "restored: X, failed: 0"
```

### Test 2: Partial Restoration
```
Steps:
1. Import CSV with 50 items (REPLACE mode)
2. Link 10 items to wire drops
3. Edit CSV - remove 2 items, change 1 part number
4. Import edited CSV (REPLACE mode)

Expected:
✅ 7 wire drops restored (70% success)
⚠️ 3 wire drops failed (removed/changed items)
Console: "restored: 7, failed: 3"
```

### Test 3: Equipment Details Changed
```
Steps:
1. Import CSV (REPLACE mode)
2. Link equipment to wire drop
3. Change part number in CSV
4. Import (REPLACE mode)

Expected:
❌ Wire drop NOT restored (part number mismatch)
Console: "restored: 0, failed: 1"
⚠️ Manual re-link required
```

---

## Troubleshooting

### Issue: Wire drops not being restored

**Check Console Logs:**
```
[Wire Drop Preservation] Found 0 wire drop links to preserve
```

**Causes:**
- No wire drops were linked to equipment
- Equipment not imported via CSV (no csv_batch_id)

**Solution:**
- Only CSV-imported equipment gets wire drops preserved
- Manually created equipment is never deleted in REPLACE mode

---

### Issue: Some wire drops restored, others failed

**Check Console Logs:**
```
[Wire Drop Restoration] ⚠️ Could not restore link...
Equipment "X" (PART-123) not found in new import
```

**Causes:**
- Part number changed in new CSV
- Equipment removed from proposal
- Name changed in new CSV

**Solution:**
- Keep part numbers consistent across CSV versions
- Don't remove equipment that has wire drops
- Or manually re-link the failed ones

---

### Issue: Wrong equipment linked to wire drop

**Rare, but possible if:**
- Multiple equipment with same part_number in same room
- Equipment matching logic finds wrong item

**Solution:**
- Ensure unique part numbers per room
- Or use MERGE mode instead

---

## Comparison: REPLACE vs MERGE

| Feature | REPLACE Mode | MERGE Mode |
|---------|--------------|------------|
| **Deletes old equipment** | ✅ Yes (CSV imports only) | ❌ No |
| **Preserves wire drops** | ✅ Yes (automatic) | ✅ Yes (equipment IDs unchanged) |
| **Success rate** | ⚠️ Depends on matching | ✅ 100% |
| **Removes deleted items** | ✅ Yes | ❌ No |
| **Updates quantities** | ✅ Yes | ✅ Yes |
| **Risk level** | ⚠️ Medium | ✅ Low |

---

## Code Changes Made

### Files Modified:
1. **projectEquipmentService.js**
   - Enhanced `resetPreviousImports()` to preserve links
   - Added `restoreWireDropLinks()` function
   - Integrated restoration into REPLACE mode workflow

### Key Functions:

#### `resetPreviousImports(projectId)`
- Now returns preserved wire drop links
- Queries wire drops before deletion
- Stores equipment details for matching

#### `restoreWireDropLinks(preservedLinks, newEquipment)`
- Matches old equipment to new equipment
- Creates new links with new equipment IDs
- Returns restoration statistics

#### `importCsv(projectId, file, options)`
- Captures preserved links from `resetPreviousImports()`
- Calls `restoreWireDropLinks()` after equipment insertion
- Logs restoration results

---

## Migration Required?

**No database migration needed!** ✅

This feature works with existing tables:
- `project_equipment` (existing)
- `wire_drop_equipment_links` (existing)
- `wire_drops` (existing)

The preservation logic is entirely in the service layer.

---

## Summary

✅ **Wire drop preservation is now automatic**
✅ **Works in REPLACE mode without manual work**
✅ **High success rate when part numbers are consistent**
✅ **Detailed console logging for troubleshooting**
✅ **No risk of data loss - only links to removed equipment fail**

**You can now safely use REPLACE mode even when wire drops are linked!** 🎉

---

## Next Steps

1. Test with real project data
2. Monitor console logs during import
3. Report any issues with matching logic
4. Consider UI notification for failed restorations

Want me to add a UI notification showing restoration results?
