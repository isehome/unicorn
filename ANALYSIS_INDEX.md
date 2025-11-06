# Wire Drop & Equipment System Analysis - Documentation Index

## Overview

This directory contains comprehensive documentation of the wire drop system and equipment management architecture in the Unicorn project.

## Documents Included

### 1. WIRE_DROP_SYSTEM_ARCHITECTURE_ANALYSIS.md (20 KB)
**Comprehensive deep-dive documentation**

Best for: Understanding the complete system architecture

Contents:
- Executive summary
- Wire drop system architecture (1.1-1.3)
- Equipment management architecture - three-tier system (2.1-2.2)
- Database tables and relationships (3.1-3.2)
- How equipment is added to wire drops (4.1-4.3)
- Global parts access points (5)
- Existing project-specific data fields (6)
- What's missing for requirements (7)
- CSV import workflow details (8)
- Wire drop equipment linking (9)
- Summary: Current vs Missing (10)
- Implementation strategy (11)
- Key files reference (12)

Key sections:
- Lines 1-100: Overview and wire drop structure
- Lines 150-400: Three-tier equipment system explanation
- Lines 650-900: CSV import process in detail
- Lines 950-1050: Implementation strategy recommendations

### 2. QUICK_REFERENCE_WIRE_DROPS.md (13 KB)
**Practical quick-lookup guide**

Best for: Day-to-day reference while coding

Contents:
- Core concepts at a glance
- Database quick lookup with examples
- Key files by task (what to edit for what)
- Feature tour (equipment assignment)
- Instance handling in CSV imports
- Wire drop linking constraints
- Global parts vs project equipment comparison
- Procurement status fields
- Project-specific data options (3 approaches)
- CSV import modes (REPLACE/MERGE/APPEND)
- UniFi integration fields
- Bottom navigation access points
- Key service methods
- Common workflows (5 detailed examples)
- Debugging tips
- Quick SQL checks
- Performance notes

## Quick Navigation

### I want to understand...

| Topic | Read |
|-------|------|
| Complete system architecture | WIRE_DROP_SYSTEM_ARCHITECTURE_ANALYSIS.md Sections 1-3 |
| How CSV import works | WIRE_DROP_SYSTEM_ARCHITECTURE_ANALYSIS.md Section 8 OR QUICK_REFERENCE_WIRE_DROPS.md "Instance Handling" |
| How equipment links to wire drops | WIRE_DROP_SYSTEM_ARCHITECTURE_ANALYSIS.md Section 9 |
| Three-tier equipment system | WIRE_DROP_SYSTEM_ARCHITECTURE_ANALYSIS.md Section 2 |
| What's missing for requirements | WIRE_DROP_SYSTEM_ARCHITECTURE_ANALYSIS.md Section 7 |
| Implementation plan | WIRE_DROP_SYSTEM_ARCHITECTURE_ANALYSIS.md Section 11 |

### I want to code...

| Task | Read |
|------|------|
| Add equipment to wire drop | QUICK_REFERENCE_WIRE_DROPS.md "Feature Tour" + "Key Files by Task" |
| Implement QR codes | WIRE_DROP_SYSTEM_ARCHITECTURE_ANALYSIS.md Section 11 (Phase 2) |
| Modify equipment selection UI | QUICK_REFERENCE_WIRE_DROPS.md "Equipment Assignment" |
| Support new CSV columns | WIRE_DROP_SYSTEM_ARCHITECTURE_ANALYSIS.md Section 8 + QUICK_REFERENCE_WIRE_DROPS.md "CSV Import Modes" |
| Add project-specific fields | WIRE_DROP_SYSTEM_ARCHITECTURE_ANALYSIS.md Section 6 + QUICK_REFERENCE_WIRE_DROPS.md "Project-Specific Data Options" |

### I want to debug...

| Problem | Read |
|---------|------|
| Equipment missing from wire drop | QUICK_REFERENCE_WIRE_DROPS.md "Debugging Tips" |
| CSV import failing | QUICK_REFERENCE_WIRE_DROPS.md "Debugging Tips" |
| Stages not completing | QUICK_REFERENCE_WIRE_DROPS.md "Debugging Tips" |
| Understand data relationships | WIRE_DROP_SYSTEM_ARCHITECTURE_ANALYSIS.md Section 3 |
| Check database state | QUICK_REFERENCE_WIRE_DROPS.md "Quick Database Checks" |

