/**
 * UserSkillsSection.js
 * Displays user's skills on their profile/settings page
 * Read-only view with proficiency levels and training links
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Award, ChevronDown, ChevronRight, ExternalLink, GraduationCap,
  CheckCircle, Star, Loader2, BookOpen
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// Proficiency levels with styling
const PROFICIENCY_LEVELS = [
  { id: 'training', label: 'Training', icon: GraduationCap, color: '#F59E0B', bgColor: 'bg-amber-100 dark:bg-amber-900/30', textColor: 'text-amber-600 dark:text-amber-400' },
  { id: 'proficient', label: 'Proficient', icon: CheckCircle, color: '#3B82F6', bgColor: 'bg-blue-100 dark:bg-blue-900/30', textColor: 'text-blue-600 dark:text-blue-400' },
  { id: 'expert', label: 'Expert', icon: Star, color: '#10B981', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30', textColor: 'text-emerald-600 dark:text-emerald-400' }
];

const UserSkillsSection = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [skills, setSkills] = useState([]);
  const [categories, setCategories] = useState([]);
  const [expandedCategories, setExpandedCategories] = useState({});

  // Load user's skills
  const loadUserSkills = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // Load skill categories
      const { data: catData } = await supabase
        .from('skill_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      setCategories(catData || []);

      // Load user's employee skills with skill details
      const { data: skillsData, error } = await supabase
        .from('employee_skills')
        .select(`
          id,
          proficiency_level,
          certified_at,
          notes,
          skill:global_skills (
            id,
            name,
            category,
            description,
            training_urls
          )
        `)
        .eq('employee_id', user.id);

      if (error) throw error;

      setSkills(skillsData || []);

      // Auto-expand categories that have skills
      const categoriesWithSkills = new Set(skillsData?.map(s => s.skill?.category).filter(Boolean) || []);
      const expanded = {};
      categoriesWithSkills.forEach(cat => {
        expanded[cat] = true;
      });
      setExpandedCategories(expanded);

    } catch (err) {
      console.error('[UserSkillsSection] Failed to load skills:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadUserSkills();
  }, [loadUserSkills]);

  const toggleCategory = (categoryName) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryName]: !prev[categoryName]
    }));
  };

  // Get skills for a specific category
  const getSkillsForCategory = (categoryName) => {
    return skills.filter(s => s.skill?.category === categoryName);
  };

  // Get proficiency level config
  const getProficiencyConfig = (level) => {
    return PROFICIENCY_LEVELS.find(p => p.id === level) || PROFICIENCY_LEVELS[0];
  };

  // Count total skills and by level
  const totalSkills = skills.length;
  const skillsByLevel = PROFICIENCY_LEVELS.reduce((acc, level) => {
    acc[level.id] = skills.filter(s => s.proficiency_level === level.id).length;
    return acc;
  }, {});

  if (loading) {
    return (
      <section className="rounded-2xl border p-4 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-violet-500" />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border p-4 bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
          <Award size={20} className="text-violet-600 dark:text-violet-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">My Skills</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {totalSkills > 0
              ? `${totalSkills} skill${totalSkills !== 1 ? 's' : ''} assigned to you`
              : 'No skills assigned yet'}
          </p>
        </div>
      </div>

      {/* Summary Badges */}
      {totalSkills > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {PROFICIENCY_LEVELS.map(level => {
            const count = skillsByLevel[level.id];
            if (count === 0) return null;
            const Icon = level.icon;
            return (
              <div
                key={level.id}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${level.bgColor} ${level.textColor}`}
              >
                <Icon size={12} />
                {count} {level.label}
              </div>
            );
          })}
        </div>
      )}

      {/* Skills by Category */}
      {totalSkills > 0 ? (
        <div className="space-y-2">
          {categories
            .filter(cat => getSkillsForCategory(cat.name).length > 0)
            .map(category => {
              const categorySkills = getSkillsForCategory(category.name);
              const isExpanded = expandedCategories[category.name];

              return (
                <div key={category.id} className="rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden">
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(category.name)}
                    className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: category.color || '#64748B' }}
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {category.label}
                      </span>
                      <span className="text-xs text-gray-500">
                        ({categorySkills.length})
                      </span>
                    </div>
                    {isExpanded ? (
                      <ChevronDown size={16} className="text-gray-400" />
                    ) : (
                      <ChevronRight size={16} className="text-gray-400" />
                    )}
                  </button>

                  {/* Skills List */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 dark:border-zinc-700">
                      {categorySkills.map(empSkill => {
                        const proficiency = getProficiencyConfig(empSkill.proficiency_level);
                        const Icon = proficiency.icon;
                        const trainingUrls = empSkill.skill?.training_urls || [];

                        return (
                          <div
                            key={empSkill.id}
                            className="flex items-center justify-between p-3 border-b last:border-b-0 border-gray-100 dark:border-zinc-700/50"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-900 dark:text-white">
                                  {empSkill.skill?.name}
                                </span>
                                <span
                                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${proficiency.bgColor} ${proficiency.textColor}`}
                                >
                                  <Icon size={10} />
                                  {proficiency.label}
                                </span>
                              </div>
                              {empSkill.skill?.description && (
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {empSkill.skill.description}
                                </p>
                              )}
                              {trainingUrls.length > 0 && (
                                <div className="flex items-center gap-2 mt-1.5">
                                  <BookOpen size={12} className="text-blue-500" />
                                  {trainingUrls.map((url, idx) => (
                                    <a
                                      key={idx}
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-blue-500 hover:text-blue-600 hover:underline flex items-center gap-0.5"
                                    >
                                      Training {trainingUrls.length > 1 ? idx + 1 : ''}
                                      <ExternalLink size={10} />
                                    </a>
                                  ))}
                                </div>
                              )}
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
      ) : (
        <div className="text-center py-6 text-gray-500 dark:text-gray-400">
          <Award size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">No skills have been assigned to your profile yet.</p>
          <p className="text-xs mt-1">Contact your manager to get skills added.</p>
        </div>
      )}

      {/* Proficiency Legend */}
      {totalSkills > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-zinc-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Proficiency Levels:</p>
          <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400">
            {PROFICIENCY_LEVELS.map(level => {
              const Icon = level.icon;
              return (
                <div key={level.id} className="flex items-center gap-1.5">
                  <Icon size={12} style={{ color: level.color }} />
                  <span>{level.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

export default UserSkillsSection;
