import React, { useCallback, useEffect, useState, useMemo } from 'react';
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
import { supabase, uploadPublicImage, toThumb } from '../lib/supabase';
import { ArrowLeft, Plus, Trash2, AlertTriangle, CheckCircle, Image as ImageIcon } from 'lucide-react';

const IssueDetail = () => {
  const { id: projectId, issueId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const palette = theme.palette;
  const ui = useMemo(() => {
    const isDark = mode === 'dark';
    return {
      input: `w-full px-3 py-2 rounded-xl border ${isDark ? 'bg-slate-900 text-gray-100 border-gray-700' : 'bg-white text-gray-900 border-gray-300'}`,
      select: `w-full px-3 py-2 rounded-xl border pr-8 ${isDark ? 'bg-slate-900 text-gray-100 border-gray-700' : 'bg-white text-gray-900 border-gray-300'}`,
      subtle: isDark ? 'text-gray-400' : 'text-gray-600',
    };
  }, [mode]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [issue, setIssue] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [tags, setTags] = useState([]);
  const [availableProjectStakeholders, setAvailableProjectStakeholders] = useState([]);
  const [tagging, setTagging] = useState(false);
  const [error, setError] = useState('');
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsText, setDetailsText] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newDueDate, setNewDueDate] = useState('');

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
        setDetailsText(String(issueData?.description ?? issueData?.notes ?? ''));
        // load photos
        const { data: photoData } = await supabase
          .from('issue_photos')
          .select('*')
          .eq('issue_id', issueId)
          .order('created_at', { ascending: true });
        setPhotos(photoData || []);
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
        setIssue(null);
        setComments([]);
        setTags([]);
        setPhotos([]);
        setDetailsText('');
        setNewTitle('');
        setNewPriority('medium');
        setNewDueDate('');
        setCommentText('');
        setEditingDetails(false);
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
    if (evt) evt.preventDefault();
    const title = newTitle.trim();
    if (!title) {
      setError('A title is required.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const ownerMatch = user?.email
        ? availableProjectStakeholders.find(p => (p.email || '').toLowerCase() === (user.email || '').toLowerCase())
        : null;
      let creatorProfileId = null;
      if (user?.id) {
        try {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();
          if (profileRow?.id) creatorProfileId = profileRow.id;
        } catch (_) {
          creatorProfileId = null;
        }
      }
      const assignedTo = ownerMatch?.profile_id || creatorProfileId || null;
      const payload = {
        project_id: projectId,
        title,
        description: detailsText,
        priority: newPriority,
        status: 'open',
        assigned_to: assignedTo,
        created_by: creatorProfileId,
        due_date: newDueDate || null
      };
      const created = await issuesService.create(payload);

      // Auto-tag creator as owner if they exist as project stakeholder
      if (created?.id && ownerMatch?.assignment_id) {
        try { await issueStakeholderTagsService.add(created.id, ownerMatch.assignment_id, 'owner'); } catch (_) {}
      }

      navigate(`/project/${projectId}/issues/${created.id}`);
    } catch (e) {
      setError(e.message || 'Failed to create issue');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDetails = async () => {
    if (!issue?.id) return;
    try {
      setSaving(true);
      const key = (issue && Object.prototype.hasOwnProperty.call(issue, 'description'))
        ? 'description'
        : (Object.prototype.hasOwnProperty.call(issue || {}, 'notes') ? 'notes' : 'description');
      const updated = await issuesService.update(issue.id, { [key]: detailsText });
      if (updated) {
        setIssue(updated);
        setEditingDetails(false);
      }
    } catch (e) {
      setError(e.message || 'Failed to save details');
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
      // Only include author_id if a matching profile exists to satisfy FK
      let author_id = null;
      if (user?.id) {
        const { data: profileRow } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .maybeSingle();
        if (profileRow?.id) author_id = user.id;
      }
      const created = await issueCommentsService.add(issue.id, {
        author_id,
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

  const handleUploadPhoto = async (evt) => {
    const file = evt.target.files?.[0];
    if (!file || !issue?.id) return;
    try {
      setUploading(true);
      const path = `issues/${issue.id}/${Date.now()}`;
      const url = await uploadPublicImage(file, path);
      const { data, error } = await supabase
        .from('issue_photos')
        .insert([{ issue_id: issue.id, url, file_name: file.name, content_type: file.type, size_bytes: file.size }])
        .select()
        .single();
      if (error) throw error;
      setPhotos(prev => [...prev, data]);
    } catch (e) {
      setError(e.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
      evt.target.value = '';
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

  if (error && !isNew) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="text-rose-600 text-sm mb-3">{error}</div>
        <Button variant="secondary" icon={ArrowLeft} onClick={() => navigate(-1)}>Back</Button>
      </div>
    );
  }

  const content = (
    <>
      <section className="rounded-2xl border p-4 space-y-3" style={sectionStyles.card}>
        {isNew ? (
          <div className="space-y-3">
            <div>
              <label className="block text-sm mb-1">Title</label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Issue title"
                className={ui.input}
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1">Priority</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className={ui.select}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">Due date</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className={ui.input}
                />
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-lg font-semibold">{issue?.title}</div>
            <div className={`text-xs ${ui.subtle}`}>
              Priority: {issue?.priority || '—'} • Status: {(issue?.status || 'open').toUpperCase()}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Details</h3>
          {isNew ? (
            <span className={`text-xs ${ui.subtle}`}>Provide context for this issue.</span>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant={issue?.is_blocked ? 'danger' : 'secondary'}
                size="sm"
                icon={AlertTriangle}
                onClick={async () => {
                  const next = !issue?.is_blocked;
                  try {
                    const updated = await issuesService.update(issue.id, { is_blocked: next });
                    if (updated) setIssue(prev => ({ ...prev, is_blocked: next }));
                  } catch (_) {
                    const fallback = next ? 'blocked' : 'open';
                    try {
                      const updated = await issuesService.update(issue.id, { status: fallback });
                      if (updated) setIssue(prev => ({ ...prev, status: fallback }));
                    } catch (err) {}
                  }
                }}
              >
                {issue?.is_blocked ? 'Unblock' : 'Mark Blocked'}
              </Button>
              <Button
                variant={(issue?.status || '').toLowerCase() === 'resolved' ? 'success' : 'secondary'}
                size="sm"
                icon={CheckCircle}
                onClick={async () => {
                  const isResolved = (issue?.status || '').toLowerCase() === 'resolved';
                  const nextStatus = isResolved ? 'open' : 'resolved';
                  try {
                    const updated = await issuesService.update(issue.id, { status: nextStatus, is_blocked: false });
                    if (updated) setIssue(prev => ({ ...prev, status: nextStatus, is_blocked: false }));
                  } catch (err) {}
                }}
              >
                {(issue?.status || '').toLowerCase() === 'resolved' ? 'Reopen' : 'Mark Resolved'}
              </Button>
              {!editingDetails && (
                <Button variant="secondary" size="sm" onClick={() => setEditingDetails(true)}>Edit</Button>
              )}
            </div>
          )}
        </div>
        {isNew ? (
          <textarea
            rows={6}
            value={detailsText}
            onChange={(e) => setDetailsText(e.target.value)}
            className={ui.input}
            placeholder="Describe the issue…"
          />
        ) : editingDetails ? (
          <>
            <textarea
              rows={5}
              value={detailsText}
              onChange={(e) => setDetailsText(e.target.value)}
              className={ui.input}
              placeholder="Describe the issue…"
            />
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={handleSaveDetails} loading={saving}>Save</Button>
              <Button variant="secondary" size="sm" onClick={() => { setEditingDetails(false); setDetailsText(String(issue?.description ?? issue?.notes ?? '')); }} disabled={saving}>Cancel</Button>
            </div>
          </>
        ) : (
          <p className={`text-sm ${ui.subtle}`}>{detailsText || 'No additional details provided.'}</p>
        )}
      </section>

      <section className="rounded-2xl border p-4 space-y-3" style={sectionStyles.card}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Photos</h3>
          <label className={`inline-flex items-center gap-2 text-sm ${isNew ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUploadPhoto}
              disabled={isNew}
            />
            <span className={`px-3 py-1.5 rounded-lg border ${ui.subtle}`}>
              {isNew ? 'Upload after save' : 'Upload'}
            </span>
          </label>
        </div>
        {isNew ? (
          <div className={`text-sm ${ui.subtle}`}>Add photos after creating the issue.</div>
        ) : photos.length === 0 ? (
          <div className={`text-sm ${ui.subtle} flex items-center gap-2`}>
            <ImageIcon size={16} /> No photos yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((p) => (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border">
                <img src={toThumb(p.url, { width: 480, height: 320 })} alt={p.file_name || 'photo'} className="w-full h-28 object-cover" />
              </a>
            ))}
          </div>
        )}
        {uploading && <div className={`text-xs ${ui.subtle}`}>Uploading…</div>}
        {!isNew && error && <div className="text-xs text-rose-500">{error}</div>}
      </section>

      <section className="rounded-2xl border p-4 space-y-3" style={sectionStyles.card}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Stakeholders</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                disabled={tagging || isNew}
                onChange={(e) => { const v = e.target.value; if (v) { handleTagStakeholder(v); e.target.value=''; } }}
                className={ui.select}
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
          </div>
        </div>
        {isNew ? (
          <div className={`text-sm ${ui.subtle}`}>Add stakeholders after creating the issue.</div>
        ) : tags.length === 0 ? (
          <div className="text-sm text-gray-600 dark:text-gray-300">No stakeholders tagged.</div>
        ) : (
          <div className="space-y-2">
            {tags.map(tag => (
              <div key={tag.tag_id} className="flex items-center justify-between px-3 py-2 rounded-xl border">
                <div className="flex items-start gap-2">
                  <span
                    className="mt-1 inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: tag.is_internal ? palette.accent : palette.success }}
                  />
                  <div>
                    <div className="text-sm font-medium">
                      {tag.contact_name} <span className="text-xs text-gray-500">({tag.role_name})</span>
                    </div>
                    <div className="text-xs text-gray-500">{tag.tag_type || 'assigned'} • {new Date(tag.tagged_at).toLocaleString()}</div>
                  </div>
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
        {isNew ? (
          <div className={`text-sm ${ui.subtle}`}>Comments will be available after the issue is created.</div>
        ) : comments.length === 0 ? (
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
            placeholder={isNew ? 'Create the issue to add comments.' : 'Add a comment…'}
            className={ui.input}
            disabled={isNew}
          />
          <Button
            variant="primary"
            icon={Plus}
            onClick={handleAddComment}
            disabled={isNew || saving || !commentText.trim()}
          >
            Add
          </Button>
        </div>
      </section>

      {isNew && (
        <div className="flex items-center justify-between">
          {error ? <div className="text-sm text-rose-500">{error}</div> : <span />}
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" icon={ArrowLeft} onClick={() => navigate(-1)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" icon={Plus} loading={saving}>
              Create Issue
            </Button>
          </div>
        </div>
      )}
    </>
  );

  if (isNew) {
    return (
      <form onSubmit={handleCreate} className="max-w-4xl mx-auto p-4 space-y-4">
        {content}
      </form>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {content}
    </div>
  );
};

export default IssueDetail;
