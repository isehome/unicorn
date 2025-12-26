import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import DateField from '../components/ui/DateField';
import Button from '../components/ui/Button';
import { publicIssuePortalService } from '../services/publicIssuePortalService';
import { AlertTriangle, Paperclip, Download, Image as ImageIcon } from 'lucide-react';

const getStatusBadge = (status) => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'resolved' || normalized === 'completed') {
    return { label: 'Completed', className: 'bg-green-100 text-green-700' };
  }
  if (normalized === 'blocked') {
    return { label: 'Blocked', className: 'bg-rose-100 text-rose-700' };
  }
  return { label: status || 'Open', className: 'bg-blue-100 text-blue-700' };
};

const uploadStatusBadge = (status) => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'approved') return { label: 'Approved', className: 'bg-green-100 text-green-700' };
  if (normalized === 'rejected') return { label: 'Rejected', className: 'bg-rose-100 text-rose-700' };
  return { label: 'Pending review', className: 'bg-amber-100 text-amber-700' };
};

const formatBytes = (bytes = 0) => {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const PublicIssuePortal = () => {
  const { token } = useParams();
  const { theme, mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const palette = theme.palette;
  const storageKey = token ? `publicIssueSession:${token}` : null;
  const sessionRef = useRef(typeof window !== 'undefined' && storageKey ? window.localStorage.getItem(storageKey) : null);

  const [loading, setLoading] = useState(true);
  const [portalData, setPortalData] = useState(null);
  const [error, setError] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [comment, setComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const loadPortal = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError('');
      const data = await publicIssuePortalService.exchange(token, sessionRef.current);
      if (data.sessionToken) {
        sessionRef.current = data.sessionToken;
        if (storageKey && typeof window !== 'undefined') {
          window.localStorage.setItem(storageKey, data.sessionToken);
        }
      }
      setPortalData(data);
    } catch (err) {
      console.error('[PublicIssuePortal] Failed to load portal:', err);
      setError(err.message || 'Unable to load issue details');
    } finally {
      setLoading(false);
    }
  }, [token, storageKey]);

  useEffect(() => {
    loadPortal();
  }, [loadPortal]);

  const handleVerify = async (evt) => {
    evt.preventDefault();
    if (!otpCode.trim()) return;
    try {
      setVerifying(true);
      setError('');
      const data = await publicIssuePortalService.verify(token, otpCode.trim());
      if (data.sessionToken) {
        sessionRef.current = data.sessionToken;
        if (storageKey && typeof window !== 'undefined') {
          window.localStorage.setItem(storageKey, data.sessionToken);
        }
      }
      setPortalData(data);
      setOtpCode('');
    } catch (err) {
      console.error('OTP verify failed:', err);
      setError(err.data?.status === 'invalid_code' ? 'Invalid code. Please try again.' : err.message || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleAddComment = async () => {
    const text = comment.trim();
    if (!text) return;
    try {
      setPostingComment(true);
      const data = await publicIssuePortalService.addComment(token, sessionRef.current, text);
      setPortalData(data);
      setComment('');
    } catch (err) {
      setError(err.message || 'Failed to add comment');
    } finally {
      setPostingComment(false);
    }
  };

  const handleUpload = async (evt) => {
    const file = evt.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      setUploadError('');
      const data = await publicIssuePortalService.upload(token, sessionRef.current, file);
      setPortalData(data);
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      evt.target.value = '';
    }
  };

  const handleDownloadUpload = async (uploadId) => {
    try {
      const data = await publicIssuePortalService.download(token, sessionRef.current, uploadId);
      if (data?.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      setError(err.message || 'Failed to download file');
    }
  };

  const issue = portalData?.issue || null;
  const company = portalData?.company || null;
  const project = portalData?.project || null;
  const comments = portalData?.comments || [];
  const uploads = portalData?.uploads || [];
  const photos = portalData?.photos || [];
  const currentStakeholderEmail = (portalData?.stakeholder?.email || '').toLowerCase().trim();

  const renderVerification = () => (
    <form onSubmit={handleVerify} className="max-w-md mx-auto bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Verify your access</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Enter the six-digit code from your invitation email to view this issue.
        </p>
      </div>
      <input
        type="text"
        className="w-full text-center text-2xl tracking-widest px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-white"
        maxLength={6}
        value={otpCode}
        onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
      />
      <Button type="submit" variant="primary" loading={verifying} disabled={!otpCode || verifying} className="w-full">
        Verify and continue
      </Button>
    </form>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-900">
        <div className="flex flex-col items-center gap-2 text-gray-600 dark:text-gray-300">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading issue…</span>
        </div>
      </div>
    );
  }

  if (portalData?.status === 'invalid' || portalData?.status === 'revoked' || portalData?.status === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-zinc-900">
        <div className="max-w-md text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Link not available</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This public issue link has expired or was revoked. Please contact your project manager for a new invitation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header with company branding and project name */}
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-700 pb-6">
          <div className="flex items-center gap-4">
            {company?.logoUrl ? (
              <img src={company.logoUrl} alt={company?.name || 'Company logo'} className="h-24 max-w-[200px] object-contain rounded" />
            ) : (
              <ImageIcon className="w-16 h-16 text-violet-500" />
            )}
            <div>
              <p className="text-sm uppercase text-gray-500 tracking-wide">External Issue Portal</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">{company?.name || 'Issue Portal'}</p>
            </div>
          </div>
          {project?.name && (
            <div className="text-right">
              <p className="text-sm uppercase text-gray-500 tracking-wide">Project</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">{project.name}</p>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 px-4 py-2 text-sm">
            {error}
          </div>
        )}

        {portalData?.status === 'needs_verification' ? (
          renderVerification()
        ) : (
          <>
            <section className="rounded-2xl border p-4" style={sectionStyles.card}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase text-gray-500 tracking-wide">Issue</p>
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{issue?.title}</h1>
                </div>
                {issue && (
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${getStatusBadge(issue.status).className}`}>
                    {getStatusBadge(issue.status).label}
                  </span>
                )}
              </div>
              <div className="mt-4 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-line">
                {issue?.description || 'No description provided.'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <p className="font-medium text-gray-900 dark:text-white">{issue?.status || 'Open'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Due Date</p>
                  <DateField date={issue?.dueDate} variant="inline" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Last Updated</p>
                  <DateField date={issue?.updatedAt} variant="inline" colorMode="timestamp" showTime={true} />
                </div>
              </div>
            </section>

            {photos.length > 0 && (
              <section className="rounded-2xl border p-4 space-y-3" style={sectionStyles.card}>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Photos</h3>
                  <span className="text-xs text-gray-500">{photos.length} {photos.length === 1 ? 'photo' : 'photos'}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {photos.map((photo) => {
                    // Use Graph API thumbnail if metadata available, otherwise fallback to image proxy
                    const thumbnailUrl = photo.sharepointDriveId && photo.sharepointItemId
                      ? `/api/sharepoint-thumbnail?driveId=${encodeURIComponent(photo.sharepointDriveId)}&itemId=${encodeURIComponent(photo.sharepointItemId)}&size=medium`
                      : `/api/image-proxy?url=${encodeURIComponent(photo.url)}`;
                    const fullUrl = `/api/image-proxy?url=${encodeURIComponent(photo.url)}`;
                    return (
                      <a
                        key={photo.id}
                        href={fullUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative aspect-square rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-violet-400 transition-colors"
                      >
                        <img
                          src={thumbnailUrl}
                          alt={photo.fileName || 'Issue photo'}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                      </a>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="rounded-2xl border p-4 space-y-3" style={sectionStyles.card}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Add a Comment</h3>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAddComment}
                  disabled={!comment.trim() || postingComment}
                  loading={postingComment}
                >
                  Post
                </Button>
              </div>
              <textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 text-sm text-gray-900 dark:text-gray-100 px-3 py-2"
                placeholder="Share an update or ask a question…"
              />
            </section>

            <section className="rounded-2xl border p-4 space-y-3" style={sectionStyles.card}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Comments</h3>
                <span className="text-xs text-gray-500">{comments.length} entries</span>
              </div>
              {comments.length === 0 ? (
                <div className="text-sm text-gray-500">No comments yet.</div>
              ) : (
                <div className="space-y-2">
                  {comments.map((entry) => {
                    // Check if comment author matches current external stakeholder
                    const authorEmail = (entry.email || '').toLowerCase().trim();
                    const isFromExternalStakeholder = authorEmail && authorEmail === currentStakeholderEmail;
                    return (
                      <div key={entry.id} className="rounded-xl border px-3 py-2">
                        <div className="text-sm text-gray-900 dark:text-gray-100">{entry.text}</div>
                        <div className="text-[11px] text-gray-500 mt-1">
                          by{' '}
                          <span className="font-medium" style={{ color: isFromExternalStakeholder ? palette.success : palette.accent }}>
                            {entry.author || 'Team'}
                          </span>
                          {' '}• <DateField date={entry.createdAt} variant="inline" colorMode="timestamp" showTime={true} className="text-[11px]" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border p-4 space-y-3" style={sectionStyles.card}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Share Photos & Files</h3>
                <label className={`px-3 py-1.5 rounded-lg border text-sm ${uploading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
                  {uploading ? 'Uploading…' : 'Upload file'}
                </label>
              </div>
              {uploadError && <div className="text-xs text-rose-500">{uploadError}</div>}
              {uploads.length === 0 ? (
                <div className="text-sm text-gray-500">No external uploads yet.</div>
              ) : (
                <div className="space-y-2">
                  {uploads.map((upload) => {
                    const badge = uploadStatusBadge(upload.status);
                    return (
                      <div key={upload.id} className="rounded-xl border px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-sm flex items-center gap-2">
                              <Paperclip size={14} className="text-gray-400" />
                              {upload.fileName}
                              <span className="text-xs text-gray-500">{formatBytes(upload.fileSize)}</span>
                            </div>
                            <div className="text-xs text-gray-500">
                              Submitted on <DateField date={upload.submittedAt} variant="inline" colorMode="timestamp" showTime={true} />
                            </div>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                          {upload.rejectionReason && <span>Reason: {upload.rejectionReason}</span>}
                          <Button variant="ghost" size="xs" icon={Download} onClick={() => handleDownloadUpload(upload.id)}>
                            Download
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default PublicIssuePortal;
