/**
 * SkillReviewPanel.js
 *
 * Simplified single-page skill review interface.
 *
 * For Employees (mode='self'):
 * - Shows all skills with their CURRENT official ratings (from last review)
 * - User edits ratings to create their self-evaluation
 * - Submit button sends email notification to manager
 *
 * For Managers (mode='manager'):
 * - Shows employee's self-rating alongside mirrored manager rating columns
 * - Highlights differences from last manager review (changes in yellow)
 * - Checkbox to mark skills as "Development Focus" (highlighted in violet)
 * - Training link visible for each skill
 * - Submit finalizes the review
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { careerDevelopmentService } from '../../services/careerDevelopmentService';
import SkillRatingPicker, { RATING_LEVELS } from './SkillRatingPicker';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Layers,
  ExternalLink,
  Send,
  CheckCircle,
  Target,
  GraduationCap,
  AlertTriangle
} from 'lucide-react';

const SkillReviewPanel = ({
  cycle,
  employeeId,
  managerId,
  mode = 'self', // 'self' = employee self-eval, 'manager' = manager review
  onSubmitComplete,
  readOnly = false
}) => {
  const { user } = useAuth();

  // Data state
  const [categories, setCategories] = useState([]);
  const [classes, setClasses] = useState([]);
  const [skills, setSkills] = useState([]);
  const [officialRatings, setOfficialRatings] = useState({}); // Current official ratings from employee_skills
  const [previousManagerRatings, setPreviousManagerRatings] = useState({}); // Last cycle's manager ratings
  const [selfEvaluations, setSelfEvaluations] = useState({});
  const [managerReviews, setManagerReviews] = useState({});
  const [developmentGoals, setDevelopmentGoals] = useState(new Set());

  // UI state
  const [expandedCategories, setExpandedCategories] = useState({});
  const [expandedClasses, setExpandedClasses] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Determine which employee ID to use
  const targetEmployeeId = employeeId || user?.id;
  const targetManagerId = managerId || user?.id;

  // Load all data
  const loadData = useCallback(async () => {
    if (!targetEmployeeId || !cycle?.id) return;

    try {
      setLoading(true);
      setError(null);

      // Load categories
      const { data: catData, error: catError } = await supabase
        .from('skill_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (catError) throw catError;
      setCategories(catData || []);

      // Expand all categories by default for simpler view
      const expanded = {};
      catData?.forEach(c => { expanded[c.id] = true; });
      setExpandedCategories(expanded);

      // Load classes
      const { data: classData, error: classError } = await supabase
        .from('skill_classes')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (!classError) {
        setClasses(classData || []);
        // Expand all classes by default
        const classExpanded = {};
        classData?.forEach(c => { classExpanded[c.id] = true; });
        setExpandedClasses(classExpanded);
      }

      // Load skills
      const { data: skillData, error: skillError } = await supabase
        .from('global_skills')
        .select('id, name, category, class_id, description, training_urls, sort_order')
        .eq('is_active', true)
        .order('sort_order');

      if (skillError) throw skillError;
      setSkills(skillData || []);

      // Load OFFICIAL current ratings (from employee_skills table)
      const { data: empSkills } = await supabase
        .from('employee_skills')
        .select('skill_id, proficiency_level')
        .eq('employee_id', targetEmployeeId);

      const officialMap = {};
      empSkills?.forEach(es => {
        officialMap[es.skill_id] = es.proficiency_level;
      });
      setOfficialRatings(officialMap);

      // Load self-evaluations for this cycle
      const selfEvals = await careerDevelopmentService.getSelfEvaluations(targetEmployeeId, cycle.id);
      const selfMap = {};
      let selfSubmitted = false;
      selfEvals.forEach(ev => {
        selfMap[ev.skill_id] = {
          rating: ev.self_rating,
          notes: ev.self_notes || '',
          submitted: !!ev.submitted_at
        };
        if (ev.submitted_at) selfSubmitted = true;
      });
      setSelfEvaluations(selfMap);

      // Load manager reviews for this cycle
      const managerRevs = await careerDevelopmentService.getManagerReviews(targetEmployeeId, cycle.id);
      const mgrMap = {};
      let mgrSubmitted = false;
      managerRevs.forEach(ev => {
        mgrMap[ev.skill_id] = {
          rating: ev.manager_rating,
          notes: ev.manager_notes || '',
          submitted: !!ev.submitted_at
        };
        if (ev.submitted_at) mgrSubmitted = true;
      });
      setManagerReviews(mgrMap);

      // Load development goals for this cycle
      const goals = await careerDevelopmentService.getGoals(targetEmployeeId, cycle.id);
      setDevelopmentGoals(new Set(goals.map(g => g.skill_id)));

      // Load previous cycle's manager ratings for comparison (for manager view)
      if (mode === 'manager') {
        const allCycles = await careerDevelopmentService.getAllCycles();
        const prevCycle = allCycles.find(c =>
          c.status === 'completed' &&
          (c.year < cycle.year || (c.year === cycle.year && c.quarter < cycle.quarter))
        );

        if (prevCycle) {
          const prevReviews = await careerDevelopmentService.getManagerReviews(targetEmployeeId, prevCycle.id);
          const prevMap = {};
          prevReviews.forEach(ev => {
            if (ev.submitted_at) {
              prevMap[ev.skill_id] = ev.manager_rating;
            }
          });
          setPreviousManagerRatings(prevMap);
        }
      }

      // Set submitted state based on mode
      if (mode === 'self') {
        setIsSubmitted(selfSubmitted);
      } else {
        setIsSubmitted(mgrSubmitted);
      }

    } catch (err) {
      console.error('[SkillReviewPanel] Load error:', err);
      setError('Failed to load skills. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [targetEmployeeId, cycle?.id, cycle?.year, cycle?.quarter, mode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Get classes for a category
  const getClassesForCategory = (categoryId) => {
    return classes.filter(c => c.category_id === categoryId);
  };

  // Get skills for a class
  const getSkillsForClass = (classId) => {
    return skills.filter(s => s.class_id === classId);
  };

  // Toggle expand
  const toggleCategory = (catId) => {
    setExpandedCategories(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  const toggleClass = (classId) => {
    setExpandedClasses(prev => ({ ...prev, [classId]: !prev[classId] }));
  };

  // Get the starting rating for a skill (official rating from last review)
  const getStartingRating = (skillId) => {
    return officialRatings[skillId] || 'none';
  };

  // Get current self rating (or starting rating if not yet evaluated)
  const getCurrentSelfRating = (skillId) => {
    return selfEvaluations[skillId]?.rating || getStartingRating(skillId);
  };

  // Handle self-rating change
  const handleSelfRatingChange = useCallback(async (skillId, rating) => {
    if (mode !== 'self' || readOnly || isSubmitted) return;

    const prevEval = selfEvaluations[skillId];
    setSaving(prev => ({ ...prev, [skillId]: true }));

    // Optimistic update
    setSelfEvaluations(prev => ({
      ...prev,
      [skillId]: { ...prev[skillId], rating }
    }));

    try {
      await careerDevelopmentService.saveSelfEvaluation(
        cycle.id,
        targetEmployeeId,
        skillId,
        rating,
        prevEval?.notes || null
      );
    } catch (err) {
      console.error('[SkillReviewPanel] Save self rating error:', err);
      // Revert on error
      setSelfEvaluations(prev => ({
        ...prev,
        [skillId]: prevEval || {}
      }));
    } finally {
      setSaving(prev => ({ ...prev, [skillId]: false }));
    }
  }, [cycle?.id, targetEmployeeId, selfEvaluations, mode, readOnly, isSubmitted]);

  // Handle manager rating change
  const handleManagerRatingChange = useCallback(async (skillId, rating) => {
    if (mode !== 'manager' || readOnly || isSubmitted) return;

    const prevEval = managerReviews[skillId];
    setSaving(prev => ({ ...prev, [`mgr_${skillId}`]: true }));

    // Optimistic update
    setManagerReviews(prev => ({
      ...prev,
      [skillId]: { ...prev[skillId], rating }
    }));

    try {
      await careerDevelopmentService.saveManagerReview(
        cycle.id,
        targetEmployeeId,
        targetManagerId,
        skillId,
        rating,
        prevEval?.notes || null
      );
    } catch (err) {
      console.error('[SkillReviewPanel] Save manager rating error:', err);
      // Revert on error
      setManagerReviews(prev => ({
        ...prev,
        [skillId]: prevEval || {}
      }));
    } finally {
      setSaving(prev => ({ ...prev, [`mgr_${skillId}`]: false }));
    }
  }, [cycle?.id, targetEmployeeId, targetManagerId, managerReviews, mode, readOnly, isSubmitted]);

  // Toggle development goal
  const handleToggleGoal = useCallback(async (skillId) => {
    if (mode !== 'manager' || readOnly || isSubmitted) return;

    const isGoal = developmentGoals.has(skillId);

    // Optimistic update
    setDevelopmentGoals(prev => {
      const newSet = new Set(prev);
      if (isGoal) {
        newSet.delete(skillId);
      } else {
        newSet.add(skillId);
      }
      return newSet;
    });

    try {
      if (isGoal) {
        // Remove goal - need to find the goal first
        const goals = await careerDevelopmentService.getGoals(targetEmployeeId, cycle.id);
        const goal = goals.find(g => g.skill_id === skillId);
        if (goal) {
          await careerDevelopmentService.removeGoal(goal.id);
        }
      } else {
        // Add goal
        await careerDevelopmentService.setGoal(
          cycle.id,
          targetEmployeeId,
          skillId,
          developmentGoals.size + 1,
          'proficient',
          null,
          targetManagerId,
          targetManagerId
        );
      }
    } catch (err) {
      console.error('[SkillReviewPanel] Toggle goal error:', err);
      // Revert on error
      setDevelopmentGoals(prev => {
        const newSet = new Set(prev);
        if (isGoal) {
          newSet.add(skillId);
        } else {
          newSet.delete(skillId);
        }
        return newSet;
      });
    }
  }, [cycle?.id, targetEmployeeId, targetManagerId, developmentGoals, mode, readOnly, isSubmitted]);

  // Submit evaluations
  const handleSubmit = useCallback(async () => {
    if (readOnly || isSubmitted) return;

    try {
      setSubmitting(true);
      setError(null);

      if (mode === 'self') {
        await careerDevelopmentService.submitSelfEvaluations(cycle.id, targetEmployeeId);
        // TODO: Send email notification to manager
      } else {
        await careerDevelopmentService.submitManagerReviews(cycle.id, targetEmployeeId, targetManagerId);
      }

      setIsSubmitted(true);
      if (onSubmitComplete) {
        onSubmitComplete();
      }
    } catch (err) {
      console.error('[SkillReviewPanel] Submit error:', err);
      setError('Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [cycle?.id, targetEmployeeId, targetManagerId, mode, readOnly, isSubmitted, onSubmitComplete]);

  // Calculate progress
  const totalSkills = skills.length;
  const ratedCount = mode === 'self'
    ? Object.keys(selfEvaluations).length
    : Object.keys(managerReviews).length;
  const progressPercent = totalSkills > 0 ? Math.round((ratedCount / totalSkills) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-violet-500" size={32} />
        <span className="ml-3 text-zinc-600 dark:text-zinc-400">Loading skills...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
        <p className="text-red-700 dark:text-red-400">{error}</p>
        <button onClick={loadData} className="mt-2 text-sm text-red-600 dark:text-red-400 underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Progress and Legend */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
              {mode === 'self' ? 'Self-Evaluation' : 'Manager Review'}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {mode === 'self'
                ? 'Review your skills starting from your current ratings. Make changes to reflect where you are now.'
                : 'Review employee self-evaluation and provide your assessment. Check skills for development focus.'
              }
            </p>
          </div>
          {isSubmitted ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
              style={{ backgroundColor: 'rgba(148, 175, 50, 0.15)', color: '#94AF32' }}>
              <CheckCircle size={16} />
              Submitted
            </div>
          ) : (
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              {ratedCount} / {totalSkills} evaluated
            </span>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full transition-all duration-300 rounded-full"
            style={{
              width: `${progressPercent}%`,
              backgroundColor: isSubmitted ? '#94AF32' : '#8B5CF6'
            }}
          />
        </div>

        {/* Rating Legend - only show the 3 actual levels (no 'none') */}
        <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-700">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Ratings:</span>
          {RATING_LEVELS.filter(l => l.id !== 'none').map(level => {
            const Icon = level.icon;
            return (
              <div key={level.id} className="flex items-center gap-1.5" title={level.description}>
                <Icon size={14} style={{ color: level.color }} />
                <span className="text-xs text-zinc-600 dark:text-zinc-400">{level.label}</span>
              </div>
            );
          })}
          {mode === 'manager' && (
            <>
              <span className="text-zinc-300 dark:text-zinc-600">|</span>
              <div className="flex items-center gap-1.5" title="Mark skill for focused development">
                <Target size={14} className="text-violet-500" />
                <span className="text-xs text-zinc-600 dark:text-zinc-400">Focus Goal</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Skills by Category */}
      {categories.map(category => {
        const catClasses = getClassesForCategory(category.id);
        const isExpanded = expandedCategories[category.id];

        return (
          <div key={category.id} className="rounded-xl border overflow-hidden bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700">
            {/* Category Header */}
            <button
              type="button"
              onClick={() => toggleCategory(category.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors min-h-[48px]"
            >
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color || '#64748B' }} />
                <span className="font-medium text-zinc-900 dark:text-white">{category.label}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  ({catClasses.length} classes)
                </span>
              </div>
              {isExpanded ? (
                <ChevronDown size={20} className="text-zinc-400" />
              ) : (
                <ChevronRight size={20} className="text-zinc-400" />
              )}
            </button>

            {/* Classes in Category */}
            {isExpanded && (
              <div className="border-t border-zinc-200 dark:border-zinc-700">
                {catClasses.map(cls => {
                  const clsSkills = getSkillsForClass(cls.id);
                  const isClassExpanded = expandedClasses[cls.id];

                  return (
                    <div key={cls.id} className="border-b border-zinc-100 dark:border-zinc-700 last:border-b-0">
                      {/* Class Header */}
                      <button
                        type="button"
                        onClick={() => toggleClass(cls.id)}
                        className="w-full flex items-center justify-between p-3 pl-8 hover:bg-zinc-50 dark:hover:bg-zinc-700/30 transition-colors min-h-[44px]"
                      >
                        <div className="flex items-center gap-2">
                          <Layers size={14} className="text-zinc-400" />
                          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{cls.label}</span>
                          <span className="text-xs text-zinc-500">({clsSkills.length} skills)</span>
                        </div>
                        {isClassExpanded ? (
                          <ChevronDown size={16} className="text-zinc-400" />
                        ) : (
                          <ChevronRight size={16} className="text-zinc-400" />
                        )}
                      </button>

                      {/* Skills Table */}
                      {isClassExpanded && (
                        <div className="px-4 pb-3">
                          {/* Table Header */}
                          <div className="flex items-center gap-2 py-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-700">
                            <div className="flex-1 pl-8">Skill</div>
                            {mode === 'manager' && (
                              <div className="w-10 text-center" title="Mark as development focus">
                                <Target size={14} className="mx-auto text-violet-500" />
                              </div>
                            )}
                            <div className="w-44 text-center">
                              {mode === 'self' ? 'Your Rating' : 'Employee'}
                            </div>
                            <div className="w-44 text-center">Manager</div>
                            <div className="w-10 text-center" title="Training link">
                              <GraduationCap size={14} className="mx-auto text-blue-500" />
                            </div>
                          </div>

                          {/* Skill Rows */}
                          {clsSkills.map(skill => {
                            const selfRating = getCurrentSelfRating(skill.id);
                            const mgrRating = managerReviews[skill.id]?.rating || 'none';
                            const prevMgrRating = previousManagerRatings[skill.id];
                            const isGoal = developmentGoals.has(skill.id);
                            const trainingUrls = skill.training_urls || [];

                            // Determine if this skill changed from last review (for manager view)
                            const hasChanged = mode === 'manager' && prevMgrRating && mgrRating !== 'none' && prevMgrRating !== mgrRating;

                            // Row styling
                            let rowBg = '';
                            if (isGoal) {
                              rowBg = 'bg-violet-50 dark:bg-violet-900/20';
                            } else if (hasChanged) {
                              rowBg = 'bg-amber-50 dark:bg-amber-900/10';
                            }

                            return (
                              <div
                                key={skill.id}
                                className={`flex items-center gap-2 py-2.5 px-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700/30 ${rowBg}`}
                              >
                                {/* Skill Name */}
                                <div className="flex-1 min-w-0 pl-6">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-zinc-900 dark:text-white truncate" title={skill.name}>
                                      {skill.name}
                                    </span>
                                    {hasChanged && (
                                      <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" title="Changed from last review" />
                                    )}
                                    {isGoal && (
                                      <Target size={14} className="text-violet-500 flex-shrink-0" title="Development focus" />
                                    )}
                                  </div>
                                  {skill.description && (
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate" title={skill.description}>
                                      {skill.description}
                                    </p>
                                  )}
                                </div>

                                {/* Development Goal Checkbox (Manager only) */}
                                {mode === 'manager' && (
                                  <div className="w-10 flex justify-center">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleGoal(skill.id)}
                                      disabled={readOnly || isSubmitted}
                                      className={`
                                        w-6 h-6 rounded border-2 flex items-center justify-center
                                        min-h-[44px] min-w-[44px] transition-colors
                                        ${isGoal
                                          ? 'bg-violet-500 border-violet-500 text-white'
                                          : 'border-zinc-300 dark:border-zinc-600 hover:border-violet-400'
                                        }
                                        ${(readOnly || isSubmitted) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                      `}
                                      title={isGoal ? 'Remove from development focus' : 'Add to development focus'}
                                    >
                                      {isGoal && <CheckCircle size={14} />}
                                    </button>
                                  </div>
                                )}

                                {/* Self/Employee Rating - Always show icon picker */}
                                <div className="w-44 flex justify-center">
                                  <SkillRatingPicker
                                    value={selfRating}
                                    onChange={(r) => handleSelfRatingChange(skill.id, r)}
                                    disabled={mode !== 'self' || readOnly || isSubmitted || saving[skill.id]}
                                    size="sm"
                                    showLabels={false}
                                  />
                                </div>

                                {/* Manager Rating - Always show for both modes */}
                                <div className="w-44 flex justify-center">
                                  <SkillRatingPicker
                                    value={mgrRating}
                                    onChange={(r) => handleManagerRatingChange(skill.id, r)}
                                    disabled={mode !== 'manager' || readOnly || isSubmitted || saving[`mgr_${skill.id}`]}
                                    size="sm"
                                    showLabels={false}
                                  />
                                </div>

                                {/* Training Link */}
                                <div className="w-10 flex justify-center">
                                  {trainingUrls.length > 0 ? (
                                    <a
                                      href={trainingUrls[0]}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="p-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
                                      title="Open training materials"
                                    >
                                      <ExternalLink size={16} />
                                    </a>
                                  ) : (
                                    <span className="text-zinc-300 dark:text-zinc-600" title="No training link">
                                      <ExternalLink size={16} />
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                          {clsSkills.length === 0 && (
                            <p className="text-sm text-zinc-400 italic py-2 pl-8">No skills in this class</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {catClasses.length === 0 && (
                  <p className="text-sm text-zinc-400 italic p-4">No classes in this category</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {categories.length === 0 && (
        <div className="text-center py-8 text-zinc-500">
          No skill categories found. Please contact an administrator.
        </div>
      )}

      {/* Development Goals Summary (Manager view) */}
      {mode === 'manager' && developmentGoals.size > 0 && (
        <div className="p-4 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-200 dark:border-violet-700">
          <h4 className="text-sm font-semibold text-violet-700 dark:text-violet-400 flex items-center gap-2 mb-2">
            <Target size={16} />
            Development Focus ({developmentGoals.size} skills)
          </h4>
          <div className="flex flex-wrap gap-2">
            {Array.from(developmentGoals).map(skillId => {
              const skill = skills.find(s => s.id === skillId);
              return skill ? (
                <span
                  key={skillId}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white dark:bg-zinc-800 text-sm text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700"
                >
                  <CheckCircle size={12} className="text-violet-500" />
                  {skill.name}
                </span>
              ) : null;
            })}
          </div>
        </div>
      )}

      {/* Submit Button */}
      {!readOnly && !isSubmitted && (
        <div className="flex justify-end pt-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold min-h-[48px] transition-all bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Submitting...
              </>
            ) : (
              <>
                <Send size={18} />
                Submit {mode === 'self' ? 'Self-Evaluation' : 'Manager Review'}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default SkillReviewPanel;
