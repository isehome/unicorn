import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { usePrinter } from '../contexts/PrinterContext';
import { enhancedStyles } from '../styles/styleSystem';
import {
  Printer,
  Camera,
  Loader,
  Check,
  Bluetooth,
  BluetoothOff,
  Search,
  X,
  Eye,
  EyeOff
} from 'lucide-react';
import { wireDropService } from '../services/wireDropService';
import labelRenderService from '../services/labelRenderService';
import PrewirePhotoModal from './PrewirePhotoModal';
import PrintLabelModal from './PrintLabelModal';
import { getWireDropBadgeColor, getWireDropBadgeLetter, getWireDropBadgeTextColor } from '../utils/wireDropVisuals';

/**
 * PrewireMode - Dedicated view for technicians during prewire phase
 * Features:
 * - Print 2x QR labels per wire drop
 * - Quick photo capture for prewire completion
 * - Sorted by room, then by labels_printed status (unprinted first)
 * - Filter by floor and room
 */
const PrewireMode = () => {
  const { mode } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const sectionStyles = enhancedStyles.sections[mode];

  // Data states
  const [wireDrops, setWireDrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [project, setProject] = useState(null);

  // Filter states
  const [selectedFloor, setSelectedFloor] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showPrinted, setShowPrinted] = useState(true); // Toggle to show/hide already printed

  // Printer states
  const { connected: printerConnected, printLabel: printerPrintLabel } = usePrinter();
  const [printingDropId, setPrintingDropId] = useState(null);

  // Photo modal state
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [selectedDropForPhoto, setSelectedDropForPhoto] = useState(null);

  // Print modal state
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [selectedDropForPrint, setSelectedDropForPrint] = useState(null);

  // Get current user name/email for tracking
  const getCurrentUserEmail = useCallback(() => (
    user?.email ||
    user?.account?.username ||
    user?.user_metadata?.email ||
    'Unknown User'
  ), [user]);

  const getCurrentUserName = useCallback(() => (
    user?.user_metadata?.full_name ||
    user?.full_name ||
    user?.displayName ||
    user?.email ||
    user?.account?.username ||
    'Unknown User'
  ), [user]);

  // Load wire drops
  useEffect(() => {
    loadWireDrops();
  }, [projectId]);

  const loadWireDrops = async () => {
    if (!projectId) {
      setError('No project selected. Please access Prewire Mode from a project.');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Load project info
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('name, id')
        .eq('id', projectId)
        .single();

      if (projectError) throw projectError;
      setProject(projectData);

      // Load wire drops with stages
      const { data, error: wireDropsError } = await supabase
        .from('wire_drops')
        .select(`
          *,
          wire_drop_stages(
            stage_type,
            completed,
            completed_at,
            photo_url
          )
        `)
        .eq('project_id', projectId)
        .order('room_name')
        .order('labels_printed')
        .order('drop_name');

      if (wireDropsError) throw wireDropsError;

      setWireDrops(data || []);
    } catch (err) {
      console.error('Failed to load wire drops:', err);
      setError(err.message || 'Failed to load wire drops');
    } finally {
      setLoading(false);
    }
  };

  // Get unique floors for filter
  const availableFloors = useMemo(() => {
    const floors = new Set();
    wireDrops.forEach(drop => {
      if (drop.floor) floors.add(drop.floor);
    });
    return Array.from(floors).sort();
  }, [wireDrops]);

  // Get unique rooms for filter (filtered by selected floor)
  const availableRooms = useMemo(() => {
    const rooms = new Set();
    wireDrops.forEach(drop => {
      if (drop.room_name) {
        // If floor is selected, only show rooms on that floor
        if (!selectedFloor || drop.floor === selectedFloor) {
          rooms.add(drop.room_name);
        }
      }
    });
    return Array.from(rooms).sort();
  }, [wireDrops, selectedFloor]);

  // Filter and sort wire drops
  const filteredDrops = useMemo(() => {
    let filtered = wireDrops;

    // Apply floor filter
    if (selectedFloor) {
      filtered = filtered.filter(drop => drop.floor === selectedFloor);
    }

    // Apply room filter
    if (selectedRoom) {
      filtered = filtered.filter(drop => drop.room_name === selectedRoom);
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(drop =>
        (drop.drop_name || '').toLowerCase().includes(term) ||
        (drop.room_name || '').toLowerCase().includes(term) ||
        (drop.uid || '').toLowerCase().includes(term) ||
        (drop.wire_type || '').toLowerCase().includes(term)
      );
    }

    // Apply printed filter (hide printed if toggled off)
    if (!showPrinted) {
      filtered = filtered.filter(drop => !drop.labels_printed);
    }

    // Sort by room_name, then by labels_printed (false first), then by drop_name
    return [...filtered].sort((a, b) => {
      // First by room name
      const roomCompare = (a.room_name || '').localeCompare(b.room_name || '');
      if (roomCompare !== 0) return roomCompare;

      // Then by labels_printed (false/unprinted first)
      if (a.labels_printed !== b.labels_printed) {
        return a.labels_printed ? 1 : -1;
      }

      // Finally by drop name
      return (a.drop_name || '').localeCompare(b.drop_name || '');
    });
  }, [wireDrops, selectedFloor, selectedRoom, searchTerm, showPrinted]);

  // Check if prewire stage is complete
  const isPrewireComplete = (drop) => {
    const prewireStage = drop.wire_drop_stages?.find(s => s.stage_type === 'prewire');
    return Boolean(prewireStage?.completed);
  };

  // Open print modal
  const handleOpenPrintModal = (drop, e) => {
    e.stopPropagation();
    setSelectedDropForPrint(drop);
    setPrintModalOpen(true);
  };

  // Handle print labels - if no exception is thrown, consider it successful
  // Note: Brady SDK printBitmap can return false even when print succeeds
  const handlePrintLabels = async (drop, copies) => {
    setPrintingDropId(drop.id);

    try {
      // Generate label bitmap
      const bitmap = await labelRenderService.generateWireDropLabelBitmap(drop);

      // Print with specified copies and cut after each
      // Note: printerPrintLabel may return false even on success due to SDK quirks
      // If no exception is thrown, the print job was sent successfully
      await printerPrintLabel(bitmap, copies, true);

      // Mark labels as printed in database (print job was sent without error)
      await wireDropService.markLabelsPrinted(drop.id, getCurrentUserEmail());

      // Update local state
      setWireDrops(prev => prev.map(d =>
        d.id === drop.id
          ? { ...d, labels_printed: true, labels_printed_at: new Date().toISOString() }
          : d
      ));

      console.log(`Successfully printed ${copies} label(s) for ${drop.uid}`);
      return true;
    } catch (err) {
      console.error('Print error:', err);
      throw err; // Let the modal handle the error display
    } finally {
      setPrintingDropId(null);
    }
  };

  // Handle manual mark as printed toggle
  const handleMarkPrinted = async (wireDropId, printed) => {
    try {
      if (printed) {
        // Mark as printed
        await wireDropService.markLabelsPrinted(wireDropId, getCurrentUserEmail());
        setWireDrops(prev => prev.map(d =>
          d.id === wireDropId
            ? { ...d, labels_printed: true, labels_printed_at: new Date().toISOString() }
            : d
        ));
      } else {
        // Unmark as printed
        await wireDropService.unmarkLabelsPrinted(wireDropId);
        setWireDrops(prev => prev.map(d =>
          d.id === wireDropId
            ? { ...d, labels_printed: false, labels_printed_at: null }
            : d
        ));
      }
    } catch (err) {
      console.error('Failed to update printed status:', err);
      alert(`Failed to update status: ${err.message}`);
    }
  };

  // Handle photo capture
  const handleOpenPhotoModal = (drop, e) => {
    e.stopPropagation();
    setSelectedDropForPhoto(drop);
    setPhotoModalOpen(true);
  };

  const handlePhotoUploaded = (wireDropId) => {
    // Update local state to show prewire is now complete
    setWireDrops(prev => prev.map(d => {
      if (d.id === wireDropId) {
        const updatedStages = (d.wire_drop_stages || []).map(s =>
          s.stage_type === 'prewire'
            ? { ...s, completed: true, completed_at: new Date().toISOString() }
            : s
        );
        // If no prewire stage existed, add one
        if (!updatedStages.find(s => s.stage_type === 'prewire')) {
          updatedStages.push({
            stage_type: 'prewire',
            completed: true,
            completed_at: new Date().toISOString()
          });
        }
        return { ...d, wire_drop_stages: updatedStages };
      }
      return d;
    }));
  };

  // Reset room filter when floor changes
  useEffect(() => {
    setSelectedRoom('');
  }, [selectedFloor]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center">
        <div className="text-center space-y-4 px-4">
          <p className="text-red-500 dark:text-red-400">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white rounded-lg font-medium transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 transition-colors pb-20">
      <div className="w-full px-3 sm:px-4 py-6">
        {/* Project name and printer status */}
        <div className="flex items-center justify-between mb-6">
          {project && (
            <p className="text-zinc-600 dark:text-zinc-400 font-medium">
              {project.name}
            </p>
          )}

          {/* Printer status indicator */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
              !printerConnected ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400' : ''
            }`}
            style={printerConnected ? {
              backgroundColor: 'rgba(148, 175, 50, 0.15)',
              color: '#94AF32'
            } : undefined}
          >
            {printerConnected ? (
              <>
                <Bluetooth size={16} />
                Printer Connected
              </>
            ) : (
              <>
                <BluetoothOff size={16} />
                Printer Disconnected
              </>
            )}
          </div>
        </div>

        {/* Filters */}
        <div
          className="rounded-2xl border p-4 mb-6"
          style={sectionStyles.card}
        >
          {/* Search bar - full width on top */}
          <div className="relative mb-3">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="text"
              placeholder="Search drops, rooms, wire types..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-10 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-500"
              style={{
                backgroundColor: mode === 'dark' ? '#18181b' : '#FFFFFF',
                borderColor: mode === 'dark' ? '#27272a' : '#D1D5DB',
                color: mode === 'dark' ? '#f4f4f5' : '#18181b',
                fontSize: '16px' // Prevents iOS zoom
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X size={18} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Floor filter */}
            {availableFloors.length > 0 && (
              <select
                value={selectedFloor}
                onChange={(e) => setSelectedFloor(e.target.value)}
                className="rounded-lg border px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
                style={{
                  backgroundColor: mode === 'dark' ? '#18181b' : '#FFFFFF',
                  borderColor: mode === 'dark' ? '#27272a' : '#D1D5DB',
                  color: mode === 'dark' ? '#f4f4f5' : '#18181b'
                }}
              >
                <option value="">All Floors</option>
                {availableFloors.map(floor => (
                  <option key={floor} value={floor}>{floor}</option>
                ))}
              </select>
            )}

            {/* Room filter */}
            {availableRooms.length > 0 && (
              <select
                value={selectedRoom}
                onChange={(e) => setSelectedRoom(e.target.value)}
                className="rounded-lg border px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
                style={{
                  backgroundColor: mode === 'dark' ? '#18181b' : '#FFFFFF',
                  borderColor: mode === 'dark' ? '#27272a' : '#D1D5DB',
                  color: mode === 'dark' ? '#f4f4f5' : '#18181b'
                }}
              >
                <option value="">All Rooms</option>
                {availableRooms.map(room => (
                  <option key={room} value={room}>{room}</option>
                ))}
              </select>
            )}

            {/* Show/Hide printed toggle */}
            <button
              onClick={() => setShowPrinted(!showPrinted)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors ${
                showPrinted
                  ? 'border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400'
                  : 'border-violet-500 bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400'
              }`}
              title={showPrinted ? 'Click to hide printed labels' : 'Click to show all labels'}
            >
              {showPrinted ? <Eye size={16} /> : <EyeOff size={16} />}
              <span className="text-sm font-medium">
                {showPrinted ? 'Showing All' : 'Unprinted Only'}
              </span>
            </button>

            {/* Stats */}
            <div className="ml-auto text-sm text-zinc-600 dark:text-zinc-400">
              {filteredDrops.filter(d => d.labels_printed).length} / {filteredDrops.length} printed
            </div>
          </div>
        </div>

        {/* Wire Drops List */}
        <div
          className="rounded-2xl border"
          style={sectionStyles.card}
        >
          {filteredDrops.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-zinc-500 dark:text-zinc-400">
                No wire drops found for this project.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-700">
              {filteredDrops.map((drop) => {
                const prewireComplete = isPrewireComplete(drop);
                const badgeColor = getWireDropBadgeColor(drop);
                const badgeLetter = getWireDropBadgeLetter(drop);
                const badgeTextColor = getWireDropBadgeTextColor(badgeColor);

                return (
                  <div
                    key={drop.id}
                    className="p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      {/* Badge */}
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center shadow-sm flex-shrink-0"
                        style={{
                          backgroundColor: badgeColor,
                          border: '2px solid rgba(17, 24, 39, 0.08)',
                          color: badgeTextColor
                        }}
                      >
                        <span className="text-sm font-bold">{badgeLetter}</span>
                      </div>

                      {/* Drop info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-zinc-900 dark:text-white truncate">
                          {drop.drop_name || 'Unnamed Drop'}
                        </h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          {drop.room_name}
                          {drop.wire_type && ` • ${drop.wire_type}`}
                        </p>
                      </div>

                      {/* Actions - Print Labels (left) and Photo (right) */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {/* Print labels button - opens modal */}
                        <button
                          type="button"
                          onClick={(e) => handleOpenPrintModal(drop, e)}
                          className="px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-white min-h-[44px] touch-manipulation active:opacity-80"
                          style={{
                            backgroundColor: drop.labels_printed ? '#94AF32' : '#8B5CF6'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = drop.labels_printed ? '#7A9229' : '#7C3AED'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = drop.labels_printed ? '#94AF32' : '#8B5CF6'}
                          title={drop.labels_printed ? 'Labels already printed (click to reprint)' : 'Print wire labels'}
                        >
                          <Printer size={16} />
                          <span className="hidden sm:inline">
                            {drop.labels_printed ? 'Reprint' : 'Print'}
                          </span>
                        </button>

                        {/* Photo capture button */}
                        <button
                          onClick={(e) => handleOpenPhotoModal(drop, e)}
                          className="px-3 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 text-white"
                          style={{
                            backgroundColor: prewireComplete ? '#94AF32' : '#8B5CF6'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = prewireComplete ? '#7A9229' : '#7C3AED'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = prewireComplete ? '#94AF32' : '#8B5CF6'}
                          title={prewireComplete ? 'Prewire complete (click to retake photo)' : 'Capture prewire photo'}
                        >
                          {prewireComplete ? <Check size={16} /> : <Camera size={16} />}
                          <span className="hidden sm:inline">
                            {prewireComplete ? 'Done' : 'Photo'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Photo capture modal */}
      <PrewirePhotoModal
        isOpen={photoModalOpen}
        onClose={() => {
          setPhotoModalOpen(false);
          setSelectedDropForPhoto(null);
        }}
        wireDrop={selectedDropForPhoto}
        onPhotoUploaded={handlePhotoUploaded}
        currentUserName={getCurrentUserName()}
      />

      {/* Print labels modal */}
      <PrintLabelModal
        isOpen={printModalOpen}
        onClose={() => {
          setPrintModalOpen(false);
          setSelectedDropForPrint(null);
        }}
        wireDrop={selectedDropForPrint}
        printerConnected={printerConnected}
        onPrint={handlePrintLabels}
        onMarkPrinted={handleMarkPrinted}
        isPrinting={printingDropId === selectedDropForPrint?.id}
      />
    </div>
  );
};

export default PrewireMode;
