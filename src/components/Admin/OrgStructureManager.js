/**
 * OrgStructureManager.js
 * Admin component for managing organizational structure and reporting relationships
 *
 * Features:
 * - View all employees with their current manager
 * - Assign/change managers via dropdown
 * - Visual org tree view
 * - Bulk operations
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { careerDevelopmentService } from '../../services/careerDevelopmentService';
import { useTheme } from '../../contexts/ThemeContext';
import TechnicianAvatar from '../TechnicianAvatar';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle,
  AlertCircle,
  Search,
  RefreshCw,
  GitBranch,
  List,
  Crown,
  Shield,
  Briefcase,
  UserCog,
  Wrench,
  X,
  Save
} from 'lucide-react';

// Role icons and colors
const ROLE_CONFIG = {
  owner: { icon: Crown, color: '#10B981', label: 'Owner' },
  admin: { icon: Shield, color: '#F59E0B', label: 'Admin' },
  director: { icon: UserCog, color: '#8B5CF6', label: 'Director' },
  manager: { icon: Briefcase, color: '#3B82F6', label: 'Manager' },
  pm: { icon: Briefcase, color: '#3B82F6', label: 'PM' },
  technician: { icon: Wrench, color: '#64748B', label: 'Technician' }
};

const OrgStructureManager = () => {
  useTheme(); // For consistent styling context

  const [employees, setEmployees] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'tree'
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [pendingChanges, setPendingChanges] = useState({}); // { empId: newManagerId }

  // Load all employees and relationships
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Get all active employees
      const { data: empData, error: empError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, avatar_color, is_active')
        .eq('is_active', true)
        .order('full_name');

      if (empError) throw empError;

      // Get all active manager relationships
      const { data: relData, error: relError } = await supabase
        .from('manager_relationships')
        .select(`
          id,
          employee_id,
          manager_id,
          relationship_type,
          effective_date
        `)
        .eq('is_primary', true)
        .is('end_date', null);

      if (relError) throw relError;

      setEmployees(empData || []);
      setRelationships(relData || []);

      // Auto-expand top level in tree view
      const topLevel = (empData || []).filter(emp =>
        !(relData || []).some(r => r.employee_id === emp.id)
      );
      setExpandedNodes(new Set(topLevel.map(e => e.id)));

    } catch (err) {
      console.error('[OrgStructureManager] Load error:', err);
      setError('Failed to load organization data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Get current manager for an employee
  const getManager = useCallback((employeeId) => {
    const rel = relationships.find(r => r.employee_id === employeeId);
    if (!rel) return null;
    return employees.find(e => e.id === rel.manager_id);
  }, [relationships, employees]);

  // Get direct reports for a manager
  const getDirectReports = useCallback((managerId) => {
    const reportIds = relationships
      .filter(r => r.manager_id === managerId)
      .map(r => r.employee_id);
    return employees.filter(e => reportIds.includes(e.id));
  }, [relationships, employees]);

  // Get employees with no manager (top of hierarchy)
  const topLevelEmployees = useMemo(() => {
    const employeesWithManagers = new Set(relationships.map(r => r.employee_id));
    return employees.filter(e => !employeesWithManagers.has(e.id));
  }, [employees, relationships]);

  // Filter employees by search
  const filteredEmployees = useMemo(() => {
    if (!searchTerm) return employees;
    const term = searchTerm.toLowerCase();
    return employees.filter(e =>
      e.full_name?.toLowerCase().includes(term) ||
      e.email?.toLowerCase().includes(term) ||
      e.role?.toLowerCase().includes(term)
    );
  }, [employees, searchTerm]);

  // Handle manager change (stage it)
  const handleManagerChange = (employeeId, newManagerId) => {
    setPendingChanges(prev => ({
      ...prev,
      [employeeId]: newManagerId || null
    }));
  };

  // Save a single manager change
  const saveManagerChange = async (employeeId) => {
    const newManagerId = pendingChanges[employeeId];

    try {
      setSaving(prev => ({ ...prev, [employeeId]: true }));
      setError(null);

      if (newManagerId === null || newManagerId === '') {
        // Remove manager relationship
        await supabase
          .from('manager_relationships')
          .update({ end_date: new Date().toISOString().split('T')[0] })
          .eq('employee_id', employeeId)
          .eq('is_primary', true)
          .is('end_date', null);
      } else {
        // Set new manager
        await careerDevelopmentService.setManager(employeeId, newManagerId, null);
      }

      // Clear pending change
      setPendingChanges(prev => {
        const next = { ...prev };
        delete next[employeeId];
        return next;
      });

      setSuccess('Manager updated successfully');
      setTimeout(() => setSuccess(null), 2000);

      // Reload data
      await loadData();

    } catch (err) {
      console.error('[OrgStructureManager] Save error:', err);
      setError('Failed to update manager');
    } finally {
      setSaving(prev => ({ ...prev, [employeeId]: false }));
    }
  };

  // Cancel pending change
  const cancelChange = (employeeId) => {
    setPendingChanges(prev => {
      const next = { ...prev };
      delete next[employeeId];
      return next;
    });
  };

  // Toggle tree node expansion
  const toggleNode = (employeeId) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  };

  // Get available managers for dropdown (exclude self and descendants)
  const getAvailableManagers = useCallback((employeeId) => {
    // Get all descendants of this employee to prevent circular references
    const getDescendants = (empId, visited = new Set()) => {
      if (visited.has(empId)) return visited;
      visited.add(empId);
      const reports = getDirectReports(empId);
      reports.forEach(r => getDescendants(r.id, visited));
      return visited;
    };

    const descendants = getDescendants(employeeId);
    return employees.filter(e => e.id !== employeeId && !descendants.has(e.id));
  }, [employees, getDirectReports]);

  // Render role badge
  const renderRoleBadge = (role) => {
    const config = ROLE_CONFIG[role] || ROLE_CONFIG.technician;
    const Icon = config.icon;
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
        style={{ backgroundColor: `${config.color}20`, color: config.color }}
      >
        <Icon size={12} />
        {config.label}
      </span>
    );
  };

  // Render tree node recursively
  const renderTreeNode = (employee, depth = 0) => {
    const reports = getDirectReports(employee.id);
    const hasReports = reports.length > 0;
    const isExpanded = expandedNodes.has(employee.id);

    return (
      <div key={employee.id} className="select-none">
        <div
          className="flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors"
          style={{ marginLeft: `${depth * 24}px` }}
        >
          {/* Expand/collapse button */}
          {hasReports ? (
            <button
              onClick={() => toggleNode(employee.id)}
              className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-600 min-w-[28px] min-h-[28px] flex items-center justify-center"
            >
              {isExpanded ? (
                <ChevronDown size={16} className="text-violet-500" />
              ) : (
                <ChevronRight size={16} className="text-zinc-400" />
              )}
            </button>
          ) : (
            <div className="w-[28px]" />
          )}

          <TechnicianAvatar
            name={employee.full_name}
            color={employee.avatar_color}
            size="sm"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-zinc-900 dark:text-white text-sm">
                {employee.full_name}
              </span>
              {renderRoleBadge(employee.role)}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
              {employee.email}
            </p>
          </div>

          {hasReports && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">
              {reports.length} report{reports.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Render children if expanded */}
        {hasReports && isExpanded && (
          <div>
            {reports.map(report => renderTreeNode(report, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Render list view row
  const renderListRow = (employee) => {
    const currentManager = getManager(employee.id);
    const pendingManagerId = pendingChanges[employee.id];
    const hasPendingChange = pendingManagerId !== undefined;
    const isSaving = saving[employee.id];
    const availableManagers = getAvailableManagers(employee.id);

    // Determine which manager ID to show in dropdown
    const displayManagerId = hasPendingChange ? pendingManagerId : (currentManager?.id || '');

    return (
      <div
        key={employee.id}
        className="flex items-center gap-4 p-4 border-b border-zinc-200 dark:border-zinc-700 last:border-b-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <TechnicianAvatar
          name={employee.full_name}
          color={employee.avatar_color}
          size="md"
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-900 dark:text-white">
              {employee.full_name}
            </span>
            {renderRoleBadge(employee.role)}
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 truncate">
            {employee.email}
          </p>
        </div>

        {/* Manager dropdown */}
        <div className="flex items-center gap-2">
          <label className="text-sm text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
            Reports to:
          </label>
          <select
            value={displayManagerId}
            onChange={(e) => handleManagerChange(employee.id, e.target.value)}
            disabled={isSaving}
            className={`w-48 px-3 py-2 rounded-lg border text-sm min-h-[44px] ${
              hasPendingChange
                ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800'
            } text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500`}
          >
            <option value="">No Manager (Top Level)</option>
            {availableManagers.map(mgr => (
              <option key={mgr.id} value={mgr.id}>
                {mgr.full_name} ({mgr.role})
              </option>
            ))}
          </select>

          {/* Save/Cancel buttons for pending changes */}
          {hasPendingChange && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => saveManagerChange(employee.id)}
                disabled={isSaving}
                className="p-2 rounded-lg bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
                title="Save change"
              >
                {isSaving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
              </button>
              <button
                onClick={() => cancelChange(employee.id)}
                disabled={isSaving}
                className="p-2 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
                title="Cancel"
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-violet-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
              Organization Structure
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Manage reporting relationships and team hierarchy
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-zinc-300 dark:border-zinc-600 overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-2 flex items-center gap-2 text-sm min-h-[44px] ${
                viewMode === 'list'
                  ? 'bg-violet-500 text-white'
                  : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
              }`}
            >
              <List size={16} />
              List
            </button>
            <button
              onClick={() => setViewMode('tree')}
              className={`px-3 py-2 flex items-center gap-2 text-sm min-h-[44px] ${
                viewMode === 'tree'
                  ? 'bg-violet-500 text-white'
                  : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
              }`}
            >
              <GitBranch size={16} />
              Tree
            </button>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-lg border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 min-h-[44px] min-w-[44px]"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-center">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white">{employees.length}</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Total Employees</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-center">
          <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{topLevelEmployees.length}</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Top Level</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-center">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white">{relationships.length}</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Relationships</p>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle size={16} className="text-red-500" />
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <CheckCircle size={16} className="text-green-500" />
          <span className="text-sm text-green-700 dark:text-green-300">{success}</span>
        </div>
      )}

      {/* Search (list view only) */}
      {viewMode === 'list' && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search employees..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
      )}

      {/* Content */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
        {viewMode === 'list' ? (
          /* List View */
          <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {filteredEmployees.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">
                {searchTerm ? 'No employees match your search' : 'No employees found'}
              </div>
            ) : (
              filteredEmployees.map(renderListRow)
            )}
          </div>
        ) : (
          /* Tree View */
          <div className="p-4">
            {topLevelEmployees.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">
                <AlertCircle size={32} className="mx-auto mb-2 text-zinc-400" />
                <p>No organizational structure defined yet.</p>
                <p className="text-sm mt-1">Use the List view to assign managers.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {topLevelEmployees.map(emp => renderTreeNode(emp, 0))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pending changes indicator */}
      {Object.keys(pendingChanges).length > 0 && (
        <div className="fixed bottom-20 right-4 bg-violet-500 text-white px-4 py-2 rounded-full shadow-lg text-sm">
          {Object.keys(pendingChanges).length} unsaved change{Object.keys(pendingChanges).length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

export default OrgStructureManager;
