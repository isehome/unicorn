import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Button from './ui/Button';
import DateField from './ui/DateField';
import DateInput from './ui/DateInput';
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
import { issuePublicAccessService } from '../services/issuePublicAccessService';
import { notifyIssueComment, notifyStakeholderAdded, processPendingNotifications } from '../services/issueNotificationService';
import CachedSharePointImage from './CachedSharePointImage';
import { usePhotoViewer } from './photos/PhotoViewerProvider';
import { enqueueUpload } from '../lib/offline';
import { compressImage } from '../lib/images';
import { Plus, Trash2, AlertTriangle, CheckCircle, Image as ImageIcon, Mail, Phone, Building, Map as MapIcon, ChevronDown, WifiOff, Share2, ShieldAlert, Paperclip, Download, Loader } from 'lucide-react';

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

const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const [isPublicComment, setIsPublicComment] = useState(false);
  const [tags, setTags] = useState([]);
  const [availableProjectStakeholders, setAvailableProjectStakeholders] = useState([]);
  const [tagging, setTagging] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
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
  const [photoActionLoading, setPhotoActionLoading] = useState(false);
  const [pendingUploads, setPendingUploads] = useState([]);
  const [uploadsLoading, setUploadsLoading] = useState(false);
  const [processingUploadId, setProcessingUploadId] = useState(null);
  const [portalLinkLoading, setPortalLinkLoading] = useState(null);
  const [ackExternalWarning, setAckExternalWarning] = useState(false);
  const { openPhotoViewer, updatePhotoViewerOptions, closePhotoViewer } = usePhotoViewer();
  const currentUserDisplay = useMemo(() => (
    user?.user_metadata?.full_name ||
    user?.full_name ||
    user?.name ||
    user?.email ||
    'Unknown user'
  ), [user]);

  const isNew = issueId === 'new';
  const resolvedIssue = issue || draftIssue || null;
  const activeIssueId = resolvedIssue?.id || null;
  const hasIssueRecord = Boolean(activeIssueId);
  const canManageStakeholders = !isNew || hasIssueRecord;
  const canUploadPhotos = !isNew || hasIssueRecord;
  const canComment = !isNew || hasIssueRecord;
  const externalStakeholders = useMemo(
    () => (tags || []).filter(tag => tag.role_category === 'external'),
    [tags]
  );
  const hasExternalStakeholders = externalStakeholders.length > 0;

  const loadExternalUploads = useCallback(async (targetIssueId) => {
    if (!targetIssueId) return;
    try {
      setUploadsLoading(true);
      const uploads = await issuePublicAccessService.listUploads(targetIssueId);
      setPendingUploads(uploads);
    } catch (err) {
      console.warn('Failed to load external uploads:', err);
    } finally {
      setUploadsLoading(false);
    }
  }, []);

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
        // Combine stakeholders and ensure no duplicates
        const internalMapped = (projectStakeholders.internal || []).map(p => ({ ...p, category: 'internal' }));
        const externalMapped = (projectStakeholders.external || []).map(p => ({ ...p, category: 'external' }));

        // Use a Map to deduplicate by the combination of contact_name, role_name, and category
        // This prevents the same person/role from appearing multiple times
        const stakeholderMap = new Map();
        [...internalMapped, ...externalMapped].forEach(stakeholder => {
          if (stakeholder.assignment_id) {
            // Create a unique key based on what's displayed to the user
            const displayKey = `${stakeholder.contact_name || ''}_${stakeholder.role_name || ''}_${stakeholder.category || ''}`;

            // Only add if we haven't seen this combination before
            if (!stakeholderMap.has(displayKey)) {
              stakeholderMap.set(displayKey, stakeholder);
            }
          }
        });

        const combined = Array.from(stakeholderMap.values());
        setAvailableProjectStakeholders(combined);

        // Load external uploads for existing issues
        await loadExternalUploads(issueId);

        // Process any pending notifications from external comments
        // This sends notifications using the current user's auth token
        try {
          const authToken = await acquireToken();
          if (authToken) {
            processPendingNotifications(issueId, { authToken });
          }
        } catch (notifyErr) {
          // Don't block issue loading if notification processing fails
          console.warn('[IssueDetail] Failed to process pending notifications:', notifyErr);
        }
      } else {
        const [projectStakeholders, projectDetails] = await Promise.all([
          projectStakeholdersService.getForProject(projectId),
          projectPromise
        ]);
        // Combine stakeholders and ensure no duplicates  
        const internalMapped = (projectStakeholders.internal || []).map(p => ({ ...p, category: 'internal' }));
        const externalMapped = (projectStakeholders.external || []).map(p => ({ ...p, category: 'external' }));

        // Use a Map to deduplicate by the combination of contact_name, role_name, and category
        // This prevents the same person/role from appearing multiple times
        const stakeholderMap = new Map();
        [...internalMapped, ...externalMapped].forEach(stakeholder => {
          if (stakeholder.assignment_id) {
            // Create a unique key based on what's displayed to the user
            const displayKey = `${stakeholder.contact_name || ''}_${stakeholder.role_name || ''}_${stakeholder.category || ''}`;

            // Only add if we haven't seen this combination before
            if (!stakeholderMap.has(displayKey)) {
              stakeholderMap.set(displayKey, stakeholder);
            }
          }
        });

        const combined = Array.from(stakeholderMap.values());
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
  }, [projectId, issueId, isNew, loadExternalUploads]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    // Reset cached profile id when user changes
    authorProfileIdRef.current = undefined;
  }, [user?.id]);

  useEffect(() => {
    if (!hasExternalStakeholders) {
      setAckExternalWarning(false);
    }
  }, [hasExternalStakeholders]);

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

  const resolveNotificationStakeholders = useCallback(async (issueId) => {
    if ((tags || []).length > 0) {
      return tags;
    }
    if (!issueId) return [];
    try {
      const detailed = await issueStakeholderTagsService.getDetailed(issueId);
      return detailed || [];
    } catch (err) {
      console.warn('Failed to resolve stakeholders for notification:', err);
      return [];
    }
  }, [tags]);

  // Generate portal links for external stakeholders (for comment notifications)
  const generateExternalPortalLinks = useCallback(async (issueId, stakeholderList) => {
    const portalLinks = {};
    if (!issueId || !Array.isArray(stakeholderList)) return portalLinks;

    for (const stakeholder of stakeholderList) {
      const isExternal = stakeholder?.is_internal === false ||
        stakeholder?.role_category === 'external' ||
        stakeholder?.category === 'external';
      if (!isExternal) continue;

      const tagId = stakeholder?.tag_id || stakeholder?.id;
      if (!tagId) continue;

      try {
        // ensureLink does an upsert - if a link exists, it regenerates the OTP
        const result = await issuePublicAccessService.ensureLink({
          issueId,
          projectId,
          stakeholderTagId: tagId,
          stakeholder
        });

        if (result?.token) {
          const portalUrl = `${window.location.origin}/public/issues/${result.token}`;
          portalLinks[tagId] = {
            url: portalUrl,
            otp: result.otp
          };
        }
      } catch (err) {
        console.warn(`[IssueDetail] Failed to generate portal link for stakeholder ${tagId}:`, err);
      }
    }

    return portalLinks;
  }, [projectId]);

  const notifyCommentActivity = useCallback(async ({
    issueId,
    text,
    createdAt,
    authorName,
    issueSnapshot = null,
    stakeholdersOverride = null,
    authToken = null  // Allow passing token directly
  }) => {
    const trimmed = text?.trim();
    if (!issueId || !trimmed) return;

    try {
      const defaultLink = (() => {
        if (typeof window === 'undefined') return '';
        if (!projectId || !issueId) return window.location.href;
        return `${window.location.origin}/project/${projectId}/issues/${issueId}`;
      })();
      const link = issueLink || defaultLink;

      // Use provided token or acquire a new one
      const graphToken = authToken || await acquireToken();

      const issueContext = issueSnapshot || resolvedIssue || issue || {
        id: issueId,
        title: issue?.title || newTitle,
        project_id: issue?.project_id || projectId
      };
      const stakeholderList = Array.isArray(stakeholdersOverride) && stakeholdersOverride.length > 0
        ? stakeholdersOverride
        : await resolveNotificationStakeholders(issueId);

      // Generate portal links for external stakeholders
      const externalPortalLinks = await generateExternalPortalLinks(issueId, stakeholderList);

      await notifyIssueComment(
        {
          issue: issueContext,
          project: projectInfo,
          comment: {
            author: authorName || currentUserSummary?.name || currentUserSummary?.email || 'User',
            text: trimmed,
            createdAt,
            is_internal: text?.startsWith('Status changed to ')  // Mark system comments
          },
          stakeholders: stakeholderList,
          actor: currentUserSummary,
          issueUrl: link,
          externalPortalLinks
        },
        { authToken: graphToken }
      );
    } catch (err) {
      console.warn('Failed to send comment notification:', err);
    }
  }, [
    acquireToken,
    currentUserSummary,
    generateExternalPortalLinks,
    issue,
    issueLink,
    newTitle,
    projectId,
    projectInfo,
    resolvedIssue,
    resolveNotificationStakeholders,
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

        // Ensure we have the auth token for system-generated comments
        const graphToken = await acquireToken();

        // Get the current stakeholders
        const stakeholderList = options.stakeholdersOverride || await resolveNotificationStakeholders(issueId);

        // Generate portal links for external stakeholders
        const externalPortalLinks = await generateExternalPortalLinks(issueId, stakeholderList);

        // Send notification with auth token
        const defaultLink = (() => {
          if (typeof window === 'undefined') return '';
          if (!projectId || !issueId) return window.location.href;
          return `${window.location.origin}/project/${projectId}/issues/${issueId}`;
        })();
        const link = issueLink || defaultLink;

        await notifyIssueComment(
          {
            issue: targetIssue,
            project: projectInfo,
            comment: {
              author: author_name,
              text: comment_text,
              createdAt: created.created_at,
              is_internal: true
            },
            stakeholders: stakeholderList,
            actor: currentUserSummary,
            issueUrl: link,
            externalPortalLinks
          },
          { authToken: graphToken }
        );

        return created;
      }
    } catch (err) {
      console.error('Failed to log status change comment:', err);
    }
    return null;
  }, [
    getAuthorInfo,
    issue,
    acquireToken,
    generateExternalPortalLinks,
    resolveNotificationStakeholders,
    projectId,
    issueLink,
    notifyIssueComment,
    projectInfo,
    currentUserSummary
  ]);

  const updateStatusAndLog = useCallback(async (nextStatus, errorMessage, options = {}) => {
    if (!issue?.id || !nextStatus) return;
    const previousStatus = (issue?.status || '').toLowerCase().trim();
    const desiredStatus = nextStatus.toLowerCase().trim();
    if (previousStatus === desiredStatus) {
      return;
    }

    const statusLabel = options.displayLabelOverride || deriveStatusDisplayLabel(issue?.status, nextStatus);

    try {
      setSaving(true);
      setError('');
      const updated = await issuesService.update(issue.id, { status: nextStatus });

      if (updated) {
        setIssue(updated);
        await appendStatusChangeComment(nextStatus, {
          displayLabel: statusLabel,
          issueSnapshot: updated,
          stakeholdersOverride: options.stakeholdersOverride
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
      if (hasExternalStakeholders && !ackExternalWarning) {
        const confirmed = window.confirm('External stakeholders may receive this comment immediately. Continue?');
        if (!confirmed) {
          return;
        }
        setAckExternalWarning(true);
      }
      setSaving(true);
      const { author_id, author_name, author_email } = await getAuthorInfo();
      const created = await issueCommentsService.add(issueIdToUse, {
        author_id,
        author_name,
        author_email,
        comment_text: text,
        is_internal: !isPublicComment
      });
      if (created) {
        setComments(prev => [...prev, created]);
        setCommentText('');
        setIsPublicComment(false);

        const issueContext = resolvedIssue || {
          id: issueIdToUse,
          title: newTitle,
          project_id: projectId
        };

        // Ensure we pass the auth token for user comments as well
        const graphToken = await acquireToken();

        await notifyCommentActivity({
          issueId: issueIdToUse,
          text,
          createdAt: created.created_at,
          authorName: author_name,
          issueSnapshot: issueContext,
          stakeholdersOverride: tags,
          authToken: graphToken  // Pass the token for proper authentication
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
      const uploaderLabel = currentUserDisplay;

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
            description: '',
            uploadedBy: uploaderLabel
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
          isPending: true, // Flag for UI
          uploaded_by: uploaderLabel,
          created_at: new Date().toISOString()
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
          size_bytes: metadata.size || compressedFile.size,
          uploaded_by: uploaderLabel
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

  const syncViewerLoading = useCallback((value) => {
    setPhotoActionLoading(value);
    updatePhotoViewerOptions({ loading: value });
  }, [updatePhotoViewerOptions]);

  const handleDeletePhoto = useCallback(async (targetPhoto) => {
    if (!targetPhoto) return;
    const confirmed = window.confirm('Delete this photo? This cannot be undone.');
    if (!confirmed) return;

    try {
      syncViewerLoading(true);
      if (targetPhoto.sharepoint_drive_id && targetPhoto.sharepoint_item_id) {
        try {
          await sharePointStorageService.deleteFile(targetPhoto.sharepoint_drive_id, targetPhoto.sharepoint_item_id);
        } catch (fileErr) {
          console.warn('SharePoint delete failed:', fileErr);
        }
      }

      const { error: deleteError } = await supabase
        .from('issue_photos')
        .delete()
        .eq('id', targetPhoto.id);

      if (deleteError) throw deleteError;
      setPhotos((prev) => prev.filter((p) => p.id !== targetPhoto.id));
      closePhotoViewer();
    } catch (err) {
      console.error('Failed to delete photo:', err);
      setError(err.message || 'Failed to delete photo');
    } finally {
      syncViewerLoading(false);
    }
  }, [closePhotoViewer, syncViewerLoading]);

  const handleReplacePhoto = useCallback(async (targetPhoto, file) => {
    if (!targetPhoto) return;
    try {
      syncViewerLoading(true);
      const compressedFile = await compressImage(file);
      const metadata = await sharePointStorageService.uploadIssuePhoto(
        projectId,
        targetPhoto.issue_id,
        compressedFile,
        'replacement'
      );

      const payload = {
        url: metadata.url,
        sharepoint_drive_id: metadata.driveId,
        sharepoint_item_id: metadata.itemId,
        file_name: metadata.name || file.name,
        content_type: file.type,
        size_bytes: metadata.size || compressedFile.size,
        updated_at: new Date().toISOString(),
        updated_by: currentUserDisplay
      };

      const { data, error } = await supabase
        .from('issue_photos')
        .update(payload)
        .eq('id', targetPhoto.id)
        .select()
        .single();

      if (error) throw error;

      if (targetPhoto.sharepoint_drive_id && targetPhoto.sharepoint_item_id) {
        try {
          await sharePointStorageService.deleteFile(targetPhoto.sharepoint_drive_id, targetPhoto.sharepoint_item_id);
        } catch (fileErr) {
          console.warn('Failed to delete previous SharePoint file:', fileErr);
        }
      }

      setPhotos((prev) => prev.map((p) => (p.id === targetPhoto.id ? data : p)));
      openPhotoViewer(data, {
        canEdit: canUploadPhotos,
        replaceMode: 'file',
        loading: false,
        onReplace: (nextFile) => handleReplacePhoto(data, nextFile),
        onDelete: () => handleDeletePhoto(data)
      });
    } catch (err) {
      console.error('Failed to replace photo:', err);
      setError(err.message || 'Failed to replace photo');
    } finally {
      syncViewerLoading(false);
    }
  }, [canUploadPhotos, currentUserDisplay, handleDeletePhoto, openPhotoViewer, projectId, syncViewerLoading]);

  const handleOpenPhotoViewer = useCallback((photo) => {
    if (!photo || photo.isPending) return;
    openPhotoViewer(photo, {
      canEdit: canUploadPhotos,
      replaceMode: 'file',
      loading: photoActionLoading,
      onReplace: (file) => handleReplacePhoto(photo, file),
      onDelete: () => handleDeletePhoto(photo)
    });
  }, [canUploadPhotos, handleDeletePhoto, handleReplacePhoto, openPhotoViewer, photoActionLoading]);

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
      const createdTag = await issueStakeholderTagsService.add(issueIdToUse, assignmentId, 'assigned');
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

      let publicPortalPayload = null;
      const isExternalStakeholder = stakeholder?.category === 'external' || stakeholder?.role_category === 'external';
      console.log('[IssueDetail] Stakeholder external check:', {
        contact_name: stakeholder?.contact_name,
        category: stakeholder?.category,
        role_category: stakeholder?.role_category,
        is_internal: stakeholder?.is_internal,
        isExternalStakeholder,
        createdTagId: createdTag?.id
      });
      if (isExternalStakeholder && createdTag?.id) {
        try {
          const linkDetails = await issuePublicAccessService.ensureLink({
            issueId: issueIdToUse,
            projectId,
            stakeholderTagId: createdTag.id,
            stakeholder
          });
          const shareUrl = typeof window !== 'undefined'
            ? `${window.location.origin}/public/issues/${linkDetails.token}`
            : link;
          publicPortalPayload = {
            url: shareUrl,
            otp: linkDetails.otp
          };
          console.log('[IssueDetail] Portal link created for external stakeholder:', {
            shareUrl: shareUrl?.substring(0, 60),
            hasOtp: !!linkDetails.otp,
            stakeholderEmail: stakeholder?.email
          });
        } catch (portalError) {
          console.error('Failed to provision public issue link:', portalError);
        }
      }

      console.log('[IssueDetail] Calling notifyStakeholderAdded:', {
        isExternalStakeholder,
        hasPublicPortal: !!publicPortalPayload,
        stakeholderEmail: stakeholder?.email,
        hasGraphToken: !!graphToken
      });
      await notifyStakeholderAdded(
        {
          issue: issueContext,
          project: projectInfo,
          stakeholder,
          actor: currentUserSummary,
          issueUrl: link,
          publicPortal: publicPortalPayload
        },
        { authToken: graphToken }
      );
      if (publicPortalPayload) {
        setSuccessMessage(`Shared external portal link with ${stakeholder?.contact_name || stakeholder?.email || 'stakeholder'}`);
        setTimeout(() => setSuccessMessage(null), 3000);
      }
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

  const handleGeneratePortalLink = useCallback(async (tag) => {
    if (!tag || !activeIssueId || !projectId) return;
    if (!window.confirm('Generate a new public portal link for this contact? Previous links will stop working.')) {
      return;
    }
    try {
      setPortalLinkLoading(tag.tag_id);
      const linkDetails = await issuePublicAccessService.ensureLink({
        issueId: activeIssueId,
        projectId,
        stakeholderTagId: tag.tag_id,
        stakeholder: tag
      });
      const shareUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/public/issues/${linkDetails.token}`
        : linkDetails.token;
      const formatted = `${shareUrl}\nOne-time code: ${linkDetails.otp}`;
      let copied = false;
      if (navigator?.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(formatted);
          copied = true;
        } catch (clipboardErr) {
          console.warn('Clipboard access denied:', clipboardErr);
        }
      }
      if (copied) {
        setSuccessMessage('Portal link copied to clipboard');
        setTimeout(() => setSuccessMessage(null), 2500);
      } else {
        // Fallback: show prompt with URL only, then alert with OTP
        window.prompt('Copy this portal link (URL only):', shareUrl); // eslint-disable-line no-alert
        window.alert(`One-time verification code: ${linkDetails.otp}`); // eslint-disable-line no-alert
      }
    } catch (err) {
      console.error('Failed to generate portal link:', err);
      setError(err.message || 'Failed to generate portal link');
    } finally {
      setPortalLinkLoading(null);
    }
  }, [activeIssueId, projectId]);

  const handlePreviewPendingUpload = useCallback(async (upload) => {
    if (!upload) return;
    console.log('[IssueDetail] Preview upload clicked:', upload);
    try {
      setProcessingUploadId(upload.id);
      const url = await issuePublicAccessService.getSignedDownloadUrl(upload.id);
      console.log('[IssueDetail] Signed URL result:', url);
      if (url) {
        // Use a link click to avoid popup blocker
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        setError('Could not generate preview URL');
      }
    } catch (err) {
      console.error('Failed to preview upload:', err);
      setError(err.message || 'Failed to generate preview link');
    } finally {
      setProcessingUploadId(null);
    }
  }, []);

  const handleApprovePendingUpload = useCallback(async (upload) => {
    if (!upload || !activeIssueId || !projectId) return;
    try {
      setProcessingUploadId(upload.id);
      const photo = await issuePublicAccessService.approveUpload(upload.id, {
        issueId: activeIssueId,
        projectId,
        reviewerLabel: `${currentUserDisplay || 'External Upload'}`
      });
      if (photo) {
        setPhotos((prev) => [...prev, photo]);
      }
      await loadExternalUploads(activeIssueId);
      setSuccessMessage('Upload approved and moved to SharePoint');
      setTimeout(() => setSuccessMessage(null), 2500);
    } catch (err) {
      console.error('Failed to approve upload:', err);
      setError(err.message || 'Failed to approve upload');
    } finally {
      setProcessingUploadId(null);
    }
  }, [activeIssueId, projectId, currentUserDisplay, loadExternalUploads]);

  const handleRejectPendingUpload = useCallback(async (upload) => {
    if (!upload) return;
    const reason = window.prompt('Provide a reason for rejecting this file (optional):', '');
    if (reason === null) return;
    try {
      setProcessingUploadId(upload.id);
      await issuePublicAccessService.rejectUpload(upload.id, reason);
      await loadExternalUploads(activeIssueId);
    } catch (err) {
      console.error('Failed to reject upload:', err);
      setError(err.message || 'Failed to reject upload');
    } finally {
      setProcessingUploadId(null);
    }
  }, [activeIssueId, loadExternalUploads]);

  const getUploadStatusBadge = useCallback((status) => {
    const normalized = (status || '').toLowerCase();
    if (normalized === 'approved') {
      return { label: 'Approved', style: { backgroundColor: 'rgba(148, 175, 50, 0.15)', color: '#94AF32' } };
    }
    if (normalized === 'rejected' || normalized === 'failed') {
      return { label: 'Rejected', className: 'bg-rose-100 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300' };
    }
    if (normalized === 'uploaded' || normalized === 'pending') {
      return { label: 'Awaiting review', className: 'bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300' };
    }
    return { label: 'Processing', className: 'bg-blue-100 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300' };
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
      {successMessage && (
        <div
          className="rounded-2xl border px-4 py-3 text-sm"
          style={{
            backgroundColor: 'rgba(148, 175, 50, 0.1)',
            borderColor: 'rgba(148, 175, 50, 0.3)',
            color: '#94AF32'
          }}
        >
          {successMessage}
        </div>
      )}
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
                <DateInput
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                />
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-lg font-semibold">{issue?.title}</div>
            <div className={`text-xs ${ui.subtle}`}>
              Priority: {issue?.priority || '—'} • Status: {formatStatusLabel(issue?.status || 'open')}
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
                  const normalizedStatus = (issue?.status || '').toLowerCase().trim();
                  const isBlocked = normalizedStatus === 'blocked';
                  const nextStatus = isBlocked ? 'open' : 'blocked';
                  console.log('Blocked Button Clicked! Current:', issue?.status, 'Next:', nextStatus);

                  await updateStatusAndLog(nextStatus, 'Failed to update blocked status', {
                    displayLabelOverride: isBlocked ? 'Unblocked' : 'Blocked'
                  });
                }}
              >
                <AlertTriangle size={16} />
                {(issue?.status || '').toLowerCase() === 'blocked' ? 'Unblock' : 'Mark Blocked'}
              </button>
              <button
                type="button"
                disabled={saving}
                style={(issue?.status || '').toLowerCase() === 'resolved' ? {
                  backgroundColor: '#94AF32', // brand success color
                  color: '#ffffff',
                  borderColor: '#94AF32',
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

                  const normalizedStatus = (issue?.status || '').toLowerCase().trim();
                  const isResolved = normalizedStatus === 'resolved';
                  const nextStatus = isResolved ? 'open' : 'resolved';
                  console.log('Resolved Button Clicked! Current:', issue?.status, 'Next:', nextStatus);

                  await updateStatusAndLog(nextStatus, 'Failed to update resolved status', {
                    displayLabelOverride: isResolved ? 'Open' : 'Resolved'
                  });
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
              <div
                key={p.id}
                className={`relative block rounded-xl overflow-hidden border transition-colors ${p.isPending ? 'opacity-80 cursor-not-allowed' : 'hover:border-violet-500 cursor-pointer'}`}
                onClick={() => {
                  if (!p.isPending) {
                    handleOpenPhotoViewer(p);
                  }
                }}
              >
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
                    className="w-full h-28"
                    style={{ minHeight: '7rem' }}
                    showFullOnClick={false}
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
          <h3 className="text-sm font-semibold">External Uploads</h3>
          {uploadsLoading && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}
        </div>
        {pendingUploads.length === 0 ? (
          <div className={`text-sm ${ui.subtle}`}>No external uploads in the queue.</div>
        ) : (
          <div className="space-y-2">
            {pendingUploads.map((upload) => {
              const badge = getUploadStatusBadge(upload.status);
              return (
                <div key={upload.id} className="rounded-xl border p-3 bg-white dark:bg-gray-900/60">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 font-medium text-sm">
                        <Paperclip size={16} className="text-gray-400" />
                        <span>{upload.file_name}</span>
                        <span className="text-xs text-gray-500">{formatBytes(upload.file_size)}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        From {upload.stakeholder_name || upload.stakeholder_email || 'External contact'} •{' '}
                        <DateField date={upload.submitted_at} variant="inline" colorMode="timestamp" showTime={true} />
                      </div>
                      {upload.rejection_reason && upload.status === 'rejected' && (
                        <div className="text-xs text-rose-500 mt-1">Reason: {upload.rejection_reason}</div>
                      )}
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-3 flex-wrap">
                    <Button
                      variant="secondary"
                      size="xs"
                      icon={Download}
                      onClick={() => handlePreviewPendingUpload(upload)}
                      disabled={processingUploadId === upload.id}
                    >
                      Preview
                    </Button>
                    {(upload.status === 'uploaded' || upload.status === 'pending') && (
                      <>
                        <Button
                          variant="primary"
                          size="xs"
                          onClick={() => handleApprovePendingUpload(upload)}
                          disabled={processingUploadId === upload.id}
                        >
                          Approve
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => handleRejectPendingUpload(upload)}
                          disabled={processingUploadId === upload.id}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border p-4 space-y-3" style={sectionStyles.card}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Stakeholders</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                disabled={tagging || !canManageStakeholders}
                onChange={(e) => { const v = e.target.value; if (v) { handleTagStakeholder(v); e.target.value = ''; } }}
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
                        <div className="text-xs text-gray-500">{tag.tag_type || 'assigned'} • <DateField date={tag.tagged_at} variant="inline" colorMode="timestamp" showTime={true} /></div>
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
                            <MapIcon size={14} className="text-gray-400" />
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
                        {tag.role_category === 'external' && (
                          <div className="mt-2 flex items-center justify-between rounded-xl border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/10 px-3 py-2">
                            <div className="text-xs text-violet-700 dark:text-violet-200 flex items-center gap-2">
                              <Share2 size={14} />
                              External portal link
                            </div>
                            <Button
                              variant="ghost"
                              size="xs"
                              onClick={(e) => { e.stopPropagation(); handleGeneratePortalLink(tag); }}
                              loading={portalLinkLoading === tag.tag_id}
                            >
                              {portalLinkLoading === tag.tag_id ? 'Generating…' : 'Copy Link'}
                            </Button>
                          </div>
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
        {hasExternalStakeholders && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-200 animate-pulse">
            <ShieldAlert size={20} className="mt-0.5 text-amber-600 dark:text-amber-300" />
            <div>
              <p className="font-semibold">External stakeholders will see new comments immediately.</p>
              <p className="text-xs text-amber-700/80 dark:text-amber-200/80">
                Notified: {externalStakeholders.map((stakeholder) => stakeholder.contact_name || stakeholder.email || 'Contact').join(', ')}
              </p>
            </div>
          </div>
        )}
        {!canComment ? (
          <div className={`text-sm ${ui.subtle}`}>Enter a title to auto-save this issue before adding comments.</div>
        ) : comments.length === 0 ? (
          <div className="text-sm text-gray-600 dark:text-gray-300">No comments yet.</div>
        ) : (
          <div className="space-y-2">
            {comments.map((c) => {
              // Check if comment author matches any external stakeholder by email
              const authorEmail = (c.author_email || '').toLowerCase().trim();
              const isFromExternalStakeholder = authorEmail && externalStakeholders.some(
                (s) => (s.email || '').toLowerCase().trim() === authorEmail
              );
              return (
                <div key={c.id} className="px-3 py-2 rounded-xl border">
                  <div className="text-sm">{c.comment_text}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    <div className={`flex justify-between items-start mb-1 ${c.is_internal === false ? 'bg-amber-50 -mx-2 px-2 py-1 rounded' : ''
                      }`}>
                      <span className={`font-medium ${palette?.text?.primary || 'text-gray-900'} flex items-center gap-2`}>
                        {c.author_name || 'Unknown'}
                        {c.is_internal === false && (
                          <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full border border-amber-200">
                            Public
                          </span>
                        )}
                      </span>
                      <DateField date={c.created_at} showTime={true} colorMode="timestamp" className="text-xs" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex items-center justify-between mb-2">
          <h3 className={`text-lg font-semibold ${palette?.text?.primary || 'text-gray-900'}`}>Discussion</h3>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isPublicComment}
                onChange={(e) => {
                  const checked = e.target.checked;
                  if (checked) {
                    const confirmed = window.confirm('Warning: This comment will be seen by external stakeholders. Are you sure you want to proceed?');
                    if (confirmed) setIsPublicComment(true);
                  } else {
                    setIsPublicComment(false);
                  }
                }}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className={isPublicComment ? 'text-amber-600 font-medium' : 'text-gray-500'}>
                {isPublicComment ? 'Visible to External Stakeholders' : 'Internal Only'}
              </span>
            </label>
          </div>
        </div>
        <div className="flex gap-2 mb-6">
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={isPublicComment ? "Write a public comment..." : "Write an internal comment..."}
            className={`flex-1 p-3 rounded-xl border ${isPublicComment
              ? 'border-amber-300 bg-amber-50 focus:ring-amber-500 focus:border-amber-500'
              : `${ui?.input || 'border-gray-300'} focus:ring-2 focus:ring-blue-500 focus:border-transparent`
              } resize-none h-24`}
          />
          <Button
            onClick={handleAddComment}
            disabled={!canComment || saving || !commentText.trim()}
            variant={isPublicComment ? 'warning' : 'primary'}
            className="h-24 px-6"
          >
            {saving ? 'Posting...' : 'Post'}
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
