# Procurement System - Visual Workflow

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PROCUREMENT SYSTEM                          │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │   Supplier   │  │  Purchase    │  │  Shipment    │        │
│  │  Management  │→ │    Orders    │→ │   Tracking   │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│         ↓                  ↓                  ↓               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  Equipment   │  │   Milestone  │  │   Delivery   │        │
│  │   Grouping   │→ │    Sync      │→ │   Dashboard  │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram

```
┌─────────────────┐
│   PROJECT       │
│   EQUIPMENT     │ Existing equipment with supplier names
└────────┬────────┘
         │
         ↓ Group by Supplier & Milestone
         │
┌────────┴────────────────────────────────────────────┐
│                                                      │
│  Prewire Prep Equipment          Trim Prep Equipment│
│  (required_for_prewire = true)   (= false)          │
│                                                      │
│  Supplier A: 10 items            Supplier A: 5 items│
│  Supplier B: 8 items             Supplier B: 12 items│
│  Supplier C: 5 items             Supplier C: 3 items│
│                                                      │
└───────────┬──────────────────────────────────────────┘
            │
            ↓ Create POs
            │
┌───────────┴──────────────────────────────────────────┐
│  PURCHASE ORDERS                                      │
│                                                       │
│  PO-2025-001-SUPA-001  │  PO-2025-002-SUPA-001      │
│  Supplier A            │  Supplier A                 │
│  Milestone: prewire    │  Milestone: trim            │
│  10 line items         │  5 line items               │
│  Status: draft         │  Status: draft              │
│                                                       │
│  PO-2025-003-SUPB-001  │  PO-2025-004-SUPB-001      │
│  Supplier B            │  Supplier B                 │
│  Milestone: prewire    │  Milestone: trim            │
│  8 line items          │  12 line items              │
└───────────┬──────────────────────────────────────────┘
            │
            ↓ Submit to Supplier
            │
┌───────────┴──────────────────────────────────────────┐
│  Status: draft → submitted                            │
│  Supplier receives PO                                 │
│  PM waits for shipment                                │
└───────────┬──────────────────────────────────────────┘
            │
            ↓ Add Tracking
            │
┌───────────┴──────────────────────────────────────────┐
│  SHIPMENT TRACKING                                    │
│                                                       │
│  PO-2025-001-SUPA-001:                               │
│    ├─ 1Z999AA10123456784 (UPS)                       │
│    │  Status: in_transit                             │
│    │  Location: Memphis, TN                          │
│    │  ETA: 2025-11-15                                │
│    │                                                  │
│    └─ 9400111899223344556677 (USPS)                  │
│       Status: out_for_delivery                       │
│       ETA: 2025-11-10                                │
│                                                       │
└───────────┬──────────────────────────────────────────┘
            │
            ↓ Auto-refresh from Carrier API
            │
┌───────────┴──────────────────────────────────────────┐
│  CARRIER API INTEGRATION                              │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │   USPS   │  │   UPS    │  │  FedEx   │          │
│  │   API    │  │   API    │  │   API    │          │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘          │
│       │             │              │                 │
│       └─────────────┴──────────────┘                 │
│                     │                                │
│              ┌──────┴──────┐                         │
│              │  AfterShip  │ (Alternative)           │
│              │   Unified   │                         │
│              │     API     │                         │
│              └─────────────┘                         │
└───────────┬──────────────────────────────────────────┘
            │
            ↓ Update Tracking Status
            │
┌───────────┴──────────────────────────────────────────┐
│  Status: delivered                                    │
│  Actual Delivery: 2025-11-10                         │
└───────────┬──────────────────────────────────────────┘
            │
            ↓ Mark Items Received
            │
┌───────────┴──────────────────────────────────────────┐
│  RECEIVE ITEMS                                        │
│                                                       │
│  PO Line Item:                                        │
│    quantity_ordered: 10                              │
│    quantity_received: 10 ✓                           │
│                                                       │
└───────────┬──────────────────────────────────────────┘
            │
            ↓ Auto-sync via Trigger
            │
┌───────────┴──────────────────────────────────────────┐
│  PROJECT EQUIPMENT                                    │
│                                                       │
│  Equipment Item:                                      │
│    planned_quantity: 10                              │
│    ordered_quantity: 10 (auto-updated)               │
│    received_quantity: 10 (auto-updated) ✓            │
│                                                       │
└───────────┬──────────────────────────────────────────┘
            │
            ↓ Recalculate via milestoneService
            │
┌───────────┴──────────────────────────────────────────┐
│  MILESTONE PERCENTAGES                                │
│                                                       │
│  Prewire Prep:                                        │
│    Formula: (ordered × 50% + received × 50%) / planned│
│    Result: (10×0.5 + 10×0.5) / 10 = 100% ✓          │
│                                                       │
│  Status: Not Started → In Progress → Complete ✓      │
└───────────────────────────────────────────────────────┘
```

