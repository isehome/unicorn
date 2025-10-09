import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import * as unifiApi from '../services/unifiApi';
import { supabase } from '../lib/supabase';
import Button from './ui/Button';
import { 
  ArrowLeft, 
  RefreshCw, 
  Wifi, 
  Users, 
  Server,
  Activity,
  Globe,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader,
  FolderOpen
} from 'lucide-react';

const UnifiTestPage = () => {
  const navigate = useNavigate();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];

  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [manualUrl, setManualUrl] = useState('');
  const [useManualUrl, setUseManualUrl] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [sites, setSites] = useState([]);
  const [selectedSite, setSelectedSite] = useState('');
  const [devices, setDevices] = useState([]);
  const [clients, setClients] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data, error: fetchError } = await supabase
        .from('projects')
        .select('id, project_number, unifi_url')
        .not('unifi_url', 'is', null)
        .order('project_number');
      
      if (fetchError) throw fetchError;
      
      setProjects(data || []);
      
      // Auto-select first project if available
      if (data && data.length > 0) {
        handleProjectSelect(data[0]);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProjectSelect = async (project) => {
    setSelectedProject(project);
    setUseManualUrl(false);
    setConnectionStatus(null);
    setSites([]);
    setDevices([]);
    setClients([]);
    await testConnection(project.unifi_url);
  };

  const handleManualTest = async () => {
    if (!manualUrl) {
      setError('Please enter a UniFi URL');
      return;
    }
    setUseManualUrl(true);
    setSelectedProject(null);
    setConnectionStatus(null);
    setSites([]);
    setDevices([]);
    setClients([]);
    await testConnection(manualUrl);
  };

  const testConnection = async (controllerUrl) => {
    if (!controllerUrl) {
      setError('No UniFi URL configured for this project');
      setConnectionStatus({ success: false, error: 'No UniFi URL configured' });
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const result = await unifiApi.testConnection(controllerUrl);
      setConnectionStatus(result);
      
      if (result.success) {
        await loadSites(controllerUrl);
      }
    } catch (err) {
      console.error('Connection test failed:', err);
      setError(err.message);
      setConnectionStatus({ success: false, error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const loadSites = async (controllerUrl) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await unifiApi.fetchSites(controllerUrl);
      console.log('Sites response:', response);
      setSites(response.data || []);
      
      // Auto-select first site if available
      if (response.data && response.data.length > 0) {
        setSelectedSite(response.data[0].id);
        await loadSiteData(response.data[0].id, controllerUrl);
      }
    } catch (err) {
      console.error('Failed to load sites:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSiteData = async (siteId, controllerUrl) => {
    const url = controllerUrl || (useManualUrl ? manualUrl : selectedProject?.unifi_url);
    if (!url) return;

    try {
      setLoading(true);
      setError(null);
      
      // Load devices
      const devicesResponse = await unifiApi.fetchDevices(siteId, url);
      console.log('Devices response:', devicesResponse);
      setDevices(devicesResponse.data || []);
      
      // Load clients
      const clientsResponse = await unifiApi.fetchClients(siteId, url);
      console.log('Clients response:', clientsResponse);
      setClients(clientsResponse.data || []);
    } catch (err) {
      console.error('Failed to load site data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSiteChange = (e) => {
    const siteId = e.target.value;
    setSelectedSite(siteId);
    const url = useManualUrl ? manualUrl : selectedProject?.unifi_url;
    if (siteId && url) {
      loadSiteData(siteId, url);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="secondary"
          size="sm"
          icon={ArrowLeft}
          onClick={() => navigate(-1)}
        >
          Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            UniFi API Test Page
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Test UniFi API connection and view client data
          </p>
        </div>
      </div>

      {/* Manual URL Input */}
      <div style={sectionStyles.card} className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-5 h-5 text-violet-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Test with Manual URL
          </h2>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Enter UniFi Controller URL
            </label>
            <input
              type="text"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://api.ui.com or your controller URL"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-violet-500 focus:border-transparent
                       placeholder-gray-400 dark:placeholder-gray-500"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Example: https://api.ui.com (for UniFi Cloud) or https://your-controller-ip:8443 (for self-hosted)
            </p>
          </div>
          
          <Button
            variant="primary"
            onClick={handleManualTest}
            disabled={loading || !manualUrl}
            icon={Wifi}
          >
            Test Connection
          </Button>

          {useManualUrl && manualUrl && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <span className="font-medium">Testing with:</span>{' '}
                <span className="font-mono">{manualUrl}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Project Selection */}
      {projects.length > 0 && (
        <div style={sectionStyles.card} className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen className="w-5 h-5 text-violet-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Or Select From Projects
            </h2>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Choose a project to test
            </label>
            <select
              value={selectedProject?.id || ''}
              onChange={(e) => {
                const project = projects.find(p => p.id === e.target.value);
                if (project) handleProjectSelect(project);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            >
              <option value="">Choose a project...</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.project_number}
                </option>
              ))}
            </select>
            
            {selectedProject && !useManualUrl && (
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium">UniFi URL:</span>{' '}
                  <span className="text-gray-900 dark:text-white">{selectedProject.unifi_url}</span>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Connection Status */}
      <div style={sectionStyles.card} className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              Connection Status
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Testing connection to UniFi API
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            onClick={() => {
              const url = useManualUrl ? manualUrl : selectedProject?.unifi_url;
              if (url) testConnection(url);
            }}
            disabled={loading || (!selectedProject && !useManualUrl)}
          >
            Test Again
          </Button>
        </div>

        {loading && !connectionStatus ? (
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Loader className="w-5 h-5 animate-spin" />
            <span>Testing connection...</span>
          </div>
        ) : connectionStatus ? (
          <div className={`flex items-start gap-2 p-4 rounded-lg ${
            connectionStatus.success 
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
          }`}>
            {connectionStatus.success ? (
              <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
            )}
            <div className="flex-1">
              <p className={`font-medium ${
                connectionStatus.success 
                  ? 'text-green-800 dark:text-green-300'
                  : 'text-red-800 dark:text-red-300'
              }`}>
                {connectionStatus.success ? 'Connection Successful' : 'Connection Failed'}
              </p>
              {connectionStatus.message && (
                <p className={`text-sm mt-1 ${
                  connectionStatus.success
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-red-700 dark:text-red-400'
                }`}>
                  {connectionStatus.message}
                </p>
              )}
            </div>
          </div>
        ) : null}

        {error && (
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">Error</p>
                <p className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sites */}
      {sites.length > 0 && (
        <div style={sectionStyles.card} className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-5 h-5 text-violet-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Sites ({sites.length})
            </h2>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Select Site
            </label>
            <select
              value={selectedSite}
              onChange={handleSiteChange}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            >
              <option value="">Choose a site...</option>
              {sites.map(site => (
                <option key={site.id} value={site.id}>
                  {site.name || site.description || site.id}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sites.map(site => (
              <div
                key={site.id}
                className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                  selectedSite === site.id
                    ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-300 dark:border-violet-700'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-violet-300'
                }`}
                onClick={() => {
                  setSelectedSite(site.id);
                  const url = useManualUrl ? manualUrl : selectedProject?.unifi_url;
                  if (url) {
                    loadSiteData(site.id, url);
                  }
                }}
              >
                <div className="flex items-start gap-2">
                  <Globe className="w-4 h-4 text-gray-600 dark:text-gray-400 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {site.name || site.description || 'Unnamed Site'}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      ID: {site.id}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Devices */}
      {selectedSite && devices.length > 0 && (
        <div style={sectionStyles.card} className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Server className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Devices ({devices.length})
            </h2>
          </div>

          <div className="space-y-3">
            {devices.map(device => (
              <div
                key={device.mac || device.id}
                className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Activity className="w-4 h-4 text-blue-600" />
                      <p className="font-medium text-gray-900 dark:text-white">
                        {device.name || device.model || 'Unnamed Device'}
                      </p>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${
                        device.state === 1
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                      }`}>
                        {device.state === 1 ? 'Online' : 'Offline'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <div>
                        <span className="font-medium">Model:</span> {device.model || 'N/A'}
                      </div>
                      <div>
                        <span className="font-medium">IP:</span> {device.ip || 'N/A'}
                      </div>
                      <div>
                        <span className="font-medium">MAC:</span> {device.mac || 'N/A'}
                      </div>
                      <div>
                        <span className="font-medium">Type:</span> {device.type || 'N/A'}
                      </div>
                      {device.num_port && (
                        <div>
                          <span className="font-medium">Ports:</span> {device.num_port}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clients */}
      {selectedSite && clients.length > 0 && (
        <div style={sectionStyles.card} className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Connected Clients ({clients.length})
            </h2>
          </div>

          <div className="space-y-3">
            {clients.map(client => (
              <div
                key={client.mac || client.id}
                className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Wifi className="w-4 h-4 text-green-600" />
                      <p className="font-medium text-gray-900 dark:text-white">
                        {client.hostname || client.name || 'Unknown Client'}
                      </p>
                      {client.is_wired !== undefined && (
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          client.is_wired
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                        }`}>
                          {client.is_wired ? 'Wired' : 'Wireless'}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <div>
                        <span className="font-medium">IP:</span> {client.ip || 'N/A'}
                      </div>
                      <div>
                        <span className="font-medium">MAC:</span> {client.mac || 'N/A'}
                      </div>
                      {client.oui && (
                        <div>
                          <span className="font-medium">Vendor:</span> {client.oui}
                        </div>
                      )}
                      {client.network && (
                        <div>
                          <span className="font-medium">Network:</span> {client.network}
                        </div>
                      )}
                      {client.uptime && (
                        <div>
                          <span className="font-medium">Uptime:</span> {Math.floor(client.uptime / 60)} min
                        </div>
                      )}
                      {client.last_seen && (
                        <div>
                          <span className="font-medium">Last Seen:</span>{' '}
                          {new Date(client.last_seen * 1000).toLocaleTimeString()}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Data Message */}
      {sites.length === 0 && !loading && connectionStatus?.success && (
        <div style={sectionStyles.card} className="p-8 text-center">
          <Globe className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400">
            No sites found. Make sure your UniFi API key has access to sites.
          </p>
        </div>
      )}

      {selectedSite && clients.length === 0 && devices.length === 0 && !loading && (
        <div style={sectionStyles.card} className="p-8 text-center">
          <Activity className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 dark:text-gray-400">
            No devices or clients found for this site.
          </p>
        </div>
      )}
    </div>
  );
};

export default UnifiTestPage;
