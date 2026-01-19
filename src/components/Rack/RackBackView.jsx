/**
 * RackBackView.jsx
 * Network view of rack equipment showing device status and connectivity
 * Now includes power summary (merged from RackPowerView)
 */

import React, { useState, useMemo, memo } from 'react';
import PropTypes from 'prop-types';
import { RefreshCw, WifiOff, Globe, ExternalLink, Zap, Plug, Link2, ChevronDown } from 'lucide-react';

/**
 * RackBackView - Network + Power View
 * Shows equipment with their network status and power consumption
 */
const RackBackView = ({
  rack,
  equipment = [],
  haClients = [],
  haDevices = [],
  onLinkToHA,
  onRefresh,
}) => {
  const [linkingEquipmentId, setLinkingEquipmentId] = useState(null);

  // Get network status info from equipment
  const getNetworkInfo = (item) => {
    let haClient = item.ha_client;

    // If no nested object but we have ha_client_mac, look it up
    if (!haClient && item.ha_client_mac) {
      const mac = item.ha_client_mac.toLowerCase();

      const matchedDevice = haDevices.find(d => d.mac?.toLowerCase() === mac);
      if (matchedDevice) {
        haClient = {
          mac: matchedDevice.mac,
          hostname: matchedDevice.name,
          ip: matchedDevice.ip,
          is_online: matchedDevice.is_online,
          is_wired: true,
        };
      }

      if (!haClient) {
        const matchedClient = haClients.find(c => c.mac?.toLowerCase() === mac);
        if (matchedClient) {
          haClient = {
            mac: matchedClient.mac,
            hostname: matchedClient.hostname,
            ip: matchedClient.ip,
            is_online: matchedClient.is_online,
            is_wired: matchedClient.is_wired,
            switch_name: matchedClient.switch_name,
            switch_port: matchedClient.switch_port,
          };
        }
      }
    }

    if (!haClient) {
      return { linked: false, isOnline: null, ip: null, mac: null, hostname: null };
    }

    return {
      linked: true,
      isOnline: haClient.is_online,
      ip: haClient.ip,
      mac: haClient.mac,
      hostname: haClient.hostname,
      switchName: haClient.switch_name,
      switchPort: haClient.switch_port,
      isWired: haClient.is_wired,
    };
  };

  // Get display name for equipment - strip room prefix from "Room - Part Name N" format
  const getEquipmentName = (item) => {
    // Try global_part.name if linked
    if (item.global_part?.name) return item.global_part.name;

    // Extract part name from name (format: "Room - Part Name N")
    const fullName = item?.instance_name || item?.name;
    if (fullName && fullName.includes(' - ')) {
      const parts = fullName.split(' - ');
      if (parts.length > 1) {
        return parts.slice(1).join(' - ');
      }
    }

    return item.model || item.part_number || fullName || 'Unknown Equipment';
  };

  // Sort equipment by rack position (descending - top of rack first)
  const sortedEquipment = useMemo(() => {
    return [...equipment].sort((a, b) => {
      const posA = a.rack_position_u || 0;
      const posB = b.rack_position_u || 0;
      return posB - posA;
    });
  }, [equipment]);

  // Calculate power totals - consumption vs available
  const powerTotals = useMemo(() => {
    return equipment.reduce((acc, item) => {
      const gp = item.global_part;
      const isPowerDevice = gp?.is_power_device;
      const wattsConsumed = gp?.power_watts || 0;
      const outletsRequired = gp?.power_outlets || 0;
      const outletsProvided = gp?.power_outlets_provided || 0;
      const powerOutput = gp?.power_output_watts || 0;

      return {
        // Total power consumed by all devices
        wattsConsumed: acc.wattsConsumed + wattsConsumed,
        // Total outlets required by non-power devices
        outletsRequired: acc.outletsRequired + (isPowerDevice ? 0 : outletsRequired),
        // Total outlets provided by power devices
        outletsProvided: acc.outletsProvided + outletsProvided,
        // Total power output capacity from power devices
        powerCapacity: acc.powerCapacity + powerOutput,
        // Count of power devices
        powerDeviceCount: acc.powerDeviceCount + (isPowerDevice ? 1 : 0),
      };
    }, { wattsConsumed: 0, outletsRequired: 0, outletsProvided: 0, powerCapacity: 0, powerDeviceCount: 0 });
  }, [equipment]);

  // Build network entities list (devices + unlinked clients available for linking)
  const networkEntities = useMemo(() => {
    const linkedMacs = new Set(
      equipment
        .map(e => e.ha_client_mac?.toLowerCase())
        .filter(Boolean)
    );

    const entities = [];

    // Add UniFi devices
    haDevices.forEach(device => {
      if (!linkedMacs.has(device.mac?.toLowerCase())) {
        entities.push({
          type: 'device',
          mac: device.mac,
          name: device.name,
          ip: device.ip,
          isOnline: device.is_online,
        });
      }
    });

    // Add network clients
    haClients.forEach(client => {
      if (!linkedMacs.has(client.mac?.toLowerCase())) {
        entities.push({
          type: 'client',
          mac: client.mac,
          name: client.hostname || 'Unknown',
          ip: client.ip,
          isOnline: client.is_online,
          switchName: client.switch_name,
          switchPort: client.switch_port,
        });
      }
    });

    return entities;
  }, [haDevices, haClients, equipment]);

  // Handle linking equipment to network entity
  const handleLinkClick = (equipmentId, mac) => {
    if (onLinkToHA) {
      onLinkToHA(equipmentId, mac);
      setLinkingEquipmentId(null);
    }
  };

  // Handle unlinking
  const handleUnlink = (equipmentId) => {
    if (onLinkToHA) {
      onLinkToHA(equipmentId, null);
    }
  };

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-zinc-800 border-b border-zinc-700">
        <h3 className="text-lg font-semibold text-white">
          {rack?.name || 'Rack'} - Network View
        </h3>
        <div className="flex items-center gap-3">
          {/* Power Summary */}
          <div className="flex items-center gap-4 px-4 py-1.5 bg-zinc-900 rounded-lg text-sm">
            {/* Power consumption */}
            <div className="flex items-center gap-1.5" title="Total power consumed">
              <Zap size={14} className="text-yellow-400" />
              <span className="font-medium text-zinc-200">{powerTotals.wattsConsumed}W</span>
              {powerTotals.powerCapacity > 0 && (
                <span className="text-zinc-500">/ {powerTotals.powerCapacity}W</span>
              )}
            </div>
            {/* Outlet usage */}
            <div className="flex items-center gap-1.5" title="Outlets used / available">
              <Plug size={14} className="text-blue-400" />
              <span className={`font-medium ${
                powerTotals.outletsRequired > powerTotals.outletsProvided
                  ? 'text-red-400'
                  : 'text-zinc-200'
              }`}>
                {powerTotals.outletsRequired}
              </span>
              {powerTotals.outletsProvided > 0 && (
                <span className="text-zinc-500">/ {powerTotals.outletsProvided}</span>
              )}
            </div>
            {/* Power device count */}
            {powerTotals.powerDeviceCount > 0 && (
              <div className="flex items-center gap-1 text-amber-400" title="Power distribution devices">
                <span>⚡ {powerTotals.powerDeviceCount}</span>
              </div>
            )}
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm text-white font-medium transition-colors"
            >
              <RefreshCw size={14} />
              Sync
            </button>
          )}
        </div>
      </div>

      {/* Equipment List */}
      <div className="p-4">
        {sortedEquipment.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            No equipment in this rack
          </div>
        ) : (
          <div className="space-y-2">
            {sortedEquipment.map((item) => {
              const networkInfo = getNetworkInfo(item);
              const uHeight = item.global_part?.u_height || 1;
              const posU = item.rack_position_u;
              const watts = item.global_part?.power_watts;
              const outletsRequired = item.global_part?.power_outlets || 0;
              const isLinking = linkingEquipmentId === item.id;

              // Power distribution device info
              const isPowerDevice = item.global_part?.is_power_device;
              const outletsProvided = item.global_part?.power_outlets_provided || 0;
              const powerOutput = item.global_part?.power_output_watts;
              const upsVA = item.global_part?.ups_va_rating;
              const upsRuntime = item.global_part?.ups_runtime_minutes;

              return (
                <div
                  key={item.id}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden"
                >
                  <div className="px-4 py-3 flex items-center gap-4">
                    {/* U Position */}
                    {posU && (
                      <div className="w-12 text-center">
                        <span className="text-xs font-mono text-zinc-500">U{posU}</span>
                      </div>
                    )}

                    {/* Status Indicator */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      networkInfo.linked
                        ? networkInfo.isOnline ? 'bg-green-500' : 'bg-red-500'
                        : 'bg-zinc-600'
                    }`} />

                    {/* Equipment Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-100 truncate">
                          {getEquipmentName(item)}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">
                          {uHeight}U
                        </span>
                        {isPowerDevice && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-400 border border-amber-700">
                            ⚡ Power
                          </span>
                        )}
                        {watts && !isPowerDevice && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-400">
                            {watts}W
                          </span>
                        )}
                      </div>

                      {/* Network Details */}
                      {networkInfo.linked && (
                        <div className="flex items-center gap-4 mt-1 text-xs text-zinc-400">
                          {networkInfo.ip && (
                            <a
                              href={`http://${networkInfo.ip}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                            >
                              <Globe size={10} />
                              <span className="font-mono">{networkInfo.ip}</span>
                              <ExternalLink size={10} />
                            </a>
                          )}
                          {networkInfo.hostname && (
                            <span>{networkInfo.hostname}</span>
                          )}
                          {networkInfo.switchPort && (
                            <span>Port {networkInfo.switchPort}</span>
                          )}
                        </div>
                      )}

                      {/* Power Distribution Device Info */}
                      {isPowerDevice && outletsProvided > 0 && (
                        <div className="flex items-center gap-2 mt-1.5 p-2 rounded bg-amber-900/20 border border-amber-800/50">
                          <span className="text-xs text-amber-400 font-medium">Provides:</span>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(outletsProvided, 12) }).map((_, i) => (
                              <div
                                key={i}
                                className="w-3.5 h-3.5 rounded-sm bg-amber-900/50 border border-amber-600 flex items-center justify-center"
                                title={`Outlet ${i + 1}`}
                              >
                                <Plug size={9} className="text-amber-400" />
                              </div>
                            ))}
                            {outletsProvided > 12 && (
                              <span className="text-xs text-amber-400 ml-1">+{outletsProvided - 12}</span>
                            )}
                          </div>
                          <span className="text-xs text-amber-400">{outletsProvided} outlets</span>
                          {powerOutput && (
                            <span className="text-xs text-amber-400 ml-2">{powerOutput}W max</span>
                          )}
                          {upsVA && (
                            <span className="text-xs text-amber-400 ml-2">{upsVA}VA</span>
                          )}
                          {upsRuntime && (
                            <span className="text-xs text-zinc-400 ml-1">({upsRuntime}min)</span>
                          )}
                        </div>
                      )}

                      {/* Power Required (for non-power devices) */}
                      {!isPowerDevice && outletsRequired > 0 && (
                        <div className="flex items-center gap-1 mt-1.5">
                          <span className="text-xs text-zinc-500 mr-1">Needs:</span>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(outletsRequired, 4) }).map((_, i) => (
                              <div
                                key={i}
                                className="w-3 h-3 rounded-sm bg-zinc-700 border border-zinc-600 flex items-center justify-center"
                                title={`Outlet ${i + 1}`}
                              >
                                <Plug size={8} className="text-zinc-400" />
                              </div>
                            ))}
                            {outletsRequired > 4 && (
                              <span className="text-xs text-zinc-500 ml-1">+{outletsRequired - 4}</span>
                            )}
                          </div>
                          {watts && (
                            <span className="text-xs text-zinc-500 ml-2">{watts}W</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Link/Unlink Button */}
                    <div className="flex-shrink-0">
                      {networkInfo.linked ? (
                        <button
                          onClick={() => handleUnlink(item.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs text-zinc-300 transition-colors"
                        >
                          <WifiOff size={12} />
                          Unlink
                        </button>
                      ) : (
                        <button
                          onClick={() => setLinkingEquipmentId(isLinking ? null : item.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-xs text-white transition-colors"
                        >
                          <Link2 size={12} />
                          Link to Network
                          <ChevronDown size={12} className={`transition-transform ${isLinking ? 'rotate-180' : ''}`} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Network Entity Selector */}
                  {isLinking && (
                    <div className="border-t border-zinc-700 bg-zinc-900/50 max-h-48 overflow-y-auto">
                      {networkEntities.length > 0 ? (
                        <>
                          {/* UniFi Devices Section */}
                          {networkEntities.some(e => e.type === 'device') && (
                            <>
                              <div className="px-4 py-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wide bg-zinc-800/50">
                                UniFi Devices
                              </div>
                              {networkEntities.filter(e => e.type === 'device').map(entity => (
                                <button
                                  key={entity.mac}
                                  onClick={() => handleLinkClick(item.id, entity.mac)}
                                  className="w-full px-4 py-2 flex items-center justify-between hover:bg-violet-600/20 transition-colors text-left"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className={`w-2 h-2 rounded-full ${entity.isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                                    <div>
                                      <div className="text-sm text-zinc-200">{entity.name}</div>
                                      <div className="text-xs text-zinc-500">{entity.ip}</div>
                                    </div>
                                  </div>
                                  <span className="text-xs font-mono text-zinc-500">{entity.mac?.toUpperCase()}</span>
                                </button>
                              ))}
                            </>
                          )}

                          {/* Network Clients Section */}
                          {networkEntities.some(e => e.type === 'client') && (
                            <>
                              <div className="px-4 py-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wide bg-zinc-800/50">
                                Network Clients
                              </div>
                              {networkEntities.filter(e => e.type === 'client').map(entity => (
                                <button
                                  key={entity.mac}
                                  onClick={() => handleLinkClick(item.id, entity.mac)}
                                  className="w-full px-4 py-2 flex items-center justify-between hover:bg-violet-600/20 transition-colors text-left"
                                >
                                  <div className="flex items-center gap-3">
                                    <span className={`w-2 h-2 rounded-full ${entity.isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                                    <div>
                                      <div className="text-sm text-zinc-200">{entity.name}</div>
                                      <div className="text-xs text-zinc-500">
                                        {entity.ip}
                                        {entity.switchPort && ` • Port ${entity.switchPort}`}
                                      </div>
                                    </div>
                                  </div>
                                  <span className="text-xs font-mono text-zinc-500">{entity.mac?.toUpperCase()}</span>
                                </button>
                              ))}
                            </>
                          )}
                        </>
                      ) : (
                        <div className="px-4 py-6 text-center text-sm text-zinc-500">
                          No available network devices to link
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

RackBackView.propTypes = {
  rack: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    total_u: PropTypes.number,
  }),
  equipment: PropTypes.array,
  haClients: PropTypes.array,
  haDevices: PropTypes.array,
  onLinkToHA: PropTypes.func,
  onRefresh: PropTypes.func,
};

export default memo(RackBackView);
