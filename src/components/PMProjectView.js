import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useAppState } from '../contexts/AppStateContext';
import { enhancedStyles } from '../styles/styleSystem';
import { projectsService, timeLogsService, projectProgressService } from '../services/supabaseService';
import { projectEquipmentService } from '../services/projectEquipmentService';
import { milestoneService } from '../services/milestoneService';
import { milestoneCacheService } from '../services/milestoneCacheService';
import { permitService } from '../services/permitService';
import { fetchDocumentContents, extractShapes, extractDocumentIdFromUrl } from '../services/lucidApi';
import { wireDropService } from '../services/wireDropService';
import { projectRoomsService } from '../services/projectRoomsService';
import { sharePointFolderService, normalizeSharePointRootUrl } from '../services/sharePointFolderService';
import * as unifiApi from '../services/unifiApi';
import { supabase } from '../lib/supabase';
import { normalizeRoomName, similarityScore } from '../utils/roomUtils';
import Button from './ui/Button';
import LucidChartCarousel from './LucidChartCarousel';
import ProjectEquipmentManager from './ProjectEquipmentManager';
import MilestoneGaugesDisplay from './MilestoneGaugesDisplay';
import ProjectPermits from './ProjectPermits';
import DateField from './ui/DateField';
import DateInput from './ui/DateInput';
import {
  Save,
  ExternalLink,
  Clock,
  Users,
  CheckCircle,
  XCircle,
  Edit,
  Loader,
  FolderOpen,
  FileText,
  Camera,
  Plus,
  Calendar,
  Target,
  AlertCircle,
  Settings,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  GripVertical,
  RefreshCw,
  Link,
  Upload,
  Package,
  ShoppingCart,
  Trash2,
  FileBarChart2,
  AlignJustify
} from 'lucide-react';
import { projectShadeService } from '../services/projectShadeService';
import ShadeManager from './Shades/ShadeManager';

// Old ProgressBar component removed - now using UnifiedProgressGauge in MilestoneGaugesDisplay

const normalizeFieldKey = (value) =>
  typeof value === 'string'
    ? value
      .toLowerCase()
      .replace(/[_\s-]+/g, '')
      .trim()
    : '';

const extractFieldValue = (raw) => {
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    return raw;
  }

  if (Array.isArray(raw)) {
    return raw
      .map(extractFieldValue)
      .filter(Boolean)
      .join(' ');
  }

  if (typeof raw === 'object') {
    if ('value' in raw) return extractFieldValue(raw.value);
    if ('text' in raw) return extractFieldValue(raw.text);
    if ('displayValue' in raw) return extractFieldValue(raw.displayValue);
    if ('values' in raw) return extractFieldValue(raw.values);
  }

  return '';
};

const getShapeCustomValue = (shape, key) => {
  if (!shape) return '';

  const target = normalizeFieldKey(key);
  if (!target) return '';

  const candidateSources = [
    shape.customData,
    shape.rawCustomData,
    shape.data,
    shape.properties,
    shape.metadata
  ];

  for (const source of candidateSources) {
    if (!source || typeof source !== 'object') continue;

    for (const dataKey in source) {
      if (!Object.prototype.hasOwnProperty.call(source, dataKey)) continue;
      const normalizedKey = normalizeFieldKey(dataKey);
      if (!normalizedKey) continue;

      if (normalizedKey === target) {
        const value = extractFieldValue(source[dataKey]);
        if (value !== '') return value;
      }
    }
  }

  return '';
};

const extractShapeRoomName = (shape) =>
  getShapeCustomValue(shape, 'Room Name') ||
  getShapeCustomValue(shape, 'Room') ||
  getShapeCustomValue(shape, 'RoomName') ||
  getShapeCustomValue(shape, 'Drop Location') ||
  '';

const extractShapeLocation = (shape) =>
  getShapeCustomValue(shape, 'Location') ||
  getShapeCustomValue(shape, 'Drop Location') ||
  '';

const extractShapeDropType = (shape) =>
  getShapeCustomValue(shape, 'Drop Type') ||
  getShapeCustomValue(shape, 'DropType') ||
  getShapeCustomValue(shape, 'Type') ||
  '';

const extractShapeWireType = (shape) =>
  getShapeCustomValue(shape, 'Wire Type') ||
  getShapeCustomValue(shape, 'WireType') ||
  getShapeCustomValue(shape, 'Cable Type') ||
  getShapeCustomValue(shape, 'Cable') ||
  '';

const extractShapeFloor = (shape) =>
  getShapeCustomValue(shape, 'Floor') || getShapeCustomValue(shape, 'Level') || '';

const extractShapeDevice = (shape) =>
  getShapeCustomValue(shape, 'Device') || '';

const normalizeHexColor = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(trimmed) ? trimmed.toUpperCase() : null;
};

const extractShapeColors = (shape) => {
  if (!shape) {
    return {
      primary: null,
      fill: null,
      line: null,
      candidates: []
    };
  }

  const pickFirstHex = (...candidates) => {
    for (const candidate of candidates) {
      const normalized = normalizeHexColor(candidate);
      if (candidate !== undefined) {
        candidatesList.push({ source: 'auto', value: candidate });
      }
      if (normalized) return normalized;
    }
    return null;
  };

  const candidatesList = [];

  const noteCandidate = (label, value) => {
    if (value !== undefined && value !== null) {
      candidatesList.push({ source: label, value });
    }
    return value;
  };

  return {
    primary: pickFirstHex(
      noteCandidate('customData.Shape Color', getShapeCustomValue(shape, 'Shape Color')),
      noteCandidate('customData.Color', getShapeCustomValue(shape, 'Color')),
      noteCandidate('shape.shapeColor', shape.shapeColor),
      noteCandidate('shape.fillColor', shape.fillColor),
      noteCandidate('style.fillColor', shape.style?.fillColor),
      noteCandidate('style.strokeColor', shape.style?.strokeColor),
      noteCandidate('properties.fillColor', shape.properties?.fillColor),
      noteCandidate('properties.strokeColor', shape.properties?.strokeColor),
      noteCandidate('shape.lineColor', shape.lineColor)
    ),
    fill: pickFirstHex(
      noteCandidate('shape.fillColor', shape.fillColor),
      noteCandidate('style.fillColor', shape.style?.fillColor),
      noteCandidate('properties.fillColor', shape.properties?.fillColor)
    ),
    line: pickFirstHex(
      noteCandidate('shape.lineColor', shape.lineColor),
      noteCandidate('style.lineColor', shape.style?.lineColor),
      noteCandidate('properties.lineColor', shape.properties?.lineColor),
      noteCandidate('properties.strokeColor', shape.properties?.strokeColor)
    ),
    candidates: candidatesList
  };
};

const numericOrNull = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const extractShapePositionInfo = (shape) => {
  if (!shape || typeof shape !== 'object') {
    return {
      x: null,
      y: null,
      width: null,
      height: null,
      rotation: null
    };
  }

  const boundingBox = shape.boundingBox || shape.bounds || shape.data?.boundingBox || {};
  const position = shape.position || shape.data?.position || {};
  const size = shape.size || boundingBox;

  return {
    x: numericOrNull(position.x ?? boundingBox.x ?? boundingBox.left ?? null),
    y: numericOrNull(position.y ?? boundingBox.y ?? boundingBox.top ?? null),
    width: numericOrNull(size.width ?? boundingBox.width ?? null),
    height: numericOrNull(size.height ?? boundingBox.height ?? null),
    rotation: numericOrNull(shape.rotation ?? shape.angle ?? shape.data?.rotation ?? null)
  };
};

const buildShapeMetadataPayload = (shape, extras = {}) => {
  if (!shape || typeof shape !== 'object') return null;

  const payload = {
    id: shape.id,
    pageId: shape.pageId || null,
    class: shape.class || shape.type || null,
    type: shape.type || null,
    text: shape.text || null,
    textAreas: Array.isArray(shape.textAreas) ? shape.textAreas : null,
    customData: shape.customData || null,
    customDataObject: typeof shape.customData === 'object' && !Array.isArray(shape.customData)
      ? shape.customData
      : null,
    rawCustomData: shape.rawCustomData || null,
    style: shape.style || null,
    properties: shape.properties || null,
    boundingBox: shape.boundingBox || shape.bounds || null,
    position: shape.position || null,
    size: shape.size || null,
    lineSource: shape.lineSource || null,
    lineTarget: shape.lineTarget || null,
    groupId: shape.groupId || null,
    groupName: shape.groupName || null,
    data: shape.data || null,
    extractedColors: extras.shapeColors || null,
    diagnostics: {
      receivedKeys: Object.keys(shape || {}),
      colorCandidates: extras.colorCandidates || null
    }
  };

  return payload;
};

