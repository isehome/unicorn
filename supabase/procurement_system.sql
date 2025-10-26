-- ============================================================
-- PROCUREMENT & SUPPLIER MANAGEMENT SYSTEM
-- Comprehensive supplier, purchase order, and tracking system
-- ============================================================

-- ============================================================
-- Table: suppliers
-- Master supplier catalog with contact and account information
-- ============================================================
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_code text not null unique, -- For PO number generation (e.g., 'ABC', 'XYZ')
  contact_name text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  country text default 'USA',
  website text,
  account_number text, -- Your account number with this supplier
  payment_terms text default 'Net 30', -- e.g., 'Net 30', 'Net 60', 'COD'
  shipping_account text, -- If you have a shipping account with them
  notes text,
  is_active boolean not null default true,
  is_preferred boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint suppliers_short_code_length check (length(short_code) between 2 and 6)
);

-- ============================================================
-- Table: purchase_orders
-- Purchase orders tracking per project/supplier/milestone
-- ============================================================
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  po_number text not null unique, -- Auto-generated: PO-YYYY-NNN-SUP-NNN
  milestone_stage text not null check (milestone_stage in ('prewire_prep', 'trim_prep', 'other')),
  status text not null default 'draft' check (status in (
    'draft',        -- Being created
    'submitted',    -- Sent to supplier
    'confirmed',    -- Supplier confirmed
    'partially_received', -- Some items received
    'received',     -- All items received
    'cancelled'     -- Order cancelled
  )),
  order_date date not null default current_date,
  requested_delivery_date date,
  expected_delivery_date date,
  actual_delivery_date date,
  subtotal numeric not null default 0,
  tax_amount numeric not null default 0,
  shipping_cost numeric not null default 0,
  total_amount numeric not null default 0,
  payment_method text,
  payment_status text default 'pending' check (payment_status in ('pending', 'paid', 'partial', 'cancelled')),
  ship_to_address text,
  ship_to_contact text,
  ship_to_phone text,
  internal_notes text, -- Private notes
  supplier_notes text,  -- Notes to send to supplier
  created_by uuid references public.profiles(id) on delete set null,
  submitted_by uuid references public.profiles(id) on delete set null,
  submitted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- Table: purchase_order_items
-- Line items for each purchase order
-- ============================================================
create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  project_equipment_id uuid not null references public.project_equipment(id) on delete restrict,
  line_number integer not null, -- Order of items in PO
  quantity_ordered numeric not null check (quantity_ordered > 0),
  quantity_received numeric not null default 0 check (quantity_received >= 0),
  unit_cost numeric not null default 0,
  line_total numeric generated always as (quantity_ordered * unit_cost) stored,
  expected_delivery_date date,
  actual_delivery_date date,
  received_by uuid references public.profiles(id) on delete set null,
  received_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint po_items_unique unique (po_id, project_equipment_id),
  constraint quantity_received_check check (quantity_received <= quantity_ordered)
);

-- ============================================================
-- Table: shipment_tracking
-- Tracking information for PO shipments
-- ============================================================
create table if not exists public.shipment_tracking (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  tracking_number text not null,
  carrier text not null, -- 'USPS', 'UPS', 'FedEx', 'DHL', 'Other'
  carrier_service text, -- e.g., 'Ground', 'Express', '2-Day'
  status text default 'pending' check (status in (
    'pending',      -- Not yet shipped
    'in_transit',   -- On the way
    'out_for_delivery', -- Out for delivery
    'delivered',    -- Delivered
    'exception',    -- Delivery exception/problem
    'returned'      -- Returned to sender
  )),
  shipped_date date,
  estimated_delivery_date date,
  actual_delivery_date date,
  current_location text,
  tracking_url text,
  tracking_data jsonb, -- Raw API response data
  last_checked_at timestamptz,
  auto_tracking_enabled boolean not null default true,
  notes text,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint tracking_unique unique (po_id, tracking_number)
);

-- ============================================================
-- Table: supplier_contacts
-- Multiple contacts per supplier
-- ============================================================
create table if not exists public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  name text not null,
  title text,
  email text,
  phone text,
  mobile text,
  is_primary boolean not null default false,
  is_accounts_payable boolean not null default false,
  is_sales boolean not null default false,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- Table: po_sequence
