import React, { useState, useEffect } from 'react';
import { Wifi, Server, Smartphone, Search, RefreshCw, ArrowRight, CheckCircle, Database, AlertCircle, Trash2 } from 'lucide-react';

import { supabase } from '../lib/supabase';
import { equipmentService } from '../services/equipmentService'; // Ensure correct path

const UnifiClientImporter = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [clients, setClients] = useState([]);
  const [filterText, setFilterText] = useState('');

  // Projects fetch
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(localStorage.getItem('unifi_import_project_id') || '');

  useEffect(() => {
    const fetchProjects = async () => {
      const { data, error } = await supabase.from('projects').select('id, name').order('name');
      if (data) setProjects(data);
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProjectId) localStorage.setItem('unifi_import_project_id', selectedProjectId);
  }, [selectedProjectId]);

  // Selection & Assignment State
  const [selectedClients, setSelectedClients] = useState(new Set());
  const [assigning, setAssigning] = useState(false);

  // Configuration State
  const [controllerIp, setControllerIp] = useState(localStorage.getItem('unifi_controller_ip') || '192.168.1.1');
  const [apiKey, setApiKey] = useState(localStorage.getItem('unifi_api_key') || 'ZsfR-ssJQqIOnQjL5d66hZiNdcMyCPGC');

  // Persist settings
  useEffect(() => {
    localStorage.setItem('unifi_controller_ip', controllerIp);
    localStorage.setItem('unifi_api_key', apiKey);
  }, [controllerIp, apiKey]);

  // --- SCAN LOGIC (Integration API / Method 1) ---
  const handleScan = async () => {
    setLoading(true);
    setError(null);
    setClients([]);
    setSelectedClients(new Set()); // Reset selection

    try {
      const baseUrl = `https://${controllerIp}`;
      console.log(`[UniFi Import] Starting Scan (Integration API)...`);

      // 1. Fetch Sites
      const sitesPayload = {
        endpoint: `${baseUrl}/proxy/network/integration/v1/sites`,
        directUrl: true,
        networkApiKey: apiKey,
        method: 'GET'
      };

      const sitesRes = await fetch('/api/unifi-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sitesPayload)
      });

      if (!sitesRes.ok) throw new Error(`Sites fetch failed: ${sitesRes.statusText}`);
      const sitesData = await sitesRes.json();
      const sites = sitesData.data || sitesData || [];
      if (sites.length === 0) throw new Error('No sites found');

      const siteId = sites[0].id;
      console.log(`[UniFi Import] Using Site ID: ${siteId}`);

      // 2. Fetch Clients
      const clientsPayload = {
        endpoint: `${baseUrl}/proxy/network/integration/v1/sites/${siteId}/clients`,
        directUrl: true,
        networkApiKey: apiKey,
        method: 'GET'
      };
      const clientsRes = await fetch('/api/unifi-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientsPayload)
      });
      if (!clientsRes.ok) throw new Error('Clients fetch failed');
      const rawClients = (await clientsRes.json()).data || [];

      // 3. Fetch Devices (for Switch Name Enrichment)
      let deviceMap = new Map();
      try {
        const devPayload = {
          endpoint: `${baseUrl}/proxy/network/integration/v1/sites/${siteId}/devices`,
          directUrl: true,
          networkApiKey: apiKey,
          method: 'GET'
        };
        const devRes = await fetch('/api/unifi-proxy', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(devPayload)
        });
        if (devRes.ok) {
          const devs = (await devRes.json()).data || [];
          devs.forEach(d => deviceMap.set(d.id, d));
        }
      } catch (e) {
        console.warn('Device enrichment failed', e);
      }

      // 4. Transform & Enrich
      const processed = rawClients.map(c => {
        const uplinkDev = deviceMap.get(c.uplinkDeviceId);
        return {
          id: c.id,
          mac: c.macAddress,
          ip: c.ipAddress,
          name: c.name || c.hostname || c.macAddress,
          type: c.type, // 'WIRED' or 'WIRELESS'
          uplink_device_name: uplinkDev ? (uplinkDev.name || uplinkDev.model) : 'Unknown',
          uplink_device_mac: c.uplinkDeviceMac // Sometimes available
        };
      });

      setClients(processed);

    } catch (err) {
      console.error('[UniFi Import] Scan Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- SELECTION LOGIC ---
  const toggleSelect = (id) => {
    const newSet = new Set(selectedClients);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedClients(newSet);
  };

  const toggleAll = () => {
    if (selectedClients.size === filteredClients.length) {
      setSelectedClients(new Set());
    } else {
      const newSet = new Set();
      filteredClients.forEach(c => newSet.add(c.id));
      setSelectedClients(newSet);
    }
  };

  // --- DEEP SCAN LOGIC ---
  const [debugData, setDebugData] = useState(null);

  const handleDeepScan = async () => {
    if (clients.length === 0) {
      alert("Scan first to find clients!");
      return;
    }
    setLoading(true);
    try {
      const baseUrl = `https://${controllerIp}`;
      // Pick first 5 WIRED clients only
      const targets = clients.filter(c => c.type === 'WIRED').slice(0, 5);

      if (targets.length === 0) {
        alert("No WIRED clients found to deep scan!");
        setLoading(false);
        return;
      }

      console.log(`[UniFi Import] Deep Scanning ${targets.length} WIRED clients...`);

      // We need siteId from somewhere. 
      // We'll re-fetch sites quickly or store it.
      // For now, let's re-fetch site ID to be safe.
      const sitesPayload = {
        endpoint: `${baseUrl}/proxy/network/integration/v1/sites`,
        directUrl: true,
        networkApiKey: apiKey,
        method: 'GET'
      };
      const sitesRes = await fetch('/api/unifi-proxy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sitesPayload)
      });
      const sitesData = await sitesRes.json();
      const siteId = (sitesData.data || sitesData)[0].id;

      for (const client of targets) {
        const detailPayload = {
          endpoint: `${baseUrl}/proxy/network/integration/v1/sites/${siteId}/clients/${client.id}`,
          directUrl: true,
          networkApiKey: apiKey,
          method: 'GET'
        };
        const res = await fetch('/api/unifi-proxy', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(detailPayload)
        });
        if (res.ok) {
          const data = await res.json();
          const detailed = data.data || data;
          console.log('Deep Client Data:', detailed);
          if (!debugData) setDebugData(detailed); // Save first one to show
        }
      }
      alert("Deep Scan Complete. Check Console or Debug View below.");
    } catch (e) {
      console.error(e);
      alert("Deep Scan Failed: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // --- FILTERING ---
  const filteredClients = clients.filter(c => {
    const search = filterText.toLowerCase();
    return (
      c.name.toLowerCase().includes(search) ||
      c.ip?.includes(search) ||
      c.mac?.toLowerCase().includes(search) ||
      c.uplink_device_name?.toLowerCase().includes(search)
    );
  });

  // --- ASSIGNMENT (Placeholder for Project Link) ---
  const handleAssign = () => {
    const count = selectedClients.size;
    if (count === 0) return;
    alert(`Ready to assign ${count} clients to Project Equipment!\n\n(This is where we link to EquipmentManager)`);
    // Logic to open Project Assignment Modal would go here.
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white pb-20 overflow-hidden">

      {/* Header */}
      <div className="bg-white dark:bg-zinc-800 border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm z-10">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Database className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold">UniFi Client Import</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Scan network and assign clients to project equipment</p>
            </div>
          </div>

          <div className="flex gap-2 items-center">
            <div className="flex bg-gray-100 dark:bg-zinc-900 rounded-lg p-1 mr-2">
              <select
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                className="bg-transparent border-none text-sm font-medium outline-none px-2 w-48"
              >
                <option value="">Select Project...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="flex bg-gray-100 dark:bg-zinc-900 rounded-lg p-1 mr-2">
              <select
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                className="bg-transparent border-none text-sm font-medium outline-none px-2 w-48"
              >
                <option value="">Select Project...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div className="flex flex-col">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold ml-1">Controller IP</label>
              <input
                type="text"
                value={controllerIp}
                onChange={(e) => setControllerIp(e.target.value)}
                className="bg-gray-100 dark:bg-zinc-900 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm font-mono w-32"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold ml-1">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="bg-gray-100 dark:bg-zinc-900 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm font-mono w-32"
              />
            </div>
            <button
              onClick={handleScan}
              disabled={loading}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${loading
                ? 'bg-blue-100 text-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                }`}
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {loading ? 'Scanning...' : 'Scan'}
            </button>
            <button
              onClick={handleDeepScan}
              disabled={loading || clients.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium bg-gray-600 hover:bg-gray-700 text-white shadow-sm disabled:opacity-50"
            >
              <Search className="w-4 h-4" />
              Deep Scan (Ports)
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-7xl mx-auto space-y-4">

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3 text-red-700 dark:text-red-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Toolbar */}
          <div className="bg-white dark:bg-zinc-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex justify-between items-center sticky top-0 z-20">
            <div className="flex items-center gap-2 flex-1">
              <Search className="w-4 h-4 text-gray-400 ml-2" />
              <input
                type="text"
                placeholder="Filter by name, IP, MAC..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                className="bg-transparent border-none outline-none text-sm w-full p-1"
              />
            </div>
            {selectedClients.size > 0 && (
              <button
                onClick={handleAssign}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-right-2"
              >
                <CheckCircle className="w-4 h-4" />
                Assign {selectedClients.size} to Project
              </button>
            )}
          </div>

          {/* Client Table */}
          <div className="bg-white dark:bg-zinc-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-zinc-900/50 text-xs uppercase tracking-wider text-gray-500 font-semibold border-b border-gray-200 dark:border-gray-700">
                  <th className="p-3 w-10">
                    <input type="checkbox" onChange={toggleAll} checked={clients.length > 0 && selectedClients.size === filteredClients.length} className="rounded" />
                  </th>
                  <th className="p-3">Device Name</th>
                  <th className="p-3">IP Address</th>
                  <th className="p-3">MAC Address</th>
                  <th className="p-3">Connection</th>
                  <th className="p-3">Switch / AP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-gray-400 text-sm">
                      {clients.length === 0 ? 'Click "Scan" to find clients.' : 'No matching clients.'}
                    </td>
                  </tr>
                ) : (
                  filteredClients.map(client => (
                    <tr key={client.id} className={`group hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors ${selectedClients.has(client.id) ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedClients.has(client.id)}
                          onChange={() => toggleSelect(client.id)}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="p-3 font-medium text-sm text-gray-900 dark:text-gray-100">
                        {client.name}
                      </td>
                      <td className="p-3 text-sm font-mono text-gray-600 dark:text-gray-400">
                        {client.ip || '—'}
                      </td>
                      <td className="p-3 text-xs font-mono text-gray-400">
                        {client.mac}
                      </td>
                      <td className="p-3">
                        {client.type === 'WIRED' ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            <Server className="w-3 h-3" /> Wired
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            <Wifi className="w-3 h-3" /> WiFi
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-sm text-gray-600 dark:text-gray-300">
                        <div className="flex items-center gap-2">
                          <ArrowRight className="w-3 h-3 text-gray-300" />
                          <span>{client.uplink_device_name}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="text-center text-xs text-gray-400 p-4">
            Found {filteredClients.length} clients
          </div>

          {debugData && (
            <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-xs overflow-auto max-h-96 mt-4">
              <div className="font-bold border-b border-green-800 pb-2 mb-2">Detailed Client Data:</div>
              <pre>{JSON.stringify(debugData, null, 2)}</pre>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default UnifiClientImporter;
