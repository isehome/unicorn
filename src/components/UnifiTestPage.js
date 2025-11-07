import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import * as unifiApi from '../services/unifiApi';
import { supabase } from '../lib/supabase';
import Button from './ui/Button';
import {
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
  const [clientTestResults, setClientTestResults] = useState(null);
  const [selectedClientEndpoint, setSelectedClientEndpoint] = useState(null);
  const [clientEndpointData, setClientEndpointData] = useState(null);
  const [showClientData, setShowClientData] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [hardcodedTestResult, setHardcodedTestResult] = useState(null);
  const [localControllerIp, setLocalControllerIp] = useState('');
  const [localNetworkApiKey, setLocalNetworkApiKey] = useState('');
  const [localApiTestResult, setLocalApiTestResult] = useState(null);
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [showSitesSection, setShowSitesSection] = useState(true);
  const [showDevicesSection, setShowDevicesSection] = useState(true);
  const [controllerHostname, setControllerHostname] = useState('');
  const [connectionTestResult, setConnectionTestResult] = useState(null);

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
        .order('project_number');
      
      if (fetchError) throw fetchError;
      
      console.log('Projects loaded:', data);
      setProjects(data || []);

      // Don't auto-select - let user choose
      // if (data && data.length > 0) {
      //   handleProjectSelect(data[0]);
      // }
    } catch (err) {
      console.error('Failed to load projects:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProjectSelect = async (project) => {
    console.log('Project selected:', project);
    setSelectedProject(project);
    setConnectionStatus(null);
    setSelectedSite('');
    setDeviceSource(null);
    setSites([]);
    setDevices([]);
    setClients([]);
    setClientTestResults(null);
    setShowClientData(false);

    // If project has a UniFi URL, use it
    if (project.unifi_url) {
      setUseManualUrl(false);
      setManualUrl(project.unifi_url);

      // Parse console ID from the URL
      const consoleId = parseUnifiUrl(project.unifi_url);
      setParsedConsoleId(consoleId);

      const sitesResult = await testConnection(project.unifi_url);

      // Auto-test client endpoints if site was auto-selected
      if (sitesResult && sitesResult.length > 0) {
        setTimeout(() => {
          console.log('Auto-testing client endpoints after site selection');
          handleClientEndpointTest();
        }, 1500);
      }
    } else {
      // No UniFi URL in project, use manual URL
      setUseManualUrl(true);
      console.log('Project has no UniFi URL, please enter one manually');
    }
  };

  const handleManualTest = async () => {
    if (!apiKey) {
      setError('Please enter a UniFi API key');
      return;
    }
    if (!manualUrl) {
      setManualUrl('https://api.ui.com'); // Default to cloud API
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
    const consoleId = parseUnifiUrl(manualUrl || 'https://api.ui.com');
    setParsedConsoleId(consoleId);

    await testConnection(manualUrl || 'https://api.ui.com');
  };

  const testConnection = async (controllerUrl) => {
    if (!controllerUrl) {
      setError('No UniFi URL configured');
      setConnectionStatus({ success: false, error: 'No UniFi URL configured' });
      return [];
    }

    if (!apiKey) {
      setError('No UniFi API key provided');
      setConnectionStatus({ success: false, error: 'No API key provided' });
      return [];
    }

    try {
      setLoading(true);
      setError(null);

      const result = await unifiApi.testConnection(controllerUrl, apiKey);
      setConnectionStatus(result);

      if (result.success) {
        const sites = await loadSites(controllerUrl);
        return sites;
      }
      return [];
    } catch (err) {
      console.error('Connection test failed:', err);
      setError(err.message);
      setConnectionStatus({ success: false, error: err.message });
      return [];
    } finally {
      setLoading(false);
    }
  };

  const loadSites = async (controllerUrl) => {
    try {
      setLoading(true);
      setError(null);

      console.log('Loading sites from:', controllerUrl);
      const response = await unifiApi.fetchSites(controllerUrl, apiKey);
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

      // If we have a parsed console ID from the project URL, filter to only show that site
      let sitesToDisplay = normalizedSites;
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
          // Only show the matching site, not all 17 sites
          sitesToDisplay = [matchingSite];
        } else {
          console.log('No matching site found for console ID:', parsedConsoleId);
          console.log('Available hostSiteIds:', normalizedSites.map((site) => site.hostSiteId));
        }
      }

      setSites(sitesToDisplay);

      if (sitesToDisplay.length === 0) {
        console.warn('No site entries were derived from host data');
        return sitesToDisplay;
      }

      if (defaultSite) {
        setSelectedSite(defaultSite.hostSiteId);
        await loadSiteData(defaultSite.hostSiteId, controllerUrl, defaultSite);
      }

      return sitesToDisplay;
    } catch (err) {
      console.error('Failed to load sites:', err);
      setError(err.message);
      return [];
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
      }, apiKey);
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

  const handleHardcodedClientTest = async () => {
    // Use the same proxy resolution logic as unifiApi.js
    const proxyUrl = process.env.REACT_APP_UNIFI_PROXY_URL ||
                    (process.env.REACT_APP_UNIFI_PROXY_ORIGIN
                      ? `${process.env.REACT_APP_UNIFI_PROXY_ORIGIN}/api/unifi-proxy`
                      : '/api/unifi-proxy');

    // Get the actual selected site data
    const selectedSiteData = sites.find(s => s.hostSiteId === selectedSite);
    const siteParts = selectedSite ? selectedSite.split(':') : [];
    const consoleIdPart = siteParts[0] || '';
    const siteIdPart = siteParts[1] || '';
    const wanIp = selectedSiteData?.ipAddress || '47.199.106.32'; // Fallback to Bill-Thomas WAN IP

    console.log('🔥 HARDCODED TEST - Site Data Being Used:', {
      siteName: selectedSiteData?.siteName || 'Unknown',
      fullHostSiteId: selectedSite,
      consoleIdPart,
      siteIdPart,
      wanIp: wanIp,
      wanIpSource: selectedSiteData?.ipAddress ? 'from site data' : 'hardcoded fallback',
      location: selectedSiteData?.location,
      firmware: selectedSiteData?.firmware,
      fullSiteData: selectedSiteData
    });

    // Test endpoints with ALL possible variations
    // Based on UniFi API documentation:
    // - Site Manager API: https://api.ui.com/v1/* (for hosts, sites, devices)
    // - Network API: runs on controller, path /v1/sites/{siteId}/clients
    // - Network API via proxy: /proxy/network/integration/v1/sites/{siteId}/clients
    // - Console-specific proxy: /v1/consoles/{consoleId}/proxy/network/...
    const testEndpoints = [
      // ===== Site Manager API path (v1) via api.ui.com =====
      { direct: false, path: '/v1/clients', label: 'Site Manager API - /v1/clients (no site)' },
      { direct: false, path: `/v1/sites/${siteIdPart}/clients`, label: `Site Manager API - /v1/sites/${siteIdPart}/clients` },

      // ===== Network API proxy path via api.ui.com - Standard format =====
      { direct: false, path: '/proxy/network/integration/v1/clients', label: 'Network API Proxy - No site filter' },
      { direct: false, path: `/proxy/network/integration/v1/sites/${siteIdPart}/clients`, label: `Network API Proxy - Site suffix: ${siteIdPart}` },
      { direct: false, path: '/proxy/network/integration/v1/sites/default/clients', label: 'Network API Proxy - Default site' },

      // ===== Network API via console-specific proxy path =====
      { direct: false, path: `/v1/consoles/${selectedSite}/proxy/network/integration/v1/clients`, label: `Console Proxy - Full hostSiteId path` },
      { direct: false, path: `/v1/consoles/${consoleIdPart}/proxy/network/integration/v1/clients`, label: `Console Proxy - Console ID only` },
      { direct: false, path: `/v1/consoles/${selectedSite}/proxy/network/integration/v1/sites/${siteIdPart}/clients`, label: `Console Proxy - With site ID` },
    ];

    const results = {};

    try {
      setLoading(true);
      setHardcodedTestResult(null);
      setError(null);

      for (const endpointConfig of testEndpoints) {
        const isDirect = endpointConfig.direct;
        const path = endpointConfig.path;
        const label = endpointConfig.label;

        // Construct the full URL
        const fullUrl = isDirect ? `https://${wanIp}${path}` : path;
        const displayKey = `${label}|||${fullUrl}`; // Use label + URL as key

        console.log('🔥 HARDCODED TEST:', label);
        console.log('   Full URL:', isDirect ? fullUrl : `https://api.ui.com${fullUrl}`);

        try {
          let response, data;

          if (isDirect) {
            // For direct calls to WAN IP, we still go through our proxy to handle CORS/SSL
            // But we tell our proxy to call the full URL directly
            response = await fetch(proxyUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                endpoint: fullUrl,
                method: 'GET',
                directUrl: true  // Signal to proxy this is a full URL
              })
            });
          } else {
            // Normal api.ui.com proxy call
            response = await fetch(proxyUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                endpoint: path,
                method: 'GET'
              })
            });
          }

          data = await response.json();

          results[displayKey] = {
            status: response.status,
            success: response.ok,
            data: data,
            recordCount: Array.isArray(data?.data) ? data.data.length : 0,
            isDirect,
            label,
            fullUrl: isDirect ? fullUrl : `https://api.ui.com${path}`
          };

          console.log('✅ RESULT:', response.status, data);
        } catch (err) {
          results[displayKey] = {
            status: 'error',
            success: false,
            error: err.message,
            isDirect,
            label,
            fullUrl: isDirect ? fullUrl : `https://api.ui.com${path}`
          };
          console.log('❌ ERROR:', err.message);
        }
      }

      setHardcodedTestResult(results);
    } catch (err) {
      console.error('Hardcoded test error:', err);
      setError(`Hardcoded test failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const testControllerConnection = async () => {
    setLoading(true);
    setConnectionTestResult(null);
    setError(null);

    const baseUrl = controllerHostname
      ? controllerHostname.startsWith('http') ? controllerHostname : `https://${controllerHostname}`
      : localControllerIp.startsWith('http') ? localControllerIp : `https://${localControllerIp}`;

    if (!baseUrl || baseUrl === 'https://') {
      setError('Please enter a controller IP or hostname');
      setLoading(false);
      return;
    }

    try {
      // Use the existing unifi-proxy endpoint with a simple test path
      // Add port 8443 if not specified (UniFi controllers use 8443 for HTTPS API)
      const port = baseUrl.includes(':') ? '' : ':8443';
      // Use a standard UniFi endpoint - get default site stats
      const testEndpoint = `${baseUrl}${port}/api/s/default/stat/health`;

      console.log('Testing controller connection to:', baseUrl);

      // Use the same proxy resolution logic as unifiApi.js
      const proxyUrl = process.env.REACT_APP_UNIFI_PROXY_URL ||
                      (process.env.REACT_APP_UNIFI_PROXY_ORIGIN
                        ? `${process.env.REACT_APP_UNIFI_PROXY_ORIGIN}/api/unifi-proxy`
                        : '/api/unifi-proxy');

      console.log('Using proxy URL:', proxyUrl);

      const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: testEndpoint,
          method: 'GET',
          directUrl: true,  // Tell proxy this is a direct URL
          networkApiKey: localNetworkApiKey || 'test-api-key'  // Use test key if not provided
        })
      });

      // Check if the response is successful
      if (response.ok) {
        const data = await response.json();
        setConnectionTestResult({
          success: true,
          message: 'Controller is reachable and responding',
          statusCode: response.status,
          data: data
        });
        console.log('✅ Controller connection successful');

        // Auto-populate the IP field if hostname was used and successful
        if (controllerHostname && !localControllerIp) {
          setLocalControllerIp(controllerHostname);
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        setConnectionTestResult({
          success: false,
          error: errorData.error || `HTTP ${response.status}`,
          message: errorData.message || errorData.details || 'Connection failed',
          suggestion: errorData.hint || 'Check that the controller is accessible and the API key is correct',
          statusCode: response.status
        });
        console.error('❌ Controller connection failed:', errorData);
        setError(errorData.hint || errorData.error || 'Connection failed');
      }
    } catch (error) {
      console.error('Connection test error:', error);
      setConnectionTestResult({
        success: false,
        error: error.message,
        suggestion: 'Check your network connection and try again'
      });
      setError(`Connection error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLocalNetworkApiTest = async () => {
    if (!localControllerIp && !controllerHostname) {
      setError('Please enter the controller IP address or hostname');
      return;
    }
    if (!localNetworkApiKey) {
      setError('Please enter the Network API key');
      return;
    }

    // Use hostname if provided, otherwise use IP
    const controllerAddress = controllerHostname || localControllerIp;

    // Get site ID from selected site
    const siteParts = selectedSite ? selectedSite.split(':') : [];
    const siteIdPart = siteParts[1] || 'default';

    console.log('🌐 Testing LOCAL Network API (Direct from Browser):', {
      controllerAddress: controllerAddress,
      siteId: siteIdPart,
      hasApiKey: !!localNetworkApiKey
    });

    // UniFi Network API paths (UDM Pro format with /proxy/network prefix)
    const testEndpoints = [
      { path: `/proxy/network/integration/v1/sites/${siteIdPart}/clients`, label: 'Clients (Integration v1 API - RECOMMENDED)' },
      { path: `/proxy/network/api/s/${siteIdPart}/stat/sta`, label: 'Active Clients (Legacy API with proxy)' },
      { path: `/proxy/network/api/s/default/stat/sta`, label: 'Active Clients (Default Site with proxy)' },
      { path: `/api/s/${siteIdPart}/stat/sta`, label: 'Active Clients (Legacy API direct)' },
    ];

    const results = {};

    try {
      setLoading(true);
      setLocalApiTestResult(null);
      setError(null);

      for (const endpointConfig of testEndpoints) {
        // Determine if this is a local IP address
        const isLocalIP = controllerAddress.match(/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)/);
        const isLocalhost = controllerAddress.includes('localhost') || controllerAddress.includes('127.0.0.1');
        const isLocal = isLocalIP || isLocalhost;

        // Use proxy for mobile/remote access
        const proxyUrl = process.env.REACT_APP_UNIFI_PROXY_URL ||
                        (process.env.REACT_APP_UNIFI_PROXY_ORIGIN
                          ? `${process.env.REACT_APP_UNIFI_PROXY_ORIGIN}/api/unifi-proxy`
                          : '/api/unifi-proxy');

        // UDM Pro uses port 443 (standard HTTPS), older controllers may use 8443
        const protocol = controllerAddress.startsWith('http') ? '' : 'https://';
        const port = controllerAddress.includes(':') ? '' : '';  // No port needed for UDM Pro (uses 443)
        const fullUrl = `${protocol}${controllerAddress}${port}${endpointConfig.path}`;

        // For local IPs, we can either use the local proxy (if running) or the Vercel proxy
        // The Vercel proxy won't work for local IPs, so we need to handle this differently
        let response;

        if (isLocal) {
          // For local IPs, try the local proxy first (localhost:3001)
          // If that fails, show an error message
          console.log('Local IP detected, attempting local proxy:', fullUrl);

          try {
            // First check if local proxy is running
            const localProxyUrl = 'http://localhost:3001/proxy' + endpointConfig.path;
            const testResponse = await fetch('http://localhost:3001/health').catch(() => null);

            if (testResponse && testResponse.ok) {
              // Local proxy is running, use it
              console.log('Using local proxy at localhost:3001');
              response = await fetch(localProxyUrl, {
                method: 'GET',
                headers: {
                  'X-API-KEY': localNetworkApiKey,
                  'X-Controller-IP': controllerAddress
                }
              });
            } else {
              // Local proxy not running, provide instructions
              throw new Error('Local proxy not running. Run: node local-unifi-proxy.js');
            }
          } catch (localError) {
            // If local proxy fails, explain the issue
            results[endpointConfig.label] = {
              status: 0,
              success: false,
              error: `Cannot access local IP ${controllerAddress} from browser. ${localError.message}`,
              hint: 'For local IPs, run the local proxy: node local-unifi-proxy.js',
              path: endpointConfig.path,
              fullUrl
            };
            continue;
          }
        } else {
          // For WAN IPs/hostnames, use the Vercel proxy
          console.log('Testing via Vercel proxy:', endpointConfig.label, fullUrl);

          response = await fetch(proxyUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              endpoint: fullUrl,
              method: 'GET',
              directUrl: true,
              networkApiKey: localNetworkApiKey
            })
          });
        }

        try {
          const data = await response.json();

          results[endpointConfig.label] = {
            status: response.status,
            success: response.ok && !data.error,
            data: data,
            clientCount: Array.isArray(data?.data) ? data.data.length : 0,
            path: endpointConfig.path,
            fullUrl,
            error: data.error || data.message
          };

          console.log(`✅ ${endpointConfig.label}:`, response.status, `(${results[endpointConfig.label].clientCount} clients)`);
        } catch (err) {
          results[endpointConfig.label] = {
            status: 'error',
            success: false,
            error: err.message,
            path: endpointConfig.path,
            fullUrl,
            hint: 'Check that you are using the WAN IP or a publicly accessible IP, not a local 192.168.x.x address'
          };
          console.log(`❌ ${endpointConfig.label}:`, err.message);
        }
      }

      setLocalApiTestResult(results);
    } catch (err) {
      console.error('Local API test error:', err);
      setError(`Local API test failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchLocalClients = async () => {
    if (!localControllerIp && !controllerHostname) {
      setError('Please enter the controller IP address or hostname');
      return;
    }
    if (!localNetworkApiKey) {
      setError('Please enter the Network API key');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setClients([]);

      const controllerAddress = controllerHostname || localControllerIp;
      const controllerUrl = controllerAddress.startsWith('http')
        ? controllerAddress
        : `https://${controllerAddress}`;

      console.log('🔍 Fetching sites from local controller:', controllerUrl);

      // Step 1: Fetch sites to get site ID
      const sitesResponse = await unifiApi.fetchLocalSites(controllerUrl, localNetworkApiKey);
      console.log('Sites response:', sitesResponse);

      if (!sitesResponse.data || sitesResponse.data.length === 0) {
        setError('No sites found on this controller');
        return;
      }

      // Use first site
      const siteId = sitesResponse.data[0].id || sitesResponse.data[0].siteId;
      console.log('Using site ID:', siteId);

      // Step 2: Fetch clients for this site
      console.log('🔍 Fetching clients for site:', siteId);
      const clientsResponse = await unifiApi.fetchClients(siteId, controllerUrl, localNetworkApiKey);
      console.log('Clients response:', clientsResponse);

      setClients(clientsResponse.data || []);
      setLocalApiTestResult({
        success: true,
        siteId: siteId,
        siteName: sitesResponse.data[0].description || sitesResponse.data[0].name || siteId,
        totalClients: clientsResponse.total || clientsResponse.data?.length || 0,
        clients: clientsResponse.data || []
      });

      console.log(`✅ Successfully fetched ${clientsResponse.total || 0} clients`);
    } catch (error) {
      console.error('Error fetching local clients:', error);
      setError(`Failed to fetch clients: ${error.message}`);
      setLocalApiTestResult({
        success: false,
        error: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClientEndpointTest = async () => {
    if (!selectedSite) {
      setError('Please select a site first');
      return;
    }

    const url = useManualUrl ? manualUrl : selectedProject?.unifi_url;
    if (!url) {
      setError('No UniFi URL available');
      return;
    }

    try {
      setLoading(true);
      setClientTestResults(null);
      setError(null);

      console.log('Testing client endpoints for site:', selectedSite);

      // Call the test endpoints function
      const results = await unifiApi.testClientEndpoints(selectedSite, url, apiKey);

      console.log('Client endpoint test results:', results);
      setClientTestResults(results);

      // Check if any endpoint returned data
      const successfulEndpoints = Object.entries(results).filter(
        ([name, result]) => result.success && result.recordCount > 0
      );

      if (successfulEndpoints.length > 0) {
        console.log(`Found ${successfulEndpoints.length} working client endpoint(s)`);
      } else {
        console.log('No client endpoints returned data');
      }
    } catch (err) {
      console.error('Error testing client endpoints:', err);
      setError(`Failed to test client endpoints: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-24 space-y-6">
      {/* Page Title - No back button since we have bottom nav */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          UniFi Test
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Test UniFi API connection and discover client endpoints
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-300">Error</p>
              <p className="text-sm text-red-700 dark:text-red-400 mt-1 font-mono">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* LOCAL NETWORK API TESTING - Priority Section */}
      <div style={sectionStyles.card} className="p-6 border-2 border-green-500">
        <div className="flex items-center gap-2 mb-4">
          <Wifi className="w-5 h-5 text-green-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Local Network API - Client Data
          </h2>
          <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
            RECOMMENDED
          </span>
        </div>

        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg space-y-2">
          <p className="text-sm text-blue-800 dark:text-blue-300 font-semibold">
            📱 Mobile Access Instructions:
          </p>
          <ol className="text-xs text-blue-700 dark:text-blue-400 space-y-1 list-decimal list-inside">
            <li>Ensure you're connected to the same network as the UniFi controller</li>
            <li>Use the controller's LOCAL IP address (e.g., 192.168.1.1) - This only works from the local network</li>
            <li>Enter your Network API key from: Network Application → Settings → System → Integrations</li>
            <li>Click "Fetch Clients (Integration API)" to retrieve all client data</li>
          </ol>
          <div className="text-xs text-amber-700 dark:text-amber-400 mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded">
            <strong>Important:</strong> Local API keys only work when you're on the same network as the controller. The request routes through Vercel proxy to handle CORS and SSL certificates.
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Controller Local IP Address
            </label>
            <input
              type="text"
              value={localControllerIp}
              onChange={(e) => setLocalControllerIp(e.target.value)}
              placeholder="e.g., 192.168.1.1"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-green-500 focus:border-transparent
                       placeholder-gray-400 dark:placeholder-gray-500"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Enter your controller's local IP address (must be on the same network). For UDM Pro, this is typically 192.168.1.1.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Controller Hostname (Alternative to IP)
            </label>
            <input
              type="text"
              value={controllerHostname}
              onChange={(e) => setControllerHostname(e.target.value)}
              placeholder="e.g., unifi.local or controller.example.com"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-green-500 focus:border-transparent
                       placeholder-gray-400 dark:placeholder-gray-500"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Use hostname if available (may work better than IP for some controllers)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Network API Key
            </label>
            <input
              type="password"
              value={localNetworkApiKey}
              onChange={(e) => setLocalNetworkApiKey(e.target.value)}
              placeholder="Enter Network API key"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-green-500 focus:border-transparent
                       placeholder-gray-400 dark:placeholder-gray-500"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Generated from: Network Application → Settings → Control Plane → Integrations
            </p>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              variant="secondary"
              onClick={testControllerConnection}
              disabled={loading || (!localControllerIp && !controllerHostname)}
              icon={Wifi}
            >
              Test Connection First
            </Button>
            <Button
              variant="success"
              onClick={handleFetchLocalClients}
              disabled={loading || (!localControllerIp && !controllerHostname) || !localNetworkApiKey}
              icon={Users}
            >
              Fetch Clients (Integration API)
            </Button>
            <Button
              variant="primary"
              onClick={handleLocalNetworkApiTest}
              disabled={loading || (!localControllerIp && !controllerHostname) || !localNetworkApiKey}
              icon={Activity}
            >
              Get Client Data
            </Button>
          </div>
        </div>

        {/* Connection Test Result */}
        {connectionTestResult && (
          <div className={`mt-4 p-3 rounded-lg border ${
            connectionTestResult.success
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center gap-2">
              {connectionTestResult.success ? (
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
              )}
              <span className={`text-sm font-medium ${
                connectionTestResult.success
                  ? 'text-green-800 dark:text-green-300'
                  : 'text-red-800 dark:text-red-300'
              }`}>
                {connectionTestResult.success ? 'Controller Connected' : 'Connection Failed'}
              </span>
            </div>
            {connectionTestResult.message && (
              <p className="text-xs mt-1 text-gray-600 dark:text-gray-400">
                {connectionTestResult.message}
              </p>
            )}
            {connectionTestResult.suggestion && (
              <p className="text-xs mt-1 text-amber-600 dark:text-amber-400">
                💡 {connectionTestResult.suggestion}
              </p>
            )}
            {connectionTestResult.statusCode && (
              <p className="text-xs mt-1 text-gray-500 dark:text-gray-500">
                Status: {connectionTestResult.statusCode} {connectionTestResult.statusMessage}
              </p>
            )}
          </div>
        )}

        {/* Local API Test Results */}
        {localApiTestResult && (
          <div className="mt-6 space-y-3">
            <h3 className="font-medium text-sm text-gray-900 dark:text-white">
              Local Network API Results:
            </h3>
            {Object.entries(localApiTestResult).map(([label, result]) => (
              <div key={label} className={`p-4 rounded-lg border ${
                result.success && result.clientCount > 0
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : result.success
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="font-medium text-sm text-gray-900 dark:text-white">{label}</p>
                    <p className="text-xs font-mono text-gray-600 dark:text-gray-400 mt-1">{result.path}</p>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded font-medium ${
                    result.success && result.clientCount > 0
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                      : result.success
                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                  }`}>
                    {result.status}
                  </span>
                </div>

                {result.success && result.clientCount > 0 && (
                  <div className="text-sm font-medium text-green-600 dark:text-green-400">
                    ✅ Found {result.clientCount} clients!
                  </div>
                )}

                {result.error && (
                  <div className="mt-2">
                    <div className="text-xs text-red-600 dark:text-red-400">
                      Error: {result.error}
                    </div>
                    {result.hint && (
                      <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        💡 {result.hint}
                      </div>
                    )}
                  </div>
                )}

                {result.data && (
                  <details className="mt-3">
                    <summary className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer font-medium">
                      View Client Data
                    </summary>
                    <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-3 rounded mt-2 overflow-auto max-h-60">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cloud API Configuration */}
      <div style={sectionStyles.card} className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-5 h-5 text-violet-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            UniFi API Configuration
          </h2>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              UniFi API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your UniFi API key"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-violet-500 focus:border-transparent
                       placeholder-gray-400 dark:placeholder-gray-500"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Get your API key from Network > Control Plane > Integrations
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              UniFi Console URL (optional)
            </label>
            <input
              type="text"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://api.ui.com"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                       focus:ring-2 focus:ring-violet-500 focus:border-transparent
                       placeholder-gray-400 dark:placeholder-gray-500"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Leave as https://api.ui.com for cloud-hosted controllers
            </p>
          </div>
          
          <Button
            variant="primary"
            onClick={handleManualTest}
            disabled={loading || !apiKey}
            icon={Wifi}
          >
            Connect to UniFi
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
      <div style={sectionStyles.card} className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen className="w-5 h-5 text-violet-600" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Or Select From Projects
          </h2>
        </div>

        {loading && <p className="text-sm text-gray-500">Loading projects...</p>}

        {!loading && projects.length === 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            No projects found in database. Check browser console for details.
          </p>
        )}

        {!loading && projects.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Choose a project to test ({projects.length} available)
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
            
            {selectedProject && (
              <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
                {selectedProject.unifi_url ? (
                  <>
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
                  </>
                ) : (
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    ⚠️ This project has no UniFi URL. Please enter one in the field above and click "Test Connection".
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Debug Info - Collapsible */}
      {sites.length > 0 && (
        <div style={sectionStyles.card} className="p-6">
          <div
            className="flex items-center gap-2 mb-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-2 rounded -m-2"
            onClick={() => setShowDebugInfo(!showDebugInfo)}
          >
            <AlertCircle className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Debug Info
            </h2>
            <span className="text-xs text-gray-500 ml-auto">
              {showDebugInfo ? '▼ Click to collapse' : '▶ Click to expand'}
            </span>
          </div>
          {showDebugInfo && (
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
          )}
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
              {connectionStatus.error && (
                <p className="text-sm mt-1 text-red-700 dark:text-red-400 font-mono">
                  Error: {connectionStatus.error}
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

      {/* Sites - Collapsible */}
      {sites.length > 0 && (
        <div style={sectionStyles.card} className="p-6">
          <div
            className="flex items-center gap-2 mb-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-2 rounded -m-2"
            onClick={() => setShowSitesSection(!showSitesSection)}
          >
            <Globe className="w-5 h-5 text-violet-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {sites.length === 1 ? 'Site Connected' : `Sites (${sites.length})`}
            </h2>
            <span className="text-xs text-gray-500 ml-auto">
              {showSitesSection ? '▼ Click to collapse' : '▶ Click to expand'}
            </span>
          </div>
          {showSitesSection && (
          <>
          {/* Only show selector if multiple sites */}
          {sites.length > 1 && (
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
          )}

          {/* Simplified view for single site */}
          {sites.length === 1 ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {sites[0].siteLabel || sites[0].siteName || sites[0].hostName || 'Site'}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Connected and ready for client discovery
                  </p>
                </div>
              </div>
            </div>
          ) : (
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
          )}
          </>
          )}
        </div>
      )}

      {/* Devices - Collapsible */}
      {selectedSite && devices.length > 0 && (
        <div style={sectionStyles.card} className="p-6">
          <div
            className="flex items-center gap-2 mb-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-2 rounded -m-2"
            onClick={() => setShowDevicesSection(!showDevicesSection)}
          >
            <Server className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Devices ({devices.length})
            </h2>
            <span className="text-xs text-gray-500 ml-auto">
              {showDevicesSection ? '▼ Click to collapse' : '▶ Click to expand'}
            </span>
          </div>
          {showDevicesSection && (
          <>

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
          </>
          )}
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

      {/* Important Notice */}
      {selectedSite && (
        <div style={sectionStyles.card} className="p-6">
          <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-blue-800 dark:text-blue-300">Network API Discovery</p>
              <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                Testing both Site Manager API (cloud) and Network API (via /proxy/network/ path).
                The Network API runs on your controller and may provide client data.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Client Endpoint Testing Section */}
      {selectedSite && (
        <div style={sectionStyles.card} className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Client Endpoint Discovery
            </h2>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Test different UniFi API endpoints to find which one returns client data
            </p>

            <div className="flex gap-2 flex-wrap">
              <Button
                variant="primary"
                onClick={() => {
                  console.log('🔬 Testing device port_table extraction...');
                  const extractedClients = unifiApi.extractClientsFromDevices(devices);
                  console.log('📊 Extraction complete:', extractedClients);
                  alert(`Found ${extractedClients.length} clients in device data. Check console for details.`);
                }}
                disabled={loading || devices.length === 0}
                icon={Users}
              >
                🔬 Extract Clients from Devices
              </Button>
              <Button
                variant="primary"
                onClick={() => handleHardcodedClientTest()}
                disabled={loading}
                icon={Activity}
              >
                🔥 Test API Endpoints
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleClientEndpointTest()}
                disabled={loading}
                icon={RefreshCw}
              >
                Test All Variations
              </Button>

              {clientTestResults && (
                <Button
                  variant="secondary"
                  onClick={() => setClientTestResults(null)}
                >
                  Clear Results
                </Button>
              )}
            </div>

            {/* Hardcoded Test Results */}
            {hardcodedTestResult && (
              <div className="space-y-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <h3 className="font-medium text-sm text-yellow-800 dark:text-yellow-300">
                  🔥 Hardcoded Test Results (Bill-Thomas):
                </h3>
                <div className="space-y-2">
                  {Object.entries(hardcodedTestResult).map(([key, result]) => {
                    const displayLabel = result.label || (result.isDirect ? '🌐 DIRECT to WAN IP' : '☁️ Via api.ui.com');
                    const fullUrl = result.fullUrl;

                    return (
                    <div key={key} className="bg-white dark:bg-gray-800 rounded p-3 border border-gray-200 dark:border-gray-700">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 space-y-1">
                          <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">{displayLabel}</div>
                          <div className="text-xs font-mono text-gray-900 dark:text-white break-all font-semibold">{fullUrl}</div>
                        </div>
                        <div className="ml-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            result.success && result.recordCount > 0
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : result.success
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                          }`}>
                            {result.status}
                          </span>
                        </div>
                      </div>
                      {result.recordCount > 0 && (
                        <div className="text-sm font-medium text-green-600 dark:text-green-400">
                          ✅ Found {result.recordCount} clients!
                        </div>
                      )}
                      {result.success && result.recordCount === 0 && (
                        <div className="text-xs text-gray-500">Empty response</div>
                      )}
                      {result.error && (
                        <div className="text-xs text-red-600 dark:text-red-400">{result.error}</div>
                      )}
                      {result.data && (
                        <details className="mt-2">
                          <summary className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer">View Raw Data</summary>
                          <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded mt-1 overflow-auto max-h-40">
                            {JSON.stringify(result.data, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Test Results */}
            {clientTestResults && (
              <div className="space-y-2">
                <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 mt-4">
                  Test Results:
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">Endpoint</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">Status</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">Records</th>
                        <th className="text-left py-2 px-3 font-medium text-gray-700 dark:text-gray-300">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(clientTestResults).map(([name, result]) => (
                        <tr key={name} className="border-b border-gray-100 dark:border-gray-800">
                          <td className="py-2 px-3">
                            <div>
                              <div className="font-medium text-gray-900 dark:text-white">{name}</div>
                              <div className="text-xs text-gray-500 font-mono">{result.path}</div>
                            </div>
                          </td>
                          <td className="py-2 px-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              result.success
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : result.status === 404
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            }`}>
                              {result.status === 'Network Error' ? 'Error' : result.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-gray-600 dark:text-gray-400">
                            {result.recordCount !== undefined ? result.recordCount : '-'}
                          </td>
                          <td className="py-2 px-3">
                            {result.success && result.recordCount > 0 && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setSelectedClientEndpoint(result.path);
                                  setClientEndpointData(result.data);
                                  setShowClientData(true);
                                }}
                              >
                                View Data
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary */}
                {Object.values(clientTestResults).some(r => r.success && r.recordCount > 0) && (
                  <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <p className="text-sm font-medium text-green-800 dark:text-green-300">
                      ✓ Found working endpoint(s) with client data!
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-400 mt-1">
                      Use the "View Data" button to inspect the response structure
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Client Data Viewer Modal */}
            {showClientData && clientEndpointData && (
              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900 dark:text-white">
                    Client Data from: {selectedClientEndpoint}
                  </h3>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setShowClientData(false);
                      setClientEndpointData(null);
                    }}
                  >
                    Close
                  </Button>
                </div>

                {/* Parse and display clients */}
                <div className="space-y-2">
                  {(() => {
                    const parsedClients = unifiApi.parseClientData(clientEndpointData);
                    return parsedClients.slice(0, 5).map((client, idx) => (
                      <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Hostname:</span>{' '}
                            <span className="text-gray-900 dark:text-white">{client.hostname || 'Unknown'}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">MAC:</span>{' '}
                            <span className="font-mono text-xs">{client.mac || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">IP:</span>{' '}
                            <span className="font-mono text-xs">{client.ip || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Switch/Port:</span>{' '}
                            <span className="text-gray-900 dark:text-white">
                              {client.switch_name || client.switch_mac || 'N/A'} / {client.switch_port || 'N/A'}
                            </span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">VLAN:</span>{' '}
                            <span className="text-gray-900 dark:text-white">{client.vlan || 'Default'}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Type:</span>{' '}
                            <span className={`px-1.5 py-0.5 text-xs rounded ${
                              client.is_wired
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            }`}>
                              {client.is_wired ? '🔌 Wired' : '📶 Wireless'}
                            </span>
                          </div>
                        </div>

                        {/* Show raw JSON for first client */}
                        {idx === 0 && (
                          <details className="mt-3">
                            <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
                              View Raw JSON
                            </summary>
                            <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded text-xs overflow-auto max-h-60">
                              {JSON.stringify(client._raw, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ));
                  })()}

                  {unifiApi.parseClientData(clientEndpointData).length > 5 && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                      ... and {unifiApi.parseClientData(clientEndpointData).length - 5} more clients
                    </p>
                  )}
                </div>
              </div>
            )}
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
