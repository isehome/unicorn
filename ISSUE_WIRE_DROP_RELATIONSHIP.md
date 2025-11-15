# Issue and Wire Drop Relationship

## How Issues Work with Wire Drops

### Creating Issues
Issues can be created in **two ways**:

1. **Independently** - Create an issue directly from the Issues section of a project
   - Navigate to Project > Issues > Add New Issue
   - Fill in issue details (title, priority, description, etc.)
   - The issue exists standalone without any wire drop association
   - You can tag stakeholders, add photos, and manage the issue independently

2. **Associate with Wire Drops Later** - Link existing issues to wire drops
   - Navigate to a Wire Drop detail page
   - In the "Associated Issues" section, click "Add Issue"
   - Select an existing issue from the dropdown
   - Click "Associate Issue" to link them
   - One issue can be associated with multiple wire drops
   - One wire drop can have multiple associated issues

### Key Points:
- **Issues are NOT required to start from wire drops** - They are independent entities
- **Issues can exist without wire drop associations** - Useful for general project issues
- **Wire drops can exist without issues** - Not all wire drops will have problems
- **Many-to-many relationship** - One issue can relate to multiple wire drops, and vice versa

### Use Cases:

#### Standalone Issues
- Project-wide concerns (e.g., "Missing permits")
- General problems not tied to specific locations
- Planning and coordination issues
- Client requests or changes

#### Wire Drop Associated Issues
- Wire drop specific problems (e.g., "Cable too short at living room drop")
- Installation problems discovered during specific stages
- Equipment compatibility issues at specific locations
- Quality control findings for specific drops

### Best Practices:
1. Create issues as soon as problems are identified
2. Associate issues with wire drops when the problem is location-specific
3. Use clear, descriptive titles that make sense even without wire drop context
4. Tag relevant stakeholders to ensure proper notification
5. Update issue status (Open, Blocked, Resolved) as work progresses

## Fixed: Duplicate Stakeholders Issue

The duplicate stakeholder issue in the dropdown has been fixed. The problem was that stakeholders could appear in both internal and external arrays with the same `assignment_id`, causing duplicates in the dropdown.

### What was fixed:
- Added deduplication logic using a Map to ensure each `assignment_id` appears only once
- Stakeholders are now properly deduplicated before being displayed in the dropdown
- The fix preserves the category (internal/external) information for display

### Testing the fix:
1. Go to any issue in your project
2. Click on the stakeholder dropdown
3. You should now see each stakeholder listed only once
4. The dropdown will still show whether they are Internal or External
