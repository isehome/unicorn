/**
 * Page Registry
 * Static definitions for all trainable pages
 * These provide baseline context before training adds more
 */

export const PAGE_REGISTRY = {
  // ==================== DASHBOARDS ====================
  '/': {
    componentName: 'TechnicianDashboard',
    pageTitle: 'Technician Home',
    targetUsers: ['technician'],
    staticContext: {
      purpose: 'Main landing page for technicians',
      keyFeatures: ['Assigned projects', 'Today\'s tasks', 'Quick actions'],
    },
    teachableElements: ['project-list', 'task-summary', 'quick-actions'],
  },

  '/pm-dashboard': {
    componentName: 'PMDashboard',
    pageTitle: 'Project Manager Dashboard',
    targetUsers: ['project-manager', 'admin', 'owner'],
    staticContext: {
      purpose: 'Overview of all projects and their status',
      keyFeatures: ['Project list', 'Milestone tracking', 'Create new projects'],
    },
    teachableElements: ['project-cards', 'milestone-gauges', 'new-project-form'],
  },

  // ==================== PROJECTS ====================
  '/project/:id': {
    componentName: 'ProjectDetailView',
    pageTitle: 'Project Detail (Technician)',
    targetUsers: ['technician'],
    staticContext: {
      purpose: 'Technician view of a single project',
      keyFeatures: ['Wire drops list', 'Equipment', 'Documents', 'Contacts'],
    },
    teachableElements: ['wire-drops-section', 'equipment-section', 'documents-section'],
  },

  '/pm/project/:projectId': {
    componentName: 'PMProjectView',
    pageTitle: 'Project Detail (PM)',
    targetUsers: ['project-manager', 'admin', 'owner'],
    staticContext: {
      purpose: 'Full project management view with all sections',
      keyFeatures: ['Milestones', 'Stakeholders', 'Issues', 'Equipment', 'Financials'],
    },
    teachableElements: ['milestone-section', 'stakeholder-section', 'issues-section', 'equipment-section'],
  },

  '/pm-project/:projectId': {
    componentName: 'PMProjectView',
    pageTitle: 'Project Detail (PM)',
    targetUsers: ['project-manager', 'admin', 'owner'],
    staticContext: {
      purpose: 'Full project management view with all sections',
      keyFeatures: ['Milestones', 'Stakeholders', 'Issues', 'Equipment', 'Financials'],
    },
    teachableElements: ['milestone-section', 'stakeholder-section', 'issues-section', 'equipment-section'],
  },

  // ==================== WIRE DROPS ====================
  '/wire-drops': {
    componentName: 'WireDropsHub',
    pageTitle: 'Wire Drops Hub',
    targetUsers: ['technician', 'project-manager'],
    staticContext: {
      purpose: 'Central hub for managing all wire drops across projects',
      keyFeatures: ['Filter by project', 'Filter by stage', 'Quick navigation'],
    },
    teachableElements: ['filter-controls', 'wire-drop-list', 'stage-indicators'],
  },

  '/wire-drops/:id': {
    componentName: 'WireDropDetail',
    pageTitle: 'Wire Drop Detail',
    targetUsers: ['technician'],
    staticContext: {
      purpose: 'Detailed view of a single wire drop with all stages',
      keyFeatures: ['Prewire', 'Trim-out', 'Commissioning', 'Photos', 'Equipment'],
    },
    teachableElements: ['stage-tabs', 'photo-upload', 'equipment-assignment', 'completion-checklist'],
  },

  '/prewire-mode': {
    componentName: 'PrewireMode',
    pageTitle: 'Prewire Mode',
    targetUsers: ['technician'],
    staticContext: {
      purpose: 'Streamlined interface for marking wire drops as prewired',
      keyFeatures: ['Location-based list', 'Quick complete', 'Photo capture'],
    },
    teachableElements: ['location-list', 'complete-button', 'photo-capture'],
  },

  // ==================== SHADES ====================
  '/projects/:projectId/shades': {
    componentName: 'ShadeManager',
    pageTitle: 'Shade Manager',
    targetUsers: ['technician', 'project-manager'],
    staticContext: {
      purpose: 'List of all shades in a project grouped by room',
      keyFeatures: ['Room grouping', 'M1/M2 status', 'Navigate to detail'],
    },
    teachableElements: ['room-groups', 'shade-list', 'status-indicators', 'navigation-actions'],
  },

  '/projects/:projectId/shades/:shadeId': {
    componentName: 'ShadeDetailPage',
    pageTitle: 'Shade Measurement',
    targetUsers: ['technician'],
    staticContext: {
      purpose: 'Dual-verification shade measurement system',
      keyFeatures: ['M1 measurements', 'M2 measurements', 'Comparison view', 'Final approval'],
    },
    teachableElements: ['m1-m2-tabs', 'width-inputs', 'height-input', 'mount-depth', 'notes', 'save-button'],
    criticalFields: ['widthTop', 'widthMiddle', 'widthBottom', 'height', 'mountDepth'],
  },

  // ==================== SERVICE CRM ====================
  '/service': {
    componentName: 'ServiceDashboard',
    pageTitle: 'Service Dashboard',
    targetUsers: ['technician', 'manager', 'admin'],
    staticContext: {
      purpose: 'Service operations hub with ticket list, filtering, and scheduling',
      keyFeatures: ['Open tickets', 'Today\'s schedule', 'Quick stats', 'Search & filters', 'Full ticket list'],
    },
    teachableElements: ['ticket-summary', 'schedule-view', 'quick-actions', 'filter-bar', 'ticket-list', 'status-badges'],
  },

  '/service/tickets/new': {
    componentName: 'NewTicketForm',
    pageTitle: 'Create Service Ticket',
    targetUsers: ['technician', 'manager', 'admin'],
    staticContext: {
      purpose: 'Create a new service ticket',
      keyFeatures: ['Customer selection', 'Issue description', 'Category', 'Priority', 'Scheduling'],
    },
    teachableElements: ['customer-search', 'description-field', 'category-select', 'priority-select', 'submit-button'],
  },

  '/service/tickets/:id': {
    componentName: 'ServiceTicketDetail',
    pageTitle: 'Service Ticket Detail',
    targetUsers: ['technician', 'manager', 'admin'],
    staticContext: {
      purpose: 'Full ticket management with time tracking, parts, photos',
      keyFeatures: ['Time tracking', 'Parts used', 'Photos', 'Comments', 'Status changes'],
    },
    teachableElements: ['time-tracker', 'parts-section', 'photo-section', 'comments', 'status-dropdown'],
  },

  '/service/weekly-planning': {
    componentName: 'WeeklyPlanning',
    pageTitle: 'Weekly Planning',
    targetUsers: ['manager', 'admin', 'owner'],
    staticContext: {
      purpose: 'Drag-and-drop schedule management for technicians',
      keyFeatures: ['Week view', 'Drag tickets to days', 'Technician columns', 'Unscheduled pool'],
    },
    teachableElements: ['calendar-grid', 'technician-columns', 'unscheduled-panel', 'drag-drop'],
  },

  '/service/reports': {
    componentName: 'ServiceReports',
    pageTitle: 'Service Reports',
    targetUsers: ['manager', 'admin', 'owner'],
    staticContext: {
      purpose: 'Generate and view service reports',
      keyFeatures: ['Report generation', 'Metrics', 'Export options'],
    },
    teachableElements: ['report-filters', 'metrics-display', 'export-button'],
  },

  // ==================== EQUIPMENT ====================
  '/projects/:projectId/equipment': {
    componentName: 'EquipmentListPage',
    pageTitle: 'Project Equipment',
    targetUsers: ['project-manager', 'admin'],
    staticContext: {
      purpose: 'Manage equipment for a project - import, order, receive',
      keyFeatures: ['CSV import', 'PO generation', 'Receiving workflow', 'Allocation'],
    },
    teachableElements: ['import-button', 'equipment-list', 'po-generation', 'receiving-mode'],
  },

  '/projects/:projectId/receiving': {
    componentName: 'PartsReceivingPage',
    pageTitle: 'Parts Receiving',
    targetUsers: ['technician', 'project-manager'],
    staticContext: {
      purpose: 'Check in equipment as it arrives',
      keyFeatures: ['Scan or search', 'Mark received', 'Photo verification', 'Location assignment'],
    },
    teachableElements: ['search-bar', 'pending-list', 'received-list', 'photo-capture'],
  },

  '/projects/:projectId/procurement': {
    componentName: 'PMProcurementPage',
    pageTitle: 'Procurement',
    targetUsers: ['project-manager', 'admin'],
    staticContext: {
      purpose: 'Order and track equipment procurement',
      keyFeatures: ['Create POs', 'Track orders', 'Manage vendors'],
    },
    teachableElements: ['po-list', 'create-po', 'vendor-select'],
  },

  '/projects/:projectId/inventory': {
    componentName: 'InventoryPage',
    pageTitle: 'Project Inventory',
    targetUsers: ['technician', 'project-manager'],
    staticContext: {
      purpose: 'View and manage project inventory',
      keyFeatures: ['Inventory list', 'Location tracking', 'Status updates'],
    },
    teachableElements: ['inventory-list', 'location-filters', 'status-updates'],
  },

  // ==================== TODOS & ISSUES ====================
  '/todos': {
    componentName: 'TodosListPage',
    pageTitle: 'My Todos',
    targetUsers: ['technician', 'project-manager'],
    staticContext: {
      purpose: 'Personal todo list across all projects',
      keyFeatures: ['Priority sorting', 'Due dates', 'Project grouping', 'Quick complete'],
    },
    teachableElements: ['todo-list', 'priority-filter', 'project-filter', 'add-todo'],
  },

  '/issues': {
    componentName: 'IssuesListPage',
    pageTitle: 'All Issues',
    targetUsers: ['project-manager', 'admin'],
    staticContext: {
      purpose: 'Track issues/problems across all projects',
      keyFeatures: ['Status filter', 'Assignee filter', 'Priority view', 'Resolution tracking'],
    },
    teachableElements: ['issue-list', 'status-filter', 'create-issue'],
  },

  // ==================== CONTACTS ====================
  '/people': {
    componentName: 'PeopleManagement',
    pageTitle: 'Contacts & People',
    targetUsers: ['project-manager', 'admin'],
    staticContext: {
      purpose: 'Manage contacts - clients, vendors, internal team',
      keyFeatures: ['Search contacts', 'Add new', 'View details', 'Link to projects'],
    },
    teachableElements: ['search-bar', 'contact-list', 'add-contact', 'contact-types'],
  },

  '/contacts/:contactId': {
    componentName: 'ContactDetailPage',
    pageTitle: 'Contact Detail',
    targetUsers: ['project-manager', 'admin'],
    staticContext: {
      purpose: 'Full contact information and project associations',
      keyFeatures: ['Contact info', 'Related projects', 'Communication history', 'Edit details'],
    },
    teachableElements: ['info-section', 'projects-section', 'edit-form'],
  },

  // ==================== PARTS & VENDORS ====================
  '/parts': {
    componentName: 'PartsListPage',
    pageTitle: 'Parts List',
    targetUsers: ['technician', 'project-manager'],
    staticContext: {
      purpose: 'Browse and search parts catalog',
      keyFeatures: ['Search', 'Categories', 'Part details'],
    },
    teachableElements: ['search-bar', 'category-filter', 'parts-grid'],
  },

  '/global-parts': {
    componentName: 'GlobalPartsManager',
    pageTitle: 'Global Parts Manager',
    targetUsers: ['admin', 'owner'],
    staticContext: {
      purpose: 'Manage the global parts catalog',
      keyFeatures: ['Add parts', 'Edit parts', 'Categories', 'Pricing'],
    },
    teachableElements: ['parts-table', 'add-part', 'edit-modal'],
  },

  '/vendors': {
    componentName: 'VendorManagement',
    pageTitle: 'Vendor Management',
    targetUsers: ['admin', 'owner'],
    staticContext: {
      purpose: 'Manage vendor/supplier information',
      keyFeatures: ['Vendor list', 'Contact info', 'Payment terms'],
    },
    teachableElements: ['vendor-list', 'add-vendor', 'vendor-details'],
  },

  // ==================== ADMIN ====================
  '/admin': {
    componentName: 'AdminPage',
    pageTitle: 'Administration',
    targetUsers: ['admin', 'owner'],
    staticContext: {
      purpose: 'System administration - users, roles, settings',
      keyFeatures: ['User management', 'Role assignment', 'Skills management', 'Feature flags', 'Integrations'],
    },
    teachableElements: ['users-tab', 'skills-tab', 'features-tab', 'integrations-tab'],
  },

  '/admin/email-agent': {
    componentName: 'EmailAgentPage',
    pageTitle: 'Email Agent',
    targetUsers: ['admin', 'owner'],
    staticContext: {
      purpose: 'AI email agent management - inbox processing, ticket creation, auto-reply',
      keyFeatures: ['Inbox processing', 'AI classification', 'Auto ticket creation', 'Email settings', 'Processing stats'],
    },
    teachableElements: ['inbox-tab', 'outbox-tab', 'settings-tab', 'stats-dashboard'],
  },

  '/settings': {
    componentName: 'SettingsPage',
    pageTitle: 'Settings',
    targetUsers: ['technician', 'project-manager', 'admin', 'owner'],
    staticContext: {
      purpose: 'Personal and app settings',
      keyFeatures: ['Profile', 'Notifications', 'Theme', 'Voice AI settings'],
    },
    teachableElements: ['profile-section', 'notification-settings', 'theme-toggle', 'ai-settings'],
  },

  '/settings/knowledge': {
    componentName: 'KnowledgeManagementPanel',
    pageTitle: 'Knowledge Base Management',
    targetUsers: ['admin', 'owner'],
    staticContext: {
      purpose: 'Manage AI knowledge base documents',
      keyFeatures: ['Upload documents', 'View indexed content', 'Search'],
    },
    teachableElements: ['upload-area', 'document-list', 'search'],
  },

  // ==================== FLOOR PLANS ====================
  '/projects/:projectId/floor-plan': {
    componentName: 'FloorPlanViewer',
    pageTitle: 'Floor Plan Viewer',
    targetUsers: ['technician', 'project-manager'],
    staticContext: {
      purpose: 'View and interact with project floor plans',
      keyFeatures: ['Pan/zoom', 'Wire drop markers', 'Equipment locations'],
    },
    teachableElements: ['floor-plan-canvas', 'zoom-controls', 'markers'],
  },

  // ==================== REPORTS ====================
  '/projects/:projectId/reports': {
    componentName: 'ProjectReportsPage',
    pageTitle: 'Project Reports',
    targetUsers: ['project-manager', 'admin'],
    staticContext: {
      purpose: 'Generate and view project reports',
      keyFeatures: ['Progress reports', 'Financial reports', 'Export options'],
    },
    teachableElements: ['report-selector', 'report-preview', 'export-button'],
  },

  // ==================== SECURE DATA ====================
  '/projects/:projectId/secure-data': {
    componentName: 'SecureDataPage',
    pageTitle: 'Secure Data',
    targetUsers: ['project-manager', 'admin', 'owner'],
    staticContext: {
      purpose: 'Manage sensitive project information',
      keyFeatures: ['Credentials', 'Access codes', 'Encryption'],
    },
    teachableElements: ['credentials-list', 'add-credential', 'reveal-button'],
  },
};