-- Tracks PO number sequences per year
-- ============================================================
create table if not exists public.po_sequence (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  sequence integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint po_sequence_year_unique unique (year)
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_suppliers_active on public.suppliers(is_active) where is_active = true;
create index if not exists idx_suppliers_short_code on public.suppliers(short_code);

create index if not exists idx_purchase_orders_project on public.purchase_orders(project_id);
create index if not exists idx_purchase_orders_supplier on public.purchase_orders(supplier_id);
create index if not exists idx_purchase_orders_status on public.purchase_orders(status);
create index if not exists idx_purchase_orders_milestone on public.purchase_orders(milestone_stage);
create index if not exists idx_purchase_orders_po_number on public.purchase_orders(po_number);

create index if not exists idx_po_items_po on public.purchase_order_items(po_id);
create index if not exists idx_po_items_equipment on public.purchase_order_items(project_equipment_id);

create index if not exists idx_shipment_tracking_po on public.shipment_tracking(po_id);
create index if not exists idx_shipment_tracking_number on public.shipment_tracking(tracking_number);
create index if not exists idx_shipment_tracking_status on public.shipment_tracking(status);

create index if not exists idx_supplier_contacts_supplier on public.supplier_contacts(supplier_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.suppliers enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.shipment_tracking enable row level security;
alter table public.supplier_contacts enable row level security;
alter table public.po_sequence enable row level security;

-- Suppliers policies
drop policy if exists suppliers_read_all on public.suppliers;
create policy suppliers_read_all on public.suppliers
  for select to anon, authenticated using (true);

drop policy if exists suppliers_write_authenticated on public.suppliers;
create policy suppliers_write_authenticated on public.suppliers
  for all to authenticated using (true) with check (true);

-- Purchase orders policies
drop policy if exists purchase_orders_read_all on public.purchase_orders;
create policy purchase_orders_read_all on public.purchase_orders
  for select to anon, authenticated using (true);

drop policy if exists purchase_orders_write_authenticated on public.purchase_orders;
create policy purchase_orders_write_authenticated on public.purchase_orders
  for all to authenticated using (true) with check (true);

-- PO items policies
drop policy if exists po_items_read_all on public.purchase_order_items;
create policy po_items_read_all on public.purchase_order_items
  for select to anon, authenticated using (true);

drop policy if exists po_items_write_authenticated on public.purchase_order_items;
create policy po_items_write_authenticated on public.purchase_order_items
  for all to authenticated using (true) with check (true);

-- Shipment tracking policies
drop policy if exists shipment_tracking_read_all on public.shipment_tracking;
create policy shipment_tracking_read_all on public.shipment_tracking
  for select to anon, authenticated using (true);

drop policy if exists shipment_tracking_write_authenticated on public.shipment_tracking;
create policy shipment_tracking_write_authenticated on public.shipment_tracking
  for all to authenticated using (true) with check (true);

-- Supplier contacts policies
drop policy if exists supplier_contacts_read_all on public.supplier_contacts;
create policy supplier_contacts_read_all on public.supplier_contacts
  for select to anon, authenticated using (true);

drop policy if exists supplier_contacts_write_authenticated on public.supplier_contacts;
create policy supplier_contacts_write_authenticated on public.supplier_contacts
  for all to authenticated using (true) with check (true);

-- PO sequence policies
drop policy if exists po_sequence_read_all on public.po_sequence;
create policy po_sequence_read_all on public.po_sequence
  for select to authenticated using (true);

drop policy if exists po_sequence_write_authenticated on public.po_sequence;
create policy po_sequence_write_authenticated on public.po_sequence
  for all to authenticated using (true) with check (true);

-- ============================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================
drop trigger if exists trg_suppliers_updated_at on public.suppliers;
create trigger trg_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.update_updated_at_column();

drop trigger if exists trg_purchase_orders_updated_at on public.purchase_orders;
create trigger trg_purchase_orders_updated_at
  before update on public.purchase_orders
  for each row execute function public.update_updated_at_column();

drop trigger if exists trg_po_items_updated_at on public.purchase_order_items;
create trigger trg_po_items_updated_at
  before update on public.purchase_order_items
  for each row execute function public.update_updated_at_column();

drop trigger if exists trg_shipment_tracking_updated_at on public.shipment_tracking;
create trigger trg_shipment_tracking_updated_at
  before update on public.shipment_tracking
  for each row execute function public.update_updated_at_column();

drop trigger if exists trg_supplier_contacts_updated_at on public.supplier_contacts;
create trigger trg_supplier_contacts_updated_at
  before update on public.supplier_contacts
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- FUNCTION: Generate PO Number
-- Format: PO-YYYY-NNN-SUP-NNN
-- Example: PO-2025-001-ABC-001
-- ============================================================
create or replace function public.generate_po_number(
  p_supplier_id uuid
)
returns text
language plpgsql
security definer
as $$
declare
  v_year integer;
  v_sequence integer;
  v_supplier_code text;
  v_supplier_sequence integer;
  v_po_number text;
begin
  -- Get current year
  v_year := extract(year from current_date);

  -- Get or create year sequence
  insert into public.po_sequence (year, sequence)
  values (v_year, 1)
  on conflict (year)
  do update set sequence = po_sequence.sequence + 1
  returning sequence into v_sequence;

  -- Get supplier short code
  select short_code into v_supplier_code
  from public.suppliers
  where id = p_supplier_id;

  if v_supplier_code is null then
    raise exception 'Supplier not found';
  end if;

  -- Get supplier-specific sequence for this year
  select count(*) + 1 into v_supplier_sequence
  from public.purchase_orders
  where supplier_id = p_supplier_id
    and extract(year from created_at) = v_year;

  -- Format: PO-YYYY-NNN-SUP-NNN
  v_po_number := format('PO-%s-%s-%s-%s',
    v_year,
    lpad(v_sequence::text, 3, '0'),
    upper(v_supplier_code),
    lpad(v_supplier_sequence::text, 3, '0')
  );

  return v_po_number;
end;
$$;

-- ============================================================
-- FUNCTION: Update PO Totals
-- Recalculates totals when line items change
-- ============================================================
create or replace function public.update_po_totals()
returns trigger
language plpgsql
security definer
as $$
declare
  v_subtotal numeric;
begin
  -- Calculate subtotal from line items
  select coalesce(sum(line_total), 0)
  into v_subtotal
  from public.purchase_order_items
  where po_id = coalesce(NEW.po_id, OLD.po_id);

  -- Update purchase order
  update public.purchase_orders
  set
    subtotal = v_subtotal,
    total_amount = v_subtotal + coalesce(tax_amount, 0) + coalesce(shipping_cost, 0),
    updated_at = now()
  where id = coalesce(NEW.po_id, OLD.po_id);

  return NEW;
end;
$$;

drop trigger if exists trg_update_po_totals_on_items on public.purchase_order_items;
create trigger trg_update_po_totals_on_items
  after insert or update or delete on public.purchase_order_items
  for each row execute function public.update_po_totals();

-- ============================================================
-- FUNCTION: Update Equipment Quantities When Items Received
-- Syncs ordered_quantity and received_quantity to project_equipment
-- ============================================================
create or replace function public.sync_equipment_quantities()
returns trigger
language plpgsql
security definer
as $$
declare
  v_project_equipment_id uuid;
  v_total_ordered numeric;
  v_total_received numeric;
begin
  v_project_equipment_id := coalesce(NEW.project_equipment_id, OLD.project_equipment_id);

  -- Calculate totals across all POs for this equipment
  select
    coalesce(sum(quantity_ordered), 0),
    coalesce(sum(quantity_received), 0)
  into v_total_ordered, v_total_received
  from public.purchase_order_items
  where project_equipment_id = v_project_equipment_id;

  -- Update project_equipment
  update public.project_equipment
  set
    ordered_quantity = v_total_ordered,
    received_quantity = v_total_received,
    updated_at = now()
  where id = v_project_equipment_id;

  return NEW;
end;
$$;

drop trigger if exists trg_sync_equipment_quantities on public.purchase_order_items;
create trigger trg_sync_equipment_quantities
  after insert or update or delete on public.purchase_order_items
  for each row execute function public.sync_equipment_quantities();

-- ============================================================
-- FUNCTION: Auto-update PO status based on line items
-- ============================================================
create or replace function public.auto_update_po_status()
returns trigger
language plpgsql
security definer
as $$
declare
  v_po_id uuid;
  v_total_items integer;
  v_fully_received integer;
  v_partially_received integer;
  v_new_status text;
begin
  v_po_id := coalesce(NEW.po_id, OLD.po_id);

  -- Count line items
  select
    count(*),
    count(*) filter (where quantity_received >= quantity_ordered),
    count(*) filter (where quantity_received > 0 and quantity_received < quantity_ordered)
  into v_total_items, v_fully_received, v_partially_received
  from public.purchase_order_items
  where po_id = v_po_id;

  -- Determine new status
  if v_fully_received = v_total_items then
    v_new_status := 'received';
  elsif v_partially_received > 0 or v_fully_received > 0 then
    v_new_status := 'partially_received';
  end if;

  -- Update PO status if needed
  if v_new_status is not null then
    update public.purchase_orders
    set
      status = v_new_status,
      updated_at = now()
    where id = v_po_id
      and status not in ('cancelled', 'received'); -- Don't override these
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_auto_update_po_status on public.purchase_order_items;
create trigger trg_auto_update_po_status
  after update on public.purchase_order_items
  for each row
  when (NEW.quantity_received <> OLD.quantity_received)
  execute function public.auto_update_po_status();

-- ============================================================
-- VIEW: PO Summary with Supplier Info
-- ============================================================
create or replace view public.purchase_orders_summary as
select
  po.id,
  po.po_number,
  po.project_id,
  p.name as project_name,
  po.supplier_id,
  s.name as supplier_name,
  s.short_code as supplier_code,
  po.milestone_stage,
  po.status,
  po.order_date,
  po.expected_delivery_date,
  po.actual_delivery_date,
  po.total_amount,
  po.payment_status,
  count(poi.id) as item_count,
  count(*) filter (where poi.quantity_received >= poi.quantity_ordered) as items_received,
  count(st.id) as tracking_count,
  po.created_at,
  po.updated_at
from public.purchase_orders po
join public.suppliers s on s.id = po.supplier_id
join public.projects p on p.id = po.project_id
left join public.purchase_order_items poi on poi.po_id = po.id
left join public.shipment_tracking st on st.po_id = po.id
group by po.id, s.id, p.id;

-- ============================================================
-- VIEW: Equipment Available for PO by Milestone
-- Shows equipment grouped by supplier for each milestone stage
-- ============================================================
create or replace view public.equipment_for_po as
select
  pe.id as equipment_id,
  pe.project_id,
  pe.name,
  pe.part_number,
  pe.manufacturer,
  pe.model,
  pe.supplier,
  pe.planned_quantity,
  pe.ordered_quantity,
  pe.received_quantity,
  pe.unit_cost,
  pe.planned_quantity * pe.unit_cost as line_total,
  gp.required_for_prewire,
  case
    when gp.required_for_prewire = true then 'prewire_prep'
    else 'trim_prep'
  end as milestone_stage,
  pe.equipment_type,
  pe.is_active,
  -- Calculate quantities still needed
  greatest(pe.planned_quantity - coalesce(pe.ordered_quantity, 0), 0) as quantity_to_order,
  greatest(coalesce(pe.ordered_quantity, 0) - coalesce(pe.received_quantity, 0), 0) as quantity_pending_receipt
from public.project_equipment pe
left join public.global_parts gp on gp.id = pe.global_part_id
where pe.equipment_type <> 'Labor'
  and pe.is_active = true
  and pe.supplier is not null
  and trim(pe.supplier) <> '';

-- Grant access to views
grant select on public.purchase_orders_summary to authenticated, anon;
grant select on public.equipment_for_po to authenticated, anon;

-- ============================================================
-- SEED DATA: Sample Suppliers
-- ============================================================
insert into public.suppliers (name, short_code, contact_name, email, phone, payment_terms, is_active)
values
  ('Amazon Business', 'AMZ', 'Support Team', 'support@amazon.com', '1-888-281-3847', 'Net 30', true),
  ('Crestron Electronics', 'CRS', 'Sales Rep', 'sales@crestron.com', '1-800-237-2041', 'Net 45', true),
  ('Control4', 'C4', 'Sales Team', 'sales@control4.com', '1-888-400-4070', 'Net 30', true),
  ('ADI Global Distribution', 'ADI', 'Account Manager', 'info@adiglobal.com', '1-800-233-0377', 'Net 30', true),
  ('Home Depot Pro', 'HDP', 'Pro Desk', 'prodesk@homedepot.com', '1-800-430-3376', 'Net 30', true)
on conflict (short_code) do nothing;

comment on table public.suppliers is 'Master supplier catalog with contact information';
comment on table public.purchase_orders is 'Purchase orders for project equipment by milestone stage';
comment on table public.purchase_order_items is 'Line items for each purchase order';
comment on table public.shipment_tracking is 'Shipment tracking information with carrier data';
comment on table public.supplier_contacts is 'Multiple contacts per supplier';
comment on column public.purchase_orders.po_number is 'Auto-generated PO number: PO-YYYY-NNN-SUP-NNN';
comment on column public.purchase_orders.milestone_stage is 'Which milestone this PO supports (prewire_prep/trim_prep)';
