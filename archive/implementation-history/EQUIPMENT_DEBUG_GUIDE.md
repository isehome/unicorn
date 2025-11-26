# Equipment Debug Guide

## Test Steps

1. **Open the Browser Console** (F12 or Cmd+Option+I)
2. **Navigate to a Wire Drop Detail page**
3. **Click the "Add Equipment" or "Change" button**

## Expected Console Logs

When you click "Add Equipment" or "Change", you should see:
```
[Equipment] Add Equipment button clicked
[Equipment] Current showRoomEquipmentDropdown state: false
[Equipment] Set showRoomEquipmentDropdown to true
[Equipment Debug] showRoomEquipmentDropdown changed to: true
```

When the modal opens, you should also see:
```
[Equipment Debug] Computing sortedRoomEquipment
[Equipment Debug] selectableEquipment count: [number]
[Equipment Debug] selectableEquipment: [array of equipment]
[Equipment Debug] wireDropRoom: [room name]
[Equipment Debug] currentSelection: [selected equipment id or undefined]
[Equipment Debug] sortedRoomEquipment result: {
  sameRoomCount: [number],
  otherRoomsCount: [number],
  hasOtherRooms: [boolean]
}
```

## Troubleshooting

### If you see "selectableEquipment count: 0"
- **Problem**: No equipment data is loaded
- **Check**: 
  - Is the project equipment loading correctly?
  - Are there any errors in the console about loading equipment?
  - Check the Network tab for failed API calls to project_equipment

### If showRoomEquipmentDropdown doesn't change to true
- **Problem**: State update is not working
- **Check**:
  - Are there any React errors in the console?
  - Is the button click handler being called?

### If modal doesn't appear despite showRoomEquipmentDropdown being true
- **Problem**: Modal rendering issue
- **Check**:
  - Are there any CSS/styling errors?
  - Is the modal being rendered but hidden behind other elements?
  - Check the Elements inspector to see if the modal div exists in the DOM

## Quick Fixes to Try

1. **Hard Refresh**: Cmd+Shift+R (or Ctrl+Shift+R on Windows)
2. **Clear Local Storage**: In console, run `localStorage.clear()` then refresh
3. **Check for React Errors**: Look for red error messages in console
4. **Verify Equipment Data**: In console, check if equipment is loaded by looking at the network requests

## What to Report Back

Please let me know:
1. What console logs you see when clicking the buttons
2. The value of `selectableEquipment count`
3. Any error messages (red text) in the console
4. Whether the modal div appears in the DOM (Elements tab)

This will help identify exactly where the issue is occurring.
