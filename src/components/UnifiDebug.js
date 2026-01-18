import React, { useState } from 'react';
import { Wifi, Server, Shield } from 'lucide-react';

const UnifiDebug = () => {
    const [ip, setIp] = useState('192.168.1.1');
    const [apiKey, setApiKey] = useState('ZsfR-ssJQqIOnQjL5d66hZiNdcMyCPGC'); // Default for easier testing
    const [clients, setClients] = useState([]);
    const [logs, setLogs] = useState([]);
    const [status, setStatus] = useState('idle');

    const addLog = (msg, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [`[${timestamp}] [${type.toUpperCase()}] ${msg}`, ...prev]);
    };

    const runDirectTest = async () => {
        // Strategy A: Direct Browser Fetch (Expect CORS failure, but valid network attempt)
        setStatus('testing-direct');
        addLog('Starting Direct Browser Test (CORS Check)...', 'info');
        try {
            // We use no-cors mode just to see if we can reach the IP without network error
            await fetch(`https://${ip}/proxy/network/api/s/default/stat/sta`, {
                mode: 'no-cors',
                headers: { 'X-API-KEY': apiKey }
            });
            addLog('Direct fetch completed (Opaque Response). IP is reachable.', 'success');
        } catch (e) {
            addLog(`Direct fetch failed: ${e.message}. Is IP ${ip} reachable?`, 'error');
        }
        setStatus('idle');
    };

    const runProxyTest = async () => {
        // Strategy B: Via Local Proxy
        setStatus('testing-proxy');
        addLog('Starting Proxy Test via /api/unifi-proxy...', 'info');

        const payload = {
            endpoint: `https://${ip}/proxy/network/integration/v1/sites`,
            directUrl: true,
            networkApiKey: apiKey,
            method: 'GET'
        };

        try {
            const res = await fetch('/api/unifi-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                addLog(`Proxy Success! Status: ${res.status}`, 'success');
                addLog(JSON.stringify(data, null, 2), 'data');
            } else {
                const text = await res.text();
                addLog(`Proxy Failed. Status: ${res.status}`, 'error');
                addLog(`Response: ${text}`, 'error');
            }
        } catch (e) {
            addLog(`Proxy Fetch Error: ${e.message}`, 'error');
        }
        setStatus('idle');
    };

    const runLegacyProxyTest = async () => {
        // Strategy C: Via Local Proxy but using Legacy Endpoint (stat/sta)
        setStatus('testing-legacy');
        addLog('Starting Legacy Endpoint Test...', 'info');

        const payload = {
            endpoint: `https://${ip}/proxy/network/api/s/default/stat/sta`,
            directUrl: true,
            networkApiKey: apiKey,
            method: 'GET'
        };

        try {
            const res = await fetch('/api/unifi-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                addLog(`Legacy Success! Found ${data?.data?.length || 0} clients.`, 'success');
            } else {
                const text = await res.text();
                addLog(`Legacy Failed. Status: ${res.status} - ${text}`, 'error');
            }
        } catch (e) {
            addLog(`Legacy Error: ${e.message}`, 'error');
        }
        setStatus('idle');
    };

    const runModernClientsTest = async () => {
        // Strategy D: Via Local Proxy using Modern Integration Endpoint
        setStatus('testing-modern');
        addLog('Starting Modern Clients Test (integration/v1)...', 'info');

        const payload = {
            endpoint: `https://${ip}/proxy/network/integration/v1/sites/default/clients`,
            directUrl: true,
            networkApiKey: apiKey,
            method: 'GET'
        };

        try {
            const res = await fetch('/api/unifi-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                // API might return { data: [...] } or just [...]
                const clients = data.data || data;
                addLog(`Modern Success! Found ${clients?.length || 0} clients.`, 'success');
                if (clients?.length > 0) {
                    // Log first client for inspection
                    addLog(`Sample Client: ${JSON.stringify(clients[0], null, 2)}`, 'data');
                }
            } else {
                const text = await res.text();
                addLog(`Modern Failed. Status: ${res.status} - ${text}`, 'error');
            }
        } catch (e) {
            addLog(`Modern Error: ${e.message}`, 'error');
        }
        setStatus('idle');
    };

    const runSmartClientFetch = async () => {
        // Strategy E: Smart Fetch (Get Sites first, then use ID for Clients)
        setStatus('testing-smart');
        setClients([]); // Clear previous results
        addLog('Starting Smart Client Fetch (Sites -> ID -> Clients)...', 'info');

        // Step 1: Fetch Sites
        let siteId = '';
        try {
            const sitesPayload = {
                endpoint: `https://${ip}/proxy/network/integration/v1/sites`,
                directUrl: true,
                networkApiKey: apiKey,
                method: 'GET'
            };

            addLog('Step 1: Fetching sites list...', 'info');
            const res = await fetch('/api/unifi-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sitesPayload)
            });

            if (!res.ok) throw new Error(`Sites fetch failed: ${res.status}`);

            const data = await res.json();
            const sites = data.data || data;

            if (!sites || sites.length === 0) throw new Error('No sites found via API');

            siteId = sites[0].id; // Use first site
            const siteName = sites[0].name || sites[0].internalReference;
            addLog(`Step 1 Success. Found site: "${siteName}" (ID: ${siteId})`, 'success');

        } catch (e) {
            addLog(`Smart Fetch Aborted at Step 1: ${e.message}`, 'error');
            setStatus('idle');
            return;
        }

        // Step 2: Fetch Clients using ID
        try {
            const clientsPayload = {
                endpoint: `https://${ip}/proxy/network/integration/v1/sites/${siteId}/clients`,
                directUrl: true,
                networkApiKey: apiKey,
                method: 'GET'
            };

            addLog(`Step 2: Fetching clients for Site ID ${siteId}...`, 'info');
            const res = await fetch('/api/unifi-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(clientsPayload)
            });

            if (res.ok) {
                const data = await res.json();
                const fetchedClients = data.data || data;
                setClients(fetchedClients); // Save for table display
                addLog(`Smart Fetch COMPLETE! Found ${fetchedClients?.length || 0} clients.`, 'success');
            } else {
                const text = await res.text();
                addLog(`Step 2 Failed. Status: ${res.status} - ${text}`, 'error');
            }
        } catch (e) {
            addLog(`Smart Fetch Error at Step 2: ${e.message}`, 'error');
        }
        setStatus('idle');
    };

    const runFetchDevices = async () => {
        // Strategy F: Fetch Devices (to find switch info)
        setStatus('testing-devices');
        addLog('Starting Devices Fetch...', 'info');

        // Step 1: Fetch Sites (Reuse logic or assume we know)
        let siteId = '';
        try {
            const sitesPayload = {
                endpoint: `https://${ip}/proxy/network/integration/v1/sites`,
                directUrl: true,
                networkApiKey: apiKey,
                method: 'GET'
            };

            const res = await fetch('/api/unifi-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sitesPayload)
            });
            const data = await res.json();
            const sites = data.data || data;
            if (sites && sites.length > 0) siteId = sites[0].id;
            else throw new Error('No sites found');
        } catch (e) {
            addLog(`Failed to get site ID: ${e.message}`, 'error');
            setStatus('idle');
            return;
        }

        // Step 2: Fetch Devices
        try {
            const devicesPayload = {
                endpoint: `https://${ip}/proxy/network/integration/v1/sites/${siteId}/devices`,
                directUrl: true,
                networkApiKey: apiKey,
                method: 'GET'
            };

            addLog(`Fetching devices for Site ID ${siteId}...`, 'info');
            const res = await fetch('/api/unifi-proxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(devicesPayload)
            });

            if (res.ok) {
                const data = await res.json();
                const devices = data.data || data;
                addLog(`Devices Fetch Success! Found ${devices?.length || 0} devices.`, 'success');
                if (devices?.length > 0) {
                    // Find a switch if possible
                    const switchDev = devices.find(d => d.port_table || d.ports || d.switch_caps) || devices[0];
                    addLog(`Sample Device (${switchDev.name || switchDev.model}):`, 'data');
                    addLog(JSON.stringify(switchDev, null, 2), 'data');
                }
            } else {
                const text = await res.text();
                addLog(`Devices Failed. Status: ${res.status} - ${text}`, 'error');
            }
        } catch (e) {
            addLog(`Devices Error: ${e.message}`, 'error');
        }
        setStatus('idle');
    };

    return (
        <div className="px-2 sm:px-4 py-4 sm:py-6 w-full pb-24">
            <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Shield className="w-8 h-8 text-blue-600" />
                UniFi Connection Debugger
            </h1>

            <div className="grid gap-6 md:grid-cols-2 mb-8">
                {/* Configuration */}
                <div className="space-y-4 p-4 bg-white dark:bg-zinc-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 relative z-10">
                    <h2 className="font-semibold text-lg mb-2 text-gray-900 dark:text-gray-100">Target Controller</h2>

                    <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Controller IP</label>
                        <input
                            type="text"
                            value={ip}
                            onChange={e => setIp(e.target.value)}
                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded font-mono bg-white dark:bg-zinc-900 text-gray-900 dark:text-white"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Network API Key</label>
                        <input
                            type="text"
                            value={apiKey}
                            onChange={e => setApiKey(e.target.value)}
                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded font-mono text-xs bg-white dark:bg-zinc-900 text-gray-900 dark:text-white"
                        />
                    </div>

                    <div className="flex flex-col gap-2 pt-4">
                        <button
                            onClick={runDirectTest}
                            disabled={status !== 'idle'}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded"
                        >
                            <Wifi className="w-4 h-4" />
                            1. Check Reachability (Direct)
                        </button>

                        <button
                            onClick={runProxyTest}
                            disabled={status !== 'idle'}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
                        >
                            <Server className="w-4 h-4" />
                            2. Test Sites List (via Proxy)
                        </button>

                        <button
                            onClick={runSmartClientFetch}
                            disabled={status !== 'idle'}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-bold shadow-md transform hover:translate-y-[-1px]"
                        >
                            <Server className="w-4 h-4" />
                            3. Smart Client Fetch (Sites → Clients)
                        </button>

                        <button
                            onClick={runFetchDevices}
                            disabled={status !== 'idle'}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded font-bold shadow-md transform hover:translate-y-[-1px]"
                        >
                            <Server className="w-4 h-4" />
                            4. Fetch Devices (Find Switches)
                        </button>

                        <button
                            onClick={runLegacyProxyTest}
                            disabled={status !== 'idle'}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded opacity-50"
                        >
                            5. Legacy Endpoint (Deprecated)
                        </button>

                        <button
                            onClick={runModernClientsTest}
                            disabled={status !== 'idle'}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded opacity-50"
                        >
                            6. Basic Endpoint (Deprecated)
                        </button>
                    </div>
                </div>

                {/* Logs Console */}
                <div className="bg-black text-green-400 font-mono text-xs p-4 rounded-lg shadow overflow-auto h-[500px] flex flex-col pt-0 relative">
                    <div className="sticky top-0 bg-black/90 backdrop-blur border-b border-gray-800 p-2 mb-2 flex justify-between items-center -mx-4 px-4">
                        <span className="font-bold text-gray-400">LOG OUTPUT</span>
                        <button
                            onClick={() => setLogs([])}
                            className="text-xs text-red-400 hover:text-red-300 underline"
                        >
                            Clear Logs
                        </button>
                    </div>
                    <div className="flex flex-col-reverse">
                        {logs.length === 0 && <span className="text-gray-500 italic mt-4">Ready to test...</span>}
                        {logs.map((log, i) => (
                            <div key={i} className={`mb-1 break-words ${log.includes('[ERROR]') ? 'text-red-400' :
                                log.includes('[SUCCESS]') ? 'text-green-300 font-bold' :
                                    log.includes('[DATA]') ? 'text-blue-300 whitespace-pre-wrap' : ''
                                }`}>
                                {log}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Client List Table */}
            {clients.length > 0 && (
                <div className="mt-8 bg-white dark:bg-zinc-800 rounded-lg shadow overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-zinc-900">
                        <h2 className="font-bold text-lg">Fetched Clients ({clients.length})</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-zinc-700 dark:text-gray-400">
                                <tr>
                                    <th className="px-6 py-3">Device Name</th>
                                    <th className="px-6 py-3">IP Address</th>
                                    <th className="px-6 py-3">MAC Address</th>
                                    <th className="px-6 py-3">Connection</th>
                                    <th className="px-6 py-3">Uplink (Switch/AP)</th>
                                    <th className="px-6 py-3">Raw Data</th>
                                </tr>
                            </thead>
                            <tbody>
                                {clients.map((client, index) => {
                                    // Integration API Schema Mapping
                                    const name = client.name || client.hostname || 'Unknown';
                                    const ip = client.ipAddress || client.ip || 'No IP'; // Fixed: use ipAddress
                                    const mac = client.macAddress || client.mac;         // Fixed: use macAddress

                                    // Connection Status Mapping
                                    let isWired = false;
                                    if (client.type === 'WIRED') isWired = true;
                                    else if (client.wired === true) isWired = true;
                                    else if (client.is_wired === true) isWired = true;

                                    // Uplink info
                                    // Integration API uses 'uplinkDeviceId' often, but let's check screenshot keys if visible, 
                                    // otherwise stick to generic fallbacks.
                                    const uplinkName = client.uplinkDevice?.name || client.uplink_device_name || 'Unknown';
                                    const uplinkPort = client.uplinkPort || client.uplink_port_idx || '?';
                                    const uplinkStr = uplinkName !== 'Unknown' ? `${uplinkName} (Port ${uplinkPort})` : '-';

                                    return (
                                        <React.Fragment key={mac || index}>
                                            <tr className="bg-white border-b dark:bg-zinc-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-zinc-700">
                                                <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                                                    {name}
                                                </td>
                                                <td className="px-6 py-4 font-mono">{ip}</td>
                                                <td className="px-6 py-4 font-mono text-xs">{mac}</td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-1 rounded text-xs ${isWired ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                                                        {isWired ? 'Wired' : 'Wireless'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">{uplinkStr}</td>
                                                <td className="px-6 py-4">
                                                    <details>
                                                        <summary className="cursor-pointer text-blue-500 hover:underline text-xs">View Raw</summary>
                                                        <pre className="mt-2 text-[10px] bg-gray-100 dark:bg-black p-2 rounded max-w-xs overflow-auto">
                                                            {JSON.stringify(client, null, 2)}
                                                        </pre>
                                                    </details>
                                                </td>
                                            </tr>
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default UnifiDebug;
