
-- Add designer_stakeholder_id to project_shades if it doesn't exist
ALTER TABLE project_shades ADD COLUMN IF NOT EXISTS designer_stakeholder_id uuid;

-- Optional: Add foreign key constraint if stakeholders table is strictly enforced, 
-- but given the flexible nature of stakeholders (sometimes just contacts), a soft link might be safer unless we are sure.
-- Ideally: REFERENCES project_stakeholders(id) or similar. 
-- However, based on ShadeManager logic, it uses stakeholders which might be from `project_stakeholders` view or table.
-- Let's just add the column for now to fix the immediate crash.

COMMENT ON COLUMN project_shades.designer_stakeholder_id IS 'Link to the project stakeholder responsible for design approval';
