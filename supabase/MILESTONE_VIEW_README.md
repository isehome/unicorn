# Database Migrations

## Milestone Percentages View

### Purpose
Pre-calculates all milestone percentages for all projects in PostgreSQL, eliminating the need for 200+ JavaScript queries on dashboard load.

### Performance Impact
- **Before**: 10 queries × number of projects (e.g., 200 queries for 20 projects)
- **After**: 1 query to fetch all pre-calculated milestones
- **Dashboard Load Time**: 10-15 seconds → <1 second

### Installation

#### Step 1: Run the Migration in Supabase

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Copy the contents of `create_milestone_view.sql`
4. Paste and run the SQL

#### Step 2: Initial Refresh

After creating the view, refresh it to populate data:

```sql
SELECT refresh_milestone_percentages();
```

This will take 10-30 seconds depending on your project count.

#### Step 3: Set Up Automatic Refresh (Recommended)

**Option A: pg_cron (Recommended for Production)**

If your Supabase project has pg_cron enabled:

```sql
-- Refresh every 5 minutes
SELECT cron.schedule(
  'refresh-milestones',
  '*/5 * * * *',
  'SELECT refresh_milestone_percentages()'
);
```

**Option B: Manual Refresh from Application**

Call the refresh function when data changes:

```javascript
// After updating wire drop stages, equipment, etc.
await supabase.rpc('refresh_milestone_percentages');
```

**Option C: Trigger-Based (Use with Caution)**

Uncomment the triggers in the SQL file for automatic refresh on data changes.
⚠️ **Warning**: This can be expensive for high-write workloads.

### Verification

Check if the view is working:

```sql
-- View all calculated milestones
SELECT * FROM project_milestone_percentages LIMIT 10;

-- Check when last refreshed
SELECT MAX(last_calculated_at) FROM project_milestone_percentages;

-- Verify specific project
SELECT * FROM project_milestone_percentages
WHERE project_id = 'your-project-uuid-here';
```

### Maintenance

#### Monitor Performance

```sql
-- Check view size
SELECT pg_size_pretty(pg_total_relation_size('project_milestone_percentages'));

-- Check refresh time (run refresh with timing)
\timing on
SELECT refresh_milestone_percentages();
\timing off
```

#### Rebuild If Needed

If the view becomes corrupted or outdated:

```sql
DROP MATERIALIZED VIEW project_milestone_percentages CASCADE;
-- Then re-run the entire create_milestone_view.sql
```

### Rollback

To remove the milestone view:

```sql
DROP MATERIALIZED VIEW IF EXISTS project_milestone_percentages CASCADE;
DROP FUNCTION IF EXISTS refresh_milestone_percentages() CASCADE;
DROP FUNCTION IF EXISTS trigger_milestone_refresh() CASCADE;
```

### Troubleshooting

**Issue**: View is empty
```sql
-- Solution: Refresh manually
SELECT refresh_milestone_percentages();
```

**Issue**: Stale data
```sql
-- Solution: Force refresh
REFRESH MATERIALIZED VIEW CONCURRENTLY project_milestone_percentages;
```

**Issue**: Slow refresh times
- Consider adding indexes to source tables (wire_drops, project_equipment, etc.)
- Reduce refresh frequency
- Use incremental refresh strategy (custom implementation)

### Schema Changes

If you modify the underlying tables (wire_drops, project_equipment, projects), you may need to recreate the view to reflect the new schema.

---

## Next Steps

After running this migration:
1. Update frontend code to use the view (see updated `milestoneService.js`)
2. Remove old calculation methods
3. Add refresh calls after data mutations
4. Monitor dashboard load times
