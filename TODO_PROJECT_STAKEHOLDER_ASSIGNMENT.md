# TODO: Project Stakeholder Assignment During Creation

## Issue
When creating a new project, no stakeholders (PM or Technician) are assigned automatically. This means:
- Owner badges on gauge subsections show generic "PM" and "Technician" labels instead of actual names
- Project responsibility is unclear until stakeholders are manually assigned later

## Current Code Location
- Project creation form: `src/components/PMDashboard.js` lines 273-433
- Create handler: `src/components/PMDashboard.js` lines 206-239

## Recommended Solution
Add two dropdown fields to the "Create New Project" form:
1. **Project Manager** dropdown - select from contacts with PM role
2. **Lead Technician** dropdown - select from contacts with Technician/Lead Technician role

Modify `handleCreateProject` to:
1. Create the project (current behavior)
2. Insert records into `project_stakeholders` table with selected PM and Technician
3. Link to appropriate `stakeholder_roles` (Project Manager, Lead Technician)

## Implementation Notes
- Contacts are already being loaded in `loadContacts()` 
- Need to filter contacts by role type for the dropdowns
- Insert into `project_stakeholders` after project creation succeeds
- Handle errors gracefully if stakeholder assignment fails
