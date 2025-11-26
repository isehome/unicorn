-- Project Equipment Import & Wire Drop Linking Schema
-- Creates project-specific equipment tables, import batches, labor budgets,
-- and linking tables required for the enhanced equipment import workflow.

-- ============================================================
-- Helper: timestamp trigger for updated_at columns
-- ============================================================
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- Table: project_rooms
-- Stores normalized room names per project (head-end aware)
-- ============================================================
create table if not exists public.project_rooms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  normalized_name text generated always as (
    lower(trim(regexp_replace(name, '\s+', ' ', 'g')))
  ) stored,
  is_headend boolean not null default false,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint project_rooms_unique_per_project unique (project_id, normalized_name)
);

alter table public.project_rooms enable row level security;

drop policy if exists dev_read_all on public.project_rooms;
drop policy if exists dev_insert_all on public.project_rooms;
drop policy if exists dev_update_all on public.project_rooms;
drop policy if exists dev_delete_all on public.project_rooms;

create policy dev_read_all on public.project_rooms
  for select to anon, authenticated using (true);
create policy dev_insert_all on public.project_rooms
  for insert to anon, authenticated with check (true);
create policy dev_update_all on public.project_rooms
  for update to anon, authenticated using (true) with check (true);
create policy dev_delete_all on public.project_rooms
  for delete to authenticated using (true);

create index if not exists idx_project_rooms_project on public.project_rooms(project_id);
create index if not exists idx_project_rooms_headend on public.project_rooms(project_id, is_headend);

drop trigger if exists trg_project_rooms_updated_at on public.project_rooms;
create trigger trg_project_rooms_updated_at
  before update on public.project_rooms
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- Table: equipment_import_batches
-- Tracks CSV imports per project
-- ============================================================
create table if not exists public.equipment_import_batches (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  filename text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processed', 'failed')),
  total_rows integer not null default 0 check (total_rows >= 0),
  processed_rows integer not null default 0 check (processed_rows >= 0),
  raw_payload jsonb,
  error_message text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  completed_at timestamptz,
  updated_at timestamptz default now()
);

alter table public.equipment_import_batches enable row level security;

drop policy if exists dev_read_all on public.equipment_import_batches;
drop policy if exists dev_insert_all on public.equipment_import_batches;
drop policy if exists dev_update_all on public.equipment_import_batches;
drop policy if exists dev_delete_all on public.equipment_import_batches;

create policy dev_read_all on public.equipment_import_batches
  for select to anon, authenticated using (true);
create policy dev_insert_all on public.equipment_import_batches
  for insert to anon, authenticated with check (true);
create policy dev_update_all on public.equipment_import_batches
  for update to anon, authenticated using (true) with check (true);
create policy dev_delete_all on public.equipment_import_batches
  for delete to authenticated using (true);

create index if not exists idx_equipment_import_batches_project
  on public.equipment_import_batches(project_id);
create index if not exists idx_equipment_import_batches_status
  on public.equipment_import_batches(status);

