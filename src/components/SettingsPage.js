import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { usePrinter } from '../contexts/PrinterContext';
import { enhancedStyles } from '../styles/styleSystem';
import ThemeToggle from './ui/ThemeToggle';
import Button from './ui/Button';
import ColorPicker from './ui/ColorPicker';
import { Printer, CheckCircle, WifiOff, AlertCircle, Smartphone, LogOut, ChevronRight, Loader2, X, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';

import AISettings from './UserSettings/AISettings';


const SettingsPage = () => {
  const { mode } = useTheme();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const sectionStyles = enhancedStyles.sections[mode];
  const {
    connected,
    connecting,
    error: printerError,
    supported,
    sdkInitialized,
    isIOSSafari,
    connectPrinter,
    disconnectPrinter,
    printLabel
  } = usePrinter();

  // Default workspace mode - stored in localStorage
  const [defaultWorkspace, setDefaultWorkspace] = useState(() => {
    return localStorage.getItem('default-workspace-mode') || 'technician';
  });
  const [loggingOut, setLoggingOut] = useState(false);

  // Avatar color state
  const [avatarColor, setAvatarColor] = useState('#8B5CF6');
  const [loadingAvatarColor, setLoadingAvatarColor] = useState(false);
  const [savingAvatarColor, setSavingAvatarColor] = useState(false);
  const [avatarColorMessage, setAvatarColorMessage] = useState('');
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  const displayName = user?.displayName || user?.full_name || user?.name || user?.email || 'User';
  const email = user?.email || 'demo@example.com';
  const initials = useMemo(() => (displayName?.[0] || 'U').toUpperCase(), [displayName]);

  // Load user's current avatar color from profiles table (keyed by user.id)
  const loadUserAvatarColor = useCallback(async () => {
    if (!user?.id || !supabase) return;

    try {
      setLoadingAvatarColor(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_color')
        .eq('id', user.id)
        .single();

      if (error) {
        console.log('[SettingsPage] Profile not found, will create on first save:', error.message);
      } else if (data?.avatar_color) {
        setAvatarColor(data.avatar_color);
      }
    } catch (err) {
      console.error('[SettingsPage] Failed to load avatar color:', err);
    } finally {
      setLoadingAvatarColor(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadUserAvatarColor();
  }, [loadUserAvatarColor]);

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
  const handleDefaultWorkspaceChange = (workspace) => {
    setDefaultWorkspace(workspace);
    localStorage.setItem('default-workspace-mode', workspace);
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      setLoggingOut(true);
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
      setLoggingOut(false);
    }
  };

  const handleConnectPrinter = async () => {
    await connectPrinter();
  };

  const handleDisconnectPrinter = async () => {
    await disconnectPrinter();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 pb-24 space-y-4">
      <section className="rounded-2xl border p-4 flex items-center gap-4" style={sectionStyles.card}>
        <button
          onClick={() => setShowAvatarModal(true)}
          className="relative group"
          title="Click to change avatar color"
        >
          <div
            className="w-12 h-12 rounded-full text-white flex items-center justify-center text-lg font-semibold shadow-lg transition-transform group-hover:scale-105"
            style={{ backgroundColor: avatarColor }}
          >
            {initials}
          </div>
          <div className="absolute inset-0 rounded-full bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white text-xs font-medium">Edit</span>
          </div>
        </button>
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
                  <div className={`text-xs flex items-center gap-1.5 mt-1 ${connected
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-500 dark:text-gray-400'
                    }`}>
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
                <p className="text-green-600 dark:text-green-400 font-medium">
                  ✓ Ready to print from Wire Drops pages
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* AI Copilot Settings */}
      <AISettings />

      {/* Admin Section */}
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
                  <p className={`text-sm ${avatarColorMessage.includes('Failed') || avatarColorMessage.includes('not linked') ? 'text-red-500' : 'text-green-500'}`}>
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
