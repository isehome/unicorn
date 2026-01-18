import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { RefreshCw, ChevronDown, ChevronRight, Wifi, WifiOff, Globe, Link2 } from 'lucide-react';
import { getSwitchConnectedClients } from '../../services/haClientService';

/**
 * RackBackView Component
 * Technical/network view showing the back of the rack with network information.
 * Displays equipment with network status, IP, MAC, and for switches shows connected clients.
 */
const RackBackView = ({
  rack,
  equipment = [],
  haClients = [],
  onLinkToHA,
  onRefresh
}) => {
  const [expandedEquipment, setExpandedEquipment] = useState({});
  const [connectedClients, setConnectedClients] = useState({});
  const [loadingClients, setLoadingClients] = useState({});
  const [syncing, setSyncing] = useState(false);

  // Sort equipment by rack position (descending - top of rack first)
  const sortedEquipment = [...equipment].sort((a, b) => {
    const posA = a.rack_position_u || 0;
    const posB = b.rack_position_u || 0;
    return posB - posA;
  });

  // Check if equipment is a switch based on name or type
  const isSwitch = useCallback((item) => {
    const name = item.name?.toLowerCase() || '';
    const model = item.global_part?.model?.toLowerCase() || '';
    const partName = item.global_part?.name?.toLowerCase() || '';

    return (
      name.includes('switch') ||
      model.includes('usw') ||
      model.includes('switch') ||
      partName.includes('switch')
    );
  }, []);

  // Fetch connected clients for a switch
  const fetchConnectedClients = useCallback(async (equipmentItem) => {
    const mac = equipmentItem.ha_client?.mac || equipmentItem.ha_client_mac;
    if (!mac || !rack?.project_id) return;

    setLoadingClients(prev => ({ ...prev, [equipmentItem.id]: true }));

    try {
      const clients = await getSwitchConnectedClients(rack.project_id, mac);
      setConnectedClients(prev => ({ ...prev, [equipmentItem.id]: clients }));
    } catch (error) {
      console.error('Failed to fetch connected clients:', error);
      setConnectedClients(prev => ({ ...prev, [equipmentItem.id]: [] }));
    } finally {
      setLoadingClients(prev => ({ ...prev, [equipmentItem.id]: false }));
    }
  }, [rack?.project_id]);

  // Toggle equipment expansion
  const toggleExpanded = useCallback((equipmentId, equipmentItem) => {
    setExpandedEquipment(prev => {
      const newExpanded = { ...prev, [equipmentId]: !prev[equipmentId] };

      // Fetch connected clients when expanding a switch
      if (newExpanded[equipmentId] && isSwitch(equipmentItem)) {
        fetchConnectedClients(equipmentItem);
      }

      return newExpanded;
    });
  }, [isSwitch, fetchConnectedClients]);

  // Handle sync/refresh
  const handleSync = async () => {
    if (!onRefresh) return;

    setSyncing(true);
    try {
      await onRefresh();
    } finally {
      setSyncing(false);
    }
  };

  // Format MAC address for display
  const formatMac = (mac) => {
    if (!mac) return 'N/A';
    return mac.toUpperCase().match(/.{1,2}/g)?.join(':') || mac.toUpperCase();
  };

  // Get display name for equipment
  const getEquipmentName = (item) => {
    return item.name || item.global_part?.name || item.description || 'Unknown Equipment';
  };

  // Get network status info from equipment
  const getNetworkInfo = (item) => {
    const haClient = item.ha_client;

    if (!haClient) {
      return {
        linked: false,
        isOnline: null,
        ip: null,
        mac: null,
        hostname: null
      };
    }

    return {
      linked: true,
      isOnline: haClient.is_online,
      ip: haClient.ip,
      mac: haClient.mac,
      hostname: haClient.hostname,
      switchName: haClient.switch_name,
      switchPort: haClient.switch_port,
      ssid: haClient.ssid,
      signal: haClient.signal,
      isWired: haClient.is_wired
    };
  };

  // Render status indicator dot
  const StatusDot = ({ status }) => {
    let bgColor = 'bg-zinc-400'; // Not linked

    if (status === true) {
      bgColor = 'bg-[#94AF32]'; // Online - brand green
    } else if (status === false) {
      bgColor = 'bg-red-500'; // Offline
    }

    return (
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${bgColor}`} />
    );
  };

  // Render the link dropdown for unlinked equipment
  const LinkDropdown = ({ equipmentItem }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedMac, setSelectedMac] = useState('');

    const handleLink = () => {
      if (selectedMac && onLinkToHA) {
        onLinkToHA(equipmentItem.id, selectedMac);
        setIsOpen(false);
        setSelectedMac('');
      }
    };

    // Filter out already linked clients
    const availableClients = haClients.filter(client => {
      const linkedMacs = equipment
        .map(e => e.ha_client_mac?.toLowerCase())
        .filter(Boolean);
      return !linkedMacs.includes(client.mac?.toLowerCase());
    });

    return (
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
        >
          <Link2 className="w-3.5 h-3.5" />
          Link to Network
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute z-20 top-full left-0 mt-1 w-80 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg">
            <div className="p-3">
              <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
                Select Network Client
              </label>
              <select
                value={selectedMac}
                onChange={(e) => setSelectedMac(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-[#94AF32] focus:border-transparent"
              >
                <option value="">Choose a device...</option>
                {availableClients.map(client => (
                  <option key={client.mac} value={client.mac}>
                    {client.hostname || 'Unknown'} - {client.ip || 'No IP'} ({formatMac(client.mac)})
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setSelectedMac('');
                  }}
                  className="px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLink}
                  disabled={!selectedMac}
                  className="px-3 py-1.5 text-sm bg-[#94AF32] text-white rounded-lg hover:bg-[#7d9429] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Link
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render connected clients table for switches
  const ConnectedClientsTable = ({ equipmentItem }) => {
    const clients = connectedClients[equipmentItem.id] || [];
    const isLoading = loadingClients[equipmentItem.id];

    if (isLoading) {
      return (
        <div className="mt-3 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
          <div className="flex items-center justify-center gap-2 text-zinc-500 dark:text-zinc-400">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading connected devices...</span>
          </div>
        </div>
      );
    }

    if (clients.length === 0) {
      return (
        <div className="mt-3 p-4 bg-zinc-50 dark:bg-zinc-900 rounded-lg">
          <p className="text-sm text-zinc-500 dark:text-zinc-400 text-center">
            No connected devices found
          </p>
        </div>
      );
    }

    return (
      <div className="mt-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Port</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Device</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">IP</th>
              <th className="px-3 py-2 text-left font-medium text-zinc-500 dark:text-zinc-400">Room</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client, index) => (
              <tr
                key={client.mac || index}
                className="border-b border-zinc-100 dark:border-zinc-800 last:border-0 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                  {client.switch_port ? `P${client.switch_port}` : '-'}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <StatusDot status={client.is_online} />
                    <span className="text-zinc-900 dark:text-zinc-100">
                      {client.hostname || client.equipment_name || 'Unknown'}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 font-mono text-xs">
                  {client.ip || '-'}
                </td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                  {client.room_name || client.location || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Render individual equipment block
  const EquipmentBlock = ({ item }) => {
    const networkInfo = getNetworkInfo(item);
    const uHeight = item.global_part?.u_height || 1;
    const isExpanded = expandedEquipment[item.id];
    const isSwitchDevice = isSwitch(item);
    const clientCount = connectedClients[item.id]?.length || 0;

    return (
      <div className="border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 overflow-hidden">
        {/* Equipment Header */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {getEquipmentName(item)}
              </h4>

              {networkInfo.linked ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                    <Globe className="w-3.5 h-3.5" />
                    <span className="font-mono">{networkInfo.ip || 'No IP'}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <StatusDot status={networkInfo.isOnline} />
                    <span className={networkInfo.isOnline ? 'text-[#94AF32]' : 'text-red-500'}>
                      {networkInfo.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </span>
                  <span className="text-zinc-500 dark:text-zinc-500 font-mono text-xs">
                    MAC: {formatMac(networkInfo.mac)}
                  </span>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-3">
                  <span className="flex items-center gap-1.5 text-zinc-400 text-sm">
                    <WifiOff className="w-3.5 h-3.5" />
                    Not Linked
                  </span>
                  <LinkDropdown equipmentItem={item} />
                </div>
              )}
            </div>

            {/* Expand button for switches */}
            {isSwitchDevice && networkInfo.linked && (
              <button
                onClick={() => toggleExpanded(item.id, item)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <span>Connected Devices</span>
                {clientCount > 0 && (
                  <span className="px-1.5 py-0.5 text-xs bg-zinc-100 dark:bg-zinc-700 rounded">
                    {clientCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Expanded section for switches */}
        {isExpanded && isSwitchDevice && networkInfo.linked && (
          <div className="px-4 pb-4">
            <ConnectedClientsTable equipmentItem={item} />
          </div>
        )}
      </div>
    );
  };

  if (!rack) {
    return (
      <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">
        No rack selected
      </div>
    );
  }

  return (
    <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {rack.name} - Network View
        </h3>
        {onRefresh && (
          <button
            onClick={handleSync}
            disabled={syncing}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              syncing
                ? 'bg-zinc-100 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
                : 'bg-[#94AF32] text-white hover:bg-[#7d9429]'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        )}
      </div>

      {/* Equipment List */}
      <div className="p-4 space-y-3">
        {sortedEquipment.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 dark:text-zinc-400">
            No equipment in this rack
          </div>
        ) : (
          sortedEquipment.map((item) => (
            <div key={item.id} className="flex gap-4">
              {/* U Position Label */}
              <div className="w-12 flex-shrink-0 pt-4">
                <span className="text-sm font-mono text-zinc-500 dark:text-zinc-400">
                  U{item.rack_position_u || '?'}
                </span>
              </div>

              {/* Equipment Block */}
              <div className="flex-1">
                <EquipmentBlock item={item} />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

RackBackView.propTypes = {
  rack: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    project_id: PropTypes.string,
    total_u: PropTypes.number
  }),
  equipment: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string,
      description: PropTypes.string,
      rack_position_u: PropTypes.number,
      ha_client_mac: PropTypes.string,
      ha_client: PropTypes.shape({
        mac: PropTypes.string,
        hostname: PropTypes.string,
        ip: PropTypes.string,
        is_online: PropTypes.bool,
        is_wired: PropTypes.bool,
        switch_name: PropTypes.string,
        switch_port: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        ssid: PropTypes.string,
        signal: PropTypes.number
      }),
      global_part: PropTypes.shape({
        id: PropTypes.string,
        name: PropTypes.string,
        manufacturer: PropTypes.string,
        model: PropTypes.string,
        u_height: PropTypes.number
      })
    })
  ),
  haClients: PropTypes.arrayOf(
    PropTypes.shape({
      mac: PropTypes.string.isRequired,
      hostname: PropTypes.string,
      ip: PropTypes.string,
      is_online: PropTypes.bool
    })
  ),
  onLinkToHA: PropTypes.func,
  onRefresh: PropTypes.func
};

export default RackBackView;
