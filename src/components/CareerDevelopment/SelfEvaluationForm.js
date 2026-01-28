/**
 * SelfEvaluationForm.js
 * Form for employees to self-evaluate their skills
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { careerDevelopmentService } from '../../services/careerDevelopmentService';
import SkillRatingPicker, { SkillRatingBadge, getRatingLevel } from './SkillRatingPicker';
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Save,
  Send,
  Loader2,
  CheckCircle,
  MessageSquare,
  X
} from 'lucide-react';

const SelfEvaluationForm = ({
  cycle,
  onSubmitComplete,
  readOnly = false
}) => {
  const { user } = useAuth();
  const [skillsGrouped, setSkillsGrouped] = useState({});
  const [evaluations, setEvaluations] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [noteModal, setNoteModal] = useState(null); // { skillId, skillName, note }
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Load skills and existing evaluations
  const loadData = useCallback(async () => {
    if (!user?.id || !cycle?.id) return;

    try {
      setLoading(true);
      setError(null);

      // Load all skills grouped by category
      const skills = await careerDevelopmentService.getAllSkillsGrouped();
      setSkillsGrouped(skills);

      // Expand first category by default
      const categories = Object.keys(skills);
      if (categories.length > 0) {
        setExpandedCategories({ [categories[0]]: true });
      }

      // Load existing evaluations
      const existingEvals = await careerDevelopmentService.getSelfEvaluations(user.id, cycle.id);

      // Convert to map by skill_id
      const evalMap = {};
      let hasSubmitted = false;
      existingEvals.forEach(ev => {
        evalMap[ev.skill_id] = {
          rating: ev.self_rating,
          notes: ev.self_notes || '',
          submitted: !!ev.submitted_at
        };
        if (ev.submitted_at) hasSubmitted = true;
      });
      setEvaluations(evalMap);
      setIsSubmitted(hasSubmitted);

    } catch (err) {
      console.error('[SelfEvaluationForm] Load error:', err);
      setError('Failed to load skills. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, cycle?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle rating change
  const handleRatingChange = useCallback(async (skillId, rating) => {
    if (readOnly || isSubmitted) return;

    const prevEval = evaluations[skillId];

    // Optimistic update
    setEvaluations(prev => ({
      ...prev,
      [skillId]: {
        ...prev[skillId],
        rating
      }
    }));

    try {
      await careerDevelopmentService.saveSelfEvaluation(
        cycle.id,
        user.id,
        skillId,
        rating,
        prevEval?.notes || null
      );
    } catch (err) {
      console.error('[SelfEvaluationForm] Save rating error:', err);
      // Revert on error
      setEvaluations(prev => ({
        ...prev,
        [skillId]: prevEval || {}
      }));
    }
  }, [cycle?.id, user?.id, evaluations, readOnly, isSubmitted]);

  // Handle note save
  const handleNoteSave = useCallback(async () => {
    if (!noteModal || readOnly || isSubmitted) return;

    const { skillId, note } = noteModal;
    const prevEval = evaluations[skillId];

    // Optimistic update
    setEvaluations(prev => ({
      ...prev,
      [skillId]: {
        ...prev[skillId],
        notes: note
      }
    }));

    setNoteModal(null);

    try {
      await careerDevelopmentService.saveSelfEvaluation(
        cycle.id,
        user.id,
        skillId,
        prevEval?.rating || 'none',
        note || null
      );
    } catch (err) {
      console.error('[SelfEvaluationForm] Save note error:', err);
    }
  }, [noteModal, cycle?.id, user?.id, evaluations, readOnly, isSubmitted]);

  // Submit all evaluations
  const handleSubmit = useCallback(async () => {
    if (readOnly || isSubmitted) return;

    try {
      setSubmitting(true);
      setError(null);

      await careerDevelopmentService.submitSelfEvaluations(cycle.id, user.id);

      setIsSubmitted(true);
      if (onSubmitComplete) {
        onSubmitComplete();
      }
    } catch (err) {
      console.error('[SelfEvaluationForm] Submit error:', err);
      setError('Failed to submit evaluation. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [cycle?.id, user?.id, readOnly, isSubmitted, onSubmitComplete]);

  // Toggle category expansion
  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  // Calculate progress
  const totalSkills = Object.values(skillsGrouped).reduce(
    (sum, cat) => sum + (cat.skills?.length || 0),
    0
  );
  const ratedSkills = Object.values(evaluations).filter(e => e.rating && e.rating !== 'none').length;
  const progressPercent = totalSkills > 0 ? Math.round((ratedSkills / totalSkills) * 100) : 0;

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
        <button
          onClick={loadData}
          className="mt-2 text-sm text-red-600 dark:text-red-400 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Progress Header */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
              Self-Evaluation Progress
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Rate your proficiency for each skill
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
              {ratedSkills} / {totalSkills} rated
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
      </div>

      {/* Skills by Category */}
      <div className="space-y-3">
        {Object.entries(skillsGrouped).map(([category, categoryData]) => {
          const isExpanded = expandedCategories[category];
          const skills = categoryData.skills || [];
          const categoryInfo = categoryData.info;
          const categoryColor = categoryInfo?.color || '#8B5CF6';

          // Count rated in this category
          const ratedInCategory = skills.filter(
            s => evaluations[s.id]?.rating && evaluations[s.id].rating !== 'none'
          ).length;

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
                    {ratedInCategory}/{skills.length} rated
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronDown size={20} className="text-zinc-400" />
                ) : (
                  <ChevronRight size={20} className="text-zinc-400" />
                )}
              </button>

              {/* Skills List */}
              {isExpanded && (
                <div className="border-t border-zinc-200 dark:border-zinc-700 divide-y divide-zinc-100 dark:divide-zinc-700/50">
                  {skills.map((skill) => {
                    const evaluation = evaluations[skill.id] || {};
                    const trainingUrls = skill.training_urls || [];

                    return (
                      <div
                        key={skill.id}
                        className="p-4 space-y-3"
                      >
                        {/* Skill Name & Description */}
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-zinc-900 dark:text-white">
                              {skill.name}
                            </h4>
                            {skill.description && (
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                {skill.description}
                              </p>
                            )}
                            {skill.class && (
                              <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400">
                                {skill.class.label}
                              </span>
                            )}
                          </div>

                          {/* Training Links */}
                          {trainingUrls.length > 0 && (
                            <div className="flex-shrink-0">
                              <a
                                href={trainingUrls[0]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:underline"
                              >
                                <ExternalLink size={12} />
                                Training
                              </a>
                            </div>
                          )}
                        </div>

                        {/* Rating Picker */}
                        <div className="flex items-center justify-between gap-4">
                          <SkillRatingPicker
                            value={evaluation.rating || 'none'}
                            onChange={(rating) => handleRatingChange(skill.id, rating)}
                            disabled={readOnly || isSubmitted}
                            size="sm"
                          />

                          {/* Notes Button */}
                          <button
                            type="button"
                            onClick={() => setNoteModal({
                              skillId: skill.id,
                              skillName: skill.name,
                              note: evaluation.notes || ''
                            })}
                            disabled={readOnly || isSubmitted}
                            className={`
                              flex items-center gap-1 px-2 py-1 rounded-lg text-xs
                              transition-colors min-h-[36px]
                              ${evaluation.notes
                                ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'
                                : 'bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-600'
                              }
                              ${(readOnly || isSubmitted) ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                          >
                            <MessageSquare size={14} />
                            {evaluation.notes ? 'Note' : 'Add note'}
                          </button>
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

      {/* Submit Button */}
      {!readOnly && !isSubmitted && (
        <div className="flex justify-end pt-4">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || ratedSkills === 0}
            className={`
              flex items-center gap-2 px-6 py-3 rounded-xl font-semibold
              min-h-[48px] transition-all
              ${ratedSkills > 0
                ? 'bg-violet-500 hover:bg-violet-600 text-white'
                : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
              }
            `}
          >
            {submitting ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Submitting...
              </>
            ) : (
              <>
                <Send size={18} />
                Submit Self-Evaluation
              </>
            )}
          </button>
        </div>
      )}

      {/* Note Modal */}
      {noteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">
                Notes for {noteModal.skillName}
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
              placeholder="Add any notes about your experience with this skill..."
              className="w-full h-32 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 resize-none"
              style={{ fontSize: '16px' }} // Prevent iOS zoom
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

export default SelfEvaluationForm;