## Component Interaction Flow

```
┌──────────────────────────────────────────────────────────────┐
│                         PM DASHBOARD                         │
└───────┬──────────────────────────────────────────────┬───────┘
        │                                              │
        ↓                                              ↓
┌───────────────┐                            ┌─────────────────┐
│  SUPPLIER     │                            │  DELIVERY       │
│  MANAGEMENT   │                            │  DASHBOARD      │
│               │                            │                 │
│  • View List  │                            │  • Shipments    │
│  • Add New    │                            │  • In Transit   │
│  • Edit Info  │                            │  • Delivered    │
│  • Contacts   │                            │  • Exceptions   │
└───────┬───────┘                            └────────┬────────┘
        │                                             │
        ↓                                             ↓
┌───────────────┐                            ┌─────────────────┐
│  PO CREATOR   │                            │  TRACKING       │
│               │                            │  STATUS         │
│  ┌─────────┐  │                            │                 │
│  │ Group   │  │                            │  • View All     │
│  │ Equip   │──┼──→ Create PO              │  • Add New      │
│  │ by      │  │                            │  • Auto-Refresh │
│  │ Supplier│  │                            │  • View Details │
│  └─────────┘  │                            │                 │
│               │                            └─────────────────┘
│  Prewire Prep:│
│  ├─ Supplier A│
│  ├─ Supplier B│
│  └─ Supplier C│
│               │
│  Trim Prep:   │
│  ├─ Supplier A│
│  ├─ Supplier B│
│  └─ Supplier C│
└───────┬───────┘
        │
        ↓
┌───────────────────────────────────────────────────────────────┐
│  PO LIST                                                      │
│                                                               │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │ PO-2025-001-ABC-001 │  │ PO-2025-002-ABC-001 │          │
│  │ Supplier: ABC       │  │ Supplier: ABC       │          │
│  │ Stage: prewire_prep │  │ Stage: trim_prep    │          │
│  │ Status: submitted   │  │ Status: received ✓  │          │
│  │ Items: 8/10 recv'd  │  │ Items: 5/5 recv'd   │          │
│  │ Track: 2 shipments  │  │ Track: 1 shipment   │          │
│  │                     │  │                     │          │
│  │ [View] [Receive]    │  │ [View] [Complete]   │          │
│  └─────────────────────┘  └─────────────────────┘          │
└───────────────────────────────────────────────────────────────┘
```

## Service Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      REACT COMPONENTS                        │
│  (SupplierList, POCreator, TrackingStatus, etc.)            │
└──────────────────────────┬──────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
         ↓                 ↓                 ↓
┌─────────────────┐ ┌─────────────────┐ ┌──────────────────┐
│ supplierService │ │ purchaseOrder   │ │ trackingService  │
│                 │ │   Service       │ │                  │
│ • CRUD Ops      │ │                 │ │ • Add Tracking   │
│ • Group Equip   │ │ • Create PO     │ │ • Refresh Status │
│ • Match Names   │ │ • Generate #    │ │ • Carrier APIs   │
│ • Link to Equip │ │ • Line Items    │ │ • Batch Updates  │
│                 │ │ • Receive       │ │ • Dashboard Stats│
└────────┬────────┘ └────────┬────────┘ └────────┬─────────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────┐
│                      SUPABASE CLIENT                         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                   SUPABASE DATABASE                          │
│                                                              │
│  Tables:                  Functions:                         │
│  • suppliers              • generate_po_number()             │
│  • purchase_orders        • update_po_totals()               │
│  • purchase_order_items   • sync_equipment_quantities()      │
│  • shipment_tracking      • auto_update_po_status()          │
│  • supplier_contacts                                         │
│  • po_sequence            Views:                             │
│                           • purchase_orders_summary          │
│  Triggers:                • equipment_for_po                 │
│  • trg_update_po_totals                                      │
│  • trg_sync_equipment_quantities                             │
│  • trg_auto_update_po_status                                 │
└─────────────────────────────────────────────────────────────┘
```

## PO Number Generation Flow

```
User Creates PO
      │
      ↓
┌─────────────────────────────────────┐
│ Call generate_po_number(supplier_id)│
└──────────────┬──────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────────┐
│ 1. Get Current Year: 2025                            │
│ 2. Get/Increment Overall Sequence: 001               │
│ 3. Get Supplier Short Code: ABC                      │
│ 4. Get Supplier Sequence for Year: 001               │
└──────────────┬───────────────────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────────┐
│ Format: PO-{year}-{seq}-{code}-{supplier_seq}       │
│         PO-2025-001-ABC-001                          │
└──────────────┬───────────────────────────────────────┘
               │
               ↓ Return unique PO number
               │
┌──────────────┴───────────────────────────────────────┐
│ Create purchase_order with po_number                 │
│ Status: draft                                        │
│ Ready for line items                                 │
└──────────────────────────────────────────────────────┘
```

## Tracking Update Flow

```
PM Adds Tracking Number
      │
      ↓
