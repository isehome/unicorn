/**
 * HomeAssistantPage.js
 * Test UI page for exploring Home Assistant data and testing commands
 *
 * Features:
 * - Temporary credentials form for quick local testing (no DB required)
 * - View all entities grouped by domain/category
 * - Real-time state updates
 * - Test commands (toggle lights, play sounds, etc.)
 * - Device diagnostics for troubleshooting
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import homeAssistantService from '../services/homeAssistantService';
import { supabase } from '../lib/supabase';
import {
  Home,
  Wifi,
  WifiOff,
  RefreshCw,
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
  Search,
  Play,
  Square,
  Power,
  Activity,
  Globe,
  Cpu,
  Clock,
  Zap,
  Eye,
  EyeOff,
  Settings
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

// Category icons and colors
const CATEGORY_CONFIG = {
  audio: { icon: Volume2, color: '#8B5CF6', label: 'Audio' },
  lighting: { icon: Lightbulb, color: '#F59E0B', label: 'Lighting' },
  climate: { icon: Thermometer, color: '#3B82F6', label: 'Climate' },
  shades: { icon: Blinds, color: '#10B981', label: 'Shades' },
  security: { icon: Camera, color: '#EF4444', label: 'Security' },
  sensors: { icon: Radio, color: '#06B6D4', label: 'Sensors' },
  network: { icon: Globe, color: '#6366F1', label: 'Network' },
  other: { icon: Cpu, color: '#71717A', label: 'Other' }
};

// Quick actions by domain
const DOMAIN_ACTIONS = {
  media_player: [
    { service: 'media_play', label: 'Play', icon: Play },
    { service: 'media_pause', label: 'Pause', icon: Square },
    { service: 'media_stop', label: 'Stop', icon: Square }
  ],
  light: [
    { service: 'turn_on', label: 'On', icon: Power },
    { service: 'turn_off', label: 'Off', icon: Power },
    { service: 'toggle', label: 'Toggle', icon: Zap }
  ],
  switch: [
    { service: 'turn_on', label: 'On', icon: Power },
    { service: 'turn_off', label: 'Off', icon: Power },
    { service: 'toggle', label: 'Toggle', icon: Zap }
  ],
  cover: [
    { service: 'open_cover', label: 'Open', icon: ChevronDown },
    { service: 'close_cover', label: 'Close', icon: ChevronRight },
    { service: 'stop_cover', label: 'Stop', icon: Square }
  ]
};

// Categorize entities by domain
const categorizeEntity = (entityId) => {
  const domain = entityId.split('.')[0];
  const domainCategoryMap = {
    media_player: 'audio',
    light: 'lighting',
    switch: 'lighting',
    climate: 'climate',
    cover: 'shades',
    camera: 'security',
    sensor: 'sensors',
    binary_sensor: 'sensors',
    device_tracker: 'network',
    person: 'other',
    automation: 'other',
    script: 'other',
    scene: 'other'
  };
  return domainCategoryMap[domain] || 'other';
};

function HomeAssistantPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { theme, mode } = useTheme();
  const palette = theme.palette;

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);

  // Temporary credentials (for direct testing)
  const [tempUrl, setTempUrl] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  // Connection state
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [entities, setEntities] = useState([]);
  const [loadingEntities, setLoadingEntities] = useState(false);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [expandedEntities, setExpandedEntities] = useState({});
  const [executingCommand, setExecutingCommand] = useState(null);
  const [commandResult, setCommandResult] = useState(null);

  const styles = useMemo(() => {
    const cardBackground = mode === 'dark' ? '#18181B' : '#FFFFFF';
    const mutedBackground = mode === 'dark' ? '#27272A' : '#F4F4F5';
    const borderColor = mode === 'dark' ? '#3F3F46' : '#E4E4E7';
    const textPrimary = mode === 'dark' ? '#FAFAFA' : '#18181B';
    const textSecondary = mode === 'dark' ? '#A1A1AA' : '#71717A';
    const subtleText = mode === 'dark' ? '#71717A' : '#A1A1AA';

    return {
      page: {
        backgroundColor: mode === 'dark' ? '#09090B' : '#FAFAFA',
        minHeight: '100vh'
      },
      card: {
        backgroundColor: cardBackground,
        borderColor,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: '1rem'
      },
      mutedCard: {
        backgroundColor: mutedBackground,
        borderColor,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: '0.75rem'
      },
      input: {
        backgroundColor: mutedBackground,
        borderColor,
        color: textPrimary
      },
      successBadge: {
        backgroundColor: withAlpha('#94AF32', 0.18),
        color: '#94AF32'
      },
      errorBadge: {
        backgroundColor: withAlpha(palette.danger, 0.18),
        color: palette.danger
      },
      infoBadge: {
        backgroundColor: withAlpha(palette.info, 0.18),
        color: palette.info
      },
      warningBadge: {
        backgroundColor: withAlpha(palette.warning, 0.18),
        color: palette.warning
      },
      textPrimary: { color: textPrimary },
      textSecondary: { color: textSecondary },
      subtleText: { color: subtleText }
    };
  }, [mode, palette]);

  // Load project info only
  useEffect(() => {
    const loadProject = async () => {
      try {
        setLoading(true);
        const { data: proj } = await supabase
          .from('projects')
          .select('id, name, address')
          .eq('id', projectId)
          .single();
        setProject(proj);
      } catch (err) {
        console.error('Error loading project:', err);
      } finally {
        setLoading(false);
      }
    };
    loadProject();
  }, [projectId]);

  // Direct connection test (browser to HA)
  const handleConnect = async () => {
    if (!tempUrl || !tempToken) {
      setConnectionStatus({ connected: false, error: 'URL and Token are required' });
      return;
    }

    setConnecting(true);
    setConnectionStatus(null);
    setEntities([]);

    try {
      // Normalize URL
      let normalizedUrl = tempUrl.trim();
      if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
        normalizedUrl = 'http://' + normalizedUrl;
      }
      normalizedUrl = normalizedUrl.replace(/\/+$/, '');

      console.log('[HA Page] Testing connection to:', normalizedUrl);

      // Test connection
      const response = await fetch(`${normalizedUrl}/api/`, {
        headers: {
          'Authorization': `Bearer ${tempToken.trim()}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        let errorDetail = `${response.status}: ${response.statusText}`;
        if (response.status === 401) {
          errorDetail = '401 Unauthorized - Check your access token. Go to HA → Profile → Long-Lived Access Tokens → Create new token.';
        } else if (response.status === 403) {
          errorDetail = '403 Forbidden - Token may lack permissions or CORS issue.';
        }
        throw new Error(errorDetail);
      }

      const data = await response.json();

      // Get entities
      const statesResponse = await fetch(`${normalizedUrl}/api/states`, {
        headers: {
          'Authorization': `Bearer ${tempToken.trim()}`,
          'Content-Type': 'application/json'
        }
      });

      let entityList = [];
      if (statesResponse.ok) {
        const states = await statesResponse.json();
        entityList = states.map(e => ({
          entity_id: e.entity_id,
          name: e.attributes.friendly_name || e.entity_id.split('.')[1].replace(/_/g, ' '),
          state: e.state,
          domain: e.entity_id.split('.')[0],
          category: categorizeEntity(e.entity_id),
          is_online: !['unavailable', 'unknown', 'off'].includes(e.state.toLowerCase()),
          attributes: e.attributes,
          last_changed: e.last_changed
        }));
      }

      setConnectionStatus({
        connected: true,
        ha_version: data.version,
        device_count: entityList.length,
        url: normalizedUrl
      });
      setEntities(entityList);

    } catch (err) {
      console.error('[HA Page] Connection error:', err);
      let errorMsg = err.message;

      if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
        errorMsg = 'Network error - CORS may be blocking. Add your origin to HA cors_allowed_origins.';
      }

      setConnectionStatus({ connected: false, error: errorMsg });
    } finally {
      setConnecting(false);
    }
  };

  // Refresh entities
  const loadEntities = async () => {
    if (!connectionStatus?.connected || !connectionStatus?.url) return;

    setLoadingEntities(true);
    try {
      const response = await fetch(`${connectionStatus.url}/api/states`, {
        headers: {
          'Authorization': `Bearer ${tempToken.trim()}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const states = await response.json();
        const entityList = states.map(e => ({
          entity_id: e.entity_id,
          name: e.attributes.friendly_name || e.entity_id.split('.')[1].replace(/_/g, ' '),
          state: e.state,
          domain: e.entity_id.split('.')[0],
          category: categorizeEntity(e.entity_id),
          is_online: !['unavailable', 'unknown', 'off'].includes(e.state.toLowerCase()),
          attributes: e.attributes,
          last_changed: e.last_changed
        }));
        setEntities(entityList);
      }
    } catch (err) {
      console.error('Error refreshing entities:', err);
    } finally {
      setLoadingEntities(false);
    }
  };

  // Execute command
  const executeCommand = async (entityId, domain, service) => {
    if (!connectionStatus?.connected || !connectionStatus?.url) return;

    const commandKey = `${entityId}-${service}`;
    setExecutingCommand(commandKey);
    setCommandResult(null);

    try {
      const response = await fetch(`${connectionStatus.url}/api/services/${domain}/${service}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tempToken.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ entity_id: entityId })
      });

      if (!response.ok) {
        throw new Error(`Command failed: ${response.status}`);
      }

      setCommandResult({ success: true, message: `${service} executed successfully`, entityId });

      // Refresh entities after command
      setTimeout(loadEntities, 1000);
    } catch (err) {
      setCommandResult({ success: false, message: err.message, entityId });
    } finally {
      setExecutingCommand(null);
    }
  };

  const toggleEntityExpanded = (entityId) => {
    setExpandedEntities(prev => ({
      ...prev,
      [entityId]: !prev[entityId]
    }));
  };

  // Filter entities
  const filteredEntities = useMemo(() => {
    let filtered = entities;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(e =>
        e.name.toLowerCase().includes(query) ||
        e.entity_id.toLowerCase().includes(query) ||
        e.attributes.ip?.toLowerCase().includes(query)
      );
    }

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(e => e.category === selectedCategory);
    }

    return filtered;
  }, [entities, searchQuery, selectedCategory]);

  const entityCategories = useMemo(() => {
    const cats = { all: entities.length };
    entities.forEach(e => {
      cats[e.category] = (cats[e.category] || 0) + 1;
    });
    return cats;
  }, [entities]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={styles.page}>
        <div className="flex items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: palette.info }} />
          <span style={styles.textSecondary}>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24" style={styles.page}>
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <p className="text-sm mb-1" style={styles.textSecondary}>
            {project?.name || 'Project'}
          </p>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl" style={{ backgroundColor: withAlpha(palette.info, 0.15) }}>
              <Home className="w-6 h-6" style={{ color: palette.info }} />
            </div>
            <h1 className="text-xl font-bold" style={styles.textPrimary}>
              Home Assistant Test
            </h1>
          </div>
        </div>

        {/* Connection Form */}
        <div className="p-6 rounded-2xl border mb-6" style={styles.card}>
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5" style={{ color: palette.warning }} />
            <h2 className="font-semibold" style={styles.textPrimary}>
              Quick Connect (Local Testing)
            </h2>
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={styles.warningBadge}
            >
              Temporary
            </span>
          </div>

          <p className="text-sm mb-4" style={styles.textSecondary}>
            Enter your Home Assistant credentials to test directly from your browser.
            These are NOT saved to the database.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1.5" style={styles.textSecondary}>
                Home Assistant URL
              </label>
              <input
                type="text"
                value={tempUrl}
                onChange={(e) => setTempUrl(e.target.value)}
                placeholder="http://192.168.1.23:8123"
                className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                style={styles.input}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={styles.textSecondary}>
                Access Token
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={tempToken}
                  onChange={(e) => setTempToken(e.target.value)}
                  placeholder="Long-lived access token"
                  className="w-full px-3 py-2 pr-10 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  style={styles.input}
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-700"
                >
                  {showToken ? (
                    <EyeOff className="w-4 h-4" style={styles.textSecondary} />
                  ) : (
                    <Eye className="w-4 h-4" style={styles.textSecondary} />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-4">
            <button
              onClick={handleConnect}
              disabled={connecting || !tempUrl || !tempToken}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: palette.primary }}
            >
              {connecting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wifi className="w-4 h-4" />
              )}
              {connecting ? 'Connecting...' : 'Connect'}
            </button>

            {connectionStatus && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
                style={connectionStatus.connected ? styles.successBadge : styles.errorBadge}
              >
                {connectionStatus.connected ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Connected - HA {connectionStatus.ha_version}
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    {connectionStatus.error}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Help Section */}
          <div className="mt-4 space-y-3">
            {/* Token Help */}
            <div className="p-3 rounded-lg text-sm" style={styles.mutedCard}>
              <p style={styles.textSecondary}>
                <strong>401 Unauthorized?</strong> Create a new long-lived access token:
              </p>
              <ol className="mt-2 ml-4 list-decimal text-xs space-y-1" style={styles.textSecondary}>
                <li>Open Home Assistant in your browser</li>
                <li>Click your profile (bottom left)</li>
                <li>Scroll to <strong>Long-Lived Access Tokens</strong></li>
                <li>Click <strong>Create Token</strong>, name it "Unicorn"</li>
                <li>Copy the entire token (starts with "ey...")</li>
              </ol>
            </div>

            {/* CORS Help */}
            <div className="p-3 rounded-lg text-sm" style={styles.mutedCard}>
              <p style={styles.textSecondary}>
                <strong>CORS Error?</strong> Add this to your HA{' '}
                <code className="px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700">configuration.yaml</code>:
              </p>
              <pre className="mt-2 p-2 rounded text-xs overflow-x-auto bg-zinc-200 dark:bg-zinc-800" style={styles.textPrimary}>
{`http:
  cors_allowed_origins:
    - http://localhost:3000
    - https://unicorn-one.vercel.app`}
              </pre>
              <p className="mt-2 text-xs" style={styles.subtleText}>
                Then restart Home Assistant (Developer Tools → Restart)
              </p>
            </div>
          </div>
        </div>

        {/* Connection Info Card */}
        {connectionStatus?.connected && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="p-4 rounded-xl" style={styles.card}>
              <div className="flex items-center gap-2 mb-1" style={styles.subtleText}>
                <Server className="w-4 h-4" />
                <span className="text-xs">Version</span>
              </div>
              <p className="font-semibold" style={styles.textPrimary}>
                {connectionStatus.ha_version || 'Unknown'}
              </p>
            </div>
            <div className="p-4 rounded-xl" style={styles.card}>
              <div className="flex items-center gap-2 mb-1" style={styles.subtleText}>
                <Activity className="w-4 h-4" />
                <span className="text-xs">Entities</span>
              </div>
              <p className="font-semibold" style={styles.textPrimary}>
                {connectionStatus.device_count || 0}
              </p>
            </div>
            <div className="p-4 rounded-xl" style={styles.card}>
              <div className="flex items-center gap-2 mb-1" style={styles.subtleText}>
                <Globe className="w-4 h-4" />
                <span className="text-xs">URL</span>
              </div>
              <p className="font-semibold text-sm truncate" style={styles.textPrimary}>
                {connectionStatus.url?.replace(/^https?:\/\//, '')}
              </p>
            </div>
            <div className="p-4 rounded-xl" style={styles.card}>
              <div className="flex items-center gap-2 mb-1" style={styles.subtleText}>
                <Clock className="w-4 h-4" />
                <span className="text-xs">Mode</span>
              </div>
              <p className="font-semibold" style={styles.textPrimary}>
                Direct (Local)
              </p>
            </div>
          </div>
        )}

        {/* Command Result */}
        {commandResult && (
          <div
            className="mb-4 p-3 rounded-lg flex items-center gap-2"
            style={commandResult.success ? styles.successBadge : styles.errorBadge}
          >
            {commandResult.success ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span>{commandResult.message}</span>
          </div>
        )}

        {/* Search and Filter - only show when connected */}
        {connectionStatus?.connected && entities.length > 0 && (
          <>
            <div className="p-4 rounded-2xl border mb-6" style={styles.card}>
              <div className="flex flex-col sm:flex-row gap-4">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={styles.subtleText} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search entities by name, ID, or IP..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                    style={styles.input}
                  />
                </div>

                {/* Refresh Button */}
                <button
                  onClick={loadEntities}
                  disabled={loadingEntities}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium border transition-colors"
                  style={{
                    borderColor: styles.input.borderColor,
                    color: styles.textPrimary.color,
                    backgroundColor: styles.mutedCard.backgroundColor
                  }}
                >
                  <RefreshCw className={`w-4 h-4 ${loadingEntities ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>

              {/* Category Filters */}
              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className="px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                  style={selectedCategory === 'all' ? {
                    backgroundColor: palette.primary,
                    color: '#FFFFFF'
                  } : styles.mutedCard}
                >
                  All ({entityCategories.all || 0})
                </button>
                {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
                  const count = entityCategories[key] || 0;
                  if (count === 0) return null;
                  const Icon = config.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedCategory(key)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                      style={selectedCategory === key ? {
                        backgroundColor: config.color,
                        color: '#FFFFFF'
                      } : styles.mutedCard}
                    >
                      <Icon className="w-4 h-4" />
                      {config.label} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Entity List */}
            {loadingEntities ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: palette.info }} />
              </div>
            ) : filteredEntities.length === 0 ? (
              <div className="text-center py-16 rounded-2xl border" style={styles.card}>
                <Server className="w-12 h-12 mx-auto mb-4" style={styles.subtleText} />
                <p style={styles.textSecondary}>
                  {searchQuery ? 'No entities match your search' : 'No entities found'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredEntities.map(entity => {
                  const categoryConfig = CATEGORY_CONFIG[entity.category] || CATEGORY_CONFIG.other;
                  const Icon = categoryConfig.icon;
                  const isExpanded = expandedEntities[entity.entity_id];
                  const domainActions = DOMAIN_ACTIONS[entity.domain] || [];

                  return (
                    <div
                      key={entity.entity_id}
                      className="rounded-2xl border overflow-hidden"
                      style={styles.card}
                    >
                      {/* Entity Header */}
                      <button
                        onClick={() => toggleEntityExpanded(entity.entity_id)}
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="p-2 rounded-lg"
                            style={{ backgroundColor: withAlpha(categoryConfig.color, 0.15) }}
                          >
                            <Icon
                              className="w-5 h-5"
                              style={{ color: entity.is_online ? categoryConfig.color : '#71717A' }}
                            />
                          </div>
                          <div>
                            <div className="font-medium" style={styles.textPrimary}>
                              {entity.name}
                            </div>
                            <div className="text-sm" style={styles.subtleText}>
                              {entity.entity_id}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span
                            className="px-2 py-1 rounded text-xs font-medium"
                            style={entity.is_online ? styles.successBadge : styles.errorBadge}
                          >
                            {entity.state}
                          </span>
                          {isExpanded ? (
                            <ChevronDown className="w-5 h-5" style={styles.subtleText} />
                          ) : (
                            <ChevronRight className="w-5 h-5" style={styles.subtleText} />
                          )}
                        </div>
                      </button>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="px-4 pb-4 border-t" style={{ borderColor: styles.card.borderColor }}>
                          {/* Attributes */}
                          <div className="grid grid-cols-2 gap-4 py-4">
                            {entity.attributes.ip && (
                              <div>
                                <div className="text-xs uppercase tracking-wider mb-1" style={styles.subtleText}>
                                  IP Address
                                </div>
                                <div className="font-mono text-sm" style={styles.textPrimary}>
                                  {entity.attributes.ip}
                                </div>
                              </div>
                            )}
                            {entity.attributes.mac && (
                              <div>
                                <div className="text-xs uppercase tracking-wider mb-1" style={styles.subtleText}>
                                  MAC Address
                                </div>
                                <div className="font-mono text-sm" style={styles.textPrimary}>
                                  {entity.attributes.mac}
                                </div>
                              </div>
                            )}
                            {entity.attributes.friendly_name && (
                              <div>
                                <div className="text-xs uppercase tracking-wider mb-1" style={styles.subtleText}>
                                  Friendly Name
                                </div>
                                <div className="text-sm" style={styles.textPrimary}>
                                  {entity.attributes.friendly_name}
                                </div>
                              </div>
                            )}
                            {entity.attributes.device_class && (
                              <div>
                                <div className="text-xs uppercase tracking-wider mb-1" style={styles.subtleText}>
                                  Device Class
                                </div>
                                <div className="text-sm" style={styles.textPrimary}>
                                  {entity.attributes.device_class}
                                </div>
                              </div>
                            )}
                            {entity.last_changed && (
                              <div>
                                <div className="text-xs uppercase tracking-wider mb-1" style={styles.subtleText}>
                                  Last Changed
                                </div>
                                <div className="text-sm" style={styles.textPrimary}>
                                  {new Date(entity.last_changed).toLocaleString()}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Quick Actions */}
                          {domainActions.length > 0 && (
                            <div className="pt-4 border-t" style={{ borderColor: styles.card.borderColor }}>
                              <div className="text-xs uppercase tracking-wider mb-3" style={styles.subtleText}>
                                Quick Actions
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {domainActions.map(action => {
                                  const ActionIcon = action.icon;
                                  const commandKey = `${entity.entity_id}-${action.service}`;
                                  const isExecuting = executingCommand === commandKey;

                                  return (
                                    <button
                                      key={action.service}
                                      onClick={() => executeCommand(entity.entity_id, entity.domain, action.service)}
                                      disabled={isExecuting}
                                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                      style={{
                                        backgroundColor: withAlpha(categoryConfig.color, 0.15),
                                        color: categoryConfig.color
                                      }}
                                    >
                                      {isExecuting ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <ActionIcon className="w-4 h-4" />
                                      )}
                                      {action.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Empty state when not connected */}
        {!connectionStatus?.connected && (
          <div className="text-center py-16 rounded-2xl border" style={styles.card}>
            <Wifi className="w-12 h-12 mx-auto mb-4" style={styles.subtleText} />
            <p className="font-medium mb-2" style={styles.textPrimary}>
              Not Connected
            </p>
            <p style={styles.textSecondary}>
              Enter your Home Assistant URL and access token above to connect.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default HomeAssistantPage;
