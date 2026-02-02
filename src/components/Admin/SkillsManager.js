/**
 * SkillsManager.js
 * 3-level skill hierarchy management (Category → Class → Skill)
 * With CSV import (Replace All, Merge, Append) and batch delete
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Trash2, Edit2, Save, X, ChevronDown, ChevronRight,
  Loader2, Upload, Download, AlertTriangle, Check, FileSpreadsheet,
  Layers, FolderOpen, Award, Eye, EyeOff, ExternalLink, Link2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import Button from '../ui/Button';

// Preset colors for category picker
const PRESET_COLORS = [
  '#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EF4444',
  '#EC4899', '#6366F1', '#64748B', '#14B8A6', '#F97316',
  '#84CC16', '#06B6D4', '#A855F7', '#F43F5E', '#22C55E'
];

// Import mode options
const IMPORT_MODES = [
  { id: 'replace', label: 'Replace All', description: 'Delete all existing skills and import fresh', icon: AlertTriangle, color: 'text-red-500' },
  { id: 'merge', label: 'Merge', description: 'Update existing, add new (match by Category+Class+Skill)', icon: Layers, color: 'text-yellow-500' },
  { id: 'append', label: 'Append', description: 'Add all as new (may create duplicates)', icon: Plus, color: '', style: { color: '#94AF32' } }
];

const SkillsManager = ({ onSuccess, onError }) => {
  // Data state
  const [categories, setCategories] = useState([]);
  const [classes, setClasses] = useState([]);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // UI state
  const [expandedCategories, setExpandedCategories] = useState({});
  const [expandedClasses, setExpandedClasses] = useState({});
  const [editingItem, setEditingItem] = useState(null); // { type: 'category'|'class'|'skill', data: {...} }
  const [addingTo, setAddingTo] = useState(null); // { type: 'category'|'class'|'skill', parentId: null|uuid }
  const [newItemName, setNewItemName] = useState('');
  const [newItemDescription, setNewItemDescription] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#64748B');
  const [newCategoryShowInService, setNewCategoryShowInService] = useState(true);
  const [newSkillTrainingUrls, setNewSkillTrainingUrls] = useState('');

  // Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState('merge');
  const [importData, setImportData] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  // Batch delete state
  const [selectedSkills, setSelectedSkills] = useState(new Set());
  const [selectMode, setSelectMode] = useState(false);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Load categories
      const { data: catData, error: catError } = await supabase
        .from('skill_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (catError) throw catError;
      setCategories(catData || []);

      // Load classes
      const { data: classData, error: classError } = await supabase
        .from('skill_classes')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (!classError) {
        setClasses(classData || []);
      }

      // Load skills
      const { data: skillData, error: skillError } = await supabase
        .from('global_skills')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (skillError) throw skillError;
      setSkills(skillData || []);

    } catch (err) {
      // Extract meaningful error message from various error formats
      const errorMessage = err?.message || err?.error_description ||
        (typeof err === 'object' ? JSON.stringify(err) : String(err));
      console.error('[SkillsManager] Load failed:', errorMessage, err);
      onError?.(errorMessage || 'Failed to load skills data');
    } finally {
      setLoading(false);
    }
  }, [onError]);

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

  // Get skills for a category (via class or direct category match)
  const getSkillsForCategory = (categoryName) => {
    return skills.filter(s => s.category === categoryName);
  };

  // Toggle expand
  const toggleCategory = (catId) => {
    setExpandedCategories(prev => ({ ...prev, [catId]: !prev[catId] }));
  };

  const toggleClass = (classId) => {
    setExpandedClasses(prev => ({ ...prev, [classId]: !prev[classId] }));
  };

  // Add handlers
  const handleAddCategory = async () => {
    if (!newItemName.trim()) return;
    try {
      setSaving(true);
      const name = newItemName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const { error } = await supabase
        .from('skill_categories')
        .insert({
          name,
          label: newItemName.trim(),
          description: newItemDescription.trim() || null,
          color: newCategoryColor,
          show_in_service: newCategoryShowInService,
          is_active: true,
          sort_order: categories.length
        });
      if (error) throw error;
      resetAddForm();
      onSuccess?.('Category added');
      await loadData();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  const resetAddForm = () => {
    setAddingTo(null);
    setNewItemName('');
    setNewItemDescription('');
    setNewCategoryColor('#64748B');
    setNewCategoryShowInService(true);
    setNewSkillTrainingUrls('');
  };

  const handleAddClass = async (categoryId) => {
    if (!newItemName.trim()) return;
    try {
      setSaving(true);
      const name = newItemName.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      const { error } = await supabase
        .from('skill_classes')
        .insert({
          category_id: categoryId,
          name,
          label: newItemName.trim(),
          description: newItemDescription.trim() || null,
          is_active: true,
          sort_order: getClassesForCategory(categoryId).length
        });
      if (error) throw error;
      resetAddForm();
      onSuccess?.('Class added');
      await loadData();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddSkill = async (classId, categoryName) => {
    if (!newItemName.trim()) return;
    try {
      setSaving(true);
      // Parse training URLs (one per line or comma-separated)
      const trainingUrls = newSkillTrainingUrls
        .split(/[\n,]/)
        .map(url => url.trim())
        .filter(url => url.length > 0);

      const { error } = await supabase
        .from('global_skills')
        .insert({
          name: newItemName.trim(),
          category: categoryName,
          class_id: classId,
          description: newItemDescription.trim() || null,
          training_urls: trainingUrls.length > 0 ? trainingUrls : [],
          is_active: true,
          sort_order: getSkillsForClass(classId).length
        });
      if (error) throw error;
      resetAddForm();
      onSuccess?.('Skill added');
      await loadData();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Update handlers
  const handleUpdateCategory = async (category) => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('skill_categories')
        .update({
          label: category.label,
          color: category.color,
          description: category.description,
          show_in_service: category.show_in_service,
          updated_at: new Date().toISOString()
        })
        .eq('id', category.id);
      if (error) throw error;
      setEditingItem(null);
      onSuccess?.('Category updated');
      await loadData();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateSkill = async (skill) => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('global_skills')
        .update({
          name: skill.name,
          description: skill.description,
          training_urls: skill.training_urls || [],
          updated_at: new Date().toISOString()
        })
        .eq('id', skill.id);
      if (error) throw error;
      setEditingItem(null);
      onSuccess?.('Skill updated');
      await loadData();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Delete confirmation modal state
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { type: 'category', item: {...} }

  // Delete handlers
  const handleDeleteCategory = async (category) => {
    try {
      setSaving(true);

      // Get all classes for this category
      const categoryClasses = getClassesForCategory(category.id);
      const classIds = categoryClasses.map(c => c.id);

      // Delete all skills in these classes first (to handle foreign key constraints)
      if (classIds.length > 0) {
        const { error: skillsError } = await supabase
          .from('global_skills')
          .delete()
          .in('class_id', classIds);
        if (skillsError) throw skillsError;
      }

      // Delete all classes in this category
      if (classIds.length > 0) {
        const { error: classesError } = await supabase
          .from('skill_classes')
          .delete()
          .in('id', classIds);
        if (classesError) throw classesError;
      }

      // Delete the category itself
      const { error: catError } = await supabase
        .from('skill_categories')
        .delete()
        .eq('id', category.id);
      if (catError) throw catError;

      setDeleteConfirm(null);
      setEditingItem(null);
      onSuccess?.(`Deleted category "${category.label}" and all its contents`);
      await loadData();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSkill = async (skillId) => {
    if (!window.confirm('Delete this skill? This will remove it from all employees.')) return;
    try {
      setSaving(true);
      const { error } = await supabase
        .from('global_skills')
        .delete()
        .eq('id', skillId);
      if (error) throw error;
      await loadData();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedSkills.size === 0) return;
    if (!window.confirm(`Delete ${selectedSkills.size} selected skills? This will remove them from all employees.`)) return;
    try {
      setSaving(true);
      const { error } = await supabase
        .from('global_skills')
        .delete()
        .in('id', Array.from(selectedSkills));
      if (error) throw error;
      setSelectedSkills(new Set());
      setSelectMode(false);
      onSuccess?.(`Deleted ${selectedSkills.size} skills`);
      await loadData();
    } catch (err) {
      onError?.(err.message);
    } finally {
      setSaving(false);
    }
  };

  // CSV Import handlers
  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return null;

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const catIdx = headers.findIndex(h => h === 'category');
    const classIdx = headers.findIndex(h => h === 'class');
    const skillIdx = headers.findIndex(h => h === 'skill');
    const descIdx = headers.findIndex(h => h === 'description');

    if (catIdx === -1 || skillIdx === -1) {
      return { error: 'CSV must have "Category" and "Skill" columns' };
    }

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      // Handle quoted CSV values
      const row = lines[i].match(/("([^"]*)"|[^,]*)(,|$)/g)?.map(v =>
        v.replace(/,$/, '').replace(/^"|"$/g, '').trim()
      ) || lines[i].split(',').map(v => v.trim());

      if (row[catIdx] || row[skillIdx]) {
        rows.push({
          category: row[catIdx] || '',
          class: classIdx >= 0 ? (row[classIdx] || 'General') : 'General',
          skill: row[skillIdx] || '',
          description: descIdx >= 0 ? (row[descIdx] || '') : ''
        });
      }
    }

    return { rows };
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const parsed = parseCSV(text);

      if (parsed?.error) {
        onError?.(parsed.error);
        return;
      }

      setImportData(parsed.rows);

      // Build preview
      const preview = {};
      parsed.rows.forEach(row => {
        if (!preview[row.category]) preview[row.category] = {};
        if (!preview[row.category][row.class]) preview[row.category][row.class] = [];
        preview[row.category][row.class].push({ skill: row.skill, description: row.description });
      });
      setImportPreview(preview);
      setShowImportModal(true);
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  const handleImport = async () => {
    if (!importData || importData.length === 0) return;

    try {
      setImporting(true);

      if (importMode === 'replace') {
        // Delete all existing skills, classes
        await supabase.from('global_skills').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('skill_classes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }

      // Group by category and class
      const structure = {};
      importData.forEach(row => {
        if (!structure[row.category]) structure[row.category] = {};
        if (!structure[row.category][row.class]) structure[row.category][row.class] = [];
        structure[row.category][row.class].push({ skill: row.skill, description: row.description });
      });

      // Process each category
      for (const [catLabel, classesObj] of Object.entries(structure)) {
        const catName = catLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

        // Upsert category
        const { data: catData } = await supabase
          .from('skill_categories')
          .upsert({
            name: catName,
            label: catLabel,
            is_active: true,
            sort_order: Object.keys(structure).indexOf(catLabel)
          }, { onConflict: 'name' })
          .select()
          .single();

        const categoryId = catData?.id;
        if (!categoryId) continue;

        // Process each class
        for (const [classLabel, skillsArr] of Object.entries(classesObj)) {
          const className = classLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

          // Upsert class
          let classId;
          if (importMode === 'merge' || importMode === 'replace') {
            const { data: existingClass } = await supabase
              .from('skill_classes')
              .select('id')
              .eq('category_id', categoryId)
              .eq('name', className)
              .single();

            if (existingClass) {
              classId = existingClass.id;
            } else {
              const { data: newClass } = await supabase
                .from('skill_classes')
                .insert({
                  category_id: categoryId,
                  name: className,
                  label: classLabel,
                  is_active: true,
                  sort_order: Object.keys(classesObj).indexOf(classLabel)
                })
                .select()
                .single();
              classId = newClass?.id;
            }
          } else {
            // Append mode - always create new
            const { data: newClass } = await supabase
              .from('skill_classes')
              .insert({
                category_id: categoryId,
                name: className + '_' + Date.now(),
                label: classLabel,
                is_active: true,
                sort_order: Object.keys(classesObj).indexOf(classLabel)
              })
              .select()
              .single();
            classId = newClass?.id;
          }

          if (!classId) continue;

          // Process skills
          for (let i = 0; i < skillsArr.length; i++) {
            const { skill, description } = skillsArr[i];
            if (!skill) continue;

            if (importMode === 'merge') {
              // Check if skill exists
              const { data: existing } = await supabase
                .from('global_skills')
                .select('id')
                .eq('class_id', classId)
                .eq('name', skill)
                .single();

              if (existing) {
                // Update description if provided
                if (description) {
                  await supabase
                    .from('global_skills')
                    .update({ description })
                    .eq('id', existing.id);
                }
              } else {
                await supabase
                  .from('global_skills')
                  .insert({
                    name: skill,
                    category: catName,
                    class_id: classId,
                    description: description || null,
                    is_active: true,
                    sort_order: i
                  });
              }
            } else {
              // Replace or Append - just insert
              await supabase
                .from('global_skills')
                .insert({
                  name: skill,
                  category: catName,
                  class_id: classId,
                  description: description || null,
                  is_active: true,
                  sort_order: i
                });
            }
          }
        }
      }

      setShowImportModal(false);
      setImportData(null);
      setImportPreview(null);
      onSuccess?.(`Imported ${importData.length} skills`);
      await loadData();

    } catch (err) {
      const errorMessage = err?.message || err?.error_description ||
        (typeof err === 'object' ? JSON.stringify(err) : String(err));
      console.error('[SkillsManager] Import failed:', errorMessage, err);
      onError?.(errorMessage || 'Failed to import skills');
    } finally {
      setImporting(false);
    }
  };

  // Export CSV
  const handleExport = () => {
    const rows = [['Category', 'Class', 'Skill', 'Description']];

    categories.forEach(cat => {
      const catClasses = getClassesForCategory(cat.id);
      catClasses.forEach(cls => {
        const clsSkills = getSkillsForClass(cls.id);
        clsSkills.forEach(skill => {
          rows.push([cat.label, cls.label, skill.name, skill.description || '']);
        });
      });
    });

    const csv = rows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skills_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Toggle skill selection
  const toggleSkillSelection = (skillId) => {
    setSelectedSkills(prev => {
      const newSet = new Set(prev);
      if (newSet.has(skillId)) {
        newSet.delete(skillId);
      } else {
        newSet.add(skillId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="animate-spin text-gray-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Skills (3-Level Hierarchy)</h2>
        <div className="flex items-center gap-2">
          {selectMode ? (
            <>
              <span className="text-sm text-gray-500">{selectedSkills.size} selected</span>
              <Button
                variant="danger"
                size="sm"
                icon={Trash2}
                onClick={handleBatchDelete}
                disabled={selectedSkills.size === 0 || saving}
              >
                Delete Selected
              </Button>
              <Button variant="secondary" size="sm" onClick={() => { setSelectMode(false); setSelectedSkills(new Set()); }}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" icon={Trash2} onClick={() => setSelectMode(true)}>
                Batch Delete
              </Button>
              <Button variant="secondary" size="sm" icon={Download} onClick={handleExport}>
                Export CSV
              </Button>
              <Button variant="secondary" size="sm" icon={Upload} onClick={() => fileInputRef.current?.click()}>
                Import CSV
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button size="sm" icon={Plus} onClick={() => setAddingTo({ type: 'category', parentId: null })}>
                Add Category
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Add Category Form */}
      {addingTo?.type === 'category' && (
        <div className="p-4 rounded-xl border border-violet-500/50 bg-violet-500/10 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <FolderOpen size={16} className="text-violet-500" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">New Category</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Category Name</label>
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="e.g., Access Control"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded-lg text-sm text-gray-900 dark:text-white"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Description (optional)</label>
              <input
                type="text"
                value={newItemDescription}
                onChange={(e) => setNewItemDescription(e.target.value)}
                placeholder="Brief description"
                className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded-lg text-sm text-gray-900 dark:text-white"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Color</label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setNewCategoryColor(color)}
                    className={`w-6 h-6 rounded-full transition-transform ${newCategoryColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-800 scale-110' : 'hover:scale-110'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 mb-1 block">Show in Service Tickets</label>
              <button
                onClick={() => setNewCategoryShowInService(!newCategoryShowInService)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  newCategoryShowInService
                    ? ''
                    : 'bg-zinc-500/10 border-zinc-500/50 text-zinc-500'
                }`}
                style={newCategoryShowInService ? { backgroundColor: 'rgba(148, 175, 50, 0.1)', borderColor: 'rgba(148, 175, 50, 0.5)', color: '#94AF32' } : undefined}
              >
                {newCategoryShowInService ? <Eye size={16} /> : <EyeOff size={16} />}
                <span className="text-sm">{newCategoryShowInService ? 'Visible in Service' : 'Hidden from Service'}</span>
              </button>
              <p className="text-xs text-zinc-500 mt-1">Turn off for categories like "Soft Skills"</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={resetAddForm}>
              Cancel
            </Button>
            <Button size="sm" icon={Plus} onClick={handleAddCategory} disabled={!newItemName.trim() || saving}>
              {saving ? 'Adding...' : 'Add Category'}
            </Button>
          </div>
        </div>
      )}

      {/* Categories List */}
      {categories.map(category => (
        <div key={category.id} className="rounded-xl border overflow-hidden bg-white dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
          {/* Category Header - Editing Mode */}
          {editingItem?.type === 'category' && editingItem.data.id === category.id ? (
            <div className="p-4 space-y-3 bg-violet-500/5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Display Label</label>
                  <input
                    type="text"
                    value={editingItem.data.label}
                    onChange={(e) => setEditingItem({ ...editingItem, data: { ...editingItem.data, label: e.target.value } })}
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded-lg text-sm text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Description</label>
                  <input
                    type="text"
                    value={editingItem.data.description || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, data: { ...editingItem.data, description: e.target.value } })}
                    className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded-lg text-sm text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => setEditingItem({ ...editingItem, data: { ...editingItem.data, color } })}
                        className={`w-6 h-6 rounded-full transition-transform ${editingItem.data.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-800 scale-110' : 'hover:scale-110'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Show in Service Tickets</label>
                  <button
                    onClick={() => setEditingItem({ ...editingItem, data: { ...editingItem.data, show_in_service: !editingItem.data.show_in_service } })}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                      editingItem.data.show_in_service
                        ? ''
                        : 'bg-zinc-500/10 border-zinc-500/50 text-zinc-500'
                    }`}
                    style={editingItem.data.show_in_service ? { backgroundColor: 'rgba(148, 175, 50, 0.1)', borderColor: 'rgba(148, 175, 50, 0.5)', color: '#94AF32' } : undefined}
                  >
                    {editingItem.data.show_in_service ? <Eye size={16} /> : <EyeOff size={16} />}
                    <span className="text-sm">{editingItem.data.show_in_service ? 'Visible in Service' : 'Hidden from Service'}</span>
                  </button>
                </div>
              </div>
              <div className="flex gap-2 justify-between">
                <Button
                  variant="danger"
                  size="sm"
                  icon={Trash2}
                  onClick={() => setDeleteConfirm({ type: 'category', item: editingItem.data })}
                  disabled={saving}
                >
                  Delete Category
                </Button>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setEditingItem(null)}>Cancel</Button>
                  <Button size="sm" icon={Save} onClick={() => handleUpdateCategory(editingItem.data)} disabled={saving}>
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            /* Category Header - View Mode */
            <div className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition-colors">
              <button
                onClick={() => toggleCategory(category.id)}
                className="flex items-center gap-3 flex-1"
              >
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color || '#64748B' }} />
                <span className="font-medium text-gray-900 dark:text-white">{category.label}</span>
                {category.show_in_service === false && (
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-zinc-700 text-zinc-400">
                    <EyeOff size={12} /> Hidden
                  </span>
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  ({getClassesForCategory(category.id).length} classes, {getSkillsForCategory(category.name).length} skills)
                </span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingItem({ type: 'category', data: { ...category } })}
                  className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-colors"
                  title="Edit category"
                >
                  <Edit2 size={16} />
                </button>
                <button onClick={() => toggleCategory(category.id)}>
                  {expandedCategories[category.id] ? (
                    <ChevronDown size={20} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={20} className="text-gray-400" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Category Content */}
          {expandedCategories[category.id] && (
            <div className="border-t border-gray-200 dark:border-zinc-700">
              {/* Add Class Button */}
              <div className="p-2 border-b border-gray-100 dark:border-zinc-700">
                {addingTo?.type === 'class' && addingTo?.parentId === category.id ? (
                  <div className="p-3 bg-blue-500/10 rounded-lg space-y-2">
                    <input
                      type="text"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      placeholder="Class name (e.g., OpenPath, General)"
                      className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded-lg text-sm text-gray-900 dark:text-white"
                      autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                      <Button variant="secondary" size="sm" onClick={() => { setAddingTo(null); setNewItemName(''); }}>Cancel</Button>
                      <Button size="sm" icon={Plus} onClick={() => handleAddClass(category.id)} disabled={!newItemName.trim() || saving}>
                        Add Class
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingTo({ type: 'class', parentId: category.id })}
                    className="w-full py-2 text-sm text-blue-500 hover:text-blue-600 flex items-center justify-center gap-1"
                  >
                    <Plus size={14} /> Add Class
                  </button>
                )}
              </div>

              {/* Classes List */}
              {getClassesForCategory(category.id).map(cls => (
                <div key={cls.id} className="border-b border-gray-100 dark:border-zinc-700 last:border-b-0">
                  {/* Class Header */}
                  <button
                    onClick={() => toggleClass(cls.id)}
                    className="w-full flex items-center justify-between p-3 pl-8 hover:bg-gray-50 dark:hover:bg-zinc-700/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Layers size={14} className="text-gray-400" />
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{cls.label}</span>
                      <span className="text-xs text-gray-500">
                        ({getSkillsForClass(cls.id).length} skills)
                      </span>
                    </div>
                    {expandedClasses[cls.id] ? (
                      <ChevronDown size={16} className="text-gray-400" />
                    ) : (
                      <ChevronRight size={16} className="text-gray-400" />
                    )}
                  </button>

                  {/* Skills List */}
                  {expandedClasses[cls.id] && (
                    <div className="pl-12 pr-4 pb-2">
                      {/* Add Skill */}
                      {addingTo?.type === 'skill' && addingTo?.parentId === cls.id ? (
                        <div className="p-3 rounded-lg space-y-2 mb-2" style={{ backgroundColor: 'rgba(148, 175, 50, 0.1)' }}>
                          <input
                            type="text"
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            placeholder="Skill name"
                            className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded-lg text-sm text-gray-900 dark:text-white"
                            autoFocus
                          />
                          <input
                            type="text"
                            value={newItemDescription}
                            onChange={(e) => setNewItemDescription(e.target.value)}
                            placeholder="Description (optional)"
                            className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded-lg text-sm text-gray-900 dark:text-white"
                          />
                          <div>
                            <label className="text-xs text-zinc-500 mb-1 flex items-center gap-1">
                              <Link2 size={12} /> Training URLs (one per line)
                            </label>
                            <textarea
                              value={newSkillTrainingUrls}
                              onChange={(e) => setNewSkillTrainingUrls(e.target.value)}
                              placeholder="https://training.example.com/course1&#10;https://youtube.com/watch?v=..."
                              rows={2}
                              className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded-lg text-sm text-gray-900 dark:text-white"
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button variant="secondary" size="sm" onClick={resetAddForm}>Cancel</Button>
                            <Button size="sm" icon={Plus} onClick={() => handleAddSkill(cls.id, category.name)} disabled={!newItemName.trim() || saving}>
                              Add Skill
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingTo({ type: 'skill', parentId: cls.id })}
                          className="w-full py-2 text-sm flex items-center gap-1 mb-2"
                          style={{ color: '#94AF32' }}
                        >
                          <Plus size={14} /> Add Skill
                        </button>
                      )}

                      {/* Skills */}
                      {getSkillsForClass(cls.id).map(skill => (
                        editingItem?.type === 'skill' && editingItem.data.id === skill.id ? (
                          // Edit Skill Mode
                          <div key={skill.id} className="p-3 rounded-lg space-y-2 mb-2" style={{ backgroundColor: 'rgba(148, 175, 50, 0.1)' }}>
                            <input
                              type="text"
                              value={editingItem.data.name}
                              onChange={(e) => setEditingItem({ ...editingItem, data: { ...editingItem.data, name: e.target.value } })}
                              className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded-lg text-sm text-gray-900 dark:text-white"
                            />
                            <input
                              type="text"
                              value={editingItem.data.description || ''}
                              onChange={(e) => setEditingItem({ ...editingItem, data: { ...editingItem.data, description: e.target.value } })}
                              placeholder="Description"
                              className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded-lg text-sm text-gray-900 dark:text-white"
                            />
                            <div>
                              <label className="text-xs text-zinc-500 mb-1 flex items-center gap-1">
                                <Link2 size={12} /> Training URLs (one per line)
                              </label>
                              <textarea
                                value={(editingItem.data.training_urls || []).join('\n')}
                                onChange={(e) => setEditingItem({
                                  ...editingItem,
                                  data: {
                                    ...editingItem.data,
                                    training_urls: e.target.value.split('\n').map(u => u.trim()).filter(u => u)
                                  }
                                })}
                                rows={2}
                                className="w-full px-3 py-2 bg-white dark:bg-zinc-700 border border-gray-200 dark:border-zinc-600 rounded-lg text-sm text-gray-900 dark:text-white"
                              />
                            </div>
                            <div className="flex gap-2 justify-end">
                              <Button variant="secondary" size="sm" onClick={() => setEditingItem(null)}>Cancel</Button>
                              <Button size="sm" icon={Save} onClick={() => handleUpdateSkill(editingItem.data)} disabled={saving}>
                                {saving ? 'Saving...' : 'Save'}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          // View Skill Mode
                          <div key={skill.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700/30 group">
                            <div className="flex items-center gap-2">
                              {selectMode && (
                                <input
                                  type="checkbox"
                                  checked={selectedSkills.has(skill.id)}
                                  onChange={() => toggleSkillSelection(skill.id)}
                                  className="w-4 h-4 rounded border-gray-300 dark:border-zinc-600"
                                />
                              )}
                              <Award size={14} className="text-gray-400" />
                              <div>
                                <span className="text-sm text-gray-900 dark:text-white">{skill.name}</span>
                                {skill.description && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">{skill.description}</p>
                                )}
                                {skill.training_urls && skill.training_urls.length > 0 && (
                                  <div className="flex items-center gap-2 mt-1">
                                    {skill.training_urls.map((url, idx) => (
                                      <a
                                        key={idx}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1"
                                      >
                                        <ExternalLink size={10} /> Training {skill.training_urls.length > 1 ? idx + 1 : ''}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            {!selectMode && (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => setEditingItem({ type: 'skill', data: { ...skill } })}
                                  className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                                  title="Edit skill"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteSkill(skill.id)}
                                  className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                                  title="Delete skill"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      ))}

                      {getSkillsForClass(cls.id).length === 0 && (
                        <p className="text-sm text-gray-400 italic py-2">No skills yet</p>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {getClassesForCategory(category.id).length === 0 && (
                <p className="text-sm text-gray-400 italic p-4">No classes yet. Add a class to organize skills.</p>
              )}
            </div>
          )}
        </div>
      ))}

      {categories.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No categories yet. Add a category or import from CSV.
        </div>
      )}

      {/* Delete Category Confirmation Modal */}
      {deleteConfirm?.type === 'category' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-xl max-w-md w-full overflow-hidden">
            <div className="p-4 border-b border-gray-200 dark:border-zinc-700 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Delete Category?
              </h3>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Are you sure you want to delete <strong>"{deleteConfirm.item.label}"</strong>?
              </p>

              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-2">
                  This will permanently delete:
                </p>
                <ul className="text-sm text-red-600 dark:text-red-400 list-disc list-inside space-y-1">
                  <li>The category itself</li>
                  <li>{getClassesForCategory(deleteConfirm.item.id).length} class(es) within this category</li>
                  <li>{getSkillsForCategory(deleteConfirm.item.name).length} skill(s) and their employee assignments</li>
                </ul>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                This action cannot be undone.
              </p>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-zinc-700 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setDeleteConfirm(null)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                icon={saving ? Loader2 : Trash2}
                onClick={() => handleDeleteCategory(deleteConfirm.item)}
                disabled={saving}
              >
                {saving ? 'Deleting...' : 'Delete Category'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-zinc-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <FileSpreadsheet size={20} />
                Import Skills from CSV
              </h3>
              <button onClick={() => { setShowImportModal(false); setImportData(null); setImportPreview(null); }}>
                <X size={20} className="text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              {/* Import Mode Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Import Mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {IMPORT_MODES.map(mode => (
                    <button
                      key={mode.id}
                      onClick={() => setImportMode(mode.id)}
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        importMode === mode.id
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-gray-200 dark:border-zinc-600 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <mode.icon size={16} className={mode.color} style={mode.style} />
                        <span className="font-medium text-sm text-gray-900 dark:text-white">{mode.label}</span>
                      </div>
                      <p className="text-xs text-gray-500">{mode.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              {importPreview && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Preview ({importData?.length} skills)
                  </label>
                  <div className="border border-gray-200 dark:border-zinc-600 rounded-lg max-h-64 overflow-y-auto">
                    {Object.entries(importPreview).map(([cat, classesObj]) => (
                      <div key={cat} className="border-b border-gray-100 dark:border-zinc-700 last:border-b-0">
                        <div className="p-2 bg-gray-50 dark:bg-zinc-700/50 font-medium text-sm">{cat}</div>
                        {Object.entries(classesObj).map(([cls, skillsArr]) => (
                          <div key={cls} className="pl-4">
                            <div className="p-2 text-sm text-gray-600 dark:text-gray-400">↳ {cls}</div>
                            {skillsArr.slice(0, 5).map((s, i) => (
                              <div key={i} className="pl-6 py-1 text-xs text-gray-500">• {s.skill}</div>
                            ))}
                            {skillsArr.length > 5 && (
                              <div className="pl-6 py-1 text-xs text-gray-400 italic">...and {skillsArr.length - 5} more</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importMode === 'replace' && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                  <AlertTriangle size={16} className="text-red-500 mt-0.5" />
                  <div className="text-sm text-red-600 dark:text-red-400">
                    <strong>Warning:</strong> Replace All will delete ALL existing skills and classes before importing. This cannot be undone.
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-zinc-700 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setShowImportModal(false); setImportData(null); setImportPreview(null); }}>
                Cancel
              </Button>
              <Button icon={importing ? Loader2 : Check} onClick={handleImport} disabled={importing}>
                {importing ? 'Importing...' : `Import (${importMode})`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SkillsManager;