┌─────────────────────────────────────────┐
│ trackingService.addTracking(po_id, {    │
│   tracking_number: '1Z999...',          │
│   carrier: 'UPS',                       │
│   auto_tracking_enabled: true           │
│ })                                      │
└──────────────┬──────────────────────────┘
               │
               ↓
┌──────────────────────────────────────────────────────┐
│ Insert into shipment_tracking table                  │
│ • Initial status: 'pending'                          │
│ • Create tracking_url from carrier                   │
└──────────────┬───────────────────────────────────────┘
               │
               ↓ If auto_tracking_enabled
               │
┌──────────────┴───────────────────────────────────────┐
│ trackingService.refreshTracking(tracking_id)         │
└──────────────┬───────────────────────────────────────┘
               │
               ↓ Determine carrier
               │
      ┌────────┴────────┐
      │                 │
      ↓                 ↓
┌─────────────┐  ┌──────────────────┐
│  Individual │  │    AfterShip     │
│  Carrier    │  │    Unified API   │
│  APIs       │  │                  │
├─────────────┤  └────────┬─────────┘
│ • USPS API  │           │
│ • UPS API   │           ↓
│ • FedEx API │  ┌──────────────────┐
│ • DHL API   │  │ Single API call  │
└──────┬──────┘  │ handles all      │
       │         │ carriers         │
       ↓         └────────┬─────────┘
┌──────────────────────────┴──────────────────────┐
│ Parse API Response:                             │
│ • Current status (in_transit, delivered, etc.)  │
│ • Current location                              │
│ • Estimated delivery date                       │
│ • Actual delivery date (if delivered)           │
│ • Exception info (if problem)                   │
└──────────────┬──────────────────────────────────┘
               │
               ↓
┌──────────────┴──────────────────────────────────┐
│ Update shipment_tracking record:                │
│ • status = 'in_transit'                         │
│ • current_location = 'Memphis, TN'              │
│ • estimated_delivery_date = '2025-11-15'        │
│ • tracking_data = {raw_api_response}            │
│ • last_checked_at = now()                       │
└──────────────┬──────────────────────────────────┘
               │
               ↓ On status = 'delivered'
               │
┌──────────────┴──────────────────────────────────┐
│ Auto-update:                                     │
│ • actual_delivery_date = delivery_date          │
│ • PO status may update to 'received'            │
│ • PM notified (optional)                        │
└──────────────────────────────────────────────────┘
```

## Milestone Integration Flow

```
┌────────────────────────────────────────────┐
│  Project Equipment Import (Existing)       │
│  • CSV with supplier column                │
│  • linked to global_parts                  │
│  • required_for_prewire flag set           │
└──────────────┬─────────────────────────────┘
               │
               ↓ Group by required_for_prewire
               │
      ┌────────┴────────┐
      │                 │
      ↓                 ↓
┌─────────────┐   ┌─────────────┐
│ Prewire     │   │ Trim        │
│ Equipment   │   │ Equipment   │
│ (= true)    │   │ (= false)   │
└──────┬──────┘   └──────┬──────┘
       │                 │
       ↓                 ↓
┌─────────────┐   ┌─────────────┐
│ Create POs  │   │ Create POs  │
│ prewire_prep│   │ trim_prep   │
└──────┬──────┘   └──────┬──────┘
       │                 │
       ↓                 ↓
┌─────────────┐   ┌─────────────┐
│ Receive     │   │ Receive     │
│ Items       │   │ Items       │
└──────┬──────┘   └──────┬──────┘
       │                 │
       ↓ Trigger         ↓ Trigger
       │                 │
┌──────┴──────┐   ┌──────┴──────┐
│ Update      │   │ Update      │
│ ordered_qty │   │ ordered_qty │
│ received_qty│   │ received_qty│
└──────┬──────┘   └──────┬──────┘
       │                 │
       ↓ Auto-calc       ↓ Auto-calc
       │                 │
┌──────┴──────┐   ┌──────┴──────┐
│ Prewire     │   │ Trim        │
│ Prep        │   │ Prep        │
│ Percentage  │   │ Percentage  │
│             │   │             │
│ 50% ordered │   │ 50% ordered │
│ 50% received│   │ 50% received│
└─────────────┘   └─────────────┘
```

## Summary

This procurement system provides:

1. **Complete Supplier Management** - Track all vendors with full details
2. **Automated PO Generation** - Smart grouping by supplier and milestone
3. **Auto-Calculated Numbers** - Unique PO numbers per year/supplier
4. **Multi-Carrier Tracking** - Support for all major carriers + unified API
5. **Real-Time Updates** - Auto-refresh tracking status and ETAs
6. **Seamless Integration** - Works with existing milestone calculations
7. **Automatic Syncing** - Quantities flow from PO → Equipment → Milestones

All managed through clean, documented services and database functions!
