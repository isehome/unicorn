-- Global Parts Catalog Schema
-- Provides a deduplicated master list of parts/equipment that can be enriched
-- with documentation and linked to project-specific imports.

-- ============================================================
-- Helper: update updated_at timestamp on row change
-- ============================================================
create or replace function public.update_global_part_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- Table: global_parts
-- Master catalog containing one entry per unique part
-- ============================================================
create table if not exists public.global_parts (
  id uuid primary key default gen_random_uuid(),
  part_number text not null,
  name text,
  description text,
  manufacturer text,
  model text,
  category text,
  unit_of_measure text default 'ea',
  quantity_on_hand numeric not null default 0,
  quantity_reserved numeric not null default 0,
  quantity_available numeric generated always as (
    greatest(quantity_on_hand - quantity_reserved, 0)
  ) stored,
  is_wire_drop_visible boolean not null default true,
  is_inventory_item boolean not null default true,
  resource_links jsonb not null default '[]'::jsonb,
  attributes jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint global_parts_part_number_unique unique (part_number)
);

alter table if exists public.global_parts
  add column if not exists is_wire_drop_visible boolean not null default true;

alter table if exists public.global_parts
  add column if not exists is_inventory_item boolean not null default true;

comment on column public.global_parts.resource_links is
  'Array of objects: [{ id, label, type, url }] for manuals, schematics, etc.';
comment on column public.global_parts.attributes is
  'Flexible key/value metadata about the part (e.g., specs, notes).';

drop trigger if exists trg_global_parts_updated_at on public.global_parts;
create trigger trg_global_parts_updated_at
  before update on public.global_parts
  for each row execute function public.update_global_part_timestamp();

-- ============================================================
-- Table: global_part_documents
-- Optional richer resource records associated with parts
-- ============================================================
create table if not exists public.global_part_documents (
  id uuid primary key default gen_random_uuid(),
  part_id uuid not null references public.global_parts(id) on delete cascade,
  document_type text not null default 'manual'
    check (document_type in ('manual', 'schematic', 'instruction', 'datasheet', 'video', 'link', 'other')),
  label text not null,
  url text not null,
  notes text,
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_global_part_documents_updated_at on public.global_part_documents;
create trigger trg_global_part_documents_updated_at
  before update on public.global_part_documents
  for each row execute function public.update_global_part_timestamp();

create index if not exists idx_global_part_documents_part
  on public.global_part_documents(part_id, sort_order);

-- ============================================================
-- View: project_equipment_global_parts
-- Associates project equipment rows with matching global part by part_number
-- ============================================================
alter table if exists public.project_equipment
  add column if not exists global_part_id uuid references public.global_parts(id) on delete set null;

create index if not exists idx_project_equipment_global_part
  on public.project_equipment(global_part_id);

drop view if exists public.project_equipment_global_parts;

create or replace view public.project_equipment_global_parts as
  select
    pe.id as project_equipment_id,
    pe.project_id,
    pe.part_number,
    gp.id as global_part_id,
    gp.name as global_part_name,
    gp.description as global_part_description,
    gp.manufacturer as global_part_manufacturer,
    gp.model as global_part_model,
    gp.is_wire_drop_visible,
    gp.is_inventory_item,
    gp.resource_links,
    gp.attributes
  from public.project_equipment pe
  left join public.global_parts gp
    on (gp.id = pe.global_part_id)
    or (pe.global_part_id is null and gp.part_number = pe.part_number);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.global_parts enable row level security;
alter table public.global_part_documents enable row level security;

drop policy if exists global_parts_read_all on public.global_parts;
create policy global_parts_read_all
  on public.global_parts
  for select
  using (true);

drop policy if exists global_parts_write_authenticated on public.global_parts;
create policy global_parts_write_authenticated
  on public.global_parts
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists global_part_documents_read_all on public.global_part_documents;
create policy global_part_documents_read_all
  on public.global_part_documents
  for select
  using (true);

drop policy if exists global_part_documents_write_authenticated on public.global_part_documents;
create policy global_part_documents_write_authenticated
  on public.global_part_documents
  for all
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- Upsert helper for CSV pipelines
-- ============================================================
create or replace function public.upsert_global_part(
  p_part_number text,
  p_name text default null,
  p_description text default null,
  p_manufacturer text default null,
  p_model text default null,
  p_category text default null,
  p_unit text default 'ea'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_part_number is null or length(trim(p_part_number)) = 0 then
    return null;
  end if;

  insert into public.global_parts (
    part_number,
    name,
    description,
    manufacturer,
    model,
    category,
    unit_of_measure
  )
  values (
    trim(p_part_number),
    nullif(trim(coalesce(p_name, '')), ''),
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_manufacturer, '')), ''),
    nullif(trim(coalesce(p_model, '')), ''),
    nullif(trim(coalesce(p_category, '')), ''),
    coalesce(nullif(trim(p_unit), ''), 'ea')
  )
  on conflict (part_number)
  do update set
    name = coalesce(excluded.name, public.global_parts.name),
    description = coalesce(excluded.description, public.global_parts.description),
    manufacturer = coalesce(excluded.manufacturer, public.global_parts.manufacturer),
    model = coalesce(excluded.model, public.global_parts.model),
    category = coalesce(excluded.category, public.global_parts.category),
    unit_of_measure = coalesce(excluded.unit_of_measure, public.global_parts.unit_of_measure),
    updated_at = now();

  select id into v_id
  from public.global_parts
  where part_number = trim(p_part_number)
  limit 1;

  return v_id;
end;
$$;

grant execute on function public.upsert_global_part(text, text, text, text, text, text, text)
  to authenticated;
