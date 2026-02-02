import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { usePrinter } from '../contexts/PrinterContext';
import { useAppState } from '../contexts/AppStateContext';
import { enhancedStyles } from '../styles/styleSystem';
import ThemeToggle from './ui/ThemeToggle';
import Button from './ui/Button';
import ColorPicker from './ui/ColorPicker';
import TechnicianAvatar from './TechnicianAvatar';
import { Printer, CheckCircle, WifiOff, AlertCircle, Smartphone, LogOut, ChevronRight, Loader2, X, Shield, Briefcase } from 'lucide-react';
import { supabase } from '../lib/supabase';

import AISettings from './UserSettings/AISettings';


const SettingsPage = () => {
  const { mode, toggleTheme } = useTheme();
  const { user, logout, updateAvatarColor } = useAuth();
  const navigate = useNavigate();
  const { publishState, registerActions, unregisterActions } = useAppState();
  const sectionStyles = enhancedStyles.sections[mode];
  const {
    connected,
    connecting,
    error: printerError,
    supported,
    sdkInitialized,
    isIOSSafari,
    connectPrinter,
    disconnectPrinter
  } = usePrinter();

  // Default workspace mode - stored in localStorage
  const [defaultWorkspace, setDefaultWorkspace] = useState(() => {
    return localStorage.getItem('default-workspace-mode') || 'technician';
  });
  const [loggingOut, setLoggingOut] = useState(false);

  // Admin access state - users need director+ role (level >= 60)
  const [hasAdminAccess, setHasAdminAccess] = useState(false);

  // Avatar color state
  const [avatarColor, setAvatarColor] = useState('#8B5CF6');
  const [loadingAvatarColor, setLoadingAvatarColor] = useState(false);
  const [savingAvatarColor, setSavingAvatarColor] = useState(false);
  const [avatarColorMessage, setAvatarColorMessage] = useState('');
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  const displayName = user?.displayName || user?.full_name || user?.name || user?.email || 'User';
  const email = user?.email || '';

  // Role level helper - matches AdminPage.js logic
  const getRoleLevel = (role) => {
    const levels = { owner: 100, admin: 80, director: 60, manager: 40, technician: 20 };
    return levels[role] || 0;
  };

  // Load user's profile data including avatar color and role
  const loadUserProfile = useCallback(async () => {
    if (!user?.id || !supabase) return;

    try {
      setLoadingAvatarColor(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_color, role')
        .eq('id', user.id)
        .single();

      if (error) {
        console.log('[SettingsPage] Profile not found, will create on first save:', error.message);
        setHasAdminAccess(false);
      } else {
        if (data?.avatar_color) {
          setAvatarColor(data.avatar_color);
        }
        // Check if user has director+ role (level >= 60)
        const roleLevel = getRoleLevel(data?.role);
        setHasAdminAccess(roleLevel >= 60);
      }
    } catch (err) {
      console.error('[SettingsPage] Failed to load profile:', err);
      setHasAdminAccess(false);
    } finally {
      setLoadingAvatarColor(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadUserProfile();
  }, [loadUserProfile]);

  // Handle avatar color change - saves directly to profiles table
  const handleAvatarColorChange = async (newColor) => {
    setAvatarColor(newColor);

    if (!user?.id || !supabase) {
      setAvatarColorMessage('Unable to save - not signed in');
      return;
    }

    try {
      setSavingAvatarColor(true);
      setAvatarColorMessage('');

      // Upsert to profiles table - creates profile if it doesn't exist
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email,
          full_name: displayName,
          avatar_color: newColor,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        });

      if (error) throw error;

      // Update the color in AuthContext so AppHeader and other components refresh immediately
      updateAvatarColor(newColor);

      setAvatarColorMessage('Avatar color saved!');
      setTimeout(() => setAvatarColorMessage(''), 2000);
    } catch (err) {
      console.error('[SettingsPage] Failed to save avatar color:', err);
      setAvatarColorMessage('Failed to save avatar color');
    } finally {
      setSavingAvatarColor(false);
    }
  };

  // Handle default workspace change
  const handleDefaultWorkspaceChange = useCallback((workspace) => {
    setDefaultWorkspace(workspace);
    localStorage.setItem('default-workspace-mode', workspace);
  }, []);

  // Handle logout
  const handleLogout = useCallback(async () => {
    try {
      setLoggingOut(true);
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      setLoggingOut(false);
    }
  }, [logout, navigate]);

  const handleConnectPrinter = useCallback(async () => {
    await connectPrinter();
  }, [connectPrinter]);

  const handleDisconnectPrinter = useCallback(async () => {
    await disconnectPrinter();
  }, [disconnectPrinter]);

  // ══════════════════════════════════════════════════════════════
  // AI VOICE COPILOT INTEGRATION
  // ══════════════════════════════════════════════════════════════

  // Publish state for AI awareness
  useEffect(() => {
    publishState({
      view: 'settings',
      activeSection: showAvatarModal ? 'avatar-color' : 'main',
      theme: mode,
      defaultWorkspace: defaultWorkspace,
      printerStatus: {
        connected,
        connecting,
        supported,
        isIOSSafari
      },
      user: {
        displayName,
        email,
        hasAdminAccess
      },
      hint: 'Settings page. Can toggle theme, change default workspace, open AI settings, open admin panel (if authorized), or sign out.'
    });
  }, [publishState, mode, defaultWorkspace, connected, connecting, supported, isIOSSafari, displayName, email, hasAdminAccess, showAvatarModal]);

  // Register actions for AI
  useEffect(() => {
    const actions = {
      toggle_theme: async () => {
        toggleTheme();
        const newMode = mode === 'light' ? 'dark' : 'light';
        return { success: true, message: `Switched to ${newMode} mode` };
      },
      set_default_workspace: async ({ workspace }) => {
        if (['technician', 'pm'].includes(workspace)) {
          handleDefaultWorkspaceChange(workspace);
          const workspaceName = workspace === 'pm' ? 'Project Manager' : 'Technician';
          return { success: true, message: `Default workspace set to ${workspaceName}` };
        }
        return { success: false, error: 'Invalid workspace. Use: technician or pm' };
      },
      open_ai_settings: async () => {
        // AI Settings is rendered inline on this page
        // Scroll to it for visibility
        const aiSection = document.querySelector('[data-section="ai-settings"]');
        if (aiSection) {
          aiSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        return { success: true, message: 'AI Settings section is visible on this page' };
      },
      open_profile: async () => {
        setShowAvatarModal(true);
        return { success: true, message: 'Opening avatar color picker' };
      },
      open_admin: async () => {
        if (hasAdminAccess) {
          navigate('/admin');
          return { success: true, message: 'Navigating to Admin panel' };
        }
        return { success: false, error: 'You do not have admin access (requires director+ role)' };
      },
      connect_printer: async () => {
        if (isIOSSafari) {
          return { success: false, error: 'Bluetooth printing not supported in Safari on iOS. Please use the Bluefy browser.' };
        }
        if (!supported) {
          return { success: false, error: 'Bluetooth printing not supported in this browser' };
        }
        if (connected) {
          return { success: true, message: 'Printer is already connected' };
        }
        await handleConnectPrinter();
        return { success: true, message: 'Attempting to connect to printer...' };
      },
      disconnect_printer: async () => {
        if (!connected) {
          return { success: true, message: 'Printer is not connected' };
        }
        await handleDisconnectPrinter();
        return { success: true, message: 'Disconnected from printer' };
      },
      sign_out: async () => {
        await handleLogout();
        return { success: true, message: 'Signing out...' };
      },
      go_to_technician_dashboard: async () => {
        navigate('/');
        return { success: true, message: 'Navigating to Technician dashboard' };
      },
      go_to_pm_dashboard: async () => {
        navigate('/pm-dashboard');
        return { success: true, message: 'Navigating to Project Manager dashboard' };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, mode, toggleTheme, hasAdminAccess, navigate, connected, supported, isIOSSafari, handleDefaultWorkspaceChange, handleConnectPrinter, handleDisconnectPrinter, handleLogout]);

  return (
    <div className="max-w-4xl mx-auto px-4 pb-24 space-y-4">
      <section className="rounded-2xl border p-4 flex items-center gap-4" style={sectionStyles.card}>
        <div className="relative group">
          <TechnicianAvatar
            name={displayName}
            color={avatarColor}
            size="xl"
            onClick={() => setShowAvatarModal(true)}
            title="Click to change avatar color"
            className="shadow-lg"
          />
          <div className="absolute inset-0 rounded-full bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
            <span className="text-white text-xs font-medium">Edit</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{displayName}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{email}</p>
          <p className="text-xs text-violet-500 dark:text-violet-400 mt-0.5">Tap avatar to customize color</p>
        </div>
      </section>

      <section className="rounded-2xl border p-4 space-y-3" style={sectionStyles.card}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Appearance</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Toggle between light and dark themes.</p>
          </div>
          <ThemeToggle />
        </div>
      </section>

      {/* Printer Setup Section */}
      <section className="rounded-2xl border p-4 space-y-4" style={sectionStyles.card}>
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Printer Setup</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Configure Brady M211 label printer for wire drop labels</p>
        </div>

        {isIOSSafari ? (
          // iOS Safari - Show instructions for Bluefy browser
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <Smartphone size={20} className="text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
                  iPhone/iPad - Label Printing
                </h3>
                <p className="text-xs text-blue-800 dark:text-blue-200 mb-2">
                  Safari and Chrome on iOS don't support Bluetooth printing. When printing is required, please use the Bluefy browser:
                </p>
                <ol className="text-xs text-blue-800 dark:text-blue-200 space-y-2 ml-4 list-decimal">
                  <li>
                    Download the <strong>Bluefy - Web BLE Browser</strong> app (free)
                    <a
                      href="https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block mt-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Download Bluefy from App Store →
                    </a>
                  </li>
                  <li>Open this web app in Bluefy browser</li>
                  <li>Return to this Settings page to connect your Brady M211 printer</li>
                  <li>If connection fails: Hold the printer's power button for 5 seconds to reset ownership</li>
                </ol>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-3 italic">
                  You can continue using Safari/Chrome for everything else - only switch to Bluefy when you need to print labels.
                </p>
              </div>
            </div>
          </div>
        ) : (
          // Desktop Chrome/Edge - Show printer connection
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <Printer size={20} className="text-gray-700 dark:text-gray-300" />
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Brady M211 Printer
                  </div>
                  <div
                    className="text-xs flex items-center gap-1.5 mt-1"
                    style={connected ? { color: '#94AF32' } : { color: '#6B7280' }}
                  >
                    {connected ? (
                      <>
                        <CheckCircle size={14} />
                        Connected
                      </>
                    ) : (
                      <>
                        <WifiOff size={14} />
                        Not Connected
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div>
                {connected ? (
                  <Button
                    onClick={handleDisconnectPrinter}
                    variant="outline"
                    size="sm"
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    onClick={handleConnectPrinter}
                    disabled={!supported || connecting || !sdkInitialized}
                    size="sm"
                  >
                    {!sdkInitialized ? 'Initializing...' : connecting ? 'Connecting...' : 'Connect Printer'}
                  </Button>
                )}
              </div>
            </div>

            {printerError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <AlertCircle size={16} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-800 dark:text-red-200">
                  {printerError}
                </p>
              </div>
            )}

            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <p>ℹ️ Labels print at 1.5" × 0.75" with QR code and wire drop info</p>
              <p>💡 Requires Chrome or Edge browser with Bluetooth enabled</p>
              {!connected && (
                <p className="text-amber-600 dark:text-amber-400">
                  ⚠️ Connection fails? Hold printer power button for 5 seconds to reset ownership
                </p>
              )}
              {connected && (
                <p className="font-medium" style={{ color: '#94AF32' }}>
                  ✓ Ready to print from Wire Drops pages
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* AI Copilot Settings */}
      <AISettings />

      {/* My HR Section - replaces My Skills and Career Development */}
      <section className="rounded-2xl border p-4" style={sectionStyles.card}>
        <button
          onClick={() => navigate('/my-hr')}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <Briefcase size={20} className="text-violet-600 dark:text-violet-400" />
            </div>
            <div className="text-left">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">My HR</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Career development, team reviews, and time off</p>
            </div>
          </div>
          <ChevronRight size={20} className="text-gray-400" />
        </button>
      </section>

      {/* Admin Section - Only shown for director+ roles */}
      {hasAdminAccess && (
        <section className="rounded-2xl border p-4" style={sectionStyles.card}>
          <button
            onClick={() => navigate('/admin')}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Shield size={20} className="text-amber-600 dark:text-amber-400" />
              </div>
              <div className="text-left">
                <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Admin</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Manage users, roles, integrations, and system settings</p>
              </div>
            </div>
            <ChevronRight size={20} className="text-gray-400" />
          </button>
        </section>
      )}

      <section className="rounded-2xl border p-4 space-y-4" style={sectionStyles.card}>
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Default Workspace</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Choose which dashboard to show when you log in and tap Home.</p>
        </div>
        <div className="flex items-center rounded-full border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-zinc-900/70 shadow-inner p-1">
          <button
            type="button"
            onClick={() => handleDefaultWorkspaceChange('technician')}
            className={`flex-1 px-4 py-2 text-xs font-medium rounded-full transition ${defaultWorkspace === 'technician'
              ? 'bg-violet-500 text-white shadow-md'
              : 'text-gray-600 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-zinc-800'
              }`}
          >
            Technician
          </button>
          <button
            type="button"
            onClick={() => handleDefaultWorkspaceChange('pm')}
            className={`flex-1 px-4 py-2 text-xs font-medium rounded-full transition ${defaultWorkspace === 'pm'
              ? 'bg-violet-500 text-white shadow-md'
              : 'text-gray-600 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-zinc-800'
              }`}
          >
            Project Manager
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {defaultWorkspace === 'pm'
            ? 'You will be directed to the Project Manager dashboard on login.'
            : 'You will be directed to the Technician dashboard on login.'}
        </p>
      </section>

      {/* Quick Navigation */}
      <section className="rounded-2xl border p-4 space-y-4" style={sectionStyles.card}>
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Quick Navigation</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Jump to a specific workspace view.</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/')}
            className="flex-1"
          >
            Go to Technician
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/pm-dashboard')}
            className="flex-1"
          >
            Go to PM Dashboard
          </Button>
        </div>
      </section>

      {/* Logout Section */}
      <section className="rounded-2xl border p-4" style={sectionStyles.card}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Sign Out</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Sign out of your Microsoft 365 account.</p>
          </div>
          <Button
            variant="danger"
            size="sm"
            icon={LogOut}
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? 'Signing out...' : 'Sign Out'}
          </Button>
        </div>
      </section>

      {/* Avatar Color Modal */}
      {showAvatarModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-2xl max-w-md w-full p-6 shadow-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Customize Avatar Color
              </h2>
              <button
                onClick={() => setShowAvatarModal(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
              >
                <X size={20} className="text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            {/* Modal Content */}
            {loadingAvatarColor ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={24} className="animate-spin text-violet-500" />
              </div>
            ) : (
              <div className="space-y-4">
                <ColorPicker
                  value={avatarColor}
                  onChange={handleAvatarColorChange}
                  userName={displayName}
                  showPreview={true}
                  label="Choose your color"
                />

                {avatarColorMessage && (
                  <p
                    className="text-sm"
                    style={{ color: avatarColorMessage.includes('Failed') || avatarColorMessage.includes('not linked') ? '#EF4444' : '#94AF32' }}
                  >
                    {avatarColorMessage}
                  </p>
                )}

                {savingAvatarColor && (
                  <div className="flex items-center gap-2 text-gray-500">
                    <Loader2 size={14} className="animate-spin" />
                    <span className="text-sm">Saving...</span>
                  </div>
                )}

                <p className="text-xs text-gray-500 dark:text-gray-400">
                  This color identifies you in the weekly scheduling calendar and team views.
                </p>
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex justify-end mt-6">
              <Button
                onClick={() => setShowAvatarModal(false)}
                size="sm"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
