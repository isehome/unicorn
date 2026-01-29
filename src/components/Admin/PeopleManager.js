/**
 * PeopleManager.js
 * Unified admin component for managing people, organization structure, and team skills
 *
 * Consolidates:
 * - Users tab (role management, activation)
 * - Org Structure tab (manager relationships)
 * - Employee Skills tab (now "Team Skills" - manager view of employee proficiencies)
 *
 * Features:
 * - Sub-tabs for different views within a single "People" section
 * - Visual org tree with reporting relationships
 * - Role assignment and user activation
 * - Team skills overview with proficiency badges
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { careerDevelopmentService } from '../../services/careerDevelopmentService';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import TechnicianAvatar from '../TechnicianAvatar';
import Button from '../ui/Button';
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
  Save,
  Users,
  Award,
  GraduationCap,
  Star,
  UserPlus,
  UserX,
  Mail
} from 'lucide-react';

// Role definitions with hierarchy
const USER_ROLES = [
  { id: 'technician', label: 'Technician', icon: Wrench, color: '#64748B', level: 20, description: 'Field technician' },
  { id: 'manager', label: 'Manager', icon: Briefcase, color: '#3B82F6', level: 40, description: 'Project manager' },
  { id: 'pm', label: 'PM', icon: Briefcase, color: '#3B82F6', level: 40, description: 'Project Manager' },
  { id: 'director', label: 'Director', icon: UserCog, color: '#8B5CF6', level: 60, description: 'Department director' },
  { id: 'admin', label: 'Admin', icon: Shield, color: '#F59E0B', level: 80, description: 'System admin' },
  { id: 'owner', label: 'Owner', icon: Crown, color: '#10B981', level: 100, description: 'Full access' }
];

// Proficiency levels
const PROFICIENCY_LEVELS = [
  { id: 'training', label: 'Training', icon: GraduationCap, color: '#F59E0B' },
  { id: 'proficient', label: 'Proficient', icon: CheckCircle, color: '#3B82F6' },
  { id: 'expert', label: 'Expert', icon: Star, color: '#10B981' }
];

// Get role level for comparison
const getRoleLevel = (roleId) => {
  const role = USER_ROLES.find(r => r.id === roleId);
  return role?.level || 0;
};

// Check if current user can manage target user
const canManageUser = (currentUserRole, targetUserRole) => {
  const currentLevel = getRoleLevel(currentUserRole);
  const targetLevel = getRoleLevel(targetUserRole);
  if (currentUserRole === 'owner') return true;
  return currentLevel > targetLevel;
};

const PeopleManager = () => {
  useTheme(); // For consistent styling context
  const { user } = useAuth();

  // Sub-tab state
  const [activeSubTab, setActiveSubTab] = useState('directory'); // 'directory' | 'org-chart' | 'team-skills'

  // Data state
  const [employees, setEmployees] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const [employeeSkills, setEmployeeSkills] = useState([]);
  const [globalSkills, setGlobalSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // UI state
  const [searchTerm, setSearchTerm] = useState('');
  // viewMode could be used in the future for additional views
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [pendingChanges, setPendingChanges] = useState({});
  const [showInactive, setShowInactive] = useState(false);

  // Skills modal state
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [skillsModalOpen, setSkillsModalOpen] = useState(false);

  // Current user's role
  const currentUserRole = useMemo(() => {
    const currentUser = employees.find(e => e.email === user?.email);
    return currentUser?.role || 'technician';
  }, [employees, user?.email]);

  // Load all data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Get all employees
      const { data: empData, error: empError } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, avatar_color, is_active')
        .order('full_name');

      if (empError) throw empError;

      // Get all active manager relationships
      const { data: relData, error: relError } = await supabase
        .from('manager_relationships')
        .select('id, employee_id, manager_id, relationship_type, effective_date')
        .eq('is_primary', true)
        .is('end_date', null);

      if (relError) throw relError;

      // Get employee skills with skill details
      const { data: skillsData, error: skillsError } = await supabase
        .from('employee_skills')
        .select(`
          id,
          employee_id,
          skill_id,
          proficiency_level,
          skill:global_skills(id, name, category)
        `);

      if (skillsError) throw skillsError;

      // Get global skills for the modal
      const { data: globalData, error: globalError } = await supabase
        .from('global_skills')
        .select('id, name, category')
        .eq('is_active', true)
        .order('name');

      if (globalError) throw globalError;

      setEmployees(empData || []);
      setRelationships(relData || []);
      setEmployeeSkills(skillsData || []);
      setGlobalSkills(globalData || []);

      // Auto-expand top level in tree view
      const topLevel = (empData || []).filter(emp =>
        !(relData || []).some(r => r.employee_id === emp.id)
      );
      setExpandedNodes(new Set(topLevel.map(e => e.id)));

    } catch (err) {
      console.error('[PeopleManager] Load error:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Helper functions
  const getManager = useCallback((employeeId) => {
    const rel = relationships.find(r => r.employee_id === employeeId);
    if (!rel) return null;
    return employees.find(e => e.id === rel.manager_id);
  }, [relationships, employees]);

  const getDirectReports = useCallback((managerId) => {
    const reportIds = relationships
      .filter(r => r.manager_id === managerId)
      .map(r => r.employee_id);
    return employees.filter(e => reportIds.includes(e.id));
  }, [relationships, employees]);

  const topLevelEmployees = useMemo(() => {
    const employeesWithManagers = new Set(relationships.map(r => r.employee_id));
    return employees.filter(e => !employeesWithManagers.has(e.id) && (showInactive || e.is_active !== false));
  }, [employees, relationships, showInactive]);

  const getEmployeeSkills = useCallback((employeeId) => {
    return employeeSkills.filter(es => es.employee_id === employeeId);
  }, [employeeSkills]);

  const filteredEmployees = useMemo(() => {
    let filtered = employees;
    if (!showInactive) {
      filtered = filtered.filter(e => e.is_active !== false);
    }
    if (!searchTerm) return filtered;
    const term = searchTerm.toLowerCase();
    return filtered.filter(e =>
      e.full_name?.toLowerCase().includes(term) ||
      e.email?.toLowerCase().includes(term) ||
      e.role?.toLowerCase().includes(term)
    );
  }, [employees, searchTerm, showInactive]);

  const getAvailableManagers = useCallback((employeeId) => {
    const getDescendants = (empId, visited = new Set()) => {
      if (visited.has(empId)) return visited;
      visited.add(empId);
      const reports = getDirectReports(empId);
      reports.forEach(r => getDescendants(r.id, visited));
      return visited;
    };
    const descendants = getDescendants(employeeId);
    return employees.filter(e => e.id !== employeeId && !descendants.has(e.id) && e.is_active !== false);
  }, [employees, getDirectReports]);

  // Action handlers
  const handleManagerChange = (employeeId, newManagerId) => {
    setPendingChanges(prev => ({
      ...prev,
      [employeeId]: newManagerId || null
    }));
  };

  const saveManagerChange = async (employeeId) => {
    const newManagerId = pendingChanges[employeeId];
    try {
      setSaving(prev => ({ ...prev, [employeeId]: true }));
      setError(null);

      if (newManagerId === null || newManagerId === '') {
        await supabase
          .from('manager_relationships')
          .update({ end_date: new Date().toISOString().split('T')[0] })
          .eq('employee_id', employeeId)
          .eq('is_primary', true)
          .is('end_date', null);
      } else {
        await careerDevelopmentService.setManager(employeeId, newManagerId, null);
      }

      setPendingChanges(prev => {
        const next = { ...prev };
        delete next[employeeId];
        return next;
      });

      setSuccess('Manager updated');
      setTimeout(() => setSuccess(null), 2000);
      await loadData();
    } catch (err) {
      console.error('[PeopleManager] Save manager error:', err);
      setError('Failed to update manager');
    } finally {
      setSaving(prev => ({ ...prev, [employeeId]: false }));
    }
  };

  const cancelChange = (employeeId) => {
    setPendingChanges(prev => {
      const next = { ...prev };
      delete next[employeeId];
      return next;
    });
  };

  const handleUpdateUserRole = async (userId, newRole) => {
    try {
      setSaving(prev => ({ ...prev, [userId]: true }));
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (updateError) throw updateError;

      setSuccess('Role updated');
      setTimeout(() => setSuccess(null), 2000);
      await loadData();
    } catch (err) {
      console.error('[PeopleManager] Update role error:', err);
      setError('Failed to update role');
    } finally {
      setSaving(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleToggleUserActive = async (userId, newStatus) => {
    try {
      setSaving(prev => ({ ...prev, [userId]: true }));
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ is_active: newStatus })
        .eq('id', userId);

      if (updateError) throw updateError;

      setSuccess(newStatus ? 'User activated' : 'User deactivated');
      setTimeout(() => setSuccess(null), 2000);
      await loadData();
    } catch (err) {
      console.error('[PeopleManager] Toggle active error:', err);
      setError('Failed to update user status');
    } finally {
      setSaving(prev => ({ ...prev, [userId]: false }));
    }
  };

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

  // Render role badge
  const renderRoleBadge = (role) => {
    const config = USER_ROLES.find(r => r.id === role) || USER_ROLES[0];
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

  // Render tree node for org chart
  const renderTreeNode = (employee, depth = 0) => {
    const reports = getDirectReports(employee.id).filter(r => showInactive || r.is_active !== false);
    const hasReports = reports.length > 0;
    const isExpanded = expandedNodes.has(employee.id);
    const empSkills = getEmployeeSkills(employee.id);

    return (
      <div key={employee.id} className="select-none">
        <div
          className={`flex items-center gap-3 p-3 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700/50 transition-colors ${
            employee.is_active === false ? 'opacity-60' : ''
          }`}
          style={{ marginLeft: `${depth * 24}px` }}
        >
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
              {employee.is_active === false && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                  Inactive
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
              {employee.email}
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-zinc-400">
            {empSkills.length > 0 && (
              <span>{empSkills.length} skills</span>
            )}
            {hasReports && (
              <span>{reports.length} report{reports.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>

        {hasReports && isExpanded && (
          <div>
            {reports.map(report => renderTreeNode(report, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Render directory row (Users view with org structure combined)
  const renderDirectoryRow = (employee) => {
    const currentManager = getManager(employee.id);
    const pendingManagerId = pendingChanges[employee.id];
    const hasPendingChange = pendingManagerId !== undefined;
    const isSaving = saving[employee.id];
    const availableManagers = getAvailableManagers(employee.id);
    const displayManagerId = hasPendingChange ? pendingManagerId : (currentManager?.id || '');
    const canEdit = canManageUser(currentUserRole, employee.role) && employee.email !== user?.email;
    const isCurrentUser = employee.email === user?.email;

    return (
      <div
        key={employee.id}
        className={`p-4 border-b border-zinc-200 dark:border-zinc-700 last:border-b-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 ${
          employee.is_active === false ? 'opacity-60' : ''
        }`}
      >
        <div className="flex items-start gap-4">
          <TechnicianAvatar
            name={employee.full_name}
            color={employee.avatar_color}
            size="md"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-zinc-900 dark:text-white">
                {employee.full_name || employee.email}
              </span>
              {renderRoleBadge(employee.role)}
              {isCurrentUser && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">
                  You
                </span>
              )}
              {employee.is_active === false && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                  Inactive
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
              <Mail size={12} />
              {employee.email}
            </p>
          </div>

          {/* Actions column */}
          <div className="flex flex-col gap-2 items-end">
            {/* Role selector */}
            {canEdit && (
              <select
                value={employee.role || 'technician'}
                onChange={(e) => handleUpdateUserRole(employee.id, e.target.value)}
                disabled={isSaving}
                className="px-2 py-1.5 bg-white dark:bg-zinc-700 border border-zinc-300 dark:border-zinc-600 rounded text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-violet-500 min-h-[36px]"
              >
                {USER_ROLES.filter(r => getRoleLevel(currentUserRole) > r.level || currentUserRole === 'owner').map(r => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            )}

            {/* Manager dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500 whitespace-nowrap">Reports to:</span>
              <select
                value={displayManagerId}
                onChange={(e) => handleManagerChange(employee.id, e.target.value)}
                disabled={isSaving}
                className={`w-40 px-2 py-1.5 rounded border text-sm min-h-[36px] ${
                  hasPendingChange
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                    : 'border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700'
                } text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-violet-500`}
              >
                <option value="">— None —</option>
                {availableManagers.map(mgr => (
                  <option key={mgr.id} value={mgr.id}>
                    {mgr.full_name} ({mgr.role})
                  </option>
                ))}
              </select>

              {hasPendingChange && (
                <>
                  <button
                    onClick={() => saveManagerChange(employee.id)}
                    disabled={isSaving}
                    className="p-2 rounded-lg bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-50 min-h-[36px] min-w-[36px] flex items-center justify-center"
                    title="Save"
                  >
                    {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  </button>
                  <button
                    onClick={() => cancelChange(employee.id)}
                    disabled={isSaving}
                    className="p-2 rounded-lg bg-zinc-200 dark:bg-zinc-600 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-500 min-h-[36px] min-w-[36px] flex items-center justify-center"
                    title="Cancel"
                  >
                    <X size={14} />
                  </button>
                </>
              )}
            </div>

            {/* Activate/Deactivate button */}
            {canEdit && (
              <button
                onClick={() => handleToggleUserActive(employee.id, !employee.is_active)}
                disabled={isSaving}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors ${
                  employee.is_active
                    ? 'hover:bg-red-500/20 text-red-500'
                    : 'hover:bg-green-500/20 text-green-500'
                }`}
                title={employee.is_active ? 'Deactivate user' : 'Activate user'}
              >
                {employee.is_active ? <UserX size={14} /> : <UserPlus size={14} />}
                {employee.is_active ? 'Deactivate' : 'Activate'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render Team Skills view (manager view of employee proficiencies)
  const renderTeamSkillsRow = (employee) => {
    const empSkills = getEmployeeSkills(employee.id);
    const manager = getManager(employee.id);

    return (
      <div
        key={employee.id}
        className="p-4 border-b border-zinc-200 dark:border-zinc-700 last:border-b-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <TechnicianAvatar
              name={employee.full_name}
              color={employee.avatar_color}
              size="md"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-900 dark:text-white">
                  {employee.full_name || employee.email}
                </span>
                {renderRoleBadge(employee.role)}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {manager ? `Reports to ${manager.full_name}` : 'No manager'} • {empSkills.length} skill{empSkills.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={Award}
            onClick={() => {
              setSelectedEmployee(employee);
              setSkillsModalOpen(true);
            }}
          >
            Manage Skills
          </Button>
        </div>

        {empSkills.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {empSkills.map(es => {
              const level = PROFICIENCY_LEVELS.find(l => l.id === es.proficiency_level);
              const LevelIcon = level?.icon || CheckCircle;
              return (
                <div
                  key={es.id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs"
                  style={{ backgroundColor: `${level?.color}20`, color: level?.color }}
                >
                  <LevelIcon size={12} />
                  <span>{es.skill?.name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // Skills modal for managing employee skills
  const renderSkillsModal = () => {
    if (!skillsModalOpen || !selectedEmployee) return null;

    const empSkills = getEmployeeSkills(selectedEmployee.id);
    const skillsGrouped = globalSkills.reduce((acc, skill) => {
      const category = skill.category || 'general';
      if (!acc[category]) acc[category] = [];
      acc[category].push(skill);
      return acc;
    }, {});

    const handleAssignSkill = async (skillId, proficiencyLevel) => {
      try {
        setSaving(prev => ({ ...prev, modal: true }));
        const existing = empSkills.find(es => es.skill_id === skillId);

        if (existing) {
          const { error } = await supabase
            .from('employee_skills')
            .update({ proficiency_level: proficiencyLevel })
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('employee_skills')
            .insert({
              employee_id: selectedEmployee.id,
              skill_id: skillId,
              proficiency_level: proficiencyLevel
            });
          if (error) throw error;
        }

        await loadData();
        setSuccess('Skill updated');
        setTimeout(() => setSuccess(null), 2000);
      } catch (err) {
        console.error('[PeopleManager] Assign skill error:', err);
        setError('Failed to update skill');
      } finally {
        setSaving(prev => ({ ...prev, modal: false }));
      }
    };

    const handleRemoveSkill = async (employeeSkillId) => {
      try {
        setSaving(prev => ({ ...prev, modal: true }));
        const { error } = await supabase
          .from('employee_skills')
          .delete()
          .eq('id', employeeSkillId);

        if (error) throw error;
        await loadData();
        setSuccess('Skill removed');
        setTimeout(() => setSuccess(null), 2000);
      } catch (err) {
        console.error('[PeopleManager] Remove skill error:', err);
        setError('Failed to remove skill');
      } finally {
        setSaving(prev => ({ ...prev, modal: false }));
      }
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-zinc-800 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center gap-3">
              <TechnicianAvatar
                name={selectedEmployee.full_name}
                color={selectedEmployee.avatar_color}
                size="md"
              />
              <div>
                <h3 className="font-semibold text-zinc-900 dark:text-white">
                  {selectedEmployee.full_name}
                </h3>
                <p className="text-sm text-zinc-500">{empSkills.length} skills assigned</p>
              </div>
            </div>
            <button
              onClick={() => {
                setSkillsModalOpen(false);
                setSelectedEmployee(null);
              }}
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              <X size={20} className="text-zinc-500" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {Object.entries(skillsGrouped).map(([category, skills]) => (
              <div key={category}>
                <h4 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2 capitalize">
                  {category}
                </h4>
                <div className="space-y-2">
                  {skills.map(skill => {
                    const assigned = empSkills.find(es => es.skill_id === skill.id);
                    return (
                      <div
                        key={skill.id}
                        className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-700/50"
                      >
                        <span className="text-sm font-medium text-zinc-900 dark:text-white">
                          {skill.name}
                        </span>
                        <div className="flex items-center gap-2">
                          {PROFICIENCY_LEVELS.map(level => {
                            const isSelected = assigned?.proficiency_level === level.id;
                            const LevelIcon = level.icon;
                            return (
                              <button
                                key={level.id}
                                onClick={() => handleAssignSkill(skill.id, level.id)}
                                disabled={saving.modal}
                                className={`p-2 rounded-lg transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center ${
                                  isSelected
                                    ? 'ring-2 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-zinc-700'
                                    : 'hover:bg-zinc-200 dark:hover:bg-zinc-600'
                                }`}
                                style={{
                                  backgroundColor: isSelected ? `${level.color}20` : undefined,
                                  color: isSelected ? level.color : '#71717a',
                                  ringColor: isSelected ? level.color : undefined
                                }}
                                title={level.label}
                              >
                                <LevelIcon size={18} />
                              </button>
                            );
                          })}
                          {assigned && (
                            <button
                              onClick={() => handleRemoveSkill(assigned.id)}
                              disabled={saving.modal}
                              className="p-2 rounded-lg text-red-500 hover:bg-red-500/20 min-h-[40px] min-w-[40px] flex items-center justify-center"
                              title="Remove skill"
                            >
                              <X size={18} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
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
            <Users className="w-5 h-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
              People & Organization
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Manage users, roles, reporting structure, and team skills
            </p>
          </div>
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

      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-700 pb-2">
        <button
          onClick={() => setActiveSubTab('directory')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
            activeSubTab === 'directory'
              ? 'bg-violet-500 text-white'
              : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'
          }`}
        >
          <List size={16} />
          Directory
        </button>
        <button
          onClick={() => setActiveSubTab('org-chart')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
            activeSubTab === 'org-chart'
              ? 'bg-violet-500 text-white'
              : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'
          }`}
        >
          <GitBranch size={16} />
          Org Chart
        </button>
        <button
          onClick={() => setActiveSubTab('team-skills')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
            activeSubTab === 'team-skills'
              ? 'bg-violet-500 text-white'
              : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600'
          }`}
        >
          <Award size={16} />
          Team Skills
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-center">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white">
            {employees.filter(e => e.is_active !== false).length}
          </p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Active Users</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-center">
          <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{topLevelEmployees.length}</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Top Level</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-center">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white">{relationships.length}</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Reports</p>
        </div>
        <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-center">
          <p className="text-2xl font-bold text-zinc-900 dark:text-white">{employeeSkills.length}</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Skill Assignments</p>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle size={16} className="text-red-500" />
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-500">
            <X size={14} />
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <CheckCircle size={16} className="text-green-500" />
          <span className="text-sm text-green-700 dark:text-green-300">{success}</span>
        </div>
      )}

      {/* Search and filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, email, or role..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-500 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-zinc-300 text-violet-500 focus:ring-violet-500"
          />
          Show inactive
        </label>
      </div>

      {/* Content based on sub-tab */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
        {activeSubTab === 'directory' && (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {filteredEmployees.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">
                {searchTerm ? 'No employees match your search' : 'No employees found'}
              </div>
            ) : (
              filteredEmployees.map(renderDirectoryRow)
            )}
          </div>
        )}

        {activeSubTab === 'org-chart' && (
          <div className="p-4">
            {topLevelEmployees.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">
                <AlertCircle size={32} className="mx-auto mb-2 text-zinc-400" />
                <p>No organizational structure defined yet.</p>
                <p className="text-sm mt-1">Use the Directory view to assign managers.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {topLevelEmployees
                  .filter(emp => !searchTerm ||
                    emp.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    emp.email?.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map(emp => renderTreeNode(emp, 0))}
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'team-skills' && (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
            {filteredEmployees.filter(e => e.is_active !== false).length === 0 ? (
              <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">
                No active employees found
              </div>
            ) : (
              filteredEmployees
                .filter(e => e.is_active !== false)
                .map(renderTeamSkillsRow)
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

      {/* Skills Modal */}
      {renderSkillsModal()}
    </div>
  );
};

export default PeopleManager;
