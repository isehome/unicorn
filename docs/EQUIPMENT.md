# Equipment CSV Import & Wire Drop Linking Guide

This guide covers everything needed to finish the new equipment import workflow and link imported items to individual wire drops.

## 1. Run the Supabase migration

Execute the new migration after your base schema and other project enhancement scripts:

1. Open the Supabase SQL editor.
2. Copy the contents of `supabase/project_equipment_import_and_linking.sql`.
3. Run the script.

This creates the following tables (plus RLS policies, triggers, and helper indexes):

- `project_rooms`
- `equipment_import_batches`
- `project_equipment`
- `project_equipment_inventory`
- `project_equipment_instances`
- `project_labor_budget`
- `wire_drop_equipment_links`
- `project_equipment_with_rooms` (view for reporting)

> Tip: after running the migration, you can verify the tables with  
> `select table_name from information_schema.tables where table_schema = 'public' order by table_name;`

## 2. Importing a proposal CSV

1. Navigate to the PM project view (`/pm/project/:projectId`).
2. Scroll to **Project Equipment & Labor**.
3. Click **Upload CSV** and select your proposal export.
4. The importer will:
   - Auto-create project rooms (flags “network/headend” rooms automatically).
   - Insert equipment into `project_equipment`.
   - Create zeroed inventory rows in `project_equipment_inventory`.
   - Aggregate labor lines into `project_labor_budget`.
   - Record the run in `equipment_import_batches`.
5. Each new upload replaces previously imported rows (manual entries stay intact).

## 3. Linking equipment to wire drops

1. Open a wire drop detail page (`/wire-drops/:id`).
2. Switch to the **Room End** or **Head End** tab.
3. Imported equipment appears automatically:
   - Items whose room matches the wire drop are highlighted.
   - Head-end equipment is filtered into its own list.
4. Select one or more devices and click **Save**.  
   This writes to `wire_drop_equipment_links` and maintains custom sort order.

## 4. Helpful queries

```sql
-- All equipment for a project, with room metadata
select * from public.project_equipment_with_rooms
where project_id = 'your-project-id'
order by room_name, name;

-- Wire drop links
select wdl.wire_drop_id, wd.name as wire_drop_name,
       pe.name as equipment_name, wdl.link_side, wdl.sort_order
from wire_drop_equipment_links wdl
join wire_drops wd on wd.id = wdl.wire_drop_id
join project_equipment pe on pe.id = wdl.project_equipment_id
order by wd.name, wdl.link_side, wdl.sort_order;
```

## 4. Aligning Lucid rooms with imported equipment

Because Lucid shapes and proposal CSVs come from different systems, room names may not match perfectly.  
Use the **Room Name Alignment** section inside the PM project view to marry up spelling differences:

1. Fetch Lucid shape data for the project.
2. Any Lucid room names that don’t match `project_rooms` or alias records are listed for review.
3. Map each unmatched name to an existing room or create a new room (optionally marking it as head-end).
4. Once mapped, new wire drops automatically attach to the canonical room ID, so imported equipment displays in the wire-drop detail view.

Room aliases are stored in `project_room_aliases`, so future imports reuse the mapping automatically.

You’re ready to move proposal data straight into project execution and keep wire drop documentation in sync. Have fun connecting everything! 🚀
