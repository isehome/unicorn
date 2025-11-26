# Prewire Classification Implementation

## Overview

This implementation adds the ability to classify equipment parts as "required for prewire" to support separate project milestones for **Prewire Prep** and **Trim Prep**. This allows project managers to track and manage equipment procurement in two distinct phases, as prewire equipment needs to be ordered and received much earlier in the project timeline.

## Database Changes

### New Column: `global_parts.required_for_prewire`

A new boolean column has been added to the `global_parts` table:

```sql
ALTER TABLE public.global_parts
  ADD COLUMN IF NOT EXISTS required_for_prewire BOOLEAN NOT NULL DEFAULT false;
```

- **Default**: `false` (parts are considered Trim Prep by default)
- **Purpose**: Flags parts that are needed during the prewire phase
- **Indexed**: A partial index exists for efficient filtering of prewire parts

### New View: `project_equipment_by_phase`

A new view provides an easy way to see equipment categorized by phase across all projects:

```sql
CREATE OR REPLACE VIEW public.project_equipment_by_phase AS
SELECT
  pe.id,
  pe.project_id,
  pe.name,
  pe.part_number,
  pe.room_id,
  pe.planned_quantity,
  pe.ordered_confirmed,
  pe.ordered_confirmed_at,
  pe.onsite_confirmed,
  pe.onsite_confirmed_at,
  gp.required_for_prewire,
  CASE 
    WHEN gp.required_for_prewire = true THEN 'Prewire Prep'
    ELSE 'Trim Prep'
  END as project_phase,
  pr.name as room_name,
  gp.name as global_part_name,
  gp.manufacturer,
  gp.model
FROM public.project_equipment pe
LEFT JOIN public.global_parts gp ON gp.id = pe.global_part_id
LEFT JOIN public.project_rooms pr ON pr.id = pe.room_id
WHERE pe.is_active = true;
```

## UI Changes

### Global Parts Manager

The Global Parts Manager now includes:

1. **Phase Filter Buttons**: Three filter options at the top:
   - **All Parts**: Shows all parts in the catalog
   - **Prewire Prep**: Shows only parts marked as required for prewire
   - **Trim Prep**: Shows only parts NOT marked as required for prewire

2. **Prewire Badge**: Parts marked as required for prewire display an orange "Prewire" badge next to their name

3. **Toggle Switch**: Each part card now has a "Required for Prewire" toggle switch that allows you to:
   - Mark parts as required for prewire (toggle on = orange)
   - Mark parts as trim prep (toggle off = gray)
   - Changes are saved immediately to the database

### Visual Indicators

- **Prewire Badge**: Orange badge with text "Prewire"
- **Toggle Switch**: 
  - Orange = Required for prewire
  - Gray = Trim prep (standard)
- **Filter Buttons**: Violet highlight when active

## Service Layer Changes

### New Functions in `projectEquipmentService.js`

#### `fetchProjectEquipmentByPhase(projectId, phase)`

Fetches equipment for a project, optionally filtered by phase:

```javascript
const equipment = await projectEquipmentService.fetchProjectEquipmentByPhase(projectId, 'prewire');
// Returns only equipment marked as required for prewire

const equipment = await projectEquipmentService.fetchProjectEquipmentByPhase(projectId, 'trim');
// Returns only equipment NOT marked as required for prewire

const equipment = await projectEquipmentService.fetchProjectEquipmentByPhase(projectId, 'all');
// Returns all equipment (same as fetchProjectEquipment)
```

#### `categorizeEquipmentByPhase(equipment)`

Separates an array of equipment into prewire and trim categories:

```javascript
const { prewire, trim } = projectEquipmentService.categorizeEquipmentByPhase(equipment);

// prewire = array of equipment with required_for_prewire = true
// trim = array of equipment with required_for_prewire = false/null
```

#### `getPhaseStats(equipment)`

Calculates statistics for equipment by phase:

```javascript
const stats = projectEquipmentService.getPhaseStats(equipment);

// Returns:
// {
//   prewire: {
//     total: 25,
//     ordered: 20,
//     onsite: 15,
//     totalQuantity: 150,
//     orderedPercentage: 80,
//     onsitePercentage: 60
//   },
//   trim: {
//     total: 50,
//     ordered: 10,
//     onsite: 5,
//     totalQuantity: 200,
//     orderedPercentage: 20,
//     onsitePercentage: 10
//   },
//   all: {
//     total: 75,
//     ordered: 30,
//     onsite: 20,
//     totalQuantity: 350,
//     orderedPercentage: 40,
//     onsitePercentage: 27
//   }
// }
```

## How to Use

### 1. Classify Parts

1. Navigate to the Global Parts Manager
2. Use the filter buttons to view parts by phase
3. For each part, toggle the "Required for Prewire" switch:
   - **ON (Orange)**: Part is required for prewire phase
   - **OFF (Gray)**: Part is for trim phase

### 2. Query Equipment by Phase

In your project views, you can now filter equipment:

```javascript
// Get only prewire equipment
const prewireEquipment = await projectEquipmentService.fetchProjectEquipmentByPhase(
  projectId, 
  'prewire'
);

// Get only trim equipment
const trimEquipment = await projectEquipmentService.fetchProjectEquipmentByPhase(
  projectId, 
  'trim'
);
```

### 3. Display Phase Statistics

Use the statistics function to show procurement progress by phase:

```javascript
const equipment = await projectEquipmentService.fetchProjectEquipment(projectId);
const stats = projectEquipmentService.getPhaseStats(equipment);

console.log(`Prewire: ${stats.prewire.orderedPercentage}% ordered`);
console.log(`Trim: ${stats.trim.orderedPercentage}% ordered`);
```

### 4. Use the Database View

Query the view directly for reporting:

```sql
-- Get all prewire equipment for a specific project
SELECT * FROM project_equipment_by_phase 
WHERE project_id = '...' 
  AND project_phase = 'Prewire Prep';

-- Count equipment by phase
SELECT project_phase, COUNT(*) 
FROM project_equipment_by_phase 
WHERE project_id = '...' 
GROUP BY project_phase;
```

## Implementation Files

- **Database Migration**: `supabase/add_prewire_classification.sql`
- **UI Component**: `src/components/GlobalPartsManager.js`
- **Service Layer**: `src/services/projectEquipmentService.js`

## Benefits

1. **Separate Milestones**: Track Prewire Prep and Trim Prep as distinct project phases
2. **Better Planning**: Identify which equipment needs to be ordered early in the project
3. **Improved Tracking**: Monitor procurement progress separately for each phase
4. **Flexible Classification**: Easy toggle switch allows quick reclassification as needed
5. **Automatic Propagation**: Once a part is classified in global_parts, all project equipment using that part inherits the classification

## Migration Instructions

To apply this feature to your database:

```bash
# Run the migration SQL file in your Supabase SQL editor
psql -f supabase/add_prewire_classification.sql

# Or in Supabase dashboard:
# 1. Go to SQL Editor
# 2. Copy the contents of supabase/add_prewire_classification.sql
# 3. Execute the SQL
```

## Example Workflow

1. **Initial Setup**:
   - Import equipment from project CSV
   - Equipment is automatically linked to global parts
   
2. **Classify Parts**:
   - Open Global Parts Manager
   - Toggle "Required for Prewire" for parts like:
     - Low voltage cable (CAT6, coax)
     - Wall plates and rough-in rings
     - Conduit and boxes
     - Any infrastructure that goes in during prewire
   
3. **Track Progress**:
   - Use phase statistics to track procurement
   - Create separate views for Prewire Prep vs Trim Prep
   - Monitor ordering and receiving separately for each phase

4. **Project Timeline**:
   - **Prewire Prep Milestone**: All prewire equipment ordered and onsite
   - **Trim Prep Milestone**: All trim equipment ordered and onsite
   - Clear separation allows better project scheduling

## Future Enhancements

Potential additions to this feature:

- Add prewire/trim filters to project equipment views
- Create separate dashboards for each phase
- Add phase-specific reporting
- Integrate with project timeline/Gantt charts
- Add notifications when prewire equipment needs to be ordered
- Bulk classification tools for multiple parts at once
