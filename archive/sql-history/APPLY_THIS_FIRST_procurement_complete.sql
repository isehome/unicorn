-- ============================================================
-- PROCUREMENT SYSTEM - COMPLETE SETUP
-- Run this FIRST before using the procurement features
-- This combines all necessary migrations in correct order
-- ============================================================

-- ============================================================
-- STEP 1: Create Procurement Tables
-- ============================================================

-- Table: suppliers
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_code text not null unique,
  contact_name text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  country text default 'USA',
  website text,
  account_number text,
  payment_terms text default 'Net 30',
  shipping_account text,
  notes text,
  is_active boolean not null default true,
  is_preferred boolean not null default false,
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint suppliers_short_code_length check (length(short_code) between 2 and 6)
);

-- Table: purchase_orders
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  po_number text not null unique,
  milestone_stage text not null check (milestone_stage in ('prewire_prep', 'trim_prep', 'other')),
  status text not null default 'draft' check (status in (
    'draft',
    'submitted',
    'confirmed',
    'partially_received',
    'received',
    'cancelled'
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
  internal_notes text,
  supplier_notes text,
  created_by text,
  submitted_by text,
  submitted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Table: purchase_order_items
create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  project_equipment_id uuid not null references public.project_equipment(id) on delete restrict,
  line_number integer not null,
  quantity_ordered numeric not null check (quantity_ordered > 0),
  quantity_received numeric not null default 0 check (quantity_received >= 0),
  unit_cost numeric not null default 0,
  line_total numeric generated always as (quantity_ordered * unit_cost) stored,
  expected_delivery_date date,
  actual_delivery_date date,
  received_by text,
  received_at timestamptz,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint po_items_unique unique (po_id, project_equipment_id),
  constraint quantity_received_check check (quantity_received <= quantity_ordered)
);

-- Table: shipment_tracking
create table if not exists public.shipment_tracking (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  tracking_number text not null,
  carrier text not null,
  carrier_service text,
  status text default 'pending' check (status in (
    'pending',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'exception',
    'returned'
  )),
  shipped_date date,
  estimated_delivery_date date,
  actual_delivery_date date,
  current_location text,
  tracking_url text,
  tracking_data jsonb,
  last_checked_at timestamptz,
  auto_tracking_enabled boolean not null default true,
  notes text,
  added_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint tracking_unique unique (po_id, tracking_number)
);

-- Table: supplier_contacts
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

-- Table: po_sequence
create table if not exists public.po_sequence (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  sequence integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint po_sequence_year_unique unique (year)
);

-- ============================================================
-- STEP 2: Add supplier_id to project_equipment
-- ============================================================

alter table if exists public.project_equipment
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

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

create index if not exists idx_project_equipment_supplier on public.project_equipment(supplier_id);

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
-- TRIGGERS
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
-- FUNCTIONS
-- ============================================================

-- Function: Generate PO Number
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
  v_year := extract(year from current_date);

  insert into public.po_sequence (year, sequence)
  values (v_year, 1)
  on conflict (year)
  do update set sequence = po_sequence.sequence + 1
  returning sequence into v_sequence;

  select short_code into v_supplier_code
  from public.suppliers
  where id = p_supplier_id;

  if v_supplier_code is null then
    raise exception 'Supplier not found';
  end if;

  select count(*) + 1 into v_supplier_sequence
  from public.purchase_orders
  where supplier_id = p_supplier_id
    and extract(year from created_at) = v_year;

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
-- SEED DATA
-- ============================================================

insert into public.suppliers (name, short_code, contact_name, email, phone, payment_terms, is_active)
values
  ('Amazon Business', 'AMZ', 'Support Team', 'support@amazon.com', '1-888-281-3847', 'Net 30', true),
  ('Crestron Electronics', 'CRS', 'Sales Rep', 'sales@crestron.com', '1-800-237-2041', 'Net 45', true),
  ('Control4', 'C4', 'Sales Team', 'sales@control4.com', '1-888-400-4070', 'Net 30', true),
  ('ADI Global Distribution', 'ADI', 'Account Manager', 'info@adiglobal.com', '1-800-233-0377', 'Net 30', true),
  ('Home Depot Pro', 'HDP', 'Pro Desk', 'prodesk@homedepot.com', '1-800-430-3376', 'Net 30', true)
on conflict (short_code) do nothing;

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Check that everything was created
do $$
declare
  v_suppliers_count int;
  v_equipment_column_exists boolean;
begin
  -- Check suppliers table
  select count(*) into v_suppliers_count from public.suppliers;
  raise notice 'Suppliers created: %', v_suppliers_count;

  -- Check supplier_id column exists
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_equipment'
      and column_name = 'supplier_id'
  ) into v_equipment_column_exists;

  if v_equipment_column_exists then
    raise notice 'supplier_id column added to project_equipment: YES';
  else
    raise notice 'supplier_id column added to project_equipment: NO - CHECK FAILED!';
  end if;

  raise notice '';
  raise notice '✅ Procurement system setup complete!';
  raise notice '';
  raise notice 'Next steps:';
  raise notice '1. Import equipment CSV (vendor matching will run automatically)';
  raise notice '2. Go to Order Equipment → Vendor View';
  raise notice '3. Check browser console for vendor matching logs';
end $$;
