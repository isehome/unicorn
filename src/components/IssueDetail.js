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
import { ArrowLeft, Send, UserPlus, Trash2, AlertTriangle, Image as ImageIcon } from 'lucide-react';

const IssueDetail = () => {
  const { id: projectId, issueId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
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

  const handleToggleBlocked = async () => {
    if (!issue?.id) return;
    try {
      const next = (issue.status || '').toLowerCase() === 'blocked' ? 'open' : 'blocked';
      const updated = await issuesService.update(issue.id, { status: next });
      if (updated) setIssue(updated);
    } catch (e) {
      setError(e.message || 'Failed to update status');
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{issue?.title}</div>
            {issue?.description && <div className={`text-sm ${ui.subtle}`}>{issue.description}</div>}
            <div className={`text-xs ${ui.subtle}`}>Priority: {issue?.priority || '—'} • Status: {issue?.status || '—'}</div>
          </div>
          <Button
            size="sm"
            variant={(issue?.status || '').toLowerCase() === 'blocked' ? 'warning' : 'secondary'}
            icon={AlertTriangle}
            onClick={handleToggleBlocked}
          >
            {(issue?.status || '').toLowerCase() === 'blocked' ? 'Unblock' : 'Mark Blocked'}
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border p-4 space-y-3" style={sectionStyles.card}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Photos</h3>
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={handleUploadPhoto} />
            <span className={`px-3 py-1.5 rounded-lg border ${ui.subtle}`}>Upload</span>
          </label>
        </div>
        {photos.length === 0 ? (
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
        {error && <div className="text-xs text-rose-500">{error}</div>}
      </section>

      <section className="rounded-2xl border p-4 space-y-3" style={sectionStyles.card}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Stakeholders</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                disabled={tagging}
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
            className={ui.input}
          />
          <Button variant="primary" icon={Send} onClick={handleAddComment} disabled={saving || !commentText.trim()}>Send</Button>
        </div>
      </section>
    </div>
  );
};

export default IssueDetail;
