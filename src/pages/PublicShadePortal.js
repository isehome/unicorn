import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import Button from '../components/ui/Button';
import { publicShadePortalService } from '../services/publicShadePortalService';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Image as ImageIcon } from 'lucide-react';

const getStatusBadge = (status) => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'approved') {
    return { label: 'Approved', className: 'bg-green-100 text-green-700' };
  }
  if (normalized === 'sent') {
    return { label: 'Pending Review', className: 'bg-amber-100 text-amber-700' };
  }
  return { label: status || 'Draft', className: 'bg-gray-100 text-gray-600' };
};

const PublicShadePortal = () => {
  const { token } = useParams();
  const { theme, mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const storageKey = token ? `publicShadeSession:${token}` : null;
  const sessionRef = useRef(typeof window !== 'undefined' && storageKey ? window.localStorage.getItem(storageKey) : null);

  const [loading, setLoading] = useState(true);
  const [portalData, setPortalData] = useState(null);
  const [error, setError] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [expandedRooms, setExpandedRooms] = useState(new Set());

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
      // Auto-expand all rooms
      if (data?.shades) {
        const rooms = new Set(data.shades.map(s => s.roomName || 'Unassigned'));
        setExpandedRooms(rooms);
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
      // Auto-expand all rooms
      if (data?.shades) {
        const rooms = new Set(data.shades.map(s => s.roomName || 'Unassigned'));
        setExpandedRooms(rooms);
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

  const company = portalData?.company || null;
  const project = portalData?.project || null;
  const shades = portalData?.shades || [];
  const stakeholder = portalData?.stakeholder || null;

  // Group shades by room
  const groupedShades = shades.reduce((acc, shade) => {
    const room = shade.roomName || 'Unassigned';
    if (!acc[room]) acc[room] = [];
    acc[room].push(shade);
    return acc;
  }, {});

  const renderVerification = () => (
    <form onSubmit={handleVerify} className="max-w-md mx-auto bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Verify your access</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Enter the six-digit code from your invitation email to view the window covering selections.
        </p>
      </div>
      <input
        type="text"
        className="w-full text-center text-2xl tracking-widest px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white"
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-2 text-gray-600 dark:text-gray-300">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading window coverings…</span>
        </div>
      </div>
    );
  }

  if (portalData?.status === 'invalid' || portalData?.status === 'revoked' || portalData?.status === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Link not available</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This window covering review link has expired or was revoked. Please contact your project manager for a new invitation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header with company branding and project name */}
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 dark:border-gray-700 pb-6">
          <div className="flex items-center gap-4">
            {company?.logoUrl ? (
              <img src={company.logoUrl} alt={company?.name || 'Company logo'} className="h-24 max-w-[200px] object-contain rounded" />
            ) : (
              <ImageIcon className="w-16 h-16 text-violet-500" />
            )}
            <div>
              <p className="text-sm uppercase text-gray-500 tracking-wide">Window Covering Review</p>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">{company?.name || 'Shade Portal'}</p>
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
            {/* Welcome message */}
            {stakeholder?.name && (
              <div className="rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 px-4 py-3">
                <p className="text-sm text-violet-800 dark:text-violet-200">
                  Welcome, <strong>{stakeholder.name}</strong>. Please review the window covering selections below.
                </p>
              </div>
            )}

            {/* Summary */}
            <section className="rounded-2xl border p-4" style={sectionStyles.card}>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Summary</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Total Shades</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{shades.length}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Rooms</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{Object.keys(groupedShades).length}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Pending Review</p>
                  <p className="text-2xl font-bold text-amber-600">{shades.filter(s => s.designReviewStatus === 'sent').length}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Approved</p>
                  <p className="text-2xl font-bold text-green-600">{shades.filter(s => s.approvalStatus === 'approved').length}</p>
                </div>
              </div>
            </section>

            {/* Shades by Room */}
            <section className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Window Coverings by Room</h2>

              {Object.entries(groupedShades).sort().map(([roomName, roomShades]) => {
                const isExpanded = expandedRooms.has(roomName);
                return (
                  <div key={roomName} className="rounded-xl border overflow-hidden" style={sectionStyles.card}>
                    <button
                      onClick={() => toggleRoom(roomName)}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900 dark:text-white">{roomName}</span>
                        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          {roomShades.length} {roomShades.length === 1 ? 'shade' : 'shades'}
                        </span>
                      </div>
                      {isExpanded ? <ChevronDown size={20} className="text-gray-400" /> : <ChevronRight size={20} className="text-gray-400" />}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-200 dark:border-gray-700">
                        {roomShades.map(shade => (
                          <div key={shade.id} className="p-4 border-b last:border-b-0 border-gray-100 dark:border-gray-700/50">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-medium text-gray-900 dark:text-white">{shade.name}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusBadge(shade.approvalStatus).className}`}>
                                    {getStatusBadge(shade.approvalStatus).label}
                                  </span>
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                  {shade.technology} • {shade.model}
                                </div>
                                {shade.fabricSelection && (
                                  <div className="mt-1 text-sm">
                                    <span className="text-gray-500">Fabric:</span>{' '}
                                    <a
                                      href={`https://www.lutronfabrics.com/textile-search?search_api_views_fulltext=${encodeURIComponent(shade.fabricSelection)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-violet-600 hover:underline"
                                    >
                                      {shade.fabricSelection}
                                    </a>
                                  </div>
                                )}
                              </div>
                              <div className="text-right">
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  {shade.width}" × {shade.height}"
                                </div>
                                <div className="text-xs text-gray-500">
                                  {shade.mountType} Mount
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {shades.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  No window coverings found for this project.
                </div>
              )}
            </section>

            {/* Contact info */}
            {company?.ordersContact?.email && (
              <section className="rounded-2xl border p-4 text-sm" style={sectionStyles.card}>
                <p className="text-gray-600 dark:text-gray-400">
                  Questions about these selections? Contact{' '}
                  <a href={`mailto:${company.ordersContact.email}`} className="text-violet-600 hover:underline">
                    {company.ordersContact.name || company.ordersContact.email}
                  </a>
                  {company.ordersContact.phone && ` or call ${company.ordersContact.phone}`}.
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PublicShadePortal;
