/**
 * HANetworkClientSelector.jsx
 * Component for connecting project equipment to UniFi network clients via Home Assistant
 *
 * Uses the /api/ha/network-clients endpoint which fetches from HA's sensor.unifi_connection_status
 *
 * Features:
 * - Fetches live network clients from HA
 * - Shows wired vs wireless clients with connection details
 * - Auto-matches by MAC address if equipment already has one
 * - Persists connection to project_equipment table
 * - Updates: mac_address, IP, switch name, switch port
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  Cable,
  Wifi,
  Monitor,
  Search,
  Signal,
  Clock,
  Server,
  Network
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const HANetworkClientSelector = ({
  equipment,
  equipmentId,
  projectId,
  onClientLinked,
  onClose,
  palette = {},
  mode = 'light'
}) => {
  const [clients, setClients] = useState([]);
  const [devices, setDevices] = useState([]); // UniFi infrastructure (switches, APs, gateways)
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all'); // 'all', 'wired', 'wireless', 'devices'
  const [selectedClient, setSelectedClient] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Current equipment data
  const [equipmentData, setEquipmentData] = useState(equipment || null);

  // Styles based on mode
  const styles = useMemo(() => ({
    textPrimary: { color: mode === 'dark' ? '#F9FAFB' : '#18181B' },
    textSecondary: { color: mode === 'dark' ? '#A1A1AA' : '#4B5563' },
    subtleText: { color: mode === 'dark' ? '#71717A' : '#6B7280' },
    card: {
      backgroundColor: mode === 'dark' ? '#27272A' : '#FFFFFF',
      borderColor: mode === 'dark' ? '#3F3F46' : '#E5E7EB'
    },
    mutedCard: {
      backgroundColor: mode === 'dark' ? '#18181B' : '#F9FAFB',
      borderColor: mode === 'dark' ? '#3F3F46' : '#E5E7EB'
    }
  }), [mode]);

  // Fetch equipment data if only ID provided
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
          .select('id, name, mac_address, unifi_client_mac, unifi_last_ip, unifi_data')
          .eq('id', equipmentId)
          .single();

        if (error) throw error;
        setEquipmentData(data);
      } catch (err) {
        console.error('Error fetching equipment:', err);
        setError('Failed to load equipment data');
      }
    };

    fetchEquipment();
  }, [equipment, equipmentId]);

  // Fetch network clients from HA
  const fetchClients = async () => {
    if (!projectId) {
      setError('Project ID is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use Vercel production URL for API calls in development (local dev doesn't have serverless functions)
      const apiBase = window.location.hostname === 'localhost'
        ? 'https://unicorn-one.vercel.app'
        : '';
      const response = await fetch(`${apiBase}/api/ha/network-clients?project_id=${projectId}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `Failed to fetch clients: ${response.status}`);
      }

      setClients(result.clients || []);
      setDevices(result.devices || []);
      setLastRefresh(new Date());

      // Auto-match by MAC address if equipment has one - check both clients and devices
      const existingMac = equipmentData?.unifi_client_mac || equipmentData?.mac_address;
      if (existingMac) {
        // First check clients
        const clientMatch = result.clients.find(
          c => c.mac_address?.toLowerCase() === existingMac.toLowerCase()
        );
        if (clientMatch) {
          setSelectedClient(clientMatch);
        } else {
          // Then check devices
          const deviceMatch = result.devices?.find(
            d => d.mac_address?.toLowerCase() === existingMac.toLowerCase()
          );
          if (deviceMatch) {
            // Transform device to look like a client for consistency
            setSelectedClient({
              ...deviceMatch,
              name: deviceMatch.name,
              hostname: deviceMatch.name,
              is_wired: true,
              is_device: true, // Flag to identify it's a UniFi device
              connection_type: deviceMatch.category
            });
          }
        }
      }
    } catch (err) {
      console.error('Error fetching network clients:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    if (projectId && equipmentData) {
      fetchClients();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, equipmentData]);

  // Filter clients
  const filteredClients = useMemo(() => {
    if (filter === 'devices') return []; // Devices shown separately

    let filtered = clients;

    // Apply type filter
    if (filter === 'wired') {
      filtered = filtered.filter(c => c.is_wired);
    } else if (filter === 'wireless') {
      filtered = filtered.filter(c => !c.is_wired);
    }

    // Apply search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(c =>
        (c.name || '').toLowerCase().includes(search) ||
        (c.hostname || '').toLowerCase().includes(search) ||
        (c.mac_address || '').toLowerCase().includes(search) ||
        (c.ip_address || '').toLowerCase().includes(search)
      );
    }

    return filtered;
  }, [clients, filter, searchTerm]);

  // Filter devices
  const filteredDevices = useMemo(() => {
    if (filter !== 'devices') return [];

    let filtered = devices;

    // Apply search
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(d =>
        (d.name || '').toLowerCase().includes(search) ||
        (d.model || '').toLowerCase().includes(search) ||
        (d.mac_address || '').toLowerCase().includes(search) ||
        (d.ip_address || '').toLowerCase().includes(search)
      );
    }

    return filtered;
  }, [devices, filter, searchTerm]);

  // Format MAC address
  const formatMac = (mac) => {
    if (!mac) return 'N/A';
    return mac.toUpperCase();
  };

  // Handle device selection (UniFi infrastructure: switches, APs, gateways)
  const handleSelectDevice = async (device) => {
    if (!device || !equipmentData?.id) return;

    setSaving(true);
    setError(null);

    try {
      // Prepare update data for a UniFi device (not a client)
      const updateData = {
        unifi_client_mac: device.mac_address,
        unifi_last_ip: device.ip_address,
        unifi_last_seen: new Date().toISOString(),
        unifi_data: {
          hostname: device.name,
          is_wired: true,
          is_device: true, // Flag to identify it's a UniFi device, not a client
          connection_type: device.category,
          // Device info
          model: device.model,
          category: device.category,
          type: device.type,
          version: device.version,
          is_online: device.is_online,
          // Switch-specific
          ports_total: device.ports_total,
          ports_used: device.ports_used,
          // AP-specific
          num_sta: device.num_sta,
          // Timing
          uptime_seconds: device.uptime_seconds,
          uptime_formatted: device.uptime_formatted,
          // Source
          synced_from: 'home_assistant',
          synced_at: new Date().toISOString()
        },
        ha_client_mac: device.mac_address
      };

      // Update equipment in database
      const { error: updateError } = await supabase
        .from('project_equipment')
        .update(updateData)
        .eq('id', equipmentData.id);

      if (updateError) throw updateError;

      // Transform device for selectedClient display
      setSelectedClient({
        ...device,
        name: device.name,
        hostname: device.name,
        is_wired: true,
        is_device: true,
        connection_type: device.category
      });

      // Notify parent
      if (onClientLinked) {
        await onClientLinked(equipmentData.id, {
          ...updateData,
          device
        });
      }

      console.log('[HANetworkClientSelector] Equipment linked to UniFi device:', {
        equipment: equipmentData.name,
        device: device.name,
        mac: device.mac_address,
        category: device.category
      });

    } catch (err) {
      console.error('Error linking equipment to UniFi device:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Handle client selection and save
  const handleSelectClient = async (client) => {
    if (!client || !equipmentData?.id) return;

    setSaving(true);
    setError(null);

    try {
      // Prepare update data
      const updateData = {
        unifi_client_mac: client.mac_address,
        unifi_last_ip: client.ip_address,
        unifi_last_seen: new Date().toISOString(),
        unifi_data: {
          hostname: client.hostname || client.name,
          is_wired: client.is_wired,
          is_device: false, // It's a network client, not a device
          connection_type: client.connection_type,
          // Wired info
          switch_name: client.switch_name,
          switch_port: client.switch_port,
          switch_mac: client.switch_mac,
          // Wireless info
          ssid: client.ssid,
          ap_name: client.ap_name,
          ap_mac: client.ap_mac,
          wifi_signal: client.wifi_signal,
          // Timing
          uptime_seconds: client.uptime_seconds,
          uptime_formatted: client.uptime_formatted,
          // Source
          synced_from: 'home_assistant',
          synced_at: new Date().toISOString()
        },
        // Also update ha_client_mac for HA-specific tracking
        ha_client_mac: client.mac_address
      };

      // Update equipment in database
      const { error: updateError } = await supabase
        .from('project_equipment')
        .update(updateData)
        .eq('id', equipmentData.id);

      if (updateError) throw updateError;

      setSelectedClient(client);

      // Notify parent
      if (onClientLinked) {
        await onClientLinked(equipmentData.id, {
          ...updateData,
          client
        });
      }

      console.log('[HANetworkClientSelector] Equipment linked to network client:', {
        equipment: equipmentData.name,
        client: client.name,
        mac: client.mac_address
      });

    } catch (err) {
      console.error('Error linking equipment to network client:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Clear connection
  const handleClearConnection = async () => {
    if (!equipmentData?.id) return;

    setSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('project_equipment')
        .update({
          unifi_client_mac: null,
          unifi_last_ip: null,
          unifi_last_seen: null,
          unifi_data: null,
          ha_client_mac: null
        })
        .eq('id', equipmentData.id);

      if (updateError) throw updateError;

      setSelectedClient(null);

      if (onClientLinked) {
        await onClientLinked(equipmentData.id, null);
      }

    } catch (err) {
      console.error('Error clearing network connection:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Render connected client details
  const renderConnectedClient = () => {
    if (!selectedClient) return null;

    return (
      <div
        className="rounded-lg border p-4"
        style={{
          ...styles.card,
          borderColor: palette.success || '#22C55E',
          borderWidth: 2
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="w-5 h-5" style={{ color: palette.success || '#22C55E' }} />
          <span className="font-semibold" style={styles.textPrimary}>Connected Device</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm" style={styles.subtleText}>Name:</span>
            <span className="text-sm font-medium" style={styles.textPrimary}>
              {selectedClient.hostname || selectedClient.name || 'Unknown'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm" style={styles.subtleText}>MAC Address:</span>
            <span className="text-sm font-mono" style={styles.textPrimary}>
              {formatMac(selectedClient.mac_address)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm" style={styles.subtleText}>IP Address:</span>
            <span className="text-sm font-mono" style={styles.textPrimary}>
              {selectedClient.ip_address || 'N/A'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm" style={styles.subtleText}>Connection:</span>
            <span className="flex items-center gap-1 text-sm" style={styles.textPrimary}>
              {selectedClient.is_wired ? (
                <>
                  <Cable className="w-4 h-4" style={{ color: palette.info || '#3B82F6' }} />
                  Wired
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4" style={{ color: palette.warning || '#F59E0B' }} />
                  Wireless
                </>
              )}
            </span>
          </div>

          {/* Wired: Show switch info */}
          {selectedClient.is_wired && selectedClient.switch_name && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={styles.subtleText}>Switch:</span>
                <span className="text-sm font-medium" style={styles.textPrimary}>
                  {selectedClient.switch_name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={styles.subtleText}>Port:</span>
                <span
                  className="text-sm font-medium px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: palette.info ? `${palette.info}20` : '#3B82F620',
                    color: palette.info || '#3B82F6'
                  }}
                >
                  Port {selectedClient.switch_port}
                </span>
              </div>
            </>
          )}

          {/* Wireless: Show AP info */}
          {!selectedClient.is_wired && (
            <>
              {selectedClient.ssid && (
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={styles.subtleText}>SSID:</span>
                  <span className="text-sm font-medium" style={styles.textPrimary}>
                    {selectedClient.ssid}
                  </span>
                </div>
              )}
              {selectedClient.ap_name && (
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={styles.subtleText}>Access Point:</span>
                  <span className="text-sm font-medium" style={styles.textPrimary}>
                    {selectedClient.ap_name}
                  </span>
                </div>
              )}
              {selectedClient.wifi_signal && (
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={styles.subtleText}>Signal:</span>
                  <span className="text-sm font-medium" style={styles.textPrimary}>
                    {selectedClient.wifi_signal} dBm
                  </span>
                </div>
              )}
            </>
          )}

          {selectedClient.uptime_formatted && (
            <div className="flex items-center justify-between">
              <span className="text-sm" style={styles.subtleText}>Uptime:</span>
              <span className="text-sm" style={styles.textPrimary}>
                {selectedClient.uptime_formatted}
              </span>
            </div>
          )}
        </div>

        <button
          onClick={handleClearConnection}
          disabled={saving}
          className="mt-4 w-full text-sm py-2 rounded-lg border transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
          style={{
            borderColor: '#EF4444',
            color: '#EF4444'
          }}
        >
          {saving ? 'Clearing...' : 'Clear Connection'}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="font-semibold" style={styles.textPrimary}>
          Network Connection
        </h4>
        <button
          onClick={fetchClients}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor: loading ? (mode === 'dark' ? '#3F3F46' : '#E5E7EB') : (palette.primary || '#6366F1'),
            color: loading ? (mode === 'dark' ? '#71717A' : '#9CA3AF') : '#FFFFFF'
          }}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          className="p-3 rounded-lg flex items-start gap-2"
          style={{
            backgroundColor: '#FEE2E2',
            color: '#DC2626'
          }}
        >
          <XCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Last refresh time */}
      {lastRefresh && (
        <p className="text-xs" style={styles.subtleText}>
          Last updated: {lastRefresh.toLocaleTimeString()}
        </p>
      )}

      {/* Show connected client or selection UI */}
      {selectedClient ? (
        renderConnectedClient()
      ) : (
        <>
          {/* Search and Filter */}
          <div className="space-y-3">
            {/* Search */}
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4"
                style={styles.subtleText}
              />
              <input
                type="text"
                placeholder="Search by name, MAC, or IP..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg border text-sm"
                style={{
                  ...styles.card,
                  ...styles.textPrimary
                }}
              />
            </div>

            {/* Filter buttons */}
            <div className="flex flex-wrap gap-2">
              {/* Devices filter */}
              <button
                onClick={() => setFilter('devices')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                style={filter === 'devices' ? {
                  backgroundColor: palette.primary || '#6366F1',
                  color: '#FFFFFF'
                } : styles.mutedCard}
              >
                <Server className="w-4 h-4" />
                Devices ({devices.length})
              </button>
              {['all', 'wired', 'wireless'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors"
                  style={filter === f ? {
                    backgroundColor: palette.primary || '#6366F1',
                    color: '#FFFFFF'
                  } : styles.mutedCard}
                >
                  {f === 'wired' && <Cable className="w-4 h-4" />}
                  {f === 'wireless' && <Wifi className="w-4 h-4" />}
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  {f === 'all' && ` (${clients.length})`}
                  {f === 'wired' && ` (${clients.filter(c => c.is_wired).length})`}
                  {f === 'wireless' && ` (${clients.filter(c => !c.is_wired).length})`}
                </button>
              ))}
            </div>
          </div>

          {/* Device/Client List */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin" style={{ color: palette.primary || '#6366F1' }} />
            </div>
          ) : filter === 'devices' ? (
            // Devices List
            filteredDevices.length === 0 ? (
              <div className="text-center py-8" style={styles.subtleText}>
                <Server className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p>{devices.length === 0 ? 'No UniFi devices found' : 'No matching devices'}</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {filteredDevices.map((device) => (
                  <button
                    key={device.mac_address}
                    onClick={() => handleSelectDevice(device)}
                    disabled={saving}
                    className="w-full p-3 rounded-lg border text-left transition-all hover:shadow-md"
                    style={{
                      ...styles.mutedCard,
                      opacity: saving ? 0.5 : 1
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Device type icon */}
                      <div
                        className="p-2 rounded-lg flex-shrink-0"
                        style={{
                          backgroundColor: device.category === 'gateway'
                            ? (palette.danger ? `${palette.danger}20` : '#EF444420')
                            : device.category === 'switch'
                            ? (palette.info ? `${palette.info}20` : '#3B82F620')
                            : (palette.warning ? `${palette.warning}20` : '#F59E0B20')
                        }}
                      >
                        {device.category === 'gateway' ? (
                          <Network className="w-4 h-4" style={{ color: palette.danger || '#EF4444' }} />
                        ) : device.category === 'switch' ? (
                          <Server className="w-4 h-4" style={{ color: palette.info || '#3B82F6' }} />
                        ) : (
                          <Wifi className="w-4 h-4" style={{ color: palette.warning || '#F59E0B' }} />
                        )}
                      </div>

                      {/* Device info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate" style={styles.textPrimary}>
                            {device.name}
                          </span>
                          <span
                            className="px-1.5 py-0.5 rounded text-xs font-medium"
                            style={device.is_online ? {
                              backgroundColor: '#22C55E20',
                              color: '#22C55E'
                            } : {
                              backgroundColor: '#EF444420',
                              color: '#EF4444'
                            }}
                          >
                            {device.is_online ? 'Online' : 'Offline'}
                          </span>
                        </div>
                        <div className="text-xs space-y-0.5" style={styles.subtleText}>
                          <div className="flex gap-3">
                            <span className="font-mono">{formatMac(device.mac_address)}</span>
                            <span className="font-mono">{device.ip_address}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {device.model && <span>{device.model}</span>}
                            <span className="capitalize">{device.category?.replace('_', ' ')}</span>
                          </div>
                        </div>
                      </div>

                      {/* Uptime badge */}
                      {device.uptime_formatted && (
                        <div
                          className="px-2 py-1 rounded text-xs font-medium whitespace-nowrap flex-shrink-0"
                          style={{
                            backgroundColor: mode === 'dark' ? '#3F3F46' : '#E5E7EB',
                            ...styles.textSecondary
                          }}
                        >
                          <Clock className="w-3 h-3 inline mr-1" />
                          {device.uptime_formatted}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )
          ) : filteredClients.length === 0 ? (
            <div className="text-center py-8" style={styles.subtleText}>
              <Monitor className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>{clients.length === 0 ? 'No network clients found' : 'No matching clients'}</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {filteredClients.map((client) => (
                <button
                  key={client.mac_address}
                  onClick={() => handleSelectClient(client)}
                  disabled={saving}
                  className="w-full p-3 rounded-lg border text-left transition-all hover:shadow-md"
                  style={{
                    ...styles.mutedCard,
                    opacity: saving ? 0.5 : 1
                  }}
                >
                  <div className="flex items-start gap-3">
                    {/* Connection type icon */}
                    <div
                      className="p-2 rounded-lg flex-shrink-0"
                      style={{
                        backgroundColor: client.is_wired
                          ? (palette.info ? `${palette.info}20` : '#3B82F620')
                          : (palette.warning ? `${palette.warning}20` : '#F59E0B20')
                      }}
                    >
                      {client.is_wired ? (
                        <Cable className="w-4 h-4" style={{ color: palette.info || '#3B82F6' }} />
                      ) : (
                        <Wifi className="w-4 h-4" style={{ color: palette.warning || '#F59E0B' }} />
                      )}
                    </div>

                    {/* Client info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate" style={styles.textPrimary}>
                        {client.hostname || client.name || 'Unknown'}
                      </div>
                      <div className="text-xs space-y-0.5" style={styles.subtleText}>
                        <div className="flex gap-3">
                          <span className="font-mono">{formatMac(client.mac_address)}</span>
                          <span className="font-mono">{client.ip_address}</span>
                        </div>
                        {client.is_wired ? (
                          <div className="flex items-center gap-2 mt-1">
                            {client.switch_name && (
                              <span className="flex items-center gap-1">
                                <Monitor className="w-3 h-3" />
                                {client.switch_name}
                              </span>
                            )}
                            {client.switch_port && (
                              <span
                                className="px-1.5 py-0.5 rounded text-xs font-medium"
                                style={{
                                  backgroundColor: palette.info ? `${palette.info}20` : '#3B82F620',
                                  color: palette.info || '#3B82F6'
                                }}
                              >
                                Port {client.switch_port}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-1">
                            {client.ssid && (
                              <span className="flex items-center gap-1">
                                <Wifi className="w-3 h-3" />
                                {client.ssid}
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

                    {/* Uptime badge */}
                    {client.uptime_formatted && (
                      <div
                        className="px-2 py-1 rounded text-xs font-medium whitespace-nowrap flex-shrink-0"
                        style={{
                          backgroundColor: mode === 'dark' ? '#3F3F46' : '#E5E7EB',
                          ...styles.textSecondary
                        }}
                      >
                        <Clock className="w-3 h-3 inline mr-1" />
                        {client.uptime_formatted}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default HANetworkClientSelector;
