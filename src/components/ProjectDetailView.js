import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef
} from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import Button from './ui/Button';
import DateInput from './ui/DateInput';
import {
  ArrowLeft,
  FileText,
  Zap,
  ListTodo,
  AlertTriangle,
  Users,
  ChevronRight,
  Search,
  CheckSquare,
  Square,
  Trash2,
  Loader,
  Plus,
  Image,
  Folder,
  Package,
  Mail,
  Phone,
  Building,
  Map as MapIcon,
  Check,
  X,
  Pencil,
  Shield,
  PackageCheck,
  Printer
} from 'lucide-react';
import {
  projectsService,
  projectTodosService,
  projectStakeholdersService,
  contactsService,
  stakeholderRolesService,
  issuesService
} from '../services/supabaseService';
import { milestoneService } from '../services/milestoneService';
import { milestoneCacheService } from '../services/milestoneCacheService';
import { enhancedStyles, stakeholderColors } from '../styles/styleSystem';
import { projectRoomsService } from '../services/projectRoomsService';
import { normalizeRoomName } from '../utils/roomUtils';
import { getWireDropBadgeColor, getWireDropBadgeLetter, getWireDropBadgeTextColor } from '../utils/wireDropVisuals';
import EquipmentManager from './EquipmentManager';
import SecureDataManager from './SecureDataManager';
import LucidChartCarousel from './LucidChartCarousel';
import MilestoneGaugesDisplay from './MilestoneGaugesDisplay';
import ProjectPermits from './ProjectPermits';
import ProjectLinks from './project-detail/ProjectLinks';
import IssuesSection from './project-detail/IssuesSection';

const importanceRanking = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3
};

const importanceColors = {
  critical: '#ef4444',
  high: '#f97316',
  normal: '#3b82f6',
  low: '#22c55e'
};

const getImportanceRank = (value) => {
  const key = typeof value === 'string' ? value.toLowerCase() : '';
  return importanceRanking[key] ?? importanceRanking.normal;
};

const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString();
  } catch (error) {
    return value;
  }
};

// Old ProgressBar component removed - now using UnifiedProgressGauge in MilestoneGaugesDisplay

const withAlpha = (hex, alpha) => {
  if (!hex || hex[0] !== '#' || (hex.length !== 7 && hex.length !== 4)) return hex;
  const fullHex = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  const r = parseInt(fullHex.slice(1, 3), 16);
  const g = parseInt(fullHex.slice(3, 5), 16);
  const b = parseInt(fullHex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const statusChipStyle = (palette, status) => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'resolved' || normalized === 'complete') {
    return { backgroundColor: palette.chipActiveBg, color: palette.chipActiveText };
  }
  if (normalized === 'blocked' || normalized === 'critical') {
    return { backgroundColor: withAlpha(palette.danger, 0.18), color: palette.danger };
  }
  if (normalized === 'open' || normalized === 'pending') {
    return { backgroundColor: withAlpha(palette.warning, 0.18), color: palette.warning };
  }
  return { backgroundColor: palette.chipIdleBg, color: palette.chipIdleText };
};

