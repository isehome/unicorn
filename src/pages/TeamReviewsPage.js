/**
 * TeamReviewsPage.js
 * Manager view for reviewing direct reports' skills and conducting quarterly reviews
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { careerDevelopmentService } from '../services/careerDevelopmentService';
import { enhancedStyles } from '../styles/styleSystem';
import SkillComparisonView from '../components/CareerDevelopment/SkillComparisonView';
import DevelopmentGoalsSection from '../components/CareerDevelopment/DevelopmentGoalsSection';
import TechnicianAvatar from '../components/TechnicianAvatar';
import {
  Users,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader2,
  ChevronRight,
  Send,
  FileCheck,
  Star,
  ArrowLeft,
  CalendarCheck
} from 'lucide-react';

const TeamReviewsPage = () => {
  const { user } = useAuth();
  const { mode } = useTheme();
  const { publishState, registerActions, unregisterActions } = useAppState();
  const sectionStyles = enhancedStyles.sections[mode];

  const [cycle, setCycle] = useState(null);
  const [reports, setReports] = useState([]);
  const [teamStatus, setTeamStatus] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('comparison'); // 'comparison' | 'goals'

  // Load initial data
  const loadData = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setError(null);

      // Load current cycle and direct reports
      const [cycleData, reportsData] = await Promise.all([
        careerDevelopmentService.getCurrentCycle(),
        careerDevelopmentService.getMyReports(user.id)
      ]);

      setCycle(cycleData);
      setReports(reportsData);

      // Load team status if cycle exists
      if (cycleData) {
        const statusData = await careerDevelopmentService.getTeamReviewStatus(user.id, cycleData.id);
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
        const session = await careerDevelopmentService.getSession(cycle.id, selectedEmployee.id);
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
      cycle: cycle ? {
        name: cycle.name,
        status: cycle.status
      } : null,
      teamSize: reports.length,
      selectedEmployee: selectedEmployee?.full_name,
      hint: 'Team Reviews page for managers. View and review direct reports\' skill evaluations.'
    });
  }, [publishState, cycle, reports.length, selectedEmployee]);

  // Register AI actions
  useEffect(() => {
    const actions = {
      select_employee: async ({ name }) => {
        const employee = reports.find(r =>
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
        return { success: true, message: 'Returned to team list' };
      },
      refresh_data: async () => {
        await loadData();
        return { success: true, message: 'Data refreshed' };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, reports, loadData]);

  // Submit manager reviews for an employee
  const handleSubmitReviews = async () => {
    if (!selectedEmployee || !cycle) return;

    try {
      setSubmitting(true);
      await careerDevelopmentService.submitManagerReviews(
        cycle.id,
        selectedEmployee.id,
        user.id
      );
      await loadData();
      // Reload session
      const session = await careerDevelopmentService.getSession(cycle.id, selectedEmployee.id);
      setSelectedSession(session);
    } catch (err) {
      console.error('[TeamReviewsPage] Submit error:', err);
      setError('Failed to submit reviews');
    } finally {
      setSubmitting(false);
    }
  };

  // Finalize review (update official employee_skills)
  const handleFinalizeReview = async () => {
    if (!selectedSession) return;

    const confirmed = confirm(
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
      // Reload session
      const session = await careerDevelopmentService.getSession(cycle.id, selectedEmployee.id);
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
    const status = teamStatus.find(s => s.employee?.id === employeeId);
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

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-violet-500" size={40} />
      </div>
    );
  }

  // No direct reports
  if (reports.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 pb-24">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="rounded-2xl border p-8 text-center" style={sectionStyles.card}>
            <Users size={48} className="mx-auto mb-4 text-zinc-400" />
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">
              No Direct Reports
            </h2>
            <p className="text-zinc-500 dark:text-zinc-400">
              You don't have any team members assigned to you yet.
              Contact your administrator to set up reporting relationships.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Employee Detail View
  if (selectedEmployee) {
    const statusInfo = getStatusInfo(selectedEmployee.id);
    const StatusIcon = statusInfo.icon;
    const canSubmit = selectedSession?.status === 'self_eval_complete';
    const canFinalize = selectedSession?.status === 'manager_review_complete';
    const isCompleted = selectedSession?.status === 'completed';

    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 pb-24">
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          {/* Back Button & Header */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedEmployee(null)}
              className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
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
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <p className="text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('comparison')}
              className={`
                px-4 py-2.5 rounded-xl font-medium text-sm min-h-[44px] transition-all
                ${activeTab === 'comparison'
                  ? 'bg-violet-500 text-white'
                  : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700'
                }
              `}
            >
              Skill Comparison
            </button>
            <button
              onClick={() => setActiveTab('goals')}
              className={`
                px-4 py-2.5 rounded-xl font-medium text-sm min-h-[44px] transition-all
                ${activeTab === 'goals'
                  ? 'bg-violet-500 text-white'
                  : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700'
                }
              `}
            >
              Development Goals
            </button>
          </div>

          {/* Tab Content */}
          <div className="rounded-2xl border p-6" style={sectionStyles.card}>
            {activeTab === 'comparison' && cycle && (
              <SkillComparisonView
                cycle={cycle}
                employeeId={selectedEmployee.id}
                managerId={user.id}
                onReviewChange={loadData}
                readOnly={isCompleted}
              />
            )}

            {activeTab === 'goals' && cycle && (
              <DevelopmentGoalsSection
                cycle={cycle}
                employeeId={selectedEmployee.id}
                isManager={true}
                onGoalsChange={loadData}
              />
            )}
          </div>

          {/* Action Buttons */}
          {!isCompleted && (
            <div className="flex justify-end gap-3">
              {canSubmit && (
                <button
                  onClick={handleSubmitReviews}
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-semibold min-h-[48px] disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      Submit Reviews
                    </>
                  )}
                </button>
              )}

              {canFinalize && (
                <button
                  onClick={handleFinalizeReview}
                  disabled={finalizing}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold min-h-[48px] disabled:opacity-50"
                  style={{ backgroundColor: '#94AF32', color: 'white' }}
                >
                  {finalizing ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      Finalizing...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={18} />
                      Finalize Review
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Team List View
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 pb-24">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="rounded-2xl border p-6" style={sectionStyles.card}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Users size={24} className="text-violet-500" />
                Team Reviews
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Review and develop your team's skills
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-zinc-900 dark:text-white">{reports.length}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Direct Reports</p>
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
                <div
                  key={label}
                  className="rounded-xl border p-4 text-center"
                  style={sectionStyles.card}
                >
                  <p className="text-2xl font-bold" style={{ color }}>{count}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Team List */}
        <div className="space-y-3">
          {reports.map((employee) => {
            const statusInfo = getStatusInfo(employee.id);
            const StatusIcon = statusInfo.icon;
            const status = teamStatus.find(s => s.employee?.id === employee.id);

            return (
              <button
                key={employee.id}
                onClick={() => setSelectedEmployee(employee)}
                className="w-full rounded-2xl border p-4 text-left hover:border-violet-300 dark:hover:border-violet-600 transition-colors"
                style={sectionStyles.card}
              >
                <div className="flex items-center gap-4">
                  <TechnicianAvatar
                    name={employee.full_name}
                    color={employee.avatar_color}
                    size="md"
                  />

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-zinc-900 dark:text-white">
                      {employee.full_name}
                    </h3>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                      {employee.role?.charAt(0).toUpperCase() + employee.role?.slice(1)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Status Badge */}
                    <div
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                      style={{ backgroundColor: `${statusInfo.color}20`, color: statusInfo.color }}
                    >
                      <StatusIcon size={14} />
                      {statusInfo.label}
                    </div>

                    {/* Stats */}
                    {status && (
                      <div className="hidden md:flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                        <span>{status.selfEvalsCount} self-evals</span>
                        <span>{status.managerReviewsCount} reviewed</span>
                        <span>{status.goalsCount} goals</span>
                      </div>
                    )}

                    <ChevronRight size={20} className="text-zinc-400" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TeamReviewsPage;
