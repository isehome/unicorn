/**
 * EmployeeNotesList.js
 *
 * Displays notes about an employee that can be incorporated into reviews.
 * Used in the manager review interface to show captured observations.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { hrService } from '../../services/hrService';
import TechnicianAvatar from '../TechnicianAvatar';
import {
  MessageSquare,
  Star,
  ThumbsUp,
  TrendingUp,
  AlertTriangle,
  FileText,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Clock,
  Lock
} from 'lucide-react';

// Note type icons and colors
const NOTE_TYPE_CONFIG = {
  accomplishment: { icon: Star, color: '#10B981', label: 'Accomplishment' },
  positive: { icon: ThumbsUp, color: '#3B82F6', label: 'Positive' },
  improvement: { icon: TrendingUp, color: '#F59E0B', label: 'Improvement' },
  concern: { icon: AlertTriangle, color: '#EF4444', label: 'Concern' },
  general: { icon: FileText, color: '#64748B', label: 'General' }
};

const EmployeeNotesList = ({
  employeeId,
  reviewCycleId = null,
  onIncorporate = null, // Callback when note is incorporated into review
  showIncorporated = false,
  compact = false
}) => {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [incorporating, setIncorporating] = useState(null);

  // Load notes
  const loadNotes = useCallback(async () => {
    if (!employeeId) return;

    try {
      setLoading(true);
      const data = showIncorporated
        ? await hrService.getNotesAboutEmployee(employeeId, { includePrivate: true })
        : await hrService.getUnincorporatedNotes(employeeId, reviewCycleId);
      setNotes(data || []);
    } catch (err) {
      console.error('[EmployeeNotesList] Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [employeeId, reviewCycleId, showIncorporated]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Handle incorporate action
  const handleIncorporate = async (noteId, sessionId) => {
    try {
      setIncorporating(noteId);
      await hrService.markNoteIncorporated(noteId, sessionId);

      // Refresh notes
      await loadNotes();

      // Call parent callback if provided
      if (onIncorporate) {
        onIncorporate(noteId);
      }
    } catch (err) {
      console.error('[EmployeeNotesList] Incorporate error:', err);
    } finally {
      setIncorporating(null);
    }
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-zinc-500">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm">Loading notes...</span>
      </div>
    );
  }

  if (notes.length === 0) {
    return null; // Don't show section if no notes
  }

  return (
    <div className={`rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden ${compact ? '' : 'bg-amber-50 dark:bg-amber-900/10'}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageSquare size={16} className="text-amber-500" />
          <span className="text-sm font-medium text-zinc-900 dark:text-white">
            Captured Notes
          </span>
          <span className="px-1.5 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-600 dark:text-amber-400">
            {notes.length}
          </span>
        </div>
        {expanded ? (
          <ChevronDown size={16} className="text-zinc-400" />
        ) : (
          <ChevronRight size={16} className="text-zinc-400" />
        )}
      </button>

      {/* Notes List */}
      {expanded && (
        <div className="border-t border-zinc-200 dark:border-zinc-700 divide-y divide-zinc-200 dark:divide-zinc-700">
          {notes.map(note => {
            const typeConfig = NOTE_TYPE_CONFIG[note.note_type] || NOTE_TYPE_CONFIG.general;
            const TypeIcon = typeConfig.icon;
            const isMyNote = note.author_id === user?.id;
            const isIncorporating = incorporating === note.id;

            return (
              <div
                key={note.id}
                className={`p-3 ${note.incorporated_at ? 'bg-zinc-50 dark:bg-zinc-800/30 opacity-60' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {/* Note Type Icon */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${typeConfig.color}20` }}
                  >
                    <TypeIcon size={16} style={{ color: typeConfig.color }} />
                  </div>

                  {/* Note Content */}
                  <div className="flex-1 min-w-0">
                    {/* Meta info */}
                    <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-500 dark:text-zinc-400 mb-1">
                      <span style={{ color: typeConfig.color }} className="font-medium">
                        {typeConfig.label}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {formatDate(note.created_at)}
                      </span>
                      {!isMyNote && note.author && (
                        <>
                          <span>·</span>
                          <span>by {note.author.full_name}</span>
                        </>
                      )}
                      {note.is_private && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1 text-amber-500">
                            <Lock size={10} />
                            Private
                          </span>
                        </>
                      )}
                    </div>

                    {/* Note text */}
                    <p className="text-sm text-zinc-800 dark:text-zinc-200">
                      {note.note_text}
                    </p>

                    {/* Incorporated badge or action button */}
                    {note.incorporated_at ? (
                      <div className="flex items-center gap-1 mt-2 text-xs" style={{ color: '#94AF32' }}>
                        <CheckCircle size={12} />
                        Incorporated into review
                      </div>
                    ) : onIncorporate && (
                      <button
                        onClick={() => handleIncorporate(note.id, null)}
                        disabled={isIncorporating}
                        className="mt-2 text-xs text-violet-500 hover:text-violet-600 font-medium disabled:opacity-50"
                      >
                        {isIncorporating ? (
                          <span className="flex items-center gap-1">
                            <Loader2 size={12} className="animate-spin" />
                            Marking...
                          </span>
                        ) : (
                          '+ Add to review'
                        )}
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
};

export default EmployeeNotesList;
