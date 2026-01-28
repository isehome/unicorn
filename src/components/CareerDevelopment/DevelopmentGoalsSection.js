/**
 * DevelopmentGoalsSection.js
 * Component to display and manage development goals (5 focus skills per quarter)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { careerDevelopmentService } from '../../services/careerDevelopmentService';
import { SkillRatingBadge, getRatingLevel } from './SkillRatingPicker';
import {
  Target,
  Plus,
  Trash2,
  ExternalLink,
  ChevronRight,
  Loader2,
  CheckCircle,
  Edit2,
  X,
  ArrowRight,
  GraduationCap
} from 'lucide-react';

const DevelopmentGoalsSection = ({
  cycle,
  employeeId = null, // If null, use current user
  isManager = false, // Manager view allows editing
  onGoalsChange
}) => {
  const { user } = useAuth();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addingGoal, setAddingGoal] = useState(false);
  const [skillsGrouped, setSkillsGrouped] = useState({});
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [targetLevel, setTargetLevel] = useState('proficient');
  const [actionPlan, setActionPlan] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);

  const targetUserId = employeeId || user?.id;

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

  // Add a new goal
  const handleAddGoal = async () => {
    if (!selectedSkill || !targetLevel) return;

    try {
      setSavingGoal(true);

      // Find next available priority
      const usedPriorities = goals.map(g => g.priority);
      let nextPriority = 1;
      while (usedPriorities.includes(nextPriority) && nextPriority <= 5) {
        nextPriority++;
      }

      if (nextPriority > 5) {
        setError('Maximum 5 goals allowed');
        return;
      }

      await careerDevelopmentService.setGoal(
        cycle.id,
        targetUserId,
        selectedSkill.id,
        nextPriority,
        targetLevel,
        actionPlan,
        isManager ? user?.id : null,
        user?.id
      );

      // Reset form
      setSelectedSkill(null);
      setTargetLevel('proficient');
      setActionPlan('');
      setAddingGoal(false);

      // Reload goals
      await loadData();

      if (onGoalsChange) onGoalsChange();
    } catch (err) {
      console.error('[DevelopmentGoalsSection] Add goal error:', err);
      setError(err.message || 'Failed to add goal');
    } finally {
      setSavingGoal(false);
    }
  };

  // Remove a goal
  const handleRemoveGoal = async (goalId) => {
    if (!confirm('Remove this development goal?')) return;

    try {
      await careerDevelopmentService.removeGoal(goalId);
      await loadData();
      if (onGoalsChange) onGoalsChange();
    } catch (err) {
      console.error('[DevelopmentGoalsSection] Remove goal error:', err);
      setError('Failed to remove goal');
    }
  };

  // Mark goal as achieved
  const handleMarkAchieved = async (goalId, achievedLevel) => {
    try {
      await careerDevelopmentService.updateGoalProgress(goalId, null, true, achievedLevel);
      await loadData();
      if (onGoalsChange) onGoalsChange();
    } catch (err) {
      console.error('[DevelopmentGoalsSection] Mark achieved error:', err);
      setError('Failed to update goal');
    }
  };

  // Get skills not already in goals
  const availableSkills = Object.entries(skillsGrouped).reduce((acc, [category, data]) => {
    const usedSkillIds = goals.map(g => g.skill_id);
    const available = (data.skills || []).filter(s => !usedSkillIds.includes(s.id));
    if (available.length > 0) {
      acc[category] = { ...data, skills: available };
    }
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="animate-spin text-violet-500" size={24} />
        <span className="ml-2 text-zinc-500 dark:text-zinc-400">Loading goals...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white flex items-center gap-2">
            <Target size={20} className="text-violet-500" />
            Development Goals
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Focus on up to 5 skills this quarter
          </p>
        </div>
        <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
          {goals.length} / 5 goals
        </span>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Goals List */}
      <div className="space-y-3">
        {goals.map((goal, index) => {
          const skill = goal.skill;
          const trainingUrls = skill?.training_urls || [];
          const currentLevel = getRatingLevel(goal.current_level);
          const targetLevelInfo = getRatingLevel(goal.target_level);
          const isAchieved = !!goal.achieved_at;

          return (
            <div
              key={goal.id}
              className={`
                bg-white dark:bg-zinc-800 rounded-xl border
                ${isAchieved
                  ? 'border-green-300 dark:border-green-700'
                  : 'border-zinc-200 dark:border-zinc-700'
                }
                p-4
              `}
            >
              <div className="flex items-start gap-4">
                {/* Priority Badge */}
                <div
                  className={`
                    w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm
                    ${isAchieved
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'
                    }
                  `}
                >
                  {isAchieved ? <CheckCircle size={18} /> : goal.priority}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold text-zinc-900 dark:text-white">
                        {skill?.name}
                      </h4>
                      {skill?.class && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {skill.class.label}
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {trainingUrls.length > 0 && (
                        <a
                          href={trainingUrls[0]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-violet-600 dark:text-violet-400"
                          title="Open training"
                        >
                          <GraduationCap size={18} />
                        </a>
                      )}
                      {!isAchieved && (isManager || targetUserId === user?.id) && (
                        <button
                          onClick={() => handleRemoveGoal(goal.id)}
                          className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500"
                          title="Remove goal"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Level Progress */}
                  <div className="flex items-center gap-2 mt-2">
                    <SkillRatingBadge rating={goal.current_level || 'none'} size="sm" />
                    <ArrowRight size={16} className="text-zinc-400" />
                    <SkillRatingBadge rating={goal.target_level} size="sm" />
                    {isAchieved && (
                      <span
                        className="ml-2 text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(148, 175, 50, 0.15)', color: '#94AF32' }}
                      >
                        Achieved!
                      </span>
                    )}
                  </div>

                  {/* Action Plan */}
                  {goal.action_plan && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
                      {goal.action_plan}
                    </p>
                  )}

                  {/* Training Links */}
                  {trainingUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {trainingUrls.map((url, i) => (
                        <a
                          key={i}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:underline"
                        >
                          <ExternalLink size={12} />
                          Training {trainingUrls.length > 1 ? i + 1 : ''}
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Agreement Status */}
                  <div className="flex items-center gap-4 mt-3 text-xs">
                    <span className={goal.employee_agreed_at ? 'text-green-600 dark:text-green-400' : 'text-zinc-400'}>
                      {goal.employee_agreed_at ? '✓ Employee agreed' : '○ Pending employee'}
                    </span>
                    <span className={goal.manager_agreed_at ? 'text-green-600 dark:text-green-400' : 'text-zinc-400'}>
                      {goal.manager_agreed_at ? '✓ Manager agreed' : '○ Pending manager'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {goals.length === 0 && (
          <div className="text-center py-8 text-zinc-500 dark:text-zinc-400">
            <Target size={40} className="mx-auto mb-2 opacity-50" />
            <p>No development goals set for this quarter</p>
          </div>
        )}
      </div>

      {/* Add Goal Button */}
      {goals.length < 5 && !addingGoal && (isManager || targetUserId === user?.id) && (
        <button
          type="button"
          onClick={() => setAddingGoal(true)}
          className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
        >
          <Plus size={20} />
          Add Development Goal
        </button>
      )}

      {/* Add Goal Form */}
      {addingGoal && (
        <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-zinc-900 dark:text-white">Add Development Goal</h4>
            <button
              onClick={() => {
                setAddingGoal(false);
                setSelectedSkill(null);
              }}
              className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              <X size={20} className="text-zinc-500" />
            </button>
          </div>

          {/* Skill Selection */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Select Skill to Focus On
            </label>
            {selectedSkill ? (
              <div className="flex items-center justify-between p-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-200 dark:border-violet-700">
                <div>
                  <p className="font-medium text-zinc-900 dark:text-white">{selectedSkill.name}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{selectedSkill.category}</p>
                </div>
                <button
                  onClick={() => setSelectedSkill(null)}
                  className="text-violet-600 dark:text-violet-400 text-sm"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto border border-zinc-200 dark:border-zinc-700 rounded-lg divide-y divide-zinc-100 dark:divide-zinc-700">
                {Object.entries(availableSkills).map(([category, data]) => (
                  <div key={category}>
                    <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-750 text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider">
                      {data.info?.label || category}
                    </div>
                    {data.skills.map(skill => (
                      <button
                        key={skill.id}
                        onClick={() => setSelectedSkill(skill)}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 flex items-center justify-between group"
                      >
                        <span className="text-zinc-900 dark:text-white">{skill.name}</span>
                        <ChevronRight size={16} className="text-zinc-400 opacity-0 group-hover:opacity-100" />
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Target Level */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Target Level
            </label>
            <div className="flex gap-2">
              {['training', 'proficient', 'expert'].map(level => {
                const levelInfo = getRatingLevel(level);
                const isSelected = targetLevel === level;
                return (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setTargetLevel(level)}
                    className={`
                      flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all
                      ${isSelected
                        ? `${levelInfo.bgClass} ${levelInfo.textClass}`
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                      }
                    `}
                    style={isSelected ? { borderColor: levelInfo.color } : {}}
                  >
                    {levelInfo.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Plan */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
              Action Plan (optional)
            </label>
            <textarea
              value={actionPlan}
              onChange={(e) => setActionPlan(e.target.value)}
              placeholder="Describe steps to achieve this goal..."
              className="w-full h-20 p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 resize-none"
              style={{ fontSize: '16px' }}
            />
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setAddingGoal(false);
                setSelectedSkill(null);
                setActionPlan('');
              }}
              className="px-4 py-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddGoal}
              disabled={!selectedSkill || savingGoal}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg font-medium
                ${selectedSkill
                  ? 'bg-violet-500 hover:bg-violet-600 text-white'
                  : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed'
                }
              `}
            >
              {savingGoal ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  Saving...
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Add Goal
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DevelopmentGoalsSection;
