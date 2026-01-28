/**
 * DevelopmentGoalsSection.js
 * Simplified component showing development goals as a checklist
 *
 * For employees: Shows their focus skills for the quarter (read-only)
 * For managers: Allows toggling skills as focus areas (checkboxes)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { careerDevelopmentService } from '../../services/careerDevelopmentService';
import { SkillRatingBadge } from './SkillRatingPicker';
import {
  Target,
  Loader2,
  GraduationCap,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

const DevelopmentGoalsSection = ({
  cycle,
  employeeId = null, // If null, use current user (employee viewing their own)
  isManager = false, // Manager view allows editing
  onGoalsChange,
  readOnly = false
}) => {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [skillsGrouped, setSkillsGrouped] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savingSkillId, setSavingSkillId] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});

  const targetUserId = employeeId || user?.id;
  const canEdit = isManager && !readOnly;

  // Load goals and skills
  const loadData = useCallback(async () => {
    if (!targetUserId || !cycle?.id) return;

    try {
      setLoading(true);
      setError(null);

      const [goalsData, skillsData] = await Promise.all([
        careerDevelopmentService.getGoals(targetUserId, cycle.id),
        careerDevelopmentService.getAllSkillsGrouped()
      ]);

      setGoals(goalsData);
      setSkillsGrouped(skillsData);

      // Auto-expand categories that have goals
      const goalSkillIds = new Set(goalsData.map(g => g.skill_id));
      const catsWithGoals = {};
      Object.entries(skillsData).forEach(([cat, data]) => {
        if (data.skills.some(s => goalSkillIds.has(s.id))) {
          catsWithGoals[cat] = true;
        }
      });
      setExpandedCategories(catsWithGoals);
    } catch (err) {
      console.error('[DevelopmentGoalsSection] Load error:', err);
      setError('Failed to load goals');
    } finally {
      setLoading(false);
    }
  }, [targetUserId, cycle?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Get goal for a skill (if exists)
  const getGoalForSkill = (skillId) => {
    return goals.find(g => g.skill_id === skillId);
  };

  // Toggle a skill as a development goal
  const toggleGoal = async (skill) => {
    if (!canEdit || savingSkillId) return;

    const existingGoal = getGoalForSkill(skill.id);

    try {
      setSavingSkillId(skill.id);

      if (existingGoal) {
        // Remove the goal
        await careerDevelopmentService.removeGoal(existingGoal.id);
      } else {
        // Check if we're at max (allow more than 5 but warn)
        if (goals.length >= 10) {
          setError('Maximum of 10 development goals reached');
          return;
        }

        // Add as a goal with next priority
        const nextPriority = goals.length + 1;
        await careerDevelopmentService.setGoal(
          cycle.id,
          targetUserId,
          skill.id,
          nextPriority > 5 ? 5 : nextPriority, // Cap priority at 5 for DB constraint
          'proficient', // Default target level
          null, // No action plan needed
          user?.id, // Manager who set it
          user?.id  // Created by
        );
      }

      // Reload goals
      await loadData();
      if (onGoalsChange) onGoalsChange();
    } catch (err) {
      console.error('[DevelopmentGoalsSection] Toggle goal error:', err);
      setError(err.message || 'Failed to update goal');
    } finally {
      setSavingSkillId(null);
    }
  };

  // Toggle category expansion
  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="animate-spin text-violet-500" size={24} />
        <span className="ml-2 text-zinc-500 dark:text-zinc-400">Loading goals...</span>
      </div>
    );
  }

  // Employee view: Just show their goals as a list
  if (!isManager) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
              <Target size={20} className="text-violet-500" />
              Development Focus
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Skills your manager has highlighted for focus this quarter
            </p>
          </div>
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            {goals.length} skill{goals.length !== 1 ? 's' : ''}
          </span>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {goals.length > 0 ? (
          <div className="space-y-2">
            {goals.map((goal) => {
              const skill = goal.skill;
              const trainingUrls = skill?.training_urls || [];

              return (
                <div
                  key={goal.id}
                  className="flex items-center justify-between p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-200 dark:border-violet-700"
                >
                  <div className="flex items-center gap-3">
                    <CheckSquare size={20} className="text-violet-600 dark:text-violet-400" />
                    <div>
                      <p className="font-medium text-zinc-900 dark:text-white">
                        {skill?.name}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        {skill?.category}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <SkillRatingBadge rating={goal.current_level || 'none'} size="sm" />
                    {trainingUrls.length > 0 && (
                      <a
                        href={trainingUrls[0]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-800/30 text-violet-600 dark:text-violet-400 min-h-[44px] min-w-[44px] flex items-center justify-center"
                        title="Open training"
                      >
                        <GraduationCap size={20} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
            <Target size={40} className="mx-auto mb-2 opacity-50" />
            <p>No development goals set for this quarter</p>
            <p className="text-sm mt-1">Your manager will select focus skills during your review</p>
          </div>
        )}
      </div>
    );
  }

  // Manager view: Checkboxes to toggle skills as goals
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Target size={20} className="text-violet-500" />
            Development Goals
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {canEdit
              ? 'Select skills for this employee to focus on this quarter'
              : 'Skills selected for focus this quarter'
            }
          </p>
        </div>
        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          {goals.length} selected
        </span>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-xs text-red-600 underline mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Skills grouped by category with checkboxes */}
      <div className="space-y-2">
        {Object.entries(skillsGrouped).map(([category, data]) => {
          const isExpanded = expandedCategories[category];
          const categoryGoalsCount = data.skills.filter(s => getGoalForSkill(s.id)).length;

          return (
            <div key={category} className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-750 transition-colors min-h-[44px]"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown size={18} className="text-zinc-400" />
                  ) : (
                    <ChevronRight size={18} className="text-zinc-400" />
                  )}
                  <span
                    className="font-medium"
                    style={{ color: data.info?.color || '#6B7280' }}
                  >
                    {data.info?.label || category}
                  </span>
                </div>
                {categoryGoalsCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400">
                    {categoryGoalsCount} selected
                  </span>
                )}
              </button>

              {/* Skills List */}
              {isExpanded && (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-700">
                  {data.skills.map((skill) => {
                    const goal = getGoalForSkill(skill.id);
                    const isSelected = !!goal;
                    const isSaving = savingSkillId === skill.id;
                    const trainingUrls = skill.training_urls || [];

                    return (
                      <div
                        key={skill.id}
                        className={`
                          flex items-center justify-between p-3
                          ${isSelected ? 'bg-violet-50/50 dark:bg-violet-900/10' : ''}
                        `}
                      >
                        <div className="flex items-center gap-3">
                          {canEdit ? (
                            <button
                              onClick={() => toggleGoal(skill)}
                              disabled={isSaving}
                              className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
                            >
                              {isSaving ? (
                                <Loader2 className="animate-spin text-violet-500" size={20} />
                              ) : isSelected ? (
                                <CheckSquare size={20} className="text-violet-600 dark:text-violet-400" />
                              ) : (
                                <Square size={20} className="text-zinc-400 dark:text-zinc-500" />
                              )}
                            </button>
                          ) : (
                            <div className="p-1">
                              {isSelected ? (
                                <CheckSquare size={20} className="text-violet-600 dark:text-violet-400" />
                              ) : (
                                <Square size={20} className="text-zinc-300 dark:text-zinc-600" />
                              )}
                            </div>
                          )}
                          <span className={`
                            ${isSelected
                              ? 'font-medium text-zinc-900 dark:text-white'
                              : 'text-zinc-600 dark:text-zinc-400'
                            }
                          `}>
                            {skill.name}
                          </span>
                        </div>

                        {trainingUrls.length > 0 && (
                          <a
                            href={trainingUrls[0]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-violet-600 dark:text-violet-400 min-h-[44px] min-w-[44px] flex items-center justify-center"
                            title="Open training"
                          >
                            <GraduationCap size={18} />
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected Goals Summary */}
      {goals.length > 0 && (
        <div className="mt-4 p-4 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-200 dark:border-violet-700">
          <p className="text-sm font-medium text-violet-700 dark:text-violet-400 mb-2">
            Selected Development Goals ({goals.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {goals.map((goal) => (
              <span
                key={goal.id}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-zinc-800 text-sm text-zinc-700 dark:text-zinc-300 border border-violet-200 dark:border-violet-700"
              >
                <CheckSquare size={14} className="text-violet-500" />
                {goal.skill?.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default DevelopmentGoalsSection;
