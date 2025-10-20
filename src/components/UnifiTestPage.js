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
  const [parsedConsoleId, setParsedConsoleId] = useState(null);
  const [deviceSource, setDeviceSource] = useState(null);

  const cleanString = (value) => (typeof value === 'string' ? value.trim() : value);

  const getHostDisplayName = (host) => {
    const reported = host?.reportedState;
    const candidates = [
      cleanString(host?.hostName),
      cleanString(reported?.hostname),
      cleanString(reported?.name),
      cleanString(host?.hostname),
      cleanString(host?.name),
      cleanString(host?.userData?.fullName),
      cleanString(host?.hardware?.name),
      cleanString(host?.hardware?.shortname),
      cleanString(host?.id),
      cleanString(reported?.controller_uuid),
    ];

    const display = candidates.find((value) => typeof value === 'string' && value.length > 0);
    return display || 'Unnamed Host';
  };

  const getSiteDisplayName = (site, host) => {
    const reported = host?.reportedState;
    const candidates = [
      cleanString(site?.siteName),
      cleanString(site?.name),
      cleanString(site?.displayName),
      cleanString(site?.description),
      cleanString(site?.locationName),
      cleanString(reported?.hostname),
      cleanString(reported?.name),
      cleanString(host?.userData?.fullName)
    ];

    const display = candidates.find((value) => typeof value === 'string' && value.length > 0);
    return display || null;
  };

  const parseUidb = (uidb) => {
    if (!uidb) return {};
    if (typeof uidb === 'object') {
      const stringValue = uidb.id || uidb.guid || uidb.value || null;
      if (!stringValue) return {};
      return parseUidb(stringValue);
    }
    if (typeof uidb !== 'string') return {};

    const parts = uidb.split(':').filter(Boolean);
    if (parts.length === 0) return {};

    const hostId = parts[0] || null;
    const siteId = parts[1] || null;

    return {
      hostId,
      siteId,
      hostSiteId: hostId && siteId ? `${hostId}:${siteId}` : hostId || null
    };
  };

  const normalizeHostsToSites = (hosts = []) => {
    const normalized = [];
    const seen = new Set();

    const pushEntry = ({ host, hostId, siteId, hostSiteId, siteName, rawSite }) => {
      const resolvedHostId =
        hostId ||
        host?.hostId ||
        host?.id ||
        host?.uid ||
        host?.controllerId ||
        host?.controller_id ||
        null;

      const resolvedHostSiteId = hostSiteId || (resolvedHostId && siteId ? `${resolvedHostId}:${siteId}` : resolvedHostId);
      if (!resolvedHostSiteId || seen.has(resolvedHostSiteId)) return;

      const hostName = getHostDisplayName(host);
      const siteDisplayName = getSiteDisplayName(rawSite, host) || siteName || hostName;
      const [resolvedConsoleId, resolvedSiteSuffix] = (resolvedHostSiteId || '').split(':');
      const ipAddress = cleanString(
        host?.reportedState?.ip ||
        host?.ipAddress ||
        host?.reportedState?.ipAddrs?.find?.((value) => typeof value === 'string' && value.trim().length > 0) ||
        host?.reportedState?.wans?.find?.((wan) => wan?.ipv4)?.ipv4
      ) || null;
      const locationText = cleanString(
        host?.reportedState?.location?.text ||
        host?.location?.text ||
        (typeof host?.reportedState?.location === 'string' ? host?.reportedState?.location : null)
      ) || null;
      const firmware = cleanString(
        host?.reportedState?.version ||
        host?.reportedState?.hardware?.version ||
        host?.hardware?.firmwareVersion
      ) || null;

      seen.add(resolvedHostSiteId);
      normalized.push({
        hostId: resolvedHostId,
        hostName,
        siteId: siteId || null,
        siteName: siteDisplayName || siteId || hostName,
        hostSiteId: resolvedHostSiteId,
        consoleId: resolvedConsoleId || resolvedHostId || null,
        siteSuffix: resolvedSiteSuffix || null,
        siteLabel: siteDisplayName || hostName,
        ipAddress,
        firmware,
        location: locationText,
        mac: host?.reportedState?.mac || host?.mac || host?.hardware?.mac || null,
        controllerStatus: host?.reportedState?.state || host?.state || null,
        devices: Array.isArray(host?.devices) ? host.devices : [],
        controllers: Array.isArray(host?.reportedState?.controllers) ? host.reportedState.controllers : [],
        rawHost: host || null,
        rawSite: rawSite || null
      });
    };

    hosts.forEach((host) => {
      const hostUidb = parseUidb(
        host?.uidb ||
        host?.reportedState?.uidb ||
        host?.reportedState?.controller_uuid ||
        host?.id
      );
      const baseHostId =
        host?.hostId ||
        host?.id ||
        host?.uid ||
        hostUidb.hostId ||
        host?.controllerId ||
        host?.controller_id ||
        host?.reportedState?.controller_uuid ||
        null;

      const fallbackHostName = getHostDisplayName(host);

      const siteCollections = [
        Array.isArray(host?.sites) ? host.sites : [],
        Array.isArray(host?.hostSites) ? host.hostSites : [],
        Array.isArray(host?.controllerSites) ? host.controllerSites : [],
        Array.isArray(host?.reportedState?.sites) ? host.reportedState.sites : [],
        Array.isArray(host?.reportedState?.hostSites) ? host.reportedState.hostSites : []
      ].find((collection) => collection.length > 0);

      if (siteCollections && siteCollections.length > 0) {
        siteCollections.forEach((site) => {
          const siteUidb = parseUidb(site?.uidb);
          const siteId =
            site?.siteId ||
            site?.id ||
            site?.site_id ||
            siteUidb.siteId ||
            site?.uid ||
            null;

          const siteName =
            site?.siteName ||
            site?.name ||
            site?.displayName ||
            site?.description ||
            siteId ||
            fallbackHostName;

          pushEntry({
            host,
            hostId: baseHostId || hostUidb.hostId,
            siteId,
            hostSiteId: siteUidb.hostSiteId,
            siteName,
            rawSite: site
          });
        });
        return;
      }

      if (Array.isArray(host?.devices) && host.devices.length > 0) {
        host.devices.forEach((device) => {
          const deviceUidb = parseUidb(device?.uidb);
          pushEntry({
            host,
            hostId: deviceUidb.hostId || baseHostId,
            siteId: deviceUidb.siteId,
            hostSiteId: deviceUidb.hostSiteId || device?.uidb,
            siteName: device?.siteName || device?.name || device?.model || deviceUidb.siteId,
            rawSite: device
          });
        });
        return;
      }

      pushEntry({
        host,
        hostId: baseHostId,
        siteId: null,
        hostSiteId: baseHostId,
        siteName: fallbackHostName,
        rawSite: null
      });
    });

    return normalized;
  };

  const getDeviceIdentifiers = (device = {}) => {
    const uidbInfo = parseUidb(device?.uidb);

    const hostId =
      cleanString(device?.hostId) ||
      cleanString(device?.host_id) ||
      cleanString(uidbInfo.hostId);

    const siteId =
      cleanString(device?.siteId) ||
      cleanString(device?.site_id) ||
      cleanString(device?.site?.id) ||
      cleanString(uidbInfo.siteId);

    const consoleId =
      cleanString(device?.consoleId) ||
      cleanString(device?.console_id) ||
      (hostId ? cleanString(hostId.split(':')[0]) : null) ||
      cleanString(uidbInfo.hostId);

    const hostSiteId =
      cleanString(device?.hostSiteId) ||
      cleanString(device?.host_site_id) ||
      cleanString(uidbInfo.hostSiteId) ||
      (hostId && siteId ? `${hostId}:${siteId}` : null);

    const siteName =
      cleanString(device?.siteName) ||
      cleanString(device?.site?.name) ||
      cleanString(device?.site?.displayName);

    return {
      consoleId,
      hostId,
      hostSiteId,
      siteId,
      siteName
    };
  };

  const filterDevicesForSite = (devicesList = [], siteInfo = null) => {
    if (!Array.isArray(devicesList)) return [];
    if (!siteInfo) return [...devicesList];

    return devicesList.filter((device) => {
      const identifiers = getDeviceIdentifiers(device);

      if (siteInfo.hostSiteId && identifiers.hostSiteId && identifiers.hostSiteId === siteInfo.hostSiteId) {
        return true;
      }

      if (siteInfo.siteSuffix && identifiers.siteId && identifiers.siteId === siteInfo.siteSuffix) {
        return true;
      }

      if (!siteInfo.siteSuffix && siteInfo.consoleId && identifiers.consoleId && identifiers.consoleId === siteInfo.consoleId) {
        return true;
      }

      if (!siteInfo.siteSuffix && siteInfo.hostId && identifiers.hostId && identifiers.hostId === siteInfo.hostId) {
        return true;
      }

      return false;
    });
  };

  // Parse console ID from UniFi URL
  const parseUnifiUrl = (url) => {
    if (!url) return null;
    
    try {
      // Example URL: https://unifi.ui.com/consoles/6C63F82BC2D10000000008E7C92D00000000096176EB0000000067E300F0:1380092638/network/default/dashboard
      // Extract the console ID between /consoles/ and /network/
      const match = url.match(/\/consoles\/([^\/]+)/);
      if (match && match[1]) {
        console.log('Parsed console ID:', match[1]);
        return match[1];
      }
    } catch (err) {
      console.error('Error parsing UniFi URL:', err);
    }
    return null;
  };

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
    setSelectedSite('');
    setDeviceSource(null);
    setSites([]);
    setDevices([]);
    setClients([]);
    
    // Parse console ID from the URL
    const consoleId = parseUnifiUrl(project.unifi_url);
    setParsedConsoleId(consoleId);
    
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
    setSelectedSite('');
    setDeviceSource(null);
    setSites([]);
    setDevices([]);
    setClients([]);
    
    // Parse console ID from the URL
    const consoleId = parseUnifiUrl(manualUrl);
    setParsedConsoleId(consoleId);
    
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
      
      console.log('Loading sites from:', controllerUrl);
      const response = await unifiApi.fetchSites(controllerUrl);
      console.log('Full API Response:', JSON.stringify(response, null, 2));
      
      // The API has data array with host objects
      const rawSites = response.data || response;
      const sitesArray = Array.isArray(rawSites) ? rawSites : [];

      console.log('Number of hosts returned:', sitesArray.length);

      if (sitesArray.length > 0) {
        console.log('First host structure:', sitesArray[0]);
      }

      const normalizedSites = normalizeHostsToSites(sitesArray);
      console.log('Normalized site entries:', normalizedSites);

      setSites(normalizedSites);

      if (normalizedSites.length === 0) {
        console.warn('No site entries were derived from host data');
        return;
      }

      let defaultSite = normalizedSites[0];

      if (parsedConsoleId) {
        console.log('Looking for host with console ID:', parsedConsoleId);
        const matchingSite = normalizedSites.find((site) => {
          if (!site) return false;
          if (site.consoleId === parsedConsoleId) return true;
          if (site.hostId === parsedConsoleId) return true;
          if (site.hostSiteId?.startsWith(`${parsedConsoleId}:`)) return true;
          return false;
        });

        if (matchingSite) {
          console.log('Found matching site for console ID:', matchingSite);
          defaultSite = matchingSite;
        } else {
          console.log('No matching site found for console ID:', parsedConsoleId);
          console.log('Available hostSiteIds:', normalizedSites.map((site) => site.hostSiteId));
        }
      }

      if (defaultSite) {
        setSelectedSite(defaultSite.hostSiteId);
        await loadSiteData(defaultSite.hostSiteId, controllerUrl, defaultSite);
      }
    } catch (err) {
      console.error('Failed to load sites:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSiteData = async (siteId, controllerUrl, providedSite) => {
    const url = controllerUrl || (useManualUrl ? manualUrl : selectedProject?.unifi_url);
    if (!url) return;

    const siteEntry =
      providedSite ||
      sites.find(site => site.hostSiteId === siteId || site.hostId === siteId);

    const requestHostId = siteEntry?.hostSiteId || siteId;
    const fallbackDevices = Array.isArray(siteEntry?.devices) ? siteEntry.devices : [];
    const fallbackLabel = siteEntry?.siteLabel || siteEntry?.hostName || requestHostId;
    const hostIdsForRequest = Array.from(
      new Set(
        [
          siteEntry?.hostSiteId,
          siteEntry?.consoleId,
          siteEntry?.hostId,
          requestHostId
        ].filter(Boolean)
      )
    );

    try {
      setLoading(true);
      setError(null);
      setDeviceSource(null);
      
      console.log('Loading devices for hostId:', requestHostId);
      
      // Call the /v1/devices endpoint with hostIds filter
      const devicesResult = await unifiApi.fetchDevices(hostIdsForRequest, url, {
        fetchAll: true,
        pageSize: 200
      });
      console.log('Devices response summary:', {
        pagesFetched: devicesResult?.pagesFetched,
        total: devicesResult?.data?.length,
        nextToken: devicesResult?.nextToken
      });
      
      // The API returns { data: [...devices...] }
      const devicesData =
        devicesResult?.data ||
        devicesResult?.raw?.data ||
        devicesResult?.raw?.devices ||
        devicesResult?.raw?.items ||
        [];
      console.log('Devices data length:', devicesData.length);

      const apiDevices = Array.isArray(devicesData) ? devicesData : [];
      const filteredApiDevices = filterDevicesForSite(apiDevices, siteEntry);

      if (filteredApiDevices.length > 0) {
        console.log('Found devices from API:', apiDevices.length, 'Filtered devices:', filteredApiDevices.length);
        setDevices(filteredApiDevices);
        setDeviceSource({
          type: 'api',
          rawCount: apiDevices.length,
          filteredCount: filteredApiDevices.length,
          note: apiDevices.length !== filteredApiDevices.length
            ? 'Filtered device list to the selected site hostId/siteId.'
            : null
        });
      } else if (apiDevices.length > 0) {
        console.log('API returned devices but none matched the selected site. Raw count:', apiDevices.length);
        setDevices([]);
        setDeviceSource({
          type: 'apiNoMatch',
          rawCount: apiDevices.length,
          filteredCount: 0,
          note: 'Devices were returned by the API, but none matched the selected site.'
        });
      } else if (fallbackDevices.length > 0) {
        const fallbackFiltered = filterDevicesForSite(fallbackDevices, siteEntry);
        if (fallbackFiltered.length > 0) {
          console.log(`Using fallback devices from host payload for ${fallbackLabel}`);
          setDevices(fallbackFiltered);
          setDeviceSource({
            type: 'hostPayload',
            rawCount: fallbackDevices.length,
            filteredCount: fallbackFiltered.length,
            note: fallbackDevices.length !== fallbackFiltered.length ? 'Filtered to the selected site (host payload).' : null
          });
        } else {
          console.log(`Host payload devices did not match the selected site. Total devices in payload: ${fallbackDevices.length}`);
          setDevices([]);
          setDeviceSource({
            type: 'hostPayloadNoMatch',
            rawCount: fallbackDevices.length,
            filteredCount: 0,
            note: 'Devices were present in the host payload, but none matched the selected site.'
          });
        }
      } else {
        console.log('No devices found for this host');
        setDevices([]);
        setDeviceSource({
          type: 'empty',
          rawCount: 0,
          filteredCount: 0,
          note: 'The UniFi API did not return any devices.'
        });
      }
      
      // Clients endpoint not available in this API
      setClients([]);
    } catch (err) {
      console.error('Failed to load site data:', err);
      setError(err.message);
      setDeviceSource({
        type: 'error',
        rawCount: 0,
        filteredCount: 0,
        message: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSiteChange = (e) => {
    const siteId = e.target.value;
    setSelectedSite(siteId);
    const url = useManualUrl ? manualUrl : selectedProject?.unifi_url;
    if (siteId && url) {
      const targetSite = sites.find(site => site.hostSiteId === siteId);
      loadSiteData(siteId, url, targetSite);
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
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg space-y-2">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <span className="font-medium">Testing with:</span>{' '}
                <span className="font-mono text-xs break-all">{manualUrl}</span>
              </p>
              {parsedConsoleId && (
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <span className="font-medium">Parsed Console ID:</span>{' '}
                  <span className="font-mono text-xs break-all">{parsedConsoleId}</span>
                </p>
              )}
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
              value={selectedProject ? String(selectedProject.id) : ''}
              onChange={(e) => {
                const project = projects.find(p => String(p.id) === e.target.value);
                if (project) handleProjectSelect(project);
              }}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            >
              <option value="">Choose a project...</option>
              {projects.map(project => (
                <option key={project.id} value={String(project.id)}>
                  {project.project_number}
                </option>
              ))}
            </select>
            
            {selectedProject && !useManualUrl && (
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-medium">UniFi URL:</span>{' '}
                  <span className="text-gray-900 dark:text-white text-xs break-all">{selectedProject.unifi_url}</span>
                </p>
                {parsedConsoleId && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Parsed Console ID:</span>{' '}
                    <span className="text-gray-900 dark:text-white font-mono text-xs break-all">{parsedConsoleId}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Debug Info */}
      {sites.length > 0 && (
        <div style={sectionStyles.card} className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Debug Info
            </h2>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg font-mono text-xs overflow-auto">
            <p className="mb-2 text-gray-900 dark:text-white font-semibold">API Response Summary:</p>
            <p className="text-gray-700 dark:text-gray-300">Total site entries: {sites.length}</p>
            <p className="text-gray-700 dark:text-gray-300 mb-2">Parsed Console ID: {parsedConsoleId || 'None'}</p>
            
            <p className="mb-2 mt-4 text-gray-900 dark:text-white font-semibold">Available Sites:</p>
            {sites.map((site, idx) => (
              <div key={site.hostSiteId || idx} className="mb-3 p-2 bg-white dark:bg-gray-700 rounded border border-gray-200 dark:border-gray-600">
                <p className="text-blue-600 dark:text-blue-400">Site {idx + 1}:</p>
                <p className="text-gray-700 dark:text-gray-300">• hostId: {site.hostId}</p>
                <p className="text-gray-700 dark:text-gray-300">• siteId: {site.siteId || 'N/A'}</p>
                <p className="text-gray-700 dark:text-gray-300">• hostSiteId: {site.hostSiteId}</p>
                <p className="text-gray-700 dark:text-gray-300">• consoleId: {site.consoleId || 'N/A'}</p>
                <p className="text-gray-700 dark:text-gray-300">• siteSuffix: {site.siteSuffix || 'N/A'}</p>
                <p className="text-gray-700 dark:text-gray-300">• hostName: {site.hostName || 'N/A'}</p>
                <p className="text-gray-700 dark:text-gray-300">• siteName: {site.siteName || 'N/A'}</p>
                <p className="text-gray-700 dark:text-gray-300">• IP: {site.ipAddress || 'Unknown'}</p>
                <p className="text-gray-700 dark:text-gray-300">• Location: {site.location || 'Unknown'}</p>
                <p className="text-gray-700 dark:text-gray-300">• Firmware: {site.firmware || 'Unknown'}</p>
                <p className="text-gray-700 dark:text-gray-300">• Controllers: {site.controllers?.length || 0}</p>
                {site.controllers?.length ? (
                  <p className="text-gray-700 dark:text-gray-300">
                    • Controller Names: {site.controllers.map(controller => cleanString(controller?.name) || 'unknown').join(', ')}
                  </p>
                ) : null}
                <p className="text-gray-700 dark:text-gray-300">• Devices (host payload): {site.devices?.length || 0}</p>
                <p className="text-gray-700 dark:text-gray-300 text-xs mt-1">
                  (Devices will be loaded separately when host is selected)
                </p>
              </div>
            ))}
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
                <option key={site.hostSiteId} value={site.hostSiteId}>
                  {`${site.siteLabel || site.siteName || site.hostName || 'Unnamed Site'}${site.location ? ` – ${site.location}` : ''}`}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sites.map(site => (
              <div
                key={site.hostSiteId}
                className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                  selectedSite === site.hostSiteId
                    ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-300 dark:border-violet-700'
                    : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-violet-300'
                }`}
                onClick={() => {
                  setSelectedSite(site.hostSiteId);
                  const url = useManualUrl ? manualUrl : selectedProject?.unifi_url;
                  if (url) {
                    loadSiteData(site.hostSiteId, url, site);
                  }
                }}
              >
                <div className="flex items-start gap-2">
                  <Globe className="w-4 h-4 text-gray-600 dark:text-gray-400 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {site.siteLabel || site.siteName || site.hostName || 'Unnamed Site'}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      Hostname: {site.hostName || 'Unknown'}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-500 truncate">
                      Console ID: {site.consoleId || 'N/A'}
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-500 truncate">
                      hostSiteId: {site.hostSiteId}
                    </p>
                    {site.siteSuffix && (
                      <p className="text-[11px] text-gray-500 dark:text-gray-500 truncate">
                        Site Suffix: {site.siteSuffix}
                      </p>
                    )}
                    {site.location && (
                      <p className="text-[11px] text-gray-500 dark:text-gray-500 truncate">
                        Location: {site.location}
                      </p>
                    )}
                    {site.ipAddress && (
                      <p className="text-[11px] text-gray-500 dark:text-gray-500 truncate">
                        IP: {site.ipAddress}
                      </p>
                    )}
                    {site.firmware && (
                      <p className="text-[11px] text-gray-500 dark:text-gray-500 truncate">
                        Firmware: {site.firmware}
                      </p>
                    )}
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

          {deviceSource && (
            <div
              className={`mb-3 text-sm px-3 py-2 rounded-lg border ${
                deviceSource.type === 'api'
                  ? 'text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-900/20 dark:border-green-800'
                  : deviceSource.type === 'hostPayload'
                  ? 'text-blue-700 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-900/20 dark:border-blue-800'
                  : deviceSource.type === 'apiNoMatch' || deviceSource.type === 'hostPayloadNoMatch'
                  ? 'text-yellow-700 bg-yellow-50 border-yellow-200 dark:text-yellow-300 dark:bg-yellow-900/20 dark:border-yellow-800'
                  : deviceSource.type === 'error'
                  ? 'text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-900/20 dark:border-red-800'
                  : 'text-gray-700 bg-gray-50 border-gray-200 dark:text-gray-300 dark:bg-gray-800/40 dark:border-gray-700'
              }`}
            >
              <p className="font-medium">
                {(() => {
                  switch (deviceSource.type) {
                    case 'api':
                      return 'Devices loaded via UniFi API (GET /v1/devices).';
                    case 'hostPayload':
                      return 'Devices loaded from host payload (API returned no records).';
                    case 'apiNoMatch':
                      return 'No API devices matched the selected site.';
                    case 'hostPayloadNoMatch':
                      return 'Host payload devices did not match the selected site.';
                    case 'empty':
                      return 'The UniFi API did not return any devices for this host.';
                    case 'error':
                      return 'Failed to load devices from the UniFi API.';
                    default:
                      return 'Device source information unavailable.';
                  }
                })()}
              </p>
              {(deviceSource.rawCount !== undefined || deviceSource.filteredCount !== undefined) && (
                <p className="mt-1 text-xs opacity-80">
                  Raw devices: {deviceSource.rawCount ?? 'N/A'} • After site filter: {deviceSource.filteredCount ?? 'N/A'}
                </p>
              )}
              {deviceSource.note && (
                <p className="mt-1 text-xs opacity-80">
                  {deviceSource.note}
                </p>
              )}
              {deviceSource.message && (
                <p className="mt-1 text-xs opacity-80">
                  Error: {deviceSource.message}
                </p>
              )}
            </div>
          )}

          <div className="space-y-3">
            {devices.map(device => {
              const identifiers = getDeviceIdentifiers(device);
              return (
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
                        <span className="font-medium">Status:</span> {device.status || 'N/A'}
                      </div>
                      {device.version && (
                        <div>
                          <span className="font-medium">Version:</span> {device.version}
                        </div>
                      )}
                      {device.productLine && (
                        <div>
                          <span className="font-medium">Product:</span> {device.productLine}
                        </div>
                      )}
                      <div>
                        <span className="font-medium">Site:</span>{' '}
                        {identifiers.siteName || identifiers.siteId || 'N/A'}
                      </div>
                      <div>
                        <span className="font-medium">Site ID:</span>{' '}
                        {identifiers.siteId || 'N/A'}
                      </div>
                      <div>
                        <span className="font-medium">Host Site:</span>{' '}
                        {identifiers.hostSiteId || 'N/A'}
                      </div>
                      <div>
                        <span className="font-medium">Console ID:</span>{' '}
                        {identifiers.consoleId || 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
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
                          : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
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
            {deviceSource?.type === 'error'
              ? 'Failed to load devices for this site. Check console logs for details.'
              : 'No devices or clients were returned for this site.'}
          </p>
          {deviceSource?.note && (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
              {deviceSource.note}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default UnifiTestPage;
