import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Button from './ui/Button';
import { enhancedStyles } from '../styles/styleSystem';
import { useTheme } from '../contexts/ThemeContext';
import {
  issuesService,
  issueCommentsService,
  issueStakeholderTagsService,
  projectStakeholdersService,
  projectsService
} from '../services/supabaseService';
import { supabase } from '../lib/supabase';
import { sharePointStorageService } from '../services/sharePointStorageService';
import { notifyIssueComment, notifyStakeholderAdded } from '../services/issueNotificationService';
import CachedSharePointImage from './CachedSharePointImage';
import { enqueueUpload } from '../lib/offline';
import { compressImage } from '../lib/images';
import { Plus, Trash2, AlertTriangle, CheckCircle, Image as ImageIcon, Mail, Phone, Building, Map, ChevronDown, WifiOff } from 'lucide-react';

const formatStatusLabel = (label = '') => {
  if (!label) return '';
  const normalized = `${label}`.trim();
  if (!normalized) return '';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
};

const deriveStatusDisplayLabel = (currentStatus, nextStatus) => {
  const current = (currentStatus || '').toLowerCase().trim();
  const next = (nextStatus || '').toLowerCase().trim();

  if (current === 'blocked' && next === 'open') {
    return 'Unblocked';
  }

  if (!next) return '';

  if (next === 'blocked') return 'Blocked';
  if (next === 'resolved') return 'Resolved';
  if (next === 'open') return 'Open';

  return formatStatusLabel(next);
};

const getStatusDisplayValue = (status) => {
  const normalized = (status || '').toLowerCase().trim();
  if (normalized === 'blocked') return 'Blocked';
  if (normalized === 'resolved') return 'Resolved';
  if (!normalized || normalized === 'open') return 'Unblocked';
  return formatStatusLabel(status);
};

