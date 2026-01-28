/**
 * CareerDevelopmentPage.js
 *
 * Simple single-page career development interface for employees.
 * Shows the skills review panel where employees can:
 * - View their current skill ratings
 * - Make changes for their quarterly self-evaluation
 * - Submit when ready, which notifies their manager
 *
 * Quarter navigation in header allows viewing past reviews.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useAppState } from '../contexts/AppStateContext';
import { careerDevelopmentService } from '../services/careerDevelopmentService';
import { enhancedStyles } from '../styles/styleSystem';
import SkillReviewPanel from '../components/CareerDevelopment/SkillReviewPanel';
import TechnicianAvatar from '../components/TechnicianAvatar';
import {
  Calendar,
  AlertCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Clock,
  User
} from 'lucide-react';

const CareerDevelopmentPage = () => {
  const { user } = useAuth();
  const { mode } = useTheme();
  const { publishState, registerActions, unregisterActions } = useAppState();
  const sectionStyles = enhancedStyles.sections[mode];

  const [allCycles, setAllCycles] = useState([]);
  const [currentCycleIndex, setCurrentCycleIndex] = useState(0);
  const [cycle, setCycle] = useState(null);
  const [manager, setManager] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load initial data
  const loadData = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setError(null);

      const [cyclesData, managerData] = await Promise.all([
        careerDevelopmentService.getAllCycles(),
        careerDevelopmentService.getMyManager(user.id)
      ]);

      // Filter to relevant cycles
      const relevantCycles = (cyclesData || []).filter(c =>
        ['self_eval', 'manager_review', 'completed'].includes(c.status)
      );

      setAllCycles(relevantCycles);
      setManager(managerData);

      if (relevantCycles.length > 0) {
        setCycle(relevantCycles[0]);
        setCurrentCycleIndex(0);
      }

    } catch (err) {
      console.error('[CareerDevelopmentPage] Load error:', err);
      setError('Failed to load career development data');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Navigate between quarters
  const navigateCycle = useCallback((direction) => {
    const newIndex = currentCycleIndex + direction;
    if (newIndex < 0 || newIndex >= allCycles.length) return;

    setCurrentCycleIndex(newIndex);
    setCycle(allCycles[newIndex]);
  }, [currentCycleIndex, allCycles]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // AI Voice Copilot integration
  useEffect(() => {
    publishState({
      view: 'career-development',
      cycle: cycle ? { name: cycle.name, status: cycle.status } : null,
      manager: manager?.full_name,
      hint: 'Career Development - self-evaluation page'
    });
  }, [publishState, cycle, manager]);

  useEffect(() => {
    const actions = {
      navigate_quarter: async ({ direction }) => {
        navigateCycle(direction === 'previous' ? 1 : -1);
        return { success: true };
      },
      refresh_data: async () => {
        await loadData();
        return { success: true };
      }
    };
    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, navigateCycle, loadData]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  const isViewingPastCycle = currentCycleIndex > 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
        <Loader2 className="animate-spin text-violet-500" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 pb-24">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="rounded-2xl border p-6" style={sectionStyles.card}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-white">
                Career Development
              </h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                Review and update your skill ratings
              </p>
            </div>

            {manager && (
              <div className="flex items-center gap-2 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
                <TechnicianAvatar name={manager.full_name} color={manager.avatar_color} size="sm" />
                <div className="text-right">
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Your Manager</p>
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">{manager.full_name}</p>
                </div>
              </div>
            )}
          </div>

          {/* Quarter Navigation */}
          {cycle ? (
            <div className="p-4 bg-violet-50 dark:bg-violet-900/20 rounded-xl">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => navigateCycle(1)}
                  disabled={currentCycleIndex >= allCycles.length - 1}
                  className={`p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center
                    ${currentCycleIndex >= allCycles.length - 1
                      ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                      : 'text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-800/30'
                    }`}
                  title="Previous quarter"
                >
                  <ChevronLeft size={24} />
                </button>

                <div className="flex items-center gap-3 flex-1 justify-center">
                  <Calendar className="text-violet-600 dark:text-violet-400" size={20} />
                  <div className="text-center">
                    <p className="font-semibold text-zinc-900 dark:text-white">{cycle.name}</p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      {formatDate(cycle.start_date)} - {formatDate(cycle.end_date)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => navigateCycle(-1)}
                  disabled={currentCycleIndex <= 0}
                  className={`p-2 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center
                    ${currentCycleIndex <= 0
                      ? 'text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
                      : 'text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-800/30'
                    }`}
                  title="Next quarter"
                >
                  <ChevronRight size={24} />
                </button>
              </div>

              {/* Due dates for current cycle */}
              {!isViewingPastCycle && cycle.status !== 'completed' && (
                <div className="flex flex-wrap justify-center gap-4 text-sm pt-3 mt-3 border-t border-violet-200 dark:border-violet-700">
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-amber-500" />
                    <span className="text-zinc-600 dark:text-zinc-400">
                      Self-eval due: <strong className="text-zinc-900 dark:text-white">{formatDate(cycle.self_eval_due_date)}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-blue-500" />
                    <span className="text-zinc-600 dark:text-zinc-400">
                      Review due: <strong className="text-zinc-900 dark:text-white">{formatDate(cycle.manager_review_due_date)}</strong>
                    </span>
                  </div>
                </div>
              )}

              {isViewingPastCycle && (
                <div className="text-center text-sm text-zinc-500 dark:text-zinc-400 pt-3 mt-3 border-t border-violet-200 dark:border-violet-700">
                  Viewing past review (read-only)
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 bg-zinc-100 dark:bg-zinc-800 rounded-xl flex items-center gap-3">
              <AlertCircle className="text-zinc-400" size={20} />
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                No active review cycle. Your manager will create one when it's time for quarterly reviews.
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Skill Review Panel - Main Content */}
        {cycle && (
          <div className="rounded-2xl border p-6" style={sectionStyles.card}>
            <SkillReviewPanel
              cycle={cycle}
              mode="self"
              onSubmitComplete={loadData}
              readOnly={cycle.status === 'completed' || isViewingPastCycle}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default CareerDevelopmentPage;
