/**
 * ProjectTimeLogSection.jsx
 * Manual hour logging section for technician project details.
 * Allows technicians to log time spent on a project with date, hours, and notes.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Clock, Plus, Trash2, ChevronDown, ChevronRight, Loader2, Calendar, FileText, User } from 'lucide-react';
import { timeLogsService } from '../../services/supabaseService';
import { useAuth } from '../../contexts/AuthContext';

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatHours = (minutes) => {
  if (!minutes) return '0h';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const hoursOptions = [];
for (let h = 0.5; h <= 12; h += 0.5) hoursOptions.push(h);

const ProjectTimeLogSection = ({ projectId, styles, palette }) => {
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    workDate: new Date().toISOString().split('T')[0],
    hours: 1,
    notes: ''
  });

  const loadEntries = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      const data = await timeLogsService.getProjectTimeLogs(projectId);
      setEntries(data);
    } catch (err) {
      console.error('[ProjectTimeLogSection] Failed to load entries:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isExpanded) loadEntries();
  }, [isExpanded, loadEntries]);

  const totalHours = entries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.workDate) { setError('Please select a date'); return; }
    if (!formData.hours || formData.hours <= 0) { setError('Please select hours'); return; }

    try {
      setSaving(true);
      await timeLogsService.createManualEntry(projectId, {
        userEmail: user?.email,
        userName: user?.name || user?.full_name || user?.email,
        workDate: formData.workDate,
        hours: formData.hours,
        notes: formData.notes,
        createdBy: user?.email,
        createdByName: user?.name || user?.full_name
      });
      setFormData({ workDate: new Date().toISOString().split('T')[0], hours: 1, notes: '' });
      setShowForm(false);
      await loadEntries();
    } catch (err) {
      setError(err.message || 'Failed to save time entry');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entryId) => {
    if (!window.confirm('Delete this time entry?')) return;
    try {
      await timeLogsService.deleteManualEntry(entryId);
      await loadEntries();
    } catch (err) {
      console.error('[ProjectTimeLogSection] Delete failed:', err);
    }
  };

  return (
    <div className="border rounded-xl overflow-hidden" style={{ borderColor: styles?.card?.borderColor || '#3f3f46', backgroundColor: styles?.card?.backgroundColor || '#18181b' }}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-700/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? <ChevronDown size={18} className="text-zinc-400" /> : <ChevronRight size={18} className="text-zinc-400" />}
          <Clock size={18} className="text-violet-400" />
          <span className="font-semibold text-white">Time Logs</span>
          {entries.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300">
              {formatHours(totalHours)} total
            </span>
          )}
        </div>
        <span className="text-sm text-zinc-400">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
      </button>

      {isExpanded && (
        <div className="px-5 pb-5 space-y-4">
          {/* Add Entry Button */}
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors"
            style={{ backgroundColor: showForm ? 'rgba(139, 92, 246, 0.15)' : 'transparent', color: '#a78bfa', border: '1px solid rgba(139, 92, 246, 0.3)' }}
          >
            <Plus size={16} />
            {showForm ? 'Cancel' : 'Log Hours'}
          </button>

          {/* Add Entry Form */}
          {showForm && (
            <form onSubmit={handleSubmit} className="p-4 rounded-xl border border-zinc-700 bg-zinc-800/50 space-y-3">
              {error && (
                <div className="p-2 bg-red-500/20 border border-red-500/40 rounded-lg text-red-400 text-sm">{error}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block flex items-center gap-1">
                    <Calendar size={12} /> Date
                  </label>
                  <input
                    type="date"
                    value={formData.workDate}
                    onChange={(e) => setFormData(prev => ({ ...prev, workDate: e.target.value }))}
                    className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 mb-1 block flex items-center gap-1">
                    <Clock size={12} /> Hours
                  </label>
                  <select
                    value={formData.hours}
                    onChange={(e) => setFormData(prev => ({ ...prev, hours: parseFloat(e.target.value) }))}
                    className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm focus:outline-none focus:border-violet-500"
                  >
                    {hoursOptions.map(h => (
                      <option key={h} value={h}>{h} {h === 1 ? 'hour' : 'hours'}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-zinc-400 mb-1 block flex items-center gap-1">
                  <FileText size={12} /> Notes (optional)
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  placeholder="Work performed..."
                  className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-violet-500 resize-none"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-black transition-colors disabled:opacity-50"
                  style={{ backgroundColor: '#94AF32' }}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {saving ? 'Saving...' : 'Add Entry'}
                </button>
              </div>
            </form>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={20} className="animate-spin text-zinc-400" />
            </div>
          )}

          {/* Entries List */}
          {!loading && entries.length === 0 && (
            <p className="text-sm text-zinc-500 text-center py-4">No time entries yet. Click "Log Hours" to add one.</p>
          )}

          {!loading && entries.length > 0 && (
            <div className="space-y-2">
              {entries.map(entry => (
                <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg border border-zinc-700/50 bg-zinc-800/30 hover:bg-zinc-700/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-center min-w-[48px]">
                      <div className="text-sm font-semibold text-white">{formatHours(entry.duration_minutes)}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm text-zinc-300">
                        <Calendar size={12} className="text-zinc-500 shrink-0" />
                        {formatDate(entry.work_date || entry.check_in)}
                        <span className="text-zinc-600">·</span>
                        <User size={12} className="text-zinc-500 shrink-0" />
                        <span className="truncate">{entry.user_name || entry.user_email}</span>
                        {entry.is_manual_entry && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">manual</span>
                        )}
                      </div>
                      {entry.notes && (
                        <p className="text-xs text-zinc-500 mt-0.5 truncate">{entry.notes}</p>
                      )}
                    </div>
                  </div>
                  {entry.is_manual_entry && entry.user_email === user?.email && (
                    <button
                      onClick={() => handleDelete(entry.id)}
                      className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                      title="Delete entry"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProjectTimeLogSection;
