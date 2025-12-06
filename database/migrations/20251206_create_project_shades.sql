-- Enable moddatetime extension
create extension if not exists moddatetime schema extensions;

-- Create project_shades table
create table if not exists project_shades (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  room_id uuid references project_rooms(id) on delete set null,
  
  -- Identity
  name text not null,
  lutron_id text, -- Line # or unique ID for round-trip matching
  
  -- Quoted Specs (From Initial Import)
  quoted_width text,
  quoted_height text,
  mount_type text, -- Inside / Outside
  technology text,
  product_type text,
  model text,
  
  -- Field Verification
  measured_width text, -- Final/Ordered Width
  measured_height text, -- Final/Ordered Height
  
  -- Detailed Measurements (3-point check)
  measure_width_top text,
  measure_width_middle text,
  measure_width_bottom text,
  measure_height_left text,
  measure_height_center text,
  measure_height_right text,
  
  mount_depth text,
  obstruction_notes text,
  field_verified boolean default false,
  field_verified_at timestamptz,
  field_verified_by uuid, -- Stores User UUID
  install_photos text[], -- Array of photo URLs
  
  -- Designer Approval
  fabric_selection text,
  fascia_selection text,
  approval_status text default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  approved_at timestamptz,
  approved_by text, -- Stores Designer Name or Token (since they might be external)
  designer_notes text,
  
  -- Metadata for extra flexibility
  created_at timestamptz default now(),
  created_by uuid,
  updated_at timestamptz default now()
);

-- Enable RLS
alter table project_shades enable row level security;

-- Policies (Assuming standard authenticated access for now, similar to project_equipment)
create policy "Users can view project_shades for their projects"
  on project_shades for select
  using ( exists (
    select 1 from projects
    where projects.id = project_shades.project_id
    -- Add generic access check or specific user check if needed
  ));

create policy "Users can insert project_shades"
  on project_shades for insert
  with check (true);

create policy "Users can update project_shades"
  on project_shades for update
  using (true);

create policy "Users can delete project_shades"
  on project_shades for delete
  using (true);

-- Triggers for updated_at
create trigger handle_updated_at before update on project_shades
  for each row execute procedure moddatetime (updated_at);
