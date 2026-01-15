/**
 * HomeAssistantSettings.js
 * UI component for configuring Home Assistant integration per project
 *
 * Features:
 * - Configure Nabu Casa URL and access token
 * - Test connection to HA instance
 * - View entity list grouped by category
 * - Execute test commands (toggle lights, play sounds)
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import homeAssistantService from '../services/homeAssistantService';
import {
  Home,
  Wifi,
  WifiOff,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  Save,
  ChevronRight,
  ChevronDown,
  Volume2,
  Lightbulb,
  Thermometer,
  Camera,
  Blinds,
  Radio,
  Server,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ExternalLink
} from 'lucide-react';

const withAlpha = (hex, alpha) => {
  if (!hex || hex[0] !== '#' || (hex.length !== 7 && hex.length !== 4)) return hex;
  const fullHex = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  const r = parseInt(fullHex.slice(1, 3), 16);
  const g = parseInt(fullHex.slice(3, 5), 16);
  const b = parseInt(fullHex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Category icons for entity display
const CATEGORY_ICONS = {
  audio: Volume2,
  lighting: Lightbulb,
  climate: Thermometer,
  shades: Blinds,
  security: Camera,
  sensors: Radio,
  network: Server,
  other: Home
};

function HomeAssistantSettings({ projectId }) {
  const navigate = useNavigate();
  const { theme, mode } = useTheme();
  const { user } = useAuth();
  const palette = theme.palette;

  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);

  // Form state
  const [haUrl, setHaUrl] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [instanceName, setInstanceName] = useState('');
  const [showToken, setShowToken] = useState(false);

  // Entity explorer state
  const [showEntities, setShowEntities] = useState(false);
  const [entities, setEntities] = useState([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');

  const styles = useMemo(() => {
    const cardBackground = mode === 'dark' ? '#27272A' : '#FFFFFF';
    const mutedBackground = mode === 'dark' ? '#18181B' : '#F9FAFB';
    const borderColor = mode === 'dark' ? '#3F3F46' : '#E5E7EB';
    const textPrimary = mode === 'dark' ? '#F9FAFB' : '#18181B';
    const textSecondary = mode === 'dark' ? '#A1A1AA' : '#4B5563';
    const subtleText = mode === 'dark' ? '#71717A' : '#6B7280';

    return {
      card: {
        backgroundColor: cardBackground,
        borderColor,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: '1rem',
        color: textPrimary
      },
      mutedCard: {
        backgroundColor: mutedBackground,
        borderColor,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: '0.75rem',
        color: textPrimary
      },
      input: {
        backgroundColor: mutedBackground,
        borderColor,
        color: textPrimary
      },
      successBadge: {
        backgroundColor: withAlpha(palette.success, 0.18),
        color: palette.success
      },
      errorBadge: {
        backgroundColor: withAlpha(palette.danger, 0.18),
        color: palette.danger
      },
      infoBadge: {
        backgroundColor: withAlpha(palette.info, 0.18),
        color: palette.info
      },
      textPrimary: { color: textPrimary },
      textSecondary: { color: textSecondary },
      subtleText: { color: subtleText }
    };
  }, [mode, palette]);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const data = await homeAssistantService.getForProject(projectId);
      if (data) {
        setConfig(data);
        setHaUrl(data.ha_url || '');
        setAccessToken(data.access_token || '');
        setInstanceName(data.instance_name || '');
      }
    } catch (err) {
      console.error('Error loading HA config:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      // Normalize URL - ensure https://, remove trailing slash
      let normalizedUrl = haUrl.trim();
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'https://' + normalizedUrl;
      }
      normalizedUrl = normalizedUrl.replace(/\/+$/, ''); // Remove trailing slashes

      // Validate URL format
      try {
        new URL(normalizedUrl);
      } catch {
        throw new Error('Invalid URL format. Please enter a valid Home Assistant URL (e.g., https://xxxxx.ui.nabu.casa)');
      }

      await homeAssistantService.upsert(projectId, {
        ha_url: normalizedUrl,
        access_token: accessToken.trim(),
        instance_name: instanceName.trim() || null
      }, user?.id);

      setHaUrl(normalizedUrl); // Update the field with normalized URL
      await loadConfig();
      setTestResult({ success: true, message: 'Configuration saved!' });
    } catch (err) {
      console.error('[HA Settings] Save error:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      const result = await homeAssistantService.testConnection(projectId);
      setTestResult(result);
      if (result.connected) {
        await loadConfig(); // Refresh to show updated device count
      }
    } catch (err) {
      console.error('[HA Settings] Test error:', err);
      setTestResult({ connected: false, error: err.message });
    } finally {
      setTesting(false);
    }
  };

  // Direct browser test - bypasses Vercel API for local network testing
  const handleDirectTest = async () => {
    setTesting(true);
    setTestResult(null);

    // Use form values directly (not from DB) for immediate testing
    const testUrl = haUrl.trim();
    const testToken = accessToken.trim();

    if (!testUrl || !testToken) {
      setTestResult({ connected: false, error: 'URL and Access Token are required' });
      setTesting(false);
      return;
    }

    try {
      // Normalize URL
      let normalizedUrl = testUrl;
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'http://' + normalizedUrl; // Default to http for local
      }
      normalizedUrl = normalizedUrl.replace(/\/+$/, '');

      console.log('[HA Direct Test] Testing:', normalizedUrl);

      // Call HA API directly from browser
      const response = await fetch(`${normalizedUrl}/api/`, {
        headers: {
          'Authorization': `Bearer ${testToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HA returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Get entity count
      let deviceCount = 0;
      try {
        const statesResponse = await fetch(`${normalizedUrl}/api/states`, {
          headers: {
            'Authorization': `Bearer ${testToken}`,
            'Content-Type': 'application/json'
          }
        });
        if (statesResponse.ok) {
          const states = await statesResponse.json();
          deviceCount = states.length;
        }
      } catch (e) {
        console.warn('[HA Direct Test] Could not get states:', e);
      }

      setTestResult({
        connected: true,
        ha_version: data.version,
        device_count: deviceCount,
        message: `Direct connection successful! HA ${data.version}, ${deviceCount} entities`
      });

    } catch (err) {
      console.error('[HA Direct Test] Error:', err);
      let errorMsg = err.message;

      // Provide helpful hints for common errors
      if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
        errorMsg = 'Network error - check URL is correct and HA is accessible from this device. CORS may block browser requests to local HA.';
      }

      setTestResult({ connected: false, error: errorMsg });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Remove Home Assistant configuration? This cannot be undone.')) return;

    try {
      await homeAssistantService.delete(projectId);
      setConfig(null);
      setHaUrl('');
      setAccessToken('');
      setInstanceName('');
      setTestResult(null);
      setEntities([]);
      setShowEntities(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const loadEntities = async () => {
    setLoadingEntities(true);
    try {
      const result = await homeAssistantService.getEntities(projectId);
      setEntities(result.entities || []);
    } catch (err) {
      console.error('Error loading entities:', err);
      setEntities([]);
    } finally {
      setLoadingEntities(false);
    }
  };

  const toggleEntities = () => {
    if (!showEntities && entities.length === 0) {
      loadEntities();
    }
    setShowEntities(!showEntities);
  };

  const filteredEntities = useMemo(() => {
    if (selectedCategory === 'all') return entities;
    return entities.filter(e => e.category === selectedCategory);
  }, [entities, selectedCategory]);

  const entityCategories = useMemo(() => {
    const cats = {};
    entities.forEach(e => {
      cats[e.category] = (cats[e.category] || 0) + 1;
    });
    return cats;
  }, [entities]);

  if (loading) {
    return (
      <div className="p-6 rounded-2xl border" style={styles.card}>
        <div className="flex items-center justify-center gap-3 py-8">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: palette.info }} />
          <span style={styles.textSecondary}>Loading Home Assistant configuration...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-2xl border" style={styles.card}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ backgroundColor: withAlpha(palette.info, 0.15) }}>
            <Home className="w-5 h-5" style={{ color: palette.info }} />
          </div>
          <div>
            <h3 className="text-lg font-semibold" style={styles.textPrimary}>Home Assistant</h3>
            <p className="text-sm" style={styles.textSecondary}>Remote device diagnostics via Nabu Casa</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {config && (
            <button
              onClick={() => navigate(`/projects/${projectId}/home-assistant`)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-violet-100 dark:hover:bg-violet-900/30"
              style={{ color: palette.primary }}
            >
              <ExternalLink className="w-4 h-4" />
              Open Test Page
            </button>
          )}
          {config && (
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
              style={config.last_error ? styles.errorBadge : (config.last_connected_at ? styles.successBadge : styles.infoBadge)}
            >
              {config.last_error ? (
                <>
                  <WifiOff className="w-4 h-4" />
                  Error
                </>
              ) : config.last_connected_at ? (
                <>
                  <Wifi className="w-4 h-4" />
                  Connected
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4" />
                  Not Tested
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Device Count & Last Connected */}
      {config?.last_connected_at && (
        <div className="mb-4 p-3 rounded-lg" style={styles.mutedCard}>
          <div className="flex items-center justify-between text-sm">
            <span style={styles.textSecondary}>
              <strong style={styles.textPrimary}>{config.device_count || 0}</strong> entities detected
            </span>
            <span style={styles.subtleText}>
              Last connected: {new Date(config.last_connected_at).toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 rounded-lg flex items-start gap-2" style={styles.errorBadge}>
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Test Result Display */}
      {testResult && (
        <div
          className="mb-4 p-3 rounded-lg flex items-start gap-2"
          style={testResult.connected || testResult.success ? styles.successBadge : styles.errorBadge}
        >
          {testResult.connected || testResult.success ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <span>
              {testResult.message || (testResult.connected
                ? `Connected! HA version ${testResult.ha_version}, ${testResult.device_count} entities`
                : `Connection failed: ${testResult.error}`
              )}
            </span>
            {/* Show Nabu Casa reconnect help for fetch failures */}
            {!testResult.connected && testResult.error?.includes('fetch failed') && (
              <div className="mt-2 text-sm">
                <p className="mb-1">This usually means Nabu Casa remote access is disconnected.</p>
                <a
                  href="https://account.nabucasa.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium underline"
                  style={{ color: palette.info }}
                >
                  <ExternalLink className="w-3 h-3" />
                  Open Nabu Casa Dashboard → Click "Connect"
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Configuration Form */}
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5" style={styles.textSecondary}>
            Instance Name (optional)
          </label>
          <input
            type="text"
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value)}
            placeholder="e.g., Smith Residence HA"
            className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            style={styles.input}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={styles.textSecondary}>
            Home Assistant URL *
          </label>
          <input
            type="url"
            value={haUrl}
            onChange={(e) => setHaUrl(e.target.value)}
            placeholder="https://xxxxx.ui.nabu.casa"
            required
            className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            style={styles.input}
          />
          <p className="mt-1 text-xs" style={styles.subtleText}>
            Nabu Casa URL (recommended) or local URL if accessible
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5" style={styles.textSecondary}>
            Long-Lived Access Token *
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
              required
              className="w-full px-3 py-2 pr-10 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              style={styles.input}
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              {showToken ? (
                <EyeOff className="w-4 h-4" style={styles.textSecondary} />
              ) : (
                <Eye className="w-4 h-4" style={styles.textSecondary} />
              )}
            </button>
          </div>
          <p className="mt-1 text-xs" style={styles.subtleText}>
            Create in HA: Profile → Long-Lived Access Tokens → Create Token
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 pt-4">
          <button
            type="submit"
            disabled={saving || !haUrl || !accessToken}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
            style={{ backgroundColor: palette.primary }}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Saving...' : 'Save'}
          </button>

          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !config}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium border transition-colors disabled:opacity-50"
            style={{
              borderColor: styles.input.borderColor,
              color: styles.textPrimary.color,
              backgroundColor: styles.mutedCard.backgroundColor
            }}
          >
            {testing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {testing ? 'Testing...' : 'Test Connection'}
          </button>

          <button
            type="button"
            onClick={handleDirectTest}
            disabled={testing || !haUrl || !accessToken}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium border transition-colors disabled:opacity-50"
            style={{
              borderColor: palette.warning,
              color: palette.warning,
              backgroundColor: withAlpha(palette.warning, 0.1)
            }}
            title="Test directly from browser (for local network testing)"
          >
            {testing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wifi className="w-4 h-4" />
            )}
            Direct Test (Local)
          </button>

          {config && (
            <button
              type="button"
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
              style={{ color: palette.danger }}
            >
              <Trash2 className="w-4 h-4" />
              Remove
            </button>
          )}
        </div>
      </form>

      {/* Entity Explorer Section */}
      {config?.last_connected_at && (
        <div className="mt-6 pt-6 border-t" style={{ borderColor: styles.card.borderColor }}>
          <button
            onClick={toggleEntities}
            className="w-full flex items-center justify-between p-3 rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5" style={{ color: palette.info }} />
              <span className="font-medium" style={styles.textPrimary}>
                Browse Entities
              </span>
              <span className="text-sm px-2 py-0.5 rounded-full" style={styles.infoBadge}>
                {config.device_count || 0}
              </span>
            </div>
            {showEntities ? (
              <ChevronDown className="w-5 h-5" style={styles.textSecondary} />
            ) : (
              <ChevronRight className="w-5 h-5" style={styles.textSecondary} />
            )}
          </button>

          {showEntities && (
            <div className="mt-4 space-y-4">
              {/* Category Filter */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                  style={selectedCategory === 'all' ? styles.successBadge : styles.mutedCard}
                >
                  All ({entities.length})
                </button>
                {Object.entries(entityCategories).map(([cat, count]) => {
                  const Icon = CATEGORY_ICONS[cat] || Home;
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                      style={selectedCategory === cat ? styles.successBadge : styles.mutedCard}
                    >
                      <Icon className="w-4 h-4" />
                      {cat} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Entity List */}
              {loadingEntities ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: palette.info }} />
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredEntities.map(entity => {
                    const Icon = CATEGORY_ICONS[entity.category] || Home;
                    return (
                      <div
                        key={entity.entity_id}
                        className="flex items-center justify-between p-3 rounded-lg"
                        style={styles.mutedCard}
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="w-5 h-5" style={{ color: entity.is_online ? palette.success : palette.danger }} />
                          <div>
                            <div className="font-medium" style={styles.textPrimary}>
                              {entity.name}
                            </div>
                            <div className="text-xs" style={styles.subtleText}>
                              {entity.entity_id}
                              {entity.attributes.ip_address && ` • ${entity.attributes.ip_address}`}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className="px-2 py-1 rounded text-xs font-medium"
                            style={entity.is_online ? styles.successBadge : styles.errorBadge}
                          >
                            {entity.state}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {filteredEntities.length === 0 && (
                    <div className="text-center py-8" style={styles.textSecondary}>
                      No entities found in this category
                    </div>
                  )}
                </div>
              )}

              {/* Refresh Button */}
              <button
                onClick={loadEntities}
                disabled={loadingEntities}
                className="flex items-center gap-2 text-sm font-medium transition-colors"
                style={{ color: palette.info }}
              >
                <RefreshCw className={`w-4 h-4 ${loadingEntities ? 'animate-spin' : ''}`} />
                Refresh Entities
              </button>
            </div>
          )}
        </div>
      )}

      {/* Help Section */}
      <div className="mt-6 pt-4 border-t space-y-3" style={{ borderColor: styles.card.borderColor }}>
        <a
          href="https://www.nabucasa.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm hover:underline"
          style={{ color: palette.info }}
        >
          <ExternalLink className="w-4 h-4" />
          Learn about Nabu Casa (Home Assistant Cloud)
        </a>

        {/* Local Testing Help */}
        <div className="p-3 rounded-lg text-sm" style={styles.mutedCard}>
          <div className="font-medium mb-1" style={styles.textPrimary}>
            🔧 Local Testing Note
          </div>
          <p style={styles.textSecondary}>
            "Direct Test (Local)" tests from your browser directly - useful for local IPs when Vercel can't reach them.
            If you get CORS errors, add this to your HA <code className="px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700">configuration.yaml</code>:
          </p>
          <pre className="mt-2 p-2 rounded text-xs overflow-x-auto bg-zinc-200 dark:bg-zinc-800" style={styles.textPrimary}>
{`http:
  cors_allowed_origins:
    - http://localhost:3000
    - https://unicorn-one.vercel.app`}
          </pre>
        </div>
      </div>
    </div>
  );
}

export default HomeAssistantSettings;
