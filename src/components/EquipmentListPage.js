import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import Button from './ui/Button';
import { ArrowLeft, RefreshCw, Search, Building, Layers, Package, Box, Cable } from 'lucide-react';
import { projectEquipmentService } from '../services/projectEquipmentService';
import { enhancedStyles } from '../styles/styleSystem';
import { supabase } from '../lib/supabase';

const mapEquipmentRecord = (item) => {
  const name = item.name || item.global_part?.name || 'Unnamed Equipment';
  const partNumber = item.part_number || item.global_part?.part_number || null;
  const manufacturer = item.manufacturer || item.global_part?.manufacturer || null;
  const model = item.model || item.global_part?.model || null;
  const roomName = item.project_rooms?.name || 'Unassigned';
  const installSide = item.install_side || (item.project_rooms?.is_headend ? 'head_end' : 'room_end');

  return {
    id: item.id,
    name,
    partNumber,
    manufacturer,
    model,
    room: roomName,
    isHeadend: installSide === 'head_end' || Boolean(item.project_rooms?.is_headend),
    installSide,
    plannedQuantity: item.planned_quantity || 0,
    ordered: Boolean(item.ordered_confirmed),
    orderedAt: item.ordered_confirmed_at || null,
    onsite: Boolean(item.onsite_confirmed),
    onsiteAt: item.onsite_confirmed_at || null,
    notes: item.notes || '',
    searchIndex: [
      name,
      partNumber,
      manufacturer,
      model,
      roomName,
      installSide === 'head_end' ? 'head-end' : 'room-end'
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
  };
};

const withAlpha = (hex, alpha) => {
  if (!hex || !hex.startsWith('#') || (hex.length !== 7 && hex.length !== 4)) return hex;
  const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const r = parseInt(full.slice(1, 3), 16);
  const g = parseInt(full.slice(3, 5), 16);
  const b = parseInt(full.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const EquipmentListPage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { theme, mode } = useTheme();
  const palette = theme.palette;
  const sectionStyles = enhancedStyles.sections[mode];

  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusUpdating, setStatusUpdating] = useState(null);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('all');
  const [installFilter, setInstallFilter] = useState('all');

  const cardStyles = useMemo(() => {
    const cardBackground = mode === 'dark' ? '#1F2937' : '#FFFFFF';
    const mutedBackground = mode === 'dark' ? '#111827' : '#F3F4F6';
    const borderColor = mode === 'dark' ? '#374151' : '#E5E7EB';
    const textPrimary = mode === 'dark' ? '#F9FAFB' : '#111827';
    const textSecondary = mode === 'dark' ? '#A1A1AA' : '#4B5563';

    return {
      header: {
        borderColor,
        backgroundColor: cardBackground,
        boxShadow: sectionStyles.card.boxShadow,
        color: textPrimary
      },
      mutedCard: {
        backgroundColor: mutedBackground,
        borderColor,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: sectionStyles.card.borderRadius,
        color: textPrimary
      },
      card: {
        backgroundColor: cardBackground,
        borderColor,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: sectionStyles.card.borderRadius,
        boxShadow: sectionStyles.card.boxShadow,
        color: textPrimary
      },
      textPrimary,
      textSecondary
    };
  }, [mode, sectionStyles]);

  const loadEquipment = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await projectEquipmentService.fetchProjectEquipment(projectId);

      // Fetch wire drop links for all equipment
      const equipmentIds = data.map(eq => eq.id);
      const { data: wireDropLinks, error: linksError } = await supabase
        .from('wire_drop_equipment_links')
        .select(`
          equipment_id,
          link_side,
          wire_drops (
            id,
            name,
            drop_name,
            type
          )
        `)
        .in('equipment_id', equipmentIds);

      if (linksError) {
        console.warn('Failed to load wire drop links:', linksError);
      }

      // Map wire drop links to equipment
      const wireDropsByEquipment = {};
      wireDropLinks?.forEach(link => {
        if (!wireDropsByEquipment[link.equipment_id]) {
          wireDropsByEquipment[link.equipment_id] = [];
        }
        wireDropsByEquipment[link.equipment_id].push({
          wireDropId: link.wire_drops.id,
          wireDropName: link.wire_drops.drop_name || link.wire_drops.name,
          wireDropType: link.wire_drops.type,
          linkSide: link.link_side
        });
      });

      // Add wire drops to mapped equipment
      const mapped = (data || []).map(item => ({
        ...mapEquipmentRecord(item),
        wireDrops: wireDropsByEquipment[item.id] || []
      }));

      setEquipment(mapped);
    } catch (err) {
      console.error('Failed to load project equipment:', err);
      setError(err.message || 'Failed to load project equipment');
      setEquipment([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadEquipment();
  }, [loadEquipment]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const rooms = useMemo(() => {
    const uniqueRooms = new Set();
    equipment.forEach((item) => {
      if (item.room) uniqueRooms.add(item.room);
    });
    return Array.from(uniqueRooms).sort((a, b) => a.localeCompare(b));
  }, [equipment]);

  const filteredEquipment = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return equipment.filter((item) => {
      if (selectedRoom !== 'all' && item.room !== selectedRoom) return false;
      if (installFilter !== 'all' && item.installSide !== installFilter) return false;
      if (query && !item.searchIndex.includes(query)) return false;
      return true;
    });
  }, [equipment, searchQuery, selectedRoom, installFilter]);

  const groupedEquipment = useMemo(() => {
    const groups = new Map();

    filteredEquipment.forEach((item) => {
      const roomKey = item.room || 'Unassigned';
      if (!groups.has(roomKey)) {
        groups.set(roomKey, {
          room: roomKey,
          headEnd: [],
          roomEnd: []
        });
      }
      const group = groups.get(roomKey);
      if (item.isHeadend) {
        group.headEnd.push(item);
      } else {
        group.roomEnd.push(item);
      }
    });

    return Array.from(groups.values()).map((group) => ({
      ...group,
      headEnd: group.headEnd.sort((a, b) => a.name.localeCompare(b.name)),
      roomEnd: group.roomEnd.sort((a, b) => a.name.localeCompare(b.name)),
      total: group.headEnd.length + group.roomEnd.length
    }));
  }, [filteredEquipment]);

  const totalItems = equipment.length;
  const headEndCount = equipment.filter((item) => item.isHeadend).length;
  const roomEndCount = totalItems - headEndCount;

  const toggleStatus = async (equipmentId, field, value) => {
    try {
      setStatusUpdating(equipmentId);
      const payload = { userId: null };

      if (field === 'ordered') {
        payload.ordered = value;
        if (!value) {
          payload.onsite = false;
        }
      } else if (field === 'onsite') {
        payload.onsite = value;
        if (value) {
          payload.ordered = true;
        }
      }

      const updated = await projectEquipmentService.updateProcurementStatus(equipmentId, payload);
      setEquipment((prev) =>
        prev.map((item) => (item.id === equipmentId ? mapEquipmentRecord(updated) : item))
      );
    } catch (err) {
      console.error('Failed to update equipment status:', err);
      alert(err.message || 'Failed to update equipment status');
    } finally {
      setStatusUpdating(null);
    }
  };

  const renderEquipmentRow = (item) => (
    <div
      key={item.id}
      className="rounded-xl border px-3 py-3 text-sm transition hover:border-violet-400 dark:hover:border-violet-500"
      style={{
        borderColor: mode === 'dark' ? '#374151' : '#E5E7EB',
        backgroundColor: mode === 'dark' ? '#111827' : '#F9FAFB'
      }}
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900 dark:text-gray-100">{item.name}</p>
            {item.partNumber && (
              <p className="text-xs text-gray-500 dark:text-gray-400">Part #{item.partNumber}</p>
            )}
          </div>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              backgroundColor: withAlpha(
                item.isHeadend ? palette.accent : palette.info,
                mode === 'dark' ? 0.18 : 0.12
              ),
              color: item.isHeadend ? palette.accent : palette.info
            }}
          >
            <Box className="h-3 w-3" />
            {item.isHeadend ? 'Head-End' : 'Room End'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 text-xs text-gray-600 dark:text-gray-400">
          {item.manufacturer && <span>Manufacturer: {item.manufacturer}</span>}
          {item.model && <span>Model: {item.model}</span>}
          <span>Planned Qty: {item.plannedQuantity || 1}</span>
        </div>

        <div className="flex flex-wrap gap-4 text-xs">
          <label className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              checked={item.ordered}
              onChange={(e) => toggleStatus(item.id, 'ordered', e.target.checked)}
              disabled={statusUpdating === item.id}
            />
            <span className="font-medium">Ordered</span>
            {item.orderedAt && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                {new Date(item.orderedAt).toLocaleDateString()}
              </span>
            )}
          </label>

          <label className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
              checked={item.onsite}
              onChange={(e) => toggleStatus(item.id, 'onsite', e.target.checked)}
              disabled={statusUpdating === item.id}
            />
            <span className="font-medium">Onsite</span>
            {item.onsiteAt && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                {new Date(item.onsiteAt).toLocaleDateString()}
              </span>
            )}
          </label>
        </div>

        {item.notes && (
          <p className="text-xs italic text-gray-500 dark:text-gray-400">Notes: {item.notes}</p>
        )}

        {/* Wire Drop Links */}
        {item.wireDrops && item.wireDrops.length > 0 && (
          <div className="pt-3 mt-3 border-t" style={{ borderColor: mode === 'dark' ? '#374151' : '#E5E7EB' }}>
            <div className="flex items-center gap-2 mb-2">
              <Cable size={14} className="text-violet-500" />
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                Connected Wire Drops
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {item.wireDrops.map(wd => (
                <button
                  key={wd.wireDropId}
                  onClick={() => navigate(`/wire-drops/${wd.wireDropId}`)}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:hover:bg-violet-900/50"
                >
                  <span>{wd.wireDropName}</span>
                  {wd.wireDropType && (
                    <span className="text-[10px] opacity-75">({wd.wireDropType})</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div
          className="h-12 w-12 animate-spin rounded-full border-b-2"
          style={{ borderColor: palette.accent }}
        />
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${mode === 'dark' ? 'bg-gray-900' : 'bg-gray-50'} pb-20`}>
      <section className="px-4 py-4 space-y-4">
        <div className="rounded-2xl border p-4 shadow-sm" style={cardStyles.mutedCard}>
          <div className="space-y-4">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, part number, manufacturer, or model"
                className="w-full rounded-lg border pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                style={{
                  backgroundColor: mode === 'dark' ? '#0F172A' : '#FFFFFF',
                  borderColor: mode === 'dark' ? '#1F2937' : '#E5E7EB',
                  color: cardStyles.textPrimary
                }}
              />
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Building size={16} className="text-gray-400" />
                <select
                  value={selectedRoom}
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  className="rounded-lg border px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  style={{
                    backgroundColor: mode === 'dark' ? '#0F172A' : '#FFFFFF',
                    borderColor: mode === 'dark' ? '#1F2937' : '#D1D5DB'
                  }}
                >
                  <option value="all">All Rooms</option>
                  {rooms.map((room) => (
                    <option key={room} value={room}>
                      {room}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Layers size={16} className="text-gray-400" />
                <select
                  value={installFilter}
                  onChange={(e) => setInstallFilter(e.target.value)}
                  className="rounded-lg border px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  style={{
                    backgroundColor: mode === 'dark' ? '#0F172A' : '#FFFFFF',
                    borderColor: mode === 'dark' ? '#1F2937' : '#D1D5DB'
                  }}
                >
                  <option value="all">Head &amp; Room Equipment</option>
                  <option value="head_end">Head-End Only</option>
                  <option value="room_end">Room-End Only</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {groupedEquipment.length === 0 ? (
          <div
            className="rounded-2xl border px-6 py-12 text-center text-sm"
            style={cardStyles.card}
          >
            <Package className="mx-auto h-10 w-10 text-gray-400" />
            <p className="mt-3 font-medium text-gray-700 dark:text-gray-200">
              No equipment matches your filters.
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Try clearing your search or check the Project Manager view to confirm the import.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedEquipment.map((group) => (
              <div key={group.room} className="rounded-2xl border p-4 shadow-sm" style={cardStyles.card}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                      {group.room}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {group.total} item{group.total === 1 ? '' : 's'} •{' '}
                      {group.headEnd.length} head-end / {group.roomEnd.length} room-end
                    </p>
                  </div>
                </div>

                {group.headEnd.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-purple-500">
                      Head-End Equipment
                    </p>
                    <div className="space-y-3">
                      {group.headEnd.map((item) => renderEquipmentRow(item))}
                    </div>
                  </div>
                )}

                {group.roomEnd.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-500">
                      Room Equipment
                    </p>
                    <div className="space-y-3">
                      {group.roomEnd.map((item) => renderEquipmentRow(item))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default EquipmentListPage;
