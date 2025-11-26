-- Migration for Equipment Management, Secure Data, and Client Contact Linking
-- Run this after the main schema.sql

-- ============= EQUIPMENT TABLE =============
-- Dynamic equipment list with UID for each project
create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  uid text not null,
  name text not null,
  category text, -- e.g., 'Network', 'Audio', 'Video', 'Control'
  manufacturer text,
  model text,
  serial_number text,
  location text,
  ip_address text,
  mac_address text,
  notes text,
  status text default 'active' check (status in ('active', 'inactive', 'maintenance', 'removed')),
  installed_date date,
  warranty_expiry date,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint equipment_uid_project_unique unique (project_id, uid)
);

-- ============= SECURE DATA TABLE =============
-- Store credentials and sensitive information for projects
create table if not exists public.project_secure_data (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  equipment_id uuid references public.equipment(id) on delete cascade,
  data_type text not null check (data_type in ('credentials', 'network', 'api_key', 'certificate', 'other')),
  name text not null, -- e.g., 'Admin Panel Login', 'SSH Access'
  username text,
  password text, -- Should be encrypted in production
  url text, -- For web interfaces
  ip_address text,
  port integer,
  additional_info jsonb, -- Flexible field for extra data
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references public.profiles(id),
  last_accessed timestamptz
);

-- ============= UPDATE PROJECTS TABLE =============
-- Add client_contact_id to link to a contact
alter table public.projects 
add column if not exists client_contact_id uuid references public.contacts(id) on delete set null;

-- Create index for performance
create index if not exists idx_projects_client_contact on public.projects(client_contact_id);

-- ============= EQUIPMENT CREDENTIALS JUNCTION =============
-- Allow multiple credentials per equipment
create table if not exists public.equipment_credentials (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  secure_data_id uuid not null references public.project_secure_data(id) on delete cascade,
  is_primary boolean default false,
  created_at timestamptz default now(),
  constraint equipment_credentials_unique unique (equipment_id, secure_data_id)
);

-- ============= SECURITY AUDIT LOG =============
-- Track access to secure data
create table if not exists public.secure_data_audit_log (
  id uuid primary key default gen_random_uuid(),
  secure_data_id uuid not null references public.project_secure_data(id) on delete cascade,
  action text not null check (action in ('view', 'create', 'update', 'delete')),
  performed_by uuid references public.profiles(id),
  performed_at timestamptz default now(),
  ip_address inet,
  user_agent text,
  details jsonb
);

-- ============= INDEXES =============
create index if not exists idx_equipment_project on public.equipment(project_id);
create index if not exists idx_equipment_uid on public.equipment(uid);
create index if not exists idx_secure_data_project on public.project_secure_data(project_id);
create index if not exists idx_secure_data_equipment on public.project_secure_data(equipment_id);
create index if not exists idx_audit_log_secure_data on public.secure_data_audit_log(secure_data_id);

-- ============= ROW LEVEL SECURITY =============
alter table public.equipment enable row level security;
alter table public.project_secure_data enable row level security;
alter table public.equipment_credentials enable row level security;
alter table public.secure_data_audit_log enable row level security;

-- Equipment policies
create policy "Equipment viewable by everyone" on public.equipment
  for select to anon, authenticated using (true);
  
create policy "Equipment editable by authenticated users" on public.equipment
  for all to authenticated using (true) with check (true);

-- Secure data policies (more restrictive)
create policy "Secure data viewable by authenticated only" on public.project_secure_data
  for select to authenticated using (true);
  
create policy "Secure data editable by authenticated users" on public.project_secure_data
  for all to authenticated using (true) with check (true);

-- Equipment credentials policies
create policy "Equipment credentials viewable by authenticated" on public.equipment_credentials
  for select to authenticated using (true);
  
create policy "Equipment credentials editable by authenticated" on public.equipment_credentials
  for all to authenticated using (true) with check (true);

-- Audit log policies (read-only for most users)
create policy "Audit log viewable by authenticated" on public.secure_data_audit_log
  for select to authenticated using (true);
  
create policy "Audit log insertable by authenticated" on public.secure_data_audit_log
  for insert to authenticated with check (true);

-- ============= HELPER FUNCTIONS =============
-- Function to automatically create audit log entries
create or replace function log_secure_data_access()
returns trigger as $$
begin
  -- Log view actions (would need to be called from application level)
  -- This is a placeholder for update/delete tracking
  if TG_OP = 'UPDATE' then
    insert into public.secure_data_audit_log (secure_data_id, action, performed_by, details)
    values (NEW.id, 'update', auth.uid(), jsonb_build_object('old', row_to_json(OLD), 'new', row_to_json(NEW)));
  elsif TG_OP = 'DELETE' then
    insert into public.secure_data_audit_log (secure_data_id, action, performed_by, details)
    values (OLD.id, 'delete', auth.uid(), jsonb_build_object('deleted_data', row_to_json(OLD)));
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

-- Create triggers for audit logging
drop trigger if exists secure_data_audit_trigger on public.project_secure_data;
create trigger secure_data_audit_trigger
  after update or delete on public.project_secure_data
  for each row execute function log_secure_data_access();

-- Function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

-- Create triggers for updated_at
drop trigger if exists update_equipment_updated_at on public.equipment;
create trigger update_equipment_updated_at
  before update on public.equipment
  for each row execute function update_updated_at_column();

drop trigger if exists update_secure_data_updated_at on public.project_secure_data;
create trigger update_secure_data_updated_at
  before update on public.project_secure_data
  for each row execute function update_updated_at_column();

-- ============= SAMPLE DATA FOR EQUIPMENT CATEGORIES =============
-- Create a lookup table for equipment categories
create table if not exists public.equipment_categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text,
  icon text,
  sort_order integer default 0,
  is_active boolean default true,
  created_at timestamptz default now()
);

alter table public.equipment_categories enable row level security;

create policy "Equipment categories viewable by everyone" on public.equipment_categories
  for select to anon, authenticated using (true);
  
create policy "Equipment categories editable by authenticated" on public.equipment_categories
  for all to authenticated using (true) with check (true);

-- Insert default equipment categories
insert into public.equipment_categories (name, description, sort_order) values
  ('Network', 'Switches, routers, access points, etc.', 1),
  ('Audio', 'Amplifiers, speakers, microphones, etc.', 2),
  ('Video', 'Displays, projectors, cameras, etc.', 3),
  ('Control', 'Control processors, touch panels, etc.', 4),
  ('Lighting', 'Lighting controllers, fixtures, etc.', 5),
  ('Security', 'Cameras, access control, alarm systems, etc.', 6),
  ('HVAC', 'Thermostats, sensors, controllers, etc.', 7),
  ('Power', 'UPS, PDUs, surge protectors, etc.', 8),
  ('Other', 'Miscellaneous equipment', 99)
on conflict (name) do nothing;

-- ============= MIGRATE EXISTING CONTACTS TO BE PROJECT-INDEPENDENT =============
-- First, remove the project_id requirement from contacts if they're meant to be global
alter table public.contacts 
  alter column project_id drop not null,
  add column if not exists full_name text generated always as (
    case 
      when first_name is not null and last_name is not null then first_name || ' ' || last_name
      else coalesce(name, '')
    end
  ) stored;

-- Create an index for better contact searching
create index if not exists idx_contacts_full_name on public.contacts(full_name);
create index if not exists idx_contacts_email on public.contacts(email);
create index if not exists idx_contacts_company on public.contacts(company);
