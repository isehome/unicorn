/**
 * PowerConnectionsView.jsx
 * Drag-and-drop power connection management for rack equipment
 * Allows connecting device power inputs to outlets on UPS/PDU/surge devices
 */

import React, { useState, useMemo, useCallback, useRef, memo } from 'react';
import PropTypes from 'prop-types';
import { Zap, Plug, Plus, AlertTriangle } from 'lucide-react';

// ============================================
// CONSTANTS
// ============================================

const PORT_TYPES = {
  UPS: 'ups',
  SURGE: 'surge',
  STANDARD: 'standard',
};

// ============================================
// SUB-COMPONENTS
// ============================================

/**
 * Draggable Power Input Icon
 * Gray when disconnected, colored when connected based on source type
 */
const PowerInput = memo(({
  equipment,
  inputNumber = 1,
  connection,
  onDragStart,
  onDragEnd,
  onClick,
  isHighlighted,
  connectionLineRef,
}) => {
  const inputRef = useRef(null);
  const isConnected = !!connection;
  const portType = connection?.source_port_type;

  // Determine color based on connection state
  let bgColor = 'bg-zinc-700';
  let borderColor = 'border-zinc-600';
  let iconColor = 'text-zinc-400';
  let title = 'Drag to connect to power outlet';

  if (isConnected) {
    if (portType === PORT_TYPES.UPS) {
      bgColor = 'bg-green-900/50';
      borderColor = 'border-green-600';
      iconColor = 'text-green-400';
      title = 'Connected to UPS battery backup';
    } else if (portType === PORT_TYPES.SURGE) {
      bgColor = 'bg-amber-900/50';
      borderColor = 'border-amber-600';
      iconColor = 'text-amber-400';
      title = 'Connected to surge protected outlet';
    } else {
      bgColor = 'bg-blue-900/50';
      borderColor = 'border-blue-600';
      iconColor = 'text-blue-400';
      title = 'Connected to power source';
    }
  }

  const handleDragStart = (e) => {
    if (isConnected) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'power-input',
      equipmentId: equipment.id,
      inputNumber,
      equipmentName: equipment.instance_name || equipment.name || equipment.global_part?.name,
    }));
    e.dataTransfer.effectAllowed = 'link';
    onDragStart?.(equipment, inputNumber, inputRef.current);
  };

  const handleClick = (e) => {
    e.stopPropagation();
    onClick?.(equipment, inputNumber, connection, inputRef.current);
  };

  return (
    <div
      ref={inputRef}
      draggable={!isConnected}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      onClick={handleClick}
      className={`
        w-7 h-7 rounded flex items-center justify-center
        ${bgColor} border ${borderColor}
        ${!isConnected ? 'cursor-grab active:cursor-grabbing hover:border-violet-500 hover:scale-110' : 'cursor-pointer hover:brightness-125'}
        ${isHighlighted ? 'ring-2 ring-violet-500 ring-offset-1 ring-offset-zinc-900' : ''}
        transition-all duration-150
      `}
      title={title}
      data-equipment-id={equipment.id}
      data-input-number={inputNumber}
    >
      <Plug size={16} className={iconColor} />
    </div>
  );
});

PowerInput.displayName = 'PowerInput';

/**
 * Droppable Power Outlet Icon
 * Green for UPS, Amber for surge, shows connected device on hover
 */