drop trigger if exists trg_equipment_import_batches_updated_at on public.equipment_import_batches;
create trigger trg_equipment_import_batches_updated_at
  before update on public.equipment_import_batches
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- Table: project_equipment
-- Project-specific bill of materials generated from CSV imports
-- ============================================================
create table if not exists public.project_equipment (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  catalog_id uuid references public.equipment(id) on delete set null,
  global_part_id uuid references public.global_parts(id) on delete set null,
  room_id uuid references public.project_rooms(id) on delete set null,
  name text not null,
  description text,
  manufacturer text,
  model text,
  part_number text,
  install_side text default 'room_end'
    check (install_side in ('head_end', 'room_end', 'both', 'unspecified')),
  equipment_type text default 'part'
    check (equipment_type in ('part', 'labor', 'service', 'fee', 'other')),
  planned_quantity numeric not null default 1,
  unit_of_measure text default 'ea',
  unit_cost numeric not null default 0,
  unit_price numeric not null default 0,
  supplier text,
  csv_batch_id uuid references public.equipment_import_batches(id) on delete set null,
  notes text,
  is_active boolean not null default true,
  ordered_confirmed boolean not null default false,
  ordered_confirmed_at timestamptz,
  ordered_confirmed_by uuid,
  onsite_confirmed boolean not null default false,
  onsite_confirmed_at timestamptz,
  onsite_confirmed_by uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.project_equipment enable row level security;

drop policy if exists dev_read_all on public.project_equipment;
drop policy if exists dev_insert_all on public.project_equipment;
drop policy if exists dev_update_all on public.project_equipment;
drop policy if exists dev_delete_all on public.project_equipment;

create policy dev_read_all on public.project_equipment
  for select to anon, authenticated using (true);
create policy dev_insert_all on public.project_equipment
  for insert to anon, authenticated with check (true);
create policy dev_update_all on public.project_equipment
  for update to anon, authenticated using (true) with check (true);
create policy dev_delete_all on public.project_equipment
  for delete to authenticated using (true);

create index if not exists idx_project_equipment_project
  on public.project_equipment(project_id);
create index if not exists idx_project_equipment_room
  on public.project_equipment(room_id);
create index if not exists idx_project_equipment_batch
  on public.project_equipment(csv_batch_id);
create index if not exists idx_project_equipment_global_part
  on public.project_equipment(global_part_id);

drop trigger if exists trg_project_equipment_updated_at on public.project_equipment;
create trigger trg_project_equipment_updated_at
  before update on public.project_equipment
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- Table: project_equipment_inventory
-- Tracks warehouse/stock levels for project equipment
-- ============================================================
create table if not exists public.project_equipment_inventory (
  id uuid primary key default gen_random_uuid(),
  project_equipment_id uuid not null references public.project_equipment(id) on delete cascade,
  warehouse text not null default 'main',
  quantity_on_hand numeric not null default 0,
  quantity_assigned numeric not null default 0,
  needs_order boolean not null default false,
  rma_required boolean not null default false,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint project_equipment_inventory_unique unique (project_equipment_id, warehouse)
);

alter table public.project_equipment_inventory enable row level security;

drop policy if exists dev_read_all on public.project_equipment_inventory;
drop policy if exists dev_insert_all on public.project_equipment_inventory;
drop policy if exists dev_update_all on public.project_equipment_inventory;
drop policy if exists dev_delete_all on public.project_equipment_inventory;

create policy dev_read_all on public.project_equipment_inventory
  for select to anon, authenticated using (true);
create policy dev_insert_all on public.project_equipment_inventory
  for insert to anon, authenticated with check (true);
create policy dev_update_all on public.project_equipment_inventory
  for update to anon, authenticated using (true) with check (true);
create policy dev_delete_all on public.project_equipment_inventory
  for delete to authenticated using (true);

create index if not exists idx_project_equipment_inventory_equipment
  on public.project_equipment_inventory(project_equipment_id);

drop trigger if exists trg_project_equipment_inventory_updated_at on public.project_equipment_inventory;
create trigger trg_project_equipment_inventory_updated_at
  before update on public.project_equipment_inventory
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- Table: project_equipment_instances
-- Optional per-unit tracking (serial numbers, assignments)
-- ============================================================
create table if not exists public.project_equipment_instances (
  id uuid primary key default gen_random_uuid(),
  project_equipment_id uuid not null references public.project_equipment(id) on delete cascade,
  identifier text,
  status text default 'planned',
  serial_number text,
  assigned_to uuid references public.profiles(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.project_equipment_instances enable row level security;

drop policy if exists dev_read_all on public.project_equipment_instances;
drop policy if exists dev_insert_all on public.project_equipment_instances;
drop policy if exists dev_update_all on public.project_equipment_instances;
drop policy if exists dev_delete_all on public.project_equipment_instances;

create policy dev_read_all on public.project_equipment_instances
  for select to anon, authenticated using (true);
create policy dev_insert_all on public.project_equipment_instances
  for insert to anon, authenticated with check (true);
create policy dev_update_all on public.project_equipment_instances
  for update to anon, authenticated using (true) with check (true);
create policy dev_delete_all on public.project_equipment_instances
  for delete to authenticated using (true);

create index if not exists idx_project_equipment_instances_equipment
  on public.project_equipment_instances(project_equipment_id);

drop trigger if exists trg_project_equipment_instances_updated_at on public.project_equipment_instances;
create trigger trg_project_equipment_instances_updated_at
  before update on public.project_equipment_instances
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- Table: project_labor_budget
-- Labor allocation imported from equipment CSV
-- ============================================================
create table if not exists public.project_labor_budget (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  room_id uuid references public.project_rooms(id) on delete set null,
  labor_type text not null,
  description text,
  planned_hours numeric not null default 0,
  actual_hours numeric not null default 0,
  hourly_rate numeric not null default 0,
  csv_batch_id uuid references public.equipment_import_batches(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.project_labor_budget enable row level security;

drop policy if exists dev_read_all on public.project_labor_budget;
drop policy if exists dev_insert_all on public.project_labor_budget;
drop policy if exists dev_update_all on public.project_labor_budget;
drop policy if exists dev_delete_all on public.project_labor_budget;

create policy dev_read_all on public.project_labor_budget
  for select to anon, authenticated using (true);
create policy dev_insert_all on public.project_labor_budget
  for insert to anon, authenticated with check (true);
create policy dev_update_all on public.project_labor_budget
  for update to anon, authenticated using (true) with check (true);
create policy dev_delete_all on public.project_labor_budget
  for delete to authenticated using (true);

create index if not exists idx_project_labor_budget_project
  on public.project_labor_budget(project_id);
create index if not exists idx_project_labor_budget_room
  on public.project_labor_budget(room_id);
create index if not exists idx_project_labor_budget_batch
  on public.project_labor_budget(csv_batch_id);

drop trigger if exists trg_project_labor_budget_updated_at on public.project_labor_budget;
create trigger trg_project_labor_budget_updated_at
  before update on public.project_labor_budget
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- Table: wire_drop_equipment_links
-- Junction between wire drops and project equipment
-- ============================================================
create table if not exists public.wire_drop_equipment_links (
  id uuid primary key default gen_random_uuid(),
  wire_drop_id uuid not null references public.wire_drops(id) on delete cascade,
  project_equipment_id uuid not null references public.project_equipment(id) on delete cascade,
  link_side text not null default 'room_end'
    check (link_side in ('room_end', 'head_end', 'both')),
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint wire_drop_equipment_links_unique unique (wire_drop_id, project_equipment_id, link_side)
);

alter table public.wire_drop_equipment_links enable row level security;

drop policy if exists dev_read_all on public.wire_drop_equipment_links;
drop policy if exists dev_insert_all on public.wire_drop_equipment_links;
drop policy if exists dev_update_all on public.wire_drop_equipment_links;
drop policy if exists dev_delete_all on public.wire_drop_equipment_links;

create policy dev_read_all on public.wire_drop_equipment_links
  for select to anon, authenticated using (true);
create policy dev_insert_all on public.wire_drop_equipment_links
  for insert to anon, authenticated with check (true);
create policy dev_update_all on public.wire_drop_equipment_links
  for update to anon, authenticated using (true) with check (true);
create policy dev_delete_all on public.wire_drop_equipment_links
  for delete to authenticated using (true);

create index if not exists idx_wire_drop_equipment_links_wire_drop
  on public.wire_drop_equipment_links(wire_drop_id, link_side, sort_order);
create index if not exists idx_wire_drop_equipment_links_equipment
  on public.wire_drop_equipment_links(project_equipment_id);

drop trigger if exists trg_wire_drop_equipment_links_updated_at on public.wire_drop_equipment_links;
create trigger trg_wire_drop_equipment_links_updated_at
  before update on public.wire_drop_equipment_links
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- Convenience view: project_equipment_with_rooms
-- Helps with reporting/filtering by room attributes
-- ============================================================
drop view if exists public.project_equipment_with_rooms;

create or replace view public.project_equipment_with_rooms as
select
  pe.*,
  pr.name as room_name,
  pr.is_headend as room_is_headend
from public.project_equipment pe
left join public.project_rooms pr on pr.id = pe.room_id;

grant select on public.project_equipment_with_rooms to anon, authenticated;
