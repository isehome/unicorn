/**
 * CareerDevelopmentPage.js
 * Main page for employees to view their career development and complete self-evaluations
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { careerDevelopmentService } from '../services/careerDevelopmentService';
import { enhancedStyles } from '../styles/styleSystem';
import SelfEvaluationForm from '../components/CareerDevelopment/SelfEvaluationForm';
import DevelopmentGoalsSection from '../components/CareerDevelopment/DevelopmentGoalsSection';
import { SkillRatingBadge } from '../components/CareerDevelopment/SkillRatingPicker';
import {
  Target,
  ClipboardCheck,
  History,
  Calendar,
  User,
  AlertCircle,
  Loader2,
  ChevronRight,
  ExternalLink,
  Clock,
  CheckCircle,
  ArrowRight
} from 'lucide-react';

const TABS = [
  { id: 'self-eval', label: 'Self-Evaluation', icon: ClipboardCheck },
  { id: 'goals', label: 'Development Goals', icon: Target },
  { id: 'history', label: 'Review History', icon: History }
];

const CareerDevelopmentPage = () => {
  const { user } = useAuth();
  const { mode } = useTheme();
  const { publishState, registerActions, unregisterActions } = useAppState();
  const sectionStyles = enhancedStyles.sections[mode];

  const [activeTab, setActiveTab] = useState('self-eval');
  const [cycle, setCycle] = useState(null);
  const [session, setSession] = useState(null);
  const [manager, setManager] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load initial data
  const loadData = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setError(null);

      // Load current cycle, session, and manager
      const [cycleData, managerData] = await Promise.all([
        careerDevelopmentService.getCurrentCycle(),
        careerDevelopmentService.getMyManager(user.id)
      ]);

      setCycle(cycleData);
      setManager(managerData);

      // Load session if cycle exists
      if (cycleData) {
        const sessionData = await careerDevelopmentService.getSession(cycleData.id, user.id);
        setSession(sessionData);
      }

    } catch (err) {
      console.error('[CareerDevelopmentPage] Load error:', err);
      setError('Failed to load career development data');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load history when tab changes
  useEffect(() => {
    const loadHistory = async () => {
      if (activeTab === 'history' && user?.id) {
        try {
          const historyData = await careerDevelopmentService.getReviewHistory(user.id);
          setHistory(historyData);
        } catch (err) {
          console.error('[CareerDevelopmentPage] History error:', err);
        }
      }
    };
    loadHistory();
  }, [activeTab, user?.id]);

  // AI Voice Copilot integration
  useEffect(() => {
    publishState({
      view: 'career-development',
      activeTab,
      cycle: cycle ? {
        name: cycle.name,
        status: cycle.status,
        selfEvalDue: cycle.self_eval_due_date,
        managerReviewDue: cycle.manager_review_due_date
      } : null,
      session: session ? {
        status: session.status,
        selfEvalSubmitted: !!session.self_eval_submitted_at,
        managerReviewSubmitted: !!session.manager_review_submitted_at
      } : null,
      manager: manager?.full_name,
      hint: 'Career Development page. Employee can complete self-evaluations, manage development goals, and view review history.'
    });
  }, [publishState, activeTab, cycle, session, manager]);

  // Register AI actions
  useEffect(() => {
    const actions = {
      switch_tab: async ({ tab }) => {
        const validTabs = TABS.map(t => t.id);
        if (validTabs.includes(tab)) {
          setActiveTab(tab);
          return { success: true, message: `Switched to ${tab} tab` };
        }
        return { success: false, error: `Invalid tab. Options: ${validTabs.join(', ')}` };
      },
      refresh_data: async () => {
        await loadData();
        return { success: true, message: 'Data refreshed' };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, loadData]);

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#94AF32';
      case 'manager_review_complete':
      case 'meeting_scheduled': return '#3B82F6';
      case 'self_eval_complete': return '#F59E0B';
      default: return '#71717A';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return 'Pending';
      case 'self_eval_complete': return 'Self-Eval Complete';
      case 'manager_review_complete': return 'Manager Review Complete';
      case 'meeting_scheduled': return 'Meeting Scheduled';
      case 'completed': return 'Completed';
      default: return status;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-violet-500" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 pb-24">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header Card */}
        <div className="rounded-2xl border p-6" style={sectionStyles.card}>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-white">
                Career Development
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Track your skills, set goals, and grow your career
              </p>
            </div>
            {manager && (
              <div className="text-right">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Your Manager</p>
                <p className="text-sm font-medium text-zinc-900 dark:text-white">
                  {manager.full_name}
                </p>
              </div>
            )}
          </div>

          {/* Current Cycle Info */}
          {cycle ? (
            <div className="mt-4 p-4 bg-violet-50 dark:bg-violet-900/20 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Calendar className="text-violet-600 dark:text-violet-400" size={20} />
                  <div>
                    <p className="font-semibold text-zinc-900 dark:text-white">{cycle.name} Review</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      {formatDate(cycle.start_date)} - {formatDate(cycle.end_date)}
                    </p>
                  </div>
                </div>
                <div
                  className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{ backgroundColor: `${getStatusColor(session?.status || 'pending')}20`, color: getStatusColor(session?.status || 'pending') }}
                >
                  {getStatusLabel(session?.status || 'pending')}
                </div>
              </div>

              {/* Due Dates */}
              <div className="flex gap-6 mt-3 text-sm">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-amber-500" />
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Self-eval due: <strong className="text-zinc-900 dark:text-white">{formatDate(cycle.self_eval_due_date)}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-blue-500" />
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Review due: <strong className="text-zinc-900 dark:text-white">{formatDate(cycle.manager_review_due_date)}</strong>
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 p-4 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center gap-3">
              <AlertCircle className="text-zinc-400" size={20} />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                No active review cycle. Your manager will create one when it's time for quarterly reviews.
              </p>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-2.5 rounded-xl whitespace-nowrap
                  min-h-[44px] transition-all font-medium text-sm
                  ${isActive
                    ? 'bg-violet-500 text-white'
                    : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:border-violet-300 dark:hover:border-violet-600'
                  }
                `}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="rounded-2xl border p-6" style={sectionStyles.card}>
          {/* Self-Evaluation Tab */}
          {activeTab === 'self-eval' && (
            cycle ? (
              <SelfEvaluationForm
                cycle={cycle}
                onSubmitComplete={loadData}
                readOnly={cycle.status === 'completed'}
              />
            ) : (
              <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
                <ClipboardCheck size={48} className="mx-auto mb-3 opacity-50" />
                <p>Self-evaluation will be available when a review cycle is active</p>
              </div>
            )
          )}

          {/* Development Goals Tab */}
          {activeTab === 'goals' && (
            cycle ? (
              <DevelopmentGoalsSection
                cycle={cycle}
                onGoalsChange={loadData}
              />
            ) : (
              <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
                <Target size={48} className="mx-auto mb-3 opacity-50" />
                <p>Development goals will be available when a review cycle is active</p>
              </div>
            )
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
                <History size={20} className="text-violet-500" />
                Review History
              </h3>

              {history.length > 0 ? (
                <div className="space-y-3">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-zinc-900 dark:text-white">
                            {item.skill?.name}
                          </p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {item.source_type === 'self_evaluation' && 'Self-evaluation'}
                            {item.source_type === 'manager_review' && 'Manager review'}
                            {item.source_type === 'official_update' && 'Official update'}
                            {item.source_type === 'goal_achieved' && 'Goal achieved'}
                            {' • '}
                            {item.review_cycle?.name || formatDate(item.created_at)}
                          </p>
                        </div>
                        <span className="text-xs text-zinc-400">
                          {formatDate(item.created_at)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-2">
                        <SkillRatingBadge rating={item.old_rating || 'none'} size="sm" />
                        <ArrowRight size={14} className="text-zinc-400" />
                        <SkillRatingBadge rating={item.new_rating || 'none'} size="sm" />
                      </div>

                      {item.changed_by_name && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2">
                          Changed by {item.changed_by_name}
                        </p>
                      )}

                      {item.change_notes && (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2 italic">
                          "{item.change_notes}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-zinc-500 dark:text-zinc-400">
                  <History size={48} className="mx-auto mb-3 opacity-50" />
                  <p>No review history yet</p>
                  <p className="text-sm mt-1">Your skill changes will appear here after reviews</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CareerDevelopmentPage;