const PMProjectViewEnhanced = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { mode } = useTheme();
  const { user } = useAuth();
  const sectionStyles = enhancedStyles.sections[mode];
  const { publishState, registerActions, unregisterActions } = useAppState();

  const [project, setProject] = useState(null);
  const [phases, setPhases] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [projectMilestones, setProjectMilestones] = useState([]);
  const [milestonesLoading, setMilestonesLoading] = useState(false);
  const [timeData, setTimeData] = useState({
    summary: [],
    activeUsers: [],
    totalHours: 0,
    totalMinutes: 0
  });
  const [projectProgress, setProjectProgress] = useState({ prewire: 0, trim: 0, commission: 0 });
  const [milestonePercentages, setMilestonePercentages] = useState({
    planning_design: 0,
    prewire_prep: 0,
    prewire: 0,
    trim_prep: 0,
    trim: 0,
    commissioning: 0
  });
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPhaseModal, setShowPhaseModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deleting, setDeleting] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showPhaseOrderModal, setShowPhaseOrderModal] = useState(false);
  const [newPhase, setNewPhase] = useState({ name: '', description: '', color: '#6b7280' });
  const [newStatus, setNewStatus] = useState({ name: '', description: '', color: '#6b7280' });
  const [formData, setFormData] = useState({
    name: '',
    client: '',
    address: '',
    phase: '',
    status: 'active',
    project_number: '',
    description: '',
    start_date: '',
    end_date: '',
    wiring_diagram_url: '',
    portal_proposal_url: '',
    client_folder_url: '',
    unifi_url: '',
    unifi_controller_ip: '192.168.1.1',
    unifi_network_api_key: '',
    unifi_site_id: '',
    unifi_site_name: ''
  });

  // Lucid integration state
  const [lucidLoading, setLucidLoading] = useState(false);
  const [lucidError, setLucidError] = useState(null);
  const [droppableShapes, setDroppableShapes] = useState([]);
  const [selectedShapes, setSelectedShapes] = useState(new Set());
  const [existingWireDrops, setExistingWireDrops] = useState([]);
  const [batchCreating, setBatchCreating] = useState(false);
  const [showLucidSection, setShowLucidSection] = useState(false);
  const [roomAssociationCollapsed, setRoomAssociationCollapsed] = useState(true);
  const [equipmentStats, setEquipmentStats] = useState({ total: 0, ordered: 0, received: 0 });
  const [procurementIssueCount, setProcurementIssueCount] = useState(0);
  const [issues, setIssues] = useState([]);
  const [showResolvedIssues, setShowResolvedIssues] = useState(false);
  const [laborBudgetCollapsed, setLaborBudgetCollapsed] = useState(true);
  const [folderInitializing, setFolderInitializing] = useState(false);
  const [folderInitSuccess, setFolderInitSuccess] = useState(null);
  const [projectOwners, setProjectOwners] = useState({ pm: null, technician: null });
  const [laborSummary, setLaborSummary] = useState({
    totalHours: 0,
    totalMinutes: 0,
    entries: []
  });

  // Client selection state
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [availableContacts, setAvailableContacts] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientSearchTerm, setClientSearchTerm] = useState('');
  const [showNewContactForm, setShowNewContactForm] = useState(false);
  const [newContactData, setNewContactData] = useState({
    name: '',
    company: '',
    email: '',
    phone: ''
  });
  const [projectRooms, setProjectRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [unmatchedRoomEntries, setUnmatchedRoomEntries] = useState([]);
  const [roomAssignments, setRoomAssignments] = useState({});
  const [roomAliasSaving, setRoomAliasSaving] = useState(null);
  const [showUnifiApiKey, setShowUnifiApiKey] = useState(false);
  const [projectStatusHistory, setProjectStatusHistory] = useState([]);
  const [milestoneDates, setMilestoneDates] = useState([]);
  const [phaseMilestonesEditMode, setPhaseMilestonesEditMode] = useState(false);

  // Window Treatments / Shades state
  const [projectShades, setProjectShades] = useState([]);
  const [shadesLoading, setShadesLoading] = useState(false);

  // Collapsible sections state - all default to collapsed (true)
  const [sectionsCollapsed, setSectionsCollapsed] = useState({
    projectInfo: true,
    linkedResources: true,
    roomMatching: true,
    timeTracking: true,
    lucidData: true,
    procurement: true,
    permits: true,
    issues: true,           // Issues section
    reports: true,          // Reports section placeholder
    phaseMilestones: false, // Start expanded for easy access
    buildingPermits: true,  // Start collapsed
    setupAndEdit: true,      // Setup & Configuration section - collapsed by default for existing projects
    shadesSetup: true,      // Window treatments setup (import controls)
    windowCoverings: true   // Window coverings list (embedded ShadeManager)
  });

  const toggleSection = (section) => {
    setSectionsCollapsed(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const loadProjectRooms = useCallback(async () => {
    if (!projectId) return;
    try {
      setRoomsLoading(true);
      const rooms = await projectRoomsService.fetchRoomsWithAliases(projectId);
      setProjectRooms(rooms);
    } catch (error) {
      console.error('Failed to load project rooms:', error);
    } finally {
      setRoomsLoading(false);
    }
  }, [projectId]);

  // Load project shades for window coverings section
  const loadProjectShades = useCallback(async () => {
    if (!projectId) return;
    try {
      setShadesLoading(true);
      const shades = await projectShadeService.getShades(projectId);
      setProjectShades(shades || []);
    } catch (error) {
      console.error('Failed to load project shades:', error);
    } finally {
      setShadesLoading(false);
    }
  }, [projectId]);

  const roomsByNormalized = useMemo(() => {
    const map = new Map();
    projectRooms.forEach((room) => {
      const normalized = room.normalized_name || normalizeRoomName(room.name);
      if (normalized) {
        map.set(normalized, room);
      }
    });
    return map;
  }, [projectRooms]);

  const aliasLookup = useMemo(() => {
    const map = new Map();
    projectRooms.forEach((room) => {
      (room.project_room_aliases || []).forEach((alias) => {
        if (alias?.normalized_alias) {
          map.set(alias.normalized_alias, room);
        } else if (alias?.alias) {
          map.set(normalizeRoomName(alias.alias), room);
        }
      });
    });
    return map;
  }, [projectRooms]);

  const supportsShapePositionColumns = useMemo(
    () => existingWireDrops.some((drop) => drop && Object.prototype.hasOwnProperty.call(drop, 'shape_x')),
    [existingWireDrops]
  );

  const supportsShapeRotationColumn = useMemo(
    () => existingWireDrops.some((drop) => drop && Object.prototype.hasOwnProperty.call(drop, 'shape_rotation')),
    [existingWireDrops]
  );

  const allRoomOptions = useMemo(
    () =>
      projectRooms.map((room) => ({
        value: room.id,
        label: room.name,
        isHeadEnd: room.is_headend
      })),
    [projectRooms]
  );

  const linkedDropCount = useMemo(
    () => existingWireDrops.filter((wd) => wd.lucid_shape_id).length,
    [existingWireDrops]
  );

  const suggestRoomMatch = useCallback(
    (normalizedName) => {
      if (!normalizedName) return null;
      let best = null;
      projectRooms.forEach((room) => {
        const candidate = room.normalized_name || normalizeRoomName(room.name);
        if (!candidate) return;
        const score = similarityScore(normalizedName, candidate);
        if (!best || score > best.score) {
          best = { room, score };
        }
      });
      return best;
    },
    [projectRooms]
  );

  const resolveRoomForName = useCallback(
    (roomName) => {
      const normalized = normalizeRoomName(roomName);
      if (!normalized) return null;
      if (aliasLookup.has(normalized)) {
        return { room: aliasLookup.get(normalized), matchedBy: 'alias' };
      }
      if (roomsByNormalized.has(normalized)) {
        return { room: roomsByNormalized.get(normalized), matchedBy: 'direct' };
      }
      return null;
    },
    [aliasLookup, roomsByNormalized]
  );

  useEffect(() => {
    // Build room list from BOTH existing wire drops AND fresh Lucid data
    const roomNameMap = new Map();

    // First, get room names from existing wire drops (persistent data)
    existingWireDrops.forEach((drop) => {
      const roomName = drop.room_name;
      if (!roomName) return;
      const normalized = normalizeRoomName(roomName);
      if (!normalized) return;
      const entry = roomNameMap.get(normalized) || { normalized, samples: [], source: 'wireDrop' };
      if (!entry.samples.includes(roomName)) {
        entry.samples.push(roomName);
      }
      roomNameMap.set(normalized, entry);
    });

    // Then add any additional rooms from Lucid shapes (if fetched)
    droppableShapes.forEach((shape) => {
      const roomName = extractShapeRoomName(shape);
      if (!roomName) return;
      const normalized = normalizeRoomName(roomName);
      if (!normalized) return;
      const entry = roomNameMap.get(normalized) || { normalized, samples: [], source: 'lucid' };
      if (!entry.samples.includes(roomName)) {
        entry.samples.push(roomName);
      }
      entry.source = 'both'; // Mark if it appears in both sources
      roomNameMap.set(normalized, entry);
    });

    // Find unmatched rooms (not in project rooms or aliases)
    const unmatched = [];
    roomNameMap.forEach((entry) => {
      if (roomsByNormalized.has(entry.normalized) || aliasLookup.has(entry.normalized)) {
        return;
      }
      const suggestion = suggestRoomMatch(entry.normalized);
      unmatched.push({ ...entry, suggestion });
    });

    setUnmatchedRoomEntries(unmatched);
    setRoomAssignments((prev) => {
      const next = {};
      unmatched.forEach((entry) => {
        if (prev[entry.normalized]) {
          next[entry.normalized] = prev[entry.normalized];
        } else if (entry.suggestion && entry.suggestion.score >= 0.72) {
          next[entry.normalized] = { type: 'existing', roomId: entry.suggestion.room.id };
        }
      });
      return next;
    });
  }, [existingWireDrops, droppableShapes, roomsByNormalized, aliasLookup, suggestRoomMatch]);

  const handleRoomSelectionChange = (normalized, value, entry) => {
    setRoomAssignments((prev) => {
      const next = { ...prev };
      if (!value) {
        delete next[normalized];
        return next;
      }

      if (value === '__new__') {
        next[normalized] = {
          type: 'new',
          name: entry.samples[0] || '',
          isHeadend: false
        };
      } else {
        next[normalized] = {
          type: 'existing',
          roomId: value
        };
      }
      return next;
    });
  };

  const normalizedClientFolder = useMemo(() => {
    if (!formData.client_folder_url) return '';
    const normalized =
      normalizeSharePointRootUrl(formData.client_folder_url) || formData.client_folder_url.trim();
    return normalized ? normalized.replace(/\/+$/, '') : '';
  }, [formData.client_folder_url]);

  const quickLinks = useMemo(
    () =>
      [
        { key: 'unifi', label: 'UniFi Site', url: formData.unifi_url, icon: ExternalLink },
        { key: 'lucid', label: 'Lucid Diagram', url: formData.wiring_diagram_url, icon: Link },
        { key: 'proposal', label: 'Proposal', url: formData.portal_proposal_url, icon: FileText },
        { key: 'client_folder', label: 'Client Folder', url: normalizedClientFolder, icon: FolderOpen },
        ...(normalizedClientFolder
          ? [
            { key: 'photos', label: 'Photos', url: `${normalizedClientFolder}/Photos`, icon: Camera },
            { key: 'files', label: 'Files', url: `${normalizedClientFolder}/Files`, icon: FolderOpen },
            { key: 'procurement', label: 'Procurement', url: `${normalizedClientFolder}/Procurement`, icon: FolderOpen }
          ]
          : [])
      ].filter((item) => Boolean(item.url)),
    [
      formData.unifi_url,
      formData.wiring_diagram_url,
      formData.portal_proposal_url,
      normalizedClientFolder
    ]
  );

  const resourceEntries = useMemo(
    () => [
      {
        key: 'client_folder_url',
        label: 'Client Folder URL (SharePoint/OneDrive)',
        icon: FolderOpen,
        placeholder: 'https://tenant.sharepoint.com/sites/SiteName/Shared Documents/ClientName',
        helper: 'Main client folder - subfolders (Photos, Files, Procurement, Business, Design, Data) will be auto-created',
        value: formData.client_folder_url,
        isSpecial: true // Will handle initialization on save
      },
      {
        key: 'wiring_diagram_url',
        label: 'Wiring Diagram URL',
        icon: Link,
        placeholder: 'https://lucid.app/...',
        helper: null,
        value: formData.wiring_diagram_url
      },
      {
        key: 'portal_proposal_url',
        label: 'Portal Proposal URL',
        icon: FileText,
        placeholder: 'https://...',
        helper: null,
        value: formData.portal_proposal_url
      },
      {
        key: 'unifi_url',
        label: 'UniFi Network URL',
        icon: Users,
        placeholder: 'https://unifi.ui.com/...',
        helper: 'Link to UniFi Network Controller for this project',
        value: formData.unifi_url
      }
    ],
    [
      formData.client_folder_url,
      formData.wiring_diagram_url,
      formData.portal_proposal_url,
      formData.unifi_url
    ]
  );

  const currentClientContact = useMemo(() => {
    if (!formData.client) {
      return null;
    }
    if (selectedClient) {
      return selectedClient;
    }
    const clientLower = formData.client.toLowerCase().trim();

    // Try exact match first (case-insensitive)
    let match = availableContacts.find(
      (contact) =>
        (contact?.name && contact.name.toLowerCase() === clientLower) ||
        (contact?.company && contact.company.toLowerCase() === clientLower)
    );

    // If no exact match, try partial match
    if (!match) {
      match = availableContacts.find(
        (contact) =>
          (contact?.name && contact.name.toLowerCase().includes(clientLower)) ||
          (contact?.company && contact.company.toLowerCase().includes(clientLower))
      );
    }

    return match || null;
  }, [availableContacts, formData.client, selectedClient]);

  const handleNewRoomNameChange = (normalized, name) => {
    setRoomAssignments((prev) => ({
      ...prev,
      [normalized]: {
        type: 'new',
        name,
        isHeadend: prev[normalized]?.isHeadend || false
      }
    }));
  };

  const handleNewRoomHeadendToggle = (normalized, checked) => {
    setRoomAssignments((prev) => ({
      ...prev,
      [normalized]: {
        type: 'new',
        name: prev[normalized]?.name || '',
        isHeadend: checked
      }
    }));
  };

  const handleRoomAliasApply = async (entry) => {
    const selection = roomAssignments[entry.normalized];
    if (!selection) {
      alert('Select a room mapping before saving.');
      return;
    }

    try {
      setRoomAliasSaving(entry.normalized);
      if (selection.type === 'existing' && selection.roomId) {
        await projectRoomsService.upsertAliases(
          projectId,
          selection.roomId,
          entry.samples,
          user?.id || null
        );
      } else if (selection.type === 'new') {
        const nameToUse = selection.name?.trim() || entry.samples[0];
        const newRoom = await projectRoomsService.createRoom(projectId, {
          name: nameToUse,
          is_headend: selection.isHeadend,
          createdBy: user?.id || null
        });
        await projectRoomsService.upsertAliases(
          projectId,
          newRoom.id,
          entry.samples,
          user?.id || null
        );
      }

      await loadProjectRooms();
    } catch (error) {
      console.error('Failed to save room alias mapping:', error);
      alert(error.message || 'Failed to save room alias mapping');
    } finally {
      setRoomAliasSaving(null);
    }
  };

  // Auto-open client picker when entering edit mode
  useEffect(() => {
    if (editMode && !formData.client) {
      // Small delay to ensure the UI has rendered
      setTimeout(() => setShowClientPicker(true), 100);
    } else if (!editMode) {
      setShowClientPicker(false);
    }
  }, [editMode, formData.client]);

  const loadContacts = async () => {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('name', { ascending: true });

      if (!error && data) {
        setAvailableContacts(data);
      }
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  };

  const loadPhasesAndStatuses = async () => {
    try {
      // Load phases
      const { data: phasesData, error: phasesError } = await supabase
        .from('project_phases')
        .select('*')
        .eq('active', true)
        .order('sort_order');

      if (!phasesError) setPhases(phasesData || []);

      // Load statuses
      const { data: statusesData, error: statusesError } = await supabase
        .from('project_statuses')
        .select('*')
        .eq('active', true)
        .order('sort_order');

      if (!statusesError) setStatuses(statusesData || []);
    } catch (error) {
      console.error('Failed to load phases/statuses:', error);
    }
  };

  const loadMilestoneDates = useCallback(async () => {
    if (!projectId) return;
    try {
      const { data, error } = await supabase
        .from('project_milestones')
        .select('*')
        .eq('project_id', projectId)
        .order('milestone_type');

      if (!error && data) {
        // Fetch user profiles for updated_by fields
        const milestones = data || [];
        if (milestones.length > 0) {
          const userIds = new Set();
          milestones.forEach(milestone => {
            if (milestone.updated_by) userIds.add(milestone.updated_by);
          });

          if (userIds.size > 0) {
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, email, full_name')
              .in('id', Array.from(userIds));

            const profileMap = {};
            (profiles || []).forEach(profile => {
              profileMap[profile.id] = profile;
            });

            // Attach user info to milestones
            milestones.forEach(milestone => {
              milestone.updated_by_user = profileMap[milestone.updated_by] || null;
            });
          }
        }

        setMilestoneDates(milestones);
      }
    } catch (error) {
      console.error('Failed to load milestone dates:', error);
    }
  }, [projectId]);

  const loadProjectData = async () => {
    try {
      setLoading(true);
      const projectData = await projectsService.getAll();
      const currentProject = projectData.find(p => p.id === projectId);

      if (currentProject) {
        setProject(currentProject);
        setFormData({
          name: currentProject.name || '',
          client: currentProject.client || '',
          address: currentProject.address || '',
          phase: currentProject.phase || '',
          status: currentProject.status || 'active',
          project_number: currentProject.project_number || '',
          description: currentProject.description || '',
          start_date: currentProject.start_date || '',
          end_date: currentProject.end_date || '',
          wiring_diagram_url: currentProject.wiring_diagram_url || '',
          portal_proposal_url: currentProject.portal_proposal_url || '',
          client_folder_url: currentProject.client_folder_url || '',
          unifi_url: currentProject.unifi_url || '',
          unifi_controller_ip: currentProject.unifi_controller_ip || '192.168.1.1',
          unifi_network_api_key: currentProject.unifi_network_api_key || '',
          unifi_site_id: currentProject.unifi_site_id || '',
          unifi_site_name: currentProject.unifi_site_name || ''
        });

        // Load milestones
        const { data: milestonesData } = await supabase
          .from('project_phase_milestones')
          .select(`
            *,
            phase:project_phases(*)
          `)
          .eq('project_id', projectId);

        setMilestones(milestonesData || []);
      }
    } catch (error) {
      console.error('Failed to load project:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProjectOwners = async () => {
    try {
      // Load project stakeholders with their roles and contact info
      const { data: stakeholders, error } = await supabase
        .from('project_stakeholders')
        .select(`
          *,
          stakeholder_roles (name),
          contacts (first_name, last_name, email)
        `)
        .eq('project_id', projectId);

      if (error) throw error;

      // Find PM and Lead Technician
      const pm = stakeholders?.find(s => s.stakeholder_roles?.name === 'Project Manager');
      const technician = stakeholders?.find(s => s.stakeholder_roles?.name === 'Lead Technician');

      setProjectOwners({
        pm: pm?.contacts ? `${pm.contacts.first_name || ''} ${pm.contacts.last_name || ''}`.trim() : null,
        technician: technician?.contacts ? `${technician.contacts.first_name || ''} ${technician.contacts.last_name || ''}`.trim() : null
      });
    } catch (error) {
      console.error('Failed to load project owners:', error);
      setProjectOwners({ pm: null, technician: null });
    }
  };

  const loadTimeData = async () => {
    try {
      // Get time summary for all users on this project
      const summary = await timeLogsService.getProjectTimeSummary(projectId);

      // Calculate totals
      const totalMinutes = summary.reduce((sum, user) => {
        if (user.total_minutes !== undefined && user.total_minutes !== null) {
          return sum + Number(user.total_minutes);
        }
        if (user.total_hours !== undefined && user.total_hours !== null) {
          return sum + Number(user.total_hours) * 60;
        }
        return sum;
      }, 0);

      const totalHours = totalMinutes / 60;

      // Get currently checked-in users
      const activeUsers = summary.filter((user) => user.has_active_session);

      setTimeData({
        summary,
        activeUsers,
        totalHours,
        totalMinutes
      });
    } catch (error) {
      console.error('Failed to load time data:', error);
    }
  };

  const loadProgress = async () => {
    try {
      const progress = await projectProgressService.getProjectProgress(projectId);
      setProjectProgress(progress);
    } catch (error) {
      console.error('Failed to load progress:', error);
      setProjectProgress({ prewire: 0, trim: 0, commission: 0 });
    }
  };

  const loadEquipmentStats = useCallback(
    async (incomingEquipment) => {
      if (!projectId) {
        setEquipmentStats({ total: 0, ordered: 0, received: 0 });
        return;
      }

      try {
        let equipmentItems = incomingEquipment;

        if (!Array.isArray(equipmentItems)) {
          const fetched = await projectEquipmentService.fetchProjectEquipment(projectId);
          equipmentItems = fetched || [];
        }

        const stats = (equipmentItems || []).reduce(
          (acc, item) => {
            const type = (item?.equipment_type || '').toLowerCase();
            if (type === 'labor') {
              return acc;
            }

            const quantity = Number(item?.planned_quantity) || 0;
            if (quantity <= 0) {
              return acc;
            }

            acc.total += quantity;
            if (item?.ordered_confirmed) {
              acc.ordered += quantity;
            }
            if (item?.delivered_confirmed) {
              acc.received += quantity;
            }
            return acc;
          },
          { total: 0, ordered: 0, received: 0 }
        );

        setEquipmentStats(stats);
      } catch (error) {
        console.error('Failed to load equipment stats:', error);
        setEquipmentStats({ total: 0, ordered: 0, received: 0 });
      }
    },
    [projectId]
  );

  // Load open procurement/receiving issues count for visual indicator
  const loadProcurementIssues = useCallback(async () => {
    if (!projectId) {
      setProcurementIssueCount(0);
      return;
    }

    try {
      const { count, error } = await supabase
        .from('issues')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .like('title', 'Receiving Issue:%')
        .in('status', ['open', 'blocked']);

      if (error) throw error;
      setProcurementIssueCount(count || 0);
    } catch (error) {
      console.error('Failed to load procurement issues:', error);
      setProcurementIssueCount(0);
    }
  }, [projectId]);

  // Load all project issues for Issues section
  const loadIssues = useCallback(async () => {
    if (!projectId) {
      setIssues([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('issues')
        .select('id, title, description, status, priority, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setIssues(data || []);
    } catch (error) {
      console.error('Failed to load issues:', error);
      setIssues([]);
    }
  }, [projectId]);

  const loadLaborSummary = useCallback(async () => {
    if (!projectId) {
      setLaborSummary({ totalHours: 0, totalMinutes: 0, entries: [] });
      return;
    }

    try {
      const laborData = await projectEquipmentService.fetchProjectLabor(projectId);
      const entries = (laborData || []).map((item) => {
        const hours = Number(item?.planned_hours || 0);
        return {
          id: item.id,
          roomName: item.project_rooms?.name || 'Unassigned',
          laborType: item.labor_type || 'Labor',
          hours,
          hourlyRate: Number(item?.hourly_rate || 0)
        };
      });
      const totalHours = entries.reduce((sum, entry) => sum + entry.hours, 0);
      const totalMinutes = Math.round(totalHours * 60);
      setLaborSummary({ totalHours, totalMinutes, entries });
    } catch (error) {
      console.error('Failed to load labor summary:', error);
      setLaborSummary({ totalHours: 0, totalMinutes: 0, entries: [] });
    }
  }, [projectId]);

  const loadWireDrops = useCallback(async () => {
    if (!projectId) {
      setExistingWireDrops([]);
      return;
    }

    try {
      const { data: wireDrops } = await supabase
        .from('wire_drops')
        .select('*')
        .eq('project_id', projectId);

      setExistingWireDrops(wireDrops || []);
    } catch (error) {
      console.error('Failed to load wire drops:', error);
      setExistingWireDrops([]);
    }
  }, [projectId]);

  const loadProjectMilestones = useCallback(async () => {
    if (!projectId) return;

    try {
      setMilestonesLoading(true);

      // STEP 1: Try to load from cache first (instant display)
      const cachedData = milestoneCacheService.getCached(projectId);
      if (cachedData) {
        setMilestonePercentages(cachedData.data);
        console.log('[PMProjectView] Loaded milestones from cache');
      }

      // STEP 2: Fetch fresh data in background
      let percentages = {
        planning_design: 0,
        prewire_orders: { percentage: 0, itemCount: 0, totalItems: 0 },
        prewire_receiving: { percentage: 0, itemCount: 0, totalItems: 0 },
        prewire: 0,
        prewire_phase: { percentage: 0, orders: { percentage: 0, itemCount: 0, totalItems: 0 }, receiving: { percentage: 0, itemCount: 0, totalItems: 0 }, stages: 0 },
        trim_orders: { percentage: 0, itemCount: 0, totalItems: 0 },
        trim_receiving: { percentage: 0, itemCount: 0, totalItems: 0 },
        trim: 0,
        trim_phase: { percentage: 0, orders: { percentage: 0, itemCount: 0, totalItems: 0 }, receiving: { percentage: 0, itemCount: 0, totalItems: 0 }, stages: 0 },
        commissioning: 0,
        prewire_prep: 0,
        trim_prep: 0
      };

      try {
        percentages = await milestoneService.getAllPercentagesOptimized(projectId);
        // Cache the fresh data
        milestoneCacheService.setCached(projectId, percentages);
        console.log('[PMProjectView] Calculated and cached fresh milestones');
      } catch (calcError) {
        console.warn('Failed to calculate milestone percentages (may be due to missing data):', calcError);
        // Continue with zero percentages or cached data - don't fail the whole load
      }

      setMilestonePercentages(percentages);

      // Get milestone data
      const milestones = await milestoneService.getProjectMilestones(projectId);

      // Format milestones for display
      const formattedMilestones = milestones.map(m => milestoneService.formatMilestone(m));
      setProjectMilestones(formattedMilestones);

      // Check completion status for all milestones - handle errors gracefully
      try {
        await milestoneService.checkAllMilestones(projectId);

        // IMPORTANT: Sync prep milestone completion status with actual gauge percentages
        // This will auto-complete OR auto-uncomplete prewire_prep and trim_prep
        // based on whether orders AND receiving are both at 100%
        console.log('[PMProjectView] Syncing prep milestone completion status...');
        await milestoneService.autoCompletePrepMilestones(projectId);

        // Reload to get updated completion data
        const updatedMilestones = await milestoneService.getProjectMilestones(projectId);
        const formattedUpdated = updatedMilestones.map(m => milestoneService.formatMilestone(m));
        setProjectMilestones(formattedUpdated);
      } catch (checkError) {
        console.warn('Failed to check milestone completion status:', checkError);
        // Continue with the milestones we have
      }
    } catch (error) {
      console.error('Failed to load project milestones:', error);
      // Ensure we have clean state even on error
      setProjectMilestones([]);
      setMilestonePercentages({
        planning_design: 0,
        prewire_prep: 0,
        prewire: 0,
        trim_prep: 0,
        trim: 0,
        commissioning: 0
      });
    } finally {
      setMilestonesLoading(false);
    }
  }, [projectId]);

  const handleEquipmentChange = useCallback(
    (equipmentList) => {
      if (Array.isArray(equipmentList)) {
        loadEquipmentStats(equipmentList);
      } else {
        loadEquipmentStats();
      }
      loadLaborSummary();
      // Reload project rooms since CSV import may have created new rooms
      loadProjectRooms();
    },
    [loadEquipmentStats, loadLaborSummary, loadProjectRooms]
  );

  const fetchUnifiSiteData = async () => {
    // Need the UniFi URL from the project to fetch site data from Cloud API
    if (!formData.unifi_url) {
      console.log('[fetchUnifiSiteData] Skipping - missing UniFi URL');
      return;
    }

    try {
      console.log('[fetchUnifiSiteData] Fetching site data from Cloud API...');

      // TODO: This should come from program settings, not hardcoded
      // For now, hardcode the Cloud API key
      const CLOUD_API_KEY = 'Uz0CvgeS2Zn5O3y46DvNzloXw_fLDeVu';
      const CLOUD_API_BASE_URL = 'https://api.ui.com';

      // Parse the project's UniFi URL to extract host/console ID
      const { hostId, siteId: parsedSiteId } = unifiApi.parseUnifiUrl(formData.unifi_url);
      console.log('[fetchUnifiSiteData] Parsed URL:', { hostId, parsedSiteId });

      // ALWAYS use the Cloud API base URL (not the project URL)
      const hostsResponse = await unifiApi.fetchSites(
        CLOUD_API_BASE_URL,
        CLOUD_API_KEY
      );

      console.log('[fetchUnifiSiteData] Hosts response:', hostsResponse);

      // Extract the hosts array from the response
      // Cloud API returns: { data: [...], httpStatusCode: 200, traceId: "..." }
      const hosts = hostsResponse?.data || hostsResponse || [];
      console.log('[fetchUnifiSiteData] Extracted hosts array:', hosts);

      // Check if we have any hosts
      if (Array.isArray(hosts) && hosts.length > 0) {
        // If we have a host ID, try to find the matching host
        let targetHost = hosts[0]; // Default to first host

        if (hostId) {
          const matchingHost = hosts.find(h =>
            h.id === hostId || h.hostId === hostId
          );
          if (matchingHost) {
            targetHost = matchingHost;
            console.log('[fetchUnifiSiteData] Found matching host by ID:', hostId);
          } else {
            console.warn('[fetchUnifiSiteData] No matching host found for ID:', hostId, '- using first host');
          }
        }

        // Extract site info from the host
        // The response structure has: host.reportedState with controller info
        const siteId = targetHost.id || targetHost.hostId || targetHost._id;
        const siteName = targetHost.reportedState?.hostname || targetHost.name || targetHost.hostName || siteId;

        console.log('[fetchUnifiSiteData] Populating site data:', { siteId, siteName });

        // Return the site data so caller can use it immediately
        return { siteId, siteName };
      } else {
        console.warn('[fetchUnifiSiteData] No hosts returned from Cloud API');
        return null;
      }
    } catch (error) {
      console.error('[fetchUnifiSiteData] Failed to fetch site data:', error);
      // Don't throw - we still want to save the project even if site fetch fails
      return null;
    }
  };

  // Format user info for display (consistent with rest of app)
  const formatMilestoneUserInfo = (user, timestamp) => {
    if (!user) return 'N/A';
    const name = user.full_name || user.email || 'Unknown User';
    if (timestamp) {
      const date = new Date(timestamp);
      const dateStr = date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      return `${name} on ${dateStr}`;
    }
    return name;
  };

  const handleMilestoneUpdate = async (milestoneType, field, value) => {
    try {
      console.log('[Milestone Update] Called:', { milestoneType, field, value });

      // Get current user for tracking
      const { data: { user } } = await supabase.auth.getUser();

      // Find existing milestone or create new one
      const existingMilestone = milestoneDates.find(m => m.milestone_type === milestoneType);

      // Prepare update data with user tracking
      const updateData = {
        [field]: value,
        updated_by: user?.id,
        updated_at: new Date().toISOString()
      };

      // If marking as completed, also set actual_date if not already set
      if (field === 'completed_manually' && value === true) {
        const currentActualDate = existingMilestone?.actual_date;
        if (!currentActualDate) {
          updateData.actual_date = new Date().toISOString().split('T')[0];
          console.log('[Milestone Update] Auto-setting actual_date:', updateData.actual_date);
        }
        updateData.percent_complete = 100;
      } else if (field === 'completed_manually' && value === false) {
        // If uncompleting, clear actual_date and reset percent_complete
        updateData.actual_date = null;
        updateData.percent_complete = 0;
      }

      if (existingMilestone) {
        // Update existing milestone
        const { error } = await supabase
          .from('project_milestones')
          .update(updateData)
          .eq('id', existingMilestone.id);

        if (error) throw error;

        // Update local state
        setMilestoneDates(prev =>
          prev.map(m =>
            m.milestone_type === milestoneType
              ? { ...m, ...updateData }
              : m
          )
        );
      } else {
        // Create new milestone
        const { data, error } = await supabase
          .from('project_milestones')
          .insert([{
            project_id: projectId,
            milestone_type: milestoneType,
            ...updateData,
            percent_complete: field === 'completed_manually' && value ? 100 : 0
          }])
          .select()
          .single();

        if (error) throw error;

        // Add to local state
        setMilestoneDates(prev => [...prev, data]);
      }

      // BIDIRECTIONAL SYNC: If updating inspection milestone target_date, sync to permit
      if (
        (milestoneType === 'rough_in_inspection' || milestoneType === 'final_inspection') &&
        field === 'target_date'
      ) {
        console.log('[Milestone Update] Syncing target_date to permit...');
        try {
          await permitService.syncMilestoneTargetDateToPermit(projectId, milestoneType, value);
          console.log('[Milestone Update] ✅ Target date synced to permit');
        } catch (syncError) {
          console.error('[Milestone Update] ❌ Failed to sync to permit:', syncError);
          // Don't throw - milestone update already succeeded
        }
      }

      console.log('[Milestone Update] ✅ Milestone updated successfully');
    } catch (error) {
      console.error('Failed to update milestone:', error);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      console.log('Starting save with formData:', formData);
      console.log('selectedClient state:', selectedClient);
      console.log('Project ID:', projectId);

      // Fetch UniFi site data before saving if controller info is provided
      const unifiSiteData = await fetchUnifiSiteData();

      // Extract Lucid document ID from wiring diagram URL
      let lucidDocId = null;
      let lucidDocUrl = null;
      if (formData.wiring_diagram_url) {
        lucidDocId = extractDocumentIdFromUrl(formData.wiring_diagram_url);
        lucidDocUrl = formData.wiring_diagram_url;
        if (lucidDocId) {
          console.log('Extracted Lucid document ID:', lucidDocId);
        }
      }

      const normalizedClientFolderUrl = formData.client_folder_url && formData.client_folder_url.trim()
        ? normalizeSharePointRootUrl(formData.client_folder_url)
        : null;

      const clientFolderUrlToSave = normalizedClientFolderUrl || null;

      // Only send fields that exist in the database
      const validFields = {
        name: formData.name,
        client: formData.client,
        address: formData.address,
        phase: formData.phase,
        status: formData.status,
        project_number: formData.project_number,
        description: formData.description,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        wiring_diagram_url: formData.wiring_diagram_url || null,
        portal_proposal_url: formData.portal_proposal_url || null,
        client_folder_url: clientFolderUrlToSave,
        unifi_url: formData.unifi_url || null,
        unifi_controller_ip: formData.unifi_controller_ip || null,
        unifi_network_api_key: formData.unifi_network_api_key || null,
        unifi_site_id: unifiSiteData?.siteId || formData.unifi_site_id || null,
        unifi_site_name: unifiSiteData?.siteName || formData.unifi_site_name || null,
        lucid_document_id: lucidDocId,
        lucid_document_url: lucidDocUrl
      };

      console.log('Sending update with fields:', validFields);

      // Use supabase directly to avoid any service layer issues
      const { data, error } = await supabase
        .from('projects')
        .update(validFields)
        .eq('id', projectId)
        .select()
        .single();

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      console.log('Update successful:', data);
      setProject({ ...project, ...data });

      // Ensure form displays the normalized value
      setFormData(prev => ({
        ...prev,
        client_folder_url: clientFolderUrlToSave || '',
      }));

      // Update formData with the fetched site data if we got it
      if (unifiSiteData) {
        setFormData(prev => ({
          ...prev,
          unifi_site_id: unifiSiteData.siteId,
          unifi_site_name: unifiSiteData.siteName
        }));
      }

      // Initialize SharePoint folder structure if client_folder_url is provided
      if (clientFolderUrlToSave) {
        try {
          setFolderInitializing(true);
          console.log('Initializing SharePoint folders for:', clientFolderUrlToSave);

          const folderResult = await sharePointFolderService.initializeProjectFolders(
            projectId,
            clientFolderUrlToSave
          );

          console.log('Folder initialization result:', folderResult);
          setFolderInitSuccess(folderResult);

        } catch (folderError) {
          console.error('Failed to initialize folders:', folderError);
          setFolderInitSuccess({ error: folderError.message });
          // Don't fail the whole save - just warn the user
          alert(`Project saved, but folder initialization had an issue: ${folderError.message}`);
        } finally {
          setFolderInitializing(false);
        }
      }

      // Handle client stakeholder assignment - ALWAYS try if there's a client
      let stakeholderResult = null;
      if (formData.client) {
        let contactToUse = selectedClient;

        // If no selectedClient, try to find matching contact
        if (!contactToUse) {
          console.log('No selectedClient, searching for matching contact...');
          const clientLower = formData.client.toLowerCase().trim();

          // Try exact match first (case-insensitive)
          contactToUse = availableContacts.find(c =>
            (c.name && c.name.toLowerCase() === clientLower) ||
            (c.company && c.company.toLowerCase() === clientLower)
          );

          // If no exact match, try partial match (name or company contains client string)
          if (!contactToUse) {
            contactToUse = availableContacts.find(c =>
              (c.name && c.name.toLowerCase().includes(clientLower)) ||
              (c.company && c.company.toLowerCase().includes(clientLower)) ||
              (c.name && clientLower.includes(c.name.toLowerCase())) ||
              (c.company && clientLower.includes(c.company.toLowerCase()))
            );
          }

          console.log('Found matching contact:', contactToUse);
        }

        if (contactToUse) {
          stakeholderResult = await updateClientStakeholder(contactToUse);
        } else {
          console.warn('Could not find a contact for client:', formData.client);
          alert(`Warning: Client "${formData.client}" was saved, but no matching contact was found to create a stakeholder. Please ensure this contact exists in your contacts list.`);
        }
      }

      setEditMode(false);

      // Show success message
      let successMessage = 'Project saved successfully!';
      if (folderInitSuccess && !folderInitSuccess.error) {
        successMessage += '\n\nSharePoint folders created/verified:\n- Photos\n- Files\n- Procurement\n- Business\n- Design\n- Data';
      }
      if (stakeholderResult === true) {
        successMessage += '\n\nClient stakeholder has been updated.';
      } else if (stakeholderResult === false) {
        successMessage += '\n\nWarning: Issue updating client stakeholder.';
      }
      alert(successMessage);

    } catch (error) {
      console.error('Failed to save project:', error);
      alert(`Failed to save: ${error.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProject = async () => {
    try {
      setDeleting(true);

      console.log('Attempting to delete project:', projectId);

      // Call the delete service method which handles all cleanup
      const result = await projectsService.delete(projectId);

      console.log('Delete result:', result);

      if (result && result.success) {
        // Close modal and navigate immediately to prevent errors
        setShowDeleteConfirm(false);
        setDeleteStep(1);

        // Show success message
        alert('Project deleted successfully!');

        // Navigate back to PM dashboard after successful deletion
        // Use replace to prevent going back to deleted project
        navigate('/pm-dashboard', { replace: true });
      } else {
        throw new Error('Delete operation did not return success');
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
      alert(`Failed to delete project: ${error.message || 'Unknown error'}`);
      setDeleting(false);
      setShowDeleteConfirm(false);
      setDeleteStep(1);
    }
  };

  const handleDeleteClick = () => {
    setDeleteStep(1);
    setShowDeleteConfirm(true);
  };

  useEffect(() => {
    if (!projectId) return;

    // Always load these core functions when projectId changes
    loadProjectData();
    loadTimeData();
    loadPhasesAndStatuses();
    loadContacts();
    loadProgress();
    loadProjectOwners();
    loadMilestoneDates();
    loadProcurementIssues();
    loadIssues();

    // Always attempt to load milestones - ensure section stays visible even on errors
    loadProjectMilestones().catch(error => {
      console.error('Failed to load milestones on mount:', error);
      // Ensure clean state so the UI shows empty state instead of disappearing
      setMilestonesLoading(false);
      setProjectMilestones([]);
      setMilestonePercentages({
        planning_design: 0,
        prewire_prep: 0,
        prewire: 0,
        trim_prep: 0,
        trim: 0,
        commissioning: 0
      });
    });

    // Subscribe to milestone changes for realtime updates
    const milestoneSubscription = supabase
      .channel(`project-milestones-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_milestones',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          console.log('[PMProjectView] Milestone change detected:', payload);
          // Reload milestone dates to reflect changes
          loadMilestoneDates();
        }
      )
      .subscribe();

    const interval = setInterval(loadTimeData, 30000);
    return () => {
      clearInterval(interval);
      milestoneSubscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, loadMilestoneDates]);

  useEffect(() => {
    loadProjectRooms();
  }, [loadProjectRooms]);

  useEffect(() => {
    loadProjectShades();
  }, [loadProjectShades]);

  useEffect(() => {
    loadEquipmentStats();
  }, [loadEquipmentStats]);

  // Handle URL parameters to auto-expand sections (e.g., from procurement issues link)
  useEffect(() => {
    const section = searchParams.get('section');
    if (section === 'issues') {
      // Auto-expand the issues section
      setSectionsCollapsed(prev => ({
        ...prev,
        issues: false
      }));
    }
  }, [searchParams]);

  useEffect(() => {
    loadLaborSummary();
  }, [loadLaborSummary]);

  useEffect(() => {
    loadWireDrops();
  }, [loadWireDrops]);

  // ══════════════════════════════════════════════════════════════
  // AI VOICE COPILOT INTEGRATION
  // ══════════════════════════════════════════════════════════════

  // Publish state for AI awareness
  useEffect(() => {
    if (!project) return;
    publishState({
      view: 'pm-project-detail',
      project: {
        id: project.id,
        name: project.name,
        address: project.address,
        status: project.status,
        phase: project.phase,
        projectNumber: project.project_number
      },
      editMode: editMode,
      sectionsCollapsed: sectionsCollapsed,
      milestonePercentages: milestonePercentages,
      totalTimeHours: timeData?.totalHours || 0,
      hint: 'PM project management view. Full project editing, milestones, equipment, procurement, stakeholders.'
    });
  }, [publishState, project, editMode, sectionsCollapsed, milestonePercentages, timeData]);

  // Register actions for AI
  useEffect(() => {
    const actions = {
      toggle_edit_mode: async () => {
        setEditMode(prev => !prev);
        return { success: true, message: editMode ? 'Exiting edit mode' : 'Entering edit mode' };
      },
      expand_section: async ({ section }) => {
        setSectionsCollapsed(prev => ({ ...prev, [section]: false }));
        return { success: true, message: `Expanded ${section}` };
      },
      collapse_section: async ({ section }) => {
        setSectionsCollapsed(prev => ({ ...prev, [section]: true }));
        return { success: true, message: `Collapsed ${section}` };
      },
      go_to_shades: async () => {
        navigate(`/projects/${projectId}/shades`);
        return { success: true, message: 'Navigating to shades' };
      },
      go_to_equipment: async () => {
        navigate(`/projects/${projectId}/equipment`);
        return { success: true, message: 'Navigating to equipment' };
      },
      go_to_procurement: async () => {
        navigate(`/projects/${projectId}/procurement`);
        return { success: true, message: 'Navigating to procurement' };
      },
      go_to_receiving: async () => {
        navigate(`/projects/${projectId}/receiving`);
        return { success: true, message: 'Navigating to receiving' };
      },
      go_to_reports: async () => {
        navigate(`/projects/${projectId}/reports`);
        return { success: true, message: 'Navigating to reports' };
      },
      get_milestone_status: async () => {
        return {
          success: true,
          milestones: milestonePercentages,
          message: `Planning: ${milestonePercentages.planning_design}%, Prewire: ${milestonePercentages.prewire}%, Trim: ${milestonePercentages.trim}%, Commissioning: ${milestonePercentages.commissioning}%`
        };
      },
      save_project: async () => {
        if (editMode) {
          // Trigger save
          return { success: true, message: 'Saving project changes...' };
        }
        return { success: false, error: 'Not in edit mode' };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, projectId, navigate, editMode, milestonePercentages]);

  // INITIAL SYNC: Sync existing permit dates to milestones on page load
  useEffect(() => {
    const syncPermitDatesToMilestones = async () => {
      if (!projectId || !milestoneDates || milestoneDates.length === 0) return;

      try {
        console.log('[Initial Sync] Checking for existing permit dates to sync...');

        // Fetch permit data
        const { data: permits, error } = await supabase
          .from('project_permits')
          .select('*')
          .eq('project_id', projectId);

        if (error) {
          console.error('[Initial Sync] Error fetching permits:', error);
          return;
        }

        if (!permits || permits.length === 0) {
          console.log('[Initial Sync] No permits found for project');
          return;
        }

        const permit = permits[0];
        console.log('[Initial Sync] Found permit:', permit);

        // Get current user for tracking
        const { data: { user } } = await supabase.auth.getUser();

        // Check rough_in_inspection milestone
        const roughInMilestone = milestoneDates.find(m => m.milestone_type === 'rough_in_inspection');
        if (permit.rough_in_target_date && (!roughInMilestone || !roughInMilestone.target_date)) {
          console.log('[Initial Sync] Syncing rough_in_target_date to milestone:', permit.rough_in_target_date);

          if (roughInMilestone) {
            // Update existing milestone
            const { error: updateError } = await supabase
              .from('project_milestones')
              .update({
                target_date: permit.rough_in_target_date,
                updated_by: user?.id,
                updated_at: new Date().toISOString()
              })
              .eq('id', roughInMilestone.id);

            if (!updateError) {
              setMilestoneDates(prev =>
                prev.map(m =>
                  m.milestone_type === 'rough_in_inspection'
                    ? { ...m, target_date: permit.rough_in_target_date }
                    : m
                )
              );
            }
          } else {
            // Create new milestone
            const { data: newMilestone, error: insertError } = await supabase
              .from('project_milestones')
              .insert({
                project_id: projectId,
                milestone_type: 'rough_in_inspection',
                target_date: permit.rough_in_target_date,
                updated_by: user?.id,
                percent_complete: 0
              })
              .select()
              .single();

            if (!insertError && newMilestone) {
              setMilestoneDates(prev => [...prev, newMilestone]);
            }
          }
        }

        // Check final_inspection milestone
        const finalMilestone = milestoneDates.find(m => m.milestone_type === 'final_inspection');
        if (permit.final_inspection_target_date && (!finalMilestone || !finalMilestone.target_date)) {
          console.log('[Initial Sync] Syncing final_inspection_target_date to milestone:', permit.final_inspection_target_date);

          if (finalMilestone) {
            // Update existing milestone
            const { error: updateError } = await supabase
              .from('project_milestones')
              .update({
                target_date: permit.final_inspection_target_date,
                updated_by: user?.id,
                updated_at: new Date().toISOString()
              })
              .eq('id', finalMilestone.id);

            if (!updateError) {
              setMilestoneDates(prev =>
                prev.map(m =>
                  m.milestone_type === 'final_inspection'
                    ? { ...m, target_date: permit.final_inspection_target_date }
                    : m
                )
              );
            }
          } else {
            // Create new milestone
            const { data: newMilestone, error: insertError } = await supabase
              .from('project_milestones')
              .insert({
                project_id: projectId,
                milestone_type: 'final_inspection',
                target_date: permit.final_inspection_target_date,
                updated_by: user?.id,
                percent_complete: 0
              })
              .select()
              .single();

            if (!insertError && newMilestone) {
              setMilestoneDates(prev => [...prev, newMilestone]);
            }
          }
        }

        console.log('[Initial Sync] ✅ Initial sync complete');
      } catch (error) {
        console.error('[Initial Sync] Error syncing permit dates:', error);
      }
    };

    syncPermitDatesToMilestones();
  }, [projectId, milestoneDates]);

  const updateClientStakeholder = async (contact) => {
    try {
      console.log('========================================');
      console.log('UPDATING CLIENT STAKEHOLDER');
      console.log('Contact:', contact);
      console.log('Project ID:', projectId);
      console.log('========================================');

      if (!contact || !contact.id) {
        console.error('Invalid contact provided:', contact);
        return false;
      }

      // First, get or create the "Client" role in stakeholder_roles
      let clientRoleId = null;
      const { data: existingRoles, error: roleQueryError } = await supabase
        .from('stakeholder_roles')
        .select('*')
        .eq('name', 'Client')
        .single();

      if (roleQueryError && roleQueryError.code !== 'PGRST116') {
        // PGRST116 is "not found" error, which is okay
        console.error('Error checking for Client role:', roleQueryError);
        return false;
      }

      if (existingRoles) {
        clientRoleId = existingRoles.id;
        console.log('Found existing Client role with ID:', clientRoleId);
      } else {
        // Create the Client role
        console.log('Creating Client role in stakeholder_roles...');
        const { data: newRole, error: createRoleError } = await supabase
          .from('stakeholder_roles')
          .insert([{
            name: 'Client',
            category: 'external',
            description: 'Project client',
            sort_order: 12
          }])
          .select()
          .single();

        if (createRoleError) {
          console.error('Failed to create Client role:', createRoleError);
          return false;
        }

        clientRoleId = newRole.id;
        console.log('Created new Client role with ID:', clientRoleId);
      }

      // Now check if there's already a stakeholder assignment for this contact with Client role
      const { data: existingAssignment, error: assignmentQueryError } = await supabase
        .from('project_stakeholders')
        .select('*')
        .eq('project_id', projectId)
        .eq('stakeholder_role_id', clientRoleId);

      if (assignmentQueryError) {
        console.error('Error checking for existing Client assignment:', assignmentQueryError);
        return false;
      }

      console.log('Existing Client assignments found:', existingAssignment);

      if (existingAssignment && existingAssignment.length > 0) {
        // Update existing assignment with new contact
        console.log('Updating existing assignment with contact_id:', contact.id);
        const { data: updateData, error: updateError } = await supabase
          .from('project_stakeholders')
          .update({
            contact_id: contact.id
          })
          .eq('project_id', projectId)
          .eq('stakeholder_role_id', clientRoleId)
          .select();

        if (updateError) {
          console.error('Failed to update Client assignment:', updateError);
          return false;
        } else {
          console.log('✅ Successfully updated existing Client stakeholder assignment');
          console.log('Updated data:', updateData);
          return true;
        }
      } else {
        // Create new Client assignment
        console.log('Creating new Client assignment with data:', {
          project_id: projectId,
          contact_id: contact.id,
          stakeholder_role_id: clientRoleId,
          is_primary: true
        });

        const { data: insertData, error: insertError } = await supabase
          .from('project_stakeholders')
          .insert([{
            project_id: projectId,
            contact_id: contact.id,
            stakeholder_role_id: clientRoleId,
            is_primary: true,
            assignment_notes: 'Auto-assigned from project client field'
          }])
          .select();

        if (insertError) {
          console.error('Failed to create Client assignment:', insertError);
          console.error('Error details:', JSON.stringify(insertError, null, 2));
          return false;
        } else {
          console.log('✅ Successfully created new Client stakeholder assignment');
          console.log('Inserted data:', insertData);
          return true;
        }
      }
    } catch (error) {
      console.error('Exception in updateClientStakeholder:', error);
      return false;
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleClientSelect = (contact) => {
    // Set the client name based on the contact
    // For company contacts (is_company=true), use company name; otherwise use person's name
    const clientName = contact.is_company
      ? (contact.company || contact.name || 'Unnamed Contact')
      : (contact.name || contact.company || 'Unnamed Contact');
    setFormData(prev => ({
      ...prev,
      client: clientName
    }));
    setSelectedClient(contact);
    setShowClientPicker(false);
    setClientSearchTerm('');

    // Note: The stakeholder assignment will happen when the project is saved
    console.log('Client selected:', contact);
  };

  const handleClearClient = () => {
    setFormData(prev => ({
      ...prev,
      client: ''
    }));
    setSelectedClient(null);
    setClientSearchTerm('');
  };

  const handleCreateNewContact = async () => {
    try {
      // Validate required fields
      if (!newContactData.name && !newContactData.company) {
        alert('Please provide at least a name or company');
        return;
      }

      // Create new contact
      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert([newContactData])
        .select()
        .single();

      if (error) throw error;

      // Add to available contacts
      setAvailableContacts([...availableContacts, newContact]);

      // Select the new contact
      handleClientSelect(newContact);

      // Reset form
      setNewContactData({
        name: '',
        company: '',
        email: '',
        phone: ''
      });
      setShowNewContactForm(false);

    } catch (error) {
      console.error('Failed to create contact:', error);
      alert('Failed to create contact: ' + error.message);
    }
  };

  // Filter contacts based on search term
  const filteredContacts = useMemo(() => {
    if (!clientSearchTerm.trim()) return availableContacts;

    const search = clientSearchTerm.toLowerCase();
    return availableContacts.filter(contact => {
      const name = (contact.name || '').toLowerCase();
      const company = (contact.company || '').toLowerCase();
      const email = (contact.email || '').toLowerCase();

      return name.includes(search) ||
        company.includes(search) ||
        email.includes(search);
    });
  }, [availableContacts, clientSearchTerm]);

  const handleAddPhase = async () => {
    if (!newPhase.name) return;

    try {
      const { data, error } = await supabase
        .from('project_phases')
        .insert([{
          ...newPhase,
          sort_order: phases.length + 1
        }])
        .select()
        .single();

      if (!error) {
        setPhases([...phases, data]);
        setNewPhase({ name: '', description: '', color: '#6b7280' });
        setShowPhaseModal(false);
      }
    } catch (error) {
      console.error('Failed to add phase:', error);
    }
  };

  const handleAddStatus = async () => {
    if (!newStatus.name) return;

    try {
      const { data, error } = await supabase
        .from('project_statuses')
        .insert([{
          ...newStatus,
          sort_order: statuses.length + 1
        }])
        .select()
        .single();

      if (!error) {
        setStatuses([...statuses, data]);
        setNewStatus({ name: '', description: '', color: '#6b7280' });
        setShowStatusModal(false);
      }
    } catch (error) {
      console.error('Failed to add status:', error);
    }
  };

  const handlePhaseReorder = async (phaseId, direction) => {
    const phaseIndex = phases.findIndex(p => p.id === phaseId);
    if (
      (direction === 'up' && phaseIndex === 0) ||
      (direction === 'down' && phaseIndex === phases.length - 1)
    ) {
      return;
    }

    const newIndex = direction === 'up' ? phaseIndex - 1 : phaseIndex + 1;
    const newPhases = [...phases];
    [newPhases[phaseIndex], newPhases[newIndex]] = [newPhases[newIndex], newPhases[phaseIndex]];

    // Update sort_order in database
    try {
      const updates = newPhases.map((phase, index) => ({
        id: phase.id,
        sort_order: index + 1
      }));

      for (const update of updates) {
        await supabase
          .from('project_phases')
          .update({ sort_order: update.sort_order })
          .eq('id', update.id);
      }

      // Update local state
      setPhases(newPhases.map((phase, index) => ({
        ...phase,
        sort_order: index + 1
      })));
    } catch (error) {
      console.error('Failed to reorder phases:', error);
    }
  };

  const handlePhaseMilestoneUpdate = async (phaseId, field, value) => {
    try {
      const existingMilestone = milestones.find(m => m.phase_id === phaseId);

      if (existingMilestone) {
        // Update existing milestone
        const { data, error } = await supabase
          .from('project_phase_milestones')
          .update({ [field]: value || null, updated_at: new Date().toISOString() })
          .eq('id', existingMilestone.id)
          .select()
          .single();

        if (error) {
          throw error;
        }

        setMilestones(milestones.map(m =>
          m.id === existingMilestone.id
            ? { ...m, [field]: value || null }
            : m
        ));
      } else {
        // Create new milestone
        const { data, error } = await supabase
          .from('project_phase_milestones')
          .insert([{
            project_id: projectId,
            phase_id: phaseId,
            [field]: value || null
          }])
          .select(`
            *,
            phase:project_phases(*)
          `)
          .single();

        if (error) {
          throw error;
        }

        setMilestones([...milestones, data]);
      }
    } catch (error) {
      console.error('Error in handleMilestoneUpdate:', error);
      throw error;
    }
  };

  const formatDuration = (minutes) => {
    if (!minutes) return '0h 0m';
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}h ${mins}m`;
  };

  const formatLastActivity = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  // Lucid Integration Functions
  const handleLutronUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      if (!user?.id) throw new Error('You must be logged in to import shades.');

      const result = await projectShadeService.importShadeCsv(projectId, file, user.id);
      alert(`Successfully imported ${result.inserted} shades!`);
      // alert('Import disabled temporarily for debugging');
    } catch (err) {
      console.error('Import failed:', err);
      alert('Failed to import Lutron CSV: ' + err.message);
    } finally {
      setLoading(false);
      event.target.value = ''; // Reset input
    }
  };

  const handleFetchLucidData = async () => {
    if (!formData.wiring_diagram_url) {
      alert('Please enter a Wiring Diagram URL first');
      return;
    }

    setLucidLoading(true);
    setLucidError(null);

    try {
      // Extract document ID from URL
      const documentId = extractDocumentIdFromUrl(formData.wiring_diagram_url);
      if (!documentId) {
        throw new Error('Invalid Lucid Chart URL format');
      }

      // Fetch document contents
      const docData = await fetchDocumentContents(documentId);

      // Extract shapes
      const shapes = extractShapes(docData);

      // Filter shapes that have IS Drop = true (case-insensitive for both key and value)
      const droppable = shapes.filter((shape) => {
        const isDropValue = getShapeCustomValue(shape, 'IS Drop');
        if (isDropValue === '') return false;

        const valueStr = String(isDropValue).toLowerCase().trim();
        return (
          valueStr === 'true' ||
          valueStr === 'yes' ||
          valueStr === '1' ||
          isDropValue === true ||
          isDropValue === 1
        );
      });

      setDroppableShapes(droppable);
      console.log(`Found ${droppable.length} droppable shapes out of ${shapes.length} total shapes`);
      console.log('All shapes:', shapes.length);
      console.log('Sample shape customData:', shapes[0]?.customData);

      // Load existing wire drops to check for duplicates
      const { data: wireDrops } = await supabase
        .from('wire_drops')
        .select('*')
        .eq('project_id', projectId);

      setExistingWireDrops(wireDrops || []);
      setShowLucidSection(true);

    } catch (error) {
      console.error('Failed to fetch Lucid data:', error);
      setLucidError(error.message);
    } finally {
      setLucidLoading(false);
    }
  };

  const handleShapeSelection = (shapeId) => {
    const newSelected = new Set(selectedShapes);
    if (newSelected.has(shapeId)) {
      newSelected.delete(shapeId);
    } else {
      newSelected.add(shapeId);
    }
    setSelectedShapes(newSelected);
  };

  const handleSelectAll = () => {
    // Only select shapes that don't already have wire drops
    const selectableShapes = droppableShapes.filter(shape =>
      !existingWireDrops.some(wd => wd.lucid_shape_id === shape.id)
    );
    setSelectedShapes(new Set(selectableShapes.map(s => s.id)));
  };

  const handleDeselectAll = () => {
    setSelectedShapes(new Set());
  };

  const handleCreateWireDropsFromSelected = async () => {
    if (selectedShapes.size === 0) {
      alert('Please select at least one shape');
      return;
    }

    setBatchCreating(true);
    const errors = [];
    const created = [];
    const updated = [];
    const aliasUpsertsByRoom = new Map();
    const dropCountByRoomAndType = new Map();

    try {
      // First pass: count existing drops by room and type for auto-generation
      const { data: existingDrops } = await supabase
        .from('wire_drops')
        .select('room_name, drop_type, drop_name')
        .eq('project_id', projectId);

      if (existingDrops) {
        existingDrops.forEach(drop => {
          if (drop.room_name && drop.drop_type) {
            const key = `${normalizeRoomName(drop.room_name)}_${drop.drop_type.toLowerCase()}`;
            dropCountByRoomAndType.set(key, (dropCountByRoomAndType.get(key) || 0) + 1);
          }
        });
      }

      for (const shapeId of selectedShapes) {
        const shape = droppableShapes.find((s) => s.id === shapeId);
        if (!shape) continue;

        // Extract basic properties that work with current database schema
        const roomNameRaw = extractShapeRoomName(shape);
        const location = extractShapeLocation(shape);
        const wireType = extractShapeWireType(shape) || 'CAT6';
        const dropType = extractShapeDropType(shape);

        const resolvedRoom = resolveRoomForName(roomNameRaw);
        const canonicalRoomName = resolvedRoom?.room?.name || roomNameRaw;
        const locationValue =
          canonicalRoomName ||
          roomNameRaw ||
          location ||
          'Unassigned';

        // ALWAYS let the service auto-generate wire drop names using room+type+number
        // Never use the Lucid shape name
        const dropNameToUse = null;

        if (resolvedRoom?.room) {
          const aliasNormalized = normalizeRoomName(roomNameRaw);
          const canonicalNormalized = normalizeRoomName(resolvedRoom.room.name);
          if (
            aliasNormalized &&
            canonicalNormalized &&
            aliasNormalized !== canonicalNormalized
          ) {
            const aliasSet =
              aliasUpsertsByRoom.get(resolvedRoom.room.id) || new Set();
            aliasSet.add(roomNameRaw);
            aliasUpsertsByRoom.set(resolvedRoom.room.id, aliasSet);
          }
        }

        // Check if wire drop already exists for this shape
        const existingDrop = existingWireDrops.find(wd => wd.lucid_shape_id === shapeId);

        if (existingDrop) {
          // Update existing wire drop with latest data from Lucid
          // Generate new name if room or type changed OR if current name is generic
          // Update existing wire drop with latest data from Lucid
          // STRICTLY ENFORCE STANDARD NAMING: Always regenerate name based on Room + Type + Number
          // This overwrites any custom names to ensure global consistency and uniqueness
          let updatedDropName = await wireDropService.generateDropName(
            projectId,
            canonicalRoomName,
            dropType,
            existingDrop.id // Pass ID to exclude self from collision check
          );

          const shapeColors = extractShapeColors(shape);
          const positionInfo = extractShapePositionInfo(shape);
          const shapeMetadata = buildShapeMetadataPayload(shape, {
            shapeColors,
            colorCandidates: shapeColors.candidates
          });
          const resolvedShapeColor =
            shapeColors.primary ||
            existingDrop.shape_color ||
            existingDrop.shape_fill_color ||
            null;
          const resolvedFillColor =
            shapeColors.fill ||
            shapeColors.primary ||
            existingDrop.shape_fill_color ||
            existingDrop.shape_color ||
            null;
          const resolvedLineColor =
            shapeColors.line ||
            existingDrop.shape_line_color ||
            null;
          const shapeDataPayload = shapeMetadata || existingDrop.shape_data || null;

          const updatePayload = {
            drop_name: updatedDropName || existingDrop.drop_name,
            room_name: canonicalRoomName,
            location: locationValue,
            wire_type: wireType,
            drop_type: dropType,
            install_note: getShapeCustomValue(shape, 'Install Note') ||
              getShapeCustomValue(shape, 'Note') || null,
            device: extractShapeDevice(shape),
            shape_color: resolvedShapeColor,
            shape_fill_color: resolvedFillColor,
            shape_line_color: resolvedLineColor,
            shape_data: shapeDataPayload,
            project_room_id: resolvedRoom?.room?.id || null,
            lucid_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          if (supportsShapePositionColumns) {
            updatePayload.shape_x = positionInfo.x;
            updatePayload.shape_y = positionInfo.y;
            updatePayload.shape_width = positionInfo.width;
            updatePayload.shape_height = positionInfo.height;
          }

          if (supportsShapeRotationColumn) {
            updatePayload.shape_rotation = positionInfo.rotation;
          }

          const { data, error } = await supabase
            .from('wire_drops')
            .update(updatePayload)
            .eq('id', existingDrop.id)
            .select()
            .single();

          if (error) {
            errors.push(`Failed to update wire drop: ${error.message}`);
          } else {
            updated.push(data);
          }
        } else {
          // Use the service to create wire drop properly with stages
          // The service will auto-generate drop_name based on room + type + number

          // Extract color from shape metadata - store in both places
          const shapeColors = extractShapeColors(shape);
          const positionInfo = extractShapePositionInfo(shape);
          const shapeMetadata = buildShapeMetadataPayload(shape, {
            shapeColors,
            colorCandidates: shapeColors.candidates
          });

          const wireDropData = {
            room_name: canonicalRoomName,
            drop_type: dropType,  // This is required for auto-generation
            drop_name: dropNameToUse, // Always null - let service auto-generate
            location: locationValue,
            wire_type: wireType,
            install_note: getShapeCustomValue(shape, 'Install Note') ||
              getShapeCustomValue(shape, 'Note') || null,
            device: extractShapeDevice(shape),
            // Store color in individual columns (fallback)
            shape_color: shapeColors.primary,
            shape_fill_color: shapeColors.fill || shapeColors.primary,
            shape_line_color: shapeColors.line,
            // Store complete shape metadata including Color field
            shape_data: shapeMetadata,
            lucid_shape_id: shape.id,
            lucid_page_id: shape.pageId || null,
            project_room_id: resolvedRoom?.room?.id || null,
            lucid_synced_at: new Date().toISOString()
          };

          if (supportsShapePositionColumns) {
            wireDropData.shape_x = positionInfo.x;
            wireDropData.shape_y = positionInfo.y;
            wireDropData.shape_width = positionInfo.width;
            wireDropData.shape_height = positionInfo.height;
          }

          if (supportsShapeRotationColumn) {
            wireDropData.shape_rotation = positionInfo.rotation;
          }

          try {
            const wireDrop = await wireDropService.createWireDrop(projectId, wireDropData);
            created.push(wireDrop);
          } catch (createError) {
            errors.push(`Failed to create wire drop: ${createError.message}`);
          }
        }
      }

      // Record any new aliases discovered during creation
      if (aliasUpsertsByRoom.size > 0) {
        try {
          await Promise.all(
            Array.from(aliasUpsertsByRoom.entries()).map(([roomId, aliases]) =>
              projectRoomsService.upsertAliases(
                projectId,
                roomId,
                Array.from(aliases),
                user?.id || null
              )
            )
          );
          await loadProjectRooms();
        } catch (aliasError) {
          console.error('Failed to save room aliases from Lucid import:', aliasError);
        }
      }

      // Refresh existing wire drops
      const { data: updatedWireDrops } = await supabase
        .from('wire_drops')
        .select('*')
        .eq('project_id', projectId);

      setExistingWireDrops(updatedWireDrops || []);
      setSelectedShapes(new Set());

      // Show results
      const messages = [];
      if (created.length > 0) {
        messages.push(`Created ${created.length} new wire drop(s)`);
      }
      if (updated.length > 0) {
        messages.push(`Updated ${updated.length} existing wire drop(s)`);
      }
      if (errors.length > 0) {
        messages.push(`\n\nErrors:\n${errors.join('\n')}`);
      }

      if (messages.length > 0) {
        alert(messages.join('\n'));
      }

    } catch (error) {
      console.error('Batch create error:', error);
      alert('Failed to create wire drops: ' + error.message);
    } finally {
      setBatchCreating(false);
    }
  };

  const isShapeLinked = (shapeId) => {
    return existingWireDrops.some(wd => wd.lucid_shape_id === shapeId);
  };

  const getLinkedWireDrop = (shapeId) => {
    return existingWireDrops.find(wd => wd.lucid_shape_id === shapeId);
  };

  const totalEquipmentPieces = equipmentStats.total || 0;
  const orderedPieces = equipmentStats.ordered || 0;
  const receivedPieces = equipmentStats.received || 0;
  const orderedPercentage =
    totalEquipmentPieces > 0 ? Math.round((orderedPieces / totalEquipmentPieces) * 100) : 0;
  const receivedPercentage =
    totalEquipmentPieces > 0 ? Math.round((receivedPieces / totalEquipmentPieces) * 100) : 0;
  const orderedHelper =
    totalEquipmentPieces > 0 ? `${orderedPieces} of ${totalEquipmentPieces} pieces ordered` : undefined;
  const receivedHelper =
    totalEquipmentPieces > 0 ? `${receivedPieces} of ${totalEquipmentPieces} pieces onsite` : undefined;
  const totalLaborMinutes = Math.round(Number(laborSummary.totalMinutes || 0));
  const loggedMinutes = Math.round(
    timeData?.totalMinutes !== undefined
      ? timeData.totalMinutes
      : (timeData.totalHours || 0) * 60
  );
  const remainingMinutesRaw = totalLaborMinutes - loggedMinutes;
  const remainingMinutes = remainingMinutesRaw > 0 ? remainingMinutesRaw : 0;
  const overrunMinutes = remainingMinutesRaw < 0 ? Math.abs(remainingMinutesRaw) : 0;

  // Helper function to get setup status for the collapsible section badge
  const getSetupStatus = () => {
    const hasLucid = !!formData.wiring_diagram_url;
    const hasEquipment = totalEquipmentPieces > 0;
    const roomsAligned = unmatchedRoomEntries.length === 0 && (existingWireDrops.length > 0 || droppableShapes.length > 0);
    const complete = [hasLucid, hasEquipment, roomsAligned].filter(Boolean).length;

    if (complete === 3) {
      return { text: 'Complete', color: 'success' };
    } else if (complete === 0) {
      return { text: 'Needs Setup', color: 'warning' };
    } else {
      return { text: `${complete}/3 Complete`, color: 'warning' };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">Project not found</p>
          <Button onClick={() => navigate('/pm-dashboard')} className="mt-4">
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Project Header */}
      <div style={sectionStyles.card} className="p-6 space-y-5">
        {/* Project Title and Edit Button - Same Line */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {project?.name || 'Untitled Project'}
            </h1>
            {formData.project_number && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1 text-sm font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-200">
                #{formData.project_number}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editMode && (
              <Button
                onClick={handleDeleteClick}
                variant="danger"
                icon={Trash2}
                disabled={saving || deleting}
              >
                Delete Project
              </Button>
            )}
            <Button
              onClick={() => (editMode ? handleSave() : setEditMode(true))}
              variant={editMode ? 'primary' : 'secondary'}
              icon={editMode ? Save : Edit}
              disabled={saving}
            >
              {saving ? 'Saving...' : editMode ? 'Save Changes' : 'Edit Project'}
            </Button>
          </div>
        </div>

        {/* Project Info */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600 dark:text-gray-400">
            {/* Left side - Client badge */}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 font-medium text-gray-700 dark:bg-zinc-800 dark:text-gray-200">
              <Users className="h-4 w-4" />
              {formData.client || 'Client not set'}
            </span>

            {/* Right side - Phase and Status */}
            <div className="flex items-center gap-3">
              {/* Phase selector/badge */}
              {editMode ? (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-zinc-800 px-2 py-1">
                  <Target className="h-4 w-4 text-gray-700 dark:text-gray-200" />
                  <select
                    value={formData.phase}
                    onChange={(e) => setFormData({ ...formData, phase: e.target.value })}
                    className="bg-transparent text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none cursor-pointer pr-1"
                  >
                    <option value="">Select phase</option>
                    {phases.map((phase) => (
                      <option key={phase.id} value={phase.name}>
                        {phase.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 font-medium text-gray-700 dark:bg-zinc-800 dark:text-gray-200">
                  <Target className="h-4 w-4" />
                  {formData.phase || 'Phase not set'}
                </span>
              )}

              {/* Status selector/badge */}
              {editMode ? (
                <div className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-zinc-800 px-2 py-1">
                  <CheckCircle className="h-4 w-4 text-gray-700 dark:text-gray-200" />
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="bg-transparent text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none cursor-pointer pr-1"
                  >
                    <option value="">Select status</option>
                    {statuses.length > 0 ? (
                      statuses.map((status) => (
                        <option key={status.id} value={status.name}>
                          {status.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="active">Active</option>
                        <option value="on_hold">On Hold</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </>
                    )}
                  </select>
                </div>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 font-medium text-gray-700 dark:bg-zinc-800 dark:text-gray-200">
                  <CheckCircle className="h-4 w-4" />
                  {formData.status || 'Status not set'}
                </span>
              )}
            </div>
          </div>
          {(formData.address || formData.start_date || formData.end_date) && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
              {formData.address && <span>{formData.address}</span>}
              {(formData.start_date || formData.end_date) && (
                <span className="inline-flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span>
                    {formData.start_date || 'Start TBD'}
                    <span className="mx-2 text-gray-400">→</span>
                    {formData.end_date || 'End TBD'}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => navigate(`/projects/${projectId}/procurement`)}
            variant={procurementIssueCount > 0 ? 'danger' : 'primary'}
            icon={procurementIssueCount > 0 ? AlertCircle : ShoppingCart}
            size="md"
            className={procurementIssueCount > 0 ? 'animate-pulse' : ''}
          >
            Procurement {procurementIssueCount > 0 && `(${procurementIssueCount} Issue${procurementIssueCount > 1 ? 's' : ''})`}
          </Button>
        </div>

        {/* Quick Links - Evenly Spaced - Always visible */}
        {quickLinks.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {quickLinks.map(({ key, label, url, icon: Icon }) => (
              <Button
                key={key}
                onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                variant="ghost"
                size="sm"
                icon={Icon}
                className="border border-gray-200 bg-white hover:border-violet-300 hover:text-violet-600 dark:border-gray-700 dark:bg-zinc-900 dark:hover:border-violet-500 w-full justify-center"
              >
                {label}
              </Button>
            ))}
          </div>
        )}

        {/* Setup & Configuration - Only visible in edit mode */}
        {editMode && (
          <div>
            <button
              onClick={() => toggleSection('setupAndEdit')}
              className="w-full flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md"
              style={sectionStyles.card}
            >
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
                <span className="font-medium text-zinc-900 dark:text-zinc-100">Setup & Configuration</span>
              </div>
              <div className="flex items-center gap-3">
                {(() => {
                  const status = getSetupStatus();
                  return (
                    <span
                      className="px-2 py-0.5 text-xs rounded-full"
                      style={status.color === 'success'
                        ? { backgroundColor: 'rgba(148, 175, 50, 0.15)', color: '#94AF32' }
                        : { backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B' }
                      }
                    >
                      {status.text}
                    </span>
                  );
                })()}
                <ChevronRight
                  className="w-5 h-5 text-zinc-500 transition-transform duration-200"
                  style={{ transform: sectionsCollapsed.setupAndEdit ? 'none' : 'rotate(90deg)' }}
                />
              </div>
            </button>

            {!sectionsCollapsed.setupAndEdit && (
              <div className="mt-4 space-y-4">

                {/* Step 0: Window Treatments Setup */}
                <div>
                  <button
                    onClick={() => toggleSection('shadesSetup')}
                    className="w-full flex items-center justify-between rounded-xl border p-3 transition-all duration-200 hover:shadow-sm"
                    style={sectionStyles.card}
                  >
                    <div className="flex items-center gap-3">
                      <AlignJustify className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Window Treatments Setup</span>
                    </div>
                    <ChevronRight
                      className="w-4 h-4 text-zinc-500 transition-transform duration-200"
                      style={{ transform: sectionsCollapsed.shadesSetup ? 'none' : 'rotate(90deg)' }}
                    />
                  </button>

                  {!sectionsCollapsed.shadesSetup && (
                    <div className="mt-4 rounded-2xl border p-4 space-y-4" style={sectionStyles.card}>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        Import the Lutron Quote CSV to initialize window treatments. This creates the 'Project Shades' list for technicians to verify.
                      </p>

                      <div className="flex flex-wrap gap-3">
                        <Button variant="primary" size="sm" icon={Upload} onClick={() => document.getElementById('pm-lutron-upload').click()}>
                          Import Lutron CSV
                        </Button>
                        <input
                          id="pm-lutron-upload"
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={handleLutronUpload}
                        />
                        <Button variant="secondary" size="sm" icon={ExternalLink} onClick={() => navigate(`/projects/${projectId}/shades`)}>
                          Open Full Manager
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Step 1: Lucid Wire Drops Import */}
                {formData.wiring_diagram_url && (
                  <div>
                    <button
                      onClick={() => toggleSection('lucidData')}
                      className="w-full flex items-center justify-between rounded-xl border p-3 transition-all duration-200 hover:shadow-sm"
                      style={sectionStyles.card}
                    >
                      <div className="flex items-center gap-3">
                        <Link className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Import Lucid Wire Drops</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {existingWireDrops.length > 0 && (
                          <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                            {existingWireDrops.length}
                          </span>
                        )}
                        <ChevronRight
                          className="w-4 h-4 text-zinc-500 transition-transform duration-200"
                          style={{ transform: sectionsCollapsed.lucidData ? 'none' : 'rotate(90deg)' }}
                        />
                      </div>
                    </button>

                    {!sectionsCollapsed.lucidData && (
                      <div className="mt-4 rounded-2xl border p-4" style={sectionStyles.card}>
                        <div className="flex justify-between items-center mb-3">
                          <Button
                            variant="primary"
                            size="sm"
                            icon={lucidLoading ? Loader : RefreshCw}
                            onClick={handleFetchLucidData}
                            disabled={lucidLoading}
                          >
                            {lucidLoading ? 'Fetching...' : droppableShapes.length > 0 ? 'Refresh' : 'Fetch Data'}
                          </Button>
                        </div>

                        {lucidError && (
                          <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                              <p className="text-sm text-red-700 dark:text-red-300">{lucidError}</p>
                            </div>
                          </div>
                        )}

                        {droppableShapes.length > 0 && (
                          <div>
                            <div className="flex justify-between items-center mb-3">
                              <div className="flex gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={handleSelectAll}
                                  disabled={droppableShapes.every(s => isShapeLinked(s.id))}
                                >
                                  Select All
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={handleDeselectAll}
                                  disabled={selectedShapes.size === 0}
                                >
                                  Deselect All
                                </Button>
                              </div>
                              <Button
                                variant="primary"
                                size="sm"
                                icon={batchCreating ? Loader : Plus}
                                onClick={handleCreateWireDropsFromSelected}
                                disabled={selectedShapes.size === 0 || batchCreating}
                              >
                                {batchCreating ? 'Creating...' : `Create ${selectedShapes.size} Drop${selectedShapes.size !== 1 ? 's' : ''}`}
                              </Button>
                            </div>

                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-100 dark:bg-zinc-800">
                                  <tr>
                                    <th className="px-3 py-2 text-left">
                                      <input
                                        type="checkbox"
                                        onChange={(e) => e.target.checked ? handleSelectAll() : handleDeselectAll()}
                                        checked={selectedShapes.size > 0 && selectedShapes.size === droppableShapes.filter(s => !isShapeLinked(s.id)).length}
                                        className="rounded"
                                      />
                                    </th>
                                    <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">Room</th>
                                    <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">Type</th>
                                    <th className="px-3 py-2 text-left text-gray-700 dark:text-gray-300">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                                  {droppableShapes.map((shape) => {
                                    const linked = isShapeLinked(shape.id);
                                    const wireDrop = getLinkedWireDrop(shape.id);
                                    const roomName = extractShapeRoomName(shape);
                                    const dropType = extractShapeDropType(shape);

                                    return (
                                      <tr key={shape.id} className={`hover:bg-gray-50 dark:hover:bg-zinc-800/50 ${linked ? 'opacity-60' : ''}`}>
                                        <td className="px-3 py-2">
                                          <input
                                            type="checkbox"
                                            checked={selectedShapes.has(shape.id)}
                                            onChange={() => handleShapeSelection(shape.id)}
                                            disabled={linked}
                                            className="rounded disabled:opacity-50"
                                          />
                                        </td>
                                        <td className="px-3 py-2 text-gray-900 dark:text-white">{roomName || '—'}</td>
                                        <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{dropType || '—'}</td>
                                        <td className="px-3 py-2">
                                          {linked ? (
                                            <span
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                                              style={{
                                                backgroundColor: 'rgba(148, 175, 50, 0.15)',
                                                color: '#94AF32'
                                              }}
                                            >
                                              <CheckCircle className="w-3 h-3" />
                                              Linked
                                            </span>
                                          ) : (
                                            <span className="text-xs text-gray-500">Available</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 2: Upload Portal CSV */}
                <div>
                  <button
                    onClick={() => toggleSection('procurement')}
                    className="w-full flex items-center justify-between rounded-xl border p-3 transition-all duration-200 hover:shadow-sm"
                    style={sectionStyles.card}
                  >
                    <div className="flex items-center gap-3">
                      <Package className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Upload Portal CSV</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {totalEquipmentPieces > 0 && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                          {totalEquipmentPieces}
                        </span>
                      )}
                      <ChevronRight
                        className="w-4 h-4 text-zinc-500 transition-transform duration-200"
                        style={{ transform: sectionsCollapsed.procurement ? 'none' : 'rotate(90deg)' }}
                      />
                    </div>
                  </button>

                  {!sectionsCollapsed.procurement && (
                    <div className="mt-3 rounded-xl border p-3" style={sectionStyles.card}>
                      <ProjectEquipmentManager
                        projectId={projectId}
                        embedded
                        onEquipmentChange={handleEquipmentChange}
                      />
                    </div>
                  )}
                </div>

                {/* Step 3: Room Alignment */}
                <div>
                  <button
                    onClick={() => toggleSection('roomMatching')}
                    className="w-full flex items-center justify-between rounded-xl border p-3 transition-all duration-200 hover:shadow-sm"
                    style={sectionStyles.card}
                  >
                    <div className="flex items-center gap-3">
                      <FolderOpen className="w-4 h-4 text-zinc-700 dark:text-zinc-300" />
                      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Room Alignment</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {unmatchedRoomEntries.length > 0 && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                          {unmatchedRoomEntries.length} unmatched
                        </span>
                      )}
                      {projectRooms.length > 0 && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                          {projectRooms.length}
                        </span>
                      )}
                      <ChevronRight
                        className="w-4 h-4 text-zinc-500 transition-transform duration-200"
                        style={{ transform: sectionsCollapsed.roomMatching ? 'none' : 'rotate(90deg)' }}
                      />
                    </div>
                  </button>

                  {!sectionsCollapsed.roomMatching && (
                    <div className="mt-3 rounded-xl border p-3" style={sectionStyles.card}>
                      <h3 className="text-sm font-bold text-blue-900 dark:text-blue-100 mb-2">
                        Room Alignment Tool
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Match room names from your Lucid diagram with rooms from the Portal CSV import.
                        This ensures wire drops and equipment are correctly organized by room.
                      </p>

                      {unmatchedRoomEntries.length > 0 ? (
                        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm text-yellow-900 dark:text-yellow-100 font-semibold">
                                Action Required
                              </p>
                              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                {unmatchedRoomEntries.length} room{unmatchedRoomEntries.length !== 1 ? 's' : ''} from Lucid need to be aligned with CSV rooms
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      <div className="space-y-4">
                        {/* Get all unique room names from BOTH wire drops AND Lucid shapes */}
                        {(() => {
                          const roomNameMap = new Map();

                          // First get rooms from existing wire drops (persistent data)
                          existingWireDrops.forEach((drop) => {
                            const roomName = drop.room_name;
                            if (!roomName) return;
                            const normalized = normalizeRoomName(roomName);
                            if (!normalized) return;
                            const entry = roomNameMap.get(normalized) || { normalized, samples: [], sourceCount: { wireDrops: 0, lucid: 0 } };
                            if (!entry.samples.includes(roomName)) {
                              entry.samples.push(roomName);
                            }
                            entry.sourceCount.wireDrops++;
                            roomNameMap.set(normalized, entry);
                          });

                          // Then add rooms from Lucid shapes (if fetched)
                          droppableShapes.forEach((shape) => {
                            const roomName = extractShapeRoomName(shape);
                            if (!roomName) return;
                            const normalized = normalizeRoomName(roomName);
                            if (!normalized) return;
                            const entry = roomNameMap.get(normalized) || { normalized, samples: [], sourceCount: { wireDrops: 0, lucid: 0 } };
                            if (!entry.samples.includes(roomName)) {
                              entry.samples.push(roomName);
                            }
                            entry.sourceCount.lucid++;
                            roomNameMap.set(normalized, entry);
                          });

                          const allRoomEntries = Array.from(roomNameMap.values());

                          if (allRoomEntries.length === 0) {
                            return (
                              <div className="p-4 bg-gray-50 dark:bg-zinc-900/50 rounded-lg text-center">
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  No rooms found yet. Complete steps 1 & 2 to import room data.
                                </p>
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-3">
                              <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                                  All Rooms from Wire Drops ({allRoomEntries.length})
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  CSV Rooms Available: {projectRooms.length}
                                </p>
                              </div>

                              {allRoomEntries.map((entry) => {
                                const resolvedRoom = resolveRoomForName(entry.samples[0]);
                                const isMatched = !!resolvedRoom?.room;
                                const suggestion = suggestRoomMatch(entry.normalized);

                                return (
                                  <div
                                    key={entry.normalized}
                                    className="p-4 rounded-lg border"
                                    style={isMatched ? {
                                      backgroundColor: 'rgba(148, 175, 50, 0.1)',
                                      borderColor: 'rgba(148, 175, 50, 0.3)'
                                    } : {}}
                                  >
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                          {isMatched && (
                                            <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#94AF32' }} />
                                          )}
                                          <div className="flex-1">
                                            <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                              Room: {entry.samples[0]}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                              {entry.sourceCount.wireDrops > 0 && `${entry.sourceCount.wireDrops} wire drop${entry.sourceCount.wireDrops !== 1 ? 's' : ''}`}
                                              {entry.sourceCount.wireDrops > 0 && entry.sourceCount.lucid > 0 && ' • '}
                                              {entry.sourceCount.lucid > 0 && `${entry.sourceCount.lucid} Lucid shape${entry.sourceCount.lucid !== 1 ? 's' : ''}`}
                                            </p>
                                          </div>
                                        </div>

                                        {isMatched && (
                                          <p className="text-xs mb-2" style={{ color: '#94AF32' }}>
                                            ✓ Matched to: {resolvedRoom.room.name}
                                            {resolvedRoom.matchedBy === 'alias' && ' (via alias)'}
                                          </p>
                                        )}

                                        {!isMatched && suggestion && suggestion.score >= 0.5 && (
                                          <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">
                                            💡 Suggestion: {suggestion.room.name} ({Math.round(suggestion.score * 100)}% match)
                                          </p>
                                        )}

                                        <div className="flex gap-2 items-center">
                                          <select
                                            value={
                                              isMatched
                                                ? resolvedRoom.room.id
                                                : roomAssignments[entry.normalized]?.type === 'existing'
                                                  ? roomAssignments[entry.normalized].roomId
                                                  : roomAssignments[entry.normalized]?.type === 'new'
                                                    ? '__new__'
                                                    : ''
                                            }
                                            onChange={(e) =>
                                              handleRoomSelectionChange(entry.normalized, e.target.value, entry)
                                            }
                                            disabled={isMatched && !roomAssignments[entry.normalized]}
                                            className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
                                               bg-white dark:bg-zinc-900 text-gray-900 dark:text-white
                                               disabled:opacity-75"
                                          >
                                            <option value="">-- Select CSV Room or Create New --</option>
                                            <option value="__new__">✨ Create New Room: {entry.samples[0]}</option>
                                            <optgroup label="Existing CSV Rooms">
                                              {projectRooms.map((room) => (
                                                <option key={room.id} value={room.id}>
                                                  {room.name} {room.is_headend ? '(Head-End)' : ''}
                                                </option>
                                              ))}
                                            </optgroup>
                                          </select>

                                          {!isMatched && roomAssignments[entry.normalized] && (
                                            <Button
                                              variant="primary"
                                              size="sm"
                                              onClick={() => handleRoomAliasApply(entry)}
                                              disabled={roomAliasSaving === entry.normalized}
                                              loading={roomAliasSaving === entry.normalized}
                                            >
                                              {roomAliasSaving === entry.normalized ? 'Saving...' : 'Apply'}
                                            </Button>
                                          )}

                                          {isMatched && (
                                            <Button
                                              variant="secondary"
                                              size="sm"
                                              onClick={() => {
                                                // Allow editing of already matched rooms
                                                setRoomAssignments(prev => ({
                                                  ...prev,
                                                  [entry.normalized]: { type: 'existing', roomId: resolvedRoom.room.id }
                                                }));
                                              }}
                                            >
                                              Edit
                                            </Button>
                                          )}
                                        </div>

                                        {/* New Room Configuration */}
                                        {roomAssignments[entry.normalized]?.type === 'new' && (
                                          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-700 space-y-2">
                                            <input
                                              type="text"
                                              value={roomAssignments[entry.normalized]?.name || ''}
                                              onChange={(e) =>
                                                handleNewRoomNameChange(entry.normalized, e.target.value)
                                              }
                                              placeholder="Enter room name"
                                              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded
                                                 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white"
                                            />
                                            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                              <input
                                                type="checkbox"
                                                checked={roomAssignments[entry.normalized]?.isHeadend || false}
                                                onChange={(e) =>
                                                  handleNewRoomHeadendToggle(entry.normalized, e.target.checked)
                                                }
                                                className="rounded"
                                              />
                                              Mark as Head-End Room
                                            </label>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}


                        {/* Unmatched Rooms Section */}
                        {unmatchedRoomEntries.length > 0 && (
                          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                            <h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-200 mb-2 flex items-center gap-2">
                              <AlertCircle className="w-4 h-4" />
                              Unmatched Rooms from Lucid ({unmatchedRoomEntries.length})
                            </h3>
                            <p className="text-xs text-yellow-700 dark:text-yellow-300 mb-4">
                              These room names from Lucid don't match any existing project rooms. Assign them to create proper links.
                            </p>

                            <div className="space-y-3">
                              {unmatchedRoomEntries.map((entry) => (
                                <div
                                  key={entry.normalized}
                                  className="p-3 bg-white dark:bg-zinc-800 rounded border border-yellow-300 dark:border-yellow-700"
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                                        From Lucid: <span className="font-mono">{entry.samples.join(', ')}</span>
                                      </p>

                                      {entry.suggestion && entry.suggestion.score >= 0.72 && (
                                        <p className="text-xs mb-2" style={{ color: '#94AF32' }}>
                                          Suggested match: {entry.suggestion.room.name} (
                                          {Math.round(entry.suggestion.score * 100)}% similar)
                                        </p>
                                      )}

                                      <div className="flex gap-2 items-end">
                                        <div className="flex-1">
                                          <select
                                            value={
                                              roomAssignments[entry.normalized]?.type === 'existing'
                                                ? roomAssignments[entry.normalized].roomId
                                                : roomAssignments[entry.normalized]?.type === 'new'
                                                  ? '__new__'
                                                  : ''
                                            }
                                            onChange={(e) =>
                                              handleRoomSelectionChange(entry.normalized, e.target.value, entry)
                                            }
                                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded
                                               bg-white dark:bg-zinc-900 text-gray-900 dark:text-white"
                                          >
                                            <option value="">-- Select Action --</option>
                                            <option value="__new__">Create New Room</option>
                                            <optgroup label="Existing Rooms">
                                              {allRoomOptions.map((opt) => (
                                                <option key={opt.value} value={opt.value}>
                                                  {opt.label} {opt.isHeadEnd ? '(Head-End)' : ''}
                                                </option>
                                              ))}
                                            </optgroup>
                                          </select>
                                        </div>

                                        <Button
                                          variant="primary"
                                          size="sm"
                                          onClick={() => handleRoomAliasApply(entry)}
                                          disabled={
                                            !roomAssignments[entry.normalized] ||
                                            roomAliasSaving === entry.normalized
                                          }
                                          loading={roomAliasSaving === entry.normalized}
                                        >
                                          {roomAliasSaving === entry.normalized ? 'Saving...' : 'Apply'}
                                        </Button>
                                      </div>

                                      {/* New Room Name Input */}
                                      {roomAssignments[entry.normalized]?.type === 'new' && (
                                        <div className="mt-2 space-y-2">
                                          <input
                                            type="text"
                                            value={roomAssignments[entry.normalized]?.name || ''}
                                            onChange={(e) =>
                                              handleNewRoomNameChange(entry.normalized, e.target.value)
                                            }
                                            placeholder="Enter room name"
                                            className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded
                                               bg-white dark:bg-zinc-900 text-gray-900 dark:text-white"
                                          />
                                          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                            <input
                                              type="checkbox"
                                              checked={roomAssignments[entry.normalized]?.isHeadend || false}
                                              onChange={(e) =>
                                                handleNewRoomHeadendToggle(entry.normalized, e.target.checked)
                                              }
                                              className="rounded"
                                            />
                                            Mark as Head-End Room
                                          </label>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Matched Rooms Info */}
                        {droppableShapes.length > 0 && unmatchedRoomEntries.length === 0 && (
                          <div
                            className="p-4 rounded-lg"
                            style={{
                              backgroundColor: 'rgba(148, 175, 50, 0.1)',
                              border: '1px solid rgba(148, 175, 50, 0.3)'
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-5 h-5" style={{ color: '#94AF32' }} />
                              <div>
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  All Lucid rooms are matched!
                                </p>
                                <p className="text-xs" style={{ color: '#94AF32' }}>
                                  All room names from Lucid wire drops have been successfully matched to project rooms.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Show instructions when no data available */}
                        {droppableShapes.length === 0 && projectRooms.length === 0 && (
                          <div className="p-4 bg-blue-50 dark:bg-blue-800/30 rounded-lg text-center border border-blue-200 dark:border-blue-700">
                            <FolderOpen className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                            <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                              No Room Data Available Yet
                            </p>
                            <p className="text-sm text-blue-700 dark:text-blue-300">
                              Complete Steps 1 & 2 above to import room data, then return here to align room names.
                            </p>
                          </div>
                        )}

                        {/* Summary of aligned rooms */}
                        {droppableShapes.length > 0 && projectRooms.length > 0 && (
                          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-3">
                              Summary
                            </h3>
                            <div className="grid grid-cols-2 gap-4 text-center mb-3">
                              <div>
                                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{projectRooms.length}</p>
                                <p className="text-xs text-blue-700 dark:text-blue-300">Portal CSV Rooms</p>
                              </div>
                              <div>
                                <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                                  {new Set(droppableShapes.map(s => extractShapeRoomName(s)).filter(Boolean)).size}
                                </p>
                                <p className="text-xs text-purple-700 dark:text-purple-300">Lucid Rooms</p>
                              </div>
                            </div>
                            {unmatchedRoomEntries.length === 0 && droppableShapes.length > 0 && (
                              <div
                                className="flex items-center justify-center gap-2 p-2 rounded"
                                style={{ backgroundColor: 'rgba(148, 175, 50, 0.15)' }}
                              >
                                <CheckCircle className="w-4 h-4" style={{ color: '#94AF32' }} />
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  All rooms successfully aligned
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        )}

        {/* Project Overview - Only visible in edit mode */}
        {editMode && (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-4">
              {/* Project Info - Consolidated Section */}
              <div>
                <button
                  onClick={() => toggleSection('projectInfo')}
                  className="w-full flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md"
                  style={sectionStyles.card}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">Project Info</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {editMode && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400">
                        Editing
                      </span>
                    )}
                    <ChevronRight
                      className="w-5 h-5 text-zinc-500 transition-transform duration-200"
                      style={{ transform: sectionsCollapsed.projectInfo ? 'none' : 'rotate(90deg)' }}
                    />
                  </div>
                </button>

                {!sectionsCollapsed.projectInfo && (
                  <div className="mt-4 rounded-2xl border p-4" style={sectionStyles.card}>
                    <div className="space-y-6">
                      {/* Project Basics Section */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          Basic Information
                        </h3>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Project Name
                          </label>
                          <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleInputChange}
                            disabled={!editMode}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                             bg-white dark:bg-zinc-800 text-gray-900 dark:text-white
                             disabled:bg-gray-100 dark:disabled:bg-zinc-900 disabled:cursor-not-allowed"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Client
                          </label>
                          <div className="relative">
                            {!editMode ? (
                              <div className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg 
                                   bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white">
                                {formData.client || <span className="text-gray-400 dark:text-gray-500">No client selected</span>}
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    name="client"
                                    value={formData.client}
                                    onChange={handleInputChange}
                                    placeholder="Enter client name or company"
                                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                     bg-white dark:bg-zinc-800 text-gray-900 dark:text-white
                                     focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowClientPicker(!showClientPicker)}
                                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                     bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-400
                                     hover:border-violet-500 dark:hover:border-violet-400 hover:text-violet-600 
                                     dark:hover:text-violet-400 transition-colors"
                                    title="Select from contacts"
                                  >
                                    <Users className="w-4 h-4" />
                                  </button>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  Type directly or click <Users className="w-3 h-3 inline" /> to select from contacts
                                </p>

                                {showClientPicker && (
                                  <div className="absolute z-50 mt-1 w-full bg-white dark:bg-zinc-900 border border-gray-300 
                                        dark:border-gray-600 rounded-lg shadow-xl max-h-96 overflow-hidden">
                                    <div className="p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-zinc-800">
                                      <input
                                        type="text"
                                        value={clientSearchTerm}
                                        onChange={(e) => setClientSearchTerm(e.target.value)}
                                        placeholder="Search contacts..."
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded 
                                         bg-white dark:bg-zinc-800 text-gray-900 dark:text-white
                                         placeholder-gray-500 dark:placeholder-gray-400
                                         focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                        autoFocus
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    </div>

                                    <div className="max-h-60 overflow-y-auto">
                                      {filteredContacts.length === 0 ? (
                                        <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                                          {clientSearchTerm ? 'No contacts found' : 'No contacts available'}
                                        </div>
                                      ) : (
                                        filteredContacts.map((contact) => {
                                          const displayName =
                                            contact.name || contact.company || 'Unnamed Contact';

                                          return (
                                            <div
                                              key={contact.id}
                                              className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-zinc-800 cursor-pointer 
                                               border-b border-gray-100 dark:border-gray-700 last:border-0
                                               transition-colors"
                                              onClick={() => handleClientSelect(contact)}
                                            >
                                              <div className="font-medium text-gray-900 dark:text-white">
                                                {displayName}
                                              </div>
                                              {contact.company && contact.name && (
                                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                                  {contact.company}
                                                </div>
                                              )}
                                              {contact.email && (
                                                <div className="text-sm text-gray-500 dark:text-gray-500">
                                                  {contact.email} {contact.phone && `• ${contact.phone}`}
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })
                                      )}
                                    </div>

                                    <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setShowNewContactForm(true);
                                          setShowClientPicker(false);
                                        }}
                                        className="w-full px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded 
                                         flex items-center justify-center gap-2"
                                      >
                                        <Plus className="w-4 h-4" />
                                        Add New Contact
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Phase
                              {editMode && (
                                <button
                                  onClick={() => setShowPhaseModal(true)}
                                  className="ml-2 text-violet-600 hover:text-violet-700"
                                >
                                  <Plus className="w-4 h-4 inline" />
                                </button>
                              )}
                            </label>
                            <select
                              name="phase"
                              value={formData.phase}
                              onChange={handleInputChange}
                              disabled={!editMode}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                               bg-white dark:bg-zinc-800 text-gray-900 dark:text-white
                               disabled:bg-gray-100 dark:disabled:bg-zinc-900 disabled:cursor-not-allowed"
                            >
                              <option value="">Select Phase</option>
                              {phases.map((phase) => (
                                <option key={phase.id} value={phase.name}>
                                  {phase.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Status
                              {editMode && (
                                <button
                                  onClick={() => setShowStatusModal(true)}
                                  className="ml-2 text-violet-600 hover:text-violet-700"
                                >
                                  <Plus className="w-4 h-4 inline" />
                                </button>
                              )}
                            </label>
                            <select
                              name="status"
                              value={formData.status}
                              onChange={handleInputChange}
                              disabled={!editMode}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                               bg-white dark:bg-zinc-800 text-gray-900 dark:text-white
                               disabled:bg-gray-100 dark:disabled:bg-zinc-900 disabled:cursor-not-allowed"
                            >
                              {statuses.length === 0 ? (
                                <>
                                  <option value="active">Active</option>
                                  <option value="on_hold">On Hold</option>
                                  <option value="completed">Completed</option>
                                  <option value="cancelled">Cancelled</option>
                                </>
                              ) : (
                                statuses.map((status) => (
                                  <option key={status.id} value={status.name}>
                                    {status.name}
                                  </option>
                                ))
                              )}
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Schedule & Notes Section */}
                      <div className="space-y-4 pt-6 border-t border-gray-200 dark:border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          Schedule & Notes
                        </h3>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Project Number
                            </label>
                            <input
                              type="text"
                              name="project_number"
                              value={formData.project_number}
                              onChange={handleInputChange}
                              disabled={!editMode}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white
                                 disabled:bg-gray-100 dark:disabled:bg-zinc-900 disabled:cursor-not-allowed
                                 [&::-webkit-calendar-picker-indicator]:dark:invert"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Start Date
                            </label>
                            <input
                              type="date"
                              name="start_date"
                              value={formData.start_date}
                              onChange={handleInputChange}
                              disabled={!editMode}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white
                                 disabled:bg-gray-100 dark:disabled:bg-zinc-900 disabled:cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              End Date
                            </label>
                            <input
                              type="date"
                              name="end_date"
                              value={formData.end_date}
                              onChange={handleInputChange}
                              disabled={!editMode}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white
                                 disabled:bg-gray-100 dark:disabled:bg-zinc-900 disabled:cursor-not-allowed"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Address
                            </label>
                            <input
                              type="text"
                              name="address"
                              value={formData.address}
                              onChange={handleInputChange}
                              disabled={!editMode}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white
                                 disabled:bg-gray-100 dark:disabled:bg-zinc-900 disabled:cursor-not-allowed"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              Description
                            </label>
                            <textarea
                              name="description"
                              value={formData.description}
                              onChange={handleInputChange}
                              disabled={!editMode}
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white
                                 disabled:bg-gray-100 dark:disabled:bg-zinc-900 disabled:cursor-not-allowed"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Client Contact Section */}
                      <div className="space-y-3 pt-6 border-t border-gray-200 dark:border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          Client Contact
                        </h3>
                        <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
                          {formData.client ? (
                            <>
                              <p className="text-base font-semibold text-gray-900 dark:text-white">
                                {formData.client}
                              </p>
                              {currentClientContact ? (
                                <div className="space-y-1 text-xs">
                                  {currentClientContact.company && (
                                    <p className="text-gray-500 dark:text-gray-400">
                                      Company: {currentClientContact.company}
                                    </p>
                                  )}
                                  {currentClientContact.email && (
                                    <p className="text-gray-500 dark:text-gray-400">
                                      Email: {currentClientContact.email}
                                    </p>
                                  )}
                                  {currentClientContact.phone && (
                                    <p className="text-gray-500 dark:text-gray-400">
                                      Phone: {currentClientContact.phone}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  No matching contact details found in your directory.
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Client not set. Switch to edit mode to assign a primary contact.
                            </p>
                          )}
                          {editMode && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Use the client picker above to search, link, or create a new contact.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {/* Linked Resources - Collapsible */}
              <div>
                <button
                  onClick={() => toggleSection('linkedResources')}
                  className="w-full flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md"
                  style={sectionStyles.card}
                >
                  <div className="flex items-center gap-3">
                    <Link className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">Linked Resources</span>
                  </div>
                  <ChevronRight
                    className="w-5 h-5 text-zinc-500 transition-transform duration-200"
                    style={{ transform: sectionsCollapsed.linkedResources ? 'none' : 'rotate(90deg)' }}
                  />
                </button>

                {!sectionsCollapsed.linkedResources && (
                  <div className="mt-4 rounded-2xl border p-4" style={sectionStyles.card}>
                    <div className="space-y-4">
                      {editMode ? (
                        <div className="space-y-4">
                          {resourceEntries.map(({ key, label, icon: Icon, placeholder, helper, value }) => (
                            <div key={key}>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                <Icon className="w-4 h-4 inline mr-1" />
                                {label}
                              </label>
                              <input
                                type="url"
                                name={key}
                                value={value || ''}
                                onChange={handleInputChange}
                                placeholder={placeholder}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                   bg-white dark:bg-zinc-800 text-gray-900 dark:text-white
                                   focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                              />
                              {helper && (
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{helper}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {resourceEntries.map(({ key, label, icon: Icon, value }) => (
                            <div
                              key={key}
                              className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-800"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                                  <Icon className="w-4 h-4 text-violet-500" />
                                  {label}
                                </div>
                                {value ? (
                                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 break-all">
                                    {value}
                                  </p>
                                ) : (
                                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Not set</p>
                                )}
                              </div>
                              {value && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  icon={ExternalLink}
                                  onClick={() => window.open(value, '_blank', 'noopener,noreferrer')}
                                >
                                  Open
                                </Button>
                              )}
                            </div>
                          ))}
                          {resourceEntries.every(({ value }) => !value) && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              No URLs configured yet. Switch to edit mode to add links.
                            </p>
                          )}
                        </div>
                      )}

                      {/* UniFi Network Configuration Section */}
                      <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          UniFi Network Configuration
                        </h3>

                        {editMode ? (
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Controller Local IP Address
                              </label>
                              <input
                                type="text"
                                name="unifi_controller_ip"
                                value={formData.unifi_controller_ip}
                                onChange={handleInputChange}
                                placeholder="192.168.1.1"
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                                   bg-white dark:bg-zinc-800 text-gray-900 dark:text-white
                                   focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                              />
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Local IP of your UDM Pro (only works on the same network)
                              </p>
                            </div>

                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Network API Key
                              </label>
                              <div className="relative">
                                <input
                                  type={showUnifiApiKey ? "text" : "password"}
                                  name="unifi_network_api_key"
                                  value={formData.unifi_network_api_key}
                                  onChange={handleInputChange}
                                  placeholder="Enter Network API Key"
                                  className="w-full px-3 py-2 pr-20 border border-gray-300 dark:border-gray-600 rounded-lg
                                     bg-white dark:bg-zinc-800 text-gray-900 dark:text-white
                                     focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowUnifiApiKey(!showUnifiApiKey)}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-medium
                                     text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300"
                                >
                                  {showUnifiApiKey ? 'Hide' : 'Show'}
                                </button>
                              </div>
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Generate from: Network Application → Settings → System → Integrations
                              </p>
                            </div>

                            <div>
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={RefreshCw}
                                onClick={async () => {
                                  const result = await fetchUnifiSiteData();
                                  if (result) {
                                    alert(`Connected successfully!\nSite: ${result.siteName}\nID: ${result.siteId}`);
                                  } else {
                                    alert('Failed to connect. Check your UniFi Network URL in the field above.');
                                  }
                                }}
                                disabled={!formData.unifi_url}
                              >
                                Test Connection & Fetch Site Data
                              </Button>
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Click to fetch site info from Cloud API and auto-populate Site ID below
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Site ID
                                </label>
                                <input
                                  type="text"
                                  name="unifi_site_id"
                                  value={formData.unifi_site_id}
                                  onChange={handleInputChange}
                                  placeholder="Auto-fetched from API"
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                                     bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white"
                                  readOnly
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  Automatically populated from controller
                                </p>
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Site Name
                                </label>
                                <input
                                  type="text"
                                  name="unifi_site_name"
                                  value={formData.unifi_site_name}
                                  onChange={handleInputChange}
                                  placeholder="Auto-fetched from API"
                                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
                                     bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white"
                                  readOnly
                                />
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  Automatically populated from controller
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-800">
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  Controller IP
                                </div>
                                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                                  {formData.unifi_controller_ip || 'Not configured'}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-800">
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  Network API Key
                                </div>
                                <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                                  {formData.unifi_network_api_key ? '••••••••••••••••' : 'Not configured'}
                                </p>
                              </div>
                            </div>

                            {formData.unifi_site_id && (
                              <div className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-800">
                                <div className="flex-1">
                                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                                    Site: {formData.unifi_site_name || 'Unknown'}
                                  </div>
                                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 font-mono">
                                    {formData.unifi_site_id}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Issues Section */}
      <div>
        <button
          onClick={() => toggleSection('issues')}
          className="w-full flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md"
          style={sectionStyles.card}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
            <span className="font-medium text-zinc-900 dark:text-zinc-100">Issues</span>
          </div>
          <div className="flex items-center gap-3">
            {issues.filter(i => i.status !== 'resolved').length > 0 && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
                {issues.filter(i => i.status !== 'resolved').length}
              </span>
            )}
            <ChevronRight
              className="w-5 h-5 text-zinc-500 transition-transform duration-200"
              style={{ transform: sectionsCollapsed.issues ? 'none' : 'rotate(90deg)' }}
            />
          </div>
        </button>
        {!sectionsCollapsed.issues && (
          <div className="mt-4 rounded-2xl border p-4" style={sectionStyles.card}>
            <div className="flex items-center justify-between text-xs mb-4">
              <div className="text-zinc-500 dark:text-zinc-400">
                {showResolvedIssues ? 'Showing resolved' : 'Hiding resolved'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowResolvedIssues((prev) => !prev)}
                  className="text-xs underline text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  {showResolvedIssues ? 'Hide resolved' : 'Show resolved'}
                </button>
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => navigate(`/project/${projectId}/issues/new`)}>
                  New Issue
                </Button>
              </div>
            </div>
            {issues.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No issues logged for this project.</p>
            ) : (
              <div className="space-y-3">
                {issues
                  .filter((issue) => showResolvedIssues || (issue.status || '').toLowerCase() !== 'resolved')
                  .map((issue) => (
                    <button
                      key={issue.id}
                      onClick={() => navigate(`/project/${projectId}/issues/${issue.id}`)}
                      className="w-full text-left px-3 py-3 rounded-xl border transition-transform duration-200 hover:-translate-y-0.5 bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-zinc-900 dark:text-white">{issue.title}</h4>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${issue.status === 'resolved'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : issue.status === 'blocked'
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                            : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                          }`}>
                          {(issue.status || 'open').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </span>
                      </div>
                      <p className="text-xs mt-1 text-zinc-500 dark:text-zinc-400">
                        {new Date(issue.created_at).toLocaleDateString()}
                      </p>
                      {issue.description && (
                        <p className="text-sm mt-1 line-clamp-2 text-zinc-600 dark:text-zinc-300">
                          {issue.description}
                        </p>
                      )}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Window Coverings Section */}
      {projectShades.length > 0 && (
        <div>
          <button
            onClick={() => toggleSection('windowCoverings')}
            className="w-full flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md"
            style={sectionStyles.card}
          >
            <div className="flex items-center gap-3">
              <AlignJustify className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
              <span className="font-medium text-zinc-900 dark:text-zinc-100">Window Coverings</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-2 py-0.5 text-xs rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                {projectShades.length} shades
              </span>
              <span className="px-2 py-0.5 text-xs rounded-full" style={{ backgroundColor: 'rgba(148, 175, 50, 0.15)', color: '#94AF32' }}>
                {projectShades.filter(s => s.m1_complete && s.m2_complete).length} verified
              </span>
              <ChevronRight
                className="w-5 h-5 text-zinc-500 transition-transform duration-200"
                style={{ transform: sectionsCollapsed.windowCoverings ? 'none' : 'rotate(90deg)' }}
              />
            </div>
          </button>
          {!sectionsCollapsed.windowCoverings && (
            <div className="mt-4">
              <ShadeManager isPMView={true} embeddedProjectId={projectId} />
            </div>
          )}
        </div>
      )}

      {/* Reports Section - Links to dedicated page */}
      <div>
        <button
          onClick={() => navigate(`/projects/${projectId}/reports`)}
          className="w-full flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md"
          style={sectionStyles.card}
        >
          <div className="flex items-center gap-3">
            <FileBarChart2 className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
            <span className="font-medium text-zinc-900 dark:text-zinc-100">Reports</span>
          </div>
          <ChevronRight className="w-5 h-5 text-zinc-500" />
        </button>
      </div>

      {/* Phase Milestones */}
      <div>
        <button
          onClick={() => toggleSection('phaseMilestones')}
          className="w-full flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md"
          style={sectionStyles.card}
        >
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
            <span className="font-medium text-zinc-900 dark:text-zinc-100">Phase Milestones</span>
          </div>
          <ChevronRight
            className="w-5 h-5 text-zinc-500 transition-transform duration-200"
            style={{ transform: sectionsCollapsed.phaseMilestones ? 'none' : 'rotate(90deg)' }}
          />
        </button>
        {!sectionsCollapsed.phaseMilestones && (
          <div className="mt-4 rounded-2xl border p-4" style={sectionStyles.card}>
            <div className="flex items-center justify-end mb-4">
              <button
                onClick={() => setPhaseMilestonesEditMode(!phaseMilestonesEditMode)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-md transition-colors"
              >
                {phaseMilestonesEditMode ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Done Editing
                  </>
                ) : (
                  <>
                    <Edit className="w-4 h-4" />
                    Edit Dates
                  </>
                )}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-700">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Phase</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Target Date</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Actual Date</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">Completed By</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { type: 'planning_design', label: 'Planning & Design', color: '#8b5cf6' },
                    { type: 'prewire_prep', label: 'Prewire Prep', color: '#06b6d4' },
                    { type: 'prewire', label: 'Prewire', color: '#8b5cf6' },
                    { type: 'rough_in_inspection', label: 'Rough-In Inspection', color: '#ec4899' },
                    { type: 'trim_prep', label: 'Trim Prep', color: '#f59e0b' },
                    { type: 'trim', label: 'Trim', color: '#f59e0b' },
                    { type: 'final_inspection', label: 'Final Inspection', color: '#ec4899' },
                    { type: 'commissioning', label: 'Commissioning', color: '#3b82f6' },
                    { type: 'handoff_training', label: 'Handoff / Training', color: '#94AF32' }
                  ].map(({ type, label, color }) => {
                    const milestone = milestoneDates.find(m => m.milestone_type === type);
                    return (
                      <tr key={type} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                            <span className="text-sm text-zinc-900 dark:text-white">{label}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {phaseMilestonesEditMode ? (
                            <DateInput
                              value={milestone?.target_date || ''}
                              onChange={(e) => handleMilestoneUpdate(type, 'target_date', e.target.value || null)}
                              className="text-sm"
                            />
                          ) : (
                            <DateField
                              date={milestone?.target_date}
                              isCompleted={!!milestone?.actual_date}
                              showIcon={false}
                              showBadge={!milestone?.actual_date}
                              showDescription={false}
                              variant="inline"
                            />
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {phaseMilestonesEditMode ? (
                            <DateInput
                              value={milestone?.actual_date || ''}
                              onChange={(e) => handleMilestoneUpdate(type, 'actual_date', e.target.value || null)}
                              className="text-sm"
                            />
                          ) : (
                            <DateField
                              date={milestone?.actual_date}
                              isCompleted={!!milestone?.completed_manually}
                              showIcon={false}
                              showBadge={false}
                              showDescription={false}
                              variant="inline"
                            />
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {phaseMilestonesEditMode ? (
                            <select
                              value={milestone?.completed_manually ? 'completed' : 'not_set'}
                              onChange={(e) => handleMilestoneUpdate(type, 'completed_manually', e.target.value === 'completed')}
                              className="w-full rounded-md border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-700 px-3 py-1.5 text-sm text-zinc-900 dark:text-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                            >
                              <option value="not_set">Not set</option>
                              <option value="completed">Completed</option>
                            </select>
                          ) : milestone?.completed_manually ? (
                            <span className="text-sm" style={{ color: '#94AF32' }}>Completed</span>
                          ) : (
                            <span className="text-sm text-zinc-400 dark:text-zinc-500">Not set</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-xs text-zinc-600 dark:text-zinc-400">
                            {milestone?.completed_manually && milestone?.updated_by_user
                              ? formatMilestoneUserInfo(milestone.updated_by_user, milestone.updated_at)
                              : '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Project Progress - Unified Gauge System */}
      <div style={sectionStyles.card} className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-6">
          <Target className="w-5 h-5" />
          Project Progress
        </h2>

        <MilestoneGaugesDisplay
          milestonePercentages={milestonePercentages}
          projectOwners={projectOwners}
          startCollapsed={false}
          milestoneDates={milestoneDates}
          editMode={editMode}
          onMilestoneUpdate={handleMilestoneUpdate}
        />
      </div>

      {/* Time Tracking Section - Collapsible */}
      <div>
        <button
          onClick={() => toggleSection('timeTracking')}
          className="w-full flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md"
          style={sectionStyles.card}
        >
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
            <span className="font-medium text-zinc-900 dark:text-zinc-100">Time Tracking</span>
          </div>
          <ChevronRight
            className="w-5 h-5 text-zinc-500 transition-transform duration-200"
            style={{ transform: sectionsCollapsed.timeTracking ? 'none' : 'rotate(90deg)' }}
          />
        </button>

        {!sectionsCollapsed.timeTracking && (
          <div className="mt-4 rounded-2xl border p-4" style={sectionStyles.card}>
            <div className="flex flex-wrap items-end gap-6 mb-4">
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Labor Budget
                </p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {formatDuration(totalLaborMinutes)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Logged
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {formatDuration(loggedMinutes)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {remainingMinutesRaw < 0 ? 'Over Budget' : 'Remaining'}
                </p>
                <p
                  className="text-sm font-semibold"
                  style={{ color: remainingMinutesRaw < 0 ? '#EF4444' : '#94AF32' }}
                >
                  {remainingMinutesRaw < 0
                    ? `-${formatDuration(overrunMinutes)}`
                    : formatDuration(remainingMinutes)}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={Clock}
                onClick={() => {
                  loadTimeData();
                  loadProgress();
                  loadLaborSummary();
                }}
              >
                Refresh
              </Button>
            </div>

            <div className="mb-6">
              <button
                type="button"
                onClick={() => setLaborBudgetCollapsed((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-zinc-800 dark:hover:bg-gray-700"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">Labor Budget</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {laborSummary.entries.length > 0
                      ? `${laborSummary.entries.length} labor entries • ${formatDuration(totalLaborMinutes)} allocated`
                      : 'No labor budget imported yet'}
                  </p>
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-gray-500 transition-transform ${laborBudgetCollapsed ? '' : 'rotate-180'
                    }`}
                />
              </button>

              {!laborBudgetCollapsed && (
                <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-zinc-800">
                  {laborSummary.entries.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      No labor entries imported from the portal CSV yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-zinc-900/50">
                          <tr>
                            <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Labor Type</th>
                            <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Room</th>
                            <th className="px-4 py-2 text-right text-gray-700 dark:text-gray-300">Hours</th>
                            <th className="px-4 py-2 text-right text-gray-700 dark:text-gray-300">Hourly Rate</th>
                            <th className="px-4 py-2 text-right text-gray-700 dark:text-gray-300">Planned Cost</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                          {laborSummary.entries.map((entry) => {
                            const plannedCost = entry.hours * entry.hourlyRate;
                            return (
                              <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                                <td className="px-4 py-2 text-gray-900 dark:text-white">{entry.laborType}</td>
                                <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{entry.roomName}</td>
                                <td className="px-4 py-2 text-right text-gray-900 dark:text-white">
                                  {entry.hours.toFixed(2)}h
                                </td>
                                <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">
                                  {entry.hourlyRate ? `$${entry.hourlyRate.toFixed(2)}` : '—'}
                                </td>
                                <td className="px-4 py-2 text-right text-gray-600 dark:text-gray-300">
                                  {entry.hourlyRate ? `$${plannedCost.toFixed(2)}` : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-gray-50 dark:bg-zinc-900/50">
                          <tr>
                            <td className="px-4 py-2 font-semibold text-gray-900 dark:text-white">Total</td>
                            <td className="px-4 py-2" />
                            <td className="px-4 py-2 text-right font-semibold text-gray-900 dark:text-white">
                              {laborSummary.totalHours.toFixed(2)}h
                            </td>
                            <td className="px-4 py-2" />
                            <td className="px-4 py-2" />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Currently Checked In Users */}
            {timeData.activeUsers.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Currently Checked In ({timeData.activeUsers.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {timeData.activeUsers.map((user) => (
                    <div
                      key={user.user_email}
                      className="flex items-center justify-between p-3 rounded-lg"
                      style={{
                        backgroundColor: 'rgba(148, 175, 50, 0.1)',
                        border: '1px solid rgba(148, 175, 50, 0.3)'
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" style={{ color: '#94AF32' }} />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {user.user_name || user.user_email}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Checked in {formatLastActivity(user.active_session_start)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* All Users Time Summary */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Time Summary by User
              </h3>
              {timeData.summary.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No time logged for this project yet
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-zinc-900/50">
                      <tr>
                        <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">User</th>
                        <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Sessions</th>
                        <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Total Time</th>
                        <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Last Activity</th>
                        <th className="px-4 py-2 text-center text-gray-700 dark:text-gray-300">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {timeData.summary.map((user) => (
                        <tr key={user.user_email} className="hover:bg-gray-50 dark:hover:bg-zinc-800/50">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                {user.user_name || 'Unknown'}
                              </p>
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                {user.user_email}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-900 dark:text-white">
                            {user.total_sessions}
                          </td>
                          <td className="px-4 py-3 text-gray-900 dark:text-white">
                            <span className="font-semibold">{user.total_hours}h</span>
                            <span className="text-xs text-gray-500 ml-1">
                              ({formatDuration(user.total_minutes)})
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                            {formatLastActivity(user.last_activity || user.last_check_out)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {user.has_active_session ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-full"
                                style={{
                                  backgroundColor: 'rgba(148, 175, 50, 0.15)',
                                  color: '#94AF32'
                                }}
                              >
                                <CheckCircle className="w-3 h-3" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full 
                                           bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                                <XCircle className="w-3 h-3" />
                                Inactive
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Building Permits Section */}
      <div>
        <button
          onClick={() => toggleSection('buildingPermits')}
          className="w-full flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md"
          style={sectionStyles.card}
        >
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-zinc-900 dark:text-zinc-100" />
            <span className="font-medium text-zinc-900 dark:text-zinc-100">Building Permits</span>
          </div>
          <ChevronRight
            className="w-5 h-5 text-zinc-500 transition-transform duration-200"
            style={{ transform: sectionsCollapsed.buildingPermits ? 'none' : 'rotate(90deg)' }}
          />
        </button>
        {!sectionsCollapsed.buildingPermits && (
          <div className="mt-4 rounded-2xl border p-4" style={sectionStyles.card}>
            <ProjectPermits
              projectId={projectId}
              onMilestoneChange={loadMilestoneDates}
            />
          </div>
        )}
      </div>

      {/* Lucid Chart Carousel - Show when there's a wiring diagram URL */}
      {formData.wiring_diagram_url && (
        <LucidChartCarousel
          documentUrl={formData.wiring_diagram_url}
          projectName={project?.name || 'Project'}
        />
      )}

      {/* Add Phase Modal */}
      {showPhaseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div style={sectionStyles.card} className="p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Add New Phase</h3>
            <input
              type="text"
              placeholder="Phase name"
              value={newPhase.name}
              onChange={(e) => setNewPhase({ ...newPhase, name: e.target.value })}
              className="w-full px-3 py-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newPhase.description}
              onChange={(e) => setNewPhase({ ...newPhase, description: e.target.value })}
              className="w-full px-3 py-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg"
            />
            <input
              type="color"
              value={newPhase.color}
              onChange={(e) => setNewPhase({ ...newPhase, color: e.target.value })}
              className="w-full h-10 mb-3"
            />
            <div className="flex gap-2">
              <Button onClick={handleAddPhase} variant="primary">Add</Button>
              <Button onClick={() => setShowPhaseModal(false)} variant="secondary">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div style={sectionStyles.card} className="p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Add New Status</h3>
            <input
              type="text"
              placeholder="Status name"
              value={newStatus.name}
              onChange={(e) => setNewStatus({ ...newStatus, name: e.target.value })}
              className="w-full px-3 py-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newStatus.description}
              onChange={(e) => setNewStatus({ ...newStatus, description: e.target.value })}
              className="w-full px-3 py-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg"
            />
            <input
              type="color"
              value={newStatus.color}
              onChange={(e) => setNewStatus({ ...newStatus, color: e.target.value })}
              className="w-full h-10 mb-3"
            />
            <div className="flex gap-2">
              <Button onClick={handleAddStatus} variant="primary">Add</Button>
              <Button onClick={() => setShowStatusModal(false)} variant="secondary">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Phase Order Modal */}
      {showPhaseOrderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div style={sectionStyles.card} className="p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Reorder Phases</h3>
            <div className="space-y-2">
              {phases.map((phase, index) => (
                <div
                  key={phase.id}
                  className="flex items-center justify-between p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-zinc-900/50"
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-gray-400" />
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: phase.color }}
                    />
                    <span className="font-medium text-gray-900 dark:text-white">
                      {phase.name}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handlePhaseReorder(phase.id, 'up')}
                      disabled={index === 0}
                      className={`p-1 rounded ${index === 0
                        ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                        : 'text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400'
                        }`}
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handlePhaseReorder(phase.id, 'down')}
                      disabled={index === phases.length - 1}
                      className={`p-1 rounded ${index === phases.length - 1
                        ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                        : 'text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400'
                        }`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <Button onClick={() => setShowPhaseOrderModal(false)} variant="primary">
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* New Contact Form Modal */}
      {showNewContactForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div style={sectionStyles.card} className="p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Add New Contact
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={newContactData.name}
                  onChange={(e) => setNewContactData({ ...newContactData, name: e.target.value })}
                  placeholder="Full name"
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Company
                </label>
                <input
                  type="text"
                  value={newContactData.company}
                  onChange={(e) => setNewContactData({ ...newContactData, company: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={newContactData.email}
                  onChange={(e) => setNewContactData({ ...newContactData, email: e.target.value })}
                  placeholder="email@example.com"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={newContactData.phone}
                  onChange={(e) => setNewContactData({ ...newContactData, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-zinc-800 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <Button
                onClick={handleCreateNewContact}
                variant="primary"
                className="flex-1"
              >
                Create Contact
              </Button>
              <Button
                onClick={() => {
                  setShowNewContactForm(false);
                  setNewContactData({
                    name: '',
                    company: '',
                    email: '',
                    phone: ''
                  });
                }}
                variant="secondary"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Project Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div style={sectionStyles.card} className="p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="mb-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                  <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  Delete Project
                </h3>
              </div>

              {deleteStep === 1 && (
                <div className="space-y-4 mt-4">
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                      ⚠️ Warning: This action cannot be undone!
                    </p>
                  </div>

                  <p className="text-gray-700 dark:text-gray-300">
                    You are about to permanently delete:
                  </p>

                  <div className="bg-gray-50 dark:bg-zinc-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                    <p className="font-semibold text-gray-900 dark:text-white mb-2">
                      {project.name}
                    </p>
                    {formData.project_number && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Project #{formData.project_number}
                      </p>
                    )}
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    This will permanently delete:
                  </p>
                  <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 ml-4">
                    <li>• All wire drops and locations</li>
                    <li>• All issues and todos</li>
                    <li>• All stakeholders and contacts</li>
                    <li>• All equipment and inventory</li>
                    <li>• All milestones and time logs</li>
                    <li>• All floor plans and documents</li>
                    <li>• All permits and secure data</li>
                  </ul>

                  <div className="flex gap-2 mt-6">
                    <Button
                      onClick={() => setDeleteStep(2)}
                      variant="danger"
                      className="flex-1"
                    >
                      Continue
                    </Button>
                    <Button
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setDeleteStep(1);
                      }}
                      variant="secondary"
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {deleteStep === 2 && (
                <div className="space-y-4 mt-4">
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-300 dark:border-red-700 rounded-lg">
                    <p className="text-base text-red-900 dark:text-red-100 font-bold mb-2">
                      Final Confirmation Required
                    </p>
                    <p className="text-sm text-red-800 dark:text-red-200">
                      This is your last chance to cancel. Once you click "Delete Forever",
                      all project data will be permanently removed from the database.
                    </p>
                  </div>

                  <div className="bg-gray-100 dark:bg-zinc-800 p-4 rounded-lg border-2 border-gray-300 dark:border-gray-600">
                    <p className="text-gray-900 dark:text-white font-semibold mb-1">
                      Deleting: {project.name}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      ID: {projectId}
                    </p>
                  </div>

                  <p className="text-sm text-gray-600 dark:text-gray-400 italic">
                    Are you absolutely sure you want to delete this project?
                  </p>

                  <div className="flex gap-2 mt-6">
                    <Button
                      onClick={handleDeleteProject}
                      variant="danger"
                      icon={Trash2}
                      disabled={deleting}
                      className="flex-1"
                    >
                      {deleting ? 'Deleting...' : 'Delete Forever'}
                    </Button>
                    <Button
                      onClick={() => setDeleteStep(1)}
                      variant="secondary"
                      disabled={deleting}
                      className="flex-1"
                    >
                      Go Back
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PMProjectViewEnhanced;
