import React, { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const UniFiClientSelector = ({
  equipment,
  equipmentId,
  projectId,
  wireDropId,
  onClientLinked,
  onAssign
}) => {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshStatus, setRefreshStatus] = useState(null);
  const [equipmentData, setEquipmentData] = useState(equipment || null);

  // Fetch equipment data if only ID is provided
  useEffect(() => {
    const fetchEquipment = async () => {
      if (equipment) {
        setEquipmentData(equipment);
        return;
      }
      if (!equipmentId) return;

      try {
        const { data, error } = await supabase
          .from('project_equipment')
          .select('id, name, mac_address, unifi_client_mac')
          .eq('id', equipmentId)
          .single();

        if (error) throw error;
        setEquipmentData(data);
      } catch (error) {
        console.error('Error fetching equipment:', error);
      }
    };

    fetchEquipment();
  }, [equipment, equipmentId]);

  const fetchUniFiClients = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('unifi-proxy', {
        body: {
          action: 'getClients',
          site: 'default'
        }
      });

      if (error) throw error;
      return data.clients || [];
    } catch (error) {
      console.error('UniFi fetch error:', error);
      throw error;
    }
  };

  const refreshClients = async () => {
    setLoading(true);
    setRefreshStatus(null);

    try {
      const data = await fetchUniFiClients();
      setClients(data);
      setLastRefresh(new Date());
      setRefreshStatus('success');

      // Auto-match by MAC address if equipment has one
      if (equipmentData?.mac_address) {
        const match = data.find(
          c => c.mac?.toLowerCase() === equipmentData.mac_address?.toLowerCase()
        );
        if (match) {
          setSelectedClient(match);
          await handleClientSelection(match);
        }
      }

      setTimeout(() => setRefreshStatus(null), 3000);
    } catch (error) {
      console.error('Failed to fetch UniFi clients:', error);
      setRefreshStatus('failed');
      setTimeout(() => setRefreshStatus(null), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleClientSelection = async (client) => {
    if (!client) return;

    setSelectedClient(client);

    const unifiData = {
      mac_address: client.mac,
      ip_address: client.ip,
      switch_mac: client.sw_mac,
      switch_port: client.sw_port,
      unifi_client_id: client._id,
      network_info: {
        hostname: client.hostname || client.name,
        oui: client.oui,
        network: client.network,
        vlan: client.vlan,
        last_seen: client.last_seen,
        uptime: client.uptime,
        signal: client.signal,
        rssi: client.rssi
      },
      unifi_synced_at: new Date().toISOString()
    };

    if (onClientLinked) {
      await onClientLinked(equipmentData?.id || equipmentId, unifiData);
    }
    if (onAssign) {
      await onAssign(equipmentData?.id || equipmentId, unifiData);
    }
  };

  useEffect(() => {
    // Only refresh clients once we have equipment data (or if no equipment is needed)
    if (equipmentData || (!equipment && !equipmentId)) {
      refreshClients();
    }
  }, [equipmentData]);

  const formatMac = (mac) => {
    if (!mac) return 'N/A';
    return mac.toUpperCase().match(/.{1,2}/g)?.join(':') || mac;
  };

  // Show loading while fetching equipment data
  if (equipmentId && !equipmentData) {
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading equipment data...</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">UniFi Network Connection</h4>
        <div className="flex items-center gap-2">
          {refreshStatus === 'success' && (
            <span className="flex items-center text-green-600 dark:text-green-400 text-sm">
              <CheckCircle className="w-4 h-4 mr-1" />
              Updated
            </span>
          )}
          {refreshStatus === 'failed' && (
            <span className="flex items-center text-red-600 dark:text-red-400 text-sm">
              <XCircle className="w-4 h-4 mr-1" />
              Failed
            </span>
          )}
          <button
            onClick={refreshClients}
            disabled={loading}
            className={`flex items-center gap-2 px-3 py-1 rounded-lg text-sm 
              ${loading
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              } transition`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>

      {lastRefresh && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Last updated: {lastRefresh.toLocaleTimeString()}
        </p>
      )}

      {selectedClient ? (
        <div className="space-y-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
            <h5 className="font-semibold mb-3 text-gray-700 dark:text-gray-300">Connected Device</h5>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Hostname:</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{selectedClient.hostname || selectedClient.name || 'Unknown'}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">IP Address:</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{selectedClient.ip}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">MAC Address:</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{formatMac(selectedClient.mac)}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Switch:</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{selectedClient.sw_name || formatMac(selectedClient.sw_mac)}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Port:</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{selectedClient.sw_port || 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Network:</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{selectedClient.network || 'Default'}</dd>
              </div>
            </dl>
            <button
              onClick={() => {
                setSelectedClient(null);
                if (onClientLinked) {
                  onClientLinked(equipmentData?.id || equipmentId, null);
                }
                if (onAssign) {
                  onAssign(equipmentData?.id || equipmentId, null);
                }
              }}
              className="mt-3 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              Change Device
            </button>
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select UniFi Client (Manual MAC Address Matching)
          </label>
          <select
            onChange={(e) => {
              const client = clients.find(c => c._id === e.target.value);
              if (client) handleClientSelection(client);
            }}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
            disabled={loading || clients.length === 0}
          >
            <option value="">
              {clients.length === 0 ? 'No clients available' : 'Select UniFi Client'}
            </option>
            {clients.map(client => (
              <option key={client._id} value={client._id}>
                {client.hostname || client.name || 'Unknown'} - {client.ip} ({formatMac(client.mac)})
              </option>
            ))}
          </select>
          {equipmentData?.mac_address && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Looking for MAC: {formatMac(equipmentData.mac_address)}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default UniFiClientSelector;
