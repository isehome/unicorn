# UNICORN Database Schema Map

> **Purpose:** Complete documentation of all Supabase database tables, fields, and relationships for AI agent awareness.
>
> **Last Updated:** January 2026

---

## Table of Contents
1. [Overview](#overview)
2. [Core Project Tables](#core-project-tables)
3. [Stakeholder & Contact Tables](#stakeholder--contact-tables)
4. [Wire Drop & Infrastructure Tables](#wire-drop--infrastructure-tables)
5. [Equipment & Inventory Tables](#equipment--inventory-tables)
6. [Procurement & Purchase Order Tables](#procurement--purchase-order-tables)
7. [Service & Maintenance Tables](#service--maintenance-tables)
8. [Issue & Problem Tracking Tables](#issue--problem-tracking-tables)
9. [Shade System Tables](#shade-system-tables)
10. [Room & Location Tables](#room--location-tables)
11. [Labor & Budget Tables](#labor--budget-tables)
12. [Network Infrastructure Tables](#network-infrastructure-tables)
13. [Authentication & Security Tables](#authentication--security-tables)
14. [Knowledge & AI Tables](#knowledge--ai-tables)
15. [Skills & Training Tables](#skills--training-tables)
16. [Company & Settings Tables](#company--settings-tables)
17. [Key Relationships](#key-relationships)
18. [Status & Enum Values](#status--enum-values)

---

## Overview

| Category | Table Count | Description |
|----------|-------------|-------------|
| Core Project | 5 | Project records, milestones, permits, todos |
| Stakeholders | 8 | Contacts, roles, assignments |
| Wire Drops | 7 | Network infrastructure locations |
| Equipment | 9 | Parts catalog, project equipment, inventory |
| Procurement | 7 | Suppliers, POs, shipping |
| Service | 11 | Tickets, scheduling, time tracking |
| Issues | 6 | Problem tracking, photos, comments |
| Shades | 4 | Motorized shade installations |
| Rooms | 2 | Location/zone management |
| Labor | 1 | Budget tracking |
| Network | 3 | UniFi integration |
| Security | 4 | Credentials, audit logs |
| Knowledge/AI | 5 | Documents, embeddings, training |
| Skills | 2 | Technician certifications |
| Settings | 2 | Company/app configuration |
| **Total** | **~76 tables + views** | |

---

## Core Project Tables

### projects
Main project records for all installation jobs.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `name` | text | Project name (e.g., "Smith Residence") |
| `client` | text | Client/customer name |
| `address` | text | Installation address |
| `phase` | text | Current project phase |
| `start_date` | date | Project start date |
| `end_date` | date | Expected completion |
| `assigned_technician` | text | Primary technician email |
| `wiring_diagram_url` | text | Link to wiring diagram |
| `portal_proposal_url` | text | Customer proposal link |
| `one_drive_photos` | text | SharePoint photos folder |
| `one_drive_files` | text | SharePoint files folder |
| `one_drive_procurement` | text | SharePoint procurement folder |
| `client_folder_url` | text | Client's SharePoint folder |
| `default_shipping_address_id` | uuid | FK to shipping_addresses |
| `created_at` | timestamptz | Record creation time |

---

### project_milestones
Track project completion milestones.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `milestone_type` | text | Type (prewire_ordered, trim_ordered, etc.) |
| `percentage` | integer | Completion percentage (0-100) |
| `completed_at` | timestamptz | When milestone was reached |

---

### project_permits
Building permit tracking with inspection workflow.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `permit_number` | text | Official permit number |
| `permit_document_url` | text | Link to permit document |
| `permit_document_name` | text | Document filename |
| `notes` | text | Additional notes |
| `rough_in_completed` | boolean | Rough-in inspection done |
| `rough_in_date` | date | Target rough-in date |
| `rough_in_completed_by` | uuid | Who completed it |
| `rough_in_completed_at` | timestamptz | When completed |
| `final_inspection_completed` | boolean | Final inspection done |
| `final_inspection_date` | date | Target final date |
| `final_inspection_completed_by` | uuid | Who completed it |
| `final_inspection_completed_at` | timestamptz | When completed |
| `created_at` | timestamptz | Record creation |
| `created_by` | uuid | Creator user ID |
| `updated_at` | timestamptz | Last update |
| `updated_by` | uuid | Last updater |

---

### project_todos
Project task checklist items.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `title` | text | Todo item text |
| `description` | text | Detailed description |
| `is_complete` | boolean | Completion status |
| `due_date` | date | Due date |
| `importance` | text | Priority level |
| `do_date` | date | Scheduled date |
| `start_time` | time | Scheduled start time |
| `duration_hours` | numeric | Estimated duration |
| `created_at` | timestamptz | Creation time |

---

### todo_stakeholders
Links stakeholders to project todos for notifications.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `todo_id` | uuid | FK to project_todos |
| `project_stakeholder_id` | uuid | FK to project_stakeholders |
| `created_at` | timestamptz | Creation time |

---

## Stakeholder & Contact Tables

### profiles
User/technician profiles linked to Supabase auth.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key (matches auth.users.id) |
| `full_name` | text | User's full name |
| `email` | text | Email address |
| `role` | text | User role (admin, technician, pm) |
| `avatar_url` | text | Profile picture URL |
| `avatar_color` | text | Hex color for avatar background |
| `created_at` | timestamptz | Account creation |

---

### contacts
Project contacts (customers, builders, etc.).

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects (nullable for global contacts) |
| `first_name` | text | First name |
| `last_name` | text | Last name |
| `name` | text | Full name (computed) |
| `role` | text | Role description |
| `email` | text | Email address |
| `phone` | text | Phone number |
| `company` | text | Company name |
| `address` | text | Mailing address |
| `report` | boolean | Include in reports |
| `stakeholder_role_id` | uuid | FK to stakeholder_roles |
| `is_internal` | boolean | Internal vs external |
| `is_primary` | boolean | Primary contact flag |
| `created_at` | timestamptz | Creation time |

---

### stakeholder_roles
Role definitions for stakeholder management.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `name` | text | Role name (Builder, Electrician, etc.) |
| `category` | text | 'internal' or 'external' |
| `description` | text | Role description |
| `auto_issue_default` | boolean | Auto-tag on new issues |
| `created_at` | timestamptz | Creation time |

---

### stakeholder_defaults
Default stakeholders applied to new projects.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `role_id` | uuid | FK to stakeholder_roles |
| `full_name` | text | Person's name |
| `email` | text | Email address |
| `profile_id` | uuid | FK to profiles (if internal) |
| `is_internal` | boolean | Internal staff flag |
| `active` | boolean | Currently active |
| `created_at` | timestamptz | Creation time |

---

### project_stakeholders
Project-specific stakeholder email list.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `email` | text | Stakeholder email |

---

### project_internal_stakeholders
Internal staff assignments to projects.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `role_id` | uuid | FK to stakeholder_roles |
| `contact_id` | uuid | FK to contacts |
| `full_name` | text | Person's name |
| `email` | text | Email address |
| `profile_id` | uuid | FK to profiles |
| `is_primary` | boolean | Primary for this role |
| `created_at` | timestamptz | Creation time |

---

### project_external_stakeholders
External contact assignments to projects.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `contact_id` | uuid | FK to contacts |
| `role_id` | uuid | FK to stakeholder_roles |
| `is_primary` | boolean | Primary for this role |
| `created_at` | timestamptz | Creation time |

---

## Wire Drop & Infrastructure Tables

### wire_drops
Network wire drop locations in projects.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `uid` | text | Unique identifier (e.g., "WD-001") |
| `name` | text | Location name |
| `location` | text | Physical location description |
| `room_id` | uuid | FK to project_rooms |
| `type` | text | Wire type |
| `stage` | text | Installation stage |
| `prewire_photo` | text | Photo URL (prewire stage) |
| `installed_photo` | text | Photo URL (installed) |
| `notes` | text | Installation notes |
| `created_at` | timestamptz | Creation time |

---

### wire_drop_stages
Installation stage progression.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `wire_drop_id` | uuid | FK to wire_drops |
| `stage` | text | Stage name |
| `completed_at` | timestamptz | Completion time |
| `completed_by` | uuid | Who completed |

---

### wire_drop_equipment_links
Associates equipment to wire drops.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `wire_drop_id` | uuid | FK to wire_drops |
| `equipment_id` | uuid | FK to project_equipment |

---

### wire_drop_shade_links
Associates motorized shades to wire drops.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `wire_drop_id` | uuid | FK to wire_drops |
| `shade_id` | uuid | FK to project_shades |

---

### wire_drop_ports
Network ports on wire drops.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `wire_drop_id` | uuid | FK to wire_drops |
| `port_number` | integer | Port number |
| `device_name` | text | Connected device |
| `mac_address` | text | MAC address |

---

### wire_types (reference table)
Wire type specifications.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `name` | text | Type name (Cat6, Coax, etc.) |
| `active` | boolean | Currently in use |
| `sort_order` | integer | Display order |

---

## Equipment & Inventory Tables

### global_parts
Global parts catalog with inventory tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `part_number` | text | Manufacturer part number |
| `name` | text | Part name/description |
| `description` | text | Detailed description |
| `manufacturer` | text | Manufacturer name |
| `model` | text | Model number |
| `category` | text | Part category |
| `unit_of_measure` | text | Unit (ea, ft, box, etc.) |
| `quantity_on_hand` | integer | Current inventory count |
| `quantity_reserved` | integer | Reserved for projects |
| `reorder_point` | integer | Minimum before reorder |
| `reorder_quantity` | integer | Standard order qty |
| `warehouse_location` | text | Physical location |
| `last_inventory_check` | timestamptz | Last physical count |
| `is_wire_drop_visible` | boolean | Show in wire drop list |
| `is_inventory_item` | boolean | Track inventory |
| `required_for_prewire` | boolean | Needed for prewire phase |
| `schematic_url` | text | Link to schematic |
| `install_manual_urls` | text[] | Installation manual links |
| `technical_manual_urls` | text[] | Technical manual links |
| `needs_review` | boolean | Needs admin review (NEW - for badge) |
| `created_at` | timestamptz | Creation time |

---

### project_equipment
Equipment assigned to specific projects.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `global_part_id` | uuid | FK to global_parts |
| `equipment_type` | text | Type classification |
| `planned_quantity` | integer | Quantity needed |
| `ordered_quantity` | integer | Quantity on POs |
| `received_quantity` | integer | Quantity received |
| `specifications` | text | Custom specs |
| `wire_drop_id` | uuid | FK to wire_drops |
| `room_id` | uuid | FK to project_rooms |
| `location_notes` | text | Installation location |
| `created_at` | timestamptz | Creation time |

---

### equipment_categories
Equipment classification hierarchy.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `name` | text | Category name |
| `parent_id` | uuid | FK to parent category |
| `sort_order` | integer | Display order |

---

### equipment_credentials
Login credentials for devices.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `equipment_id` | uuid | FK to project_equipment |
| `credential_type` | text | Type (admin, user, api) |
| `username` | text | Username |
| `password_encrypted` | text | Encrypted password |
| `url` | text | Access URL |
| `notes` | text | Additional notes |

---

### equipment_import_batches
Track bulk equipment imports from CSV.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `filename` | text | Source filename |
| `row_count` | integer | Rows imported |
| `imported_by` | uuid | User who imported |
| `created_at` | timestamptz | Import time |

---

## Procurement & Purchase Order Tables

### suppliers
Vendor/supplier master list.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `name` | text | Supplier name |
| `code` | text | Short code |
| `website` | text | Website URL |
| `account_number` | text | Our account number |
| `payment_terms` | text | Net 30, etc. |
| `shipping_method` | text | Default shipping |
| `tax_exempt` | boolean | Tax exempt status |
| `is_preferred` | boolean | Preferred vendor |
| `is_internal_inventory` | boolean | Internal warehouse |
| `is_active` | boolean | Currently active |
| `notes` | text | Additional notes |
| `created_at` | timestamptz | Creation time |

---

### supplier_contacts
Contact persons at suppliers.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `supplier_id` | uuid | FK to suppliers |
| `name` | text | Contact name |
| `email` | text | Email address |
| `phone` | text | Phone number |
| `role` | text | Role/title |
| `is_primary` | boolean | Primary contact |

---

### purchase_orders
Purchase orders for procurement.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `supplier_id` | uuid | FK to suppliers |
| `po_number` | text | PO number (auto-generated) |
| `status` | text | draft/submitted/received/cancelled |
| `order_date` | date | Order date |
| `requested_delivery_date` | date | Requested delivery |
| `shipping_address_id` | uuid | FK to shipping_addresses |
| `subtotal` | numeric | Line items total |
| `tax_amount` | numeric | Tax amount |
| `shipping_cost` | numeric | Shipping cost |
| `total_amount` | numeric | Grand total |
| `internal_notes` | text | Internal notes |
| `supplier_notes` | text | Notes to supplier |
| `submitted_at` | timestamptz | When submitted |
| `submitted_by` | uuid | Who submitted |
| `created_at` | timestamptz | Creation time |
| `created_by` | uuid | Creator |

---

### purchase_order_items
Line items on purchase orders.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `po_id` | uuid | FK to purchase_orders |
| `project_equipment_id` | uuid | FK to project_equipment |
| `quantity` | integer | Order quantity |
| `unit_price` | numeric | Price per unit |
| `line_total` | numeric | Quantity x price |
| `received_quantity` | integer | Quantity received |
| `notes` | text | Line item notes |

---

### shipping_addresses
Delivery addresses for orders.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `name` | text | Address name (Office, Jobsite) |
| `attention_to` | text | Attention line |
| `address_line1` | text | Street address |
| `address_line2` | text | Suite/unit |
| `city` | text | City |
| `state` | text | State/province |
| `postal_code` | text | ZIP/postal code |
| `country` | text | Country |
| `phone` | text | Contact phone |
| `is_default` | boolean | Default address |
| `created_at` | timestamptz | Creation time |

---

### shipment_tracking
Package tracking information.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `po_id` | uuid | FK to purchase_orders |
| `carrier` | text | Shipping carrier |
| `tracking_number` | text | Tracking number |
| `ship_date` | date | Ship date |
| `estimated_delivery` | date | ETA |
| `actual_delivery` | date | Actual delivery |
| `status` | text | Tracking status |

---

## Service & Maintenance Tables

### service_tickets
Service requests and maintenance tickets.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `ticket_number` | text | Ticket number |
| `title` | text | Ticket title |
| `description` | text | Issue description |
| `category` | text | Category (network, av, shades, etc.) |
| `priority` | text | low/medium/high/urgent |
| `status` | text | open/in_progress/resolved/closed |
| `assigned_to` | uuid | FK to profiles |
| `assigned_to_name` | text | Assignee name |
| `initial_customer_comment` | text | Original customer report |
| `triage_comments` | text | Triage notes |
| `estimated_hours` | numeric | Time estimate |
| `parts_needed` | boolean | Parts required |
| `proposal_needed` | boolean | Proposal required |
| `scheduled_date` | date | Scheduled visit |
| `scheduled_time` | time | Scheduled time |
| `resolved_at` | timestamptz | Resolution time |
| `resolution_notes` | text | How it was resolved |
| `created_at` | timestamptz | Creation time |
| `created_by` | uuid | Reporter |

---

### service_schedules
Scheduled service appointments.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `ticket_id` | uuid | FK to service_tickets |
| `technician_id` | uuid | FK to profiles |
| `scheduled_date` | date | Visit date |
| `scheduled_time` | time | Visit time |
| `duration_hours` | numeric | Expected duration |
| `status` | text | scheduled/completed/cancelled |
| `notes` | text | Schedule notes |

---

### service_time_logs
Time tracking for service work.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `ticket_id` | uuid | FK to service_tickets |
| `technician_id` | uuid | FK to profiles |
| `technician_email` | text | Technician email |
| `work_date` | date | Date worked |
| `hours` | numeric | Hours worked |
| `notes` | text | Work notes |
| `created_at` | timestamptz | Entry time |

---

### service_ticket_photos
Photos attached to service tickets.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `ticket_id` | uuid | FK to service_tickets |
| `url` | text | Photo URL |
| `caption` | text | Photo caption |
| `taken_at` | timestamptz | Photo timestamp |
| `uploaded_by` | uuid | Uploader |

---

### service_ticket_notes
Notes/comments on service tickets.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `ticket_id` | uuid | FK to service_tickets |
| `note` | text | Note content |
| `is_internal` | boolean | Internal only |
| `created_at` | timestamptz | Creation time |
| `created_by` | uuid | Author |

---

### service_ticket_parts
Parts used in service work.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `ticket_id` | uuid | FK to service_tickets |
| `part_id` | uuid | FK to global_parts |
| `quantity` | integer | Quantity used |
| `unit_cost` | numeric | Cost per unit |

---

## Issue & Problem Tracking Tables

### issues
Project issues and problems.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `title` | text | Issue title |
| `description` | text | Issue description |
| `status` | text | open/blocked/resolved |
| `priority` | text | Priority level |
| `notes` | text | Additional notes |
| `created_at` | timestamptz | Creation time |
| `created_by` | uuid | Reporter |
| `resolved_at` | timestamptz | Resolution time |
| `resolved_by` | uuid | Resolver |

---

### issue_photos
Photos attached to issues.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `issue_id` | uuid | FK to issues |
| `url` | text | Photo URL |
| `caption` | text | Caption |
| `width` | integer | Image width |
| `height` | integer | Image height |
| `created_at` | timestamptz | Upload time |

---

### issue_comments
Comments on issues.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `issue_id` | uuid | FK to issues |
| `comment` | text | Comment text |
| `created_at` | timestamptz | Creation time |
| `created_by` | uuid | Author |

---

### issue_stakeholder_tags
Stakeholders tagged on issues for notification.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `issue_id` | uuid | FK to issues |
| `stakeholder_id` | uuid | FK to project_stakeholders |
| `notified_at` | timestamptz | When notified |

---

### issue_public_access_links
Public links to share issue information.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `issue_id` | uuid | FK to issues |
| `token` | text | Access token |
| `expires_at` | timestamptz | Expiration time |
| `created_at` | timestamptz | Creation time |

---

## Shade System Tables

### project_shades
Motorized shade installations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `room_id` | uuid | FK to project_rooms |
| `batch_id` | uuid | FK to project_shade_batches |
| `name` | text | Shade name |
| `product_type` | text | Product type |
| `width_top` | text | Top width measurement |
| `width_middle` | text | Middle width |
| `width_bottom` | text | Bottom width |
| `height` | text | Height measurement |
| `mount_depth` | text | Mount depth |
| `fabric` | text | Fabric selection |
| `motor_type` | text | Motor specification |
| `control_type` | text | Control method |
| `status` | text | pending/measured/ordered/installed |
| `notes` | text | Installation notes |
| `wire_drop_id` | uuid | FK to wire_drops |
| `created_at` | timestamptz | Creation time |

---

### project_shade_batches
Grouped shade installations for ordering.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `name` | text | Batch name |
| `manufacturer` | text | Shade manufacturer |
| `order_number` | text | Manufacturer order # |
| `status` | text | Batch status |
| `created_at` | timestamptz | Creation time |

---

### shade_photos
Photos of shade installations.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `shade_id` | uuid | FK to project_shades |
| `photo_type` | text | Type (window, measurement, installed) |
| `url` | text | Photo URL |
| `created_at` | timestamptz | Upload time |

---

## Room & Location Tables

### project_rooms
Rooms/zones in projects.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `name` | text | Room name |
| `floor` | text | Floor level |
| `sort_order` | integer | Display order |
| `created_at` | timestamptz | Creation time |

---

### project_room_aliases
Alternative names for rooms.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `room_id` | uuid | FK to project_rooms |
| `alias` | text | Alternative name |

---

## Labor & Budget Tables

### project_labor_budget
Labor cost estimates.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `role` | text | Labor role |
| `estimated_hours` | numeric | Estimated hours |
| `hourly_rate` | numeric | Rate per hour |
| `supplier` | text | Labor supplier/subcontractor |
| `notes` | text | Budget notes |
| `created_at` | timestamptz | Creation time |

---

## Network Infrastructure Tables

### unifi_sites
UniFi network controller sites.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `site_id` | text | UniFi site ID |
| `site_name` | text | Site name |
| `controller_url` | text | Controller URL |
| `last_sync` | timestamptz | Last data sync |

---

### unifi_switches
Network switches from UniFi.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `site_id` | uuid | FK to unifi_sites |
| `device_id` | text | UniFi device ID |
| `name` | text | Switch name |
| `model` | text | Model number |
| `mac` | text | MAC address |
| `ip` | text | IP address |
| `port_count` | integer | Number of ports |

---

### unifi_switch_ports
Individual switch port details.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `switch_id` | uuid | FK to unifi_switches |
| `port_number` | integer | Port number |
| `name` | text | Port name/label |
| `poe_mode` | text | PoE configuration |
| `speed` | text | Link speed |
| `wire_drop_id` | uuid | FK to wire_drops |

---

## Authentication & Security Tables

### project_secure_data
Encrypted credentials for projects.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `project_id` | uuid | FK to projects |
| `data_type` | text | Type (wifi, alarm, etc.) |
| `label` | text | Display label |
| `encrypted_value` | text | Encrypted data |
| `created_at` | timestamptz | Creation time |

---

### secure_data_audit_log
Audit trail for secure data access.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `secure_data_id` | uuid | FK to project_secure_data |
| `action` | text | view/edit/delete |
| `user_id` | uuid | Who accessed |
| `accessed_at` | timestamptz | When accessed |
| `ip_address` | text | Client IP |

---

## Knowledge & AI Tables

### knowledge_manufacturers
Equipment manufacturers for knowledge base.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `name` | text | Manufacturer name |
| `slug` | text | URL slug |
| `logo_url` | text | Logo image URL |
| `description` | text | Description |
| `created_at` | timestamptz | Creation time |

---

### knowledge_documents
Technical documents (PDFs, manuals, specs).

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `manufacturer_id` | uuid | FK to knowledge_manufacturers |
| `title` | text | Document title |
| `file_name` | text | Original filename |
| `file_type` | text | MIME type |
| `file_size` | integer | Size in bytes |
| `file_url` | text | Storage URL |
| `category` | text | Document category |
| `description` | text | Description |
| `tags` | text[] | Search tags |
| `uploaded_by` | uuid | Uploader |
| `status` | text | processing/ready/error |
| `error_message` | text | Processing error |
| `chunk_count` | integer | Number of chunks |
| `created_at` | timestamptz | Upload time |

---

### knowledge_chunks
Vector-embedded text chunks for RAG system.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `document_id` | uuid | FK to knowledge_documents |
| `chunk_index` | integer | Chunk sequence |
| `content` | text | Text content |
| `token_count` | integer | Token count |
| `embedding` | vector(1536) | OpenAI embedding vector |
| `metadata` | jsonb | Additional metadata |
| `created_at` | timestamptz | Creation time |

**Note:** Uses pgvector extension with 1536-dimension vectors (OpenAI text-embedding-ada-002).

---

### page_ai_context
Trained AI context per page.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `page_route` | text | Route path (unique) |
| `component_name` | text | React component name |
| `page_title` | text | Display title |
| `functional_description` | text | What the page does |
| `business_context` | text | Business purpose |
| `workflow_position` | text | Where in workflow |
| `common_mistakes` | jsonb | Common user errors |
| `best_practices` | jsonb | Tips for success |
| `faq` | jsonb | Frequently asked questions |
| `is_trained` | boolean | Has been trained |
| `is_published` | boolean | Published for AI use |
| `training_version` | integer | Version number |

---

### ai_training_transcripts
Training conversation transcripts.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `page_route` | text | Page being trained |
| `session_type` | text | initial/append/retrain |
| `trained_by` | uuid | Trainer user ID |
| `transcript` | jsonb | Conversation transcript |
| `is_complete` | boolean | Training complete |
| `created_at` | timestamptz | Session start |

---

## Skills & Training Tables

### global_skills
Master skill definitions for technician capabilities.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `name` | text | Skill name |
| `category` | text | network/av/shades/control/wiring/installation/maintenance/general |
| `description` | text | Skill description |
| `is_active` | boolean | Currently in use |
| `sort_order` | integer | Display order |
| `created_at` | timestamptz | Creation time |

---

### employee_skills
Technician skill certifications and proficiency.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `employee_id` | uuid | FK to profiles |
| `skill_id` | uuid | FK to global_skills |
| `proficiency_level` | text | training/proficient/expert |
| `certified_at` | date | Certification date |
| `certified_by` | uuid | Who certified |
| `certified_by_name` | text | Certifier name |
| `notes` | text | Additional notes |
| `created_at` | timestamptz | Record creation |

---

## Company & Settings Tables

### company_settings
Company-wide configuration.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key |
| `company_name` | text | Company name |
| `orders_contact_name` | text | Orders contact |
| `orders_contact_email` | text | Orders email |
| `orders_contact_phone` | text | Orders phone |
| `accounting_contact_name` | text | Accounting contact |
| `accounting_contact_email` | text | Accounting email |
| `accounting_contact_phone` | text | Accounting phone |
| `company_logo_url` | text | Logo URL |
| `created_at` | timestamptz | Creation time |
| `updated_at` | timestamptz | Last update |

---

## Key Relationships

### Project Hierarchy
```
projects
├── project_equipment → global_parts
├── project_rooms
│   ├── wire_drops
│   └── project_shades
├── project_stakeholders
├── project_todos → todo_stakeholders
├── project_permits
├── issues → issue_photos, issue_comments
├── purchase_orders → purchase_order_items
└── service_tickets → service_time_logs
```

### Equipment Flow
```
global_parts (catalog)
    ↓
project_equipment (assigned to project)
    ↓
purchase_order_items (ordered)
    ↓
received_quantity (tracked)
```

### Stakeholder System
```
stakeholder_roles (definitions)
    ↓
stakeholder_defaults (templates)
    ↓
project_internal_stakeholders + project_external_stakeholders
    ↓
issue_stakeholder_tags (notifications)
```

---

## Status & Enum Values

### Project Phases
- `prewire` - Prewire installation phase
- `trim` - Trim-out phase
- `programming` - Programming/commissioning
- `punch` - Punch list/final touches
- `complete` - Project complete

### Purchase Order Status
- `draft` - Not yet submitted
- `submitted` - Sent to supplier
- `partial` - Partially received
- `received` - Fully received
- `cancelled` - Order cancelled

### Service Ticket Status
- `open` - New/unassigned
- `in_progress` - Being worked on
- `waiting` - Waiting for parts/info
- `resolved` - Issue fixed
- `closed` - Ticket closed

### Issue Status
- `open` - Active issue
- `blocked` - Waiting on someone
- `resolved` - Issue resolved

### Skill Proficiency Levels
- `training` - Currently learning
- `proficient` - Can work independently
- `expert` - Can train others

---

*This document should be updated whenever database schema changes are made.*
