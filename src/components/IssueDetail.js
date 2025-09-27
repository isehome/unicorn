import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Button from './ui/Button';
import { enhancedStyles } from '../styles/styleSystem';
import { useTheme } from '../contexts/ThemeContext';
import {
  issuesService,
  issueCommentsService,
  issueStakeholderTagsService,
  projectStakeholdersService
} from '../services/supabaseService';
import { ArrowLeft, Send, UserPlus, Trash2 } from 'lucide-react';

const IssueDetail = () => {
  const { id: projectId, issueId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [issue, setIssue] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [tags, setTags] = useState([]);
  const [availableProjectStakeholders, setAvailableProjectStakeholders] = useState([]);
  const [tagging, setTagging] = useState(false);
  const [error, setError] = useState('');

  const isNew = issueId === 'new';

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      if (!isNew) {
        const [issueData, commentsData, tagsData, projectStakeholders] = await Promise.all([
          issuesService.getById(issueId),
          issueCommentsService.getForIssue(issueId),
          issueStakeholderTagsService.getDetailed(issueId),
          projectStakeholdersService.getForProject(projectId)
        ]);
        setIssue(issueData);
        setComments(commentsData);
        setTags(tagsData);
        const combined = [
          ...(projectStakeholders.internal || []).map(p => ({ ...p, category: 'internal' })),
          ...(projectStakeholders.external || []).map(p => ({ ...p, category: 'external' }))
        ];
        setAvailableProjectStakeholders(combined);
      } else {
        // For new issue form, preload stakeholders list
        const projectStakeholders = await projectStakeholdersService.getForProject(projectId);
        const combined = [
          ...(projectStakeholders.internal || []).map(p => ({ ...p, category: 'internal' })),
          ...(projectStakeholders.external || []).map(p => ({ ...p, category: 'external' }))
        ];
        setAvailableProjectStakeholders(combined);
      }
    } catch (e) {
      setError(e.message || 'Failed to load issue');
    } finally {
      setLoading(false);
    }
  }, [projectId, issueId, isNew]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = async (evt) => {
    evt.preventDefault();
    const form = new FormData(evt.currentTarget);
    const title = String(form.get('title') || '').trim();
    if (!title) return;
    try {
      setSaving(true);
      setError('');
      const payload = {
        project_id: projectId,
        title,
        description: String(form.get('description') || ''),
        priority: String(form.get('priority') || 'medium'),
        status: 'open',
        assigned_to: user?.id || null,
        created_by: user?.id || null,
        due_date: form.get('due_date') || null
      };
      const created = await issuesService.create(payload);

      // Auto-tag creator as owner if they exist as project stakeholder
      if (created?.id && user?.email && availableProjectStakeholders.length) {
        const match = availableProjectStakeholders.find(p => (p.email || '').toLowerCase() === (user.email || '').toLowerCase());
        if (match?.assignment_id) {
          try { await issueStakeholderTagsService.add(created.id, match.assignment_id, 'owner'); } catch (_) {}
        }
      }

      navigate(`/project/${projectId}/issues/${created.id}`);
    } catch (e) {
      setError(e.message || 'Failed to create issue');
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async () => {
    const text = commentText.trim();
    if (!text || !issue?.id) return;
    try {
      setSaving(true);
      const author_name = user?.full_name || user?.name || user?.email || 'User';
      const author_email = user?.email || null;
      const created = await issueCommentsService.add(issue.id, {
        author_id: user?.id || null,
        author_name,
        author_email,
        comment_text: text,
        is_internal: true
      });
      if (created) {
        setComments(prev => [...prev, created]);
        setCommentText('');
      }
    } catch (e) {
      setError(e.message || 'Failed to add comment');
    } finally {
      setSaving(false);
    }
  };

  const handleTagStakeholder = async (assignmentId) => {
    if (!issue?.id || !assignmentId) return;
    try {
      setTagging(true);
      await issueStakeholderTagsService.add(issue.id, assignmentId, 'assigned');
      const updated = await issueStakeholderTagsService.getDetailed(issue.id);
      setTags(updated);
    } catch (e) {
      setError(e.message || 'Failed to tag stakeholder');
    } finally {
      setTagging(false);
    }
  };

  const handleRemoveTag = async (tagId) => {
    try {
      await issueStakeholderTagsService.remove(tagId);
      setTags(prev => prev.filter(t => t.tag_id !== tagId));
    } catch (e) {
      setError(e.message || 'Failed to remove tag');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="text-rose-600 text-sm mb-3">{error}</div>
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(-1)}>Back</Button>
      </div>
    );
  }

  if (isNew) {
    return (
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={() => navigate(-1)}>Back</Button>
          <div className="text-xs text-gray-500">New Issue</div>
        </div>
        <form onSubmit={handleCreate} className="rounded-2xl border p-4" style={sectionStyles.card}>
          <div className="grid gap-3">
            <div>
              <label className="block text-sm mb-1">Title</label>
              <input name="title" required className="w-full px-3 py-2 rounded-xl border" />
            </div>
            <div>
              <label className="block text-sm mb-1">Description</label>
              <textarea name="description" rows="4" className="w-full px-3 py-2 rounded-xl border" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">Priority</label>
                <select name="priority" defaultValue="medium" className="w-full px-3 py-2 rounded-xl border">
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Due date</label>
                <input type="date" name="due_date" className="w-full px-3 py-2 rounded-xl border" />
              </div>
            </div>
            <div className="pt-2">
              <Button type="submit" variant="primary" loading={saving}>Create</Button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="secondary" size="sm" icon={ArrowLeft} onClick={() => navigate(-1)}>Back</Button>
        <div className="text-xs text-gray-500">Issue Details</div>
      </div>

      <section className="rounded-2xl border p-4 space-y-1" style={sectionStyles.card}>
        <div className="text-lg font-semibold">{issue?.title}</div>
        {issue?.description && <div className="text-sm text-gray-600 dark:text-gray-300">{issue.description}</div>}
        <div className="text-xs text-gray-500">Priority: {issue?.priority || '—'} • Status: {issue?.status || '—'}</div>
      </section>

      <section className="rounded-2xl border p-4 space-y-3" style={sectionStyles.card}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Stakeholders</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                disabled={tagging}
                onChange={(e) => { const v = e.target.value; if (v) { handleTagStakeholder(v); e.target.value=''; } }}
                className="px-3 py-2 rounded-xl border"
                defaultValue=""
              >
                <option value="" disabled>Add stakeholder…</option>
                {availableProjectStakeholders.map(p => (
                  <option key={p.assignment_id} value={p.assignment_id}>
                    {p.contact_name} ({p.role_name}) {p.category === 'internal' ? '• Internal' : '• External'}
                  </option>
                ))}
              </select>
            </div>
            <Button variant="secondary" size="sm" icon={UserPlus} disabled={tagging}>Add</Button>
          </div>
        </div>
        {tags.length === 0 ? (
          <div className="text-sm text-gray-600 dark:text-gray-300">No stakeholders tagged.</div>
        ) : (
          <div className="space-y-2">
            {tags.map(tag => (
              <div key={tag.tag_id} className="flex items-center justify-between px-3 py-2 rounded-xl border">
                <div>
                  <div className="text-sm font-medium">{tag.contact_name} <span className="text-xs text-gray-500">({tag.role_name})</span></div>
                  <div className="text-xs text-gray-500">{tag.tag_type || 'assigned'} • {new Date(tag.tagged_at).toLocaleString()}</div>
                </div>
                <button className="text-rose-500" onClick={() => handleRemoveTag(tag.tag_id)} title="Remove">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border p-4 space-y-3" style={sectionStyles.card}>
        <h3 className="text-sm font-semibold">Comments</h3>
        {comments.length === 0 ? (
          <div className="text-sm text-gray-600 dark:text-gray-300">No comments yet.</div>
        ) : (
          <div className="space-y-2">
            {comments.map((c) => (
              <div key={c.id} className="px-3 py-2 rounded-xl border">
                <div className="text-sm">{c.comment_text}</div>
                <div className="text-xs text-gray-500 mt-1">by {c.author_name || c.author_email || 'User'} • {new Date(c.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add a comment…"
            className="flex-1 px-3 py-2 rounded-xl border"
          />
          <Button variant="primary" icon={Send} onClick={handleAddComment} disabled={saving || !commentText.trim()}>Send</Button>
        </div>
      </section>
    </div>
  );
};

export default IssueDetail;