const IssueDetail = () => {
  const { id: projectId, issueId } = useParams();
  const navigate = useNavigate();
  const { user, acquireToken } = useAuth();
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
  const [expandedStakeholder, setExpandedStakeholder] = useState(null);
  const [projectInfo, setProjectInfo] = useState(null);
  const [draftIssue, setDraftIssue] = useState(null);
  const authorProfileIdRef = useRef(undefined);
  const draftIssuePromiseRef = useRef(null);

  const isNew = issueId === 'new';
  const resolvedIssue = issue || draftIssue || null;
  const activeIssueId = resolvedIssue?.id || null;
  const hasIssueRecord = Boolean(activeIssueId);
  const canManageStakeholders = !isNew || hasIssueRecord;
  const canUploadPhotos = !isNew || hasIssueRecord;
  const canComment = !isNew || hasIssueRecord;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const projectPromise = projectId ? projectsService.getById(projectId) : Promise.resolve(null);

      if (!isNew) {
        const [
          issueData,
          commentsData,
          tagsData,
          projectStakeholders,
          projectDetails
        ] = await Promise.all([
          issuesService.getById(issueId),
          issueCommentsService.getForIssue(issueId),
          issueStakeholderTagsService.getDetailed(issueId),
          projectStakeholdersService.getForProject(projectId),
          projectPromise
        ]);
        
        setDraftIssue(null);
        draftIssuePromiseRef.current = null;

        // Debug logging to check the issue data
        console.log('Issue Data Loaded:', issueData);
        console.log('Is Blocked:', issueData?.is_blocked);
        console.log('Status:', issueData?.status);
        
        setIssue(issueData);
        setComments(commentsData);
        setTags(tagsData);
        setProjectInfo(projectDetails);
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
        const [projectStakeholders, projectDetails] = await Promise.all([
          projectStakeholdersService.getForProject(projectId),
          projectPromise
        ]);
        const combined = [
          ...(projectStakeholders.internal || []).map(p => ({ ...p, category: 'internal' })),
          ...(projectStakeholders.external || []).map(p => ({ ...p, category: 'external' }))
        ];
        setProjectInfo(projectDetails);
        setAvailableProjectStakeholders(combined);
        setDraftIssue(null);
        draftIssuePromiseRef.current = null;
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

  useEffect(() => {
    // Reset cached profile id when user changes
    authorProfileIdRef.current = undefined;
  }, [user?.id]);

  const issueLink = useMemo(() => {
    if (!activeIssueId || !projectId) return '';
    if (typeof window === 'undefined') return '';
    try {
      return `${window.location.origin}/project/${projectId}/issues/${activeIssueId}`;
    } catch {
      return '';
    }
  }, [activeIssueId, projectId]);

  const currentUserSummary = useMemo(() => ({
    name: user?.full_name || user?.name || user?.email || 'User',
    email: user?.email || null
  }), [user?.full_name, user?.name, user?.email]);

  const getAuthorInfo = useCallback(async () => {
    const author_name = user?.full_name || user?.name || user?.email || 'User';
    const author_email = user?.email || null;

    let author_id = null;
    if (user?.id) {
      if (authorProfileIdRef.current === undefined) {
        try {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .maybeSingle();
          authorProfileIdRef.current = profileRow?.id || null;
        } catch (err) {
          console.warn('Failed to resolve author profile id:', err);
          authorProfileIdRef.current = null;
        }
      }
      author_id = authorProfileIdRef.current;
    }

    return { author_id, author_name, author_email };
  }, [user]);

  const resolveCreatorProfileId = useCallback(async () => {
    if (!user?.id) return null;
    try {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();
      return profileRow?.id || null;
    } catch (err) {
      console.warn('Failed to resolve creator profile id:', err);
      return null;
    }
  }, [user?.id]);

  const createIssueRecord = useCallback(async () => {
    const title = newTitle.trim();
    if (!title) {
      throw new Error('Enter a title before adding stakeholders, comments, or photos.');
    }

    const ownerMatch = user?.email
      ? availableProjectStakeholders.find(
          p => (p.email || '').toLowerCase() === (user.email || '').toLowerCase()
        )
      : null;

    const creatorProfileId = await resolveCreatorProfileId();
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

    setSaving(true);
    try {
      const created = await issuesService.create(payload);
      setDraftIssue(created);

      if (created?.id && ownerMatch?.assignment_id) {
        try {
          await issueStakeholderTagsService.add(created.id, ownerMatch.assignment_id, 'owner');
          const updatedTags = await issueStakeholderTagsService.getDetailed(created.id);
          setTags(updatedTags);
        } catch (tagError) {
          console.warn('Failed to auto-tag owner:', tagError);
        }
      }

      return created;
    } finally {
      setSaving(false);
    }
  }, [
    availableProjectStakeholders,
    detailsText,
    newDueDate,
    newPriority,
    newTitle,
    projectId,
    resolveCreatorProfileId,
    user?.email
  ]);

  const ensureIssueId = useCallback(async () => {
    if (issue?.id) return issue.id;
    if (draftIssue?.id) return draftIssue.id;

    if (draftIssuePromiseRef.current) {
      const pending = await draftIssuePromiseRef.current;
      return pending?.id || null;
    }

    const creationPromise = createIssueRecord();
    draftIssuePromiseRef.current = creationPromise;
    try {
      const created = await creationPromise;
      return created?.id || null;
    } finally {
      draftIssuePromiseRef.current = null;
    }
  }, [createIssueRecord, draftIssue?.id, issue?.id]);

  const notifyCommentActivity = useCallback(async ({
    issueId,
    text,
    createdAt,
    authorName,
    issueSnapshot = null
  }) => {
    const trimmed = text?.trim();
    if (!issueId || !trimmed) return;

    const hasRecipients = (tags || []).some(tag => tag?.email) || Boolean(currentUserSummary?.email);
    if (!hasRecipients) return;

    try {
      const defaultLink = (() => {
        if (typeof window === 'undefined') return '';
        if (!projectId || !issueId) return window.location.href;
        return `${window.location.origin}/project/${projectId}/issues/${issueId}`;
      })();
      const link = issueLink || defaultLink;
      const graphToken = await acquireToken();
      const issueContext = issueSnapshot || resolvedIssue || issue || {
        id: issueId,
        title: issue?.title || newTitle,
        project_id: issue?.project_id || projectId
      };

      await notifyIssueComment(
        {
          issue: issueContext,
          project: projectInfo,
          comment: {
            author: authorName || currentUserSummary?.name || currentUserSummary?.email || 'User',
            text: trimmed,
            createdAt
          },
          stakeholders: tags,
          actor: currentUserSummary,
          issueUrl: link
        },
        { authToken: graphToken }
      );
    } catch (err) {
      console.warn('Failed to send comment notification:', err);
    }
  }, [
    acquireToken,
    currentUserSummary,
    issue,
    issueLink,
    newTitle,
    projectId,
    projectInfo,
    resolvedIssue,
    tags
  ]);

  const appendStatusChangeComment = useCallback(async (nextStatusLabel, options = {}) => {
    const targetIssue = options.issueSnapshot || issue;
    const issueId = targetIssue?.id;
    if (!issueId || !nextStatusLabel) return null;
    try {
      const { author_id, author_name, author_email } = await getAuthorInfo();
      const displayLabel = options.displayLabel || formatStatusLabel(nextStatusLabel);
      const comment_text = `Status changed to ${displayLabel}`;
      const created = await issueCommentsService.add(issueId, {
        author_id,
        author_name,
        author_email,
        comment_text,
        is_internal: true
      });
      if (created) {
        setComments(prev => [...prev, created]);
        await notifyCommentActivity({
          issueId,
          text: comment_text,
          createdAt: created.created_at,
          authorName,
          issueSnapshot: targetIssue
        });
        return created;
      }
    } catch (err) {
      console.error('Failed to log status change comment:', err);
    }
    return null;
  }, [getAuthorInfo, issue, notifyCommentActivity]);

  const updateStatusAndLog = useCallback(async (nextStatus, errorMessage) => {
    if (!issue?.id || !nextStatus) return;
    const previousStatus = (issue?.status || '').toLowerCase().trim();
    const desiredStatus = nextStatus.toLowerCase().trim();
    if (previousStatus === desiredStatus) {
      return;
    }

    const statusLabel = deriveStatusDisplayLabel(issue?.status, nextStatus);

    try {
      setSaving(true);
      setError('');
      const updated = await issuesService.update(issue.id, { status: nextStatus });

      if (updated) {
        setIssue(updated);
        await appendStatusChangeComment(nextStatus, {
          displayLabel: statusLabel,
          issueSnapshot: updated
        });
      }
    } catch (err) {
      console.error(errorMessage, err);
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  }, [
    appendStatusChangeComment,
    issue?.id,
    issue?.status
  ]);

  const handleCreate = async (evt) => {
    if (evt) evt.preventDefault();
    const title = newTitle.trim();
    if (!title) {
      setError('A title is required.');
      return;
    }
    try {
      const existingId = issue?.id || draftIssue?.id || await ensureIssueId();
      if (!existingId) return;

      setSaving(true);
      setError('');

      const updates = {
        title,
        description: detailsText,
        priority: newPriority,
        due_date: newDueDate || null
      };

      if (!issue?.id) {
        await issuesService.update(existingId, updates);
        navigate(`/project/${projectId}/issues/${existingId}`, { replace: true });
      } else {
        const updated = await issuesService.update(existingId, updates);
        if (updated) {
          setIssue(updated);
        }
      }
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
    if (!text) return;
    let issueIdToUse = activeIssueId;
    if (!issueIdToUse) {
      try {
        issueIdToUse = await ensureIssueId();
      } catch (err) {
        setError(err.message || 'Failed to save the issue before commenting');
        return;
      }
    }
    if (!issueIdToUse) return;
    try {
      setSaving(true);
      const { author_id, author_name, author_email } = await getAuthorInfo();
      const created = await issueCommentsService.add(issueIdToUse, {
        author_id,
        author_name,
        author_email,
        comment_text: text,
        is_internal: true
      });
      if (created) {
        setComments(prev => [...prev, created]);
        setCommentText('');

        const issueContext = resolvedIssue || {
          id: issueIdToUse,
          title: newTitle,
          project_id: projectId
        };

        await notifyCommentActivity({
          issueId: issueIdToUse,
          text,
          createdAt: created.created_at,
          authorName: author_name,
          issueSnapshot: issueContext
        });
      }
    } catch (e) {
      setError(e.message || 'Failed to add comment');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadPhoto = async (evt) => {
    const file = evt.target.files?.[0];
    if (!file) return;
    let issueIdToUse = activeIssueId;
    if (!issueIdToUse) {
      try {
        issueIdToUse = await ensureIssueId();
      } catch (err) {
        setError(err.message || 'Failed to save the issue before uploading photos');
        evt.target.value = '';
        return;
      }
    }
    if (!issueIdToUse) {
      evt.target.value = '';
      return;
    }
    try {
      setUploading(true);
      setError('');

      // Compress the image first
      const compressedFile = await compressImage(file);

      // Check if online
      if (!navigator.onLine) {
        console.log('[IssueDetail] Offline - queueing photo upload');

        // Queue for later upload
        const queueId = await enqueueUpload({
          type: 'issue_photo',
          projectId,
          file: compressedFile,
          metadata: {
            issueId: issueIdToUse,
            description: ''
          }
        });

        // Show optimistic UI with pending indicator
        const optimisticPhoto = {
          id: queueId,
          issue_id: issueIdToUse,
          url: URL.createObjectURL(compressedFile),
          file_name: file.name,
          content_type: file.type,
          size_bytes: compressedFile.size,
          isPending: true // Flag for UI
        };

        setPhotos(prev => [...prev, optimisticPhoto]);
        setError('Photo queued for upload when online');

        return;
      }

      // Online: upload immediately
      // Upload to SharePoint - returns metadata object
      const metadata = await sharePointStorageService.uploadIssuePhoto(
        projectId,
        issueIdToUse,
        compressedFile,
        '' // Optional photo description
      );

      // Save to database with SharePoint metadata
      const { data, error } = await supabase
        .from('issue_photos')
        .insert([{
          issue_id: issueIdToUse,
          url: metadata.url,
          sharepoint_drive_id: metadata.driveId,
          sharepoint_item_id: metadata.itemId,
          file_name: metadata.name || file.name,
          content_type: file.type,
          size_bytes: metadata.size || compressedFile.size
        }])
        .select()
        .single();

      if (error) throw error;
      setPhotos(prev => [...prev, data]);
    } catch (e) {
      console.error('Failed to upload issue photo:', e);
      setError(e.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
      evt.target.value = '';
    }
  };

  const handleTagStakeholder = async (assignmentId) => {
    if (!assignmentId) return;
    let issueIdToUse = activeIssueId;
    if (!issueIdToUse) {
      try {
        issueIdToUse = await ensureIssueId();
      } catch (err) {
        setError(err.message || 'Failed to save the issue before tagging stakeholders');
        return;
      }
    }
    if (!issueIdToUse) return;
    try {
      setTagging(true);
      await issueStakeholderTagsService.add(issueIdToUse, assignmentId, 'assigned');
      const updated = await issueStakeholderTagsService.getDetailed(issueIdToUse);
      setTags(updated);

      const stakeholder = availableProjectStakeholders.find(p => p.assignment_id === assignmentId);
      const link = issueLink || (typeof window !== 'undefined' ? window.location.href : '');
      const issueContext = resolvedIssue || {
        id: issueIdToUse,
        title: newTitle,
        project_id: projectId
      };
      const graphToken = await acquireToken();

      await notifyStakeholderAdded(
        {
          issue: issueContext,
          project: projectInfo,
          stakeholder,
          actor: currentUserSummary,
          issueUrl: link
        },
        { authToken: graphToken }
      );
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

  const handleContactAction = useCallback((type, value) => {
    if (!value) return;
    if (type === 'email') {
      window.location.href = `mailto:${value}`;
      return;
    }
    if (type === 'phone') {
      const sanitized = `${value}`.replace(/[^+\d]/g, '');
      window.location.href = `tel:${sanitized}`;
      return;
    }
    if (type === 'address') {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const toggleStakeholder = useCallback((tagId) => {
    setExpandedStakeholder(prev => prev === tagId ? null : tagId);
  }, []);

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
        {/* Error state - user will use app bar back button */}
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
                  className={`${ui.input} [&::-webkit-calendar-picker-indicator]:dark:invert`}
                />
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-lg font-semibold">{issue?.title}</div>
            <div className={`text-xs ${ui.subtle}`}>
              Priority: {issue?.priority || '—'} • Status: {getStatusDisplayValue(issue?.status)}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Details</h3>
          {isNew ? (
            <span className={`text-xs ${ui.subtle}`}>Provide context for this issue.</span>
          ) : (
            <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={saving}
                  style={(issue?.status || '').toLowerCase() === 'blocked' ? { 
                    backgroundColor: '#ef4444', // Tailwind red-500
                    color: '#ffffff', 
                    borderColor: '#ef4444',
                    padding: '6px 12px',
                    borderRadius: '0.75rem',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    border: '1px solid',
                    transition: 'all 0.2s',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1
                  } : {
                    backgroundColor: 'transparent',
                    color: mode === 'dark' ? '#9ca3af' : '#6b7280',
                    borderColor: mode === 'dark' ? '#374151' : '#d1d5db',
                    padding: '6px 12px',
                    borderRadius: '0.75rem',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    border: '1px solid',
                    transition: 'all 0.2s',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1
                  }}
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (saving) return;
                    
                    // Check status field for blocked state (only field that exists in DB)
                    const isBlocked = (issue?.status || '').toLowerCase() === 'blocked';
                    const nextStatus = isBlocked ? 'open' : 'blocked';
                    console.log('Blocked Button Clicked! Current:', issue?.status, 'Next:', nextStatus);
                    
                    await updateStatusAndLog(nextStatus, 'Failed to update blocked status');
                  }}
                >
                  <AlertTriangle size={16} />
                  {(issue?.status || '').toLowerCase() === 'blocked' ? 'Unblock' : 'Mark Blocked'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  style={(issue?.status || '').toLowerCase() === 'resolved' ? { 
                    backgroundColor: '#10b981', // Tailwind green-500
                    color: '#ffffff', 
                    borderColor: '#10b981',
                    padding: '6px 12px',
                    borderRadius: '0.75rem',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    border: '1px solid',
                    transition: 'all 0.2s',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1
                  } : {
                    backgroundColor: 'transparent',
                    color: mode === 'dark' ? '#9ca3af' : '#6b7280',
                    borderColor: mode === 'dark' ? '#374151' : '#d1d5db',
                    padding: '6px 12px',
                    borderRadius: '0.75rem',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    border: '1px solid',
                    transition: 'all 0.2s',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1
                  }}
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (saving) return;
                    
                    const isResolved = (issue?.status || '').toLowerCase() === 'resolved';
                    const nextStatus = isResolved ? 'open' : 'resolved';
                    console.log('Resolved Button Clicked! Current:', issue?.status, 'Next:', nextStatus);
                    
                    await updateStatusAndLog(nextStatus, 'Failed to update resolved status');
                  }}
                >
                  <CheckCircle size={16} />
                  {(issue?.status || '').toLowerCase() === 'resolved' ? 'Reopen' : 'Mark Resolved'}
                </button>
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
          <label className={`inline-flex items-center gap-2 text-sm ${canUploadPhotos ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleUploadPhoto}
              disabled={!canUploadPhotos}
            />
            <span className={`px-3 py-1.5 rounded-lg border ${ui.subtle}`}>
              {canUploadPhotos ? 'Upload' : 'Upload after entering a title'}
            </span>
          </label>
        </div>
        {!canUploadPhotos ? (
          <div className={`text-sm ${ui.subtle}`}>Enter a title to auto-save this issue before adding photos.</div>
        ) : photos.length === 0 ? (
          <div className={`text-sm ${ui.subtle} flex items-center gap-2`}>
            <ImageIcon size={16} /> No photos yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((p) => (
              <div key={p.id} className="relative block rounded-xl overflow-hidden border hover:border-violet-500 transition-colors">
                {p.isPending ? (
                  <>
                    <img
                      src={p.url}
                      alt={p.file_name || 'Pending photo'}
                      className="w-full h-28 object-cover opacity-60"
                      style={{ minHeight: '7rem' }}
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white">
                      <WifiOff size={20} className="mb-1" />
                      <span className="text-xs font-medium">Queued</span>
                    </div>
                  </>
                ) : (
                  <CachedSharePointImage
                    sharePointUrl={p.url}
                    sharePointDriveId={p.sharepoint_drive_id}
                    sharePointItemId={p.sharepoint_item_id}
                    displayType="thumbnail"
                    size="medium"
                    alt={p.file_name || 'Issue photo'}
                    className="w-full h-28 cursor-pointer"
                    style={{ minHeight: '7rem' }}
                    showFullOnClick={true}
                  />
                )}
              </div>
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
                disabled={tagging || !canManageStakeholders}
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
        {!canManageStakeholders ? (
          <div className={`text-sm ${ui.subtle}`}>Enter a title to auto-save this issue before adding stakeholders.</div>
        ) : tags.length === 0 ? (
          <div className="text-sm text-gray-600 dark:text-gray-300">No stakeholders tagged.</div>
        ) : (
          <div className="space-y-2">
            {tags.map(tag => {
              const isExpanded = expandedStakeholder === tag.tag_id;
              return (
                <div key={tag.tag_id} className="rounded-xl border overflow-hidden">
                  <div 
                    className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    onClick={() => toggleStakeholder(tag.tag_id)}
                  >
                    <div className="flex items-start gap-2 flex-1">
                      <span
                        className="mt-1 inline-block w-2 h-2 rounded-full"
                        style={{ backgroundColor: tag.is_internal ? palette.accent : palette.success }}
                      />
                      <div className="flex-1">
                        <div className="text-sm font-medium">
                          {tag.contact_name} <span className="text-xs text-gray-500">({tag.role_name})</span>
                        </div>
                        <div className="text-xs text-gray-500">{tag.tag_type || 'assigned'} • {new Date(tag.tagged_at).toLocaleString()}</div>
                      </div>
                      <ChevronDown 
                        size={16} 
                        className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </div>
                    <button 
                      className="text-rose-500 ml-2" 
                      onClick={(e) => { e.stopPropagation(); handleRemoveTag(tag.tag_id); }} 
                      title="Remove"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t bg-gray-50 dark:bg-gray-800/50">
                      <div className="pt-3 space-y-2 text-sm">
                        {tag.email && (
                          <div className="flex items-center gap-2">
                            <Mail size={14} className="text-gray-400" />
                            <button
                              onClick={(e) => { e.stopPropagation(); handleContactAction('email', tag.email); }}
                              className="text-blue-600 hover:underline"
                            >
                              {tag.email}
                            </button>
                          </div>
                        )}
                        {tag.phone && (
                          <div className="flex items-center gap-2">
                            <Phone size={14} className="text-gray-400" />
                            <button
                              onClick={(e) => { e.stopPropagation(); handleContactAction('phone', tag.phone); }}
                              className="text-blue-600 hover:underline"
                            >
                              {tag.phone}
                            </button>
                          </div>
                        )}
                        {tag.company && (
                          <div className="flex items-center gap-2">
                            <Building size={14} className="text-gray-400" />
                            <span>{tag.company}</span>
                          </div>
                        )}
                        {tag.address && (
                          <div className="flex items-center gap-2">
                            <Map size={14} className="text-gray-400" />
                            <button
                              onClick={(e) => { e.stopPropagation(); handleContactAction('address', tag.address); }}
                              className="text-blue-600 hover:underline text-left"
                            >
                              {tag.address}
                            </button>
                          </div>
                        )}
                        {!tag.email && !tag.phone && !tag.company && !tag.address && (
                          <div className="text-gray-500 italic">No contact details available</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border p-4 space-y-3" style={sectionStyles.card}>
        <h3 className="text-sm font-semibold">Comments</h3>
        {!canComment ? (
          <div className={`text-sm ${ui.subtle}`}>Enter a title to auto-save this issue before adding comments.</div>
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
            placeholder={canComment ? 'Add a comment…' : 'Enter a title to add comments.'}
            className={ui.input}
            disabled={!canComment}
          />
          <Button
            variant="primary"
            icon={Plus}
            onClick={handleAddComment}
            disabled={!canComment || saving || !commentText.trim()}
          >
            Add
          </Button>
        </div>
      </section>

      {isNew && (
        <div className="flex items-center justify-between">
          {error ? <div className="text-sm text-rose-500">{error}</div> : <span />}
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate(-1)} disabled={saving}>
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
