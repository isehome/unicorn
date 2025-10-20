begin;

-- Remove all wire drops (stages, room/head links, and equipment links cascade)
delete from public.wire_drops;

delete from public.project_equipment_inventory;
delete from public.project_equipment_instances;
delete from public.project_equipment;
delete from public.project_labor_budget;

commit;
