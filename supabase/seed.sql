-- Seed sample data similar to the UI content
with p1 as (
  insert into public.projects (
    name, client, address, phase, start_date, end_date,
    wiring_diagram_url, portal_proposal_url,
    one_drive_photos, one_drive_files, one_drive_procurement
  ) values (
    'Smith Residence', 'John Smith', '123 Main St, Austin, TX', 'Install',
    '2025-01-15', '2025-02-28',
    'https://lucid.app/lucidchart/f0e89b19-d72d-4ab1-8cb9-2712dbca4bc1/edit',
    'https://portal.company.com/proposals/smith-residence-2025',
    'https://onedrive.live.com/smith-residence/photos',
    'https://onedrive.live.com/smith-residence/files',
    'https://onedrive.live.com/smith-residence/procurement'
  ) returning id
), p2 as (
  insert into public.projects (
    name, client, address, phase, start_date, end_date,
    wiring_diagram_url, portal_proposal_url,
    one_drive_photos, one_drive_files, one_drive_procurement
  ) values (
    'Office Complex', 'ABC Corp', '456 Business Ave, Austin, TX', 'Planning',
    '2025-02-01', '2025-03-15',
    'https://lucid.app/lucidchart/office-complex-diagram',
    'https://portal.company.com/proposals/office-complex-2025',
    'https://onedrive.live.com/office-complex/photos',
    'https://onedrive.live.com/office-complex/files',
    'https://onedrive.live.com/office-complex/procurement'
  ) returning id
)
insert into public.wire_drops (project_id, uid, name, location, type, prewire_photo, installed_photo)
select id, 'SM-LR-001', 'Living Room TV', 'Living Room - North Wall', 'CAT6', null, null from p1
union all
select id, 'SM-MB-001', 'Master BR AP', 'Master Bedroom - Ceiling', 'CAT6', 'https://picsum.photos/400/300?random=1', null from p1
union all
select id, 'SM-KT-001', 'Kitchen Display', 'Kitchen - Island', 'CAT6', 'https://picsum.photos/400/300?random=2', 'https://picsum.photos/400/300?random=3' from p1
union all
select id, 'SM-OF-001', 'Office Desk', 'Home Office', 'CAT6', null, null from p1
union all
select id, 'SM-GR-001', 'Garage Camera', 'Garage', 'CAT6', 'https://picsum.photos/400/300?random=4', null from p1
union all
select id, 'OC-LB-001', 'Lobby Camera', 'Main Lobby', 'CAT6', null, null from p2
union all
select id, 'OC-CR-001', 'Conference Room AP', 'Conference Room A', 'CAT6', null, null from p2;

-- Sample issues for Smith Residence
with pr as (select id from public.projects where name='Smith Residence' limit 1)
insert into public.issues (project_id, title, status, notes)
select id, 'Wall blocking at entry', 'blocked', 'Need to reroute through ceiling' from pr
union all
select id, 'Missing CAT6 spool', 'open', 'Order placed, arriving tomorrow' from pr
union all
select id, 'Conduit too small', 'resolved', 'Replaced with 1.5" conduit' from pr;

-- Sample contacts
with pr as (select id from public.projects where name='Smith Residence' limit 1)
insert into public.contacts (project_id, name, role, email, phone, company)
select id, 'John Smith', 'Client', 'john.smith@email.com', '512-555-0100', 'Residence' from pr
union all
select id, 'Sarah Johnson', 'Project Manager', 'sarah.pm@company.com', '512-555-0101', 'Intelligent Systems' from pr
union all
select id, 'Mike Engineer', 'Lead Technician', 'mike@company.com', '512-555-0102', 'Intelligent Systems' from pr;

