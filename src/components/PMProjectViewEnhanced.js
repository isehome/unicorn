import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { enhancedStyles } from '../styles/styleSystem';
import { projectsService, timeLogsService, projectProgressService } from '../services/supabaseService';
import { projectEquipmentService } from '../services/projectEquipmentService';
import { fetchDocumentContents, extractShapes, extractDocumentIdFromUrl } from '../services/lucidApi';
import { wireDropService } from '../services/wireDropService';
import { projectRoomsService } from '../services/projectRoomsService';
import { supabase } from '../lib/supabase';
import { normalizeRoomName, similarityScore } from '../utils/roomUtils';
import Button from './ui/Button';
import LucidChartCarousel from './LucidChartCarousel';
import ProjectEquipmentManager from './ProjectEquipmentManager';
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
  GripVertical,
  RefreshCw,
  Link
} from 'lucide-react';

// Progress Bar Component
const ProgressBar = ({ label, percentage, helper }) => {
  const getBarColor = (percent) => {
    if (percent < 33) return 'bg-red-500';
    if (percent < 67) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const safePercentage = Math.min(100, Math.max(0, Math.round(Number(percentage) || 0)));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
        <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <span className="font-semibold text-gray-900 dark:text-gray-100">{safePercentage}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`h-full transition-all duration-300 ${getBarColor(safePercentage)}`}
          style={{ width: `${safePercentage}%` }}
        />
      </div>
      {helper && (
        <div className="text-[10px] text-gray-500 dark:text-gray-500">
          {helper}
        </div>
      )}
    </div>
  );
};

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
  const { mode } = useTheme();
  const { user } = useAuth();
  const sectionStyles = enhancedStyles.sections[mode];
  
  const [project, setProject] = useState(null);
  const [phases, setPhases] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [timeData, setTimeData] = useState({
    summary: [],
    activeUsers: [],
    totalHours: 0,
    totalMinutes: 0
  });
  const [projectProgress, setProjectProgress] = useState({ prewire: 0, trim: 0, commission: 0 });
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPhaseModal, setShowPhaseModal] = useState(false);
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
    one_drive_photos: '',
    one_drive_files: '',
    one_drive_procurement: '',
    unifi_url: ''
  });

  // Lucid integration state
  const [lucidLoading, setLucidLoading] = useState(false);
  const [lucidError, setLucidError] = useState(null);
  const [droppableShapes, setDroppableShapes] = useState([]);
  const [selectedShapes, setSelectedShapes] = useState(new Set());
  const [existingWireDrops, setExistingWireDrops] = useState([]);
  const [batchCreating, setBatchCreating] = useState(false);
  const [showLucidSection, setShowLucidSection] = useState(false);
  const [roomAssociationCollapsed, setRoomAssociationCollapsed] = useState(false);
  const [equipmentCollapsed, setEquipmentCollapsed] = useState(false);
  const [equipmentStats, setEquipmentStats] = useState({ total: 0, ordered: 0, received: 0 });
  const [laborBudgetCollapsed, setLaborBudgetCollapsed] = useState(true);
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
    if (!droppableShapes || droppableShapes.length === 0) {
      setUnmatchedRoomEntries([]);
      setRoomAssignments({});
      return;
    }

    const roomNameMap = new Map();
    droppableShapes.forEach((shape) => {
      const roomName = extractShapeRoomName(shape);
      if (!roomName) return;
      const normalized = normalizeRoomName(roomName);
      if (!normalized) return;
      const entry = roomNameMap.get(normalized) || { normalized, samples: [] };
      if (!entry.samples.includes(roomName)) {
        entry.samples.push(roomName);
      }
      roomNameMap.set(normalized, entry);
    });

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
  }, [droppableShapes, roomsByNormalized, aliasLookup, suggestRoomMatch]);

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

  const quickLinks = useMemo(
    () =>
      [
        { key: 'unifi', label: 'UniFi Site', url: formData.unifi_url, icon: ExternalLink },
        { key: 'lucid', label: 'Lucid Diagram', url: formData.wiring_diagram_url, icon: Link },
        { key: 'proposal', label: 'Proposal', url: formData.portal_proposal_url, icon: FileText },
        { key: 'photos', label: 'Photos', url: formData.one_drive_photos, icon: Camera },
        { key: 'files', label: 'Files', url: formData.one_drive_files, icon: FolderOpen },
        { key: 'procurement', label: 'Procurement', url: formData.one_drive_procurement, icon: FolderOpen }
      ].filter((item) => Boolean(item.url)),
    [
      formData.unifi_url,
      formData.wiring_diagram_url,
      formData.portal_proposal_url,
      formData.one_drive_photos,
      formData.one_drive_files,
      formData.one_drive_procurement
    ]
  );

  const resourceEntries = useMemo(
    () => [
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
        key: 'one_drive_photos',
        label: 'OneDrive Photos',
        icon: Camera,
        placeholder: 'https://...',
        helper: null,
        value: formData.one_drive_photos
      },
      {
        key: 'one_drive_files',
        label: 'OneDrive Files',
        icon: FolderOpen,
        placeholder: 'https://...',
        helper: null,
        value: formData.one_drive_files
      },
      {
        key: 'one_drive_procurement',
        label: 'OneDrive Procurement',
        icon: FolderOpen,
        placeholder: 'https://...',
        helper: null,
        value: formData.one_drive_procurement
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
      formData.wiring_diagram_url,
      formData.portal_proposal_url,
      formData.one_drive_photos,
      formData.one_drive_files,
      formData.one_drive_procurement,
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
    return (
      availableContacts.find(
        (contact) =>
          contact?.name === formData.client || contact?.company === formData.client
      ) || null
    );
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
          one_drive_photos: currentProject.one_drive_photos || '',
          one_drive_files: currentProject.one_drive_files || '',
          one_drive_procurement: currentProject.one_drive_procurement || '',
          unifi_url: currentProject.unifi_url || ''
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
            if (item?.onsite_confirmed) {
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

  const handleEquipmentChange = useCallback(
    (equipmentList) => {
      if (Array.isArray(equipmentList)) {
        loadEquipmentStats(equipmentList);
      } else {
        loadEquipmentStats();
      }
      loadLaborSummary();
    },
    [loadEquipmentStats, loadLaborSummary]
  );

  const handleSave = async () => {
    try {
      setSaving(true);
      console.log('Starting save with formData:', formData);
      console.log('selectedClient state:', selectedClient);
      console.log('Project ID:', projectId);
      
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
        one_drive_photos: formData.one_drive_photos || null,
        one_drive_files: formData.one_drive_files || null,
        one_drive_procurement: formData.one_drive_procurement || null,
        unifi_url: formData.unifi_url || null,
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
      
      // Handle client stakeholder assignment - ALWAYS try if there's a client
      let stakeholderResult = null;
      if (formData.client) {
        let contactToUse = selectedClient;
        
        // If no selectedClient, try to find matching contact
        if (!contactToUse) {
          console.log('No selectedClient, searching for matching contact...');
          contactToUse = availableContacts.find(c => 
            c.company === formData.client || 
            c.name === formData.client
          );
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
      if (stakeholderResult === true) {
        alert('Project saved successfully! Client stakeholder has been updated.');
      } else if (stakeholderResult === false) {
        alert('Project saved successfully, but there was an issue updating the client stakeholder. Please check the console for details.');
      } else {
        alert('Project saved successfully!');
      }
      
    } catch (error) {
      console.error('Failed to save project:', error);
      alert(`Failed to save: ${error.message || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    loadProjectData();
    loadTimeData();
    loadPhasesAndStatuses();
    loadContacts();
    loadProgress();

    const interval = setInterval(loadTimeData, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    loadProjectRooms();
  }, [loadProjectRooms]);

  useEffect(() => {
    loadEquipmentStats();
  }, [loadEquipmentStats]);

  useEffect(() => {
    loadLaborSummary();
  }, [loadLaborSummary]);

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
    const clientName = contact.company || contact.name || 'Unnamed Contact';
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

  const handleMilestoneUpdate = async (phaseId, field, value) => {
    const existingMilestone = milestones.find(m => m.phase_id === phaseId);
    
    if (existingMilestone) {
      // Update existing milestone
      const { error } = await supabase
        .from('project_phase_milestones')
        .update({ [field]: value, updated_at: new Date() })
        .eq('id', existingMilestone.id);
      
      if (!error) {
        setMilestones(milestones.map(m => 
          m.id === existingMilestone.id 
            ? { ...m, [field]: value }
            : m
        ));
      }
    } else {
      // Create new milestone
      const { data, error } = await supabase
        .from('project_phase_milestones')
        .insert([{
          project_id: projectId,
          phase_id: phaseId,
          [field]: value
        }])
        .select(`
          *,
          phase:project_phases(*)
        `)
        .single();
      
      if (!error) {
        setMilestones([...milestones, data]);
      }
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
          // Generate new name if room or type changed
          let updatedDropName = existingDrop.drop_name;
          if (canonicalRoomName && dropType && 
              (existingDrop.room_name !== canonicalRoomName || existingDrop.drop_type !== dropType)) {
            updatedDropName = await wireDropService.generateDropName(projectId, canonicalRoomName, dropType);
          }

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
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {project.name}
              </h1>
              {formData.project_number && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-200">
                  #{formData.project_number}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <Users className="h-3 w-3" />
                {formData.client || 'Client not set'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <Target className="h-3 w-3" />
                {formData.phase || 'Phase not set'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <CheckCircle className="h-3 w-3" />
                {formData.status || 'Status not set'}
              </span>
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start lg:flex-col lg:items-end">
            <Button
              onClick={() => (editMode ? handleSave() : setEditMode(true))}
              variant={editMode ? 'primary' : 'secondary'}
              icon={editMode ? Save : Edit}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              {saving ? 'Saving...' : editMode ? 'Save Changes' : 'Edit Project'}
            </Button>
          </div>
        </div>

        {quickLinks.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {quickLinks.map(({ key, label, url, icon: Icon }) => (
              <Button
                key={key}
                onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                variant="ghost"
                size="sm"
                icon={Icon}
                className="border border-gray-200 bg-white hover:border-violet-300 hover:text-violet-600 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-violet-500"
              >
                {label}
              </Button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <ProgressBar label="Prewire" percentage={projectProgress.prewire || 0} />
          </div>
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <ProgressBar label="Trim" percentage={projectProgress.trim || 0} />
          </div>
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <ProgressBar label="Commission" percentage={projectProgress.commission || 0} />
          </div>
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <ProgressBar label="Ordered" percentage={orderedPercentage} helper={orderedHelper} />
          </div>
          <div className="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
            <ProgressBar label="Received" percentage={receivedPercentage} helper={receivedHelper} />
          </div>
        </div>

        {/* Project Overview */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900 dark:text-white">
                  Project Basics
                </h2>
                {editMode && (
                  <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
                    Editing
                  </span>
                )}
              </div>
              <div className="mt-4 space-y-4">
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
                             bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                             disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Client
                  </label>
                  <div className="relative">
                    {!editMode ? (
                      <div className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg 
                                   bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
                        {formData.client || <span className="text-gray-400 dark:text-gray-500">No client selected</span>}
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="flex gap-2">
                          <div
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                     bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                                     hover:border-violet-500 dark:hover:border-violet-400 cursor-pointer
                                     flex items-center gap-2"
                            onClick={() => setShowClientPicker(!showClientPicker)}
                          >
                            <Users className="w-4 h-4 text-gray-500" />
                            {formData.client ? (
                              <span className="flex-1">{formData.client}</span>
                            ) : (
                              <span className="flex-1 text-gray-500 dark:text-gray-400">
                                Select or add client...
                              </span>
                            )}
                            <ChevronDown
                              className={`w-4 h-4 text-gray-400 transition-transform ${
                                showClientPicker ? 'rotate-180' : ''
                              }`}
                            />
                          </div>
                          {formData.client && (
                            <button
                              type="button"
                              onClick={handleClearClient}
                              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                                       bg-white dark:bg-gray-800 text-gray-400 hover:text-red-600 
                                       dark:hover:text-red-400 hover:border-red-300 dark:hover:border-red-700"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        {showClientPicker && (
                          <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-300 
                                        dark:border-gray-600 rounded-lg shadow-lg max-h-96 overflow-hidden">
                            <div className="p-2 border-b border-gray-200 dark:border-gray-700">
                              <input
                                type="text"
                                value={clientSearchTerm}
                                onChange={(e) => setClientSearchTerm(e.target.value)}
                                placeholder="Search contacts..."
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded 
                                         bg-white dark:bg-gray-900 text-gray-900 dark:text-white
                                         placeholder-gray-500 dark:placeholder-gray-400"
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
                                      className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer 
                                               border-b border-gray-100 dark:border-gray-700 last:border-0"
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
                               bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                               disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
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
                               bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                               disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
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
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900 dark:text-white">
                Schedule & Notes
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
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
                             bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                             disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
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
                             bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                             disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
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
                             bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                             disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
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
                             bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                             disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
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
                             bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                             disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900 dark:text-white">
                Linked Resources
              </h2>
              <div className="mt-4 space-y-4">
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
                                   bg-white dark:bg-gray-800 text-gray-900 dark:text-white
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
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-900 dark:text-white">
                Client Contact
              </h2>
              <div className="mt-4 space-y-3 text-sm text-gray-600 dark:text-gray-300">
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
      </div>

      {/* Lucid Chart Carousel - Show when there's a wiring diagram URL */}
      {formData.wiring_diagram_url && (
        <LucidChartCarousel 
          documentUrl={formData.wiring_diagram_url}
          projectName={project.name}
        />
      )}

      {/* Phase Milestones */}
      <div style={sectionStyles.card} className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Phase Milestones
          </h2>
          {editMode && (
            <Button
              variant="secondary"
              size="sm"
              icon={Settings}
              onClick={() => setShowPhaseOrderModal(true)}
            >
              Reorder Phases
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Phase</th>
                <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Target Date</th>
                <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Actual Date</th>
                <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Status</th>
                <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {phases.map((phase) => {
                const milestone = milestones.find(m => m.phase_id === phase.id);
                const isOverdue = milestone?.target_date && 
                  !milestone?.actual_date && 
                  new Date(milestone.target_date) < new Date();
                
                return (
                  <tr key={phase.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: phase.color }}
                        />
                        <span className="font-medium text-gray-900 dark:text-white">
                          {phase.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        value={milestone?.target_date || ''}
                        onChange={(e) => handleMilestoneUpdate(phase.id, 'target_date', e.target.value)}
                        className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded 
                                 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        value={milestone?.actual_date || ''}
                        onChange={(e) => handleMilestoneUpdate(phase.id, 'actual_date', e.target.value)}
                        className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded 
                                 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </td>
                    <td className="px-4 py-3">
                      {milestone?.actual_date ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full 
                                       bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <CheckCircle className="w-3 h-3" />
                          Complete
                        </span>
                      ) : isOverdue ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full 
                                       bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          <AlertCircle className="w-3 h-3" />
                          Overdue
                        </span>
                      ) : milestone?.target_date ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full 
                                       bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          <Target className="w-3 h-3" />
                          Scheduled
                        </span>
                      ) : (
                        <span className="text-gray-400">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={milestone?.notes || ''}
                        onChange={(e) => handleMilestoneUpdate(phase.id, 'notes', e.target.value)}
                        placeholder="Add notes..."
                        className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded 
                                 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Time Tracking Section */}
      <div style={sectionStyles.card} className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Time Tracking & Progress</h2>
          <div className="flex flex-wrap items-end gap-6">
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
                className={`text-sm font-semibold ${
                  remainingMinutesRaw < 0 ? 'text-red-500' : 'text-emerald-500'
                }`}
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
        </div>

        {/* Project Progress Gauges */}
        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Project Progress
          </h3>
          <div className="space-y-2">
            <ProgressBar label="Prewire" percentage={projectProgress.prewire || 0} />
            <ProgressBar label="Trim" percentage={projectProgress.trim || 0} />
            <ProgressBar label="Commission" percentage={projectProgress.commission || 0} />
          </div>
        </div>

        <div className="mb-6">
          <button
            type="button"
            onClick={() => setLaborBudgetCollapsed((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
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
              className={`w-5 h-5 text-gray-500 transition-transform ${
                laborBudgetCollapsed ? '' : 'rotate-180'
              }`}
            />
          </button>

          {!laborBudgetCollapsed && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              {laborSummary.entries.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No labor entries imported from the portal CSV yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800">
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
                          <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
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
                    <tfoot className="bg-gray-50 dark:bg-gray-800">
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
                  className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 
                           border border-green-200 dark:border-green-800 rounded-lg"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
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
                <thead className="bg-gray-50 dark:bg-gray-800">
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
                    <tr key={user.user_email} className="hover:bg-gray-50 dark:hover:bg-gray-800">
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
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full 
                                         bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            <CheckCircle className="w-3 h-3" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full 
                                         bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
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

      {/* Room Synchronization Section - Always visible when project has data */}
      {(projectRooms.length > 0 || droppableShapes.length > 0) && (
        <div style={sectionStyles.card} className="p-6">
          <button
            type="button"
            onClick={() => setRoomAssociationCollapsed((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
          >
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Room Matching: Lucid to CSV</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Map room names from Lucid diagrams to rooms imported from CSV equipment files
              </p>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-gray-500 transition-transform ${roomAssociationCollapsed ? '' : 'rotate-180'}`}
            />
          </button>

          {!roomAssociationCollapsed && (
            <div className="mt-4 space-y-4">
              {/* Get all unique Lucid room names */}
              {(() => {
                const roomNameMap = new Map();
                droppableShapes.forEach((shape) => {
                  const roomName = extractShapeRoomName(shape);
                  if (!roomName) return;
                  const normalized = normalizeRoomName(roomName);
                  if (!normalized) return;
                  const entry = roomNameMap.get(normalized) || { normalized, samples: [] };
                  if (!entry.samples.includes(roomName)) {
                    entry.samples.push(roomName);
                  }
                  roomNameMap.set(normalized, entry);
                });

                const lucidRoomEntries = Array.from(roomNameMap.values());

                if (lucidRoomEntries.length === 0) {
                  return (
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        No Lucid rooms found yet. Fetch shape data to see rooms from your diagram.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                        Lucid Rooms ({lucidRoomEntries.length})
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        CSV Rooms Available: {projectRooms.length}
                      </p>
                    </div>

                    {lucidRoomEntries.map((entry) => {
                      const resolvedRoom = resolveRoomForName(entry.samples[0]);
                      const isMatched = !!resolvedRoom?.room;
                      const suggestion = suggestRoomMatch(entry.normalized);

                      return (
                        <div
                          key={entry.normalized}
                          className={`p-4 rounded-lg border ${
                            isMatched
                              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                {isMatched && (
                                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                                )}
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                  Lucid Room: {entry.samples[0]}
                                </p>
                              </div>

                              {isMatched && (
                                <p className="text-xs text-green-700 dark:text-green-300 mb-2">
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
                                  className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg 
                                           bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
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

                                {roomAssignments[entry.normalized] && (
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
                                             bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
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

              {/* Project Rooms Summary */}
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                  Project Rooms ({projectRooms.length})
                </h3>
                {projectRooms.length === 0 ? (
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    No rooms have been created yet. Import Lucid wire drops or CSV equipment to create rooms.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {projectRooms.map((room) => (
                      <div
                        key={room.id}
                        className="p-2 bg-white dark:bg-gray-800 rounded border border-blue-200 dark:border-blue-700"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {room.name}
                          </span>
                          {room.is_headend && (
                            <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded">
                              Head-End
                            </span>
                          )}
                        </div>
                        {room.project_room_aliases && room.project_room_aliases.length > 0 && (
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Aliases: {room.project_room_aliases.map(a => a.alias).join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

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
                        className="p-3 bg-white dark:bg-gray-800 rounded border border-yellow-300 dark:border-yellow-700"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                              From Lucid: <span className="font-mono">{entry.samples.join(', ')}</span>
                            </p>
                            
                            {entry.suggestion && entry.suggestion.score >= 0.72 && (
                              <p className="text-xs text-green-600 dark:text-green-400 mb-2">
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
                                           bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
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
                                           bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
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
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <div>
                      <p className="text-sm font-semibold text-green-900 dark:text-green-200">
                        All Lucid rooms are matched!
                      </p>
                      <p className="text-xs text-green-700 dark:text-green-300">
                        All room names from Lucid wire drops have been successfully matched to project rooms.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Lucid Integration Section */}
      {formData.wiring_diagram_url && (
        <div style={sectionStyles.card} className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Lucid Wiring Diagram Integration
            </h2>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={ExternalLink}
                onClick={() => window.open(formData.wiring_diagram_url, '_blank')}
              >
                Open Diagram
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={lucidLoading ? Loader : RefreshCw}
                onClick={handleFetchLucidData}
                disabled={lucidLoading}
              >
                {lucidLoading ? 'Fetching...' : showLucidSection ? 'Refresh' : 'Fetch Shape Data'}
              </Button>
            </div>
          </div>

          {/* Document Info */}
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <span className="font-medium text-gray-600 dark:text-gray-400">URL:</span>
                <p className="text-gray-900 dark:text-white break-all">{formData.wiring_diagram_url}</p>
              </div>
              <div>
                <span className="font-medium text-gray-600 dark:text-gray-400">Document ID:</span>
                <p className="text-gray-900 dark:text-white font-mono">
                  {extractDocumentIdFromUrl(formData.wiring_diagram_url) || 'Not detected - check URL format'}
                </p>
              </div>
            </div>
          </div>

          {lucidError && (
            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                <div>
                  <p className="font-semibold text-red-900 dark:text-red-200">Error fetching Lucid data</p>
                  <p className="text-sm text-red-700 dark:text-red-300">{lucidError}</p>
                </div>
              </div>
            </div>
          )}

          {showLucidSection && droppableShapes.length > 0 && (
            <div>
              <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-900 dark:text-blue-200">
                  Found <strong>{droppableShapes.length}</strong> shapes with "IS Drop = true"
                  {existingWireDrops.length > 0 && (
                    <span> • <strong>{existingWireDrops.filter(wd => wd.lucid_shape_id).length}</strong> already have wire drops</span>
                  )}
                </p>
              </div>

              {/* Selection Controls */}
              <div className="flex justify-between items-center mb-4">
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSelectAll}
                    disabled={droppableShapes.every(s => isShapeLinked(s.id))}
                  >
                    Select All (Available)
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleDeselectAll}
                    disabled={selectedShapes.size === 0}
                  >
                    Deselect All
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={RefreshCw}
                    onClick={async () => {
                      // Select all linked shapes and refresh them
                      const linkedShapes = droppableShapes.filter(s => isShapeLinked(s.id));
                      if (linkedShapes.length === 0) {
                        alert('No linked wire drops to refresh');
                        return;
                      }
                      setSelectedShapes(new Set(linkedShapes.map(s => s.id)));
                      // Wait a tick then trigger the update
                      setTimeout(() => {
                        handleCreateWireDropsFromSelected();
                      }, 100);
                    }}
                    disabled={batchCreating || !droppableShapes.some(s => isShapeLinked(s.id))}
                  >
                    Refresh All Linked
                  </Button>
                </div>
                <Button
                  variant="primary"
                  icon={batchCreating ? Loader : Plus}
                  onClick={handleCreateWireDropsFromSelected}
                  disabled={selectedShapes.size === 0 || batchCreating}
                >
                  {batchCreating ? 'Creating...' : `Create ${selectedShapes.size} Wire Drop${selectedShapes.size !== 1 ? 's' : ''}`}
                </Button>
              </div>

              {/* Shape List */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-2 text-left">
                        <input
                          type="checkbox"
                          onChange={(e) => e.target.checked ? handleSelectAll() : handleDeselectAll()}
                          checked={selectedShapes.size > 0 && selectedShapes.size === droppableShapes.filter(s => !isShapeLinked(s.id)).length}
                          className="rounded"
                        />
                      </th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Shape Name</th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Room</th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Wire Type</th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Lucid ID</th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Page</th>
                      <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {droppableShapes.map((shape) => {
                      const linked = isShapeLinked(shape.id);
                      const wireDrop = getLinkedWireDrop(shape.id);
                      const shapeName =
                        shape.text ||
                        getShapeCustomValue(shape, 'Drop Name') ||
                        `Drop ${shape.id.substring(0, 8)}`;
                      const roomName = extractShapeRoomName(shape);
                      const resolvedRoom = resolveRoomForName(roomName);
                      const canonicalRoomName = resolvedRoom?.room?.name || roomName || '—';
                      const wireType = extractShapeWireType(shape) || 'CAT6';
                      const dbRoomName = wireDrop?.room_name || wireDrop?.location || null;
                      const dbWireType = wireDrop?.type || null;

                      return (
                        <tr
                          key={shape.id}
                          className={`hover:bg-gray-50 dark:hover:bg-gray-800 ${linked ? 'opacity-60' : ''}`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedShapes.has(shape.id)}
                              onChange={() => handleShapeSelection(shape.id)}
                              disabled={linked}
                              className="rounded disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                            {shapeName}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm text-gray-900 dark:text-white">{canonicalRoomName}</div>
                            {dbRoomName && dbRoomName !== canonicalRoomName && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                DB: {dbRoomName}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                            {wireType}
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-xs font-mono text-green-600 dark:text-green-400">{shape.id}</div>
                            {wireDrop?.id && (
                              <div className="text-[11px] font-mono text-purple-500 dark:text-purple-300 mt-1">
                                Drop ID: {wireDrop.id}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-mono">
                            {shape.pageTitle || `Page ${shape.pageId?.substring(0, 8) || '?'}`}
                          </td>
                          <td className="px-4 py-3">
                            {linked ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                                  <CheckCircle className="w-3 h-3" />
                                  Linked
                                </span>
                                <div className="text-xs text-purple-500 dark:text-purple-300">
                                  {wireDrop?.drop_name || wireDrop?.name || 'Existing wire drop'}
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-xs">
                                Available
                              </span>
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

          {showLucidSection && droppableShapes.length === 0 && !lucidError && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p>No shapes found with "IS Drop = true" in the custom data.</p>
              <p className="text-sm mt-2">Make sure your Lucid shapes have the custom data field "IS Drop" set to "true".</p>
            </div>
          )}
        </div>
      )}


      {/* Portal Equipment & Labor Section */}
      <div style={sectionStyles.card} className="p-6">
        <button
          type="button"
          onClick={() => setEquipmentCollapsed((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"
        >
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Portal Equipment &amp; Labor</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Import proposal CSVs to populate room equipment and technician labor budgets.
            </p>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-gray-500 transition-transform ${equipmentCollapsed ? '' : 'rotate-180'}`}
          />
        </button>

        {!equipmentCollapsed && (
          <div className="mt-4">
            <ProjectEquipmentManager
              projectId={projectId}
              embedded
              onEquipmentChange={handleEquipmentChange}
            />
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <Button
          variant="primary"
          onClick={() => navigate(`/project/${projectId}/pm-issues`)}
        >
          View Issues
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigate('/wire-drops')}
        >
          View Wire Drops
        </Button>
      </div>
      
      {/* Add Phase Modal */}
      {showPhaseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div style={sectionStyles.card} className="p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Add New Phase</h3>
            <input
              type="text"
              placeholder="Phase name"
              value={newPhase.name}
              onChange={(e) => setNewPhase({...newPhase, name: e.target.value})}
              className="w-full px-3 py-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newPhase.description}
              onChange={(e) => setNewPhase({...newPhase, description: e.target.value})}
              className="w-full px-3 py-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg"
            />
            <input
              type="color"
              value={newPhase.color}
              onChange={(e) => setNewPhase({...newPhase, color: e.target.value})}
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
              onChange={(e) => setNewStatus({...newStatus, name: e.target.value})}
              className="w-full px-3 py-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg"
            />
            <input
              type="text"
              placeholder="Description (optional)"
              value={newStatus.description}
              onChange={(e) => setNewStatus({...newStatus, description: e.target.value})}
              className="w-full px-3 py-2 mb-3 border border-gray-300 dark:border-gray-600 rounded-lg"
            />
            <input
              type="color"
              value={newStatus.color}
              onChange={(e) => setNewStatus({...newStatus, color: e.target.value})}
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
                  className="flex items-center justify-between p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800"
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
                      className={`p-1 rounded ${
                        index === 0 
                          ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' 
                          : 'text-gray-600 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400'
                      }`}
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handlePhaseReorder(phase.id, 'down')}
                      disabled={index === phases.length - 1}
                      className={`p-1 rounded ${
                        index === phases.length - 1 
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
                  onChange={(e) => setNewContactData({...newContactData, name: e.target.value})}
                  placeholder="Full name"
                  required
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Company
                </label>
                <input
                  type="text"
                  value={newContactData.company}
                  onChange={(e) => setNewContactData({...newContactData, company: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={newContactData.email}
                  onChange={(e) => setNewContactData({...newContactData, email: e.target.value})}
                  placeholder="email@example.com"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={newContactData.phone}
                  onChange={(e) => setNewContactData({...newContactData, phone: e.target.value})}
                  placeholder="(555) 123-4567"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg 
                           bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
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
    </div>
  );
};

export default PMProjectViewEnhanced;
