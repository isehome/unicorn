/**
 * ServiceTriageForm.js
 * Triage section for service tickets - captures timestamped comments, estimated hours
 * Auto-populates triaged_by from current user (no dropdown selector)
 */

import React, { useState, useEffect } from 'react';
import { ClipboardCheck, Clock, Package, FileText, Loader2, CheckCircle, User, Send, MessageSquare } from 'lucide-react';
import { serviceTriageService } from '../../services/serviceTicketService';
import { useAuth } from '../../contexts/AuthContext';
import { brandColors } from '../../styles/styleSystem';

/**
 * Format timestamp for display
 */
const formatTimestamp = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * TriageComment Component - displays a single triage comment
 */
const TriageComment = ({ comment }) => {
  return (
    <div className="p-3 bg-zinc-700/50 rounded-lg mb-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 text-sm">
          <User size={14} className="text-zinc-400" />
          <span className="text-zinc-300 font-medium">{comment.author_name || 'Unknown'}</span>
        </div>
        <span className="text-xs text-zinc-500">{formatTimestamp(comment.created_at)}</span>
      </div>
      <p className="text-zinc-300 text-sm whitespace-pre-wrap">{comment.content}</p>
    </div>
  );
};

const ServiceTriageForm = ({ ticket, onUpdate }) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [addingComment, setAddingComment] = useState(false);

  // Form state
  const [newComment, setNewComment] = useState('');
  const [triageData, setTriageData] = useState({
    estimated_hours: ticket?.estimated_hours || '',
    parts_needed: ticket?.parts_needed || false,
    proposal_needed: ticket?.proposal_needed || false
  });

  // Parse triage comments from ticket
  const triageComments = Array.isArray(ticket?.triage_comments)
    ? ticket.triage_comments
    : (typeof ticket?.triage_comments === 'string' && ticket?.triage_comments
        ? JSON.parse(ticket.triage_comments)
        : []);

  // Update form when ticket changes
  useEffect(() => {
    if (ticket) {
      setTriageData({
        estimated_hours: ticket.estimated_hours || '',
        parts_needed: ticket.parts_needed || false,
        proposal_needed: ticket.proposal_needed || false
      });
    }
  }, [ticket]);

  /**
   * Add a new triage comment
   */
  const handleAddComment = async () => {
    if (!ticket?.id || !newComment.trim()) return;

    try {
      setAddingComment(true);
      await serviceTriageService.addTriageComment(ticket.id, {
        content: newComment.trim(),
        author_id: user?.id,
        author_name: user?.name || user?.email || 'User'
      });

      setNewComment('');
      if (onUpdate) {
        await onUpdate();
      }
    } catch (err) {
      console.error('[ServiceTriageForm] Failed to add comment:', err);
    } finally {
      setAddingComment(false);
    }
  };

  /**
   * Save triage data (estimated hours, parts/proposal flags)
   * Auto-populates triaged_by from current user
   */
  const handleSave = async () => {
    if (!ticket?.id) return;

    try {
      setSaving(true);
      await serviceTriageService.saveTriage(ticket.id, {
        // Auto-populate from current user - no dropdown needed
        triaged_by: user?.id,
        triaged_by_name: user?.name || user?.email || 'User',
        estimated_hours: triageData.estimated_hours ? parseFloat(triageData.estimated_hours) : null,
        parts_needed: triageData.parts_needed,
        proposal_needed: triageData.proposal_needed
      });

      if (onUpdate) {
        await onUpdate();
      }
    } catch (err) {
      console.error('[ServiceTriageForm] Failed to save triage:', err);
    } finally {
      setSaving(false);
    }
  };

  const isTriaged = Boolean(ticket?.triaged_at);

  return (
    <div className="space-y-4">
      {/* Triage Status Banner */}
      {isTriaged && (
        <div className="flex items-center gap-2 p-3 rounded-lg border"
          style={{
            backgroundColor: 'rgba(148, 175, 50, 0.1)',
            borderColor: 'rgba(148, 175, 50, 0.3)'
          }}
        >
          <CheckCircle size={18} style={{ color: brandColors.success }} />
          <div className="flex-1">
            <span className="text-sm" style={{ color: brandColors.success }}>
              Triaged by {ticket.triaged_by_name || 'Unknown'}
            </span>
            <span className="text-xs text-zinc-400 ml-2">
              {ticket.triaged_at ? formatTimestamp(ticket.triaged_at) : ''}
            </span>
          </div>
        </div>
      )}

      {/* Triage Comments Section */}
      <div>
        <label className="text-sm text-zinc-400 mb-1.5 block flex items-center gap-2">
          <MessageSquare size={14} />
          Triage Comments ({triageComments.length})
        </label>

        {/* Existing Comments */}
        <div className="max-h-60 overflow-y-auto mb-3">
          {triageComments.length > 0 ? (
            [...triageComments]
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              .map((comment, index) => (
                <TriageComment key={comment.id || index} comment={comment} />
              ))
          ) : (
            <div className="text-zinc-500 text-sm py-2">No triage comments yet</div>
          )}
        </div>

        {/* Add New Comment */}
        <div className="flex gap-2">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            rows={2}
            placeholder="Add a triage comment..."
            className="flex-1 px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey) {
                e.preventDefault();
                handleAddComment();
              }
            }}
          />
          <button
            onClick={handleAddComment}
            disabled={!newComment.trim() || addingComment}
            className="px-3 py-2 rounded-lg disabled:opacity-50 transition-colors self-end"
            style={{ backgroundColor: brandColors.success, color: '#000' }}
            title="Add comment (⌘+Enter)"
          >
            {addingComment ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
        <p className="text-xs text-zinc-500 mt-1">Press ⌘+Enter to add comment</p>
      </div>

      {/* Estimated Hours */}
      <div>
        <label className="text-sm text-zinc-400 mb-1.5 block flex items-center gap-2">
          <Clock size={14} />
          Estimated Time to Complete (hours)
        </label>
        <input
          type="number"
          value={triageData.estimated_hours}
          onChange={(e) => setTriageData(prev => ({ ...prev, estimated_hours: e.target.value }))}
          min="0"
          step="0.5"
          placeholder="e.g., 2.5"
          className="w-full px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white placeholder-zinc-400 focus:outline-none focus:border-zinc-500"
        />
        <p className="text-xs text-zinc-500 mt-1">Enter in 0.5 hour increments (0.5, 1, 1.5, etc.)</p>
      </div>

      {/* Parts Needed Toggle */}
      <div className="flex items-center gap-3 p-3 bg-zinc-700/50 rounded-lg">
        <input
          type="checkbox"
          id="partsNeeded"
          checked={triageData.parts_needed}
          onChange={(e) => setTriageData(prev => ({ ...prev, parts_needed: e.target.checked }))}
          className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-violet-600 focus:ring-violet-500"
        />
        <label htmlFor="partsNeeded" className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
          <Package size={16} />
          Parts/Equipment Required
        </label>
      </div>

      {/* Proposal Needed Toggle */}
      <div className="flex items-center gap-3 p-3 bg-zinc-700/50 rounded-lg">
        <input
          type="checkbox"
          id="proposalNeeded"
          checked={triageData.proposal_needed}
          onChange={(e) => setTriageData(prev => ({ ...prev, proposal_needed: e.target.checked }))}
          className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-violet-600 focus:ring-violet-500"
        />
        <label htmlFor="proposalNeeded" className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer">
          <FileText size={16} />
          Customer Proposal Needed
        </label>
      </div>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg disabled:opacity-50 transition-colors"
          style={{ backgroundColor: brandColors.success, color: '#000' }}
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <CheckCircle size={16} />
              {isTriaged ? 'Update Triage' : 'Save Triage'}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ServiceTriageForm;
