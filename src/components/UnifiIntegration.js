import React, { useState, useEffect } from 'react';
import unifiService from '../services/unifiService';
import * as unifiApi from '../services/unifiApi';

const UnifiIntegration = ({ projectId }) => {
  const [loading, setLoading] = useState(false);
  const [sites, setSites] = useState([]);
  const [switches, setSwitches] = useState([]);
  const [selectedSite, setSelectedSite] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSyncSites = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const syncedSites = await unifiService.syncSites(projectId);
      setSites(syncedSites);
      setSuccess(`Synced ${syncedSites.length} site(s)`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncSwitches = async () => {
    if (!selectedSite) {
      setError('Please select a site first');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const syncedSwitches = await unifiService.syncSwitches(projectId, selectedSite);
      setSwitches(syncedSwitches);
      setSuccess(`Synced ${syncedSwitches.length} switch(es)`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const isConnected = await unifiApi.testConnection();
      if (isConnected) {
        setSuccess('Successfully connected to UniFi API');
      } else {
        setError('Failed to connect to UniFi API');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h3 className="text-xl font-semibold mb-4">UniFi Network Integration</h3>
      
      <div className="space-y-4">
        {/* Test Connection */}
        <div>
          <button
            onClick={handleTestConnection}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Test Connection
          </button>
        </div>

        {/* Sync Sites */}
        <div>
          <button
            onClick={handleSyncSites}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Syncing...' : 'Sync Sites from UniFi'}
          </button>
        </div>

        {/* Site Selection */}
        {sites.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Site
            </label>
            <select
              value={selectedSite || ''}
              onChange={(e) => setSelectedSite(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">-- Select a site --</option>
              {sites.map(site => (
                <option key={site.id} value={site.site_id}>
                  {site.site_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Sync Switches */}
        {selectedSite && (
          <div>
            <button
              onClick={handleSyncSwitches}
              disabled={loading}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? 'Syncing...' : 'Sync Switches & Ports'}
            </button>
          </div>
        )}

        {/* Success/Error Messages */}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {success && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-600">{success}</p>
          </div>
        )}

        {/* Switches Display */}
        {switches.length > 0 && (
          <div className="mt-4">
            <h4 className="font-semibold mb-2">Synced Switches</h4>
            <div className="space-y-2">
              {switches.map(sw => (
                <div key={sw.id} className="p-3 bg-gray-50 rounded border">
                  <div className="font-medium">{sw.device_name}</div>
                  <div className="text-sm text-gray-600">
                    Model: {sw.device_model} | IP: {sw.ip_address} | Ports: {sw.total_ports}
                  </div>
                  <div className="text-xs text-gray-500">Location: {sw.location || 'Not set'}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UnifiIntegration;
