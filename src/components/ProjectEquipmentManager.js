import React, { useEffect, useMemo, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';
import Button from './ui/Button';
import { projectEquipmentService } from '../services/projectEquipmentService';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useAuth } from '../contexts/AuthContext';

const groupEquipmentByRoom = (equipment = []) => {
  const groups = new Map();
  equipment.forEach((item) => {
    const roomName = item.project_rooms?.name || 'Unassigned';
    if (!groups.has(roomName)) {
      groups.set(roomName, []);
    }
    groups.get(roomName).push(item);
  });
  return Array.from(groups.entries()).map(([roomName, items]) => ({
    roomName,
    isHeadEnd: items.some((item) => item.project_rooms?.is_headend),
    items: items.sort((a, b) => a.name.localeCompare(b.name))
  }));
};

const formatCurrency = (value) =>
  Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));

const formatNumber = (value) =>
  Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(Number(value || 0));

const ProjectEquipmentManager = ({
  projectId,
  embedded = false,
  onImportComplete,
  onEquipmentChange
}) => {
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  const { user } = useAuth();

  const [equipment, setEquipment] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadSummary, setUploadSummary] = useState(null);
  const [importMode, setImportMode] = useState('append'); // Default to append for safety

  const loadData = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const [equipmentData, roomData] = await Promise.all([
        projectEquipmentService.fetchProjectEquipment(projectId),
        projectEquipmentService.fetchRooms(projectId)
      ]);
      const normalizedEquipment = equipmentData || [];
      setEquipment(normalizedEquipment);
      setRooms(roomData || []);
      if (onEquipmentChange) {
        onEquipmentChange(normalizedEquipment);
      }
    } catch (err) {
      console.error('Failed to load project equipment:', err);
      setError(err.message || 'Failed to load equipment data');
    } finally {
      setLoading(false);
    }
  }, [projectId, onEquipmentChange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setUploadSummary(null);

    try {
      const summary = await projectEquipmentService.importCsv(projectId, file, {
        userId: user?.id,
        mode: importMode
      });
      const summaryWithMode = { ...summary, mode: importMode };
      setUploadSummary(summaryWithMode);
      await loadData();
      if (onImportComplete) {
        onImportComplete(summaryWithMode);
      }
    } catch (err) {
      console.error('CSV import failed:', err);
      setError(err.message || 'Failed to import equipment list');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const groupedEquipment = useMemo(() => groupEquipmentByRoom(equipment), [equipment]);

  const handleStatusToggle = useCallback(
    async (equipmentId, field, value) => {
      const payload = {};

      const currentItem = equipment.find((item) => item.id === equipmentId);

      if (field === 'ordered') {
        payload.ordered = value;
        if (!value && currentItem?.delivered_confirmed) {
          payload.delivered = false;
        }
      } else if (field === 'delivered') {
        payload.delivered = value;
        if (value && !currentItem?.ordered_confirmed) {
          payload.ordered = true;
        }
      }

      payload.userId = user?.id || null;

      try {
        const updatedRecord = await projectEquipmentService.updateProcurementStatus(
          equipmentId,
          payload
        );

        setEquipment((prev) => {
          const next = prev.map((item) =>
            item.id === equipmentId ? { ...item, ...updatedRecord } : item
          );
          if (onEquipmentChange) {
            onEquipmentChange(next);
          }
          return next;
        });
      } catch (statusError) {
        console.error('Failed to update equipment status:', statusError);
        alert(statusError.message || 'Failed to update equipment status');
      }
    },
    [equipment, onEquipmentChange, user?.id]
  );

  const renderUploadStatus = () => {
    if (uploading) {
      return (
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Upload in progress… parsing CSV and updating project equipment.
        </div>
      );
    }

    if (uploadSummary) {
      return (
        <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle className="h-4 w-4" />
            Import complete
          </div>
          <p className="mt-1 text-xs uppercase tracking-wide text-green-700">
            Mode: {uploadSummary.mode === 'merge' ? 'Update' : uploadSummary.mode === 'append' ? 'Append' : 'Replace'}
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            <li>Equipment added: {uploadSummary.equipmentInserted}</li>
            <li>Equipment updated: {uploadSummary.equipmentUpdated}</li>
            <li>Labor added: {uploadSummary.laborInserted}</li>
            <li>Labor updated: {uploadSummary.laborUpdated}</li>
            <li>New rooms created: {uploadSummary.roomsCreated}</li>
          </ul>
        </div>
      );
    }

    if (error) {
      return (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        </div>
      );
    }

    return null;
  };

  const renderGroupedEquipment = () => {
    if (loading) {
      return <p className="text-sm text-gray-500">Loading equipment…</p>;
    }

    if (!groupedEquipment.length) {
      return <p className="text-sm text-gray-500">No equipment imported yet.</p>;
    }

    return groupedEquipment.map(({ roomName, isHeadEnd, items }) => (
      <div key={roomName} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {roomName}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {isHeadEnd ? 'Head-end' : 'Room'} equipment • {items.length} item(s)
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{item.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {item.manufacturer ? `${item.manufacturer} • ` : ''}
                    {item.model || 'No model'}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    isHeadEnd
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-200'
                      : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200'
                  }`}
                >
                  {isHeadEnd ? 'Head-end' : 'Room'}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300 md:grid-cols-4">
                <div>
                  <span className="block text-[10px] uppercase tracking-wide text-gray-400">
                    Quantity
                  </span>
                  {formatNumber(item.planned_quantity)}
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wide text-gray-400">
                    Unit Price
                  </span>
                  {formatCurrency(item.unit_price)}
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wide text-gray-400">
                    Supplier
                  </span>
                  {item.supplier || '—'}
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wide text-gray-400">
                    Type
                  </span>
                  {item.equipment_type}
                </div>
              </div>
              {item.description && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
              )}
              {(item.equipment_type === 'part' ||
                item.equipment_type === 'other' ||
                !item.equipment_type) && (
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                  <label className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-300">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                      checked={Boolean(item.ordered_confirmed)}
                      onChange={(event) =>
                        handleStatusToggle(item.id, 'ordered', event.target.checked)
                      }
                    />
                    <span className="font-medium">Ordered</span>
                    {item.ordered_confirmed_at && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {new Date(item.ordered_confirmed_at).toLocaleDateString()}
                      </span>
                    )}
                  </label>
                  <label className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-300">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                      checked={Boolean(item.delivered_confirmed)}
                      onChange={(event) =>
                        handleStatusToggle(item.id, 'delivered', event.target.checked)
                      }
                    />
                    <span className="font-medium">Delivered</span>
                    {item.delivered_confirmed_at && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {new Date(item.delivered_confirmed_at).toLocaleDateString()}
                      </span>
                    )}
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    ));
  };

  const containerStyle = embedded ? undefined : sectionStyles.card;
  const containerClasses = embedded ? 'space-y-6' : 'space-y-6 p-6';

  return (
    <div style={containerStyle} className={containerClasses}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Project Equipment &amp; Labor
          </h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Import proposal CSVs to populate wire-drop equipment lists and labor budgets. Use replace to clear prior imports or merge to layer change orders without touching manual entries.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-700 dark:text-gray-200">Import mode:</span>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                value="replace"
                checked={importMode === 'replace'}
                onChange={() => setImportMode('replace')}
              />
              <span>Replace</span>
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                value="append"
                checked={importMode === 'append'}
                onChange={() => setImportMode('append')}
              />
              <span>Append</span>
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                value="merge"
                checked={importMode === 'merge'}
                onChange={() => setImportMode('merge')}
              />
              <span>Update</span>
            </label>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
            <strong>Replace:</strong> Deletes all existing, imports fresh. <strong>Append:</strong> Adds all items as new. <strong>Update:</strong> Updates existing, adds new.
          </p>
          <label className="inline-flex items-center">
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <span>
            <Button
              variant="primary"
              size="sm"
              icon={Upload}
              disabled={uploading}
              onClick={(e) => {
                e.preventDefault();
                e.currentTarget.parentElement?.previousSibling?.click();
              }}
            >
              {uploading ? 'Uploading…' : 'Upload CSV'}
            </Button>
          </span>
        </label>
        </div>
      </div>

      {renderUploadStatus()}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-indigo-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <rect x="8" y="8" width="8" height="10" />
            </svg>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Equipment by room
            </h4>
          </div>
          <div className="space-y-4">{renderGroupedEquipment()}</div>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <svg
              className="h-4 w-4 text-amber-500"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <rect x="8" y="8" width="8" height="10" />
            </svg>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Rooms overview
            </h4>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Head-end rooms are highlighted in purple within the wire drop selector.
            </p>
            {rooms.length === 0 ? (
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                No rooms have been imported yet.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {rooms.map((room) => (
                  <li key={room.id} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-200">{room.name}</span>
                    <span
                      className={`text-xs ${
                        room.is_headend
                          ? 'text-purple-600 dark:text-purple-300'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}
                    >
                      {room.is_headend ? 'Head-end' : 'Room'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

ProjectEquipmentManager.propTypes = {
  projectId: PropTypes.string,
  embedded: PropTypes.bool,
  onImportComplete: PropTypes.func,
  onEquipmentChange: PropTypes.func
};

export default ProjectEquipmentManager;