/**
 * Get page info by route (handles dynamic params)
 */
export const getPageInfo = (pathname) => {
  // First try exact match
  if (PAGE_REGISTRY[pathname]) {
    return PAGE_REGISTRY[pathname];
  }

  // Try pattern matching for dynamic routes
  for (const [pattern, info] of Object.entries(PAGE_REGISTRY)) {
    if (pattern.includes(':')) {
      const regex = new RegExp(
        '^' + pattern.replace(/:[^/]+/g, '[^/]+') + '$'
      );
      if (regex.test(pathname)) {
        return info;
      }
    }
  }

  return null;
};

/**
 * Get the pattern route for a given pathname
 * e.g., '/projects/123/shades' -> '/projects/:projectId/shades'
 */
export const getPatternRoute = (pathname) => {
  // First try exact match
  if (PAGE_REGISTRY[pathname]) {
    return pathname;
  }

  // Try pattern matching for dynamic routes
  for (const [pattern] of Object.entries(PAGE_REGISTRY)) {
    if (pattern.includes(':')) {
      const regex = new RegExp(
        '^' + pattern.replace(/:[^/]+/g, '[^/]+') + '$'
      );
      if (regex.test(pathname)) {
        return pattern;
      }
    }
  }

  return pathname;
};

/**
 * Get all routes for admin overview
 */
export const getAllRoutes = () => {
  return Object.entries(PAGE_REGISTRY).map(([route, info]) => ({
    route,
    ...info,
  }));
};

export default PAGE_REGISTRY;
