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
  ExternalLink,
  Upload,
  HardDrive,
  FileArchive,
  FolderOpen,
  Clock,
  Network,
  Cable,
  Monitor,
  Signal
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

  // Backup management state
  const [backups, setBackups] = useState([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [showBackups, setShowBackups] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [haFolderUrl, setHaFolderUrl] = useState(null);

  // Network clients state
  const [networkClients, setNetworkClients] = useState([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [showClients, setShowClients] = useState(false);
  const [clientsError, setClientsError] = useState(null);
  const [clientFilter, setClientFilter] = useState('all'); // 'all', 'wired', 'wireless'

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

      // Ensure the Home Assistant folder exists in SharePoint Knowledge library
      try {
        const folderResponse = await fetch('/api/ha/ensure-knowledge-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        if (folderResponse.ok) {
          const folderResult = await folderResponse.json();
          console.log('[HA Settings] Knowledge folder:', folderResult.created ? 'created' : 'already exists');
        }
      } catch (folderErr) {
        // Don't fail the save if folder creation fails - just log it
        console.warn('[HA Settings] Could not ensure Knowledge folder:', folderErr.message);
      }

      // Ensure the Home Assistant folder exists in the client's project SharePoint folder
      try {
        const clientFolderResponse = await fetch('/api/ha/ensure-client-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: projectId })
        });
        if (clientFolderResponse.ok) {
          const clientFolderResult = await clientFolderResponse.json();
          console.log('[HA Settings] Client HA folder:', clientFolderResult.created ? 'created' : 'already exists');
        }
      } catch (clientFolderErr) {
        // Don't fail the save if folder creation fails - just log it
        console.warn('[HA Settings] Could not ensure client HA folder:', clientFolderErr.message);
      }

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

  // Backup management functions
  const loadBackups = useCallback(async () => {
    setLoadingBackups(true);
    try {
      const response = await fetch(`/api/ha/list-backups?project_id=${projectId}`);
      if (response.ok) {
        const result = await response.json();
        setBackups(result.backups || []);
        setHaFolderUrl(result.haFolderUrl || null);
      }
    } catch (err) {
      console.error('Error loading backups:', err);
      setBackups([]);
    } finally {
      setLoadingBackups(false);
    }
  }, [projectId]);

  const toggleBackups = () => {
    if (!showBackups && backups.length === 0) {
      loadBackups();
    }
    setShowBackups(!showBackups);
  };

  // Network clients management functions
  const loadNetworkClients = useCallback(async () => {
    setLoadingClients(true);
    setClientsError(null);
    try {
      const response = await fetch(`/api/ha/network-clients?project_id=${projectId}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Failed to load clients: ${response.status}`);
      }

      setNetworkClients(result.clients || []);
    } catch (err) {
      console.error('Error loading network clients:', err);
      setClientsError(err.message);
      setNetworkClients([]);
    } finally {
      setLoadingClients(false);
    }
  }, [projectId]);

  const toggleClients = () => {
    if (!showClients && networkClients.length === 0) {
      loadNetworkClients();
    }
    setShowClients(!showClients);
  };

  // Filter network clients based on selected filter
  const filteredClients = useMemo(() => {
    if (clientFilter === 'all') return networkClients;
    if (clientFilter === 'wired') return networkClients.filter(c => c.is_wired);
    if (clientFilter === 'wireless') return networkClients.filter(c => c.is_wireless);
    return networkClients;
  }, [networkClients, clientFilter]);

  const handleBackupUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validExtensions = ['.tar', '.tar.gz', '.tgz', '.zip'];
    const isValidType = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    if (!isValidType) {
      setError('Invalid file type. Please upload a .tar, .tar.gz, .tgz, or .zip file.');
      return;
    }

    setUploading(true);
    setUploadProgress('Uploading...');
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('project_id', projectId);

      const response = await fetch('/api/ha/upload-backup', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Upload failed: ${response.status}`);
      }

      const result = await response.json();
      setUploadProgress(null);
      setTestResult({ success: true, message: result.message });

      // Refresh backup list
      await loadBackups();
    } catch (err) {
      console.error('Backup upload error:', err);
      setError(err.message);
      setUploadProgress(null);
    } finally {
      setUploading(false);
      // Reset file input
      event.target.value = '';
    }
  };

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

          {/* Test connection via server API (works with Nabu Casa URLs) */}
          {config && (
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: '#10B981' }}
              title="Test connection via server"
            >
              {testing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wifi className="w-4 h-4" />
              )}
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
          )}

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

      {/* Network Clients Section */}
      {config?.last_connected_at && (
        <div className="mt-6 pt-6 border-t" style={{ borderColor: styles.card.borderColor }}>
          <button
            onClick={toggleClients}
            className="w-full flex items-center justify-between p-3 rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <div className="flex items-center gap-2">
              <Network className="w-5 h-5" style={{ color: palette.success }} />
              <span className="font-medium" style={styles.textPrimary}>
                Network Clients
              </span>
              {networkClients.length > 0 && (
                <span className="text-sm px-2 py-0.5 rounded-full" style={styles.successBadge}>
                  {networkClients.length} client{networkClients.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {showClients ? (
              <ChevronDown className="w-5 h-5" style={styles.textSecondary} />
            ) : (
              <ChevronRight className="w-5 h-5" style={styles.textSecondary} />
            )}
          </button>

          {showClients && (
            <div className="mt-4 space-y-4">
              {/* Client Error */}
              {clientsError && (
                <div className="p-3 rounded-lg flex items-start gap-2" style={styles.errorBadge}>
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <span>{clientsError}</span>
                    {clientsError.includes('not found') && (
                      <p className="mt-1 text-sm">
                        Make sure the Unicorn UniFi collector integration is configured in Home Assistant.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Filter Buttons */}
              {networkClients.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setClientFilter('all')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                    style={clientFilter === 'all' ? styles.successBadge : styles.mutedCard}
                  >
                    All ({networkClients.length})
                  </button>
                  <button
                    onClick={() => setClientFilter('wired')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                    style={clientFilter === 'wired' ? styles.successBadge : styles.mutedCard}
                  >
                    <Cable className="w-4 h-4" />
                    Wired ({networkClients.filter(c => c.is_wired).length})
                  </button>
                  <button
                    onClick={() => setClientFilter('wireless')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                    style={clientFilter === 'wireless' ? styles.successBadge : styles.mutedCard}
                  >
                    <Wifi className="w-4 h-4" />
                    Wireless ({networkClients.filter(c => c.is_wireless).length})
                  </button>
                </div>
              )}

              {/* Client List */}
              {loadingClients ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: palette.info }} />
                </div>
              ) : filteredClients.length === 0 && !clientsError ? (
                <div className="text-center py-6" style={styles.textSecondary}>
                  <Network className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p>No network clients found</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {filteredClients.map((client, idx) => (
                    <div
                      key={client.mac_address || idx}
                      className="p-3 rounded-lg"
                      style={styles.mutedCard}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div
                            className="p-2 rounded-lg flex-shrink-0"
                            style={{ backgroundColor: withAlpha(client.is_wired ? palette.info : palette.warning, 0.15) }}
                          >
                            {client.is_wired ? (
                              <Cable className="w-4 h-4" style={{ color: palette.info }} />
                            ) : (
                              <Wifi className="w-4 h-4" style={{ color: palette.warning }} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate" style={styles.textPrimary}>
                              {client.name}
                            </div>
                            <div className="text-xs space-y-0.5" style={styles.subtleText}>
                              {/* MAC and IP */}
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                {client.mac_address && (
                                  <span className="font-mono">{client.mac_address}</span>
                                )}
                                {client.ip_address && (
                                  <span className="font-mono">{client.ip_address}</span>
                                )}
                              </div>
                              {/* Connection details */}
                              {client.is_wired ? (
                                // Wired: show switch and port
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                                  {client.switch_name && (
                                    <span className="flex items-center gap-1">
                                      <Monitor className="w-3 h-3" />
                                      {client.switch_name}
                                    </span>
                                  )}
                                  {client.switch_port && (
                                    <span className="px-1.5 py-0.5 rounded text-xs font-medium" style={styles.infoBadge}>
                                      Port {client.switch_port}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                // Wireless: show SSID, AP, signal
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                                  {client.ssid && (
                                    <span className="flex items-center gap-1">
                                      <Wifi className="w-3 h-3" />
                                      {client.ssid}
                                    </span>
                                  )}
                                  {client.ap_name && (
                                    <span className="flex items-center gap-1">
                                      <Server className="w-3 h-3" />
                                      {client.ap_name}
                                    </span>
                                  )}
                                  {client.wifi_signal && (
                                    <span className="flex items-center gap-1">
                                      <Signal className="w-3 h-3" />
                                      {client.wifi_signal} dBm
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        {/* Uptime badge */}
                        {client.uptime_formatted && (
                          <div
                            className="px-2 py-1 rounded text-xs font-medium whitespace-nowrap"
                            style={styles.infoBadge}
                          >
                            {client.uptime_formatted}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Refresh Button */}
              <button
                onClick={loadNetworkClients}
                disabled={loadingClients}
                className="flex items-center gap-2 text-sm font-medium transition-colors"
                style={{ color: palette.info }}
              >
                <RefreshCw className={`w-4 h-4 ${loadingClients ? 'animate-spin' : ''}`} />
                Refresh Clients
              </button>
            </div>
          )}
        </div>
      )}

      {/* Backup Management Section */}
      {config && (
        <div className="mt-6 pt-6 border-t" style={{ borderColor: styles.card.borderColor }}>
          <button
            onClick={toggleBackups}
            className="w-full flex items-center justify-between p-3 rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5" style={{ color: palette.warning }} />
              <span className="font-medium" style={styles.textPrimary}>
                Backup Management
              </span>
              {backups.length > 0 && (
                <span className="text-sm px-2 py-0.5 rounded-full" style={styles.infoBadge}>
                  {backups.length} backup{backups.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {showBackups ? (
              <ChevronDown className="w-5 h-5" style={styles.textSecondary} />
            ) : (
              <ChevronRight className="w-5 h-5" style={styles.textSecondary} />
            )}
          </button>

          {showBackups && (
            <div className="mt-4 space-y-4">
              {/* Upload Backup */}
              <div className="p-4 rounded-xl" style={styles.mutedCard}>
                <div className="flex items-center gap-2 mb-3">
                  <Upload className="w-4 h-4" style={{ color: palette.primary }} />
                  <span className="font-medium" style={styles.textPrimary}>Upload Backup</span>
                </div>
                <p className="text-sm mb-3" style={styles.textSecondary}>
                  Upload Home Assistant backup files (.tar, .tar.gz, .zip) to SharePoint for safekeeping.
                </p>
                <div className="flex items-center gap-3">
                  <label
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white cursor-pointer transition-colors"
                    style={{ backgroundColor: uploading ? '#6B7280' : palette.primary }}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {uploadProgress || 'Uploading...'}
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        Choose File
                      </>
                    )}
                    <input
                      type="file"
                      accept=".tar,.tar.gz,.tgz,.zip"
                      onChange={handleBackupUpload}
                      disabled={uploading}
                      className="hidden"
                    />
                  </label>
                  {haFolderUrl && (
                    <a
                      href={haFolderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700"
                      style={{ color: palette.info }}
                    >
                      <FolderOpen className="w-4 h-4" />
                      Open Folder
                    </a>
                  )}
                </div>
              </div>

              {/* Backup List */}
              {loadingBackups ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: palette.info }} />
                </div>
              ) : backups.length === 0 ? (
                <div className="text-center py-6" style={styles.textSecondary}>
                  <FileArchive className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p>No backups uploaded yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {backups.map(backup => (
                    <a
                      key={backup.id}
                      href={backup.webUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      style={styles.mutedCard}
                    >
                      <div className="flex items-center gap-3">
                        <FileArchive className="w-5 h-5" style={{ color: palette.warning }} />
                        <div>
                          <div className="font-medium text-sm" style={styles.textPrimary}>
                            {backup.name}
                          </div>
                          <div className="text-xs flex items-center gap-2" style={styles.subtleText}>
                            <span>{backup.sizeFormatted}</span>
                            <span>•</span>
                            <Clock className="w-3 h-3" />
                            <span>{new Date(backup.modifiedAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4" style={styles.subtleText} />
                    </a>
                  ))}
                </div>
              )}

              {/* Refresh Button */}
              <button
                onClick={loadBackups}
                disabled={loadingBackups}
                className="flex items-center gap-2 text-sm font-medium transition-colors"
                style={{ color: palette.info }}
              >
                <RefreshCw className={`w-4 h-4 ${loadingBackups ? 'animate-spin' : ''}`} />
                Refresh Backups
              </button>
            </div>
          )}
        </div>
      )}

      {/* Help Section */}
      <div className="mt-6 pt-4 border-t space-y-3" style={{ borderColor: styles.card.borderColor }}>
        {/* Setup Instructions */}
        <div className="p-4 rounded-xl space-y-3" style={styles.mutedCard}>
          <div className="font-medium" style={styles.textPrimary}>
            Setup Instructions
          </div>
          <div className="space-y-2">
            <a
              href="https://isehome.sharepoint.com/sites/Unicorn/Knowledge/Home%20Assistant"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm hover:underline"
              style={{ color: palette.info }}
            >
              <ExternalLink className="w-4 h-4" />
              Home Assistant Setup Guide (Knowledge Base)
            </a>
            <a
              href="https://www.nabucasa.com/config/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm hover:underline"
              style={{ color: palette.info }}
            >
              <ExternalLink className="w-4 h-4" />
              How to Add Account to Nabu Casa
            </a>
            <a
              href="https://www.home-assistant.io/docs/authentication/#your-account-profile"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm hover:underline"
              style={{ color: palette.info }}
            >
              <ExternalLink className="w-4 h-4" />
              How to Create Long-Lived Access Token
            </a>
          </div>
        </div>
      </div>

      {/* Home Assistant Portal Link */}
      {config?.ha_url && (
        <div className="mt-6 pt-4 border-t" style={{ borderColor: styles.card.borderColor }}>
          <a
            href={config.ha_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <div className="p-2 rounded-lg" style={{ backgroundColor: withAlpha(palette.primary, 0.15) }}>
              <Home className="w-5 h-5" style={{ color: palette.primary }} />
            </div>
            <div className="flex-1">
              <div className="font-medium" style={styles.textPrimary}>
                Open Home Assistant
              </div>
              <div className="text-sm" style={styles.subtleText}>
                {config.ha_url}
              </div>
            </div>
            <ExternalLink className="w-5 h-5" style={styles.textSecondary} />
          </a>
        </div>
      )}
    </div>
  );
}

export default HomeAssistantSettings;
