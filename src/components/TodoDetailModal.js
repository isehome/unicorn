import React, { useState, useEffect } from 'react';
import { X, Calendar, AlertCircle, FileText, Clock } from 'lucide-react';
import Button from './ui/Button';
import DateInput from './ui/DateInput';
import DateField from './ui/DateField';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';

const TodoDetailModal = ({ 
  todo, 
  onClose, 
  onUpdate,
  onSave, 
  onToggleComplete,
  onDelete,
  styles,
  palette 
}) => {
  const { mode } = useTheme();
  const [title, setTitle] = useState(todo?.title || '');
  const [description, setDescription] = useState(todo?.description || '');
  const [dueBy, setDueBy] = useState(todo?.dueBy ? String(todo.dueBy).substring(0,10) : '');
  const [doBy, setDoBy] = useState(todo?.doBy ? String(todo.doBy).substring(0,10) : '');
  const [importance, setImportance] = useState(todo?.importance || 'normal');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTitle(todo?.title || '');
    setDescription(todo?.description || '');
    setDueBy(todo?.dueBy ? String(todo.dueBy).substring(0,10) : '');
    setDoBy(todo?.doBy ? String(todo.doBy).substring(0,10) : '');
    setImportance(todo?.importance || 'normal');
  }, [todo]);

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    try {
      setSaving(true);
      setError('');
      
      // Use onUpdate if provided, otherwise fall back to onSave
      const updateFunc = onUpdate || onSave;
      if (!updateFunc) {
        throw new Error('No update function provided');
      }
      
      await updateFunc(todo.id, {
        title: title.trim(),
        description: description.trim() || null,
        due_by: dueBy || null,
        do_by: doBy || null,
        importance: importance
      });
      
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update todo');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Are you sure you want to delete this todo?')) {
      try {
        await onDelete(todo.id);
        onClose();
      } catch (err) {
        setError(err.message || 'Failed to delete todo');
      }
    }
  };

  const importanceColors = {
    low: { bg: 'rgba(34, 197, 94, 0.1)', text: '#22c55e' },
    normal: { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6' },
    high: { bg: 'rgba(251, 146, 60, 0.1)', text: '#fb923c' },
    critical: { bg: 'rgba(239, 68, 68, 0.1)', text: '#ef4444' }
  };

  const withAlpha = (hex, alpha) => {
    if (!hex || hex[0] !== '#' || (hex.length !== 7 && hex.length !== 4)) return hex;
    const fullHex = hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
    const r = parseInt(fullHex.slice(1, 3), 16);
    const g = parseInt(fullHex.slice(3, 5), 16);
    const b = parseInt(fullHex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-2xl rounded-2xl border overflow-hidden"
        style={{ ...styles.card, boxShadow: '0 24px 65px rgba(15, 23, 42, 0.35)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b" 
             style={{ borderColor: styles.card.borderColor }}>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold" style={styles.textPrimary}>
              Todo Details
            </h2>
            <span 
              className="px-2 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: todo?.completed 
                  ? withAlpha(palette.success, 0.15)
                  : withAlpha(palette.warning, 0.15),
                color: todo?.completed ? palette.success : palette.warning
              }}
            >
              {todo?.completed ? 'Completed' : 'Open'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            style={{ color: palette.textSecondary }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Todo title"
              className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
              style={styles.input}
              disabled={saving}
            />
          </div>

          {/* Description */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium mb-2" style={styles.textPrimary}>
              <FileText size={16} />
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add notes or description..."
              rows={4}
              className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
              style={styles.input}
              disabled={saving}
            />
          </div>

          {/* Dates and Importance */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-2" style={styles.textPrimary}>
                <Calendar size={16} />
                Due Date
              </label>
              <DateInput
                value={dueBy}
                onChange={(e) => setDueBy(e.target.value)}
                disabled={saving}
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-2" style={styles.textPrimary}>
                <Clock size={16} />
                Do Date
              </label>
              <DateInput
                value={doBy}
                onChange={(e) => setDoBy(e.target.value)}
                disabled={saving}
              />
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-2" style={styles.textPrimary}>
                <AlertCircle size={16} />
                Importance
              </label>
              <select
                value={importance}
                onChange={(e) => setImportance(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                style={{
                  ...styles.input,
                  color: importanceColors[importance]?.text || styles.input.color
                }}
                disabled={saving}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          {/* Importance indicator */}
          <div 
            className="px-3 py-2 rounded-xl text-sm font-medium flex items-center gap-2"
            style={{
              backgroundColor: importanceColors[importance].bg,
              color: importanceColors[importance].text
            }}
          >
            <AlertCircle size={16} />
            This task has {importance === 'critical' ? 'critical' : importance} importance
          </div>

          {/* Metadata */}
          <div className="pt-3 border-t" style={{ borderColor: styles.card.borderColor }}>
            <div className="grid grid-cols-2 gap-4 text-xs" style={styles.textSecondary}>
              {todo?.created_at && (
                <div>
                  <span className="font-medium">Created:</span>{' '}
                  <DateField date={todo.created_at} variant="inline" showTime={true} />
                </div>
              )}
              {todo?.updated_at && (
                <div>
                  <span className="font-medium">Updated:</span>{' '}
                  <DateField date={todo.updated_at} variant="inline" showTime={true} />
                </div>
              )}
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="px-3 py-2 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between" 
             style={{ borderColor: styles.card.borderColor }}>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onToggleComplete(todo)}
              disabled={saving}
            >
              Mark as {todo?.completed ? 'Open' : 'Completed'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDelete}
              disabled={saving}
            >
              Delete
            </Button>
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              loading={saving}
              disabled={saving}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TodoDetailModal;
