import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { usePrinter } from '../contexts/PrinterContext';
import { enhancedStyles } from '../styles/styleSystem';
import ThemeToggle from './ui/ThemeToggle';
import Button from './ui/Button';
import { Printer, CheckCircle, WifiOff, AlertCircle, Smartphone } from 'lucide-react';

const SettingsPage = () => {
  const { mode } = useTheme();
  const { user } = useAuth();
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
    disconnectPrinter
  } = usePrinter();

  const displayName = user?.full_name || user?.name || user?.email || 'User';
  const email = user?.email || 'demo@example.com';
  const initials = useMemo(() => (displayName?.[0] || 'U').toUpperCase(), [displayName]);

  const handleConnectPrinter = async () => {
    await connectPrinter();
  };

  const handleDisconnectPrinter = async () => {
    await disconnectPrinter();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 pb-24 space-y-4">
      <section className="rounded-2xl border p-4 flex items-center gap-4" style={sectionStyles.card}>
        <div className="w-12 h-12 rounded-full bg-violet-500 text-white flex items-center justify-center text-lg font-semibold">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{displayName}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{email}</p>
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
                  iPhone/iPad Users
                </h3>
                <p className="text-xs text-blue-800 dark:text-blue-200 mb-2">
                  Safari doesn't support Web Bluetooth. To print labels from your iPhone/iPad:
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
                      Download Bluefy →
                    </a>
                  </li>
                  <li>Open this web app in Bluefy browser</li>
                  <li>Return to this Settings page to connect your printer</li>
                </ol>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-3 italic">
                  Alternatively, use Chrome or Edge on a desktop computer
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
                  <div className={`text-xs flex items-center gap-1.5 mt-1 ${
                    connected
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
              <p>ℹ️ Labels will print at 1.5" × 0.75" with QR code</p>
              <p>💡 Requires Chrome or Edge browser with Bluetooth enabled</p>
              {connected && (
                <p className="text-green-600 dark:text-green-400 font-medium">
                  ✓ Ready to print from Wire Drops pages
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border p-4 space-y-4" style={sectionStyles.card}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Workspace Mode</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Jump to technician or project manager views.</p>
          </div>
        </div>
        <div className="flex items-center rounded-full border border-gray-200 dark:border-gray-700 bg-white/80 dark:bg-slate-900/70 shadow-inner p-1">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex-1 px-4 py-1.5 text-xs font-medium rounded-full transition text-gray-600 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-slate-800"
          >
            Technician
          </button>
          <button
            type="button"
            onClick={() => navigate('/pm-dashboard')}
            className="flex-1 px-4 py-1.5 text-xs font-medium rounded-full transition text-gray-600 dark:text-gray-300 hover:bg-violet-50 dark:hover:bg-slate-800"
          >
            Project Manager
          </button>
        </div>
      </section>
    </div>
  );
};

export default SettingsPage;