const ProjectDetailView = () => {
  const { id } = useParams();
  const location = useLocation();
  const { theme, mode } = useTheme();
  const palette = theme.palette;
  const navigate = useNavigate();
  const sectionStyles = enhancedStyles.sections[mode];
  const pageClasses = mode === 'dark'
    ? 'bg-zinc-900 text-gray-100'
    : 'bg-gray-50 text-gray-900';

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
      badge: {
        backgroundColor: mode === 'dark' ? 'rgba(129, 140, 248, 0.2)' : 'rgba(129, 140, 248, 0.18)',
        color: mode === 'dark' ? '#E0E7FF' : '#4338CA'
      },
      textPrimary: { color: textPrimary },
      textSecondary: { color: textSecondary },
      subtleText: { color: subtleText },
      accentText: { color: palette.accent },
      input: {
        backgroundColor: mutedBackground,
        borderColor,
        color: textPrimary
      },
      innerShadow: mode === 'dark'
        ? 'inset 0 1px 0 rgba(255, 255, 255, 0.04)'
        : 'inset 0 1px 0 rgba(15, 23, 42, 0.05)',
      progressBadge: {
        backgroundColor: mode === 'dark' ? 'rgba(99, 102, 241, 0.25)' : 'rgba(79, 70, 229, 0.12)',
        color: mode === 'dark' ? '#C7D2FE' : '#4C1D95'
      },
      progressFill: (value) => {
        if (value >= 90) {
          return { background: palette.accentGradient };
        }
        if (value >= 70) {
          return { backgroundColor: palette.success };
        }
        if (value >= 40) {
          return { backgroundColor: palette.warning };
        }
        return { backgroundColor: palette.danger };
      }
    };
  }, [mode, palette, sectionStyles]);

  const [project, setProject] = useState(null);
  const [stakeholders, setStakeholders] = useState({ internal: [], external: [] });
  const [wireDrops, setWireDrops] = useState([]);
  const [todos, setTodos] = useState([]);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedSection, setExpandedSection] = useState(null);
  const [wireDropQuery, setWireDropQuery] = useState('');
  const [newTodo, setNewTodo] = useState('');
  const [todoError, setTodoError] = useState('');
  const [addingTodo, setAddingTodo] = useState(false);
  const [updatingTodoId, setUpdatingTodoId] = useState(null);
  const [deletingTodoId, setDeletingTodoId] = useState(null);
  const [dragTodoId, setDragTodoId] = useState(null);
  const [dragOverTodoId, setDragOverTodoId] = useState(null);
  const [dragOverTodoPos, setDragOverTodoPos] = useState(null); // 'before' | 'after'
  const dragImageElRef = useRef(null);
  const [showCompletedTodos, setShowCompletedTodos] = useState(true);
  const [showResolvedIssues, setShowResolvedIssues] = useState(false);
  const [showAddStakeholder, setShowAddStakeholder] = useState(false);
  const [availableContacts, setAvailableContacts] = useState([]);
  const [stakeholderRoles, setStakeholderRoles] = useState([]);
  const [expandedContact, setExpandedContact] = useState(null);
  const [pendingContactId, setPendingContactId] = useState('');
  const [pendingRoleId, setPendingRoleId] = useState('');
  const [editingStakeholder, setEditingStakeholder] = useState(null);
  const [creatingNewContact, setCreatingNewContact] = useState(false);
  const [showEquipmentManager, setShowEquipmentManager] = useState(false);
  const [showSecureDataManager, setShowSecureDataManager] = useState(false);
  const [milestonePercentages, setMilestonePercentages] = useState({});
  const [projectOwners, setProjectOwners] = useState({ pm: null, technician: null });

  const refreshStakeholders = useCallback(async () => {
    try {
      const data = await projectStakeholdersService.getForProject(id);
      setStakeholders(data || { internal: [], external: [] });
    } catch (refreshError) {
      console.error('Failed to refresh stakeholders:', refreshError);
    }
  }, [id]);

  const loadProjectData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const projectData = await projectsService.getWithStakeholders(id);
      setProject(projectData);
      setStakeholders(projectData?.stakeholders || { internal: [], external: [] });

      const wireDropPromise = supabase
        .from('wire_drops')
        .select(`
          *,
          project_room:project_rooms(*),
          wire_drop_stages(
            stage_type,
            completed,
            completed_at,
            completed_by,
            photo_url,
            notes
          )
        `)
        .eq('project_id', id)
        .order('uid');

      const [
        wireDropsResult,
        projectRooms,
        todoResult,
        issuesResult
      ] = await Promise.all([
        wireDropPromise,
        projectRoomsService.fetchRoomsWithAliases(id),
        projectTodosService.getForProject(id),
        issuesService.getAll(id)
      ]);

      if (wireDropsResult?.error) throw wireDropsResult.error;

      const rooms = Array.isArray(projectRooms) ? projectRooms : [];
      const roomsById = new Map();
      const aliasLookup = new Map();

      rooms.forEach((room) => {
        if (room?.id) {
          roomsById.set(room.id, room);
        }
        const normalizedName = room?.normalized_name || normalizeRoomName(room?.name);
        if (normalizedName && !aliasLookup.has(normalizedName)) {
          aliasLookup.set(normalizedName, room);
        }
        (room?.project_room_aliases || []).forEach((alias) => {
          const normalizedAlias =
            alias?.normalized_alias || normalizeRoomName(alias?.alias);
          if (normalizedAlias && !aliasLookup.has(normalizedAlias)) {
            aliasLookup.set(normalizedAlias, room);
          }
        });
      });

      const annotatedWireDrops = (wireDropsResult?.data || []).map((drop) => {
        let resolvedRoom = null;
        if (drop?.project_room?.id) {
          resolvedRoom = drop.project_room;
        } else if (drop?.project_room_id && roomsById.has(drop.project_room_id)) {
          resolvedRoom = roomsById.get(drop.project_room_id);
        } else {
          const candidateNames = [
            drop?.room_name,
            drop?.location,
            drop?.shape_data?.['Room Name'],
            drop?.shape_data?.room,
            drop?.shape_data?.Room,
            drop?.shape_data?.['Drop Location']
          ];

          for (const name of candidateNames) {
            const normalized = normalizeRoomName(name);
            if (normalized && aliasLookup.has(normalized)) {
              resolvedRoom = aliasLookup.get(normalized);
              break;
            }
          }
        }

        if (resolvedRoom) {
          return {
            ...drop,
            project_room: resolvedRoom,
            project_room_id: resolvedRoom.id,
            room_name: resolvedRoom.name || drop.room_name
          };
        }

        return {
          ...drop,
          room_name: drop?.room_name && drop.room_name !== 'Unassigned room' ? drop.room_name : null
        };
      });

      setWireDrops(annotatedWireDrops);
      setTodos(todoResult || []);
      setIssues(Array.isArray(issuesResult) ? issuesResult : []);
      
      // Load milestone percentages with caching
      try {
        const cachedData = milestoneCacheService.getCached(id);
        if (cachedData) {
          setMilestonePercentages(cachedData.data);
        }

        const percentages = await milestoneService.getAllPercentagesOptimized(id);
        milestoneCacheService.setCached(id, percentages);
        setMilestonePercentages(percentages);
      } catch (milestoneError) {
        console.error('Failed to load milestones:', milestoneError);
      }

      // Load project owners (PM and Lead Technician)
      try {
        const { data: stakeholdersData } = await supabase
          .from('project_stakeholders')
          .select(`
            stakeholder_roles (name),
            contacts (first_name, last_name)
          `)
          .eq('project_id', id);

        const pm = stakeholdersData?.find(s => s.stakeholder_roles?.name === 'Project Manager');
        const tech = stakeholdersData?.find(s => s.stakeholder_roles?.name === 'Lead Technician');

        setProjectOwners({
          pm: pm?.contacts ? `${pm.contacts.first_name || ''} ${pm.contacts.last_name || ''}`.trim() : null,
          technician: tech?.contacts ? `${tech.contacts.first_name || ''} ${tech.contacts.last_name || ''}`.trim() : null
        });
      } catch (ownerError) {
        console.error('Failed to load project owners:', ownerError);
      }
    } catch (err) {
      console.error('Failed to load project detail:', err);
      setError(err.message || 'Failed to load project details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadAvailableData = useCallback(async () => {
    try {
      const [contactsData, rolesData] = await Promise.all([
        contactsService.getAll(),
        stakeholderRolesService.getAll()
      ]);

      setAvailableContacts(Array.isArray(contactsData) ? contactsData : []);
      setStakeholderRoles(Array.isArray(rolesData) ? rolesData : []);
    } catch (error) {
      console.error('Failed to load available data:', error);
    }
  }, []);

  useEffect(() => {
    loadProjectData();
    loadAvailableData();
    
    // Check if we should automatically open the issues section and trigger new issue creation
    const searchParams = new URLSearchParams(location.search);
    const action = searchParams.get('action');
    
    if (action === 'new-issue') {
      // Automatically expand the issues section
      setExpandedSection('issues');
      
      // After a short delay to ensure the section is expanded, trigger the new issue dialog
      setTimeout(() => {
        handleNewIssue();
      }, 500);
    }
  }, [loadProjectData, loadAvailableData, location.search]);

  useEffect(() => {
    setExpandedSection(null);
    setWireDropQuery('');
    setShowCompletedTodos(true);
  }, [id]);

  useEffect(() => {
    if (expandedSection !== 'people') {
      setShowAddStakeholder(false);
      setExpandedContact(null);
      setPendingContactId('');
      setPendingRoleId('');
      setEditingStakeholder(null);
    }
  }, [expandedSection]);

  const toggleSection = (section) => {
    setExpandedSection((prev) => (prev === section ? null : section));
  };

  const openLink = (url) => {
    if (!url) {
      alert('Link not configured');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const filteredWireDrops = useMemo(() => {
    const list = Array.isArray(wireDrops) ? [...wireDrops] : [];
    const query = (wireDropQuery || '').trim().toLowerCase();

    const matchesQuery = (drop) => {
      if (!query) return true;
      const values = [
        drop.project_room?.name,
        drop.room_name,
        drop.drop_name,
        drop.name,
        drop.location,
        drop.uid,
        drop.type
      ];
      return values
        .filter((value) => value !== null && value !== undefined)
        .some((value) => String(value).toLowerCase().includes(query));
    };

    const filtered = list.filter(matchesQuery);

    const getRoomKey = (drop) =>
      (drop.project_room?.name || drop.room_name || '').toLowerCase();
    const getDropKey = (drop) =>
      (drop.drop_name || drop.name || '').toLowerCase();

    return filtered.sort((a, b) => {
      const roomA = getRoomKey(a);
      const roomB = getRoomKey(b);
      if (roomA && roomB && roomA !== roomB) {
        return roomA.localeCompare(roomB);
      }
      if (roomA && !roomB) return -1;
      if (!roomA && roomB) return 1;
      const dropA = getDropKey(a);
      const dropB = getDropKey(b);
      if (dropA && dropB && dropA !== dropB) {
        return dropA.localeCompare(dropB);
      }
      if (dropA && !dropB) return -1;
      if (!dropA && dropB) return 1;
      return 0;
    });
  }, [wireDrops, wireDropQuery]);

  const openTodos = useMemo(
    () => todos.filter((todo) => !todo.completed),
    [todos]
  );

  const visibleTodos = useMemo(() => {
    const list = showCompletedTodos ? todos : todos.filter((t) => !t.completed);
    return [...list].sort((a, b) => {
      if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
      const ai = getImportanceRank(a.importance);
      const bi = getImportanceRank(b.importance);
      if (ai !== bi) return ai - bi;
      const ao = (a.sortOrder ?? 0);
      const bo = (b.sortOrder ?? 0);
      if (ao !== bo) return ao - bo;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });
  }, [todos, showCompletedTodos]);

  const openIssues = useMemo(
    () => issues.filter((issue) => (issue.status || '').toLowerCase() !== 'resolved'),
    [issues]
  );

  const peopleCount = useMemo(
    () => (stakeholders.internal?.length || 0) + (stakeholders.external?.length || 0),
    [stakeholders]
  );

  const availableContactsForModal = useMemo(() => {
    if (!Array.isArray(availableContacts) || availableContacts.length === 0) {
      return [];
    }
    const assigned = new Set();
    (stakeholders.internal || []).forEach((person) => {
      if (person?.contact_id) assigned.add(person.contact_id);
    });
    (stakeholders.external || []).forEach((person) => {
      if (person?.contact_id) assigned.add(person.contact_id);
    });

    const editingContactId = editingStakeholder?.contactId;

    return availableContacts.filter((contact) => {
      if (!contact) return false;
      if (editingContactId && contact.id === editingContactId) {
        return true;
      }
      return !assigned.has(contact.id);
    });
  }, [availableContacts, stakeholders, editingStakeholder]);

  const getStakeholderKey = useCallback((person) => (
    person?.assignment_id || person?.id || person?.contact_id || person?.contactId
  ), []);

  const resolveRoleIdForPerson = useCallback((person) => {
    if (!person) return '';
    if (person.stakeholder_role_id) return person.stakeholder_role_id;
    if (person.role_id) return person.role_id;
    if (person.role_type_id) return person.role_type_id;
    const match = stakeholderRoles.find((role) => {
      if (!role?.name) return false;
      const roleMatches = role.name === person.role_name;
      if (!roleMatches) return false;
      if (role.category && person.category) {
        return role.category === person.category;
      }
      return true;
    });
    return match?.id || '';
  }, [stakeholderRoles]);

  const handleToggleContact = useCallback((key) => {
    setExpandedContact((prev) => (prev === key ? null : key));
  }, []);

  const handleStakeholderAdded = useCallback(async (contactId, roleId) => {
    try {
      if (editingStakeholder?.id) {
        await projectStakeholdersService.updateAssignment(editingStakeholder.id, {
          contactId,
          roleId
        });
      } else {
        await projectStakeholdersService.addToProject(id, contactId, roleId);
      }
      await refreshStakeholders();
      await loadAvailableData();
      setShowAddStakeholder(false);
      setExpandedContact(null);
      setPendingContactId('');
      setPendingRoleId('');
      setEditingStakeholder(null);
    } catch (err) {
      console.error('Failed to add stakeholder:', err);
      alert(err.message || 'Failed to add stakeholder');
    }
  }, [id, editingStakeholder, refreshStakeholders, loadAvailableData]);

  const handleCreateRole = useCallback(async ({ name, category, description }) => {
    const nextSortOrder = stakeholderRoles.reduce((max, role) => {
      const value = typeof role?.sort_order === 'number' ? role.sort_order : 0;
      return Math.max(max, value);
    }, 0) + 1;

    const created = await stakeholderRolesService.create({
      name,
      category,
      description,
      sort_order: nextSortOrder,
      is_active: true
    });

    if (created) {
      setStakeholderRoles((prev) => {
        const next = [...prev, created];
        return next.sort((a, b) => {
          const orderA = typeof a.sort_order === 'number' ? a.sort_order : 0;
          const orderB = typeof b.sort_order === 'number' ? b.sort_order : 0;
          if (orderA !== orderB) return orderA - orderB;
          return (a.name || '').localeCompare(b.name || '');
        });
      });
    }

    return created;
  }, [stakeholderRoles]);

  const handleRemoveStakeholder = useCallback(async (assignmentId, key, name) => {
    if (!assignmentId) {
      console.warn('Unable to remove stakeholder without assignment id');
      return;
    }
    const confirmed = window.confirm(`Remove ${name || 'this stakeholder'} from the project?`);
    if (!confirmed) {
      return;
    }
    try {
      await projectStakeholdersService.removeFromProject(assignmentId);
      await refreshStakeholders();
      setExpandedContact((prev) => (prev === key ? null : prev));
      if (editingStakeholder?.id === assignmentId) {
        setEditingStakeholder(null);
        setPendingContactId('');
        setPendingRoleId('');
      }
    } catch (err) {
      console.error('Failed to remove stakeholder:', err);
      alert(err.message || 'Failed to remove stakeholder');
    }
  }, [refreshStakeholders, editingStakeholder]);

  const handleEditStakeholder = useCallback((person) => {
    if (!person) return;
    const assignmentId = person.assignment_id || person.id;
    if (!assignmentId) return;
    const contactId = person.contact_id || person.contactId || '';
    const roleId = resolveRoleIdForPerson(person) || '';

    setEditingStakeholder({ id: assignmentId, contactId });
    setPendingContactId(contactId || '');
    setPendingRoleId(roleId || '');
    setShowAddStakeholder(true);
  }, [resolveRoleIdForPerson]);

  const handleContactAction = useCallback((type, value) => {
    if (!value) return;
    if (type === 'email') {
      window.location.href = `mailto:${value}`;
      return;
    }
    if (type === 'phone') {
      const sanitized = `${value}`.replace(/[^+\d]/g, '');
      window.location.href = `tel:${sanitized}`;
      return;
    }
    if (type === 'address') {
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const StakeholderCard = ({ person, category, isExpanded, onToggle, onRemove, onEdit, onContactAction }) => {
    const accentColor = category === 'internal' ? palette.accent : palette.success;
    return (
      <div
        className="rounded-2xl transition-transform duration-200 hover:-translate-y-0.5 cursor-pointer"
        style={{ ...styles.mutedCard, borderWidth: 1, borderStyle: 'solid', boxShadow: styles.innerShadow }}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle?.(); }}
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: accentColor }} />
                <p className="text-sm font-medium" style={styles.textSecondary}>{person.role_name || 'Stakeholder'}</p>
              </div>
              <div className="text-left font-semibold tracking-tight" style={{ ...styles.textPrimary, lineHeight: 1.35 }}>
                {person.contact_name || person.name || 'Unassigned contact'}
              </div>
            </div>
          </div>
        </div>
        {isExpanded && (
          <div
            className="px-4 pb-4 border-t"
            style={{ borderColor: palette.border, backgroundColor: withAlpha(palette.cardMuted, mode === 'dark' ? 0.6 : 0.4) }}
          >
            <div className="pt-3 space-y-3 text-sm">
              {person.email && (
                <div className="flex items-center gap-2">
                  <Mail size={14} style={styles.textSecondary} />
                  <button
                    onClick={(e) => { e.stopPropagation(); onContactAction?.('email', person.email); }}
                    className="hover:underline"
                    style={{ color: palette.info }}
                  >
                    {person.email}
                  </button>
                </div>
              )}
              {person.phone && (
                <div className="flex items-center gap-2">
                  <Phone size={14} style={styles.textSecondary} />
                  <button
                    onClick={(e) => { e.stopPropagation(); onContactAction?.('phone', person.phone); }}
                    className="hover:underline"
                    style={{ color: palette.info }}
                  >
                    {person.phone}
                  </button>
                </div>
              )}
              {person.company && (
                <div className="flex items-center gap-2">
                  <Building size={14} style={styles.textSecondary} />
                  <span style={styles.textPrimary}>{person.company}</span>
                </div>
              )}
              {person.address && (
                <div className="flex items-center gap-2">
                  <MapIcon size={14} style={styles.textSecondary} />
                  <button
                    onClick={(e) => { e.stopPropagation(); onContactAction?.('address', person.address); }}
                    className="hover:underline text-left"
                    style={{ color: palette.info }}
                  >
                    {person.address}
                  </button>
                </div>
              )}
              {person.assignment_notes && (
                <div
                  className="pt-2 text-xs italic border-t"
                  style={{ ...styles.textSecondary, borderColor: palette.border }}
                >
                  Note: {person.assignment_notes}
                </div>
              )}
              <div className="flex gap-2 pt-3">
                <Button variant="primary" icon={Pencil} size="sm" onClick={(e) => { e.stopPropagation(); onEdit?.(person); }}>Edit</Button>
                <Button variant="danger" icon={Trash2} size="sm" onClick={(e) => { e.stopPropagation(); onRemove(); }}>Delete</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const AddStakeholderModal = ({
    availableContacts,
    stakeholderRoles,
    selectedContactId,
    onSelectContact,
    selectedRoleId,
    onSelectRole,
    onAdd,
    onCreateRole,
    creatingContact,
    onSetCreatingContact,
    onClose
  }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [creatingRole, setCreatingRole] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');
    const [newRoleCategory, setNewRoleCategory] = useState('internal');
    const [newRoleDescription, setNewRoleDescription] = useState('');
    const [roleError, setRoleError] = useState('');
    const [savingRole, setSavingRole] = useState(false);
    
    // New contact creation state - Controlled from parent
    const [newContactName, setNewContactName] = useState('');
    const [newContactEmail, setNewContactEmail] = useState('');
    const [newContactPhone, setNewContactPhone] = useState('');
    const [newContactCompany, setNewContactCompany] = useState('');
    const [newContactIsInternal, setNewContactIsInternal] = useState(false);  // Changed default to false (external)
    const [contactError, setContactError] = useState('');
    const [savingContact, setSavingContact] = useState(false);

    const CREATE_ROLE_OPTION = '__create_role__';

    const filteredContacts = useMemo(() => (
      availableContacts.filter((contact) => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) return true;
        return [contact.full_name, contact.email, contact.company]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(query));
      })
    ), [availableContacts, searchQuery]);

    const handleRoleSelect = (value) => {
      if (value.startsWith(CREATE_ROLE_OPTION)) {
        const [, categorySuffix] = value.split('::');
        if (categorySuffix === 'external') {
          setNewRoleCategory('external');
        } else if (categorySuffix === 'internal') {
          setNewRoleCategory('internal');
        }
        setCreatingRole(true);
        onSelectRole('');
        setRoleError('');
        return;
      }
      setCreatingRole(false);
      onSelectRole(value);
    };

    const resetRoleCreator = () => {
      setCreatingRole(false);
      setNewRoleName('');
      setNewRoleCategory('internal');
      setNewRoleDescription('');
      setRoleError('');
      setSavingRole(false);
    };

    const handleCreateRole = async () => {
      const name = newRoleName.trim();
      if (!name) {
        setRoleError('Role name is required');
        return;
      }
      try {
        setSavingRole(true);
        setRoleError('');
        const created = await onCreateRole?.({
          name,
          category: newRoleCategory,
          description: newRoleDescription.trim() || null
        });
        if (created?.id) {
          onSelectRole(created.id);
          resetRoleCreator();
        }
      } catch (error) {
        console.error('Failed to create role:', error);
        setRoleError(error.message || 'Failed to create role');
      } finally {
        setSavingRole(false);
      }
    };

    const handleCreateContact = async () => {
      const name = newContactName.trim();
      const email = newContactEmail.trim();
      
      if (!name) {
        setContactError('Contact name is required');
        return;
      }
      
      try {
        setSavingContact(true);
        setContactError('');
        
        // Create the new contact
        const newContact = await contactsService.create({
          name: name,  // Changed from full_name to name to match database column
          full_name: name,  // Keep full_name for compatibility
          email: email || null,  // Email is now optional
          phone: newContactPhone.trim() || null,
          company: newContactCompany.trim() || null,
          is_internal: newContactIsInternal,
          is_active: true
        });
        
        if (newContact?.id) {
          // Refresh available contacts to include the new one
          await loadAvailableData();
          // Select the new contact
          onSelectContact(newContact.id);
          // Reset the form
          onSetCreatingContact(false);
          setNewContactName('');
          setNewContactEmail('');
          setNewContactPhone('');
          setNewContactCompany('');
          setNewContactIsInternal(false);  // Reset to false (external) as default
        }
      } catch (error) {
        console.error('Failed to create contact:', error);
        setContactError(error.message || 'Failed to create contact');
      } finally {
        setSavingContact(false);
      }
    };

    const handleSubmit = async (event) => {
      event.preventDefault();
      if (creatingContact) {
        await handleCreateContact();
        return;
      }
      if (!selectedContactId || selectedContactId === '__add_new__' || !selectedRoleId) {
        alert('Please select both a contact and role');
        return;
      }
      await onAdd(selectedContactId, selectedRoleId);
    };

    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
        <div
          className="w-full max-w-3xl rounded-2xl border overflow-hidden"
          style={{ ...styles.card, boxShadow: '0 24px 65px rgba(15, 23, 42, 0.35)' }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: styles.card.borderColor }}>
            <h2 className="text-xl font-semibold" style={styles.textPrimary}>Add Stakeholder</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-xl transition-colors"
              style={{ color: palette.textSecondary, backgroundColor: withAlpha(palette.textSecondary, 0.08) }}
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
            <div>
              <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>Search Contacts</label>
              <div className="relative">
                <Search size={18} className="absolute left-3 top-3" style={styles.textSecondary} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by name, email, or company..."
                  className="w-full pl-10 pr-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-0"
                  style={styles.input}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium" style={styles.textPrimary}>
                  Select Contact ({filteredContacts.length} available)
                </label>
                {!creatingContact && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={Plus}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSetCreatingContact(true);
                      onSelectContact('__add_new__');
                    }}
                  >
                    Create New
                  </Button>
                )}
              </div>
              
              {creatingContact ? (
                <div className="rounded-xl border p-4 space-y-3" style={styles.mutedCard}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold" style={styles.textPrimary}>New Contact Details</h3>
                    <button
                      type="button"
                      className="text-xs underline"
                      style={styles.textSecondary}
                      onClick={() => {
                        onSetCreatingContact(false);
                        onSelectContact('');
                        setContactError('');
                      }}
                      disabled={savingContact}
                    >
                      Cancel
                    </button>
                  </div>
                    <div className="grid gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1" style={styles.textSecondary}>Full Name *</label>
                        <input
                          type="text"
                          value={newContactName}
                          onChange={(e) => setNewContactName(e.target.value)}
                          placeholder="John Doe"
                          className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                          style={styles.input}
                          disabled={savingContact}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={styles.textSecondary}>Email</label>
                        <input
                          type="email"
                          value={newContactEmail}
                          onChange={(e) => setNewContactEmail(e.target.value)}
                          placeholder="john@example.com (optional)"
                          className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                          style={styles.input}
                          disabled={savingContact}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={styles.textSecondary}>Phone</label>
                        <input
                          type="tel"
                          value={newContactPhone}
                          onChange={(e) => setNewContactPhone(e.target.value)}
                          placeholder="+1 (555) 123-4567"
                          className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                          style={styles.input}
                          disabled={savingContact}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={styles.textSecondary}>Company</label>
                        <input
                          type="text"
                          value={newContactCompany}
                          onChange={(e) => setNewContactCompany(e.target.value)}
                          placeholder="Company Name"
                          className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                          style={styles.input}
                          disabled={savingContact}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={styles.textSecondary}>Type</label>
                        <select
                          value={newContactIsInternal}
                          onChange={(e) => setNewContactIsInternal(e.target.value === 'true')}
                          className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400"
                          style={styles.input}
                          disabled={savingContact}
                        >
                          <option value="true">Internal</option>
                          <option value="false">External</option>
                        </select>
                      </div>
                    </div>
                    {contactError && (
                      <p className="text-xs text-rose-500">{contactError}</p>
                    )}
                  <button
                    type="button"
                    className="w-full py-2 px-4 rounded-xl text-white transition-colors disabled:opacity-60"
                    style={{ background: palette.accent }}
                    onClick={handleCreateContact}
                    disabled={savingContact}
                  >
                    {savingContact ? 'Creating…' : 'Create Contact'}
                  </button>
                </div>
              ) : (
                <div
                  className="rounded-xl border max-h-48 overflow-y-auto divide-y"
                  style={styles.mutedCard}
                >
                  {filteredContacts.length === 0 ? (
                    <div className="p-4 text-center">
                      <p className="text-sm" style={styles.textSecondary}>
                        {searchQuery ? 'No contacts match your search query.' : 'No available contacts to assign.'}
                      </p>
                    </div>
                  ) : (
                    filteredContacts.map((contact) => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => onSelectContact(contact.id)}
                        className="w-full text-left px-3 py-3 transition-colors"
                        style={{
                          backgroundColor: selectedContactId === contact.id
                            ? withAlpha(palette.accent, 0.12)
                            : 'transparent',
                          color: styles.textPrimary.color,
                          borderLeft: `3px solid ${contact.is_internal ? stakeholderColors.internal.border : stakeholderColors.external.border}`
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium" style={styles.textPrimary}>{contact.full_name || contact.name}</p>
                            <div className="mt-1 text-sm space-y-1" style={styles.textSecondary}>
                              {contact.email && <p>{contact.email}</p>}
                              {contact.company && <p>{contact.company}</p>}
                              {contact.phone && <p>{contact.phone}</p>}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span
                              className="px-2 py-1 rounded-full text-xs"
                              style={{
                                backgroundColor: contact.is_internal ? stakeholderColors.internal.bg : stakeholderColors.external.bg,
                                color: contact.is_internal ? stakeholderColors.internal.text : stakeholderColors.external.text
                              }}
                            >
                              {contact.is_internal ? 'Internal' : 'External'}
                            </span>
                            {selectedContactId === contact.id && <Check size={16} style={{ color: palette.info }} />}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-2" style={styles.textPrimary}>Select Role</label>
                <select
                  value={creatingRole ? `${CREATE_ROLE_OPTION}::${newRoleCategory}` : selectedRoleId}
                  onChange={(event) => handleRoleSelect(event.target.value)}
                  className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-0"
                  style={styles.input}
                  required
                >
                  <option value="">Choose a role...</option>
                  <optgroup label="Internal Roles">
                    {stakeholderRoles
                      .filter((role) => role.category === 'internal')
                      .map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    <option value={`${CREATE_ROLE_OPTION}::internal`}>+ Create new internal role</option>
                  </optgroup>
                  <optgroup label="External Roles">
                    {stakeholderRoles
                      .filter((role) => role.category === 'external')
                      .map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    <option value={`${CREATE_ROLE_OPTION}::external`}>+ Create new external role</option>
                  </optgroup>
                </select>
              </div>

              {creatingRole && (
                <div className="p-4 rounded-xl border space-y-3" style={styles.mutedCard}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold" style={styles.textPrimary}>New Role Details</h3>
                    <button
                      type="button"
                      className="text-xs underline"
                      style={styles.textSecondary}
                      onClick={() => {
                        resetRoleCreator();
                        onSelectRole('');
                      }}
                      disabled={savingRole}
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium mb-1" style={styles.textSecondary}>Role name</label>
                      <input
                        type="text"
                        value={newRoleName}
                        onChange={(event) => setNewRoleName(event.target.value)}
                        placeholder="e.g. Project Coordinator"
                        className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-0"
                        style={styles.input}
                        disabled={savingRole}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={styles.textSecondary}>Category</label>
                      <select
                        value={newRoleCategory}
                        onChange={(event) => setNewRoleCategory(event.target.value)}
                        className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-0"
                        style={styles.input}
                        disabled={savingRole}
                      >
                        <option value="internal">Internal</option>
                        <option value="external">External</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={styles.textSecondary}>Description (optional)</label>
                      <input
                        type="text"
                        value={newRoleDescription}
                        onChange={(event) => setNewRoleDescription(event.target.value)}
                        placeholder="Add quick context"
                        className="w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-0"
                        style={styles.input}
                        disabled={savingRole}
                      />
                    </div>
                  </div>
                  {roleError && (
                    <p className="text-xs text-rose-500">{roleError}</p>
                  )}
                  <button
                    type="button"
                    className="w-full py-2 px-4 rounded-xl text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ background: palette.accent }}
                    onClick={handleCreateRole}
                    disabled={savingRole}
                  >
                    {savingRole ? 'Saving…' : 'Save Role'}
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-4 border-t" style={{ borderColor: styles.card.borderColor }}>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 px-4 rounded-xl transition-colors border"
                style={{
                  backgroundColor: styles.card.backgroundColor,
                  borderColor: styles.card.borderColor,
                  color: styles.textPrimary.color
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selectedContactId || !selectedRoleId}
                className="flex-1 py-2 px-4 rounded-xl text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: palette.accent }}
              >
                Add Stakeholder
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const handleAddTodo = async (e) => {
    if (e) e.preventDefault();
    const title = newTodo.trim();
    if (!title) return;
    try {
      setAddingTodo(true);
      setTodoError('');
      const created = await projectTodosService.create(id, title);
      if (created) {
        setTodos((prev) => [...prev, created]);
        setNewTodo('');
      }
    } catch (err) {
      console.error('Failed to add todo:', err);
      setTodoError(err.message || 'Failed to add to-do');
    } finally {
      setAddingTodo(false);
    }
  };

  const handleToggleTodo = async (todo) => {
    try {
      setUpdatingTodoId(todo.id);
      setTodoError('');
      await projectTodosService.toggleCompletion(todo.id, !todo.completed);
      setTodos((prev) => prev.map((item) => (
        item.id === todo.id ? { ...item, completed: !todo.completed } : item
      )));
    } catch (err) {
      setTodoError(err.message || 'Failed to update to-do');
    } finally {
      setUpdatingTodoId(null);
    }
  };

  const handleDeleteTodo = async (todoId) => {
    try {
      setDeletingTodoId(todoId);
      setTodoError('');
      await projectTodosService.remove(todoId);
      setTodos((prev) => prev.filter((todo) => todo.id !== todoId));
    } catch (err) {
      setTodoError(err.message || 'Failed to delete to-do');
    } finally {
      setDeletingTodoId(null);
    }
  };

  const handleUpdateTodoDate = async (todoId, field, value) => {
    try {
      // Persist update
      const payload = field === 'due_by' ? { due_by: value || null } : { do_by: value || null };
      await projectTodosService.update(todoId, payload);
      // Update local state
      setTodos(prev => prev.map(t => (
        t.id === todoId
          ? { ...t, ...(field === 'due_by' ? { dueBy: value || null } : { doBy: value || null }) }
          : t
      )));
    } catch (e) {
      console.warn('Failed to update todo date', e);
    }
  };

  const handleUpdateTodoImportance = async (todoId, value) => {
    try {
      const payload = { importance: value || 'normal' };
      await projectTodosService.update(todoId, payload);
      setTodos(prev => prev.map(t => (
        t.id === todoId ? { ...t, importance: value || 'normal' } : t
      )));
    } catch (e) {
      console.warn('Failed to update todo importance', e);
    }
  };

  const handleOpenTodoDetail = (todo) => {
    navigate(`/projects/${id}/todos/${todo.id}`);
  };

  const handleReorderTodos = async (targetId) => {
    if (!dragTodoId || dragTodoId === targetId) return;
    const srcIdx = visibleTodos.findIndex(t => t.id === dragTodoId);
    let tgtIdx = visibleTodos.findIndex(t => t.id === targetId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    if (dragOverTodoPos === 'after') tgtIdx += 1;
    const reordered = [...visibleTodos];
    const [moved] = reordered.splice(srcIdx, 1);
    const insertIdx = Math.min(Math.max(tgtIdx, 0), reordered.length);
    reordered.splice(insertIdx, 0, moved);
    const items = reordered.map((t, idx) => ({ id: t.id, sort_order: idx }));
    setTodos(prev => prev.map(t => {
      const u = items.find(x => x.id === t.id);
      return u ? { ...t, sortOrder: u.sort_order } : t;
    }));
    try {
      await projectTodosService.reorder(id, items);
    } catch (_) {}
  };

  const handleNewIssue = () => {
    navigate(`/project/${id}/issues/new`);
  };

  const handleAddWireDrop = () => {
    navigate(`/wire-drops/new?project=${id}`);
  };

  const handleFullWireList = () => {
    navigate(`/wire-drops?project=${id}`);
  };

  const handlePrewireMode = () => {
    navigate(`/prewire-mode?project=${id}`);
  };

  const handleAddStakeholder = () => {
    setEditingStakeholder(null);
    setPendingContactId('');
    setPendingRoleId('');
    setCreatingNewContact(false);
    setShowAddStakeholder(true);
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors ${pageClasses}`}>
        <Loader className="w-8 h-8 animate-spin text-violet-500 dark:text-violet-300" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors ${pageClasses}`}>
        <div className="text-center space-y-4">
          <p className="text-sm text-rose-500 dark:text-rose-300">{error || 'Project not found'}</p>
          <Button onClick={() => navigate(-1)} variant="secondary" icon={ArrowLeft}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen pb-12 transition-colors duration-300 ${pageClasses}`}>
      <div className="px-3 sm:px-4 pt-2 pb-8 space-y-4 w-full">
        <div className="rounded-2xl border p-6" style={{ ...styles.card, boxShadow: styles.card.boxShadow }}>
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="uppercase text-[11px]" style={styles.subtleText}>Project</span>
              <span className="text-lg font-semibold" style={styles.textPrimary}>{project.name}</span>
            </div>
          </div>
          
          {/* Project Progress Gauges */}
          <MilestoneGaugesDisplay
            milestonePercentages={milestonePercentages}
            projectOwners={projectOwners}
            startCollapsed={false}
          />
        </div>

        {/* Lucid Chart Carousel - Show when there's a wiring diagram URL */}
        {project.wiring_diagram_url && (
          <LucidChartCarousel
            documentUrl={project.wiring_diagram_url}
            projectName={project.name}
          />
        )}

        {/* Project Details Section */}
        <div>
          <button
            onClick={() => toggleSection('details')}
            className="w-full flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md"
            style={styles.card}
          >
            <div className="flex items-center gap-3">
              <FileText size={20} style={styles.textPrimary} />
              <span className="font-medium" style={styles.textPrimary}>Project Details</span>
            </div>
            <ChevronRight
              className={`transition-transform duration-200 ${expandedSection === 'details' ? 'rotate-90' : ''}`}
              size={20}
              style={styles.textSecondary}
            />
          </button>

          {expandedSection === 'details' && (
            <div className="mt-4 rounded-2xl border p-4 space-y-4" style={styles.card}>
              {/* General Information */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold" style={styles.textPrimary}>General Information</h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium mb-1" style={styles.textSecondary}>Project Number</p>
                    <p className="text-sm" style={styles.textPrimary}>{project.project_number || 'N/A'}</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium mb-1" style={styles.textSecondary}>Status</p>
                    <p className="text-sm" style={styles.textPrimary}>{project.status || 'N/A'}</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium mb-1" style={styles.textSecondary}>Phase</p>
                    <p className="text-sm" style={styles.textPrimary}>{project.phase || 'N/A'}</p>
                  </div>

                  <div>
                    <p className="text-xs font-medium mb-1" style={styles.textSecondary}>Client</p>
                    <p className="text-sm" style={styles.textPrimary}>{project.client || 'N/A'}</p>
                  </div>
                </div>

                {project.address && (
                  <div>
                    <p className="text-xs font-medium mb-1" style={styles.textSecondary}>Address</p>
                    <p className="text-sm" style={styles.textPrimary}>{project.address}</p>
                  </div>
                )}

                {project.description && (
                  <div>
                    <p className="text-xs font-medium mb-1" style={styles.textSecondary}>Description</p>
                    <p className="text-sm" style={styles.textPrimary}>{project.description}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {project.start_date && (
                    <div>
                      <p className="text-xs font-medium mb-1" style={styles.textSecondary}>Start Date</p>
                      <p className="text-sm" style={styles.textPrimary}>{formatDate(project.start_date)}</p>
                    </div>
                  )}

                  {project.end_date && (
                    <div>
                      <p className="text-xs font-medium mb-1" style={styles.textSecondary}>End Date</p>
                      <p className="text-sm" style={styles.textPrimary}>{formatDate(project.end_date)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Permits Section */}
              <div className="border-t pt-4" style={{ borderColor: palette.border }}>
                <h3 className="text-sm font-semibold mb-3" style={styles.textPrimary}>Building Permits</h3>
                <ProjectPermits projectId={id} />
              </div>
            </div>
          )}
        </div>

        <div>
          <button
            onClick={() => toggleSection('wireDrops')}
            className="w-full flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md"
            style={styles.card}
          >
            <div className="flex items-center gap-3">
              <Zap size={20} style={styles.textPrimary} />
              <span className="font-medium" style={styles.textPrimary}>Wire Drops</span>
            </div>
            <div className="flex items-center gap-3">
              {wireDrops.length > 0 && (
                <span className="px-2 py-0.5 text-xs rounded-full" style={styles.badge}>{wireDrops.length}</span>
              )}
              <ChevronRight
                size={20}
                className={`transition-transform duration-200 ${expandedSection === 'wireDrops' ? 'rotate-90' : ''}`}
                style={styles.textSecondary}
              />
            </div>
          </button>

          {expandedSection === 'wireDrops' && (
            <div className="mt-3 p-4 rounded-2xl border space-y-4" style={{ ...styles.card, boxShadow: styles.innerShadow }}>
              <div className="relative">
                <Search size={18} className="absolute left-3 top-3" style={styles.textSecondary} />
                <input
                  type="text"
                  value={wireDropQuery}
                  onChange={(event) => setWireDropQuery(event.target.value)}
                  placeholder="Search wire drops..."
                  className="w-full pl-10 pr-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-0"
                  style={styles.input}
                />
              </div>

              <div className="flex gap-2">
                <Button variant="primary" icon={Plus} onClick={handleAddWireDrop} style={{ flex: '1 1 33%' }}>
                  Add Wire Drop
                </Button>
                <Button variant="secondary" icon={Printer} onClick={handlePrewireMode} style={{ flex: '1 1 33%' }}>
                  Prewire Mode
                </Button>
                <Button variant="secondary" onClick={handleFullWireList} style={{ flex: '1 1 33%' }}>
                  Full List
                </Button>
              </div>

              {filteredWireDrops.length === 0 ? (
                <p className="text-sm" style={styles.textSecondary}>
                  {wireDropQuery ? 'No matching wire drops.' : 'No wire drops yet.'}
                </p>
              ) : (
                (() => {
                  // Build a map to track drop type counts per room for naming
                  const roomDropTypeCounts = {};
                  const dropNumbers = {};
                  
                  // First pass: count drops of each type per room
                  filteredWireDrops.forEach((drop) => {
                    const roomName = drop.project_room?.name || drop.room_name || 'Unknown Room';
                    const dropType = drop.drop_type || 'Drop';
                    const key = `${roomName}:::${dropType}`;
                    
                    if (!roomDropTypeCounts[key]) {
                      roomDropTypeCounts[key] = [];
                    }
                    roomDropTypeCounts[key].push(drop.id);
                  });
                  
                  // Second pass: assign numbers to each drop
                  filteredWireDrops.forEach((drop) => {
                    const roomName = drop.project_room?.name || drop.room_name || 'Unknown Room';
                    const dropType = drop.drop_type || 'Drop';
                    const key = `${roomName}:::${dropType}`;
                    
                    const dropsOfSameType = roomDropTypeCounts[key];
                    const dropIndex = dropsOfSameType.indexOf(drop.id);
                    
                    // Only add number if there's more than one drop of this type in the room
                    dropNumbers[drop.id] = dropsOfSameType.length > 1 ? dropIndex + 1 : 0;
                  });
                  
                  return filteredWireDrops.map((drop) => {
                    // Get the drop number for this drop
                    const dropNumber = dropNumbers[drop.id];
                    const roomName = drop.project_room?.name || drop.room_name || 'Unknown Room';
                    const dropType = drop.drop_type || 'Drop';
                    
                    // Calculate completion based on 3-stage system using wire_drop_stages
                    const stages = drop.wire_drop_stages || [];
                  
                  const prewireStage = stages.find(s => s.stage_type === 'prewire');
                  const trimOutStage = stages.find(s => s.stage_type === 'trim_out');
                  const commissionStage = stages.find(s => s.stage_type === 'commission');
                  
                  const prewireComplete = Boolean(prewireStage?.completed);
                  const installComplete = Boolean(trimOutStage?.completed);
                  const commissionComplete = Boolean(commissionStage?.completed);
                  
                  // Calculate percentage (33.33% per stage for 3 stages)
                  let completion = 0;
                  if (prewireComplete) completion += 33.33;
                  if (installComplete) completion += 33.33;
                  if (commissionComplete) completion += 33.34;
                  completion = Math.round(completion);

                  const shapeLetter = getWireDropBadgeLetter(drop);
                  const shapeColor = getWireDropBadgeColor(drop);
                  const shapeTextColor = getWireDropBadgeTextColor(shapeColor);
                  
                  return (
                    <button
                      key={drop.id}
                      onClick={() => navigate(`/wire-drops/${drop.id}`)}
                      className="w-full text-left p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                      style={styles.mutedCard}
                    >
                      <div className="flex items-center gap-4">
                        {/* Large colored circle with letter */}
                        <div className="flex-shrink-0">
                          <div 
                            className="w-16 h-16 rounded-full flex items-center justify-center shadow-lg"
                            style={{
                              backgroundColor: shapeColor,
                              border: '2px solid rgba(0,0,0,0.1)',
                              color: shapeTextColor
                            }}
                          >
                            <span className="text-2xl font-bold">
                              {shapeLetter}
                            </span>
                          </div>
                        </div>
                        
                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                          {/* Primary: Wire Drop Name */}
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex-1 min-w-0">
                              <p className="text-lg font-semibold truncate" style={styles.textPrimary}>
                                {drop.drop_name && drop.drop_name !== 'IP' && drop.drop_name !== drop.drop_type
                                  ? drop.drop_name
                                  : dropNumber > 0
                                    ? `${roomName} ${dropType} ${dropNumber}`
                                    : `${roomName} ${dropType}`}
                              </p>
                              {/* Subtitle with room */}
                              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                {drop.project_room?.name || drop.room_name || 'Unassigned Room'}
                              </p>
                            </div>
                            {/* UID badge on the right */}
                            <span className="text-xs px-2 py-1 rounded font-mono bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 flex-shrink-0 whitespace-nowrap">
                              {drop.uid || 'NO-UID'}
                            </span>
                          </div>
                          
                          {/* Drop type and Wire type badges */}
                          <div className="flex items-center gap-2 mt-2">
                            {drop.drop_type && (
                              <span className="px-3 py-1 text-xs rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold">
                                {drop.drop_type}
                              </span>
                            )}
                            {drop.wire_type && (
                              <span 
                                className="px-3 py-1 text-xs rounded-full font-semibold text-white"
                                style={{
                                  backgroundColor: shapeColor,
                                  opacity: 0.9
                                }}
                              >
                                {drop.wire_type}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <div className="flex gap-1">
                          <span 
                            className="px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide" 
                            style={prewireComplete 
                              ? { backgroundColor: withAlpha(palette.success, 0.18), color: palette.success }
                              : { backgroundColor: withAlpha(palette.warning, 0.18), color: palette.warning }
                            }
                          >
                            Prewire
                          </span>
                          <span 
                            className="px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide" 
                            style={installComplete
                              ? { backgroundColor: withAlpha(palette.success, 0.18), color: palette.success }
                              : { backgroundColor: withAlpha(palette.warning, 0.18), color: palette.warning }
                            }
                          >
                            Install
                          </span>
                          <span 
                            className="px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide" 
                            style={commissionComplete
                              ? { backgroundColor: withAlpha(palette.success, 0.18), color: palette.success }
                              : { backgroundColor: withAlpha(palette.warning, 0.18), color: palette.warning }
                            }
                          >
                            Comm
                          </span>
                        </div>
                        <span className={`font-bold text-sm ${
                          completion === 100 ? 'text-green-600 dark:text-green-400' :
                          completion >= 67 ? 'text-blue-600 dark:text-blue-400' :
                          completion >= 33 ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-gray-600 dark:text-gray-400'
                        }`}>
                          {completion}%
                        </span>
                      </div>
                    </button>
                  );
                })
                })()
              )}
            </div>
          )}
        </div>

        <div>
          <button
            onClick={() => toggleSection('todos')}
            className="w-full flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md"
            style={styles.card}
          >
            <div className="flex items-center gap-3">
              <ListTodo size={20} style={styles.textPrimary} />
              <span className="font-medium" style={styles.textPrimary}>To-do List</span>
            </div>
            <div className="flex items-center gap-3">
              {openTodos.length > 0 && (
                <span className="px-2 py-0.5 text-xs rounded-full" style={{ backgroundColor: withAlpha(palette.warning, 0.18), color: palette.warning }}>
                  {openTodos.length}
                </span>
              )}
              <ChevronRight
                size={20}
                className={`transition-transform duration-200 ${expandedSection === 'todos' ? 'rotate-90' : ''}`}
                style={styles.textSecondary}
              />
            </div>
          </button>

          {expandedSection === 'todos' && (
            <div className="mt-3 p-4 rounded-2xl border space-y-3" style={{ ...styles.card, boxShadow: styles.innerShadow }}>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newTodo}
                  onChange={(event) => setNewTodo(event.target.value)}
                  placeholder="Add a new task"
                  className="flex-1 px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-0"
                  style={styles.input}
                />
                <Button
                  onClick={handleAddTodo}
                  icon={Plus}
                  size="sm"
                  disabled={addingTodo || !newTodo.trim()}
                  loading={addingTodo}
                >
                  Add
                </Button>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span style={styles.textSecondary}>
                  {visibleTodos.length} item{visibleTodos.length === 1 ? '' : 's'} shown • {todos.length} total
                </span>
                <button
                  onClick={() => setShowCompletedTodos((prev) => !prev)}
                  className="text-xs underline"
                  style={styles.textSecondary}
                >
                  {showCompletedTodos ? 'Hide completed' : 'Show completed'}
                </button>
              </div>
              {todoError && <p className="text-sm" style={{ color: palette.danger }}>{todoError}</p>}
              {visibleTodos.length === 0 ? (
                <p className="text-sm" style={styles.textSecondary}>
                  {showCompletedTodos ? 'Nothing here yet.' : 'All tasks complete.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {visibleTodos.map((todo) => {
                    const toggling = updatingTodoId === todo.id;
                    const deleting = deletingTodoId === todo.id;
                    return (
                      <div
                        key={todo.id}
                        className="p-4 rounded-xl border todo-card cursor-pointer hover:shadow-md transition-shadow"
                        draggable
                        onClick={() => handleOpenTodoDetail(todo)}
                        onDragStart={(e) => {
                          setDragTodoId(todo.id);
                          const card = e.currentTarget.closest('.todo-card');
                          if (card && e.dataTransfer) {
                            try {
                              const clone = card.cloneNode(true);
                              clone.style.position = 'absolute';
                              clone.style.top = '-9999px';
                              clone.style.left = '-9999px';
                              clone.style.width = `${card.offsetWidth}px`;
                              document.body.appendChild(clone);
                              e.dataTransfer.setDragImage(clone, Math.min(24, card.offsetWidth / 2), 16);
                              dragImageElRef.current = clone;
                            } catch (_) {}
                          }
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const midY = rect.top + rect.height / 2;
                          setDragOverTodoId(todo.id);
                          setDragOverTodoPos(e.clientY < midY ? 'before' : 'after');
                        }}
                        onDragEnter={() => setDragOverTodoId(todo.id)}
                        onDragLeave={() => setDragOverTodoId(null)}
                        onDragEnd={() => {
                          setDragTodoId(null);
                          setDragOverTodoId(null);
                          if (dragImageElRef.current) {
                            try { document.body.removeChild(dragImageElRef.current); } catch (_) {}
                            dragImageElRef.current = null;
                          }
                        }}
                        onDrop={(e) => { e.stopPropagation(); handleReorderTodos(todo.id); setDragOverTodoId(null); }}
                        style={{
                          ...styles.mutedCard,
                          opacity: dragTodoId === todo.id ? 0.6 : 1
                        }}
                      >
                        {dragOverTodoId === todo.id && dragOverTodoPos === 'before' && (
                          <div className="absolute left-0 right-0 -mt-4 h-0.5 rounded" style={{ backgroundColor: palette.accent }} />
                        )}
                        
                        {/* Title row at top */}
                        <div className="flex items-center mb-3">
                          <div className="flex items-center gap-2 flex-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleToggleTodo(todo); }}
                              disabled={toggling}
                              className="p-1"
                            >
                              {todo.completed ? (
                                <CheckSquare size={18} style={{ color: palette.success }} />
                              ) : (
                                <Square size={18} style={styles.textSecondary} />
                              )}
                            </button>
                            <span
                              className="flex-1 text-base font-medium"
                              style={{
                                ...styles.textPrimary,
                                textDecoration: todo.completed ? 'line-through' : 'none',
                                opacity: todo.completed ? 0.6 : 1
                              }}
                            >
                              {todo.title}
                            </span>
                          </div>
                        </div>
                        
                        {/* Controls row at bottom */}
                        <div className="flex items-center gap-2 text-xs">
                          <label className="flex items-center gap-1" title="Due Date">
                            <span style={styles.subtleText}>Due:</span>
                            <DateInput
                              value={todo.dueBy ? String(todo.dueBy).substring(0,10) : ''}
                              onChange={(e) => { e.stopPropagation(); handleUpdateTodoDate(todo.id, 'due_by', e.target.value); }}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs"
                              style={{ minWidth: '100px' }}
                            />
                          </label>
                          <label className="flex items-center gap-1" title="Do Date">
                            <span style={styles.subtleText}>Do:</span>
                            <DateInput
                              value={todo.doBy ? String(todo.doBy).substring(0,10) : ''}
                              onChange={(e) => { e.stopPropagation(); handleUpdateTodoDate(todo.id, 'do_by', e.target.value); }}
                              onClick={(e) => e.stopPropagation()}
                              className="text-xs"
                              style={{ minWidth: '100px' }}
                            />
                          </label>
                          <select
                            value={todo.importance || 'normal'}
                            onChange={(e) => { e.stopPropagation(); handleUpdateTodoImportance(todo.id, e.target.value); }}
                            onClick={(e) => e.stopPropagation()}
                            className="px-2 py-1 rounded-lg border text-xs focus:outline-none focus:ring-1 focus:ring-violet-400"
                            style={{
                              ...styles.input,
                              color: importanceColors[(todo.importance || 'normal').toLowerCase()] || styles.input.color
                            }}
                            title="Importance"
                          >
                            <option value="low">Low</option>
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                          </select>
                        </div>
                        
                       {dragOverTodoId === todo.id && dragOverTodoPos === 'after' && (
                         <div className="absolute left-0 right-0 -mb-4 h-0.5 rounded" style={{ backgroundColor: palette.accent }} />
                       )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <IssuesSection
          projectId={id}
          issues={issues}
          openIssues={openIssues}
          showResolvedIssues={showResolvedIssues}
          setShowResolvedIssues={setShowResolvedIssues}
          expandedSection={expandedSection}
          toggleSection={toggleSection}
          handleNewIssue={handleNewIssue}
          styles={styles}
          palette={palette}
          withAlpha={withAlpha}
          formatDate={formatDate}
          statusChipStyle={statusChipStyle}
        />

        <div>
          <button
            onClick={() => toggleSection('people')}
            className="w-full flex items-center justify-between rounded-2xl border p-4 transition-all duration-200 hover:shadow-md"
            style={styles.card}
          >
            <div className="flex items-center gap-3">
              <Users size={20} style={styles.textPrimary} />
              <span className="font-medium" style={styles.textPrimary}>Stakeholders</span>
            </div>
            <div className="flex items-center gap-3">
              {peopleCount > 0 && (
                <span className="px-2 py-0.5 text-xs rounded-full" style={{ backgroundColor: withAlpha(palette.info, 0.18), color: palette.info }}>
                  {peopleCount}
                </span>
              )}
              <ChevronRight
                size={20}
                className={`transition-transform duration-200 ${expandedSection === 'people' ? 'rotate-90' : ''}`}
                style={styles.textSecondary}
              />
            </div>
          </button>

          {expandedSection === 'people' && (
            <div className="mt-3 p-4 rounded-2xl border space-y-5" style={{ ...styles.card, boxShadow: styles.innerShadow }}>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm" style={styles.textSecondary}>
                  Keep every project role aligned across internal and external teams.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    icon={Plus}
                    onClick={handleAddStakeholder}
                  >
                    Add Stakeholder
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold tracking-wide uppercase" style={styles.textSecondary}>
                      Internal Team
                    </h4>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: withAlpha(palette.info, 0.12), color: palette.info }}>
                      {stakeholders.internal?.length || 0}
                    </span>
                  </div>
                  {stakeholders.internal?.length ? (
                    stakeholders.internal.map((person, index) => {
                      const cardKey = getStakeholderKey(person) || `internal-${index}`;
                      const assignmentId = person?.assignment_id || person?.id;
                      return (
                        <StakeholderCard
                          key={cardKey}
                          person={person}
                          category="internal"
                          isExpanded={expandedContact === cardKey}
                          onToggle={() => handleToggleContact(cardKey)}
                          onRemove={() => handleRemoveStakeholder(assignmentId, cardKey, person?.contact_name || person?.name)}
                          onEdit={() => handleEditStakeholder(person)}
                          onContactAction={handleContactAction}
                        />
                      );
                    })
                  ) : (
                    <div className="px-4 py-3 rounded-xl border" style={styles.mutedCard}>
                      <p className="text-sm" style={styles.textSecondary}>No internal stakeholders yet.</p>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold tracking-wide uppercase" style={styles.textSecondary}>
                      External Partners
                    </h4>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: withAlpha(palette.success, 0.12), color: palette.success }}>
                      {stakeholders.external?.length || 0}
                    </span>
                  </div>
                  {stakeholders.external?.length ? (
                    stakeholders.external.map((person, index) => {
                      const cardKey = getStakeholderKey(person) || `external-${index}`;
                      const assignmentId = person?.assignment_id || person?.id;
                      return (
                        <StakeholderCard
                          key={cardKey}
                          person={person}
                          category="external"
                          isExpanded={expandedContact === cardKey}
                          onToggle={() => handleToggleContact(cardKey)}
                          onRemove={() => handleRemoveStakeholder(assignmentId, cardKey, person?.contact_name || person?.name)}
                          onEdit={() => handleEditStakeholder(person)}
                          onContactAction={handleContactAction}
                        />
                      );
                    })
                  ) : (
                    <div className="px-4 py-3 rounded-xl border" style={styles.mutedCard}>
                      <p className="text-sm" style={styles.textSecondary}>No external stakeholders yet.</p>
                    </div>
                  )}
                </div>
              </div>

      {showAddStakeholder && (
        <AddStakeholderModal
          availableContacts={availableContactsForModal}
          stakeholderRoles={stakeholderRoles}
          selectedContactId={pendingContactId}
          onSelectContact={setPendingContactId}
          selectedRoleId={pendingRoleId}
          onSelectRole={setPendingRoleId}
          onAdd={handleStakeholderAdded}
          onCreateRole={handleCreateRole}
          creatingContact={creatingNewContact}
          onSetCreatingContact={setCreatingNewContact}
          onClose={() => {
            setShowAddStakeholder(false);
            setPendingContactId('');
            setPendingRoleId('');
            setEditingStakeholder(null);
            setCreatingNewContact(false);
          }}
          isEditing={Boolean(editingStakeholder)}
        />
      )}
            </div>
          )}
        </div>

        {/* Project Links Section */}
        <ProjectLinks
          project={project}
          projectId={id}
          styles={styles}
          palette={palette}
          withAlpha={withAlpha}
          openLink={openLink}
        />
      </div>

      {showEquipmentManager && (
        <EquipmentManager
          projectId={id}
          onClose={() => setShowEquipmentManager(false)}
        />
      )}

      {showSecureDataManager && (
        <SecureDataManager
          projectId={id}
          onClose={() => setShowSecureDataManager(false)}
        />
      )}

    </div>
  );
};

export default ProjectDetailView;
