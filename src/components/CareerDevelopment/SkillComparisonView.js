/**
 * SkillComparisonView.js
 * Side-by-side comparison of self-evaluation vs manager review
 */

import React, { useState, useEffect, useCallback } from 'react';
import { careerDevelopmentService } from '../../services/careerDevelopmentService';
import SkillRatingPicker, { SkillRatingBadge, getRatingLevel } from './SkillRatingPicker';
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  Loader2,
  Save,
  X
} from 'lucide-react';

const SkillComparisonView = ({
  cycle,
  employeeId,
  managerId,
  onReviewChange,
  readOnly = false
}) => {
  const [comparison, setComparison] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [noteModal, setNoteModal] = useState(null);
  const [savingRating, setSavingRating] = useState({});

  // Load comparison data
  const loadData = useCallback(async () => {
    if (!employeeId || !cycle?.id) return;

    try {
      setLoading(true);
      setError(null);

      const data = await careerDevelopmentService.getComparisonView(employeeId, cycle.id);
      setComparison(data);

      // Expand first category by default
      const categories = Object.keys(data);
      if (categories.length > 0) {
        setExpandedCategories({ [categories[0]]: true });
      }
    } catch (err) {
      console.error('[SkillComparisonView] Load error:', err);
      setError('Failed to load skill comparison');
    } finally {
      setLoading(false);
    }
  }, [employeeId, cycle?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle manager rating change
  const handleRatingChange = useCallback(async (skillId, rating) => {
    if (readOnly) return;

    setSavingRating(prev => ({ ...prev, [skillId]: true }));

    try {
      await careerDevelopmentService.saveManagerReview(
        cycle.id,
        employeeId,
        managerId,
        skillId,
        rating,
        null // notes handled separately
      );

      // Reload data to reflect changes
      await loadData();
      if (onReviewChange) onReviewChange();
    } catch (err) {
      console.error('[SkillComparisonView] Save rating error:', err);
    } finally {
      setSavingRating(prev => ({ ...prev, [skillId]: false }));
    }
  }, [cycle?.id, employeeId, managerId, readOnly, loadData, onReviewChange]);

  // Handle manager note save
  const handleNoteSave = useCallback(async () => {
    if (!noteModal || readOnly) return;

    const { skillId, note, currentRating } = noteModal;

    try {
      await careerDevelopmentService.saveManagerReview(
        cycle.id,
        employeeId,
        managerId,
        skillId,
        currentRating || 'none',
        note
      );

      setNoteModal(null);
      await loadData();
    } catch (err) {
      console.error('[SkillComparisonView] Save note error:', err);
    }
  }, [noteModal, cycle?.id, employeeId, managerId, readOnly, loadData]);

  // Toggle category
  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Count discrepancies
  const totalDiscrepancies = Object.values(comparison).flat().filter(
    item => item.has_discrepancy && item.self_eval && item.manager_review
  ).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-violet-500" size={32} />
        <span className="ml-3 text-zinc-600 dark:text-zinc-400">Loading comparison...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
        <p className="text-red-700 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl">
        <div className="flex gap-6">
          <div className="text-center">
            <p className="text-2xl font-bold text-zinc-900 dark:text-white">
              {Object.values(comparison).flat().filter(i => i.self_eval?.self_rating).length}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Self-Evaluated</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-zinc-900 dark:text-white">
              {Object.values(comparison).flat().filter(i => i.manager_review?.manager_rating).length}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Manager Reviewed</p>
          </div>
        </div>
        {totalDiscrepancies > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 rounded-full">
            <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {totalDiscrepancies} discrepancies
            </span>
          </div>
        )}
      </div>

      {/* Column Headers */}
      <div className="hidden md:grid grid-cols-[1fr,200px,200px] gap-4 px-4 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
        <div>Skill</div>
        <div className="text-center">Self-Rating</div>
        <div className="text-center">Manager Rating</div>
      </div>

      {/* Categories */}
      <div className="space-y-3">
        {Object.entries(comparison).map(([category, items]) => {
          const isExpanded = expandedCategories[category];
          const categoryInfo = items[0]?.skill?.category_info;
          const categoryColor = categoryInfo?.color || '#8B5CF6';

          // Count discrepancies in category
          const categoryDiscrepancies = items.filter(i => i.has_discrepancy && i.self_eval && i.manager_review).length;

          return (
            <div
              key={category}
              className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden"
            >
              {/* Category Header */}
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-750 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: categoryColor }}
                  />
                  <span className="font-semibold text-zinc-900 dark:text-white">
                    {categoryInfo?.label || category}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {items.length} skills
                  </span>
                  {categoryDiscrepancies > 0 && (
                    <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle size={12} />
                      {categoryDiscrepancies}
                    </span>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronDown size={20} className="text-zinc-400" />
                ) : (
                  <ChevronRight size={20} className="text-zinc-400" />
                )}
              </button>

              {/* Skills List */}
              {isExpanded && (
                <div className="border-t border-zinc-200 dark:border-zinc-700">
                  {items.map((item) => {
                    const skill = item.skill;
                    const selfEval = item.self_eval;
                    const managerReview = item.manager_review;
                    const hasDiscrepancy = item.has_discrepancy && selfEval && managerReview;
                    const trainingUrls = skill?.training_urls || [];
                    const isSaving = savingRating[skill?.id];

                    return (
                      <div
                        key={skill?.id}
                        className={`
                          p-4 border-b border-zinc-100 dark:border-zinc-700/50 last:border-b-0
                          ${hasDiscrepancy ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}
                        `}
                      >
                        {/* Mobile Layout */}
                        <div className="md:hidden space-y-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-medium text-zinc-900 dark:text-white">
                                {skill?.name}
                              </h4>
                              {skill?.class && (
                                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                  {skill.class.label}
                                </span>
                              )}
                            </div>
                            {hasDiscrepancy && (
                              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
                            )}
                          </div>

                          {/* Ratings Stacked */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Self-Rating</p>
                              <SkillRatingBadge
                                rating={selfEval?.self_rating || 'none'}
                                size="sm"
                              />
                              {selfEval?.self_notes && (
                                <p className="text-xs text-zinc-500 mt-1 italic truncate">
                                  "{selfEval.self_notes}"
                                </p>
                              )}
                            </div>
                            <div>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">Manager Rating</p>
                              {readOnly ? (
                                <SkillRatingBadge
                                  rating={managerReview?.manager_rating || 'none'}
                                  size="sm"
                                />
                              ) : (
                                <SkillRatingPicker
                                  value={managerReview?.manager_rating || 'none'}
                                  onChange={(rating) => handleRatingChange(skill.id, rating)}
                                  disabled={isSaving}
                                  size="sm"
                                  showLabels={false}
                                />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Desktop Layout */}
                        <div className="hidden md:grid grid-cols-[1fr,200px,200px] gap-4 items-center">
                          {/* Skill Info */}
                          <div className="flex items-center gap-3">
                            {hasDiscrepancy && (
                              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <h4 className="font-medium text-zinc-900 dark:text-white truncate">
                                {skill?.name}
                              </h4>
                              <div className="flex items-center gap-2">
                                {skill?.class && (
                                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {skill.class.label}
                                  </span>
                                )}
                                {trainingUrls.length > 0 && (
                                  <a
                                    href={trainingUrls[0]}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                                  >
                                    <ExternalLink size={10} />
                                    Training
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Self Rating */}
                          <div className="text-center">
                            <SkillRatingBadge
                              rating={selfEval?.self_rating || 'none'}
                              size="sm"
                            />
                            {selfEval?.self_notes && (
                              <p className="text-xs text-zinc-500 mt-1 italic truncate max-w-[180px] mx-auto">
                                "{selfEval.self_notes}"
                              </p>
                            )}
                          </div>

                          {/* Manager Rating */}
                          <div className="flex flex-col items-center gap-2">
                            {readOnly ? (
                              <SkillRatingBadge
                                rating={managerReview?.manager_rating || 'none'}
                                size="sm"
                              />
                            ) : (
                              <div className="relative">
                                <SkillRatingPicker
                                  value={managerReview?.manager_rating || 'none'}
                                  onChange={(rating) => handleRatingChange(skill.id, rating)}
                                  disabled={isSaving}
                                  size="sm"
                                  showLabels={false}
                                />
                                {isSaving && (
                                  <div className="absolute inset-0 bg-white/50 dark:bg-zinc-800/50 flex items-center justify-center rounded">
                                    <Loader2 className="animate-spin text-violet-500" size={16} />
                                  </div>
                                )}
                              </div>
                            )}
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={() => setNoteModal({
                                  skillId: skill.id,
                                  skillName: skill.name,
                                  note: managerReview?.manager_notes || '',
                                  currentRating: managerReview?.manager_rating || 'none'
                                })}
                                className={`
                                  flex items-center gap-1 text-xs px-2 py-1 rounded
                                  ${managerReview?.manager_notes
                                    ? 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20'
                                    : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                                  }
                                `}
                              >
                                <MessageSquare size={12} />
                                {managerReview?.manager_notes ? 'Edit note' : 'Add note'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Note Modal */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                Manager Notes: {noteModal.skillName}
              </h3>
              <button
                onClick={() => setNoteModal(null)}
                className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700"
              >
                <X size={20} className="text-zinc-500" />
              </button>
            </div>

            <textarea
              value={noteModal.note}
              onChange={(e) => setNoteModal(prev => ({ ...prev, note: e.target.value }))}
              placeholder="Add feedback or notes about this skill..."
              className="w-full h-32 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 resize-none"
              style={{ fontSize: '16px' }}
            />

            <div className="flex justify-end gap-3 mt-4">
              <button
                type="button"
                onClick={() => setNoteModal(null)}
                className="px-4 py-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleNoteSave}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-500 hover:bg-violet-600 text-white font-medium"
              >
                <Save size={16} />
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SkillComparisonView;