const PowerOutlet = memo(({
  equipment,
  outletNumber,
  portType,
  connection,
  onDrop,
  onDisconnect,
  isDropTarget,
  onMouseEnter,
  onMouseLeave,
  outletRef,
}) => {
  const localRef = useRef(null);
  const ref = outletRef || localRef;
  const isConnected = !!connection;
  const [isDragOver, setIsDragOver] = useState(false);

  // Determine colors based on port type
  let bgColor, borderColor, iconColor;
  if (portType === PORT_TYPES.UPS) {
    bgColor = isConnected ? 'bg-green-800/70' : 'bg-green-900/50';
    borderColor = isConnected ? 'border-green-500' : 'border-green-600';
    iconColor = 'text-green-400';
  } else {
    bgColor = isConnected ? 'bg-amber-800/70' : 'bg-amber-900/50';
    borderColor = isConnected ? 'border-amber-500' : 'border-amber-600';
    iconColor = 'text-amber-400';
  }

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isConnected) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (isConnected) return;

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.type === 'power-input') {
        onDrop?.({
          sourceEquipmentId: equipment.id,
          sourcePortNumber: outletNumber,
          sourcePortType: portType,
          targetEquipmentId: data.equipmentId,
          targetPortNumber: data.inputNumber,
        });
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
  };

  const handleClick = (e) => {
    e.stopPropagation();
    if (isConnected && onDisconnect) {
      onDisconnect(connection.id);
    }
  };

  const connectedDeviceName = connection?.target_equipment?.instance_name
    || connection?.target_equipment?.name
    || connection?.target_equipment?.global_part?.name
    || 'Unknown device';

  return (
    <div
      ref={ref}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      onMouseEnter={() => onMouseEnter?.(outletNumber, connection)}
      onMouseLeave={() => onMouseLeave?.()}
      className={`
        w-7 h-7 rounded flex items-center justify-center relative
        ${bgColor} border-2 ${borderColor}
        ${!isConnected ? 'hover:border-violet-500' : 'hover:border-red-500 cursor-pointer'}
        ${isDragOver ? 'scale-125 border-violet-500 bg-violet-900/50 shadow-lg shadow-violet-500/30' : ''}
        ${isDropTarget ? 'ring-2 ring-violet-400' : ''}
        transition-all duration-150
      `}
      title={isConnected ? `${connectedDeviceName} - Click to disconnect` : `Outlet ${outletNumber} - Drop device here`}
      data-equipment-id={equipment.id}
      data-outlet-number={outletNumber}
    >
      <Plug size={16} className={iconColor} />
      {/* Outlet number badge */}
      <span className={`absolute -bottom-1 -right-1 text-[9px] font-bold px-1 rounded ${
        portType === PORT_TYPES.UPS ? 'bg-green-600 text-white' : 'bg-amber-600 text-white'
      }`}>
        {outletNumber}
      </span>
      {/* Connected indicator */}
      {isConnected && (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-white border border-zinc-800" />
      )}
    </div>
  );
});

PowerOutlet.displayName = 'PowerOutlet';

/**
 * Connection Line SVG
 * Draws a curved line between connected elements
 */