## Key Findings Summary

### What Already Exists
- Complete wire drop system with 3-stage workflow
- Three-tier equipment management
- CSV import with intelligent processing
- Equipment instance tracking
- Global parts catalog
- Wire drop-to-equipment linking
- Procurement tracking
- UniFi integration fields

### What's Missing
- QR code generation/management
- Equipment search/filter UI
- Custom project identifier storage
- Equipment detail enhancements
- Bulk processing capabilities

### Bridge Solution
The `metadata` JSONB field in `project_equipment` can store all project-specific data without schema changes.

## Main Components

### Database Tables (Most Important)
```
wire_drops (parent)
  -> wire_drop_stages (auto-created: prewire, trim_out, commission)
  -> wire_drop_equipment_links (junction)
       -> project_equipment (from CSV import)
            -> project_rooms (normalized room data)
            -> global_parts (optional cross-project reference)
```

### Key Services
- `wireDropService` - Wire drop CRUD + linking
- `projectEquipmentService` - Equipment import + management
- `partsService` - Global parts management

### Entry Points
- Bottom Navigation -> "Parts" button -> Global parts manager
- Wire Drop Detail -> "Room" tab -> Equipment assignment UI
- CSV Import -> Equipment import dialog

## File References

### Components
- `/src/components/WireDropsList.js` - List view
- `/src/components/WireDropDetailEnhanced.js` - Detail + assignment (31k lines)
- `/src/components/BottomNavigation.js` - Navigation (5 routes)
- `/src/components/PartsListPage.js` - Global parts list
- `/src/components/GlobalPartsManager.js` - Parts management

### Services
- `/src/services/wireDropService.js` - Wire drop operations
- `/src/services/projectEquipmentService.js` - Equipment operations
- `/src/services/partsService.js` - Global parts operations

### Database Schema
- `/supabase/project_equipment_import_and_linking.sql` - Equipment schema
- `/supabase/add_global_parts.sql` - Parts schema
- `/supabase/add_unifi_fields_to_equipment.sql` - UniFi integration

## Implementation Roadmap

### Phase 1: Database (Low Risk)
Add columns to `project_equipment`:
- `qr_code_url` TEXT
- `asset_tag` TEXT
- `project_identifier` TEXT

### Phase 2: QR Code Service (Medium Risk)
Create QR code generation and storage service

### Phase 3: UI/UX (Medium Risk)
- Equipment search/filter
- Project-specific field display
- QR code generation UI

### Phase 4: CSV Integration (Low Risk)
- New CSV columns for custom fields
- Auto-generation of QR codes

## Current Limitations to Be Aware Of

1. Equipment selection UI has no search - must scroll through list
2. No equipment details shown during selection (only name)
3. Cannot distinguish instances visually (Speaker 1 vs Speaker 2)
4. Head-end equipment requires manual selection (no auto-association)
5. No assignment history tracking (though timestamps exist)

## Recommendations

1. Use `metadata` JSONB field for immediate project-specific data needs
2. Build QR code service independently of schema changes
3. Focus on UI/UX improvements for equipment assignment
4. Consider assignment history table only if needed
5. Make CSV columns backward-compatible when extending

## Questions Answered

- Where is the global parts list accessed? Bottom nav -> "Parts"
- How are instances tracked? `instance_number`, `instance_name`, `parent_import_group`
- Where are MAC addresses stored? UniFi fields + generic `metadata` JSONB
- Can equipment be in multiple wire drops? Yes, via junction table
- What happens on CSV re-import? REPLACE mode preserves wire drop links
- How are equipment quantities handled? Split into individual instances per CSV row quantity

## Document Statistics

- WIRE_DROP_SYSTEM_ARCHITECTURE_ANALYSIS.md: 575 lines, 20 KB
- QUICK_REFERENCE_WIRE_DROPS.md: ~400 lines, 13 KB
- Combined: 975 lines of documentation

Last Updated: November 2, 2025
