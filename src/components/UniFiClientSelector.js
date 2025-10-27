import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import unifiApi from '../services/unifiApi';
import { Network, CheckCircle, Loader } from 'lucide-react';
import Button from './ui/Button';

const UniFiClientSelector = ({ projectId, equipmentId, wireDropId, onAssign }) => {
  const { mode } = useTheme();
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState([]);
  const [selectedClientMac, setSelectedClientMac] = useState('');
  const [currentAssignment, setCurrentAssignment] = useState(null);
  const [unifiUrl, setUnifiUrl] = useState('');
  const [error, setError] = useState('');

  // Load project UniFi URL
  useEffect(() => {
    const loadProject = async () => {
      const { data } = await supabase
        .from('projects')
        .select('unifi_url')
        .eq('id', projectId)
        .single();

      if (data?.unifi_url) {
        setUnifiUrl(data.unifi_url);
      } else {
        setError('No UniFi URL configured for this project');
      }
    };
    loadProject();
  }, [projectId]);

  // Load current assignment
  useEffect(() => {
    const loadAssignment = async () => {
      const { data } = await supabase
        .from('project_equipment')
        .select('unifi_client_mac, unifi_last_ip, unifi_last_seen, unifi_data')
        .eq('id', equipmentId)
        .single();

      if (data?.unifi_client_mac) {
        setCurrentAssignment(data);
        setSelectedClientMac(data.unifi_client_mac);
      }
    };
    loadAssignment();
  }, [equipmentId]);

  // Fetch UniFi clients
  const handleFetchClients = async () => {
    if (!unifiUrl) {
      setError('No UniFi URL configured');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Parse site ID from URL
      const match = unifiUrl.match(/\/consoles\/([^\/]+)/);
      const consoleId = match ? match[1] : null;

      if (!consoleId) {
        throw new Error('Could not parse console ID from UniFi URL');
      }

      // Fetch sites/hosts
      const sitesData = await unifiApi.fetchSites(unifiUrl);
      const hostId = sitesData.data[0]?.id;

      if (!hostId) {
        throw new Error('No UniFi host found');
      }

      // Fetch clients
      const clientsData = await unifiApi.fetchClients(hostId, unifiUrl);
      setClients(clientsData.data || []);

    } catch (err) {
      console.error('Failed to fetch UniFi clients:', err);
      setError(err.message || 'Failed to fetch UniFi clients');
    } finally {
      setLoading(false);
    }
  };

  // Handle assignment
  const handleAssign = async () => {
    const selectedClient = clients.find(c => c.mac === selectedClientMac);
    if (!selectedClient) return;

    try {
      setLoading(true);

      // Update equipment with UniFi data
      const { error: updateError } = await supabase
        .from('project_equipment')
        .update({
          unifi_client_mac: selectedClient.mac,
          unifi_last_ip: selectedClient.ip,
          unifi_last_seen: new Date().toISOString(),
          unifi_data: selectedClient
        })
        .eq('id', equipmentId);

      if (updateError) throw updateError;

      // Get current user for commission stage completion
      const { data: { user } } = await supabase.auth.getUser();

      // Mark commission stage complete
      const { error: stageError } = await supabase
        .from('wire_drop_stages')
        .upsert({
          wire_drop_id: wireDropId,
          stage_type: 'commission',
          completed: true,
          notes: `Device verified online: ${selectedClient.hostname || selectedClient.name || selectedClient.mac}`,
          completed_at: new Date().toISOString(),
          completed_by: user?.email || 'system'
        }, {
          onConflict: 'wire_drop_id,stage_type'
        });

      if (stageError) {
        console.warn('Failed to mark commission stage complete:', stageError);
      }

      setCurrentAssignment({
        unifi_client_mac: selectedClient.mac,
        unifi_last_ip: selectedClient.ip,
        unifi_last_seen: new Date().toISOString(),
        unifi_data: selectedClient
      });

      if (onAssign) onAssign(selectedClient);

    } catch (err) {
      console.error('Failed to assign UniFi client:', err);
      setError(err.message || 'Failed to assign client');
    } finally {
      setLoading(false);
    }
  };

  // Format last seen time
  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000 / 60); // minutes
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
  };

  return (
    <div className="space-y-4">
      {/* Current Assignment Display */}
      {currentAssignment && (
        <div className="p-3 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700">
          <div className="flex items-start gap-3">
            <CheckCircle size={20} className="text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-900 dark:text-green-100">
                Network Client Assigned
              </p>
              <div className="mt-2 space-y-1 text-xs text-green-800 dark:text-green-200">
                <div><strong>IP:</strong> {currentAssignment.unifi_last_ip || 'N/A'}</div>
                <div><strong>MAC:</strong> {currentAssignment.unifi_client_mac}</div>
                <div><strong>Last Seen:</strong> {formatLastSeen(currentAssignment.unifi_last_seen)}</div>
                {currentAssignment.unifi_data?.hostname && (
                  <div><strong>Hostname:</strong> {currentAssignment.unifi_data.hostname}</div>
                )}
                {currentAssignment.unifi_data?.sw_mac && (
                  <div><strong>Switch:</strong> {currentAssignment.unifi_data.sw_mac}</div>
                )}
                {currentAssignment.unifi_data?.sw_port && (
                  <div><strong>Port:</strong> {currentAssignment.unifi_data.sw_port}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fetch Button */}
      {!currentAssignment && (
        <Button
          variant="primary"
          icon={loading ? Loader : Network}
          onClick={handleFetchClients}
          disabled={loading || !unifiUrl}
          loading={loading}
        >
          {loading ? 'Loading Clients...' : 'Load UniFi Clients'}
        </Button>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Client Selector Dropdown */}
      {clients.length > 0 && (
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
            Select Network Client
          </label>

          <select
            value={selectedClientMac}
            onChange={(e) => setSelectedClientMac(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          >
            <option value="">-- Select a device --</option>
            {clients.map(client => {
              const displayName = client.hostname || client.name || 'Unknown Device';
              const isOnline = client.is_wired !== undefined || client.uptime > 0;

              return (
                <option key={client.mac} value={client.mac}>
                  {displayName} - {client.ip || 'No IP'} - {client.mac}
                  {isOnline ? ' (Online)' : ' (Offline)'}
                </option>
              );
            })}
          </select>

          <Button
            variant="primary"
            onClick={handleAssign}
            disabled={!selectedClientMac || loading}
            loading={loading}
          >
            Assign Client & Complete Commission
          </Button>
        </div>
      )}
    </div>
  );
};

export default UniFiClientSelector;
