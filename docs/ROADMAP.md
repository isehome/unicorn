# Phase 2 Features

## Automatic Tracking & Delivery Date Integration

### Current State
- Vendors submit tracking numbers via the public portal
- Tracking numbers are stored in `shipment_tracking` table
- Users can click tracking numbers to open Google search (manual lookup)
- `estimated_delivery_date` column exists but is not populated automatically

### Goal
Automatically fetch delivery dates and tracking status from carriers when tracking numbers are submitted.

---

## Integration Options

### Option 1: AfterShip (Recommended for Getting Started)
- **Free tier**: 50 trackings/month
- **Paid**: Starts at $11/month for 100 trackings
- **Carriers**: 900+ worldwide
- **Pros**: Easy API, webhook support, good documentation
- **Cons**: Free tier is limited

**API Example:**
```javascript
// POST https://api.aftership.com/v4/trackings
const response = await fetch('https://api.aftership.com/v4/trackings', {
  method: 'POST',
  headers: {
    'aftership-api-key': process.env.AFTERSHIP_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tracking: {
      tracking_number: '1Z999AA10123456784',
      slug: 'ups' // carrier slug
    }
  })
});

// Response includes expected_delivery date
```

### Option 2: Shippo
- **Pricing**: Pay-per-use (~$0.05 per label, tracking included)
- **Carriers**: 50+ carriers
- **Pros**: Also handles shipping labels if needed later
- **Cons**: More focused on label creation than tracking

### Option 3: EasyPost
- **Pricing**: Pay-per-use (~$0.02-0.05 per tracking)
- **Carriers**: 100+ carriers
- **Pros**: Simple API, reliable
- **Cons**: No free tier

### Option 4: Direct Carrier APIs
- **UPS**: Free with developer account
- **FedEx**: Free with developer account
- **USPS**: Free Web Tools API
- **Pros**: Free, no middleman
- **Cons**: Must maintain separate integration per carrier

---

## Recommended Implementation Plan

### Step 1: Add Environment Variables
```env
# .env.local
AFTERSHIP_API_KEY=your_api_key_here
```

### Step 2: Create Tracking Service API
Create `api/tracking-lookup.js`:

```javascript
const AFTERSHIP_API = 'https://api.aftership.com/v4';
const AFTERSHIP_API_KEY = process.env.AFTERSHIP_API_KEY;

// Map our carrier names to AfterShip slugs
const carrierSlugs = {
  'UPS': 'ups',
  'FEDEX': 'fedex',
  'USPS': 'usps',
  'DHL': 'dhl',
  'OTHER': null // Will auto-detect
};

async function lookupTracking(trackingNumber, carrier) {
  const slug = carrierSlugs[carrier?.toUpperCase()] || null;

  // First, create tracking in AfterShip
  const createResponse = await fetch(`${AFTERSHIP_API}/trackings`, {
    method: 'POST',
    headers: {
      'aftership-api-key': AFTERSHIP_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      tracking: {
        tracking_number: trackingNumber,
        ...(slug && { slug })
      }
    })
  });

  const createData = await createResponse.json();

  // Extract delivery info
  const tracking = createData.data?.tracking;
  return {
    status: tracking?.tag || 'Pending',
    estimatedDelivery: tracking?.expected_delivery,
    lastUpdate: tracking?.updated_at,
    checkpoints: tracking?.checkpoints || []
  };
}

module.exports = async (req, res) => {
  // ... handle requests
};
```

### Step 3: Update Tracking Submission Flow
Modify `api/public-po.js` `handleSubmit` function:

```javascript
async function handleSubmit(body) {
  // ... existing code to save tracking ...

  // After saving to database, lookup tracking info
  if (process.env.AFTERSHIP_API_KEY) {
    for (const entry of cleaned) {
      try {
        const trackingInfo = await lookupTracking(
          entry.tracking_number,
          entry.carrier
        );

        // Update shipment_tracking with delivery date
        if (trackingInfo.estimatedDelivery) {
          await supabase
            .from('shipment_tracking')
            .update({
              estimated_delivery_date: trackingInfo.estimatedDelivery,
              status: trackingInfo.status.toLowerCase()
            })
            .eq('tracking_number', entry.tracking_number)
            .eq('po_id', link.purchase_order_id);
        }
      } catch (err) {
        console.warn('Failed to lookup tracking:', err);
        // Don't fail submission if lookup fails
      }
    }
  }

  // ... rest of function
}
```

### Step 4: Display Delivery Dates in UI
Update `PartsReceivingPageNew.js` to show ETA:

```jsx
<button
  key={t.id}
  onClick={(e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(t.tracking_number);
    window.open(`https://www.google.com/search?q=${encodeURIComponent(t.tracking_number)}`, '_blank');
  }}
  className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 ..."
>
  <Truck className="w-3 h-3 text-blue-600" />
  <span className="font-mono text-xs">{t.tracking_number}</span>
  <span className="text-xs">({t.carrier})</span>
  {t.estimated_delivery_date && (
    <span className="text-xs text-green-600 font-medium">
      ETA: {new Date(t.estimated_delivery_date).toLocaleDateString()}
    </span>
  )}
</button>
```

### Step 5: Optional - Webhook for Status Updates
AfterShip can send webhooks when tracking status changes:

1. Create `api/aftership-webhook.js` to receive updates
2. Configure webhook URL in AfterShip dashboard
3. Update `shipment_tracking` table when status changes
4. Optionally notify internal stakeholders of delivery updates

---

## Database Schema (Already Exists)
The `shipment_tracking` table already has the needed columns:
- `estimated_delivery_date` - timestamp
- `status` - text (pending, in_transit, delivered, etc.)
- `shipped_date` - timestamp

---

## Cost Estimate
| Volume | AfterShip | EasyPost | Direct APIs |
|--------|-----------|----------|-------------|
| 50/month | Free | $2.50 | Free |
| 200/month | $11 | $10 | Free |
| 500/month | $29 | $25 | Free |

Direct carrier APIs are free but require more development time to maintain multiple integrations.

---

## Future Enhancements
1. **Automatic status updates** via webhooks
2. **Delivery notifications** - Email stakeholders when package is delivered
3. **Dashboard widget** - Show "Arriving Today" or "Arriving This Week" counts
4. **Late shipment alerts** - Flag packages past expected delivery
5. **Carrier performance tracking** - Analytics on delivery times by carrier
