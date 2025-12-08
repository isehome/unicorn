import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { publicShadePortalService } from '../services/publicShadePortalService';

// Standalone SVG icons to avoid external dependencies
const AlertTriangleIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
    <path d="M12 9v4"/>
    <path d="M12 17h.01"/>
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6"/>
  </svg>
);

const ChevronRightIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6"/>
  </svg>
);

const ImageIcon = () => (
  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
    <circle cx="9" cy="9" r="2"/>
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5"/>
  </svg>
);

const MessageIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
  </svg>
);

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 2-7 20-4-9-9-4Z"/>
    <path d="M22 2 11 13"/>
  </svg>
);

const getStatusBadge = (status) => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'approved') {
    return { label: 'Approved', bg: '#dcfce7', color: '#15803d' };
  }
  if (normalized === 'sent') {
    return { label: 'Pending Review', bg: '#fef3c7', color: '#b45309' };
  }
  return { label: status || 'Draft', bg: '#f3f4f6', color: '#4b5563' };
};

const PublicShadePortal = () => {
  const { token } = useParams();
  const storageKey = token ? `publicShadeSession:${token}` : null;
  const sessionRef = useRef(typeof window !== 'undefined' && storageKey ? window.localStorage.getItem(storageKey) : null);

  const [loading, setLoading] = useState(true);
  const [portalData, setPortalData] = useState(null);
  const [error, setError] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [expandedRooms, setExpandedRooms] = useState(new Set());
  const [approvingShade, setApprovingShade] = useState(null);
  const [expandedComments, setExpandedComments] = useState(new Set());
  const [commentsByShade, setCommentsByShade] = useState({});
  const [newComments, setNewComments] = useState({});
  const [submittingComment, setSubmittingComment] = useState(null);
  const [allApproved, setAllApproved] = useState(false);

  const loadPortal = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError('');
      const data = await publicShadePortalService.exchange(token, sessionRef.current);
      if (data.sessionToken) {
        sessionRef.current = data.sessionToken;
        if (storageKey && typeof window !== 'undefined') {
          window.localStorage.setItem(storageKey, data.sessionToken);
        }
      }
      setPortalData(data);
      if (data?.shades) {
        const rooms = new Set(data.shades.map(s => s.roomName || 'Unassigned'));
        setExpandedRooms(rooms);
        // Check if all shades are already approved
        const allAlreadyApproved = data.shades.length > 0 && data.shades.every(s => s.approvalStatus === 'approved');
        setAllApproved(allAlreadyApproved);
      }
    } catch (err) {
      console.error('[PublicShadePortal] Failed to load portal:', err);
      setError(err.message || 'Unable to load shade details');
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
      const data = await publicShadePortalService.verify(token, otpCode.trim());
      if (data.sessionToken) {
        sessionRef.current = data.sessionToken;
        if (storageKey && typeof window !== 'undefined') {
          window.localStorage.setItem(storageKey, data.sessionToken);
        }
      }
      setPortalData(data);
      setOtpCode('');
      if (data?.shades) {
        const rooms = new Set(data.shades.map(s => s.roomName || 'Unassigned'));
        setExpandedRooms(rooms);
        // Check if all shades are already approved
        const allAlreadyApproved = data.shades.length > 0 && data.shades.every(s => s.approvalStatus === 'approved');
        setAllApproved(allAlreadyApproved);
      }
    } catch (err) {
      console.error('OTP verify failed:', err);
      setError(err.data?.status === 'invalid_code' ? 'Invalid code. Please try again.' : err.message || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const toggleRoom = (roomName) => {
    setExpandedRooms(prev => {
      const next = new Set(prev);
      if (next.has(roomName)) next.delete(roomName);
      else next.add(roomName);
      return next;
    });
  };

  const toggleComments = async (shadeId) => {
    const isCurrentlyExpanded = expandedComments.has(shadeId);

    setExpandedComments(prev => {
      const next = new Set(prev);
      if (next.has(shadeId)) next.delete(shadeId);
      else next.add(shadeId);
      return next;
    });

    // Fetch comments when expanding (if not already loaded)
    if (!isCurrentlyExpanded && !commentsByShade[shadeId] && sessionRef.current) {
      try {
        const response = await publicShadePortalService.getComments(token, sessionRef.current, shadeId);
        if (response.comments) {
          setCommentsByShade(prev => ({ ...prev, [shadeId]: response.comments }));
        }
      } catch (err) {
        console.error('[PublicShadePortal] Failed to load comments:', err);
      }
    }
  };

  const handleApprove = async (shadeId) => {
    if (!sessionRef.current || approvingShade) return;
    try {
      setApprovingShade(shadeId);
      const response = await publicShadePortalService.approve(token, sessionRef.current, shadeId);
      if (response.shades) {
        setPortalData(prev => ({ ...prev, shades: response.shades }));
        // Check if all shades are now approved
        const nowAllApproved = response.shades.length > 0 && response.shades.every(s => s.approvalStatus === 'approved');
        if (nowAllApproved) {
          setAllApproved(true);
        }
      }
      // Also check the explicit flag from API
      if (response.allApproved) {
        setAllApproved(true);
      }
    } catch (err) {
      console.error('[PublicShadePortal] Approve failed:', err);
      setError(err.message || 'Failed to approve shade');
    } finally {
      setApprovingShade(null);
    }
  };

  const handleCommentChange = (shadeId, value) => {
    setNewComments(prev => ({ ...prev, [shadeId]: value }));
  };

  const handleSubmitComment = async (shadeId) => {
    const commentText = (newComments[shadeId] || '').trim();
    if (!commentText || !sessionRef.current || submittingComment) return;
    try {
      setSubmittingComment(shadeId);
      const response = await publicShadePortalService.addComment(token, sessionRef.current, shadeId, commentText);
      if (response.comments) {
        setCommentsByShade(prev => ({ ...prev, [shadeId]: response.comments }));
      }
      setNewComments(prev => ({ ...prev, [shadeId]: '' }));
    } catch (err) {
      console.error('[PublicShadePortal] Comment failed:', err);
      setError(err.message || 'Failed to add comment');
    } finally {
      setSubmittingComment(null);
    }
  };

  const company = portalData?.company || null;
  const project = portalData?.project || null;
  const shades = portalData?.shades || [];
  const stakeholder = portalData?.stakeholder || null;

  const groupedShades = shades.reduce((acc, shade) => {
    const room = shade.roomName || 'Unassigned';
    if (!acc[room]) acc[room] = [];
    acc[room].push(shade);
    return acc;
  }, {});

  // Standalone styles
  const styles = {
    page: {
      minHeight: '100vh',
      backgroundColor: '#f9fafb',
      padding: '24px 16px',
      boxSizing: 'border-box',
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch'
    },
    container: {
      maxWidth: '900px',
      margin: '0 auto'
    },
    card: {
      backgroundColor: '#ffffff',
      borderRadius: '16px',
      border: '1px solid #e5e7eb',
      marginBottom: '16px',
      overflow: 'visible'
    },
    header: {
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      borderBottom: '1px solid #e5e7eb',
      paddingBottom: '24px',
      marginBottom: '16px'
    },
    headerRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '16px'
    },
    logo: {
      height: '80px',
      maxWidth: '180px',
      objectFit: 'contain',
      borderRadius: '8px'
    },
    logoPlaceholder: {
      color: '#8b5cf6'
    },
    label: {
      fontSize: '12px',
      textTransform: 'uppercase',
      color: '#6b7280',
      letterSpacing: '0.5px',
      marginBottom: '2px'
    },
    title: {
      fontSize: '20px',
      fontWeight: '600',
      color: '#111827',
      margin: 0
    },
    input: {
      width: '100%',
      textAlign: 'center',
      fontSize: '24px',
      letterSpacing: '8px',
      padding: '12px 16px',
      borderRadius: '12px',
      border: '1px solid #d1d5db',
      backgroundColor: '#f9fafb',
      color: '#111827',
      boxSizing: 'border-box'
    },
    button: {
      width: '100%',
      padding: '12px 24px',
      borderRadius: '12px',
      border: 'none',
      backgroundColor: '#8b5cf6',
      color: '#ffffff',
      fontSize: '16px',
      fontWeight: '500',
      cursor: 'pointer',
      opacity: verifying ? 0.7 : 1
    },
    errorBox: {
      borderRadius: '12px',
      border: '1px solid #fecaca',
      backgroundColor: '#fef2f2',
      color: '#b91c1c',
      padding: '12px 16px',
      fontSize: '14px',
      marginBottom: '16px'
    },
    welcomeBox: {
      borderRadius: '12px',
      backgroundColor: '#f5f3ff',
      border: '1px solid #ddd6fe',
      padding: '12px 16px',
      marginBottom: '16px'
    },
    welcomeText: {
      fontSize: '14px',
      color: '#5b21b6',
      margin: 0
    },
    summaryGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 1fr)',
      gap: '16px',
      padding: '16px'
    },
    statLabel: {
      fontSize: '12px',
      color: '#6b7280',
      marginBottom: '4px'
    },
    statValue: {
      fontSize: '28px',
      fontWeight: '700',
      color: '#111827',
      margin: 0
    },
    sectionTitle: {
      fontSize: '18px',
      fontWeight: '600',
      color: '#111827',
      margin: '0 0 12px 0'
    },
    roomButton: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px',
      border: 'none',
      backgroundColor: 'transparent',
      cursor: 'pointer',
      textAlign: 'left'
    },
    roomName: {
      fontWeight: '600',
      color: '#111827',
      marginRight: '8px'
    },
    roomCount: {
      padding: '2px 8px',
      borderRadius: '12px',
      fontSize: '12px',
      backgroundColor: '#f3f4f6',
      color: '#4b5563'
    },
    shadeList: {
      borderTop: '1px solid #e5e7eb'
    },
    shadeItem: {
      padding: '16px',
      borderBottom: '1px solid #f3f4f6'
    },
    shadeRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '16px'
    },
    shadeName: {
      fontWeight: '500',
      color: '#111827',
      marginRight: '8px'
    },
    shadeDetails: {
      fontSize: '14px',
      color: '#6b7280',
      marginTop: '4px'
    },
    shadeDimensions: {
      textAlign: 'right'
    },
    dimensionText: {
      fontSize: '14px',
      fontWeight: '500',
      color: '#111827'
    },
    mountText: {
      fontSize: '12px',
      color: '#6b7280'
    },
    fabricLink: {
      color: '#8b5cf6',
      textDecoration: 'underline',
      cursor: 'pointer'
    },
    contactBox: {
      padding: '16px',
      fontSize: '14px',
      color: '#6b7280'
    },
    contactLink: {
      color: '#8b5cf6',
      textDecoration: 'none'
    },
    spinner: {
      width: '32px',
      height: '32px',
      border: '2px solid #8b5cf6',
      borderTopColor: 'transparent',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite'
    },
    centerContent: {
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f9fafb',
      padding: '24px'
    }
  };

  // Loading state
  if (loading) {
    return (
      <div style={styles.centerContent}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ textAlign: 'center' }}>
          <div style={styles.spinner} />
          <p style={{ color: '#6b7280', marginTop: '12px', fontSize: '14px' }}>Loading window coverings…</p>
        </div>
      </div>
    );
  }

  // Invalid/revoked/expired state - show specific error messages based on reason
  if (portalData?.status === 'invalid' || portalData?.status === 'revoked' || portalData?.status === 'expired') {
    const reason = portalData?.reason;
    let errorTitle = 'Link not available';
    let errorMessage = 'This window covering review link has expired or was revoked. Please contact your project manager for a new invitation.';

    if (reason === 'project_missing' || reason === 'project_deleted') {
      errorTitle = 'Project no longer exists';
      errorMessage = 'The project associated with this link has been deleted. Please contact your project manager if you believe this is an error.';
    } else if (reason === 'link_revoked') {
      errorTitle = 'Link has been revoked';
      errorMessage = 'This review link has been revoked by the project manager. Please request a new invitation if you need access.';
    } else if (reason === 'link_not_found') {
      errorTitle = 'Invalid link';
      errorMessage = 'This link is not valid. Please check that you have the correct URL or request a new invitation.';
    } else if (reason === 'otp_expired') {
      errorTitle = 'Verification code expired';
      errorMessage = 'Your verification code has expired. Please request a new invitation from your project manager.';
    }

    return (
      <div style={styles.centerContent}>
        <div style={{ maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ color: '#f43f5e', marginBottom: '16px' }}>
            <AlertTriangleIcon />
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>{errorTitle}</h2>
          <p style={{ fontSize: '14px', color: '#6b7280' }}>
            {errorMessage}
          </p>
        </div>
      </div>
    );
  }

  // Verification form
  const renderVerification = () => (
    <form onSubmit={handleVerify} style={{ ...styles.card, maxWidth: '400px', margin: '0 auto', padding: '24px' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>Verify your access</h2>
        <p style={{ fontSize: '14px', color: '#6b7280' }}>
          Enter the six-digit code from your invitation email to view the window covering selections.
        </p>
      </div>
      <input
        type="text"
        style={styles.input}
        maxLength={6}
        placeholder="000000"
        value={otpCode}
        onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
      />
      <button
        type="submit"
        style={{ ...styles.button, marginTop: '16px' }}
        disabled={!otpCode || verifying}
      >
        {verifying ? 'Verifying…' : 'Verify and continue'}
      </button>
    </form>
  );

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.headerRow}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {company?.logoUrl ? (
                <img src={company.logoUrl} alt={company?.name || 'Company'} style={styles.logo} />
              ) : (
                <div style={styles.logoPlaceholder}>
                  <ImageIcon />
                </div>
              )}
              <div>
                <p style={styles.label}>Window Covering Review</p>
                <h1 style={styles.title}>{company?.name || 'Shade Portal'}</h1>
              </div>
            </div>
            {project?.name && (
              <div style={{ textAlign: 'right' }}>
                <p style={styles.label}>Project</p>
                <h2 style={{ ...styles.title, fontSize: '18px' }}>{project.name}</h2>
              </div>
            )}
          </div>
        </div>

        {/* Error message */}
        {error && <div style={styles.errorBox}>{error}</div>}

        {portalData?.status === 'needs_verification' ? (
          renderVerification()
        ) : (
          <>
            {/* All approved success message */}
            {allApproved && (
              <div style={{
                borderRadius: '12px',
                backgroundColor: '#dcfce7',
                border: '1px solid #86efac',
                padding: '16px',
                marginBottom: '16px',
                textAlign: 'center'
              }}>
                <p style={{ fontSize: '16px', fontWeight: '600', color: '#15803d', margin: 0 }}>
                  ✓ All window coverings have been approved!
                </p>
                <p style={{ fontSize: '14px', color: '#166534', marginTop: '8px', margin: '8px 0 0 0' }}>
                  Thank you for your review. The project team has been notified.
                </p>
              </div>
            )}

            {/* Welcome message */}
            {stakeholder?.name && !allApproved && (
              <div style={styles.welcomeBox}>
                <p style={styles.welcomeText}>
                  Welcome, <strong>{stakeholder.name}</strong>. Please review the window covering selections below.
                </p>
              </div>
            )}

            {/* Summary */}
            <div style={styles.card}>
              <div style={{ padding: '16px 16px 8px' }}>
                <h2 style={styles.sectionTitle}>Summary</h2>
              </div>
              <div style={styles.summaryGrid}>
                <div>
                  <p style={styles.statLabel}>Total Shades</p>
                  <p style={styles.statValue}>{shades.length}</p>
                </div>
                <div>
                  <p style={styles.statLabel}>Rooms</p>
                  <p style={styles.statValue}>{Object.keys(groupedShades).length}</p>
                </div>
                <div>
                  <p style={styles.statLabel}>Pending Review</p>
                  <p style={{ ...styles.statValue, color: '#d97706' }}>{shades.filter(s => s.designReviewStatus === 'sent').length}</p>
                </div>
                <div>
                  <p style={styles.statLabel}>Approved</p>
                  <p style={{ ...styles.statValue, color: '#16a34a' }}>{shades.filter(s => s.approvalStatus === 'approved').length}</p>
                </div>
              </div>
            </div>

            {/* Shades by Room */}
            <div style={{ marginBottom: '16px' }}>
              <h2 style={styles.sectionTitle}>Window Coverings by Room</h2>

              {Object.entries(groupedShades).sort().map(([roomName, roomShades]) => {
                const isExpanded = expandedRooms.has(roomName);
                return (
                  <div key={roomName} style={styles.card}>
                    <button onClick={() => toggleRoom(roomName)} style={styles.roomButton}>
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={styles.roomName}>{roomName}</span>
                        <span style={styles.roomCount}>
                          {roomShades.length} {roomShades.length === 1 ? 'shade' : 'shades'}
                        </span>
                      </div>
                      <div style={{ color: '#9ca3af' }}>
                        {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div style={styles.shadeList}>
                        {roomShades.map((shade, index) => {
                          const badge = getStatusBadge(shade.approvalStatus);
                          return (
                            <div
                              key={shade.id}
                              style={{
                                ...styles.shadeItem,
                                borderBottom: index === roomShades.length - 1 ? 'none' : '1px solid #f3f4f6'
                              }}
                            >
                              <div style={styles.shadeRow}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                    <span style={styles.shadeName}>{shade.name}</span>
                                    <span style={{
                                      padding: '2px 8px',
                                      borderRadius: '12px',
                                      fontSize: '12px',
                                      backgroundColor: badge.bg,
                                      color: badge.color
                                    }}>
                                      {badge.label}
                                    </span>
                                  </div>
                                  <p style={styles.shadeDetails}>
                                    {shade.technology} • {shade.model}
                                  </p>
                                  {shade.fabricSelection && (
                                    <div style={{ marginTop: '4px', fontSize: '12px' }}>
                                      <a
                                        href={`https://www.lutronfabrics.com/us/en/search/results?q=${encodeURIComponent(shade.fabricSelection)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        style={styles.fabricLink}
                                      >
                                        Fabric: {shade.fabricSelection}
                                      </a>
                                    </div>
                                  )}
                                </div>
                                <div style={styles.shadeDimensions}>
                                  <p style={styles.dimensionText}>
                                    {shade.width}" × {shade.height}"
                                  </p>
                                  <p style={styles.mountText}>
                                    {shade.mountType} Mount
                                  </p>
                                </div>
                              </div>

                              {/* Action buttons row */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #f3f4f6' }}>
                                {/* Approve button - only show if not already approved */}
                                {shade.approvalStatus !== 'approved' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleApprove(shade.id); }}
                                    disabled={approvingShade === shade.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      padding: '6px 12px',
                                      backgroundColor: approvingShade === shade.id ? '#d1d5db' : '#15803d',
                                      color: '#ffffff',
                                      border: 'none',
                                      borderRadius: '8px',
                                      fontSize: '13px',
                                      fontWeight: '500',
                                      cursor: approvingShade === shade.id ? 'wait' : 'pointer'
                                    }}
                                  >
                                    <CheckIcon />
                                    {approvingShade === shade.id ? 'Approving...' : 'Approve'}
                                  </button>
                                )}

                                {/* Comments toggle button */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleComments(shade.id); }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    backgroundColor: expandedComments.has(shade.id) ? '#e0e7ff' : '#f3f4f6',
                                    color: expandedComments.has(shade.id) ? '#4338ca' : '#6b7280',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    fontWeight: '500',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <MessageIcon />
                                  Comments {(commentsByShade[shade.id]?.length || 0) > 0 && `(${commentsByShade[shade.id].length})`}
                                </button>
                              </div>

                              {/* Comments section - collapsible */}
                              {expandedComments.has(shade.id) && (
                                <div style={{ marginTop: '12px', padding: '12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                                  {/* Existing comments */}
                                  {(commentsByShade[shade.id] || []).length > 0 ? (
                                    <div style={{ marginBottom: '12px' }}>
                                      {commentsByShade[shade.id].map(comment => (
                                        <div key={comment.id} style={{ padding: '8px', backgroundColor: '#ffffff', borderRadius: '6px', marginBottom: '8px', border: '1px solid #e5e7eb' }}>
                                          <p style={{ fontSize: '13px', color: '#111827', margin: 0 }}>{comment.text}</p>
                                          <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px', margin: 0 }}>
                                            by <span style={{ fontWeight: '500', color: comment.email === stakeholder?.email ? '#15803d' : '#8b5cf6' }}>{comment.author}</span>
                                            {' '}• {new Date(comment.createdAt).toLocaleString()}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '12px' }}>No comments yet</p>
                                  )}

                                  {/* Add comment form */}
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                      type="text"
                                      value={newComments[shade.id] || ''}
                                      onChange={(e) => handleCommentChange(shade.id, e.target.value)}
                                      placeholder="Add a comment..."
                                      style={{
                                        flex: 1,
                                        padding: '8px 12px',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '6px',
                                        fontSize: '14px'
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                          e.preventDefault();
                                          handleSubmitComment(shade.id);
                                        }
                                      }}
                                    />
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleSubmitComment(shade.id); }}
                                      disabled={submittingComment === shade.id || !(newComments[shade.id] || '').trim()}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '8px 12px',
                                        backgroundColor: (newComments[shade.id] || '').trim() ? '#8b5cf6' : '#d1d5db',
                                        color: '#ffffff',
                                        border: 'none',
                                        borderRadius: '6px',
                                        fontSize: '13px',
                                        cursor: (newComments[shade.id] || '').trim() ? 'pointer' : 'not-allowed'
                                      }}
                                    >
                                      <SendIcon />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {shades.length === 0 && (
                <div style={{ textAlign: 'center', padding: '48px 16px', color: '#6b7280' }}>
                  No window coverings found for this project.
                </div>
              )}
            </div>

            {/* Contact info */}
            {company?.ordersContact?.email && (
              <div style={styles.card}>
                <div style={styles.contactBox}>
                  Questions about these selections? Contact{' '}
                  <a href={`mailto:${company.ordersContact.email}`} style={styles.contactLink}>
                    {company.ordersContact.name || company.ordersContact.email}
                  </a>
                  {company.ordersContact.phone && ` or call ${company.ordersContact.phone}`}.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PublicShadePortal;
