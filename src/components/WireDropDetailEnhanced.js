import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useAuth } from '../contexts/AuthContext';
import wireDropService from '../services/wireDropService';
import unifiService from '../services/unifiService';
import { projectEquipmentService } from '../services/projectEquipmentService';
import { projectRoomsService } from '../services/projectRoomsService';
import { supabase } from '../lib/supabase';
import Button from './ui/Button';
import CachedSharePointImage from './CachedSharePointImage';
import QRCode from 'qrcode';
import UniFiClientSelector from './UniFiClientSelector';
import { enqueueUpload } from '../lib/offline';
import { compressImage } from '../lib/images';
import {
  Camera,
  Upload,
  CheckCircle,
  Circle,
  Edit,
  Save,
  X,
  Loader,
  Network,
  Monitor,
  Server,
  Cable,
  Clock,
  User,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Lock,
  WifiOff
} from 'lucide-react';
import { getWireDropBadgeColor, getWireDropBadgeLetter, getWireDropBadgeTextColor } from '../utils/wireDropVisuals';

const normalizeRoomName = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';

const WireDropDetailEnhanced = () => {
  const { id } = useParams();
  const { theme, mode } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const palette = theme.palette;
  const sectionStyles = enhancedStyles.sections[mode];
  
  const [wireDrop, setWireDrop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({});
  
  // Equipment states
  const [projectEquipment, setProjectEquipment] = useState([]);
  const [projectRooms, setProjectRooms] = useState([]);
  const [roomEquipmentSelection, setRoomEquipmentSelection] = useState([]);
  const [headEquipmentSelection, setHeadEquipmentSelection] = useState([]);
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [equipmentError, setEquipmentError] = useState(null);
  const [activeTab, setActiveTab] = useState('prewire');
  const [showFullRecord, setShowFullRecord] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [qrCodeSrc, setQrCodeSrc] = useState(null);
  const [showAllRooms, setShowAllRooms] = useState(false);
  
  // Stage states
  const [uploadingStage, setUploadingStage] = useState(null);
  const [completingCommission, setCompletingCommission] = useState(false);
  const [commissionNotes, setCommissionNotes] = useState('');
  const [savingRoomEquipment, setSavingRoomEquipment] = useState(false);
  const [savingHeadEquipment, setSavingHeadEquipment] = useState(false);
  
  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // UniFi Port Assignment
  const [availableSwitches, setAvailableSwitches] = useState([]);
  const [selectedSwitch, setSelectedSwitch] = useState(null);
  const [availablePorts, setAvailablePorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState(null);
  const [cableLabel, setCableLabel] = useState('');
  const [patchPanelPort, setPatchPanelPort] = useState('');

  const styles = useMemo(() => {
    const cardBackground = mode === 'dark' ? '#1F2937' : '#FFFFFF';
    const mutedBackground = mode === 'dark' ? '#111827' : '#F9FAFB';
    const borderColor = mode === 'dark' ? '#374151' : '#E5E7EB';
    const textPrimary = mode === 'dark' ? '#F9FAFB' : '#111827';
    const textSecondary = mode === 'dark' ? '#A1A1AA' : '#4B5563';
    const subtleText = mode === 'dark' ? '#71717A' : '#6B7280';

    return {
      card: {
        backgroundColor: cardBackground,
        borderColor,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: sectionStyles.card.borderRadius,
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
      textPrimary: { color: textPrimary },
      textSecondary: { color: textSecondary },
      subtleText: { color: subtleText },
      input: {
        backgroundColor: mutedBackground,
        borderColor,
        color: textPrimary
      },
      tabActive: {
        backgroundColor: palette.accent,
        color: '#FFFFFF'
      },
      tabInactive: {
        backgroundColor: mutedBackground,
        color: textSecondary
      },
      warningCard: {
        backgroundColor: mode === 'dark' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(251, 191, 36, 0.08)',
        borderColor: mode === 'dark' ? 'rgba(251, 191, 36, 0.3)' : 'rgba(251, 191, 36, 0.2)',
        borderWidth: 2,
        borderStyle: 'solid',
        borderRadius: sectionStyles.card.borderRadius
      },
      successCard: {
        backgroundColor: mode === 'dark' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(34, 197, 94, 0.08)',
        borderColor: mode === 'dark' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.2)',
        borderWidth: 2,
        borderStyle: 'solid',
        borderRadius: sectionStyles.card.borderRadius
      }
    };
  }, [mode, palette, sectionStyles]);

  useEffect(() => {
    if (!wireDrop) {
      setQrCodeSrc(null);
      return;
    }

    if (wireDrop.qr_code_url) {
      setQrCodeSrc(wireDrop.qr_code_url);
      return;
    }

    if (!wireDrop.uid) {
      setQrCodeSrc(null);
      return;
    }

    let isCancelled = false;

    QRCode.toDataURL(wireDrop.uid, { width: 240, margin: 1 })
      .then((url) => {
        if (!isCancelled) {
          setQrCodeSrc(url);
        }
      })
      .catch((err) => {
        console.error('Failed to generate QR code:', err);
        if (!isCancelled) {
          setQrCodeSrc(null);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [wireDrop]);

  const loadProjectEquipmentOptions = useCallback(
    async (projectId) => {
      try {
        setEquipmentLoading(true);
        setEquipmentError(null);
        const data = await projectEquipmentService.fetchProjectEquipment(projectId);
        setProjectEquipment(data || []);
      } catch (err) {
        console.error('Failed to load project equipment:', err);
        setEquipmentError(err.message || 'Failed to load project equipment');
      } finally {
        setEquipmentLoading(false);
      }
    },
    []
  );

  const loadProjectRooms = useCallback(
    async (projectId) => {
      if (!projectId) return;
      try {
        const rooms = await projectRoomsService.fetchRoomsWithAliases(projectId);
        setProjectRooms(rooms || []);
      } catch (err) {
        console.error('Failed to load project rooms:', err);
      }
    },
    []
  );

  const loadSwitches = useCallback(async (projectId) => {
    if (!projectId) return;

    try {
      const { data } = await supabase
        .from('unifi_switches')
        .select('*, unifi_switch_ports(*)')
        .eq('project_id', projectId)
        .eq('is_active', true);
      
      setAvailableSwitches(data || []);
    } catch (err) {
      console.error('Failed to load switches:', err);
    }
  }, []);

  const loadWireDrop = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await wireDropService.getWireDrop(id);
      
      console.log('[WireDropDetail] Raw data from service:', {
        hasShapeData: !!data.shape_data,
        hasNotes: !!data.notes,
        notesLength: data.notes?.length,
        notesPreview: data.notes?.substring(0, 100)
      });
      
      // Parse shape_data from notes if it's a JSON string
      if (!data.shape_data && data.notes) {
        try {
          const parsed = JSON.parse(data.notes);
          if (parsed && typeof parsed === 'object') {
            data.shape_data = parsed;
            console.log('[WireDropDetail] Successfully parsed shape_data from notes:', {
              hasCustomData: !!parsed.customData,
              customDataKeys: parsed.customData ? Object.keys(parsed.customData) : [],
              wireTypeFromCustomData: parsed.customData?.['Wire Type'],
              roomNameFromCustomData: parsed.customData?.['Room Name'],
              dropTypeFromCustomData: parsed.customData?.['Drop Type'],
              fullParsed: parsed
            });
          }
        } catch (e) {
          console.log('[WireDropDetail] Failed to parse notes as JSON:', e);
        }
      } else if (data.shape_data) {
        console.log('[WireDropDetail] shape_data already exists:', {
          hasCustomData: !!data.shape_data.customData,
          customDataKeys: data.shape_data.customData ? Object.keys(data.shape_data.customData) : [],
          fullShapeData: data.shape_data
        });
      }
      
      setWireDrop(data);
      setEditForm({
        room_name: data.room_name || '',
        drop_name: data.drop_name || '',
        wire_type: data.wire_type || '',
        drop_type: data.drop_type || '',
        install_note: data.install_note || '',
        floor: data.floor || '',
        qr_code_url: data.qr_code_url || '',
        schematic_reference: data.schematic_reference || '',
        notes: data.notes || ''
      });
      
      const equipmentLinks = (data.wire_drop_equipment_links || []).filter(
        (link) => link?.project_equipment?.id
      );
      const roomLinks = equipmentLinks
        .filter((link) => link.link_side === 'room_end')
        .map((link) => link.project_equipment.id);
      const headLinks = equipmentLinks
        .filter((link) => link.link_side === 'head_end')
        .map((link) => link.project_equipment.id);

      setRoomEquipmentSelection(Array.from(new Set(roomLinks)));
      setHeadEquipmentSelection(Array.from(new Set(headLinks)));
    } catch (err) {
      console.error('Failed to load wire drop:', err);
      setError(err.message || 'Failed to load wire drop details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadWireDrop();
  }, [loadWireDrop]);

  useEffect(() => {
    if (wireDrop?.project_id) {
      loadProjectEquipmentOptions(wireDrop.project_id);
      loadSwitches(wireDrop.project_id);
      loadProjectRooms(wireDrop.project_id);
    }
  }, [wireDrop?.project_id, loadProjectEquipmentOptions, loadSwitches, loadProjectRooms]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await wireDropService.updateWireDrop(id, editForm);
      await loadWireDrop(); // Reload to get updated data
      setEditing(false);
    } catch (err) {
      console.error('Failed to save wire drop:', err);
      alert(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditForm({
      room_name: wireDrop.room_name || '',
      drop_name: wireDrop.drop_name || '',
      wire_type: wireDrop.wire_type || '',
      drop_type: wireDrop.drop_type || '',
      install_note: wireDrop.install_note || '',
      floor: wireDrop.floor || '',
      qr_code_url: wireDrop.qr_code_url || '',
      schematic_reference: wireDrop.schematic_reference || '',
      notes: wireDrop.notes || ''
    });
    setEditing(false);
  };

  const handlePhotoUpload = async (stageType, isReUpload = false) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        setUploadingStage(stageType);

        // Compress the image first
        const compressedFile = await compressImage(file);

        // Check if online
        if (!navigator.onLine) {
          console.log('[WireDropDetail] Offline - queueing photo upload');

          // Queue for later upload
          const queueId = await enqueueUpload({
            type: 'wire_drop_photo',
            projectId: wireDrop.project_id,
            file: compressedFile,
            metadata: {
              wireDropId: id,
              stage: stageType
            }
          });

          // Update local state optimistically
          setWireDrop(prev => ({
            ...prev,
            wire_drop_stages: prev.wire_drop_stages.map(stage =>
              stage.stage_type === stageType
                ? {
                    ...stage,
                    photo_url: URL.createObjectURL(compressedFile),
                    isPending: true, // Flag for UI
                    status: 'pending'
                  }
                : stage
            )
          }));

          alert('Photo queued for upload when online');
          return;
        }

        // Online: upload immediately
        // Get user display name from AuthContext
        const currentUserName = user?.displayName || user?.email || user?.account?.username || 'Unknown User';

        await wireDropService.uploadStagePhoto(id, stageType, compressedFile, currentUserName);
        await loadWireDrop(); // Reload to get updated stages
        if (isReUpload) {
          alert('Photo updated successfully!');
        }
      } catch (err) {
        console.error('Error uploading photo:', err);
        alert(err.message || 'Failed to upload photo');
      } finally {
        setUploadingStage(null);
      }
    };

    input.click();
  };

  const handleDeleteWireDrop = async () => {
    try {
      setDeleting(true);
      
      // First verify the wire drop exists
      const { data: checkExists } = await supabase
        .from('wire_drops')
        .select('id')
        .eq('id', id)
        .single();
      
      if (!checkExists) {
        alert('Wire drop not found or already deleted');
        navigate(-1);
        return;
      }
      
      // Attempt deletion
      await wireDropService.deleteWireDrop(id);
      
      // Verify it was actually deleted
      const { data: stillExists, error: checkError } = await supabase
        .from('wire_drops')
        .select('id')
        .eq('id', id)
        .single();
      
      if (!stillExists || checkError?.code === 'PGRST116') {
        // PGRST116 means no rows found - good, it was deleted
        alert('Wire drop deleted successfully');
        
        // Navigate back to the previous page
        navigate(-1);
      } else {
        // Item still exists after delete attempt
        console.error('Wire drop still exists after delete attempt');
        alert('Failed to delete wire drop - it still exists in the database. Please contact support.');
      }
    } catch (err) {
      console.error('Error deleting wire drop:', err);
      alert(err.message || 'Failed to delete wire drop');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Check if a photo URL is a broken blob URL
  const isBrokenPhotoUrl = (url) => {
    return url && url.startsWith('blob:');
  };

  const handleCommissionComplete = async () => {
    try {
      setCompletingCommission(true);
      
      // Get user display name from AuthContext
      const currentUserName = user?.displayName || user?.email || user?.account?.username || 'Unknown User';
      
      await wireDropService.completeCommission(id, {
        notes: commissionNotes,
        completed_by: currentUserName
      });
      await loadWireDrop(); // Reload to get updated stages
      setCommissionNotes('');
    } catch (err) {
      console.error('Error completing commission:', err);
      alert('Failed to complete commission');
    } finally {
      setCompletingCommission(false);
    }
  };

  // Single-select behavior for room equipment (1 wire drop = 1 equipment)
  const handleSelectRoomEquipment = (equipmentId) => {
    if (!equipmentId) return;
    setRoomEquipmentSelection([equipmentId]); // Single selection only
  };

  const handleDeselectRoomEquipment = (equipmentId) => {
    setRoomEquipmentSelection(prev => prev.filter(id => id !== equipmentId));
  };

  // Legacy toggle function (kept for backward compatibility with existing UI)
  const toggleRoomEquipment = (equipmentId) => {
    setRoomEquipmentSelection((prev) => {
      if (!equipmentId) return prev;
      return prev.includes(equipmentId)
        ? prev.filter((idValue) => idValue !== equipmentId)
        : [...prev, equipmentId];
    });
  };

  const toggleHeadEquipment = (equipmentId) => {
    setHeadEquipmentSelection((prev) => {
      if (!equipmentId) return prev;
      return prev.includes(equipmentId)
        ? prev.filter((idValue) => idValue !== equipmentId)
        : [...prev, equipmentId];
    });
  };

  const roomsById = useMemo(() => {
    const map = new Map();
    projectRooms.forEach((room) => {
      if (room?.id) {
        map.set(room.id, room);
      }
    });
    return map;
  }, [projectRooms]);

  const aliasLookup = useMemo(() => {
    const map = new Map();
    projectRooms.forEach((room) => {
      if (!room) return;

      const normalizedName = normalizeRoomName(room.name);
      if (normalizedName && !map.has(normalizedName)) {
        map.set(normalizedName, room);
      }

      if (room.normalized_name && !map.has(room.normalized_name)) {
        map.set(room.normalized_name, room);
      }

      (room.project_room_aliases || []).forEach((alias) => {
        const aliasValue = alias?.alias || alias?.normalized_alias;
        const normalizedAlias = normalizeRoomName(aliasValue);
        if (normalizedAlias && !map.has(normalizedAlias)) {
          map.set(normalizedAlias, room);
        }
        if (alias?.normalized_alias && !map.has(alias.normalized_alias)) {
          map.set(alias.normalized_alias, room);
        }
      });
    });
    return map;
  }, [projectRooms]);

  const resolvedDropRoom = useMemo(() => {
    if (!wireDrop) return null;

    if (wireDrop.project_room_id && roomsById.has(wireDrop.project_room_id)) {
      return roomsById.get(wireDrop.project_room_id);
    }

    if (wireDrop.project_room?.id && roomsById.has(wireDrop.project_room.id)) {
      return roomsById.get(wireDrop.project_room.id);
    }

    const candidateNames = [
      wireDrop.room_name,
      wireDrop.location,
      wireDrop.wire_drop_room_end?.room_name,
      wireDrop.wire_drop_head_end?.room_name
    ].filter(Boolean);

    for (const name of candidateNames) {
      const normalized = normalizeRoomName(name);
      if (!normalized) continue;
      const matchedRoom = aliasLookup.get(normalized);
      if (matchedRoom) {
        return matchedRoom;
      }
    }

    return null;
  }, [wireDrop, roomsById, aliasLookup]);

  const badgeColor = useMemo(() => getWireDropBadgeColor(wireDrop), [wireDrop]);
  const badgeLetter = useMemo(() => getWireDropBadgeLetter(wireDrop), [wireDrop]);
  const badgeTextColor = useMemo(() => getWireDropBadgeTextColor(badgeColor), [badgeColor]);
  const infoBadges = useMemo(() => {
    if (!wireDrop) return [];
    return [
      {
        key: 'room',
        label: 'Room',
        value: wireDrop.project_room?.name || wireDrop.room_name
      },
      {
        key: 'dropType',
        label: 'Drop Type',
        value: wireDrop.drop_type
      },
      {
        key: 'wireType',
        label: 'Wire Type',
        value: wireDrop.wire_type
      }
    ].filter((item) => Boolean(item.value));
  }, [wireDrop]);
  const alternateName = useMemo(() => {
    if (!wireDrop?.name) return null;
    if (!wireDrop?.drop_name) return wireDrop.name;

    const base = typeof wireDrop.drop_name === 'string' ? wireDrop.drop_name.trim().toLowerCase() : '';
    const alt = typeof wireDrop.name === 'string' ? wireDrop.name.trim().toLowerCase() : '';

    if (base === alt) return null;
    return wireDrop.name;
  }, [wireDrop?.name, wireDrop?.drop_name]);
  const showQrCard = useMemo(() => Boolean(wireDrop && (qrCodeSrc || wireDrop.uid)), [wireDrop, qrCodeSrc]);

  const doesEquipmentMatchRoom = useCallback(
    (equipment, room) => {
      if (!equipment || !room) return false;

      if (equipment.room_id && equipment.room_id === room.id) return true;
      if (equipment.project_rooms?.id && equipment.project_rooms.id === room.id) return true;

      const candidateNames = [
        equipment.project_rooms?.name,
        equipment.room_name,
        equipment.location
      ].filter(Boolean);

      for (const name of candidateNames) {
        const normalized = normalizeRoomName(name);
        if (!normalized) continue;
        const matchedRoom = aliasLookup.get(normalized);
        if (matchedRoom?.id === room.id) return true;
      }

      return false;
    },
    [aliasLookup]
  );

  const selectableEquipment = useMemo(
    () =>
      projectEquipment.filter(
        (item) => item.global_part?.is_wire_drop_visible !== false
      ),
    [projectEquipment]
  );

  const nonHeadEquipment = useMemo(
    () => selectableEquipment.filter((item) => !item.project_rooms?.is_headend),
    [selectableEquipment]
  );

  const roomEquipmentBuckets = useMemo(() => {
    const buckets = {
      matches: [],
      matchesSelected: [],
      others: []
    };

    const selectedSet = new Set(roomEquipmentSelection);

    const sorter = (a, b) => (a.name || '').localeCompare(b.name || '');

    nonHeadEquipment.forEach((item) => {
      if (resolvedDropRoom && doesEquipmentMatchRoom(item, resolvedDropRoom)) {
        if (selectedSet.has(item.id)) {
          buckets.matchesSelected.push(item);
        } else {
          buckets.matches.push(item);
        }
      } else {
        buckets.others.push(item);
      }
    });

    buckets.matches.sort(sorter);
    buckets.matchesSelected.sort(sorter);
    buckets.others.sort(sorter);

    return buckets;
  }, [nonHeadEquipment, resolvedDropRoom, doesEquipmentMatchRoom, roomEquipmentSelection]);

  const matchingRoomEquipment = roomEquipmentBuckets.matches;
  const usedRoomEquipment = roomEquipmentBuckets.matchesSelected;
  const otherRoomEquipment = roomEquipmentBuckets.others;

  // Smart sorted equipment for room end selector with single-select behavior
  const sortedRoomEquipment = useMemo(() => {
    const wireDropRoom = wireDrop?.room_name?.toLowerCase().trim();
    const alreadyAssignedIds = new Set(roomEquipmentSelection);

    // Categorize equipment
    const sameRoomUnassigned = [];
    const sameRoomAssigned = [];
    const otherRoomsData = {};

    nonHeadEquipment.forEach(item => {
      const itemRoom = item.project_rooms?.name?.toLowerCase().trim();
      const isSameRoom = itemRoom === wireDropRoom;
      const isAssigned = alreadyAssignedIds.has(item.id);

      if (isSameRoom && !isAssigned) {
        sameRoomUnassigned.push(item);
      } else if (isSameRoom && isAssigned) {
        sameRoomAssigned.push(item);
      } else {
        // Group by room for "other rooms" section
        const roomName = item.project_rooms?.name || 'Unassigned';
        if (!otherRoomsData[roomName]) {
          otherRoomsData[roomName] = [];
        }
        otherRoomsData[roomName].push({ item, isAssigned });
      }
    });

    // Sort each category alphabetically
    const sortAlpha = (a, b) => (a.name || '').localeCompare(b.name || '');
    sameRoomUnassigned.sort(sortAlpha);
    sameRoomAssigned.sort(sortAlpha);

    // Sort other rooms by room name
    const otherRooms = Object.entries(otherRoomsData).map(([roomName, items]) => ({
      roomName,
      items: items.sort((a, b) => sortAlpha(a.item, b.item))
    })).sort((a, b) => a.roomName.localeCompare(b.roomName));

    return {
      sameRoomUnassigned,
      sameRoomAssigned,
      otherRooms,
      hasOtherRooms: otherRooms.length > 0
    };
  }, [nonHeadEquipment, wireDrop, roomEquipmentSelection]);

  const headEndEquipmentOptions = useMemo(
    () => selectableEquipment.filter((item) => item.project_rooms?.is_headend),
    [selectableEquipment]
  );

  const otherHeadEquipment = useMemo(
    () => selectableEquipment.filter((item) => !item.project_rooms?.is_headend),
    [selectableEquipment]
  );

  const selectedRoomEquipmentDetails = useMemo(
    () =>
      projectEquipment.filter((item) =>
        (roomEquipmentSelection || []).includes(item.id)
      ),
    [projectEquipment, roomEquipmentSelection]
  );

  const selectedHeadEquipmentDetails = useMemo(
    () =>
      projectEquipment.filter((item) =>
        (headEquipmentSelection || []).includes(item.id)
      ),
    [projectEquipment, headEquipmentSelection]
  );

  const roomSelectOptions = useMemo(() => {
    const map = new Map();

    const addItems = (items, group) => {
      items.forEach((item) => {
        if (!item || map.has(item.id)) return;
        map.set(item.id, {
          id: item.id,
          name: item.name || 'Unnamed equipment',
          group,
          location: item.location || item.project_rooms?.name || '',
          sku: item.global_part?.sku || ''
        });
      });
    };

    addItems(matchingRoomEquipment, 'Matches this room');
    addItems(otherRoomEquipment, 'Other project equipment');
    addItems(selectedRoomEquipmentDetails, 'Selected');

    return Array.from(map.values());
  }, [matchingRoomEquipment, otherRoomEquipment, selectedRoomEquipmentDetails]);

  const headSelectOptions = useMemo(() => {
    const map = new Map();

    const addItems = (items, group) => {
      items.forEach((item) => {
        if (!item || map.has(item.id)) return;
        map.set(item.id, {
          id: item.id,
          name: item.name || 'Unnamed equipment',
          group,
          location: item.location || item.project_rooms?.name || '',
          sku: item.global_part?.sku || ''
        });
      });
    };

    addItems(headEndEquipmentOptions, 'Head-end rooms');
    addItems(otherHeadEquipment, 'Other equipment');
    addItems(selectedHeadEquipmentDetails, 'Selected');

    return Array.from(map.values());
  }, [headEndEquipmentOptions, otherHeadEquipment, selectedHeadEquipmentDetails]);

  const roomOptionGroups = useMemo(() => {
    const grouped = roomSelectOptions.reduce((acc, option) => {
      if (!option) return acc;
      if (!acc[option.group]) acc[option.group] = [];
      acc[option.group].push(option);
      return acc;
    }, {});
    return Object.entries(grouped).filter(([, options]) => Array.isArray(options) && options.length > 0);
  }, [roomSelectOptions]);

  const headOptionGroups = useMemo(() => {
    const grouped = headSelectOptions.reduce((acc, option) => {
      if (!option) return acc;
      if (!acc[option.group]) acc[option.group] = [];
      acc[option.group].push(option);
      return acc;
    }, {});
    return Object.entries(grouped).filter(([, options]) => Array.isArray(options) && options.length > 0);
  }, [headSelectOptions]);

  const roomGroupsForDisplay = useMemo(
    () => roomOptionGroups.filter(([label]) => label !== 'Selected'),
    [roomOptionGroups]
  );

  const headGroupsForDisplay = useMemo(
    () => headOptionGroups.filter(([label]) => label !== 'Selected'),
    [headOptionGroups]
  );

  const handleSaveRoomEnd = async () => {
    try {
      setSavingRoomEquipment(true);
      await wireDropService.updateEquipmentLinks(id, 'room_end', roomEquipmentSelection);
      alert('Room end equipment updated');
      await loadWireDrop();
    } catch (err) {
      console.error('Failed to save room end equipment:', err);
      alert(err.message || 'Failed to save room end equipment');
    } finally {
      setSavingRoomEquipment(false);
    }
  };

  const handleSaveHeadEnd = async () => {
    try {
      setSavingHeadEquipment(true);
      await wireDropService.updateEquipmentLinks(id, 'head_end', headEquipmentSelection);
      alert('Head end equipment updated');
      await loadWireDrop();
    } catch (err) {
      console.error('Failed to save head end equipment:', err);
      alert(err.message || 'Failed to save head end equipment');
    } finally {
      setSavingHeadEquipment(false);
    }
  };

  const getStageStatus = (stageType) => {
    if (!wireDrop?.wire_drop_stages) return null;
    return wireDrop.wire_drop_stages.find(s => s.stage_type === stageType);
  };

  const pageClasses = mode === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900';

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors ${pageClasses}`}>
        <Loader className="w-8 h-8 animate-spin text-violet-500 dark:text-violet-300" />
      </div>
    );
  }

  if (error || !wireDrop) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors ${pageClasses}`}>
        <div className="text-center space-y-4">
          <p className="text-sm text-rose-500 dark:text-rose-300">{error || 'Wire drop not found'}</p>
          {/* Error state - user will use app bar back button */}
        </div>
      </div>
    );
  }

  const prewireStage = getStageStatus('prewire');
  const trimOutStage = getStageStatus('trim_out');
  const commissionStage = getStageStatus('commission');

  // Determine card style based on completion status
  const getStageCardStyle = (stage) => {
    if (stage?.completed) {
      return styles.successCard;
    }
    return styles.warningCard;
  };

  return (
    <div className={`min-h-screen pb-12 transition-colors duration-300 ${pageClasses}`}>
      <div className="px-4 pt-2 pb-8 space-y-6 max-w-6xl mx-auto">
        {/* Main Info Card */}
        <div className="rounded-2xl overflow-hidden" style={styles.card}>
          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {editing ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-xl font-bold" style={styles.textPrimary}>Edit Wire Drop</h2>
                      <div className="flex flex-wrap gap-2 justify-end">
                        <Button 
                          variant="danger" 
                          icon={Trash2} 
                          onClick={() => setShowDeleteConfirm(true)}
                          size="sm"
                          disabled={saving || deleting}
                        >
                          Delete
                        </Button>
                        <Button 
                          variant="ghost" 
                          icon={X} 
                          onClick={handleCancel}
                          size="sm"
                          disabled={saving}
                        >
                          Cancel
                        </Button>
                        <Button 
                          variant="primary" 
                          icon={Save} 
                          onClick={handleSave}
                          loading={saving}
                          disabled={saving}
                          size="sm"
                        >
                          Save Changes
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1" style={styles.subtleText}>
                          Drop Name
                        </label>
                        <input
                          type="text"
                          value={editForm.drop_name || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, drop_name: e.target.value }))}
                          placeholder="Drop name"
                          className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                          style={styles.input}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={styles.subtleText}>
                          Room Name
                        </label>
                        <input
                          type="text"
                          value={editForm.room_name || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, room_name: e.target.value }))}
                          placeholder="Room name"
                          className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                          style={styles.input}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={styles.subtleText}>
                          Wire Type
                        </label>
                        <input
                          type="text"
                          value={editForm.type || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, type: e.target.value }))}
                          placeholder="e.g., Cat 6, 18/4"
                          className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                          style={styles.input}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={styles.subtleText}>
                          Location
                        </label>
                        <input
                          type="text"
                          value={editForm.location || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, location: e.target.value }))}
                          placeholder="Location details"
                          className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                          style={styles.input}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium mb-1" style={styles.subtleText}>
                          Notes
                        </label>
                        <textarea
                          value={editForm.notes || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                          placeholder="Additional notes"
                          rows={3}
                          className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                          style={styles.input}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={styles.subtleText}>
                          UID (Read-only)
                        </label>
                        <input
                          type="text"
                          value={wireDrop.uid || 'Not assigned'}
                          disabled
                          className="w-full px-3 py-2 rounded-lg border bg-gray-100 dark:bg-gray-800 cursor-not-allowed opacity-60"
                          style={styles.input}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={styles.subtleText}>
                          Lucid Shape ID (Read-only)
                        </label>
                        <input
                          type="text"
                          value={wireDrop.lucid_shape_id || 'Not linked'}
                          disabled
                          className="w-full px-3 py-2 rounded-lg border bg-gray-100 dark:bg-gray-800 cursor-not-allowed opacity-60"
                          style={styles.input}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-4">
                      {/* Lucid shape badge */}
                      <div 
                        className="w-14 h-14 rounded-full flex-shrink-0 shadow-md flex items-center justify-center select-none"
                        style={{
                          backgroundColor: badgeColor,
                          border: '2px solid rgba(17, 24, 39, 0.08)',
                          color: badgeTextColor
                        }}
                        title="Lucid badge"
                        aria-hidden="true"
                      >
                        <span className="text-xl font-bold">{badgeLetter}</span>
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
                          <div>
                            <h1 className="text-2xl font-bold" style={styles.textPrimary}>
                              {wireDrop.drop_name || wireDrop.name || 'Wire Drop'}
                            </h1>
                            {alternateName && (
                              <p className="mt-1 text-sm" style={styles.subtleText}>
                                {alternateName}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2 justify-start md:justify-end">
                            <Button 
                              variant="primary" 
                              icon={Edit} 
                              onClick={() => setEditing(true)}
                              size="sm"
                            >
                              Edit
                            </Button>
                          </div>
                        </div>

                        {infoBadges.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-3">
                            {infoBadges.map((item) => (
                              <div
                                key={item.key}
                                className={`min-w-[150px] rounded-xl border px-4 py-2 flex flex-col gap-1 ${mode === 'dark' ? 'border-violet-500/40 bg-violet-500/10' : 'border-violet-200 bg-violet-50'}`}
                              >
                                <span className={`text-[10px] font-semibold uppercase tracking-wide ${mode === 'dark' ? 'text-violet-200' : 'text-violet-700'}`}>
                                  {item.label}
                                </span>
                                <span className={`text-sm font-semibold ${mode === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                                  {item.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Connected Equipment Display */}
                        {selectedRoomEquipmentDetails.length > 0 && (
                          <div className="mt-3">
                            <div className="flex items-center gap-3 px-4 py-3 rounded-lg border-2"
                              style={{
                                backgroundColor: mode === 'dark' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(187, 247, 208, 0.5)',
                                borderColor: mode === 'dark' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(34, 197, 94, 0.6)'
                              }}
                            >
                              <Monitor size={20} className="text-green-600 dark:text-green-400 flex-shrink-0" />
                              <div className="flex-1">
                                <div className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">
                                  Room Equipment
                                </div>
                                <div className="text-sm font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                                  {selectedRoomEquipmentDetails[0].name}
                                </div>
                                {(selectedRoomEquipmentDetails[0].manufacturer || selectedRoomEquipmentDetails[0].model) && (
                                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                                    {selectedRoomEquipmentDetails[0].manufacturer} {selectedRoomEquipmentDetails[0].model}
                                  </div>
                                )}
                              </div>
                              {selectedRoomEquipmentDetails.length > 1 && (
                                <span className="ml-2 px-2 py-0.5 rounded-full bg-green-600 text-white text-xs font-bold">
                                  +{selectedRoomEquipmentDetails.length - 1}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Not Connected State */}
                        {selectedRoomEquipmentDetails.length === 0 && (
                          <div className="mt-3">
                            <div className="flex items-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed"
                              style={{
                                backgroundColor: mode === 'dark' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(243, 244, 246, 0.8)',
                                borderColor: mode === 'dark' ? 'rgba(156, 163, 175, 0.3)' : 'rgba(156, 163, 175, 0.5)'
                              }}
                            >
                              <AlertCircle size={20} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
                              <div>
                                <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                                  Room Equipment
                                </div>
                                <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 mt-0.5">
                                  Not Connected
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {wireDrop.location && (
                          <p className="mt-2 text-sm" style={styles.textSecondary}>
                            {wireDrop.location}
                          </p>
                        )}
                      </div>
                    </div>
                  </>
                )}
                
                {wireDrop.projects?.name && !editing && (
                  <button
                    onClick={() => navigate(`/project/${wireDrop.projects.id}`)}
                    className="text-sm text-violet-600 dark:text-violet-400 hover:underline mt-1"
                  >
                    {wireDrop.projects.name}
                  </button>
                )}
              </div>

              {showQrCard && (
                <div
                  className="rounded-xl border p-4 text-center flex-shrink-0"
                  style={{ ...styles.mutedCard, minWidth: '16rem' }}
                >
                  <h4 className="text-sm font-semibold mb-2" style={styles.textPrimary}>
                    Wire Drop QR
                  </h4>
                  {qrCodeSrc ? (
                    <div className="mx-auto inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2">
                      <img
                        src={qrCodeSrc}
                        alt={`QR code for ${wireDrop.drop_name || wireDrop.name || 'wire drop'}`}
                        className="h-40 w-40 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs"
                      style={styles.subtleText}
                    >
                      QR unavailable
                    </div>
                  )}
                  {wireDrop.uid && (
                    <p className="mt-3 text-xs font-mono break-all" style={styles.subtleText}>
                      UID: {wireDrop.uid}
                    </p>
                  )}
                  {wireDrop.qr_code_url && (
                    <a
                      href={wireDrop.qr_code_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center justify-center text-xs font-medium text-violet-600 dark:text-violet-300 hover:underline"
                    >
                      Open QR asset
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Completion Percentage */}
            {!editing && (
              <div className="text-right border-t pt-4" style={{ borderColor: styles.card.borderColor }}>
                <div className={`text-3xl font-bold ${
                  wireDrop.completion === 100 ? 'text-green-500' :
                  wireDrop.completion >= 67 ? 'text-blue-500' :
                  wireDrop.completion >= 33 ? 'text-yellow-500' :
                  'text-gray-500'
                }`}>
                  {wireDrop.completion || 0}%
                </div>
                <div className="text-xs" style={styles.subtleText}>Complete</div>
              </div>
            )}

            {/* Collapsible Lucid Metadata Section */}
            {!editing && (wireDrop.shape_x || wireDrop.shape_y || wireDrop.shape_color || wireDrop.shape_fill_color) && (
              <div className="border-t pt-4" style={{ borderColor: styles.card.borderColor }}>
                <button
                  onClick={() => setShowMetadata(!showMetadata)}
                  className="w-full flex items-center justify-between p-3 rounded-lg transition-all"
                  style={{
                    backgroundColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(191, 219, 254, 0.5)',
                    borderColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(147, 197, 253, 0.6)',
                    borderWidth: 1,
                    borderStyle: 'solid'
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold" style={{ color: mode === 'dark' ? '#60a5fa' : '#1e40af' }}>
                      📍 Lucid Diagram Metadata
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{
                      backgroundColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(147, 197, 253, 0.4)',
                      color: mode === 'dark' ? '#93c5fd' : '#1e40af'
                    }}>
                      For future "Show on Map" feature
                    </span>
                  </div>
                  <div className="text-lg" style={{ color: mode === 'dark' ? '#60a5fa' : '#1e40af' }}>
                    {showMetadata ? '▼' : '▶'}
                  </div>
                </button>

                {showMetadata && (
                  <div className="mt-3 p-4 rounded-lg space-y-4" style={{
                    backgroundColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.05)' : 'rgba(239, 246, 255, 0.8)',
                    borderColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(191, 219, 254, 0.6)',
                    borderWidth: 1,
                    borderStyle: 'solid'
                  }}>
                    {/* Shape Position Data */}
                    {(wireDrop.shape_x || wireDrop.shape_y || wireDrop.shape_width || wireDrop.shape_height) && (
                      <div>
                        <h4 className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: mode === 'dark' ? '#93c5fd' : '#1e40af' }}>
                          Shape Position (for navigation)
                        </h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {wireDrop.shape_x && (
                            <div className="px-3 py-2 rounded" style={{
                              backgroundColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.1)' : '#ffffff',
                              borderColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(191, 219, 254, 0.8)',
                              borderWidth: 1,
                              borderStyle: 'solid'
                            }}>
                              <div className="text-[10px] uppercase tracking-wide" style={{ color: mode === 'dark' ? '#93c5fd' : '#60a5fa' }}>X Position</div>
                              <div className="text-sm font-mono font-semibold" style={{ color: mode === 'dark' ? '#bfdbfe' : '#1e40af' }}>
                                {wireDrop.shape_x}
                              </div>
                            </div>
                          )}
                          {wireDrop.shape_y && (
                            <div className="px-3 py-2 rounded" style={{
                              backgroundColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.1)' : '#ffffff',
                              borderColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(191, 219, 254, 0.8)',
                              borderWidth: 1,
                              borderStyle: 'solid'
                            }}>
                              <div className="text-[10px] uppercase tracking-wide" style={{ color: mode === 'dark' ? '#93c5fd' : '#60a5fa' }}>Y Position</div>
                              <div className="text-sm font-mono font-semibold" style={{ color: mode === 'dark' ? '#bfdbfe' : '#1e40af' }}>
                                {wireDrop.shape_y}
                              </div>
                            </div>
                          )}
                          {wireDrop.shape_width && (
                            <div className="px-3 py-2 rounded" style={{
                              backgroundColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.1)' : '#ffffff',
                              borderColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(191, 219, 254, 0.8)',
                              borderWidth: 1,
                              borderStyle: 'solid'
                            }}>
                              <div className="text-[10px] uppercase tracking-wide" style={{ color: mode === 'dark' ? '#93c5fd' : '#60a5fa' }}>Width</div>
                              <div className="text-sm font-mono font-semibold" style={{ color: mode === 'dark' ? '#bfdbfe' : '#1e40af' }}>
                                {wireDrop.shape_width}
                              </div>
                            </div>
                          )}
                          {wireDrop.shape_height && (
                            <div className="px-3 py-2 rounded" style={{
                              backgroundColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.1)' : '#ffffff',
                              borderColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(191, 219, 254, 0.8)',
                              borderWidth: 1,
                              borderStyle: 'solid'
                            }}>
                              <div className="text-[10px] uppercase tracking-wide" style={{ color: mode === 'dark' ? '#93c5fd' : '#60a5fa' }}>Height</div>
                              <div className="text-sm font-mono font-semibold" style={{ color: mode === 'dark' ? '#bfdbfe' : '#1e40af' }}>
                                {wireDrop.shape_height}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Shape Color Data */}
                    {(wireDrop.shape_color || wireDrop.shape_fill_color || wireDrop.shape_line_color) && (
                      <div>
                        <h4 className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: mode === 'dark' ? '#93c5fd' : '#1e40af' }}>
                          Shape Colors (visual metadata)
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          {wireDrop.shape_color && (
                            <div className="px-3 py-2 rounded flex items-center gap-2" style={{
                              backgroundColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.1)' : '#ffffff',
                              borderColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(191, 219, 254, 0.8)',
                              borderWidth: 1,
                              borderStyle: 'solid'
                            }}>
                              <div 
                                className="w-6 h-6 rounded border"
                                style={{
                                  backgroundColor: wireDrop.shape_color,
                                  borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'
                                }}
                              />
                              <div className="flex-1">
                                <div className="text-[10px] uppercase tracking-wide" style={{ color: mode === 'dark' ? '#93c5fd' : '#60a5fa' }}>Color</div>
                                <div className="text-xs font-mono font-semibold" style={{ color: mode === 'dark' ? '#bfdbfe' : '#1e40af' }}>
                                  {wireDrop.shape_color}
                                </div>
                              </div>
                            </div>
                          )}
                          {wireDrop.shape_fill_color && (
                            <div className="px-3 py-2 rounded flex items-center gap-2" style={{
                              backgroundColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.1)' : '#ffffff',
                              borderColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(191, 219, 254, 0.8)',
                              borderWidth: 1,
                              borderStyle: 'solid'
                            }}>
                              <div 
                                className="w-6 h-6 rounded border"
                                style={{
                                  backgroundColor: wireDrop.shape_fill_color,
                                  borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)'
                                }}
                              />
                              <div className="flex-1">
                                <div className="text-[10px] uppercase tracking-wide" style={{ color: mode === 'dark' ? '#93c5fd' : '#60a5fa' }}>Fill Color</div>
                                <div className="text-xs font-mono font-semibold" style={{ color: mode === 'dark' ? '#bfdbfe' : '#1e40af' }}>
                                  {wireDrop.shape_fill_color}
                                </div>
                              </div>
                            </div>
                          )}
                          {wireDrop.shape_line_color && (
                            <div className="px-3 py-2 rounded flex items-center gap-2" style={{
                              backgroundColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.1)' : '#ffffff',
                              borderColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(191, 219, 254, 0.8)',
                              borderWidth: 1,
                              borderStyle: 'solid'
                            }}>
                              <div 
                                className="w-6 h-6 rounded border-2"
                                style={{
                                  borderColor: wireDrop.shape_line_color,
                                  backgroundColor: 'transparent'
                                }}
                              />
                              <div className="flex-1">
                                <div className="text-[10px] uppercase tracking-wide" style={{ color: mode === 'dark' ? '#93c5fd' : '#60a5fa' }}>Line Color</div>
                                <div className="text-xs font-mono font-semibold" style={{ color: mode === 'dark' ? '#bfdbfe' : '#1e40af' }}>
                                  {wireDrop.shape_line_color}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="pt-2 text-xs" style={{ color: mode === 'dark' ? '#93c5fd' : '#60a5fa' }}>
                      💡 This data will enable future features like "Show this drop on floor plan" navigation
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b" style={{ borderColor: styles.card.borderColor }}>
          {['prewire', 'room', 'head-end', 'commission'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2"
              style={activeTab === tab ? styles.tabActive : styles.tabInactive}
            >
              {tab === 'commission' && <Network size={16} />}
              {tab === 'prewire' && 'Prewire'}
              {tab === 'room' && 'Room'}
              {tab === 'head-end' && 'Head End'}
              {tab === 'commission' && 'Commission'}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'prewire' && (
          <div className="space-y-6">
            <div className="rounded-2xl overflow-hidden" style={getStageCardStyle(prewireStage)}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2" style={styles.textPrimary}>
                    {!prewireStage?.completed && (
                      <AlertTriangle size={20} className="text-yellow-500" />
                    )}
                    Stage 1: Prewire
                  </h3>
                  {prewireStage?.completed ? (
                    <CheckCircle size={24} className="text-green-500" />
                  ) : (
                    <Circle size={24} className="text-yellow-500" />
                  )}
                </div>
                
                {prewireStage?.photo_url ? (
                  <div className="space-y-3">
                    {isBrokenPhotoUrl(prewireStage.photo_url) ? (
                      <div className="border-2 border-dashed border-red-300 rounded-lg p-8 text-center bg-red-50 dark:bg-red-900/10">
                        <AlertTriangle size={32} className="text-red-500 mx-auto mb-3" />
                        <p className="text-sm mb-3 text-red-600 dark:text-red-400">
                          Photo link is broken and needs to be re-uploaded
                        </p>
                        <Button 
                          variant="danger" 
                          icon={RefreshCw} 
                          size="sm"
                          onClick={() => handlePhotoUpload('prewire', true)}
                          loading={uploadingStage === 'prewire'}
                          disabled={uploadingStage === 'prewire'}
                        >
                          Re-upload Photo
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {prewireStage.isPending ? (
                            <div className="relative">
                              <img
                                src={prewireStage.photo_url}
                                alt="Prewire (pending)"
                                className="w-full h-48 rounded-lg object-cover opacity-60"
                              />
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white rounded-lg">
                                <WifiOff size={32} className="mb-2" />
                                <span className="text-sm font-medium">Queued for Upload</span>
                                <span className="text-xs opacity-75">Will sync when online</span>
                              </div>
                            </div>
                          ) : (
                            <CachedSharePointImage
                              sharePointUrl={prewireStage.photo_url}
                              sharePointDriveId={prewireStage.sharepoint_drive_id}
                              sharePointItemId={prewireStage.sharepoint_item_id}
                              displayType="thumbnail"
                              size="medium"
                              alt="Prewire"
                              className="w-full h-48 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                              showFullOnClick={true}
                            />
                          )}
                          <Button
                            variant="secondary"
                            icon={RefreshCw}
                            size="sm"
                            onClick={() => handlePhotoUpload('prewire', true)}
                            loading={uploadingStage === 'prewire'}
                            disabled={uploadingStage === 'prewire'}
                            className="w-full"
                          >
                            Replace Photo
                          </Button>
                        </div>
                        {prewireStage.completed_at && (
                          <div className="text-xs space-y-1" style={styles.textSecondary}>
                            <div className="flex items-center gap-1">
                              <Clock size={12} />
                              {new Date(prewireStage.completed_at).toLocaleDateString()}
                            </div>
                            {prewireStage.completed_by && (
                              <div className="flex items-center gap-1">
                                <User size={12} />
                                {prewireStage.completed_by}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="border-2 border-dashed rounded-lg p-8 text-center" 
                       style={{ borderColor: 'rgba(251, 191, 36, 0.4)' }}>
                    <Upload size={32} className="text-yellow-500 mx-auto mb-3" />
                    <p className="text-sm mb-3" style={styles.textSecondary}>
                      Upload photo to complete
                    </p>
                    <Button 
                      variant="primary" 
                      icon={Camera} 
                      size="sm"
                      onClick={() => handlePhotoUpload('prewire')}
                      loading={uploadingStage === 'prewire'}
                      disabled={uploadingStage === 'prewire'}
                    >
                      Take/Upload Photo
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'room' && (
          <div className="space-y-6">
            <div className="rounded-2xl overflow-hidden" style={getStageCardStyle(trimOutStage)}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2" style={styles.textPrimary}>
                    {!trimOutStage?.completed && (
                      <AlertTriangle size={20} className="text-yellow-500" />
                    )}
                    Stage 2: Trim Out
                  </h3>
                  {trimOutStage?.completed ? (
                    <CheckCircle size={24} className="text-green-500" />
                  ) : (
                    <Circle size={24} className="text-yellow-500" />
                  )}
                </div>
                
                {trimOutStage?.photo_url ? (
                  <div className="space-y-3">
                    {isBrokenPhotoUrl(trimOutStage.photo_url) ? (
                      <div className="border-2 border-dashed border-red-300 rounded-lg p-8 text-center bg-red-50 dark:bg-red-900/10">
                        <AlertTriangle size={32} className="text-red-500 mx-auto mb-3" />
                        <p className="text-sm mb-3 text-red-600 dark:text-red-400">
                          Photo link is broken and needs to be re-uploaded
                        </p>
                        <Button 
                          variant="danger" 
                          icon={RefreshCw} 
                          size="sm"
                          onClick={() => handlePhotoUpload('trim_out', true)}
                          loading={uploadingStage === 'trim_out'}
                          disabled={uploadingStage === 'trim_out'}
                        >
                          Re-upload Photo
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {trimOutStage.isPending ? (
                            <div className="relative">
                              <img
                                src={trimOutStage.photo_url}
                                alt="Trim Out (pending)"
                                className="w-full h-48 rounded-lg object-cover opacity-60"
                              />
                              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white rounded-lg">
                                <WifiOff size={32} className="mb-2" />
                                <span className="text-sm font-medium">Queued for Upload</span>
                                <span className="text-xs opacity-75">Will sync when online</span>
                              </div>
                            </div>
                          ) : (
                            <CachedSharePointImage
                              sharePointUrl={trimOutStage.photo_url}
                              sharePointDriveId={trimOutStage.sharepoint_drive_id}
                              sharePointItemId={trimOutStage.sharepoint_item_id}
                              displayType="thumbnail"
                              size="medium"
                              alt="Trim Out"
                              className="w-full h-48 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                              showFullOnClick={true}
                            />
                          )}
                          <Button
                            variant="secondary"
                            icon={RefreshCw}
                            size="sm"
                            onClick={() => handlePhotoUpload('trim_out', true)}
                            loading={uploadingStage === 'trim_out'}
                            disabled={uploadingStage === 'trim_out'}
                            className="w-full"
                          >
                            Replace Photo
                          </Button>
                        </div>
                        {trimOutStage.completed_at && (
                          <div className="text-xs space-y-1" style={styles.textSecondary}>
                            <div className="flex items-center gap-1">
                              <Clock size={12} />
                              {new Date(trimOutStage.completed_at).toLocaleDateString()}
                            </div>
                            {trimOutStage.completed_by && (
                              <div className="flex items-center gap-1">
                                <User size={12} />
                                {trimOutStage.completed_by}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="border-2 border-dashed rounded-lg p-8 text-center" 
                       style={{ borderColor: 'rgba(251, 191, 36, 0.4)' }}>
                    <Upload size={32} className="text-yellow-500 mx-auto mb-3" />
                    <p className="text-sm mb-3" style={styles.textSecondary}>
                      Upload photo to complete
                    </p>
                    <Button 
                      variant="primary" 
                      icon={Camera} 
                      size="sm"
                      onClick={() => handlePhotoUpload('trim_out')}
                      loading={uploadingStage === 'trim_out'}
                      disabled={uploadingStage === 'trim_out'}
                    >
                      Take/Upload Photo
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden" style={styles.card}>
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold flex items-center gap-2" style={styles.textPrimary}>
                    <Monitor size={20} />
                    Room End Equipment
                  </h3>
                  <Button
                    variant="primary"
                    icon={Save}
                    size="sm"
                    onClick={handleSaveRoomEnd}
                    disabled={savingRoomEquipment || equipmentLoading}
                  >
                    {savingRoomEquipment ? 'Saving…' : 'Save Room End'}
                  </Button>
                </div>

                {equipmentError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-900/30 dark:text-red-200">
                    {equipmentError}
                  </div>
                )}

                {equipmentLoading ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading equipment options…</p>
                ) : (
                  <>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        Selected equipment
                      </h4>
                      {selectedRoomEquipmentDetails.length === 0 ? (
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          No equipment linked to this wire drop yet.
                        </p>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedRoomEquipmentDetails.map((item) => (
                            <span
                              key={item.id}
                              className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-200"
                            >
                              {item.name}
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleRoomEquipment(item.id);
                                }}
                                className="text-green-700 hover:text-green-900 dark:text-green-200 dark:hover:text-green-100"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                          Equipment in {wireDrop.room_name || 'this room'}
                        </label>

                        {/* Same Room - Unassigned (Primary List) */}
                        {sortedRoomEquipment.sameRoomUnassigned.length > 0 ? (
                          <div className="space-y-2 mb-3">
                            {sortedRoomEquipment.sameRoomUnassigned.map(item => (
                              <button
                                key={item.id}
                                onClick={() => handleSelectRoomEquipment(item.id)}
                                className={`w-full text-left p-3 rounded-lg transition-all border-2 ${
                                  roomEquipmentSelection.includes(item.id)
                                    ? 'bg-violet-50 border-violet-400 dark:bg-violet-900/20 dark:border-violet-500'
                                    : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="font-medium text-gray-900 dark:text-gray-100">
                                      {item.name}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                                      {item.manufacturer && `${item.manufacturer} `}
                                      {item.model}
                                    </div>
                                    {item.part_number && (
                                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                                        P/N: {item.part_number}
                                      </div>
                                    )}
                                  </div>
                                  {roomEquipmentSelection.includes(item.id) && (
                                    <CheckCircle size={20} className="text-violet-600 dark:text-violet-400 ml-3 flex-shrink-0" />
                                  )}
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                            No available equipment in this room
                          </p>
                        )}

                        {/* Same Room - Assigned (Greyed Out, Bottom of Room List) */}
                        {sortedRoomEquipment.sameRoomAssigned.length > 0 && (
                          <div className="space-y-2 mb-3 pb-3 border-b border-dashed" style={{ borderColor: styles.card.borderColor }}>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
                              Already Assigned
                            </p>
                            {sortedRoomEquipment.sameRoomAssigned.map(item => (
                              <button
                                key={item.id}
                                onClick={() => handleDeselectRoomEquipment(item.id)}
                                className="w-full text-left p-3 rounded-lg transition-all border-2 border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"
                                style={{ opacity: 0.75 }}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="font-medium text-gray-900 dark:text-gray-100">
                                      {item.name}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                                      {item.manufacturer && `${item.manufacturer} `}
                                      {item.model}
                                    </div>
                                  </div>
                                  <div className="ml-3 flex-shrink-0">
                                    <div className="px-2 py-1 rounded-md bg-gray-200 dark:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400">
                                      Assigned
                                    </div>
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Show More Button */}
                        {sortedRoomEquipment.hasOtherRooms && (
                          <div className="mt-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowAllRooms(!showAllRooms)}
                              className="w-full"
                            >
                              {showAllRooms ? 'Hide Other Rooms' : 'Show Equipment from All Rooms'}
                            </Button>
                          </div>
                        )}

                        {/* Other Rooms (Expanded) */}
                        {showAllRooms && sortedRoomEquipment.hasOtherRooms && (
                          <div className="mt-3 pt-3 border-t" style={{ borderColor: styles.card.borderColor }}>
                            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                              Other Rooms
                            </p>

                            {sortedRoomEquipment.otherRooms.map(({ roomName, items }) => (
                              <div key={roomName} className="mb-3">
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{roomName}</p>
                                <div className="space-y-2">
                                  {items.map(({ item, isAssigned }) => (
                                    <button
                                      key={item.id}
                                      onClick={() => isAssigned
                                        ? handleDeselectRoomEquipment(item.id)
                                        : handleSelectRoomEquipment(item.id)
                                      }
                                      className="w-full text-left p-3 rounded-lg transition-all border-2 border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"
                                      style={{ opacity: isAssigned ? 0.75 : 1 }}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                          <div className="font-medium text-gray-900 dark:text-gray-100">
                                            {item.name}
                                          </div>
                                          <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                                            {item.manufacturer && `${item.manufacturer} `}
                                            {item.model}
                                          </div>
                                        </div>
                                        {isAssigned && (
                                          <div className="ml-3 flex-shrink-0">
                                            <div className="px-2 py-1 rounded-md bg-gray-200 dark:bg-gray-700 text-xs font-medium text-gray-600 dark:text-gray-400">
                                              Assigned
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'head-end' && (
          <div className="space-y-6">
            <div className="rounded-2xl overflow-hidden" style={getStageCardStyle(commissionStage)}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2" style={styles.textPrimary}>
                    {!commissionStage?.completed && (
                      <AlertTriangle size={20} className="text-yellow-500" />
                    )}
                    Stage 3: Commission
                  </h3>
                  {commissionStage?.completed ? (
                    <CheckCircle size={24} className="text-green-500" />
                  ) : (
                    <Circle size={24} className="text-yellow-500" />
                  )}
                </div>
                
                {commissionStage?.completed ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle size={16} className="text-green-500" />
                        <span className="font-medium text-green-700 dark:text-green-300">
                          Commissioned
                        </span>
                      </div>
                      {commissionStage.completed_at && (
                        <div className="text-xs space-y-1 text-green-600 dark:text-green-400">
                          <div className="flex items-center gap-1">
                            <Clock size={12} />
                            {new Date(commissionStage.completed_at).toLocaleDateString()}
                          </div>
                          {commissionStage.completed_by && (
                            <div className="flex items-center gap-1">
                              <User size={12} />
                              {commissionStage.completed_by}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {commissionStage.notes && (
                      <div className="p-2 rounded text-sm" style={styles.mutedCard}>
                        {commissionStage.notes}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg border-2 border-dashed text-center" 
                         style={{ borderColor: 'rgba(251, 191, 36, 0.4)' }}>
                      <AlertCircle size={24} className="text-yellow-500 mx-auto mb-2" />
                      <p className="text-sm mb-2" style={styles.textSecondary}>
                        Requires user approval
                      </p>
                    </div>
                    <textarea
                      value={commissionNotes}
                      onChange={(e) => setCommissionNotes(e.target.value)}
                      placeholder="Commission notes (optional)"
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                      style={styles.input}
                    />
                    <Button 
                      variant="primary" 
                      icon={CheckCircle} 
                      className="w-full"
                      onClick={handleCommissionComplete}
                      loading={completingCommission}
                      disabled={completingCommission}
                    >
                      Mark as Commissioned
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden" style={styles.card}>
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold flex items-center gap-2" style={styles.textPrimary}>
                    <Server size={20} />
                    Head End Equipment
                  </h3>
                  <Button
                    variant="primary"
                    icon={Save}
                    size="sm"
                    onClick={handleSaveHeadEnd}
                    disabled={savingHeadEquipment || equipmentLoading}
                  >
                    {savingHeadEquipment ? 'Saving…' : 'Save Head End'}
                  </Button>
                </div>

                {equipmentError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-900/30 dark:text-red-200">
                    {equipmentError}
                  </div>
                )}

                {equipmentLoading ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading equipment options…</p>
                ) : (
                  <>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        Selected head-end equipment
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        The same device can be linked to multiple wire drops if needed.
                      </p>
                      {selectedHeadEquipmentDetails.length === 0 ? (
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          No head-end equipment linked yet.
                        </p>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedHeadEquipmentDetails.map((item) => (
                            <span
                              key={item.id}
                              className="inline-flex items-center gap-2 rounded-full bg-purple-100 px-3 py-1 text-xs text-purple-700 dark:bg-purple-900/40 dark:text-purple-200"
                            >
                              {item.name}
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleHeadEquipment(item.id);
                                }}
                                className="text-purple-600 hover:text-purple-800 dark:text-purple-200 dark:hover:text-purple-100"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                          Choose head-end equipment
                        </label>
                        <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-3 space-y-4">
                          {headGroupsForDisplay.length === 0 ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              No additional equipment available.
                            </p>
                          ) : (
                            headGroupsForDisplay.map(([groupLabel, options]) => (
                              <div key={groupLabel} className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  {groupLabel}
                                </p>
                                <div className="space-y-1">
                                  {options.map((option) => {
                                    const isSelected = headEquipmentSelection.includes(option.id);
                                    return (
                                      <label
                                        key={option.id}
                                        className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${
                                          isSelected
                                            ? 'bg-purple-50 border border-purple-400 dark:bg-purple-900/20 dark:border-purple-500/40'
                                            : 'border border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          className="mt-1 h-4 w-4 rounded border-gray-300 text-violet-500 focus:ring-violet-400 dark:border-gray-600"
                                          checked={isSelected}
                                          onChange={() => toggleHeadEquipment(option.id)}
                                        />
                                        <span className="flex-1">
                                          <span className="font-medium text-gray-900 dark:text-gray-100 block">
                                            {option.name}
                                          </span>
                                          {option.location && (
                                            <span className="text-xs text-gray-500 dark:text-gray-400 block">
                                              {option.location}
                                            </span>
                                          )}
                                          {option.sku && (
                                            <span className="text-[11px] text-gray-400 dark:text-gray-500 block">
                                              SKU: {option.sku}
                                            </span>
                                          )}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {!editing && (
              <div className="rounded-2xl overflow-hidden" style={styles.card}>
                <div className="p-6">
                  <h4 className="font-semibold mb-3 flex items-center gap-2" style={styles.textPrimary}>
                    <Network size={20} />
                    Network Port Assignment
                  </h4>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                        Switch
                      </label>
                      <select
                        value={selectedSwitch || ''}
                        onChange={(e) => {
                          setSelectedSwitch(e.target.value);
                          const sw = availableSwitches.find(s => s.id === e.target.value);
                          setAvailablePorts(sw?.unifi_switch_ports || []);
                          setSelectedPort(null);
                        }}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"
                        style={styles.input}
                      >
                        <option value="">-- Select Switch --</option>
                        {availableSwitches.map(sw => (
                          <option key={sw.id} value={sw.id}>
                            {sw.device_name} ({sw.location || 'No location'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {availablePorts.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                          Port
                        </label>
                        <select
                          value={selectedPort || ''}
                          onChange={(e) => setSelectedPort(e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"
                          style={styles.input}
                        >
                          <option value="">-- Select Port --</option>
                          {availablePorts.map(port => (
                            <option key={port.id} value={port.id}>
                              Port {port.port_idx} {port.port_name ? `(${port.port_name})` : ''} 
                              {port.vlan_id ? ` - VLAN ${port.vlan_id}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                        Cable Label
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., CAT6-101-A"
                        value={cableLabel}
                        onChange={(e) => setCableLabel(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"
                        style={styles.input}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-1" style={styles.subtleText}>
                        Patch Panel Port
                      </label>
                      <input
                        type="text"
                        placeholder="e.g., PP1-24"
                        value={patchPanelPort}
                        onChange={(e) => setPatchPanelPort(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"
                        style={styles.input}
                      />
                    </div>

                    <Button
                      onClick={async () => {
                        if (!selectedPort) {
                          alert('Please select a port');
                          return;
                        }
                        try {
                          await unifiService.linkWireDropToPort(id, selectedPort, {
                            cableLabel,
                            patchPanelPort
                          });
                          alert('Port assignment saved!');
                          setCableLabel('');
                          setPatchPanelPort('');
                          setSelectedPort(null);
                          setSelectedSwitch(null);
                          setAvailablePorts([]);
                        } catch (err) {
                          alert('Failed to save port assignment: ' + err.message);
                        }
                      }}
                      variant="primary"
                      icon={Cable}
                      className="w-full"
                    >
                      Assign Port
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Commission Tab */}
        {activeTab === 'commission' && (
          <div className="space-y-6">
            <div className="rounded-2xl overflow-hidden" style={styles.card}>
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2" style={styles.textPrimary}>
                    <Network size={20} />
                    Network Commissioning
                  </h3>
                  {commissionStage?.completed ? (
                    <CheckCircle size={24} className="text-green-500" />
                  ) : (
                    <Circle size={24} className="text-gray-400" />
                  )}
                </div>

                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Verify network connectivity by assigning UniFi clients to equipment endpoints.
                </p>

                {/* Room End Equipment + UniFi Client */}
                <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={styles.textPrimary}>
                    <Monitor size={16} />
                    Room End Device
                  </h4>

                  {selectedRoomEquipmentDetails.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-3 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {selectedRoomEquipmentDetails[0].name}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {selectedRoomEquipmentDetails[0].manufacturer} {selectedRoomEquipmentDetails[0].model}
                          </div>
                        </div>
                      </div>

                      {/* UniFi Client Dropdown */}
                      <UniFiClientSelector
                        projectId={wireDrop.project_id}
                        equipmentId={selectedRoomEquipmentDetails[0].id}
                        wireDropId={wireDrop.id}
                        onAssign={async () => {
                          // Reload wire drop to show updated commission status
                          await loadWireDrop();
                        }}
                      />
                    </div>
                  ) : (
                    <div className="p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        No room equipment assigned. Go to the Room tab to select equipment first.
                      </p>
                    </div>
                  )}
                </div>

                {/* Head End Equipment + UniFi Port (Future) */}
                <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={styles.textPrimary}>
                    <Server size={16} />
                    Head End Connection
                  </h4>

                  {selectedHeadEquipmentDetails.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-3 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {selectedHeadEquipmentDetails[0].name}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {selectedHeadEquipmentDetails[0].manufacturer} {selectedHeadEquipmentDetails[0].model}
                          </div>
                        </div>
                      </div>

                      {/* Placeholder for UniFi Port Selector */}
                      <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                          UniFi switch port selector coming in next phase
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-md bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        No head-end equipment assigned yet.
                      </p>
                    </div>
                  )}
                </div>

                {/* Auto-Complete Notice */}
                {!commissionStage?.completed && (
                  <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700">
                    <div className="flex items-start gap-3">
                      <CheckCircle size={20} className="text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-green-900 dark:text-green-100 mb-1">
                          Auto-Complete Enabled
                        </p>
                        <p className="text-xs text-green-700 dark:text-green-300">
                          This stage will be automatically marked complete when you assign a UniFi client to the room equipment.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Complete Wire Drop Record */}
        <div className="rounded-2xl overflow-hidden mt-6" style={styles.card}>
          <div
            className="flex items-center justify-between gap-3 p-4 border-b"
            style={{ borderColor: styles.card.borderColor }}
          >
            <div>
              <h3 className="text-sm font-semibold" style={styles.textPrimary}>
                COMPLETE WIRE DROP RECORD (All Database Fields)
              </h3>
              <p className="text-xs" style={styles.subtleText}>
                View every stored field plus raw Lucid shape data.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowFullRecord((prev) => !prev)}
            >
              {showFullRecord ? 'Hide Details' : 'Show Details'}
            </Button>
          </div>

          {showFullRecord && (
            <div className="p-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                {(() => {
                  const allFields = [
                    { name: 'Record ID', key: 'id', value: wireDrop.id, locked: true, source: 'system' },
                    { name: 'Project ID', key: 'project_id', value: wireDrop.project_id, locked: true, source: 'system' },
                    { name: 'Created At', key: 'created_at', value: wireDrop.created_at ? new Date(wireDrop.created_at).toLocaleDateString() : null, locked: true, source: 'system' },
                    { name: 'Updated At', key: 'updated_at', value: wireDrop.updated_at ? new Date(wireDrop.updated_at).toLocaleDateString() : null, locked: true, source: 'system' },
                    { name: 'UID', key: 'uid', value: wireDrop.uid, locked: true, source: 'generated', description: 'Auto-generated from room & drop names' },
                    { name: 'Lucid Shape ID', key: 'lucid_shape_id', value: wireDrop.lucid_shape_id, locked: true, source: 'lucid_link', description: 'Links to Lucid shape' },
                    { name: 'Lucid Page ID', key: 'lucid_page_id', value: wireDrop.lucid_page_id, locked: true, source: 'lucid_link', description: 'Lucid page/floor reference' },
                    { name: 'Shape X', key: 'shape_x', value: wireDrop.shape_x, locked: true, source: 'lucid_position' },
                    { name: 'Shape Y', key: 'shape_y', value: wireDrop.shape_y, locked: true, source: 'lucid_position' },
                    { name: 'Shape Width', key: 'shape_width', value: wireDrop.shape_width, locked: true, source: 'lucid_position' },
                    { name: 'Shape Height', key: 'shape_height', value: wireDrop.shape_height, locked: true, source: 'lucid_position' },
                    { name: 'Shape Rotation', key: 'shape_rotation', value: wireDrop.shape_rotation, locked: true, source: 'lucid_position' },
                    { 
                      name: 'Wire Type (Basic)', 
                      key: 'type', 
                      value: wireDrop.type, 
                      editable: true, 
                      source: wireDrop.lucid_shape_id ? 'lucid' : 'manual',
                      description: 'Basic wire type field' 
                    },
                    { 
                      name: 'Wire Type (Enhanced)', 
                      key: 'wire_type', 
                      value: wireDrop.wire_type, 
                      editable: true, 
                      source: wireDrop.lucid_shape_id ? 'lucid' : 'manual',
                      description: 'Detailed wire type from Lucid' 
                    },
                    { 
                      name: 'Room Name', 
                      key: 'room_name', 
                      value: wireDrop.project_room?.name || wireDrop.room_name, 
                      editable: true, 
                      source: wireDrop.lucid_shape_id ? 'lucid' : 'manual'
                    },
                    { 
                      name: 'Drop Name', 
                      key: 'drop_name', 
                      value: wireDrop.drop_name, 
                      editable: true, 
                      source: wireDrop.lucid_shape_id ? 'lucid' : 'manual',
                      description: 'Drop identifier from Lucid' 
                    },
                    { 
                      name: 'Drop Type', 
                      key: 'drop_type', 
                      value: wireDrop.drop_type, 
                      editable: true, 
                      source: wireDrop.lucid_shape_id ? 'lucid' : 'manual',
                      description: 'Type of drop (e.g., TV, Keypad, Camera)' 
                    },
                    { name: 'Name', key: 'name', value: wireDrop.name, editable: true, source: 'manual', description: 'Legacy/alternative name field' },
                    { name: 'Location', key: 'location', value: wireDrop.location, editable: true, source: wireDrop.lucid_shape_id ? 'lucid' : 'manual' },
                    { name: 'Floor', key: 'floor', value: wireDrop.floor, editable: true, source: wireDrop.lucid_shape_id ? 'lucid' : 'manual' },
                    { name: 'Notes', key: 'notes', value: wireDrop.notes, editable: true, source: 'manual' },
                    { name: 'Install Note', key: 'install_note', value: wireDrop.install_note, editable: true, source: wireDrop.lucid_shape_id ? 'lucid' : 'manual', description: 'Installation notes from Lucid' },
                    { name: 'Device', key: 'device', value: wireDrop.device, editable: true, source: wireDrop.lucid_shape_id ? 'lucid' : 'manual', description: 'Device type from Lucid' },
                    { name: 'Shape Color', key: 'shape_color', value: wireDrop.shape_color, locked: true, source: 'lucid', description: 'Primary color from Lucid shape' },
                    { name: 'Shape Fill Color', key: 'shape_fill_color', value: wireDrop.shape_fill_color, locked: true, source: 'lucid', description: 'Fill color from Lucid shape' },
                    { name: 'Shape Line Color', key: 'shape_line_color', value: wireDrop.shape_line_color, locked: true, source: 'lucid', description: 'Line color from Lucid shape' },
                    { name: 'Lucid Synced At', key: 'lucid_synced_at', value: wireDrop.lucid_synced_at ? new Date(wireDrop.lucid_synced_at).toLocaleString() : null, locked: true, source: 'lucid', description: 'Last sync from Lucid' },
                    { name: 'QR Code URL', key: 'qr_code_url', value: wireDrop.qr_code_url, editable: true, source: 'manual' },
                    { name: 'IS Drop', key: 'is_drop', value: wireDrop.is_drop !== undefined ? String(wireDrop.is_drop) : null, editable: false, source: wireDrop.lucid_shape_id ? 'lucid' : 'manual' },
                    { name: 'Schematic Reference', key: 'schematic_reference', value: wireDrop.schematic_reference, editable: true, source: 'manual' },
                    { name: 'Prewire Photo (Legacy)', key: 'prewire_photo', value: wireDrop.prewire_photo, locked: true, source: 'legacy', description: 'Old photo system' },
                    { name: 'Installed Photo (Legacy)', key: 'installed_photo', value: wireDrop.installed_photo, locked: true, source: 'legacy', description: 'Old photo system' }
                  ];

                  const getFieldStyle = (field) => {
                    if (field.source === 'lucid' || field.source === 'lucid_link' || field.source === 'lucid_position') {
                      return {
                        borderColor: mode === 'dark' ? '#16a34a' : '#86efac',
                        backgroundColor: mode === 'dark' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(134, 239, 172, 0.2)',
                        labelColor: mode === 'dark' ? '#86efac' : '#15803d',
                        valueColor: mode === 'dark' ? '#bbf7d0' : '#166534'
                      };
                    }
                    return {
                      borderColor: mode === 'dark' ? '#9333ea' : '#c084fc',
                      backgroundColor: mode === 'dark' ? 'rgba(147, 51, 234, 0.1)' : 'rgba(192, 132, 252, 0.2)',
                      labelColor: mode === 'dark' ? '#c084fc' : '#7c3aed',
                      valueColor: mode === 'dark' ? '#e9d5ff' : '#6b21a8'
                    };
                  };

                  return allFields
                    .map((field) => {
                      if (field.value === null || field.value === undefined) {
                        if (field.key !== 'is_drop') return null;
                      }

                      const style = getFieldStyle(field);

                      return (
                        <div
                          key={field.key}
                          className="px-3 py-2 rounded-lg border-2 relative"
                          style={{
                            borderColor: style.borderColor,
                            backgroundColor: style.backgroundColor
                          }}
                          title={field.description || ''}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <span className="text-xs font-medium" style={{ color: style.labelColor }}>
                                {field.name}:
                              </span>
                              <p className="text-sm font-semibold break-all" style={{ color: style.valueColor }}>
                                {field.value || '(empty)'}
                              </p>
                              {field.source && (
                                <span className="text-xs opacity-60" style={{ color: style.labelColor }}>
                                  Source: {field.source}
                                </span>
                              )}
                            </div>
                            <div className="ml-2 flex-shrink-0">
                              {field.locked ? (
                                <Lock size={12} className="text-gray-500" title="System/Locked Field" />
                              ) : field.editable ? (
                                <Edit size={12} className="text-blue-500" title="Editable Field" />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })
                    .filter(Boolean);
                })()}
              </div>

              {wireDrop.shape_data && Object.keys(wireDrop.shape_data).length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold mb-2 text-green-600 dark:text-green-400">
                    RAW LUCID SHAPE DATA (shape_data JSONB field)
                  </h4>
                  <div className="p-3 rounded-lg border-2 border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/10">
                    <pre className="text-xs overflow-x-auto text-green-900 dark:text-green-100">
                      {JSON.stringify(wireDrop.shape_data, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="rounded-2xl p-6 max-w-md w-full mx-4" style={styles.card}>
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2" style={styles.textPrimary}>
                <AlertTriangle size={20} className="text-red-500" />
                Delete Wire Drop?
              </h3>
              <p className="text-sm mb-6" style={styles.textSecondary}>
                Are you sure you want to delete this wire drop? This action cannot be undone and will remove all associated data including photos, equipment details, and stage progress.
              </p>
              <div className="flex gap-3">
                <Button 
                  variant="ghost" 
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleting}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  variant="danger" 
                  icon={Trash2}
                  onClick={handleDeleteWireDrop}
                  loading={deleting}
                  disabled={deleting}
                  className="flex-1"
                >
                  Delete Wire Drop
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WireDropDetailEnhanced;
