# Wire Drop Equipment Features - Quick Start Guide

## 🚀 30-Minute Implementation

### Step 1: Database Setup (5 min)
```bash
# 1. Open Supabase Dashboard → SQL Editor
# 2. Run: database-backup/wire_drop_equipment_features_migration.sql
# 3. Verify success - check for new columns in project_equipment
```

### Step 2: Storage Setup (3 min)
```bash
# Supabase Dashboard → Storage → New Bucket
Name: equipment-photos
Public: ✅ YES
Size Limit: 5MB
Types: image/jpeg, image/png, image/gif, image/webp
```

### Step 3: Add Component (2 min)
```jsx
import WireDropEquipmentSection from './components/WireDropEquipmentSection';

<WireDropEquipmentSection
  wireDrop={currentWireDrop}
  projectEquipment={projectEquipmentList}
  onSave={handleWireDropSave}
/>
```

### Step 4: Test (20 min)
✅ Select equipment from different room → Confirm room change  
✅ Click "Refresh Data" → Select UniFi client → View network info  
✅ Upload HomeKit QR → Add setup code → Verify storage  

---

## 📁 Files Created

| File | Purpose |
|------|---------|
| `RoomChangeConfirmation.jsx` | Room update modal |
| `HomeKitQRUpload.jsx` | QR photo upload |
| `UniFiClientSelectorEnhanced.jsx` | Network client selector |
| `WireDropEquipmentSection.jsx` | Main component |
| `wire_drop_equipment_features_migration.sql` | Database schema |

---

## 🔑 Key Features

### 1. Auto Room Reassignment
- Detects when equipment is in wrong room
- Shows confirmation modal before updating
- Updates both `room` and `room_name` fields

### 2. UniFi Integration
- Auto-matches by MAC address
- Displays: IP, hostname, switch, port
- Stores full client metadata in JSONB

### 3. HomeKit QR Storage
- Uploads to Supabase Storage
- Stores public URL in database
- Optional 8-digit setup code field
- Camera capture on mobile

---

## 🐛 Common Issues

**Upload fails?** → Check bucket is PUBLIC  
**UniFi not loading?** → Verify `unifi-proxy.js` deployed  
**Room change not saving?** → Run migration SQL  
**Dark mode broken?** → Components use `dark:` classes  

---

## 📊 Database Fields Added

```sql
project_equipment
  ├── homekit_qr_photo (TEXT) - Photo URL
  ├── homekit_setup_code (TEXT) - Setup code
  └── unifi_synced_at (TIMESTAMPTZ) - Last sync
```

---

## 🎯 Component Props

### WireDropEquipmentSection
```typescript
{
  wireDrop: WireDrop;           // Current wire drop
  projectEquipment: Equipment[]; // All project equipment
  onSave: (wireDrop) => void;   // Save callback
}
```

### UniFiClientSelectorEnhanced
```typescript
{
  equipment: Equipment;          // Equipment to link
  onClientLinked: (id, data) => void; // Link callback
}
```

### HomeKitQRUpload
```typescript
{
  equipment: Equipment;          // Equipment for QR
  onUpload: (data) => void;     // Upload callback
}
```

---

## ✨ Usage Examples

### Standalone Integration
```jsx
// Add to any wire drop detail page
<WireDropEquipmentSection {...props} />
```

### Custom Integration
```jsx
// Use individual components
<UniFiClientSelectorEnhanced equipment={item} onClientLinked={handler} />
<HomeKitQRUpload equipment={item} onUpload={handler} />
```

---

## 📞 Support

- Full Guide: `WIRE_DROP_EQUIPMENT_FEATURES_IMPLEMENTATION.md`
- UniFi Docs: `UNIFI_INTEGRATION_GUIDE.md`
- Supabase: https://supabase.com/docs

---

*Quick Start v1.0 - November 15, 2025*