const ConnectionLine = memo(({ fromRect, toRect, containerRect, color = '#22c55e' }) => {
  if (!fromRect || !toRect || !containerRect) return null;

  // Calculate positions relative to container
  const x1 = fromRect.left + fromRect.width / 2 - containerRect.left;
  const y1 = fromRect.top + fromRect.height / 2 - containerRect.top;
  const x2 = toRect.left + toRect.width / 2 - containerRect.left;
  const y2 = toRect.top + toRect.height / 2 - containerRect.top;

  // Create a curved path
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const curvature = Math.min(Math.abs(y2 - y1) * 0.3, 50);

  const path = `M ${x1} ${y1} Q ${midX} ${y1 - curvature} ${midX} ${midY} Q ${midX} ${y2 + curvature} ${x2} ${y2}`;

  return (
    <svg
      className="absolute inset-0 pointer-events-none z-50"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      {/* Glow effect */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeOpacity="0.3"
        strokeLinecap="round"
      />
      {/* Main line */}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="6 4"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="0"
          to="20"
          dur="1s"
          repeatCount="indefinite"
        />
      </path>
      {/* End dot */}
      <circle cx={x2} cy={y2} r="4" fill={color} />
    </svg>
  );
});

ConnectionLine.displayName = 'ConnectionLine';

/**
 * Equipment Card with Power Info
 * Shows device with its inputs/outlets and connection status
 */
const EquipmentPowerCard = memo(({
  equipment,
  connections,
  usedOutlets,
  onInputDragStart,
  onInputDragEnd,
  onInputClick,
  onOutletDrop,
  onDisconnect,
  highlightedInput,
  highlightedOutlet,
  onOutletMouseEnter,
  onOutletMouseLeave,
  outletRefs,
  inputRefs,
}) => {
  const gp = equipment.global_part;
  const isPowerDevice = gp?.is_power_device;
  const surgeOutlets = gp?.power_outlets_provided || 0;
  const upsOutlets = gp?.ups_outlets_provided || 0;
  const totalOutlets = surgeOutlets + upsOutlets;
  const outletsRequired = gp?.power_outlets || 1;
  const watts = gp?.power_watts;

  const displayName = equipment.instance_name || equipment.name || gp?.name || 'Unknown';

  // Get inbound connections (this device receives power)
  const inboundConnections = connections.filter(c => c.target_equipment_id === equipment.id);
  const connectionByInput = new Map();
  inboundConnections.forEach(c => {
    connectionByInput.set(c.target_port_number, c);
  });

  // Get outbound connections (this device provides power)
  const outboundConnections = connections.filter(c => c.source_equipment_id === equipment.id);
  const connectionByOutlet = new Map();
  outboundConnections.forEach(c => {
    connectionByOutlet.set(c.source_port_number, c);
  });

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden hover:border-zinc-600 transition-colors">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-700/50">
        {isPowerDevice && <Zap size={16} className="text-amber-400 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-zinc-100 truncate">{displayName}</div>
          {watts && !isPowerDevice && (
            <div className="text-xs text-yellow-400">{watts}W</div>
          )}
        </div>
        {equipment.rack_position_u && (
          <span className="text-xs font-mono text-zinc-500">U{equipment.rack_position_u}</span>
        )}
      </div>

      {/* Power Section */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Outlets (for power devices) */}
          {isPowerDevice && totalOutlets > 0 && (
            <div className="flex-1">
              <div className="text-xs text-zinc-500 mb-2">Outlets ({totalOutlets})</div>
              <div className="flex flex-wrap gap-1.5">
                {/* UPS outlets first */}
                {Array.from({ length: upsOutlets }).map((_, i) => {
                  const outletNum = i + 1;
                  return (
                    <PowerOutlet
                      key={`ups-${outletNum}`}
                      equipment={equipment}
                      outletNumber={outletNum}
                      portType={PORT_TYPES.UPS}
                      connection={connectionByOutlet.get(outletNum)}
                      onDrop={onOutletDrop}
                      onDisconnect={onDisconnect}
                      isDropTarget={highlightedOutlet?.equipmentId === equipment.id && highlightedOutlet?.outletNumber === outletNum}
                      onMouseEnter={(num, conn) => onOutletMouseEnter?.(equipment.id, num, conn)}
                      onMouseLeave={onOutletMouseLeave}
                      outletRef={el => {
                        if (outletRefs) {
                          if (!outletRefs.current[equipment.id]) outletRefs.current[equipment.id] = {};
                          outletRefs.current[equipment.id][outletNum] = el;
                        }
                      }}
                    />
                  );
                })}
                {/* Surge outlets */}
                {Array.from({ length: surgeOutlets }).map((_, i) => {
                  const outletNum = upsOutlets + i + 1;
                  return (
                    <PowerOutlet
                      key={`surge-${outletNum}`}
                      equipment={equipment}
                      outletNumber={outletNum}
                      portType={PORT_TYPES.SURGE}
                      connection={connectionByOutlet.get(outletNum)}
                      onDrop={onOutletDrop}
                      onDisconnect={onDisconnect}
                      isDropTarget={highlightedOutlet?.equipmentId === equipment.id && highlightedOutlet?.outletNumber === outletNum}
                      onMouseEnter={(num, conn) => onOutletMouseEnter?.(equipment.id, num, conn)}
                      onMouseLeave={onOutletMouseLeave}
                      outletRef={el => {
                        if (outletRefs) {
                          if (!outletRefs.current[equipment.id]) outletRefs.current[equipment.id] = {};
                          outletRefs.current[equipment.id][outletNum] = el;
                        }
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Power Inputs */}
          <div className={isPowerDevice && totalOutlets > 0 ? '' : 'flex-1'}>
            <div className="text-xs text-zinc-500 mb-2 text-right">
              {isPowerDevice ? 'Input' : `Input${outletsRequired > 1 ? 's' : ''} (${outletsRequired})`}
            </div>
            <div className="flex flex-wrap gap-1.5 justify-end">
              {Array.from({ length: Math.max(1, isPowerDevice ? 1 : outletsRequired) }).map((_, i) => {
                const inputNum = i + 1;
                return (
                  <PowerInput
                    key={`input-${inputNum}`}
                    equipment={equipment}
                    inputNumber={inputNum}
                    connection={connectionByInput.get(inputNum)}
                    onDragStart={(eq, num, ref) => onInputDragStart?.(eq, num, ref)}
                    onDragEnd={onInputDragEnd}
                    onClick={onInputClick}
                    isHighlighted={highlightedInput?.equipmentId === equipment.id && highlightedInput?.inputNumber === inputNum}
                    connectionLineRef={el => {
                      if (inputRefs) {
                        if (!inputRefs.current[equipment.id]) inputRefs.current[equipment.id] = {};
                        inputRefs.current[equipment.id][inputNum] = el;
                      }
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

EquipmentPowerCard.displayName = 'EquipmentPowerCard';

// ============================================
// MAIN COMPONENT
// ============================================

/**
 * PowerConnectionsView
 * Main component for managing power connections in a rack
 */
const PowerConnectionsView = ({
  equipment = [],
  connections = [],
  onCreateConnection,
  onDeleteConnection,
  onAddPowerStrip,
  projectId,
}) => {
  const containerRef = useRef(null);
  const outletRefs = useRef({});
  const inputRefs = useRef({});

  // State for drag and connection line visualization
  const [draggingInput, setDraggingInput] = useState(null);
  const [highlightedConnection, setHighlightedConnection] = useState(null);
  const [connectionLine, setConnectionLine] = useState(null);

  // Sort all equipment by rack position (top to bottom, matching physical layout)
  // Keep power devices and regular devices in the same vertical order as in the rack
  const { sortedEquipment, powerDevices, regularDevices, unconnectedDevices } = useMemo(() => {
    const connectedTargetIds = new Set(connections.map(c => c.target_equipment_id));

    // Sort ALL equipment by position (descending = top of rack first)
    const sorted = [...equipment].sort((a, b) => {
      const posA = a.rack_position_u || 0;
      const posB = b.rack_position_u || 0;
      return posB - posA; // Higher position = higher in rack = appears first
    });

    // Categorize but maintain sorted order
    const powerDevices = sorted.filter(eq => {
      const isPowerDevice = eq.global_part?.is_power_device;
      const hasOutlets = (eq.global_part?.power_outlets_provided || 0) + (eq.global_part?.ups_outlets_provided || 0) > 0;
      return isPowerDevice && hasOutlets;
    });

    const regularDevices = sorted.filter(eq => {
      const isPowerDevice = eq.global_part?.is_power_device;
      const hasOutlets = (eq.global_part?.power_outlets_provided || 0) + (eq.global_part?.ups_outlets_provided || 0) > 0;
      return !(isPowerDevice && hasOutlets);
    });

    const unconnectedDevices = regularDevices.filter(eq => !connectedTargetIds.has(eq.id));

    return { sortedEquipment: sorted, powerDevices, regularDevices, unconnectedDevices };
  }, [equipment, connections]);

  // Calculate connection statistics
  const stats = useMemo(() => {
    const totalOutlets = powerDevices.reduce((sum, eq) => {
      return sum + (eq.global_part?.power_outlets_provided || 0) + (eq.global_part?.ups_outlets_provided || 0);
    }, 0);
    const usedOutlets = connections.length;
    const devicesNeedingPower = regularDevices.length;
    const connectedDevices = connections.filter(c =>
      regularDevices.some(eq => eq.id === c.target_equipment_id)
    ).length;

    return {
      totalOutlets,
      usedOutlets,
      availableOutlets: totalOutlets - usedOutlets,
      devicesNeedingPower,
      connectedDevices,
      unconnectedDevices: devicesNeedingPower - connectedDevices,
    };
  }, [powerDevices, regularDevices, connections]);

  // Handle input drag start
  const handleInputDragStart = useCallback((equipment, inputNumber, inputRef) => {
    setDraggingInput({ equipment, inputNumber, ref: inputRef });
  }, []);

  // Handle input drag end
  const handleInputDragEnd = useCallback(() => {
    setDraggingInput(null);
  }, []);

  // Handle outlet drop
  const handleOutletDrop = useCallback(async (dropData) => {
    if (!onCreateConnection) return;

    try {
      await onCreateConnection({
        projectId,
        sourceEquipmentId: dropData.sourceEquipmentId,
        sourcePortNumber: dropData.sourcePortNumber,
        sourcePortType: dropData.sourcePortType,
        targetEquipmentId: dropData.targetEquipmentId,
        targetPortNumber: dropData.targetPortNumber,
        connectionType: 'power',
      });
    } catch (err) {
      console.error('Failed to create connection:', err);
      // TODO: Show error toast
    }
  }, [onCreateConnection, projectId]);

  // Handle disconnect
  const handleDisconnect = useCallback(async (connectionId) => {
    if (!onDeleteConnection) return;

    try {
      await onDeleteConnection(connectionId);
    } catch (err) {
      console.error('Failed to delete connection:', err);
    }
  }, [onDeleteConnection]);

  // Handle input click - show connection line if connected
  const handleInputClick = useCallback((equipment, inputNumber, connection, inputRef) => {
    if (!connection) return;

    // Find the source outlet element
    const sourceEqId = connection.source_equipment_id;
    const sourcePort = connection.source_port_number;
    const outletEl = outletRefs.current[sourceEqId]?.[sourcePort];

    if (outletEl && inputRef && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const outletRect = outletEl.getBoundingClientRect();
      const inputRect = inputRef.getBoundingClientRect();

      const color = connection.source_port_type === PORT_TYPES.UPS ? '#22c55e' : '#f59e0b';

      setConnectionLine({
        fromRect: outletRect,
        toRect: inputRect,
        containerRect,
        color,
      });

      // Auto-hide after 3 seconds
      setTimeout(() => setConnectionLine(null), 3000);
    }
  }, []);

  // Handle outlet hover - show connection if connected
  const handleOutletMouseEnter = useCallback((equipmentId, outletNumber, connection) => {
    if (!connection) return;

    const targetEqId = connection.target_equipment_id;
    const targetPort = connection.target_port_number;
    const inputEl = inputRefs.current[targetEqId]?.[targetPort];
    const outletEl = outletRefs.current[equipmentId]?.[outletNumber];

    if (inputEl && outletEl && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const outletRect = outletEl.getBoundingClientRect();
      const inputRect = inputEl.getBoundingClientRect();

      const color = connection.source_port_type === PORT_TYPES.UPS ? '#22c55e' : '#f59e0b';

      setConnectionLine({
        fromRect: outletRect,
        toRect: inputRect,
        containerRect,
        color,
      });
    }
  }, []);

  const handleOutletMouseLeave = useCallback(() => {
    setConnectionLine(null);
  }, []);

  return (
    <div ref={containerRef} className="relative p-4 space-y-6">
      {/* Connection Line Overlay */}
      {connectionLine && (
        <ConnectionLine
          fromRect={connectionLine.fromRect}
          toRect={connectionLine.toRect}
          containerRect={connectionLine.containerRect}
          color={connectionLine.color}
        />
      )}

      {/* Stats Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-sm text-zinc-300">UPS Protected</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-sm text-zinc-300">Surge Only</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-zinc-500" />
            <span className="text-sm text-zinc-300">Not Connected</span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-zinc-400">
            Outlets: <span className="text-zinc-200">{stats.usedOutlets}/{stats.totalOutlets}</span>
          </span>
          {stats.unconnectedDevices > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <AlertTriangle size={14} />
              {stats.unconnectedDevices} device{stats.unconnectedDevices > 1 ? 's' : ''} need power
            </span>
          )}
        </div>
      </div>

      {/* Power Distribution Devices */}
      {powerDevices.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
            <Zap size={14} className="text-amber-400" />
            Power Distribution ({powerDevices.length})
          </h3>
          <div className="space-y-2">
            {powerDevices.map(eq => (
              <EquipmentPowerCard
                key={eq.id}
                equipment={eq}
                connections={connections}
                onOutletDrop={handleOutletDrop}
                onDisconnect={handleDisconnect}
                onOutletMouseEnter={handleOutletMouseEnter}
                onOutletMouseLeave={handleOutletMouseLeave}
                outletRefs={outletRefs}
                inputRefs={inputRefs}
                onInputDragStart={handleInputDragStart}
                onInputDragEnd={handleInputDragEnd}
                onInputClick={handleInputClick}
              />
            ))}
          </div>
        </div>
      )}

      {/* Regular Devices */}
      {regularDevices.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
            <Plug size={14} className="text-zinc-400" />
            Devices ({regularDevices.length})
            {unconnectedDevices.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/50 text-red-400 border border-red-700">
                {unconnectedDevices.length} need power
              </span>
            )}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {regularDevices.map(eq => (
              <EquipmentPowerCard
                key={eq.id}
                equipment={eq}
                connections={connections}
                onInputDragStart={handleInputDragStart}
                onInputDragEnd={handleInputDragEnd}
                onInputClick={handleInputClick}
                inputRefs={inputRefs}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {equipment.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          <Plug size={48} className="mx-auto mb-4 opacity-30" />
          <p>No equipment in this rack</p>
          <p className="text-sm mt-1">Add equipment to manage power connections</p>
        </div>
      )}

      {/* Quick Add Power Strip */}
      {onAddPowerStrip && (
        <button
          onClick={onAddPowerStrip}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-zinc-700 rounded-lg text-zinc-400 hover:border-violet-500 hover:text-violet-400 transition-colors"
        >
          <Plus size={16} />
          <span>Add Power Strip</span>
        </button>
      )}
    </div>
  );
};

PowerConnectionsView.propTypes = {
  equipment: PropTypes.array,
  connections: PropTypes.array,
  onCreateConnection: PropTypes.func,
  onDeleteConnection: PropTypes.func,
  onAddPowerStrip: PropTypes.func,
  projectId: PropTypes.string,
};

export default memo(PowerConnectionsView);
