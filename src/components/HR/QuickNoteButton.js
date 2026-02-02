/**
 * QuickNoteButton.js
 *
 * Floating button that allows users to quickly capture notes about
 * themselves or their direct reports at any time. These notes are
 * date-stamped and can be incorporated into performance reviews.
 *
 * Features:
 * - Always visible floating button in corner
 * - Quick modal for capturing thoughts
 * - Select who the note is about (self or direct report)
 * - Categorize notes (positive, improvement, accomplishment, concern)
 * - Optional privacy setting
 */

import React, { useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { hrService } from '../../services/hrService';
import TechnicianAvatar from '../TechnicianAvatar';
import {
  MessageSquarePlus,
  X,
  Loader2,
  CheckCircle,
  User,
  Users,
  ThumbsUp,
  TrendingUp,
  AlertTriangle,
  Star,
  FileText,
  Lock,
  Send,
  Search,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

// Note type options
const NOTE_TYPES = [
  { id: 'accomplishment', label: 'Accomplishment', icon: Star, color: '#10B981', description: 'Something they did well' },
  { id: 'positive', label: 'Positive', icon: ThumbsUp, color: '#3B82F6', description: 'Good behavior or attitude' },
  { id: 'improvement', label: 'Improvement', icon: TrendingUp, color: '#F59E0B', description: 'Area for growth' },
  { id: 'concern', label: 'Concern', icon: AlertTriangle, color: '#EF4444', description: 'Issue to address' },
  { id: 'general', label: 'General', icon: FileText, color: '#64748B', description: 'Other observation' }
];

const QuickNoteButton = ({ currentUserId, directReports = [], allEmployees = [], manager, floating = true, userRole }) => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  // Form state
  const [subjectId, setSubjectId] = useState('self'); // 'self' or employee ID
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [isPrivate, setIsPrivate] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOtherEmployees, setShowOtherEmployees] = useState(false);

  // Check if user is a manager (can write notes about others)
  const isManager = userRole && ['manager', 'director', 'admin', 'owner'].includes(userRole);

  // Reset form
  const resetForm = useCallback(() => {
    setSubjectId('self');
    setNoteText('');
    setNoteType('general');
    setIsPrivate(false);
    setError(null);
    setSuccess(false);
    setSearchTerm('');
    setShowOtherEmployees(false);
  }, []);

  // Open modal
  const handleOpen = () => {
    resetForm();
    setIsOpen(true);
  };

  // Close modal
  const handleClose = () => {
    setIsOpen(false);
    resetForm();
  };

  // Submit note
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!noteText.trim()) {
      setError('Please enter a note');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const actualSubjectId = subjectId === 'self' ? currentUserId : subjectId;

      await hrService.createNote({
        subjectEmployeeId: actualSubjectId,
        authorId: currentUserId,
        noteText: noteText.trim(),
        noteType,
        isPrivate
      });

      setSuccess(true);
      setTimeout(() => {
        handleClose();
      }, 1500);

    } catch (err) {
      console.error('[QuickNoteButton] Save error:', err);
      setError('Failed to save note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Get subject display name
  const getSubjectName = () => {
    if (subjectId === 'self') return 'myself';
    const report = directReports.find(r => r.id === subjectId);
    if (report) return report.full_name;
    const employee = allEmployees.find(e => e.id === subjectId);
    return employee?.full_name || 'Unknown';
  };

  // People I can write notes about - direct reports section
  const noteSubjects = [
    { id: 'self', name: 'Myself', description: 'Note about your own work', isSelf: true }
  ];

  // Add direct reports if user is a manager
  directReports.forEach(report => {
    noteSubjects.push({
      id: report.id,
      name: report.full_name,
      avatar_color: report.avatar_color,
      description: 'Direct report',
      isSelf: false
    });
  });

  // Filter other employees (not self, not direct reports) for managers
  const directReportIds = new Set(directReports.map(r => r.id));
  const otherEmployees = allEmployees.filter(emp =>
    emp.id !== currentUserId && !directReportIds.has(emp.id)
  );

  // Apply search filter
  const filteredOtherEmployees = searchTerm
    ? otherEmployees.filter(emp =>
        emp.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : otherEmployees;

  return (
    <>
      {/* Button - either floating or inline */}
      {floating ? (
        <button
          onClick={handleOpen}
          className="fixed bottom-24 right-4 z-40 w-14 h-14 rounded-full bg-violet-500 hover:bg-violet-600 text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center group"
          title="Quick Note"
        >
          <MessageSquarePlus size={24} />
          <span className="absolute right-full mr-3 px-3 py-1.5 bg-zinc-900 dark:bg-zinc-700 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Quick Note
          </span>
        </button>
      ) : (
        <button
          onClick={handleOpen}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-violet-500 hover:bg-violet-600 text-white shadow-md transition-all min-h-[44px]"
          title="Quick Note"
        >
          <MessageSquarePlus size={18} />
          <span className="hidden sm:inline">Quick Note</span>
        </button>
      )}

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                  <MessageSquarePlus size={20} className="text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white">
                    Quick Note
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Capture a thought for future reference
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
              >
                <X size={20} className="text-zinc-500" />
              </button>
            </div>

            {/* Success State */}
            {success ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(148, 175, 50, 0.1)' }}>
                  <CheckCircle size={32} style={{ color: '#94AF32' }} />
                </div>
                <p className="text-lg font-medium text-zinc-900 dark:text-white">Note Saved!</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                  Your note about {getSubjectName()} has been saved.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
                <div className="p-4 space-y-4">
                  {/* Who is this about? */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      Who is this note about?
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {noteSubjects.map(subject => {
                        const isSelected = subjectId === subject.id;
                        return (
                          <button
                            key={subject.id}
                            type="button"
                            onClick={() => {
                              setSubjectId(subject.id);
                              setShowOtherEmployees(false);
                            }}
                            className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-left ${
                              isSelected
                                ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                                : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                            }`}
                          >
                            {subject.isSelf ? (
                              <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center">
                                <User size={16} className="text-violet-600 dark:text-violet-400" />
                              </div>
                            ) : (
                              <TechnicianAvatar
                                name={subject.name}
                                color={subject.avatar_color}
                                size="sm"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm font-medium truncate ${
                                isSelected ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-900 dark:text-white'
                              }`}>
                                {subject.name}
                              </p>
                              <p className="text-xs text-zinc-500 truncate">{subject.description}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Other Employees Section (for managers) */}
                    {isManager && otherEmployees.length > 0 && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => setShowOtherEmployees(!showOtherEmployees)}
                          className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                        >
                          {showOtherEmployees ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          <Users size={16} />
                          <span>Other Employees ({otherEmployees.length})</span>
                        </button>

                        {showOtherEmployees && (
                          <div className="mt-2 border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
                            {/* Search */}
                            <div className="p-2 border-b border-zinc-200 dark:border-zinc-700">
                              <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                                <input
                                  type="text"
                                  value={searchTerm}
                                  onChange={(e) => setSearchTerm(e.target.value)}
                                  placeholder="Search employees..."
                                  className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                />
                              </div>
                            </div>

                            {/* Employee List */}
                            <div className="max-h-48 overflow-y-auto">
                              {filteredOtherEmployees.length === 0 ? (
                                <p className="p-3 text-sm text-zinc-500 text-center">
                                  {searchTerm ? 'No employees match your search' : 'No other employees'}
                                </p>
                              ) : (
                                filteredOtherEmployees.map(emp => {
                                  const isSelected = subjectId === emp.id;
                                  return (
                                    <button
                                      key={emp.id}
                                      type="button"
                                      onClick={() => setSubjectId(emp.id)}
                                      className={`w-full flex items-center gap-2 p-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors ${
                                        isSelected ? 'bg-violet-50 dark:bg-violet-900/20' : ''
                                      }`}
                                    >
                                      <TechnicianAvatar
                                        name={emp.full_name}
                                        color={emp.avatar_color}
                                        size="sm"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-medium truncate ${
                                          isSelected ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-900 dark:text-white'
                                        }`}>
                                          {emp.full_name}
                                        </p>
                                        <p className="text-xs text-zinc-500 truncate">{emp.email}</p>
                                      </div>
                                      {isSelected && (
                                        <CheckCircle size={16} className="text-violet-500 flex-shrink-0" />
                                      )}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Note Type */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      Type of note
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {NOTE_TYPES.map(type => {
                        const Icon = type.icon;
                        const isSelected = noteType === type.id;
                        return (
                          <button
                            key={type.id}
                            type="button"
                            onClick={() => setNoteType(type.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                              isSelected
                                ? 'ring-2 ring-offset-2 dark:ring-offset-zinc-800'
                                : 'hover:bg-zinc-100 dark:hover:bg-zinc-700'
                            }`}
                            style={{
                              backgroundColor: isSelected ? `${type.color}20` : undefined,
                              color: isSelected ? type.color : '#71717a',
                              ringColor: isSelected ? type.color : undefined
                            }}
                            title={type.description}
                          >
                            <Icon size={16} />
                            {type.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Note Text */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                      Your note
                    </label>
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder={subjectId === 'self'
                        ? "What did you accomplish or learn today?"
                        : "What did you observe about this team member?"
                      }
                      rows={4}
                      className="w-full px-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                      autoFocus
                    />
                    <p className="text-xs text-zinc-500 mt-1">
                      This note will be date-stamped and available during performance reviews.
                    </p>
                  </div>

                  {/* Privacy Toggle */}
                  {subjectId !== 'self' && (
                    <label className="flex items-center gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={isPrivate}
                        onChange={(e) => setIsPrivate(e.target.checked)}
                        className="rounded border-zinc-300 text-violet-500 focus:ring-violet-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Lock size={14} className="text-zinc-500" />
                          <span className="text-sm font-medium text-zinc-900 dark:text-white">Private note</span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Only you can see this note (won't be visible to employee)
                        </p>
                      </div>
                    </label>
                  )}

                  {/* Error */}
                  {error && (
                    <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-zinc-200 dark:border-zinc-700 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={saving}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !noteText.trim()}
                    className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Send size={16} />
                        Save Note
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default QuickNoteButton;
