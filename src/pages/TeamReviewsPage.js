/**
 * TeamReviewsPage.js
 * Manager view for reviewing team skills and conducting quarterly reviews
 *
 * Features:
 * - Hierarchical org tree view (see direct reports + their reports)
 * - Review any employee under you in the hierarchy
 * - Employee self-rating column
 * - Manager rating column (editable)
 * - Focus goal checkboxes (inline)
 * - Training links
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { careerDevelopmentService } from '../services/careerDevelopmentService';
import { enhancedStyles } from '../styles/styleSystem';
import SkillReviewPanel from '../components/CareerDevelopment/SkillReviewPanel';
import TechnicianAvatar from '../components/TechnicianAvatar';
import {
  Users,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  ChevronRight,
  ChevronDown,
  FileCheck,
  ArrowLeft,
  CalendarCheck,
  Building2,
  UserCircle
} from 'lucide-react';

const TeamReviewsPage = () => {
  const { user } = useAuth();
  const { mode } = useTheme();
  const { publishState, registerActions, unregisterActions } = useAppState();
  const sectionStyles = enhancedStyles.sections[mode];

  const [cycle, setCycle] = useState(null);
  const [allReports, setAllReports] = useState([]);
  const [teamStatus, setTeamStatus] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState(null);
  const [expandedManagers, setExpandedManagers] = useState(new Set());

  // Build hierarchical tree structure from flat reports list
  const orgTree = useMemo(() => {
    if (!allReports.length) return [];

    // Group reports by their direct manager
    const byManager = {};
    const directReports = [];

    allReports.forEach(report => {
      if (report.hierarchy_level === 1) {
        // Direct reports to current user
        directReports.push(report);
      } else {
        // Indirect reports - group by their direct manager
        const managerId = report.direct_manager_id;
        if (!byManager[managerId]) {
          byManager[managerId] = [];
        }
        byManager[managerId].push(report);
      }
    });

    // Build tree nodes
    const buildNode = (report) => {
      const children = byManager[report.employee_id] || [];
      const hasReports = children.length > 0;
      return {
        ...report,
        hasReports,
        children: children.map(buildNode)
      };
    };

    return directReports.map(buildNode);
  }, [allReports]);

  // Count stats
  const stats = useMemo(() => {
    const directCount = allReports.filter(r => r.hierarchy_level === 1).length;
    const totalCount = allReports.length;
    const managersCount = allReports.filter(r =>
      allReports.some(other => other.direct_manager_id === r.employee_id)
    ).length;
    return { directCount, totalCount, managersCount };
  }, [allReports]);

  // Load initial data
  const loadData = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setError(null);

      const [cycleData, reportsData] = await Promise.all([
        careerDevelopmentService.getCurrentCycle(),
        careerDevelopmentService.getAllReports(user.id)
      ]);

      setCycle(cycleData);
      setAllReports(reportsData);

      // Auto-expand first level
      const directReportIds = reportsData
        .filter(r => r.hierarchy_level === 1)
        .map(r => r.employee_id);
      setExpandedManagers(new Set(directReportIds));

      if (cycleData && reportsData.length > 0) {
        // Get status for all employees we can review
        const statusPromises = reportsData.map(async (report) => {
          const session = await careerDevelopmentService.getSession(cycleData.id, report.employee_id);
          return {
            employee: report,
            session,
            status: session?.status || 'pending'
          };
        });
        const statusData = await Promise.all(statusPromises);
        setTeamStatus(statusData);
      }
    } catch (err) {
      console.error('[TeamReviewsPage] Load error:', err);
      setError('Failed to load team data');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load selected employee's session
  useEffect(() => {
    const loadSession = async () => {
      if (selectedEmployee && cycle) {
        const session = await careerDevelopmentService.getSession(cycle.id, selectedEmployee.employee_id);
        setSelectedSession(session);
      } else {
        setSelectedSession(null);
      }
    };
    loadSession();
  }, [selectedEmployee, cycle]);

  // AI Voice Copilot integration
  useEffect(() => {
    publishState({
      view: 'team-reviews',
      cycle: cycle ? { name: cycle.name, status: cycle.status } : null,
      teamSize: allReports.length,
      selectedEmployee: selectedEmployee?.full_name,
      hint: 'Team Reviews page. Review any employee under you in the org hierarchy.'
    });
  }, [publishState, cycle, allReports.length, selectedEmployee]);

  useEffect(() => {
    const actions = {
      select_employee: async ({ name }) => {
        const employee = allReports.find(r =>
          r.full_name?.toLowerCase().includes(name?.toLowerCase())
        );
        if (employee) {
          setSelectedEmployee(employee);
          return { success: true, message: `Selected ${employee.full_name}` };
        }
        return { success: false, error: 'Employee not found' };
      },
      back_to_list: async () => {
        setSelectedEmployee(null);
        return { success: true };
      },
      refresh_data: async () => {
        await loadData();
        return { success: true };
      }
    };
    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, allReports, loadData]);

  // Toggle expand/collapse for a manager
  const toggleExpand = (employeeId) => {
    setExpandedManagers(prev => {
      const next = new Set(prev);
      if (next.has(employeeId)) {
        next.delete(employeeId);
      } else {
        next.add(employeeId);
      }
      return next;
    });
  };

  // Finalize review (update official employee_skills)
  const handleFinalizeReview = async () => {
    if (!selectedSession) return;

    const confirmed = window.confirm(
      'Finalize this review? This will update the employee\'s official skill ratings. This action cannot be undone.'
    );
    if (!confirmed) return;

    try {
      setFinalizing(true);
      await careerDevelopmentService.finalizeReview(
        selectedSession.id,
        user.id,
        user.displayName || user.full_name
      );
      await loadData();
      const session = await careerDevelopmentService.getSession(cycle.id, selectedEmployee.employee_id);
      setSelectedSession(session);
    } catch (err) {
      console.error('[TeamReviewsPage] Finalize error:', err);
      setError('Failed to finalize review');
    } finally {
      setFinalizing(false);
    }
  };

  // Get status info for an employee
  const getStatusInfo = (employeeId) => {
    const status = teamStatus.find(s => s.employee?.employee_id === employeeId);
    if (!status) return { label: 'Not Started', color: '#71717A', icon: Clock };

    switch (status.status) {
      case 'completed':
        return { label: 'Completed', color: '#94AF32', icon: CheckCircle };
      case 'manager_review_complete':
        return { label: 'Review Complete', color: '#3B82F6', icon: FileCheck };
      case 'meeting_scheduled':
        return { label: 'Meeting Scheduled', color: '#3B82F6', icon: CalendarCheck };
      case 'self_eval_complete':
        return { label: 'Ready for Review', color: '#F59E0B', icon: AlertCircle };
      default:
        return { label: 'Pending Self-Eval', color: '#71717A', icon: Clock };
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Render a tree node (recursive)
  const renderTreeNode = (node, depth = 0) => {
    const statusInfo = getStatusInfo(node.employee_id);
    const StatusIcon = statusInfo.icon;
    const isExpanded = expandedManagers.has(node.employee_id);
    const isDirectManager = node.hierarchy_level === 1 && node.hasReports;

    return (
      <div key={node.employee_id}>
        <button
          onClick={() => setSelectedEmployee(node)}
          className="w-full rounded-xl border p-3 text-left hover:border-violet-300 dark:hover:border-violet-600 transition-colors min-h-[64px] mb-2"
          style={{
            ...sectionStyles.card,
            marginLeft: `${depth * 24}px`,
            width: `calc(100% - ${depth * 24}px)`
          }}
        >
          <div className="flex items-center gap-3">
            {/* Expand/Collapse for managers with reports */}
            {node.hasReports ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node.employee_id);
                }}
                className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 min-w-[28px] min-h-[28px] flex items-center justify-center"
              >
                {isExpanded ? (
                  <ChevronDown size={18} className="text-violet-500" />
                ) : (
                  <ChevronRight size={18} className="text-zinc-400" />
                )}
              </button>
            ) : (
              <div className="w-[28px]" /> // Spacer for alignment
            )}

            <TechnicianAvatar
              name={node.full_name}
              color={node.avatar_color}
              size="sm"
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-zinc-900 dark:text-white text-sm">
                  {node.full_name}
                </h3>
                {isDirectManager && (
                  <span className="px-2 py-0.5 rounded-full text-xs bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                    Manager
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <span>{node.role?.charAt(0).toUpperCase() + node.role?.slice(1)}</span>
                {node.hierarchy_level > 1 && (
                  <>
                    <span className="text-zinc-300 dark:text-zinc-600">•</span>
                    <span>Reports to {node.direct_manager_name}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: `${statusInfo.color}20`, color: statusInfo.color }}
              >
                <StatusIcon size={12} />
                {statusInfo.label}
              </div>
              <ChevronRight size={18} className="text-zinc-400" />
            </div>
          </div>
        </button>

        {/* Render children if expanded */}
        {node.hasReports && isExpanded && (
          <div>
            {node.children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-violet-500" size={40} />
      </div>
    );
  }

  // No reports at all
  if (allReports.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 pb-24">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="rounded-2xl border p-8 text-center" style={sectionStyles.card}>
            <Users size={48} className="mx-auto mb-4 text-zinc-400" />
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">
              No Team Members
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400">
              You don't have any team members assigned to you yet. Ask your administrator to set up the organizational structure.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Employee Detail View - Single panel with SkillReviewPanel
  if (selectedEmployee) {
    const statusInfo = getStatusInfo(selectedEmployee.employee_id);
    const StatusIcon = statusInfo.icon;
    const canFinalize = selectedSession?.status === 'manager_review_complete';
    const isCompleted = selectedSession?.status === 'completed';

    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 pb-24">
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          {/* Back Button & Header */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedEmployee(null)}
              className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors min-h-[44px] min-w-[44px]"
            >
              <ArrowLeft size={24} className="text-zinc-600 dark:text-zinc-400" />
            </button>
            <div className="flex items-center gap-4 flex-1">
              <TechnicianAvatar
                name={selectedEmployee.full_name}
                color={selectedEmployee.avatar_color}
                size="lg"
              />
              <div>
                <h1 className="text-xl font-bold text-zinc-900 dark:text-white">
                  {selectedEmployee.full_name}
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {selectedEmployee.email}
                  {selectedEmployee.hierarchy_level > 1 && (
                    <span className="ml-2 text-zinc-400">
                      • Reports to {selectedEmployee.direct_manager_name}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
              style={{ backgroundColor: `${statusInfo.color}20`, color: statusInfo.color }}
            >
              <StatusIcon size={16} />
              {statusInfo.label}
            </div>
          </div>

          {/* Cycle Info */}
          {cycle && (
            <div className="p-4 bg-violet-50 dark:bg-violet-900/20 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Calendar className="text-violet-600 dark:text-violet-400" size={20} />
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-white">{cycle.name} Review</p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Manager review due: {formatDate(cycle.manager_review_due_date)}
                  </p>
                </div>
              </div>

              {/* Finalize Button */}
              {canFinalize && (
                <button
                  onClick={handleFinalizeReview}
                  disabled={finalizing}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold min-h-[44px] disabled:opacity-50"
                  style={{ backgroundColor: '#94AF32', color: 'white' }}
                >
                  {finalizing ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      Finalizing...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={16} />
                      Finalize Review
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Skill Review Panel - Manager Mode */}
          {cycle && (
            <div className="rounded-2xl border p-6" style={sectionStyles.card}>
              <SkillReviewPanel
                cycle={cycle}
                employeeId={selectedEmployee.employee_id}
                managerId={user.id}
                mode="manager"
                onSubmitComplete={loadData}
                readOnly={isCompleted}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Team List View - Hierarchical Tree
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 pb-24">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="rounded-2xl border p-6" style={sectionStyles.card}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Building2 size={24} className="text-violet-500" />
                Team Reviews
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Review and develop your team's skills
              </p>
            </div>
            <div className="flex gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-zinc-900 dark:text-white">{stats.directCount}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Direct</p>
              </div>
              {stats.totalCount > stats.directCount && (
                <div>
                  <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{stats.totalCount}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Total</p>
                </div>
              )}
            </div>
          </div>

          {/* Cycle Info */}
          {cycle ? (
            <div className="mt-4 p-4 bg-violet-50 dark:bg-violet-900/20 rounded-xl">
              <div className="flex items-center gap-3">
                <Calendar className="text-violet-600 dark:text-violet-400" size={20} />
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-white">{cycle.name}</p>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Manager review due: {formatDate(cycle.manager_review_due_date)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 p-4 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center gap-3">
              <AlertCircle className="text-zinc-400" size={20} />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                No active review cycle. Create one in the Admin panel to start reviews.
              </p>
            </div>
          )}
        </div>

        {/* Team Status Summary */}
        {cycle && teamStatus.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Pending', statuses: ['pending'], color: '#71717A' },
              { label: 'Ready for Review', statuses: ['self_eval_complete'], color: '#F59E0B' },
              { label: 'In Progress', statuses: ['manager_review_complete', 'meeting_scheduled'], color: '#3B82F6' },
              { label: 'Completed', statuses: ['completed'], color: '#94AF32' }
            ].map(({ label, statuses, color }) => {
              const count = teamStatus.filter(s => statuses.includes(s.status)).length;
              return (
                <div key={label} className="rounded-xl border p-4 text-center" style={sectionStyles.card}>
                  <p className="text-2xl font-bold" style={{ color }}>{count}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Org Tree Legend */}
        <div className="flex items-center gap-4 px-2 text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-1.5">
            <UserCircle size={14} className="text-zinc-400" />
            <span>Direct Report</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users size={14} className="text-violet-500" />
            <span>Manager (click arrow to expand)</span>
          </div>
        </div>

        {/* Hierarchical Team List */}
        <div className="space-y-2">
          {orgTree.map(node => renderTreeNode(node, 0))}
        </div>
      </div>
    </div>
  );
};

export default TeamReviewsPage;
