import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { useAuth } from '../contexts/AuthContext';
import { useAppState } from '../contexts/AppStateContext';
import wireDropService from '../services/wireDropService';
import unifiService from '../services/unifiService';
import { projectEquipmentService } from '../services/projectEquipmentService';
import { supabase } from '../lib/supabase';
import Button from './ui/Button';
import CachedSharePointImage from './CachedSharePointImage';
import { usePhotoViewer } from './photos/PhotoViewerProvider';
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
  WifiOff,
  Printer,
  FileText,
  ChevronDown,
  ChevronRight,
  QrCode,
  Search as SearchIcon,
  Blinds,
  Plus
} from 'lucide-react';
import { getWireDropBadgeColor, getWireDropBadgeLetter, getWireDropBadgeTextColor } from '../utils/wireDropVisuals';
import labelRenderService from '../services/labelRenderService';
import { usePrinter } from '../contexts/PrinterContext';

const WireDropDetail = () => {
  const { id } = useParams();
  const { theme, mode } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const palette = theme.palette;
  const sectionStyles = enhancedStyles.sections[mode];
  const { openPhotoViewer, closePhotoViewer, updatePhotoViewerOptions, photo: activeViewerPhoto } = usePhotoViewer();
  const { publishState, registerActions, unregisterActions } = useAppState();

  const [wireDrop, setWireDrop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({});

  // Equipment states
  const [projectEquipment, setProjectEquipment] = useState([]);
  const [roomEquipmentSelection, setRoomEquipmentSelection] = useState([]);
  const [headEquipmentSelection, setHeadEquipmentSelection] = useState([]);
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [equipmentError, setEquipmentError] = useState(null);
  const [activeTab, setActiveTab] = useState('prewire');
  const [qrCodeSrc, setQrCodeSrc] = useState(null);
  const [primaryRoomEquipmentId, setPrimaryRoomEquipmentId] = useState(null);
  const [showAllRooms, setShowAllRooms] = useState(false);
  const [showAllHeadEquipment, setShowAllHeadEquipment] = useState(false);

  // Shade states
  const [projectShades, setProjectShades] = useState([]);
  const [linkedShadeId, setLinkedShadeId] = useState(null);
  const [showShadeDropdown, setShowShadeDropdown] = useState(false);
  const [shadeSearch, setShadeSearch] = useState('');
  const [savingShade, setSavingShade] = useState(false);

  // Equipment dropdown states
  const [showRoomEquipmentDropdown, setShowRoomEquipmentDropdown] = useState(false);
  const [showHeadEquipmentDropdown, setShowHeadEquipmentDropdown] = useState(false);
  const [roomEquipmentSearch, setRoomEquipmentSearch] = useState('');
  const [headEquipmentSearch, setHeadEquipmentSearch] = useState('');

  // Debug state changes
  useEffect(() => {
    console.log('[Equipment Debug] showRoomEquipmentDropdown changed to:', showRoomEquipmentDropdown);
  }, [showRoomEquipmentDropdown]);

  // Stage states
  const [uploadingStage, setUploadingStage] = useState(null);
  const [stageViewerLoading, setStageViewerLoading] = useState(null);
  const [activeStageViewer, setActiveStageViewer] = useState(null);
  const [homeKitViewerActive, setHomeKitViewerActive] = useState(false);
  const [homeKitViewerLoading, setHomeKitViewerLoading] = useState(false);
  const [completingCommission, setCompletingCommission] = useState(false);
  const [commissionNotes, setCommissionNotes] = useState('');

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // QR section collapsible state
  const [qrSectionCollapsed, setQrSectionCollapsed] = useState(true);

  // HomeKit QR modal state
  const [showHomeKitQRModal, setShowHomeKitQRModal] = useState(false);
  const [uploadingHomeKitQR, setUploadingHomeKitQR] = useState(false);
  const getCurrentUserName = useCallback(() => (
    user?.user_metadata?.full_name ||
    user?.full_name ||
    user?.displayName ||
    user?.email ||
    user?.account?.username ||
    'Unknown User'
  ), [user]);

  // Get user UUID for database _by fields (installed_by, received_by, etc.)
  const getCurrentUserId = useCallback(() => (
    user?.id || user?.sub || null
  ), [user]);

  // UniFi client selector state
  const [showUniFiSelector, setShowUniFiSelector] = useState(false);

  // Notes editing
  const [editingNotes, setEditingNotes] = useState(false);
  const [tempNotes, setTempNotes] = useState('');

  // Issue association
  const [associatedIssues, setAssociatedIssues] = useState([]);
  const [showIssueSelector, setShowIssueSelector] = useState(false);
  const [availableIssues, setAvailableIssues] = useState([]);
  const [selectedIssueId, setSelectedIssueId] = useState(null);

  // UniFi Port Assignment
  const [availableSwitches, setAvailableSwitches] = useState([]);
  const [selectedSwitch, setSelectedSwitch] = useState(null);
  const [availablePorts, setAvailablePorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState(null);
  const [cableLabel, setCableLabel] = useState('');
  const [patchPanelPort, setPatchPanelPort] = useState('');

  // Printer states from context
  const { connected: printerConnected, printLabel: printerPrintLabel } = usePrinter();
  const [printing, setPrinting] = useState(false);
  const [printCopies, setPrintCopies] = useState(1);

  const styles = useMemo(() => {
    const cardBackground = mode === 'dark' ? '#27272A' : '#FFFFFF';
    const mutedBackground = mode === 'dark' ? '#18181B' : '#F9FAFB';
    const borderColor = mode === 'dark' ? '#3F3F46' : '#E5E7EB';
    const textPrimary = mode === 'dark' ? '#F9FAFB' : '#18181B';
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

  const buildDocumentationLinks = useCallback((globalPart) => {
    if (!globalPart) return [];
    const docLinks = [];
    if (globalPart.schematic_url) {
      docLinks.push({
        label: 'Schematic / Wiring Diagram',
        url: globalPart.schematic_url
      });
    }
    (globalPart.install_manual_urls || []).forEach((url, index) => {
      if (!url) return;
      docLinks.push({
        label: `Install Manual ${index + 1}`,
        url
      });
    });
    (globalPart.technical_manual_urls || []).forEach((url, index) => {
      if (!url) return;
      docLinks.push({
        label: `Technical Manual ${index + 1}`,
        url
      });
    });
    return docLinks;
  }, []);

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

  useEffect(() => {
    if (!roomEquipmentSelection || roomEquipmentSelection.length === 0) {
      setPrimaryRoomEquipmentId(null);
      return;
    }
    if (!primaryRoomEquipmentId || !roomEquipmentSelection.includes(primaryRoomEquipmentId)) {
      setPrimaryRoomEquipmentId(roomEquipmentSelection[0]);
    }
  }, [roomEquipmentSelection, primaryRoomEquipmentId]);

  // ══════════════════════════════════════════════════════════════
  // AI VOICE COPILOT INTEGRATION
  // ══════════════════════════════════════════════════════════════

  // Publish state for AI awareness
  useEffect(() => {
    if (!wireDrop) return;
    const stages = wireDrop.wire_drop_stages || [];
    const prewireStage = stages.find(s => s.stage_type === 'prewire');
    const trimStage = stages.find(s => s.stage_type === 'trim');

    publishState({
      view: 'wire-drop-detail',
      wireDrop: {
        id: wireDrop.id,
        uid: wireDrop.uid,
        dropName: wireDrop.drop_name,
        roomName: wireDrop.room_name,
        floor: wireDrop.floor,
        wireType: wireDrop.wire_type,
        dropType: wireDrop.drop_type,
        labelsPrinted: wireDrop.labels_printed
      },
      projectId: wireDrop.project_id,
      activeTab: activeTab,
      editing: editing,
      stages: {
        prewire: prewireStage?.completed || false,
        trim: trimStage?.completed || false
      },
      hint: 'Wire drop detail page. Shows stages (prewire/trim), equipment assignments, photos.'
    });
  }, [publishState, wireDrop, activeTab, editing]);

  // Register actions for AI
  useEffect(() => {
    const actions = {
      switch_tab: async ({ tab }) => {
        if (['prewire', 'trim', 'equipment'].includes(tab)) {
          setActiveTab(tab);
          return { success: true, message: `Switched to ${tab} tab` };
        }
        return { success: false, error: 'Invalid tab. Use: prewire, trim, or equipment' };
      },
      toggle_edit: async () => {
        setEditing(prev => !prev);
        return { success: true, message: editing ? 'Exiting edit mode' : 'Entering edit mode' };
      },
      mark_prewire_complete: async () => {
        // This would need the actual completion function
        return { success: true, message: 'Marking prewire as complete...' };
      },
      go_back: async () => {
        navigate(-1);
        return { success: true, message: 'Going back' };
      },
      get_wire_drop_info: async () => {
        if (!wireDrop) return { success: false, error: 'Wire drop not loaded' };
        return {
          success: true,
          info: {
            name: wireDrop.drop_name,
            room: wireDrop.room_name,
            type: wireDrop.drop_type,
            wireType: wireDrop.wire_type,
            uid: wireDrop.uid
          }
        };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, editing, navigate, wireDrop]);

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

  // Alias for loadEquipment used in HomeKit QR handlers
  const loadEquipment = useCallback(async () => {
    if (wireDrop?.project_id) {
      await loadProjectEquipmentOptions(wireDrop.project_id);
    }
  }, [wireDrop?.project_id, loadProjectEquipmentOptions]);

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

  // Load project shades for shade linking
  const loadProjectShades = useCallback(async (projectId) => {
    if (!projectId) return;
    try {
      const shades = await wireDropService.getProjectShades(projectId);
      setProjectShades(shades || []);
    } catch (err) {
      console.error('Failed to load project shades:', err);
    }
  }, []);

  // Load linked shade for this wire drop
  const loadLinkedShade = useCallback(async () => {
    if (!id) return;
    try {
      const links = await wireDropService.getWireDropShades(id);
      // For room_end, we expect at most 1 shade
      const roomEndLink = links.find(l => l.link_side === 'room_end' || !l.link_side);
      setLinkedShadeId(roomEndLink?.project_shade?.id || null);
    } catch (err) {
      console.error('Failed to load linked shade:', err);
    }
  }, [id]);

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
        notes: data.notes || '',
        is_auxiliary: data.is_auxiliary || false
      });

      // DEBUG: Log raw equipment links to identify data format issues
      console.log('[Equipment Debug] Raw wire_drop_equipment_links:', data.wire_drop_equipment_links);

      const equipmentLinks = (data.wire_drop_equipment_links || []).filter(
        (link) => link?.project_equipment?.id
      );

      // DEBUG: Check link_side values in the data
      console.log('[Equipment Debug] Equipment links with link_side values:');
      equipmentLinks.forEach(link => {
        console.log(`  - ID: ${link.id}, link_side: "${link.link_side}", equipment: ${link.project_equipment?.name}`);
      });

      // Handle both exact 'room_end' and potentially null/undefined link_side
      // If link_side is missing or null, we'll treat it as room_end for backward compatibility
      const roomLinks = equipmentLinks
        .filter((link) => link.link_side === 'room_end' || !link.link_side || link.link_side === null)
        .map((link) => link.project_equipment.id);
      const headLinks = equipmentLinks
        .filter((link) => link.link_side === 'head_end')
        .map((link) => link.project_equipment.id);

      console.log('[Equipment Debug] Processed room links:', roomLinks);
      console.log('[Equipment Debug] Processed head links:', headLinks);

      setRoomEquipmentSelection(Array.from(new Set(roomLinks)));
      setHeadEquipmentSelection(Array.from(new Set(headLinks)));

      return data;
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

  const loadAssociatedIssues = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('wire_drop_issues')
        .select(`
          *,
          issues:issue_id(*)
        `)
        .eq('wire_drop_id', id);

      if (error) throw error;
      setAssociatedIssues(data || []);
    } catch (err) {
      console.error('Failed to load associated issues:', err);
    }
  }, [id]);

  const loadAvailableIssues = useCallback(async () => {
    if (!wireDrop?.project_id) return;

    try {
      const { data, error } = await supabase
        .from('issues')
        .select('*')
        .eq('project_id', wireDrop.project_id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAvailableIssues(data || []);
    } catch (err) {
      console.error('Failed to load available issues:', err);
    }
  }, [wireDrop?.project_id]);

  useEffect(() => {
    if (wireDrop?.project_id) {
      loadProjectEquipmentOptions(wireDrop.project_id);
      loadSwitches(wireDrop.project_id);
      loadProjectShades(wireDrop.project_id);
      loadLinkedShade();
      loadAssociatedIssues();
      loadAvailableIssues();
    }
  }, [wireDrop?.project_id, loadProjectEquipmentOptions, loadSwitches, loadProjectShades, loadLinkedShade, loadAssociatedIssues, loadAvailableIssues]);

  useEffect(() => {
    if (!activeViewerPhoto) {
      setActiveStageViewer(null);
      setStageViewerLoading(null);
      setHomeKitViewerActive(false);
      setHomeKitViewerLoading(false);
    }
  }, [activeViewerPhoto]);

  useEffect(() => {
    if (activeStageViewer) {
      const loadingState =
        stageViewerLoading === activeStageViewer || uploadingStage === activeStageViewer;
      updatePhotoViewerOptions({ loading: loadingState });
    }
  }, [activeStageViewer, stageViewerLoading, uploadingStage, updatePhotoViewerOptions]);

  useEffect(() => {
    if (homeKitViewerActive) {
      updatePhotoViewerOptions({ loading: homeKitViewerLoading || uploadingHomeKitQR });
    }
  }, [homeKitViewerActive, homeKitViewerLoading, uploadingHomeKitQR, updatePhotoViewerOptions]);

  const handleNotesBlur = async () => {
    setEditingNotes(false);
    if (tempNotes !== wireDrop.notes) {
      try {
        await wireDropService.updateWireDrop(id, { notes: tempNotes });
        setWireDrop(prev => ({ ...prev, notes: tempNotes }));
      } catch (err) {
        console.error('Failed to save notes:', err);
        alert('Failed to save notes');
        setTempNotes(wireDrop.notes || '');
      }
    }
  };

  const handleAssociateIssue = async () => {
    if (!selectedIssueId) return;

    try {
      const { error } = await supabase
        .from('wire_drop_issues')
        .insert({
          wire_drop_id: id,
          issue_id: selectedIssueId
        });

      if (error) throw error;

      await loadAssociatedIssues();
      setShowIssueSelector(false);
      setSelectedIssueId(null);
    } catch (err) {
      console.error('Failed to associate issue:', err);
      alert('Failed to associate issue');
    }
  };

  const handleRemoveIssue = async (issueAssociationId) => {
    try {
      const { error } = await supabase
        .from('wire_drop_issues')
        .delete()
        .eq('id', issueAssociationId);

      if (error) throw error;

      await loadAssociatedIssues();
    } catch (err) {
      console.error('Failed to remove issue association:', err);
      alert('Failed to remove issue association');
    }
  };

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
      notes: wireDrop.notes || '',
      is_auxiliary: wireDrop.is_auxiliary || false
    });
    setEditing(false);
  };

  const handleToggleAuxiliary = async () => {
    const newValue = !wireDrop.is_auxiliary;
    try {
      await wireDropService.updateWireDrop(id, { is_auxiliary: newValue });
      setWireDrop(prev => ({ ...prev, is_auxiliary: newValue }));
      setEditForm(prev => ({ ...prev, is_auxiliary: newValue }));
    } catch (err) {
      console.error('Failed to update auxiliary status:', err);
      alert('Failed to update auxiliary status');
    }
  };

  const processStagePhotoUpload = useCallback(async (stageType, file, isReUpload = false) => {
    if (!file) return null;
    let updatedData = null;
    try {
      setUploadingStage(stageType);
      const compressedFile = await compressImage(file);
      const currentUserName = getCurrentUserName();
      const currentUserId = getCurrentUserId(); // UUID for database _by fields

      if (!navigator.onLine) {
        console.log('[WireDropDetail] Offline - queueing photo upload');
        await enqueueUpload({
          type: 'wire_drop_photo',
          projectId: wireDrop.project_id,
          file: compressedFile,
          metadata: {
            wireDropId: id,
            stage: stageType,
            uploadedBy: currentUserName,
            uploadedById: currentUserId // Include user UUID for offline queue
          }
        });

        setWireDrop(prev => {
          const stages = prev?.wire_drop_stages || [];
          return {
            ...prev,
            wire_drop_stages: stages.map(stage =>
              stage.stage_type === stageType
                ? {
                  ...stage,
                  photo_url: URL.createObjectURL(compressedFile),
                  isPending: true,
                  status: 'pending'
                }
                : stage
            )
          };
        });

        alert('Photo queued for upload when online');
        return null;
      }

      await wireDropService.uploadStagePhoto(id, stageType, compressedFile, currentUserName, currentUserId);
      updatedData = await loadWireDrop();
      if (isReUpload) {
        alert('Photo updated successfully!');
      }
      return updatedData;
    } catch (err) {
      console.error('Error uploading photo:', err);
      alert(err.message || 'Failed to upload photo');
      throw err;
    } finally {
      setUploadingStage(null);
    }
  }, [getCurrentUserName, getCurrentUserId, id, loadWireDrop, wireDrop?.project_id]);

  const promptStagePhotoUpload = (stageType, isReUpload = false) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await processStagePhotoUpload(stageType, file, isReUpload);
      } catch (_) { }
    };
    input.click();
  };

  // Navigate to next incomplete wire drop (sorted by room)
  const navigateToNextIncomplete = useCallback(async () => {
    try {
      const projectId = wireDrop?.project_id;
      if (!projectId) return;

      // Get all wire drops for this project with their prewire stage status
      const { data: allDrops, error } = await supabase
        .from('wire_drops')
        .select(`
          id,
          room,
          drop_name,
          wire_drop_stages (
            stage_type,
            completed
          )
        `)
        .eq('project_id', projectId)
        .order('room', { ascending: true })
        .order('drop_name', { ascending: true });

      if (error) throw error;

      // Find drops that don't have prewire completed
      const incompleteDrops = (allDrops || []).filter(drop => {
        const prewireStage = drop.wire_drop_stages?.find(s => s.stage_type === 'prewire');
        return !prewireStage?.completed;
      });

      if (incompleteDrops.length === 0) {
        alert('All wire drops have prewire photos completed!');
        return;
      }

      // Find the current drop's position in the incomplete list
      const currentIndex = incompleteDrops.findIndex(d => d.id === id);

      // Get the next incomplete drop (or first if we're at the end or not in list)
      let nextDrop;
      if (currentIndex >= 0 && currentIndex < incompleteDrops.length - 1) {
        nextDrop = incompleteDrops[currentIndex + 1];
      } else {
        // Current drop is complete or at end, go to first incomplete
        nextDrop = incompleteDrops[0];
      }

      if (nextDrop && nextDrop.id !== id) {
        navigate(`/projects/${projectId}/wire-drops/${nextDrop.id}`);
      } else {
        alert('No more incomplete wire drops!');
      }
    } catch (err) {
      console.error('[WireDropDetail] Error finding next incomplete:', err);
      alert('Error finding next drop: ' + err.message);
    }
  }, [wireDrop?.project_id, id, navigate]);

  const getStageByType = (stageType) =>
    (wireDrop?.wire_drop_stages || []).find(stage => stage.stage_type === stageType);

  const buildStagePhotoPayload = (stageType, stage) => ({
    id: stage.id || `${stageType}-${wireDrop?.id}`,
    url: stage.photo_url,
    sharepoint_drive_id: stage.sharepoint_drive_id,
    sharepoint_item_id: stage.sharepoint_item_id,
    file_name:
      stageType === 'prewire'
        ? 'Prewire Photo'
        : stageType === 'trim_out'
          ? 'Trim Out Photo'
          : 'Stage Photo',
    uploaded_by: stage.completed_by,
    created_at: stage.completed_at,
    updated_at: stage.updated_at,
    updated_by: stage.updated_by
  });

  const openStagePhotoViewer = (stageType, stageOverride = null) => {
    const stage = stageOverride || getStageByType(stageType);
    if (!stage || stage.isPending || !stage.photo_url) return;
    setActiveStageViewer(stageType);
    openPhotoViewer(buildStagePhotoPayload(stageType, stage), {
      canEdit: true,
      replaceMode: 'file',
      loading: stageViewerLoading === stageType || uploadingStage === stageType,
      onReplace: (file) => handleStageViewerReplace(stageType, file),
      onDelete: () => handleDeleteStagePhoto(stageType)
    });
  };

  async function handleStageViewerReplace(stageType, file) {
    if (!file) return;
    try {
      setStageViewerLoading(stageType);
      updatePhotoViewerOptions({ loading: true });
      const updated = await processStagePhotoUpload(stageType, file, true);
      if (!updated) {
        setActiveStageViewer(null);
        closePhotoViewer();
        return;
      }
      const refreshedStage = updated?.wire_drop_stages?.find(stage => stage.stage_type === stageType);
      if (refreshedStage) {
        openStagePhotoViewer(stageType, refreshedStage);
      } else {
        setActiveStageViewer(null);
        closePhotoViewer();
      }
    } catch (err) {
      console.error('Failed to replace stage photo:', err);
      alert(err.message || 'Failed to replace stage photo');
    } finally {
      setStageViewerLoading(null);
      updatePhotoViewerOptions({ loading: false });
    }
  }

  async function handleDeleteStagePhoto(stageType) {
    const stage = getStageByType(stageType);
    if (!stage || stage.isPending) return;
    const confirmed = window.confirm('Remove this photo from the stage? This will mark the stage as incomplete.');
    if (!confirmed) return;
    try {
      setStageViewerLoading(stageType);
      updatePhotoViewerOptions({ loading: true });
      await wireDropService.removeStagePhoto(id, stageType);
      await loadWireDrop();
      setActiveStageViewer(null);
      closePhotoViewer();
    } catch (err) {
      console.error('Failed to remove stage photo:', err);
      alert(err.message || 'Failed to remove stage photo');
    } finally {
      setStageViewerLoading(null);
      updatePhotoViewerOptions({ loading: false });
    }
  }

  const handleHomeKitQRUpload = async () => {
    if (!primaryRoomEquipment?.id) {
      alert('No equipment linked to upload HomeKit QR code');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        setUploadingHomeKitQR(true);

        // Compress the image first
        const compressedFile = await compressImage(file);

        // Upload to SharePoint and update equipment
        await projectEquipmentService.uploadHomeKitQRPhoto(primaryRoomEquipment.id, compressedFile);

        // Reload equipment data
        await loadEquipment();

        alert('HomeKit QR code uploaded successfully!');
        setShowHomeKitQRModal(false);
        if (homeKitViewerActive) {
          openHomeKitPhotoViewer();
        }
      } catch (err) {
        console.error('Error uploading HomeKit QR:', err);
        alert(err.message || 'Failed to upload HomeKit QR code');
      } finally {
        setUploadingHomeKitQR(false);
      }
    };

    input.click();
  };

  const handleHomeKitQRRemove = async (skipConfirm = false) => {
    if (!primaryRoomEquipment?.id) return false;

    if (!skipConfirm) {
      const confirmed = window.confirm('Remove this HomeKit QR code photo?');
      if (!confirmed) return false;
    }

    try {
      setUploadingHomeKitQR(true);

      await projectEquipmentService.removeHomeKitQRPhoto(primaryRoomEquipment.id);

      // Reload equipment data
      await loadEquipment();

      alert('HomeKit QR code removed successfully');
      setShowHomeKitQRModal(false);
      if (homeKitViewerActive) {
        setHomeKitViewerActive(false);
        closePhotoViewer();
      }
      return true;
    } catch (err) {
      console.error('Error removing HomeKit QR:', err);
      alert(err.message || 'Failed to remove HomeKit QR code');
      return false;
    } finally {
      setUploadingHomeKitQR(false);
    }
  };

  const openHomeKitPhotoViewer = () => {
    if (!primaryRoomEquipment?.homekit_qr_url) return;
    setHomeKitViewerActive(true);
    openPhotoViewer({
      id: primaryRoomEquipment.id,
      url: primaryRoomEquipment.homekit_qr_url,
      sharepoint_drive_id: primaryRoomEquipment.homekit_qr_sharepoint_drive_id,
      sharepoint_item_id: primaryRoomEquipment.homekit_qr_sharepoint_item_id,
      file_name: `${primaryRoomEquipment.name || 'Equipment'} HomeKit QR`,
      uploaded_by: primaryRoomEquipment.homekit_qr_uploaded_by || null,
      created_at: primaryRoomEquipment.homekit_qr_uploaded_at || null,
      updated_at: primaryRoomEquipment.homekit_qr_updated_at || null,
      updated_by: primaryRoomEquipment.homekit_qr_updated_by || null
    }, {
      canEdit: true,
      replaceMode: 'action',
      loading: homeKitViewerLoading || uploadingHomeKitQR,
      onReplace: () => handleHomeKitQRUpload(),
      onDelete: () => handleHomeKitViewerDelete()
    });
  };

  const handleHomeKitViewerDelete = async () => {
    try {
      setHomeKitViewerLoading(true);
      updatePhotoViewerOptions({ loading: true });
      const removed = await handleHomeKitQRRemove(true);
      if (removed) {
        setHomeKitViewerActive(false);
        closePhotoViewer();
      }
    } finally {
      setHomeKitViewerLoading(false);
      updatePhotoViewerOptions({ loading: false });
    }
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

  const handlePrintLabel = async () => {
    if (!printerConnected) {
      setError('Please connect to printer in Settings first');
      return;
    }

    setPrinting(true);
    setError(null);

    try {
      // Generate label bitmap
      const bitmap = await labelRenderService.generateWireDropLabelBitmap(wireDrop);

      // Print with specified copies, cut after each label
      await printerPrintLabel(bitmap, printCopies, true);

      // Success feedback
      console.log(`Successfully printed ${printCopies} label(s)`);
      alert(`Successfully printed ${printCopies} label(s)`);
    } catch (err) {
      console.error('Print error:', err);
      setError(`Print failed: ${err.message}`);
      alert(`Print failed: ${err.message}`);
    } finally {
      setPrinting(false);
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

  const handleUndoCommission = async () => {
    if (!window.confirm('Are you sure you want to undo the commissioned status? This will mark the wire drop as not commissioned.')) {
      return;
    }

    try {
      setCompletingCommission(true);
      await wireDropService.undoCommission(id);
      await loadWireDrop(); // Reload to get updated stages
    } catch (err) {
      console.error('Error undoing commission:', err);
      alert('Failed to undo commission');
    } finally {
      setCompletingCommission(false);
    }
  };

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
  const showQrCard = useMemo(() => Boolean(wireDrop), [wireDrop]);

  const selectableEquipment = useMemo(
    () =>
      projectEquipment.filter(
        (item) => item.global_part?.is_wire_drop_visible !== false
      ),
    [projectEquipment]
  );

  // Smart sorted equipment for room end selector with single-select behavior
  const sortedRoomEquipment = useMemo(() => {
    console.log('[Equipment Debug] Computing sortedRoomEquipment');
    console.log('[Equipment Debug] selectableEquipment count:', selectableEquipment.length);
    console.log('[Equipment Debug] selectableEquipment:', selectableEquipment);

    const wireDropRoom = wireDrop?.room_name?.toLowerCase().trim();
    const currentSelection = roomEquipmentSelection[0]; // Only care about first selection for single-select

    console.log('[Equipment Debug] wireDropRoom:', wireDropRoom);
    console.log('[Equipment Debug] currentSelection:', currentSelection);

    // Categorize ALL project equipment (not just non-head-end)
    const sameRoomItems = [];
    const otherRoomsData = {};

    selectableEquipment.forEach(item => {
      const itemRoom = item.project_rooms?.name?.toLowerCase().trim();
      const isSameRoom = itemRoom === wireDropRoom;
      const isSelected = item.id === currentSelection;

      // Debug room matching
      if (selectableEquipment.length > 0 && selectableEquipment.indexOf(item) === 0) {
        console.log('[Equipment Debug] First item room comparison:', {
          itemRoom,
          wireDropRoom,
          isSameRoom,
          originalRoomName: item.project_rooms?.name
        });
      }

      if (isSameRoom) {
        sameRoomItems.push({ item, isSelected });
      } else {
        // Group by room for "other rooms" section
        const roomName = item.project_rooms?.name || 'Unassigned';
        if (!otherRoomsData[roomName]) {
          otherRoomsData[roomName] = [];
        }
        otherRoomsData[roomName].push({ item, isSelected });
      }
    });

    // Sort each category alphabetically
    const sortAlpha = (a, b) => (a.item.name || '').localeCompare(b.item.name || '');
    sameRoomItems.sort(sortAlpha);

    // Sort other rooms by room name
    const otherRooms = Object.entries(otherRoomsData).map(([roomName, items]) => ({
      roomName,
      items: items.sort(sortAlpha)
    })).sort((a, b) => a.roomName.localeCompare(b.roomName));

    const result = {
      sameRoomItems,
      otherRooms,
      hasOtherRooms: otherRooms.length > 0
    };

    console.log('[Equipment Debug] sortedRoomEquipment result:', {
      sameRoomCount: result.sameRoomItems.length,
      otherRoomsCount: result.otherRooms.length,
      hasOtherRooms: result.hasOtherRooms,
      otherRoomNames: result.otherRooms.map(r => r.roomName)
    });

    return result;
  }, [selectableEquipment, wireDrop, roomEquipmentSelection]);

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

  const primaryRoomEquipment = useMemo(() => {
    if (!selectedRoomEquipmentDetails.length) return null;
    if (primaryRoomEquipmentId) {
      return selectedRoomEquipmentDetails.find(item => item.id === primaryRoomEquipmentId) || selectedRoomEquipmentDetails[0];
    }
    return selectedRoomEquipmentDetails[0];
  }, [primaryRoomEquipmentId, selectedRoomEquipmentDetails]);

  const selectedHeadEquipmentDetails = useMemo(
    () =>
      projectEquipment.filter((item) =>
        (headEquipmentSelection || []).includes(item.id)
      ),
    [projectEquipment, headEquipmentSelection]
  );

  const primaryHeadEquipment = useMemo(() => {
    if (!selectedHeadEquipmentDetails.length) return null;
    return selectedHeadEquipmentDetails[0];
  }, [selectedHeadEquipmentDetails]);

  const headEquipmentCatalog = useMemo(() => {
    const selectedSet = new Set(headEquipmentSelection);
    const sortAlpha = (a, b) => (a.name || '').localeCompare(b.name || '');

    const formatItem = (item) => ({
      id: item.id,
      name: item.name || 'Unnamed equipment',
      manufacturer: item.manufacturer || '',
      model: item.model || '',
      location: item.project_rooms?.name || item.location || 'Unassigned',
      part_number: item.part_number || ''
    });

    const headEndAvailable = headEndEquipmentOptions
      .filter((item) => item && !selectedSet.has(item.id))
      .map(formatItem)
      .sort(sortAlpha);

    const otherRoomsMap = new Map();
    otherHeadEquipment.forEach((item) => {
      if (!item || selectedSet.has(item.id)) return;
      const roomName = item.project_rooms?.name || item.location || 'Other Equipment';
      if (!otherRoomsMap.has(roomName)) {
        otherRoomsMap.set(roomName, []);
      }
      otherRoomsMap.get(roomName).push(formatItem(item));
    });

    const otherRooms = Array.from(otherRoomsMap.entries())
      .map(([roomName, items]) => ({
        roomName,
        items: items.sort(sortAlpha)
      }))
      .sort((a, b) => a.roomName.localeCompare(b.roomName));

    return {
      headEndAvailable,
      otherRooms,
      hasOtherRooms: otherRooms.length > 0
    };
  }, [headEndEquipmentOptions, otherHeadEquipment, headEquipmentSelection]);

  useEffect(() => {
    if (!headEquipmentCatalog.hasOtherRooms && showAllHeadEquipment) {
      setShowAllHeadEquipment(false);
    }
  }, [headEquipmentCatalog.hasOtherRooms, showAllHeadEquipment]);

  const getStageStatus = (stageType) => {
    if (!wireDrop?.wire_drop_stages) return null;
    return wireDrop.wire_drop_stages.find(s => s.stage_type === stageType);
  };

  const pageClasses = mode === 'dark' ? 'bg-zinc-900 text-gray-100' : 'bg-gray-50 text-gray-900';

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
      <div className="px-3 sm:px-4 pt-2 pb-8 space-y-6 w-full">
        {/* Main Info Card */}
        <div className="rounded-2xl overflow-hidden" style={styles.card}>
          <div className="p-6 space-y-4">
            <div className="flex flex-col lg:flex-row items-start gap-6">
              <div className="flex-1 min-w-0 flex flex-col gap-6 w-full lg:w-auto">
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
                          className="w-full px-3 py-2 rounded-lg border bg-gray-100 dark:bg-zinc-800 cursor-not-allowed opacity-60"
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
                          className="w-full px-3 py-2 rounded-lg border bg-gray-100 dark:bg-zinc-800 cursor-not-allowed opacity-60"
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

                {/* Equipment Section - Left column, aligns bottom with QR */}
                {!editing && showQrCard && (
                  <div className="mt-4 lg:mt-auto">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold uppercase tracking-wide" style={styles.subtleText}>
                        Linked Equipment
                      </h4>
                    </div>

                    {primaryRoomEquipment ? (
                      <div
                        className="rounded-xl border p-4"
                        style={{
                          ...styles.mutedCard,
                          borderColor: mode === 'dark' ? '#8B5CF6' : '#A78BFA',
                          borderWidth: 2
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <button
                              onClick={() => navigate(`/projects/${wireDrop.project_id}/equipment?highlight=${primaryRoomEquipment.id}`)}
                              className="font-semibold text-base mb-1 text-left hover:text-violet-600 dark:hover:text-violet-400 transition-colors"
                              style={styles.textPrimary}
                              title="View in Equipment List"
                            >
                              {primaryRoomEquipment.name}
                            </button>
                            {(primaryRoomEquipment.manufacturer || primaryRoomEquipment.model) && (
                              <p className="text-sm mb-1" style={styles.textSecondary}>
                                {[primaryRoomEquipment.manufacturer, primaryRoomEquipment.model]
                                  .filter(Boolean)
                                  .join(' • ')}
                              </p>
                            )}
                            {primaryRoomEquipment.part_number && (
                              <p className="text-xs" style={styles.subtleText}>
                                Part #: {primaryRoomEquipment.part_number}
                              </p>
                            )}
                            {(primaryRoomEquipment.location || primaryRoomEquipment.project_rooms?.name) && (
                              <p className="text-xs mt-1" style={styles.subtleText}>
                                <span className="inline-flex items-center gap-1">
                                  <Monitor size={12} />
                                  {primaryRoomEquipment.project_rooms?.name || primaryRoomEquipment.location}
                                </span>
                              </p>
                            )}

                            {/* UniFi Connection Info */}
                            <div className="mt-2 pt-2 border-t" style={{ borderColor: styles.card.borderColor }}>
                              <div className="flex items-center gap-1 mb-1">
                                <Network size={12} style={styles.subtleText} />
                                <span className="text-xs font-medium" style={styles.subtleText}>Network Connection</span>
                              </div>
                              {primaryRoomEquipment.unifi_client_mac ? (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs" style={styles.subtleText}>IP Address:</span>
                                    <span className="text-xs font-mono" style={styles.textPrimary}>
                                      {primaryRoomEquipment.unifi_last_ip || 'N/A'}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs" style={styles.subtleText}>MAC Address:</span>
                                    <span className="text-xs font-mono" style={styles.textPrimary}>
                                      {primaryRoomEquipment.unifi_client_mac}
                                    </span>
                                  </div>
                                  {primaryRoomEquipment.unifi_data?.hostname && (
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs" style={styles.subtleText}>Hostname:</span>
                                      <span className="text-xs font-mono" style={styles.textPrimary}>
                                        {primaryRoomEquipment.unifi_data.hostname}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-xs italic" style={styles.subtleText}>
                                  Not connected
                                </div>
                              )}
                            </div>
                          </div>

                          {/* HomeKit QR Thumbnail */}
                          <button
                            onClick={() => {
                              if (primaryRoomEquipment.homekit_qr_url) {
                                openHomeKitPhotoViewer();
                              } else {
                                setShowHomeKitQRModal(true);
                              }
                            }}
                            className="flex-shrink-0 w-16 h-16 rounded-lg border-2 overflow-hidden transition-all hover:scale-105 hover:shadow-lg"
                            style={{
                              borderColor: primaryRoomEquipment.homekit_qr_url ? '#8B5CF6' : '#D1D5DB',
                              backgroundColor: primaryRoomEquipment.homekit_qr_url ? 'transparent' : mode === 'dark' ? '#3F3F46' : '#F3F4F6'
                            }}
                            title={primaryRoomEquipment.homekit_qr_url ? 'View HomeKit QR Code' : 'Add HomeKit QR Code'}
                          >
                            {primaryRoomEquipment.homekit_qr_url ? (
                              <CachedSharePointImage
                                sharePointUrl={primaryRoomEquipment.homekit_qr_url}
                                sharePointDriveId={primaryRoomEquipment.homekit_qr_sharepoint_drive_id}
                                sharePointItemId={primaryRoomEquipment.homekit_qr_sharepoint_item_id}
                                displayType="thumbnail"
                                size="small"
                                className="w-full h-full object-cover"
                                objectFit="contain"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Camera size={24} style={styles.subtleText} />
                              </div>
                            )}
                          </button>
                        </div>

                        <div className="pt-3 mt-3 border-t space-y-2" style={{ borderColor: styles.card.borderColor }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Edit}
                            onClick={() => {
                              console.log('[Equipment] Change button clicked, opening dropdown');
                              setShowRoomEquipmentDropdown(true);
                            }}
                            className="w-full"
                          >
                            Change Equipment
                          </Button>
                          <Button
                            variant={primaryRoomEquipment.unifi_client_mac ? "secondary" : "primary"}
                            size="sm"
                            icon={Network}
                            onClick={() => setShowUniFiSelector(!showUniFiSelector)}
                            className="w-full"
                          >
                            {primaryRoomEquipment.unifi_client_mac ? 'Change Network Connection' : 'Connect Network'}
                          </Button>
                        </div>

                        {/* UniFi Client Selector */}
                        {showUniFiSelector && wireDrop?.project_id && (
                          <div className="pt-3 mt-3 border-t" style={{ borderColor: styles.card.borderColor }}>
                            <UniFiClientSelector
                              projectId={wireDrop.project_id}
                              equipmentId={primaryRoomEquipment.id}
                              wireDropId={wireDrop.id}
                              onAssign={async () => {
                                await loadEquipment();
                                setShowUniFiSelector(false);
                              }}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-xl border-2 border-dashed p-6 text-center" style={{ borderColor: styles.card.borderColor }}>
                        <Monitor size={32} className="mx-auto mb-2 opacity-40" style={styles.subtleText} />
                        <p className="text-sm mb-3" style={styles.subtleText}>
                          No equipment linked
                        </p>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            console.log('[Equipment] Add Equipment button clicked');
                            setShowRoomEquipmentDropdown(true);
                          }}
                          icon={Monitor}
                        >
                          Add Equipment
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Shade Section */}
                {!editing && showQrCard && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold uppercase tracking-wide" style={styles.subtleText}>
                        Linked Shade
                      </h4>
                    </div>

                    {linkedShadeId ? (
                      (() => {
                        const shade = projectShades.find(s => s.id === linkedShadeId);
                        if (!shade) return null;
                        return (
                          <div
                            className="rounded-xl border p-4"
                            style={{
                              ...styles.mutedCard,
                              borderColor: mode === 'dark' ? '#F59E0B' : '#FBBF24',
                              borderWidth: 2
                            }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <button
                                  onClick={() => navigate(`/projects/${wireDrop.project_id}/shades/${shade.id}`)}
                                  className="font-semibold text-base mb-1 text-left hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                                  style={styles.textPrimary}
                                  title="View Shade Details"
                                >
                                  {shade.name}
                                </button>
                                {shade.technology && (
                                  <p className="text-sm mb-1" style={styles.textSecondary}>
                                    {shade.technology}
                                  </p>
                                )}
                                {(shade.quoted_width || shade.quoted_height) && (
                                  <p className="text-xs" style={styles.subtleText}>
                                    {shade.quoted_width}" × {shade.quoted_height}"
                                  </p>
                                )}
                                {shade.room?.name && (
                                  <p className="text-xs mt-1" style={styles.subtleText}>
                                    <span className="inline-flex items-center gap-1">
                                      <Blinds size={12} />
                                      {shade.room.name}
                                    </span>
                                  </p>
                                )}

                                {/* Status indicators */}
                                <div className="mt-2 pt-2 border-t flex flex-wrap gap-2" style={{ borderColor: styles.card.borderColor }}>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${shade.ordered ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-500'}`}>
                                    {shade.ordered ? 'Ordered' : 'Not Ordered'}
                                  </span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${shade.received ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-500'}`}>
                                    {shade.received ? 'Received' : 'Not Received'}
                                  </span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${shade.installed ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' : 'bg-gray-100 text-gray-500 dark:bg-zinc-800 dark:text-zinc-500'}`}>
                                    {shade.installed ? 'Installed' : 'Not Installed'}
                                  </span>
                                </div>
                              </div>

                              {/* Change Shade Button */}
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setShowShadeDropdown(true)}
                                icon={Edit}
                              >
                                Change
                              </Button>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div
                        className="rounded-xl border p-4 text-center"
                        style={styles.mutedCard}
                      >
                        <Blinds size={24} className="mx-auto mb-2 opacity-30" style={styles.subtleText} />
                        <p className="text-sm mb-3" style={styles.subtleText}>
                          No shade linked
                        </p>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setShowShadeDropdown(true)}
                          icon={Blinds}
                        >
                          Add Shade
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* QR Code & Print Label Section */}
              {showQrCard && !editing && (
                <div className="flex-shrink-0 w-full lg:w-auto lg:min-w-[280px]">
                  <button
                    onClick={() => setQrSectionCollapsed(!qrSectionCollapsed)}
                    className="w-full flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md"
                    style={styles.card}
                  >
                    <div className="flex items-center gap-3">
                      <QrCode size={20} style={styles.textPrimary} />
                      <span className="font-medium" style={styles.textPrimary}>QR Code & Print</span>
                    </div>
                    <ChevronRight
                      size={20}
                      className={`transition-transform duration-200 ${!qrSectionCollapsed ? 'rotate-90' : ''}`}
                      style={styles.textSecondary}
                    />
                  </button>

                  {!qrSectionCollapsed && (
                    <div className="mt-4 rounded-2xl border p-4" style={styles.card}>
                      {/* QR Code Display */}
                      <div className="text-center mb-4">
                        {qrCodeSrc ? (
                          <div className="mx-auto inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2">
                            <img
                              src={qrCodeSrc}
                              alt={`QR code for ${wireDrop.drop_name || wireDrop.name || 'wire drop'}`}
                              className="h-40 w-40 object-contain"
                            />
                          </div>
                        ) : (
                          <div
                            className="mx-auto flex h-40 w-40 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs"
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
                            className="mt-2 inline-flex items-center justify-center text-xs font-medium text-violet-600 dark:text-violet-300 hover:underline"
                          >
                            Open QR asset
                          </a>
                        )}
                      </div>

                      {/* Print Label Section */}
                      <div className="pt-4 border-t" style={{ borderColor: styles.card.borderColor }}>
                        <p className="text-sm font-medium mb-3" style={styles.textPrimary}>Print Label</p>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="1"
                              max="10"
                              value={printCopies}
                              onChange={(e) => setPrintCopies(parseInt(e.target.value) || 1)}
                              className="w-16 px-2 py-2 text-sm rounded-lg border"
                              style={styles.input}
                            />
                            <span className="text-sm" style={styles.subtleText}>copies</span>
                          </div>
                        </div>
                        <Button
                          onClick={handlePrintLabel}
                          disabled={!printerConnected || printing}
                          variant="primary"
                          className="w-full"
                        >
                          <Printer size={16} />
                          {printing ? 'Printing...' : 'Print Label'}
                        </Button>
                        {!printerConnected && (
                          <p className="text-xs mt-2" style={styles.subtleText}>
                            Connect printer in{' '}
                            <button
                              onClick={() => navigate('/settings')}
                              className="text-blue-500 underline"
                            >
                              Settings
                            </button>
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Notes and Issues - Full Width Below */}
            {!editing && (
              <>
                {/* Notes Section - Always Editable */}
                <div className="mt-6 pt-4 border-t" style={{ borderColor: styles.card.borderColor }}>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold" style={styles.textPrimary}>
                      Notes
                    </label>
                    {!editingNotes && (
                      <button
                        onClick={() => {
                          setEditingNotes(true);
                          setTempNotes(wireDrop.notes || '');
                        }}
                        className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {editingNotes ? (
                    <textarea
                      value={tempNotes}
                      onChange={(e) => setTempNotes(e.target.value)}
                      onBlur={handleNotesBlur}
                      placeholder="Add notes here..."
                      rows={4}
                      className="w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-violet-400"
                      style={styles.input}
                      autoFocus
                    />
                  ) : (
                    <div
                      className="px-3 py-2 rounded-lg border min-h-[100px] cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800"
                      style={styles.input}
                      onClick={() => {
                        setEditingNotes(true);
                        setTempNotes(wireDrop.notes || '');
                      }}
                    >
                      {wireDrop.notes || <span style={styles.subtleText}>Click to add notes...</span>}
                    </div>
                  )}
                </div>

                {/* Associated Issues Section */}
                <div className="mt-4 pt-4 border-t" style={{ borderColor: styles.card.borderColor }}>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold" style={styles.textPrimary}>
                      Associated Issues ({associatedIssues.length})
                    </label>
                    <button
                      onClick={() => setShowIssueSelector(!showIssueSelector)}
                      className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                    >
                      {showIssueSelector ? 'Cancel' : 'Add Issue'}
                    </button>
                  </div>

                  {showIssueSelector && (
                    <div className="mb-3 p-3 rounded-lg border" style={styles.mutedCard}>
                      <select
                        value={selectedIssueId || ''}
                        onChange={(e) => setSelectedIssueId(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border mb-2"
                        style={styles.input}
                      >
                        <option value="">Select an issue...</option>
                        {availableIssues
                          .filter(issue => !associatedIssues.find(ai => ai.issue_id === issue.id))
                          .map(issue => (
                            <option key={issue.id} value={issue.id}>
                              {issue.title} - {issue.status}
                            </option>
                          ))}
                      </select>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleAssociateIssue}
                        disabled={!selectedIssueId}
                        className="w-full"
                      >
                        Associate Issue
                      </Button>
                    </div>
                  )}

                  {associatedIssues.length === 0 ? (
                    <p className="text-sm" style={styles.subtleText}>No associated issues</p>
                  ) : (
                    <div className="space-y-2">
                      {associatedIssues.map(assoc => (
                        <div
                          key={assoc.id}
                          className="flex items-center justify-between p-2 rounded-lg border"
                          style={styles.mutedCard}
                        >
                          <div className="flex-1">
                            <div className="font-medium text-sm" style={styles.textPrimary}>
                              {assoc.issues?.title}
                            </div>
                            <div className="text-xs" style={styles.subtleText}>
                              Status: {assoc.issues?.status} | Priority: {assoc.issues?.priority}
                            </div>
                          </div>
                          <button
                            onClick={() => handleRemoveIssue(assoc.id)}
                            className="text-red-500 hover:text-red-700 ml-2"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Completion Percentage */}
            {!editing && (
              <div className="text-right border-t pt-4" style={{ borderColor: styles.card.borderColor }}>
                <div className={`text-3xl font-bold ${wireDrop.completion === 100 ? 'text-green-500' :
                  wireDrop.completion >= 67 ? 'text-blue-500' :
                    wireDrop.completion >= 33 ? 'text-yellow-500' :
                      'text-gray-500'
                  }`}>
                  {wireDrop.completion || 0}%
                </div>
                <div className="text-xs" style={styles.subtleText}>Complete</div>
              </div>
            )}

          </div>
        </div>


        {primaryHeadEquipment && !editing && (
          <div className="rounded-2xl overflow-hidden" style={styles.card}>
            <div className="p-6 space-y-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Head End Device
                  </p>
                  <h2 className="text-xl font-semibold" style={styles.textPrimary}>
                    {primaryHeadEquipment.name}
                  </h2>
                  <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    {primaryHeadEquipment.manufacturer && (
                      <div>
                        <span className="font-medium">Manufacturer:</span>{' '}
                        {primaryHeadEquipment.manufacturer}
                      </div>
                    )}
                    {primaryHeadEquipment.model && (
                      <div>
                        <span className="font-medium">Model:</span>{' '}
                        {primaryHeadEquipment.model}
                      </div>
                    )}
                    {primaryHeadEquipment.part_number && (
                      <div>
                        <span className="font-medium">Part #:</span>{' '}
                        {primaryHeadEquipment.part_number}
                      </div>
                    )}
                    {(primaryHeadEquipment.location || primaryHeadEquipment.project_rooms?.name) && (
                      <div>
                        <span className="font-medium">Location:</span>{' '}
                        {primaryHeadEquipment.project_rooms?.name || primaryHeadEquipment.location}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveTab('head-end')}
                  >
                    Manage Head End
                  </Button>
                  {selectedHeadEquipmentDetails.length > 1 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-200">
                      +{selectedHeadEquipmentDetails.length - 1} linked
                    </span>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold" style={styles.textPrimary}>
                    Documentation & Resources
                  </h4>
                  {(() => {
                    const docLinks = buildDocumentationLinks(primaryHeadEquipment.global_part);
                    if (docLinks.length === 0) {
                      return (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          No rack documentation yet. Attach manuals on the part record to keep install steps handy.
                        </p>
                      );
                    }

                    return (
                      <div className="flex flex-wrap gap-2">
                        {docLinks.map((doc) => (
                          <a
                            key={doc.label + doc.url}
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700 hover:bg-purple-100 dark:border-purple-500/40 dark:bg-purple-900/30 dark:text-purple-200"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            {doc.label}
                          </a>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2" style={styles.textPrimary}>
                    <Server size={16} />
                    Rack & Port Planning
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Track which switch, port, and patch panel this drop lands on. Use the tools in the Head End tab to assign UniFi ports and label the cabling.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/projects/${wireDrop.project_id}/wire-drops/${id}/head-end-tools`)}
                    className="w-full md:w-auto"
                  >
                    Open Head End Tools
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b" style={{ borderColor: styles.card.borderColor }}>
          {['prewire', 'room', 'head-end'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="px-4 py-2 rounded-t-lg transition-colors flex items-center gap-2"
              style={activeTab === tab ? styles.tabActive : styles.tabInactive}
            >
              {tab === 'prewire' && 'Prewire'}
              {tab === 'room' && 'Room'}
              {tab === 'head-end' && 'Head End'}
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
                          onClick={() => promptStagePhotoUpload('prewire', true)}
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
                              className="w-full aspect-square rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                              showFullOnClick={false}
                              onClick={() => openStagePhotoViewer('prewire')}
                              objectFit="cover"
                            />
                          )}
                          <Button
                            variant="secondary"
                            icon={RefreshCw}
                            size="sm"
                            onClick={() => promptStagePhotoUpload('prewire', true)}
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
                      onClick={() => promptStagePhotoUpload('prewire')}
                      loading={uploadingStage === 'prewire'}
                      disabled={uploadingStage === 'prewire'}
                    >
                      Take/Upload Photo
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Next Incomplete Drop Button - Only show in prewire context */}
            <button
              onClick={navigateToNextIncomplete}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
              Next Incomplete Drop
            </button>
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
                          onClick={() => promptStagePhotoUpload('trim_out', true)}
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
                              className="w-full aspect-square rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                              showFullOnClick={false}
                              onClick={() => openStagePhotoViewer('trim_out')}
                              objectFit="cover"
                            />
                          )}
                          <Button
                            variant="secondary"
                            icon={RefreshCw}
                            size="sm"
                            onClick={() => promptStagePhotoUpload('trim_out', true)}
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
                      onClick={() => promptStagePhotoUpload('trim_out')}
                      loading={uploadingStage === 'trim_out'}
                      disabled={uploadingStage === 'trim_out'}
                    >
                      Take/Upload Photo
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Auxiliary Wire Drop Toggle */}
            <div className="rounded-2xl overflow-hidden" style={sectionStyles.cardBg}>
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold" style={styles.textPrimary}>
                      Auxiliary / Spare Wire
                    </h3>
                    <p className="text-sm mt-1" style={styles.textSecondary}>
                      Mark this wire drop as a spare run that doesn't require equipment installation
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer ml-4">
                    <input
                      type="checkbox"
                      checked={wireDrop?.is_auxiliary || false}
                      onChange={handleToggleAuxiliary}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
                {wireDrop?.is_auxiliary && (
                  <div className="mt-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      This wire drop is marked as auxiliary. It will still require a trim-out photo but won't require equipment to be installed.
                    </p>
                  </div>
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
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle size={16} className="text-green-500" />
                          <span className="font-medium text-green-700 dark:text-green-300">
                            Commissioned
                          </span>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleUndoCommission}
                          loading={completingCommission}
                          disabled={completingCommission}
                          className="text-xs"
                        >
                          Undo
                        </Button>
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
                              <button
                                type="button"
                                onClick={() => navigate(`/projects/${wireDrop.project_id}/equipment?highlight=${item.id}`)}
                                className="hover:underline"
                                title="View in Equipment List"
                              >
                                {item.name}
                              </button>
                              <button
                                type="button"
                                onClick={async (event) => {
                                  event.stopPropagation();
                                  // Remove the equipment and save immediately
                                  const newSelection = headEquipmentSelection.filter(id => id !== item.id);
                                  try {
                                    await wireDropService.updateEquipmentLinks(id, 'head_end', newSelection, user?.id);
                                    setHeadEquipmentSelection(newSelection);
                                    await loadWireDrop();
                                  } catch (err) {
                                    console.error('Failed to remove head end equipment:', err);
                                    alert(err.message || 'Failed to remove equipment');
                                  }
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

                    {/* Add Equipment Button */}
                    <Button
                      variant="secondary"
                      icon={Plus}
                      className="w-full"
                      onClick={() => setShowHeadEquipmentDropdown(true)}
                    >
                      Add Head End Equipment
                    </Button>
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

        {/* Equipment Dropdown Modal */}
        {showRoomEquipmentDropdown && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div
              className="rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
              style={styles.card}
            >
              {/* Header */}
              <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: styles.card.borderColor }}>
                <h3 className="text-lg font-semibold" style={styles.textPrimary}>
                  Select Equipment
                </h3>
                <button
                  onClick={() => {
                    setShowRoomEquipmentDropdown(false);
                    setRoomEquipmentSearch('');
                    setShowAllRooms(false);
                  }}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Search Bar */}
              <div className="p-4 border-b" style={{ borderColor: styles.card.borderColor }}>
                <div className="relative">
                  <SearchIcon
                    size={16}
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    placeholder="Search equipment..."
                    value={roomEquipmentSearch}
                    onChange={(e) => setRoomEquipmentSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm"
                    style={styles.input}
                    autoFocus
                  />
                </div>
              </div>

              {/* Equipment List */}
              <div className="flex-1 overflow-y-auto">
                {(() => {
                  const searchLower = roomEquipmentSearch.toLowerCase().trim();
                  const filteredSameRoom = sortedRoomEquipment.sameRoomItems.filter(({ item }) =>
                    !searchLower ||
                    item.name?.toLowerCase().includes(searchLower) ||
                    item.manufacturer?.toLowerCase().includes(searchLower) ||
                    item.model?.toLowerCase().includes(searchLower) ||
                    item.part_number?.toLowerCase().includes(searchLower)
                  );

                  return (
                    <>
                      {/* Same Room Equipment */}
                      {filteredSameRoom.length > 0 && (
                        <div className="p-3">
                          <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide" style={styles.subtleText}>
                            {wireDrop.room_name || 'This Room'}
                          </div>
                          {filteredSameRoom.map(({ item, isSelected }) => (
                            <button
                              key={item.id}
                              onClick={async () => {
                                console.log('[Equipment] Item selected:', item.name, item.id);

                                try {
                                  // Use service method to update equipment (single-select)
                                  console.log('[Equipment] Using service method to update equipment');
                                  const success = await wireDropService.updateEquipmentLinks(id, 'room_end', [item.id], user?.id);

                                  if (success) {
                                    console.log('[Equipment] Successfully updated equipment link');

                                    // Update local state
                                    setRoomEquipmentSelection([item.id]);
                                    setPrimaryRoomEquipmentId(item.id);

                                    // Reload wire drop data
                                    await loadWireDrop();

                                    // Close dropdown
                                    setShowRoomEquipmentDropdown(false);
                                    setRoomEquipmentSearch('');
                                    setShowAllRooms(false);
                                  } else {
                                    throw new Error('Failed to update equipment links');
                                  }
                                } catch (err) {
                                  console.error('[Equipment] Failed to update equipment:', err);
                                  alert(`Failed to update equipment: ${err.message || 'Unknown error'}`);
                                }
                              }}
                              className={`w-full text-left p-3 rounded-lg transition-all mb-1 ${isSelected
                                ? 'bg-violet-100 dark:bg-violet-900/30 border-2 border-violet-400'
                                : 'hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent'
                                }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm truncate" style={styles.textPrimary}>
                                    {item.name}
                                  </div>
                                  {(item.manufacturer || item.model) && (
                                    <div className="text-xs truncate mt-0.5" style={styles.subtleText}>
                                      {[item.manufacturer, item.model].filter(Boolean).join(' ')}
                                    </div>
                                  )}
                                  {item.part_number && (
                                    <div className="text-[10px] mt-0.5" style={styles.subtleText}>
                                      P/N: {item.part_number}
                                    </div>
                                  )}
                                </div>
                                {isSelected && (
                                  <CheckCircle size={16} className="text-violet-600 dark:text-violet-400 flex-shrink-0" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* No results in same room */}
                      {filteredSameRoom.length === 0 && !showAllRooms && (
                        <div className="p-6 text-center space-y-3">
                          <div
                            className="mx-auto w-16 h-16 rounded-full flex items-center justify-center"
                            style={{
                              backgroundColor: mode === 'dark' ? '#3F3F46' : '#F3F4F6'
                            }}
                          >
                            <Monitor size={24} className="opacity-40" style={styles.subtleText} />
                          </div>
                          <div>
                            <p className="text-sm font-medium mb-1" style={styles.textPrimary}>
                              No equipment in "{wireDrop.room_name || 'this room'}"
                            </p>
                            <p className="text-xs" style={styles.subtleText}>
                              {searchLower
                                ? 'No matching equipment found in this room'
                                : sortedRoomEquipment.hasOtherRooms
                                  ? `Equipment exists in other rooms (${sortedRoomEquipment.otherRooms.reduce((acc, r) => acc + r.items.length, 0)} items available)`
                                  : 'No equipment available in the project'}
                            </p>
                          </div>
                          {sortedRoomEquipment.hasOtherRooms && !searchLower && (
                            <div className="text-xs" style={styles.subtleText}>
                              <p>Available in:</p>
                              <div className="mt-1 flex flex-wrap gap-1 justify-center">
                                {sortedRoomEquipment.otherRooms.slice(0, 3).map(({ roomName, items }) => (
                                  <span
                                    key={roomName}
                                    className="inline-block px-2 py-1 rounded-full text-[10px] font-medium"
                                    style={{
                                      backgroundColor: mode === 'dark' ? '#4B5563' : '#E5E7EB',
                                      color: mode === 'dark' ? '#D1D5DB' : '#4B5563'
                                    }}
                                  >
                                    {roomName} ({items.length})
                                  </span>
                                ))}
                                {sortedRoomEquipment.otherRooms.length > 3 && (
                                  <span
                                    className="inline-block px-2 py-1 text-[10px]"
                                    style={styles.subtleText}
                                  >
                                    +{sortedRoomEquipment.otherRooms.length - 3} more
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Remove Equipment Link Button (only shown if equipment is linked) */}
                      {primaryRoomEquipment && (
                        <div className="p-3 border-t" style={{ borderColor: styles.card.borderColor }}>
                          <button
                            onClick={async () => {
                              if (!window.confirm('Remove this equipment link?')) {
                                return;
                              }

                              try {
                                const success = await wireDropService.updateEquipmentLinks(id, 'room_end', [], user?.id);

                                if (success) {
                                  setRoomEquipmentSelection([]);
                                  setPrimaryRoomEquipmentId(null);
                                  await loadWireDrop();
                                  setShowRoomEquipmentDropdown(false);
                                  setRoomEquipmentSearch('');
                                  setShowAllRooms(false);
                                } else {
                                  throw new Error('Failed to remove equipment link');
                                }
                              } catch (err) {
                                console.error('[Equipment] Failed to remove equipment:', err);
                                alert(`Failed to remove equipment: ${err.message || 'Unknown error'}`);
                                await loadWireDrop();
                              }
                            }}
                            className="w-full px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10"
                            style={{ borderColor: styles.card.borderColor }}
                          >
                            <Trash2 size={16} />
                            Remove Equipment Link
                          </button>
                        </div>
                      )}

                      {/* Show All Rooms Button */}
                      {sortedRoomEquipment.hasOtherRooms && !showAllRooms && (
                        <div className="p-3 border-t" style={{ borderColor: styles.card.borderColor }}>
                          <button
                            onClick={() => setShowAllRooms(true)}
                            className="w-full px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                            style={{
                              backgroundColor: mode === 'dark' ? '#3F3F46' : '#F3F4F6',
                              color: palette.accent
                            }}
                          >
                            <ChevronDown size={16} />
                            Show Equipment from All Rooms
                          </button>
                        </div>
                      )}

                      {/* Other Rooms (When Expanded) */}
                      {showAllRooms && sortedRoomEquipment.hasOtherRooms && (
                        <div className="border-t" style={{ borderColor: styles.card.borderColor }}>
                          {sortedRoomEquipment.otherRooms.map(({ roomName, items }) => {
                            const filteredRoomItems = items.filter(({ item }) =>
                              !searchLower ||
                              item.name?.toLowerCase().includes(searchLower) ||
                              item.manufacturer?.toLowerCase().includes(searchLower) ||
                              item.model?.toLowerCase().includes(searchLower) ||
                              item.part_number?.toLowerCase().includes(searchLower)
                            );

                            if (filteredRoomItems.length === 0) return null;

                            return (
                              <div key={roomName} className="p-3 border-t" style={{ borderColor: styles.card.borderColor }}>
                                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide" style={styles.subtleText}>
                                  {roomName}
                                </div>
                                {filteredRoomItems.map(({ item, isSelected }) => (
                                  <button
                                    key={item.id}
                                    onClick={async () => {
                                      console.log('[Equipment] Other room item selected:', item.name, item.id);

                                      try {
                                        // Use service method to update equipment (single-select)
                                        console.log('[Equipment] Using service method to update equipment');
                                        const success = await wireDropService.updateEquipmentLinks(id, 'room_end', [item.id], user?.id);

                                        if (success) {
                                          console.log('[Equipment] Successfully updated equipment link');

                                          // Update local state
                                          setRoomEquipmentSelection([item.id]);
                                          setPrimaryRoomEquipmentId(item.id);

                                          // Reload wire drop data
                                          await loadWireDrop();

                                          // Close dropdown
                                          setShowRoomEquipmentDropdown(false);
                                          setRoomEquipmentSearch('');
                                          setShowAllRooms(false);
                                        } else {
                                          throw new Error('Failed to update equipment links');
                                        }
                                      } catch (err) {
                                        console.error('[Equipment] Failed to update equipment:', err);
                                        alert(`Failed to update equipment: ${err.message || 'Unknown error'}`);
                                      }
                                    }}
                                    className={`w-full text-left p-3 rounded-lg transition-all mb-1 ${isSelected
                                      ? 'bg-violet-100 dark:bg-violet-900/30 border-2 border-violet-400'
                                      : 'hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent'
                                      }`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium text-sm truncate" style={styles.textPrimary}>
                                          {item.name}
                                        </div>
                                        {(item.manufacturer || item.model) && (
                                          <div className="text-xs truncate mt-0.5" style={styles.subtleText}>
                                            {[item.manufacturer, item.model].filter(Boolean).join(' ')}
                                          </div>
                                        )}
                                        {item.part_number && (
                                          <div className="text-[10px] mt-0.5" style={styles.subtleText}>
                                            P/N: {item.part_number}
                                          </div>
                                        )}
                                      </div>
                                      {isSelected && (
                                        <CheckCircle size={16} className="text-violet-600 dark:text-violet-400 flex-shrink-0" />
                                      )}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            );
                          })}

                          {/* Hide Button */}
                          <div className="p-3 border-t" style={{ borderColor: styles.card.borderColor }}>
                            <button
                              onClick={() => setShowAllRooms(false)}
                              className="w-full px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                              style={{
                                backgroundColor: mode === 'dark' ? '#3F3F46' : '#F3F4F6',
                                color: styles.textSecondary.color
                              }}
                            >
                              <ChevronDown size={16} className="rotate-180" />
                              Hide Other Rooms
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Head End Equipment Dropdown Modal */}
        {showHeadEquipmentDropdown && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div
              className="rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
              style={styles.card}
            >
              {/* Header */}
              <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: styles.card.borderColor }}>
                <h3 className="text-lg font-semibold" style={styles.textPrimary}>
                  Select Head End Equipment
                </h3>
                <button
                  onClick={() => {
                    setShowHeadEquipmentDropdown(false);
                    setHeadEquipmentSearch('');
                    setShowAllHeadEquipment(false);
                  }}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Search Bar */}
              <div className="p-4 border-b" style={{ borderColor: styles.card.borderColor }}>
                <div className="relative">
                  <SearchIcon
                    size={16}
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    placeholder="Search equipment..."
                    value={headEquipmentSearch}
                    onChange={(e) => setHeadEquipmentSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm"
                    style={styles.input}
                    autoFocus
                  />
                </div>
              </div>

              {/* Equipment List */}
              <div className="flex-1 overflow-y-auto">
                {(() => {
                  const searchLower = headEquipmentSearch.toLowerCase().trim();

                  // Filter head-end equipment
                  const filteredHeadEnd = headEquipmentCatalog.headEndAvailable.filter(item =>
                    !searchLower ||
                    item.name?.toLowerCase().includes(searchLower) ||
                    item.manufacturer?.toLowerCase().includes(searchLower) ||
                    item.model?.toLowerCase().includes(searchLower) ||
                    item.part_number?.toLowerCase().includes(searchLower)
                  );

                  return (
                    <>
                      {/* Head End Equipment */}
                      {filteredHeadEnd.length > 0 && (
                        <div className="p-3">
                          <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide" style={styles.subtleText}>
                            Head End Racks
                          </div>
                          {filteredHeadEnd.map((item) => {
                            const isSelected = headEquipmentSelection.includes(item.id);
                            return (
                              <button
                                key={item.id}
                                onClick={async () => {
                                  try {
                                    // Add equipment to selection
                                    const newSelection = [...headEquipmentSelection, item.id];
                                    await wireDropService.updateEquipmentLinks(id, 'head_end', newSelection, user?.id);
                                    setHeadEquipmentSelection(newSelection);
                                    await loadWireDrop();
                                    // Close dropdown after selection
                                    setShowHeadEquipmentDropdown(false);
                                    setHeadEquipmentSearch('');
                                    setShowAllHeadEquipment(false);
                                  } catch (err) {
                                    console.error('Failed to add head end equipment:', err);
                                    alert(err.message || 'Failed to add equipment');
                                  }
                                }}
                                className={`w-full text-left p-3 rounded-lg transition-all mb-1 ${isSelected
                                  ? 'bg-purple-100 dark:bg-purple-900/30 border-2 border-purple-400'
                                  : 'hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm truncate" style={styles.textPrimary}>
                                      {item.name}
                                    </div>
                                    {(item.manufacturer || item.model) && (
                                      <div className="text-xs truncate mt-0.5" style={styles.subtleText}>
                                        {[item.manufacturer, item.model].filter(Boolean).join(' ')}
                                      </div>
                                    )}
                                    {item.part_number && (
                                      <div className="text-[10px] mt-0.5" style={styles.subtleText}>
                                        P/N: {item.part_number}
                                      </div>
                                    )}
                                    {item.location && (
                                      <div className="text-[10px] mt-0.5 text-purple-600 dark:text-purple-400">
                                        {item.location}
                                      </div>
                                    )}
                                  </div>
                                  {isSelected && (
                                    <CheckCircle size={16} className="text-purple-600 dark:text-purple-400 flex-shrink-0" />
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* No results */}
                      {filteredHeadEnd.length === 0 && !showAllHeadEquipment && (
                        <div className="p-6 text-center space-y-3">
                          <div
                            className="mx-auto w-16 h-16 rounded-full flex items-center justify-center"
                            style={{
                              backgroundColor: mode === 'dark' ? '#3F3F46' : '#F3F4F6'
                            }}
                          >
                            <Server size={24} className="opacity-40" style={styles.subtleText} />
                          </div>
                          <div>
                            <p className="text-sm font-medium mb-1" style={styles.textPrimary}>
                              No head end equipment available
                            </p>
                            <p className="text-xs" style={styles.subtleText}>
                              {searchLower
                                ? 'Try a different search term'
                                : 'All head end equipment is already linked'}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Show Equipment from Other Rooms */}
                      {headEquipmentCatalog.hasOtherRooms && !showAllHeadEquipment && (
                        <div className="p-3 border-t" style={{ borderColor: styles.card.borderColor }}>
                          <button
                            onClick={() => setShowAllHeadEquipment(true)}
                            className="w-full px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                            style={{
                              backgroundColor: mode === 'dark' ? '#3F3F46' : '#F3F4F6',
                              color: styles.textSecondary.color
                            }}
                          >
                            <ChevronDown size={16} />
                            Show Equipment from Other Rooms
                          </button>
                        </div>
                      )}

                      {/* Other Rooms (When Expanded) */}
                      {showAllHeadEquipment && headEquipmentCatalog.hasOtherRooms && (
                        <div className="border-t" style={{ borderColor: styles.card.borderColor }}>
                          {headEquipmentCatalog.otherRooms.map(({ roomName, items }) => {
                            const filteredRoomItems = items.filter(item =>
                              !searchLower ||
                              item.name?.toLowerCase().includes(searchLower) ||
                              item.manufacturer?.toLowerCase().includes(searchLower) ||
                              item.model?.toLowerCase().includes(searchLower) ||
                              item.part_number?.toLowerCase().includes(searchLower)
                            );

                            if (filteredRoomItems.length === 0) return null;

                            return (
                              <div key={roomName} className="p-3 border-t" style={{ borderColor: styles.card.borderColor }}>
                                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide" style={styles.subtleText}>
                                  {roomName}
                                </div>
                                {filteredRoomItems.map((item) => {
                                  const isSelected = headEquipmentSelection.includes(item.id);
                                  return (
                                    <button
                                      key={item.id}
                                      onClick={async () => {
                                        try {
                                          const newSelection = [...headEquipmentSelection, item.id];
                                          await wireDropService.updateEquipmentLinks(id, 'head_end', newSelection, user?.id);
                                          setHeadEquipmentSelection(newSelection);
                                          await loadWireDrop();
                                          setShowHeadEquipmentDropdown(false);
                                          setHeadEquipmentSearch('');
                                          setShowAllHeadEquipment(false);
                                        } catch (err) {
                                          console.error('Failed to add head end equipment:', err);
                                          alert(err.message || 'Failed to add equipment');
                                        }
                                      }}
                                      className={`w-full text-left p-3 rounded-lg transition-all mb-1 ${isSelected
                                        ? 'bg-purple-100 dark:bg-purple-900/30 border-2 border-purple-400'
                                        : 'hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent'
                                      }`}
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-sm truncate" style={styles.textPrimary}>
                                            {item.name}
                                          </div>
                                          {(item.manufacturer || item.model) && (
                                            <div className="text-xs truncate mt-0.5" style={styles.subtleText}>
                                              {[item.manufacturer, item.model].filter(Boolean).join(' ')}
                                            </div>
                                          )}
                                          {item.part_number && (
                                            <div className="text-[10px] mt-0.5" style={styles.subtleText}>
                                              P/N: {item.part_number}
                                            </div>
                                          )}
                                        </div>
                                        {isSelected && (
                                          <CheckCircle size={16} className="text-purple-600 dark:text-purple-400 flex-shrink-0" />
                                        )}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })}

                          {/* Hide Button */}
                          <div className="p-3 border-t" style={{ borderColor: styles.card.borderColor }}>
                            <button
                              onClick={() => setShowAllHeadEquipment(false)}
                              className="w-full px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                              style={{
                                backgroundColor: mode === 'dark' ? '#3F3F46' : '#F3F4F6',
                                color: styles.textSecondary.color
                              }}
                            >
                              <ChevronDown size={16} className="rotate-180" />
                              Hide Other Rooms
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Shade Selection Modal */}
        {showShadeDropdown && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div
              className="rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
              style={styles.card}
            >
              {/* Header */}
              <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: styles.card.borderColor }}>
                <h3 className="text-lg font-semibold" style={styles.textPrimary}>
                  Select Shade
                </h3>
                <button
                  onClick={() => {
                    setShowShadeDropdown(false);
                    setShadeSearch('');
                  }}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Search Bar */}
              <div className="p-4 border-b" style={{ borderColor: styles.card.borderColor }}>
                <div className="relative">
                  <SearchIcon
                    size={16}
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    placeholder="Search shades..."
                    value={shadeSearch}
                    onChange={(e) => setShadeSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm"
                    style={styles.input}
                    autoFocus
                  />
                </div>
              </div>

              {/* Shade List */}
              <div className="flex-1 overflow-y-auto">
                {(() => {
                  const searchLower = shadeSearch.toLowerCase().trim();
                  const dropRoomName = wireDrop?.room_name?.toLowerCase().trim() || '';

                  // Filter and sort shades - same room first
                  const filteredShades = projectShades
                    .filter(shade =>
                      !searchLower ||
                      shade.name?.toLowerCase().includes(searchLower) ||
                      shade.technology?.toLowerCase().includes(searchLower) ||
                      shade.room?.name?.toLowerCase().includes(searchLower)
                    )
                    .sort((a, b) => {
                      // Same room shades first
                      const aInRoom = a.room?.name?.toLowerCase().trim() === dropRoomName;
                      const bInRoom = b.room?.name?.toLowerCase().trim() === dropRoomName;
                      if (aInRoom && !bInRoom) return -1;
                      if (!aInRoom && bInRoom) return 1;
                      return (a.name || '').localeCompare(b.name || '');
                    });

                  const sameRoomShades = filteredShades.filter(s => s.room?.name?.toLowerCase().trim() === dropRoomName);
                  const otherRoomShades = filteredShades.filter(s => s.room?.name?.toLowerCase().trim() !== dropRoomName);

                  if (filteredShades.length === 0) {
                    return (
                      <div className="p-6 text-center">
                        <Blinds size={32} className="mx-auto mb-2 opacity-30" style={styles.subtleText} />
                        <p className="text-sm" style={styles.subtleText}>
                          {searchLower ? 'No matching shades found' : 'No shades in this project'}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <>
                      {/* Same Room Shades */}
                      {sameRoomShades.length > 0 && (
                        <div className="p-3">
                          <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide" style={styles.subtleText}>
                            {wireDrop?.room_name || 'This Room'}
                          </div>
                          {sameRoomShades.map(shade => (
                            <button
                              key={shade.id}
                              onClick={async () => {
                                setSavingShade(true);
                                try {
                                  await wireDropService.updateShadeLinks(id, 'room_end', [shade.id], user?.id);
                                  setLinkedShadeId(shade.id);
                                  setShowShadeDropdown(false);
                                  setShadeSearch('');
                                } catch (err) {
                                  console.error('[Shade] Failed to link shade:', err);
                                  alert(`Failed to link shade: ${err.message}`);
                                } finally {
                                  setSavingShade(false);
                                }
                              }}
                              disabled={savingShade}
                              className={`w-full text-left p-3 rounded-lg transition-all mb-1 ${
                                linkedShadeId === shade.id
                                  ? 'bg-amber-100 dark:bg-amber-900/30 border-2 border-amber-400'
                                  : 'hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm truncate" style={styles.textPrimary}>
                                    {shade.name}
                                  </div>
                                  {shade.technology && (
                                    <div className="text-xs truncate mt-0.5" style={styles.subtleText}>
                                      {shade.technology}
                                    </div>
                                  )}
                                  {(shade.quoted_width || shade.quoted_height) && (
                                    <div className="text-[10px] mt-0.5" style={styles.subtleText}>
                                      {shade.quoted_width}" × {shade.quoted_height}"
                                    </div>
                                  )}
                                </div>
                                {linkedShadeId === shade.id && (
                                  <CheckCircle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Other Room Shades */}
                      {otherRoomShades.length > 0 && (
                        <div className="p-3 border-t" style={{ borderColor: styles.card.borderColor }}>
                          <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide" style={styles.subtleText}>
                            Other Rooms
                          </div>
                          {otherRoomShades.map(shade => (
                            <button
                              key={shade.id}
                              onClick={async () => {
                                setSavingShade(true);
                                try {
                                  await wireDropService.updateShadeLinks(id, 'room_end', [shade.id], user?.id);
                                  setLinkedShadeId(shade.id);
                                  setShowShadeDropdown(false);
                                  setShadeSearch('');
                                } catch (err) {
                                  console.error('[Shade] Failed to link shade:', err);
                                  alert(`Failed to link shade: ${err.message}`);
                                } finally {
                                  setSavingShade(false);
                                }
                              }}
                              disabled={savingShade}
                              className={`w-full text-left p-3 rounded-lg transition-all mb-1 ${
                                linkedShadeId === shade.id
                                  ? 'bg-amber-100 dark:bg-amber-900/30 border-2 border-amber-400'
                                  : 'hover:bg-gray-50 dark:hover:bg-zinc-800 border border-transparent'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm truncate" style={styles.textPrimary}>
                                    {shade.name}
                                  </div>
                                  {shade.room?.name && (
                                    <div className="text-xs truncate mt-0.5 text-amber-600 dark:text-amber-400">
                                      {shade.room.name}
                                    </div>
                                  )}
                                  {shade.technology && (
                                    <div className="text-xs truncate mt-0.5" style={styles.subtleText}>
                                      {shade.technology}
                                    </div>
                                  )}
                                </div>
                                {linkedShadeId === shade.id && (
                                  <CheckCircle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Remove Shade Link Button */}
                      {linkedShadeId && (
                        <div className="p-3 border-t" style={{ borderColor: styles.card.borderColor }}>
                          <button
                            onClick={async () => {
                              if (!window.confirm('Remove this shade link?')) return;
                              setSavingShade(true);
                              try {
                                await wireDropService.updateShadeLinks(id, 'room_end', [], user?.id);
                                setLinkedShadeId(null);
                                setShowShadeDropdown(false);
                                setShadeSearch('');
                              } catch (err) {
                                console.error('[Shade] Failed to remove shade:', err);
                                alert(`Failed to remove shade: ${err.message}`);
                              } finally {
                                setSavingShade(false);
                              }
                            }}
                            disabled={savingShade}
                            className="w-full px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10"
                          >
                            <Trash2 size={16} />
                            Remove Shade Link
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}

        {/* HomeKit QR Modal */}
        {showHomeKitQRModal && (
          <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-0 sm:p-4">
            <div className="w-full h-full sm:h-auto sm:max-h-[90vh] max-w-4xl flex flex-col rounded-none sm:rounded-2xl overflow-hidden" style={styles.card}>
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: styles.card.borderColor }}>
                <h3 className="text-lg font-semibold" style={styles.textPrimary}>
                  HomeKit QR Code
                </h3>
                <button
                  onClick={() => setShowHomeKitQRModal(false)}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X size={24} style={styles.textPrimary} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
                {primaryRoomEquipment?.homekit_qr_url ? (
                  <div className="w-full max-w-2xl">
                    <CachedSharePointImage
                      sharePointUrl={primaryRoomEquipment.homekit_qr_url}
                      sharePointDriveId={primaryRoomEquipment.homekit_qr_sharepoint_drive_id}
                      sharePointItemId={primaryRoomEquipment.homekit_qr_sharepoint_item_id}
                      displayType="full"
                      size="medium"
                      className="w-full h-auto rounded-lg"
                    />
                  </div>
                ) : (
                  <div className="text-center">
                    <Camera size={64} className="mx-auto mb-4 opacity-40" style={styles.subtleText} />
                    <p className="text-lg mb-2" style={styles.textPrimary}>
                      No HomeKit QR Code
                    </p>
                    <p className="text-sm mb-6" style={styles.subtleText}>
                      Add a photo of the HomeKit QR code for this equipment
                    </p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="p-4 border-t flex gap-3" style={{ borderColor: styles.card.borderColor }}>
                {primaryRoomEquipment?.homekit_qr_url ? (
                  <>
                    <Button
                      variant="secondary"
                      icon={Camera}
                      onClick={handleHomeKitQRUpload}
                      disabled={uploadingHomeKitQR}
                      loading={uploadingHomeKitQR}
                      className="flex-1"
                    >
                      Replace Photo
                    </Button>
                    <Button
                      variant="danger"
                      icon={Trash2}
                      onClick={handleHomeKitQRRemove}
                      disabled={uploadingHomeKitQR}
                      className="flex-1"
                    >
                      Remove
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    icon={Camera}
                    onClick={handleHomeKitQRUpload}
                    disabled={uploadingHomeKitQR}
                    loading={uploadingHomeKitQR}
                    className="flex-1"
                  >
                    Add Photo
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => setShowHomeKitQRModal(false)}
                  disabled={uploadingHomeKitQR}
                  className="flex-1"
                >
                  Close
                </Button>
              </div>
            </div>
          </div>
        )}

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

export default WireDropDetail;
