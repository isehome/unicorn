# Remaining Gauge Updates

## Completed ✅
1. **PMProjectViewEnhanced.js** - Fully updated with:
   - 8 gauges with collapsible groups
   - Dynamic owner badges from stakeholders (PM + Lead Technician names)
   - Caching layer for instant loading
   - Item counts for order/receiving gauges
   - Weighted rollup calculations

2. **PMDashboard.js** - Updated with:
   - 8 gauges with collapsible groups
   - Owner badges (currently hardcoded, needs stakeholder integration)
   - Item counts
   - Caching already working

3. **TechnicianDashboardOptimized.js** - Updated with:
   - 8 gauges with collapsible groups
   - Owner badges (currently hardcoded, needs stakeholder integration)
   - Item counts
   - Fixed parallel loading performance issue

## Remaining Work 🔧

### 1. Add Stakeholder Integration to PMDashboard.js
Currently shows hardcoded "PM" and "Technician" badges. Needs to:
- Add state: `const [projectOwners, setProjectOwners] = useState({})`
- Create function to load stakeholders for ALL projects in dashboard
- Update owner badges to use actual names

**Implementation:**
```javascript
// In PMDashboard.js
const loadAllProjectOwners = async (projectIds) => {
  const { data: stakeholders } = await supabase
    .from('project_stakeholders')
    .select(`
      project_id,
      stakeholder_roles (name),
      contacts (first_name, last_name)
    `)
    .in('project_id', projectIds);

  const ownersByProject = {};
  projectIds.forEach(projectId => {
    const projectStakeholders = stakeholders?.filter(s => s.project_id === projectId) || [];
    const pm = projectStakeholders.find(s => s.stakeholder_roles?.name === 'Project Manager');
    const tech = projectStakeholders.find(s => s.stakeholder_roles?.name === 'Lead Technician');

    ownersByProject[projectId] = {
      pm: pm?.contacts ? `${pm.contacts.first_name || ''} ${pm.contacts.last_name || ''}`.trim() : null,
      technician: tech?.contacts ? `${tech.contacts.first_name || ''} ${tech.contacts.last_name || ''}`.trim() : null
    };
  });

  setProjectOwners(ownersByProject);
};
```

Then update gauge rendering (lines ~468-547):
```javascript
ownerBadge={projectOwners[project.id]?.pm || 'PM'}
ownerBadge={projectOwners[project.id]?.technician || 'Technician'}
```

### 2. Add Stakeholder Integration to TechnicianDashboardOptimized.js
Same as PM Dashboard - currently hardcoded.

**File:** [src/components/TechnicianDashboardOptimized.js](src/components/TechnicianDashboardOptimized.js:123-210)

### 3. Update ProjectDetailView.js (Technician Project Detail Page)
This is the big one - currently uses old `ProgressBar` component and `projectProgress` state instead of milestone service.

**Current State:** (lines ~1443-1447)
```javascript
<ProgressBar label="Prewire" percentage={projectProgress.prewire || 0} />
<ProgressBar label="Trim" percentage={projectProgress.trim || 0} />
<ProgressBar label="Commission" percentage={projectProgress.commission || 0} />
<ProgressBar label="Ordered" percentage={projectProgress.ordered || 0} />
<ProgressBar label="Onsite" percentage={projectProgress.onsite || 0} />
```

**Needs to:**
1. Import `milestoneService` and `milestoneCacheService`
2. Import `UnifiedProgressGauge` and `CollapsibleGaugeGroup`
3. Add state for milestone percentages
4. Add state for project owners
5. Load milestones using `milestoneService.calculateAllPercentages(projectId)`
6. Load stakeholders for owner badges
7. Replace 5 old progress bars with new 8-gauge structure with collapsible groups

**Target Structure:**
```javascript
// Replace lines 1442-1448 with:
<div className="space-y-3">
  <UnifiedProgressGauge
    label="Planning & Design"
    percentage={milestonePercentages.planning_design || 0}
    compact={true}
  />

  <CollapsibleGaugeGroup
    title="Prewire Phase"
    rollupPercentage={milestonePercentages.prewire_phase?.percentage || 0}
    ownerBadge={projectOwners.technician || 'Technician'}
    compact={true}
    autoCollapse={true}
  >
    <UnifiedProgressGauge
      label="Prewire Orders"
      percentage={milestonePercentages.prewire_orders?.percentage || 0}
      itemCount={milestonePercentages.prewire_orders?.itemCount}
      totalItems={milestonePercentages.prewire_orders?.totalItems}
      ownerBadge={projectOwners.pm || 'PM'}
      compact={true}
    />
    <UnifiedProgressGauge
      label="Prewire Receiving"
      percentage={milestonePercentages.prewire_receiving?.percentage || 0}
      itemCount={milestonePercentages.prewire_receiving?.itemCount}
      totalItems={milestonePercentages.prewire_receiving?.totalItems}
      ownerBadge={projectOwners.pm || 'PM'}
      compact={true}
    />
    <UnifiedProgressGauge
      label="Prewire Stages"
      percentage={milestonePercentages.prewire || 0}
      ownerBadge={projectOwners.technician || 'Technician'}
      compact={true}
    />
  </CollapsibleGaugeGroup>

  <CollapsibleGaugeGroup
    title="Trim Phase"
    rollupPercentage={milestonePercentages.trim_phase?.percentage || 0}
    ownerBadge={projectOwners.technician || 'Technician'}
    compact={true}
    autoCollapse={true}
  >
    <UnifiedProgressGauge
      label="Trim Orders"
      percentage={milestonePercentages.trim_orders?.percentage || 0}
      itemCount={milestonePercentages.trim_orders?.itemCount}
      totalItems={milestonePercentages.trim_orders?.totalItems}
      ownerBadge={projectOwners.pm || 'PM'}
      compact={true}
    />
    <UnifiedProgressGauge
      label="Trim Receiving"
      percentage={milestonePercentages.trim_receiving?.percentage || 0}
      itemCount={milestonePercentages.trim_receiving?.itemCount}
      totalItems={milestonePercentages.trim_receiving?.totalItems}
      ownerBadge={projectOwners.pm || 'PM'}
      compact={true}
    />
    <UnifiedProgressGauge
      label="Trim Stages"
      percentage={milestonePercentages.trim || 0}
      ownerBadge={projectOwners.technician || 'Technician'}
      compact={true}
    />
  </CollapsibleGaugeGroup>

  <UnifiedProgressGauge
    label="Commissioning"
    percentage={milestonePercentages.commissioning || 0}
    ownerBadge={projectOwners.technician || 'Technician'}
    compact={true}
  />
</div>
```

### 4. Cache Invalidation
Add cache invalidation to PartsReceivingPageNew after items are received:

```javascript
import { milestoneCacheService } from '../services/milestoneCacheService';

// After successful receiving:
milestoneCacheService.invalidate(projectId);
```

## Priority Order

1. **High Priority:** ProjectDetailView.js - This is the Technician's main project view (shown in screenshot)
2. **Medium Priority:** Add stakeholder integration to PMDashboard.js and TechnicianDashboardOptimized.js
3. **Low Priority:** Cache invalidation in PartsReceivingPageNew

## Current Status

The core gauge restructuring is complete. The PMProjectViewEnhanced page is fully functional with:
- Real stakeholder names showing on owner badges
- 8 granular gauges instead of 6
- Collapsible groups with weighted rollup
- Item counts displayed
- Auto-collapse at 100%
- Caching for instant load

The remaining work is primarily:
1. Copying the same pattern to ProjectDetailView.js
2. Adding stakeholder lookups to the two dashboard pages
