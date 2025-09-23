import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from './contexts/AuthContext';
import { supabase, uploadPublicImage, toThumb, slugifySegment } from './lib/supabase';
import { graphUploadViaApi } from './lib/onedrive';
import { enqueueUpload, listUploads, removeUpload } from './lib/offline';
import { compressImage } from './lib/images';
import {
  Camera, ArrowLeft, Calendar, FileText, Users, Plus,
  Moon, Sun, Upload,
  Zap, AlertCircle, QrCode,
  Folder, Image, X, ChevronRight, Edit2,
  Search, Eye, EyeOff,
  Package, Mail, FolderOpen,
  BarChart, Send, Save, ExternalLink, Maximize,
  ListTodo, CheckSquare, Square, Trash2
} from 'lucide-react';
import QRCode from 'qrcode';
import StakeholderSlots from './components/StakeholderSlots';

const generateWireDropUid = () => {
  let raw = '';
  const hasWindow = typeof window !== 'undefined';
  if (hasWindow && window.crypto?.randomUUID) {
    raw = window.crypto.randomUUID();
  } else if (hasWindow && window.crypto?.getRandomValues) {
    const array = new Uint32Array(4);
    window.crypto.getRandomValues(array);
    raw = Array.from(array).map((v) => v.toString(16).padStart(8, '0')).join('');
  } else {
    raw = `${Date.now()}-${Math.random()}`;
  }
  raw = raw.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `WD-${raw.slice(0, 12)}`;
};

const splitCsvLine = (line = '') => {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

const parseWireDropCsv = (text) => {
  const lines = (text || '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map(h => h.toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    if (values.length === 1 && !values[0]) continue;
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = values[idx] || '';
    });
    rows.push(record);
  }
  return rows;
};

const getInitialContactForm = () => ({
  firstName: '',
  lastName: '',
  role: '',
  email: '',
  phone: '',
  address: '',
  company: '',
  report: false
});

const App = () => {
  const { user } = useAuth();
  const [darkMode, setDarkMode] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [userRole, setUserRole] = useState('technician'); // 'technician' or 'pm'
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [selectedWireDrop, setSelectedWireDrop] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showResolvedIssues, setShowResolvedIssues] = useState(false);
  const [expandedSections, setExpandedSections] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMyProjects, setViewMyProjects] = useState(true);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [pendingSection, setPendingSection] = useState(null);
  const selectedProjectId = selectedProject?.id;
  // Microsoft Calendar state
  const [events, setEvents] = useState([])
  const [eventsError, setEventsError] = useState('')
  const [calendarReady, setCalendarReady] = useState(false)

  const isoDayRange = () => {
    const start = new Date()
    start.setHours(0,0,0,0)
    const end = new Date()
    end.setHours(23,59,59,999)
    return { start: start.toISOString(), end: end.toISOString() }
  }

  const loadTodayEvents = useCallback(async () => {
    try {
      setEventsError('')
      const { data: sessionData } = await supabase.auth.getSession()
      const access = sessionData?.session?.provider_token
      if (!access) { setCalendarReady(false); return }
      setCalendarReady(true)
      const { start, end } = isoDayRange()
      const url = `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${encodeURIComponent(start)}&endDateTime=${encodeURIComponent(end)}&$orderby=start/dateTime&$top=5`
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      const resp = await fetch(url, {
        headers: { 
          Authorization: `Bearer ${access}`,
          'Prefer': `outlook.timezone="${tz}"`
        }
      })
      if (!resp.ok) {
        const text = await resp.text()
        setEventsError(text)
        return
      }
      const json = await resp.json()
      const mapped = (json.value || []).map(ev => ({
        id: ev.id,
        subject: ev.subject || 'Event',
        start: ev.start?.dateTime,
        end: ev.end?.dateTime,
        location: ev.location?.displayName || ''
      }))
      setEvents(mapped)
    } catch (e) {
      setEventsError(e.message)
    }
  }, [])

  useEffect(() => { loadTodayEvents() }, [loadTodayEvents])
  // Process any offline uploads when we come online
  useEffect(() => {
    const onOnline = async () => {
      try {
        const items = await listUploads()
        for (const it of items) {
          try {
            // Recreate a File from stored parts
            const file = new File([it.blob], it.filename, { type: it.contentType || 'image/jpeg' })
            const url = await graphUploadViaApi({ rootUrl: it.rootUrl, subPath: it.subPath, file })
            if (it.update?.type === 'wire_drop' && it.update?.field && it.update?.id) {
              await supabase.from('wire_drops').update({ [it.update.field]: url }).eq('id', it.update.id)
            } else if (it.update?.type === 'issue_photo' && it.update?.issueId) {
              await supabase.from('issue_photos').insert([{ issue_id: it.update.issueId, url }])
            }
            await removeUpload(it.id)
          } catch (_) {
            // keep for next round
          }
        }
      } catch (_) {}
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])
  
  // Time tracking state
  const [, setTimeLogs] = useState([]);
  const [activeCheckIns, setActiveCheckIns] = useState({});
  
  // Projects state (now loaded from Supabase)
  const [projects, setProjects] = useState([]);
  // Wire types lookup
  const [wireTypes, setWireTypes] = useState([]);
  const [stakeholderRoles, setStakeholderRoles] = useState([]);
  const [stakeholderDefaults, setStakeholderDefaults] = useState([]);
  const [projectStakeholders, setProjectStakeholders] = useState({});
  const [customSlots, setCustomSlots] = useState({ external: [], internal: [] });

  // Map DB row (snake_case) to UI shape (camelCase)
  const mapProject = useCallback((row) => ({
    id: row.id,
    name: row.name,
    client: row.client,
    address: row.address,
    phase: row.phase,
    startDate: row.start_date,
    endDate: row.end_date,
    assignedTechnician: row.assigned_technician || null,
    wiringDiagramUrl: row.wiring_diagram_url,
    portalProposalUrl: row.portal_proposal_url,
    oneDrivePhotos: row.one_drive_photos,
    oneDriveFiles: row.one_drive_files,
    oneDriveProcurement: row.one_drive_procurement,
    wireDrops: [],
    todos: []
  }), []);

  const loadWireTypes = async () => {
    try {
      if (!supabase) return;
      const { data, error } = await supabase
        .from('wire_types')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true });
      if (error) return;
      if (data && data.length) {
        setWireTypes(data.map(r => r.name));
      } else {
        setWireTypes(['CAT6', 'CAT6A', 'Fiber', 'Coax', 'Power']);
      }
    } catch (_) {}
  };

  useEffect(() => { loadWireTypes(); }, []);
  // Issues state (now loaded from Supabase)
  const [issues, setIssues] = useState([]);

  // People state (from Supabase)
  const [contacts, setContacts] = useState([]);
  const [contactsTableSupportsProject, setContactsTableSupportsProject] = useState(true);
  const [allContacts, setAllContacts] = useState([]);

  const loadContacts = useCallback(async (projectId) => {
    if (!supabase) return [];
    try {
      let query = supabase
        .from('contacts')
        .select('*');
      if (projectId && contactsTableSupportsProject) {
        query = query.eq('project_id', projectId);
      }
      const { data, error } = await query.order('created_at', { ascending: true });
      if (error) {
        const message = String(error.message || '').toLowerCase();
        if (message.includes('project_id')) {
          setContactsTableSupportsProject(false);
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('contacts')
            .select('*')
            .order('created_at', { ascending: true });
          if (fallbackError) throw fallbackError;
          const rows = fallbackData ? fallbackData.sort((a, b) => (a.name || '').localeCompare(b.name || '')) : [];
          setContacts(rows);
          return rows;
        }
        throw error;
      }
      const rows = data ? data.sort((a, b) => (a.name || '').localeCompare(b.name || '')) : [];
      setContacts(rows);
      return rows;
    } catch (err) {
      console.error('loadContacts failed', err);
      return [];
    }
  }, [contactsTableSupportsProject]);

  // Load all contacts across all projects for global search/assignment
  const loadAllContacts = useCallback(async () => {
    if (!supabase) return [];
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*');
      if (error) throw error;
      const rows = (data || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setAllContacts(rows);
      return rows;
    } catch (err) {
      console.error('loadAllContacts failed', err);
      return [];
    }
  }, []);

  useEffect(() => { loadAllContacts(); }, [loadAllContacts]);

  // Removed legacy loadContactIssues helper (no longer used)

  const loadStakeholderRoles = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('stakeholder_roles')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      setStakeholderRoles(data || []);
    } catch (err) {
      console.error('loadStakeholderRoles failed', err);
    }
  }, []);

  const loadStakeholderDefaults = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('stakeholder_defaults')
        .select('*');
      if (error) throw error;
      setStakeholderDefaults(data || []);
    } catch (err) {
      console.error('loadStakeholderDefaults failed', err);
    }
  }, []);

  const ensureProjectContact = useCallback(async ({ projectId, roleId, fullName, email, isInternal = false, isPrimary = false }) => {
    if (!supabase) return null;
    const trimmedEmail = (email || '').trim();
    try {
      let existing = null;
      if (trimmedEmail) {
        const { data, error } = await supabase
          .from('contacts')
          .select('*')
          .eq('email', trimmedEmail)
          .maybeSingle();
        if (!error) existing = data;
      }

      if (!existing && fullName) {
        const { data, error } = await supabase
          .from('contacts')
          .select('*')
          .eq('name', fullName)
          .maybeSingle();
        if (!error) existing = data;
      }

      if (!existing) {
        const payload = {
          name: fullName || trimmedEmail || 'Stakeholder',
          email: trimmedEmail || null,
          role: null,
          report: false,
          stakeholder_role_id: roleId,
          is_internal: isInternal,
          is_primary: isPrimary
        };
        // Include project_id if the contacts table supports it
        if (contactsTableSupportsProject && projectId) {
          payload.project_id = projectId;
        }
        const { data, error } = await supabase
          .from('contacts')
          .insert([payload])
          .select('*')
          .single();
        if (error) throw error;
        existing = data;
      } else {
        const updates = {
          stakeholder_role_id: roleId,
          is_internal: isInternal,
          is_primary: isPrimary || existing.is_primary
        };
        if (fullName && fullName.trim() && fullName !== existing.name) updates.name = fullName.trim();
        if (trimmedEmail && trimmedEmail !== existing.email) updates.email = trimmedEmail;
        const { data, error } = await supabase
          .from('contacts')
          .update(updates)
          .eq('id', existing.id)
          .select('*')
          .single();
        if (error) throw error;
        existing = data;
      }

      await loadContacts(projectId || null);
      await loadAllContacts();
      return existing;
    } catch (err) {
      console.error('ensureProjectContact failed', err);
      return null;
    }
  }, [loadContacts, loadAllContacts, contactsTableSupportsProject]);

  // Helper function to map role names to predefined slot IDs
  const getSlotIdForRole = useCallback((roleName, category) => {
    if (!roleName) return null;
    
    console.log(`getSlotIdForRole: mapping "${roleName}" (${category}) to slot ID`);

    // Create dynamic slot ID based on role name
    const dynamicSlotId = `role-${roleName.toLowerCase().replace(/\s+/g, '-')}`;
    console.log('→ mapped to dynamic slot:', dynamicSlotId);
    return dynamicSlotId;
  }, []);

  // Generate a safe slug from a title for stable custom slot IDs
  const slugify = useCallback((str) => {
    return (str || '')
      .toString()
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }, []);

  // Map role to slot ID using dynamic slot IDs
  const getSlotIdForRoleOnly = useCallback((category, roleName) => {
    if (!roleName) return null;
    return getSlotIdForRole(roleName, category);
  }, [getSlotIdForRole]);

  // Clean up any auto-generated custom slots that shouldn't exist
  const clearUnwantedCustomSlots = useCallback(() => {
    setCustomSlots({ external: [], internal: [] });
  }, []);

  const loadProjectStakeholders = useCallback(async (projectId) => {
    if (!supabase || !projectId) return;
    try {
      console.log('Loading stakeholders for project:', projectId);
      const [{ data: internalRows, error: internalErr }, { data: externalRows, error: externalErr }] = await Promise.all([
        supabase
          .from('project_internal_stakeholders')
          .select('id, project_id, role_id, contact_id, full_name, email, profile_id, is_primary, created_at, contacts(*), stakeholder_roles(*)')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true }),
        supabase
          .from('project_external_stakeholders')
          .select('id, project_id, role_id, contact_id, is_primary, created_at, contacts(*), stakeholder_roles(*)')
          .eq('project_id', projectId)
          .order('created_at', { ascending: true })
      ]);

      if (internalErr) {
        console.error('Internal stakeholders query error:', internalErr);
        throw internalErr;
      }
      if (externalErr) {
        console.error('External stakeholders query error:', externalErr);
        throw externalErr;
      }

      console.log('Raw internal rows:', internalRows);
      console.log('Raw external rows:', externalRows);

      const internal = (internalRows || []).map(row => {
        const role = row.stakeholder_roles || (stakeholderRoles.find(r => r.id === row.role_id) || null);
        const contact = row.contacts || null;
        // Determine slot; only use existing predefined or custom slots - don't auto-create
        const slotId = getSlotIdForRoleOnly('internal', role?.name);

        return {
          id: row.id,
          roleId: row.role_id,
          role,
          isPrimary: row.is_primary,
          contactId: contact?.id || row.contact_id || null,
          contact: contact || null,
          slotId,
          // Contact card fields (fallback to row data if contact missing)
          first_name: contact?.first_name || (row.full_name ? row.full_name.split(' ')[0] : ''),
          last_name: contact?.last_name || (row.full_name ? row.full_name.split(' ').slice(1).join(' ') : ''),
          email: contact?.email || row.email || '',
          phone: contact?.phone || '',
          address: contact?.address || '',
          status: row.is_primary ? 'Primary' : 'Internal'
        };
      });

      const external = (externalRows || []).map(row => {
        // Determine slot; only use existing predefined or custom slots - don't auto-create
        const slotId = getSlotIdForRoleOnly('external', row.stakeholder_roles?.name);
        const contact = row.contacts || null;
        
        return {
          id: row.id,
          roleId: row.role_id,
          role: row.stakeholder_roles || null,
          contactId: row.contact_id,
          isPrimary: row.is_primary,
          contact: contact,
          slotId: slotId,
          // Map to contact card format
          first_name: contact?.first_name || '',
          last_name: contact?.last_name || '',
          email: contact?.email || '',
          phone: contact?.phone || '',
          address: contact?.address || '',
          status: row.is_primary ? 'Primary' : ''
        };
      });

      setProjectStakeholders(prev => ({ ...prev, [projectId]: { internal, external } }));
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, internalStakeholders: internal, externalStakeholders: external } : p));
      setSelectedProject(prev => prev && prev.id === projectId ? { ...prev, internalStakeholders: internal, externalStakeholders: external } : prev);
      
      // Debug log
      console.log('Loaded stakeholders for project:', projectId, { internal: internal.length, external: external.length });
      internal.forEach(s => console.log('Internal:', s.role?.name, 'slotId:', s.slotId, 'name:', s.first_name, s.last_name));
      external.forEach(s => console.log('External:', s.role?.name, 'slotId:', s.slotId, 'name:', s.first_name, s.last_name));
    } catch (err) {
      console.error('loadProjectStakeholders failed', err);
    }
  }, [stakeholderRoles, allContacts, getSlotIdForRoleOnly]);

  const applyDefaultStakeholders = useCallback(async (projectId) => {
    if (!supabase || !projectId) return;
    try {
      const defaults = (stakeholderDefaults || []).filter(d => d.active !== false);

      for (const def of defaults) {
        if (def.is_internal) {
          // Ensure a contact exists, then link by contact_id (fallback to name/email if contact_id not supported)
          const contact = await ensureProjectContact({
            projectId,
            roleId: def.role_id,
            fullName: def.full_name,
            email: def.email,
            isInternal: true,
            isPrimary: true
          });
          if (contact?.id) {
            try {
              await supabase
                .from('project_internal_stakeholders')
                .upsert([
                  {
                    project_id: projectId,
                    role_id: def.role_id,
                    contact_id: contact.id,
                    is_primary: true
                  }
                ], { onConflict: 'project_id,role_id' });
            } catch (e) {
              const msg = String(e?.message || e?.error?.message || '').toLowerCase();
              // Fallback if contact_id column doesn't exist yet
              if (msg.includes('contact_id')) {
                await supabase
                  .from('project_internal_stakeholders')
                  .upsert([
                    {
                      project_id: projectId,
                      role_id: def.role_id,
                      full_name: def.full_name || contact.name || null,
                      email: def.email || contact.email || null,
                      is_primary: true
                    }
                  ], { onConflict: 'project_id,role_id' });
              } else {
                throw e;
              }
            }
          }
        } else {
          const contact = await ensureProjectContact({
            projectId,
            roleId: def.role_id,
            fullName: def.full_name,
            email: def.email,
            isInternal: false,
            isPrimary: true
          });
          if (contact?.id) {
            await supabase
              .from('project_external_stakeholders')
              .upsert([
                {
                  project_id: projectId,
                  contact_id: contact.id,
                  role_id: def.role_id,
                  is_primary: true
                }
              ], { onConflict: 'project_id,contact_id,role_id' });
          }
        }
      }

      await loadProjectStakeholders(projectId);
    } catch (err) {
      console.error('applyDefaultStakeholders failed', err);
    }
  }, [stakeholderDefaults, stakeholderRoles, ensureProjectContact, loadProjectStakeholders]);

  useEffect(() => {
    loadStakeholderRoles();
    loadStakeholderDefaults();
  }, [loadStakeholderRoles, loadStakeholderDefaults]);

  useEffect(() => {
    if (selectedProjectId) {
      const fetchCurrent = async () => {
        const [contactRows] = await Promise.all([
          loadContacts(selectedProjectId),
          loadProjectStakeholders(selectedProjectId)
        ]);
        if (contactRows?.length) {
          setContacts(contactRows)
        }
      };
      fetchCurrent();
    }
  }, [selectedProjectId, loadContacts, loadProjectStakeholders]);

  // Load wire drops for a project when viewing it
  const loadWireDrops = useCallback(async (projectId) => {
    try {
      if (!supabase) return;
      const { data, error } = await supabase
        .from('wire_drops')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
      if (error) return;
      const drops = (data || []).map(row => ({
        id: row.id,
        uid: (row.uid || '').toUpperCase(),
        name: row.name,
        location: row.location,
        type: row.type || 'CAT6',
        prewirePhoto: row.prewire_photo,
        installedPhoto: row.installed_photo,
      }));
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, wireDrops: drops } : p));
      setSelectedProject(prev => prev && prev.id === projectId ? { ...prev, wireDrops: drops } : prev);
    } catch (_) {}
  }, []);

  useEffect(() => {
    // Load wire drops/stakeholders once when entering a project if not yet loaded.
    // Important: don't loop when the result is an empty array; only trigger when undefined/null.
    if (
      currentView === 'project' &&
      selectedProjectId &&
      (selectedProject?.wireDrops == null)
    ) {
      loadWireDrops(selectedProjectId);
      loadProjectStakeholders(selectedProjectId);
    }
  }, [currentView, selectedProjectId, selectedProject?.wireDrops, loadWireDrops, loadProjectStakeholders]);

  const loadProjects = async () => {
    try {
      if (!supabase) {
        return;
      }
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        return;
      }
      const mapped = (data || []).map(mapProject);
      setProjects(mapped);
      // Prefetch wire drops so progress bars are correct on dashboard
      try {
        await Promise.all((mapped || []).map(p => loadWireDrops(p.id)));
      } catch (_) {}
    } catch (_) {}
  };

  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line
  }, []);

  // Load issues for a project when viewing it (with photos)
  const loadIssues = useCallback(async (projectId) => {
    try {
      if (!supabase) return;
      const { data: issueRows, error: issueErr } = await supabase
        .from('issues')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (issueErr) return;

      const mapped = (issueRows || []).map(r => ({
        id: r.id,
        projectId: r.project_id,
        title: r.title,
        status: r.status,
        date: r.created_at ? new Date(r.created_at).toLocaleDateString() : '',
        notes: r.notes || '',
        photos: [],
        assignees: []
      }));

      // Load photos for these issues (if any exist)
      const ids = mapped.map(i => i.id);
      if (ids.length) {
        const { data: photoRows, error: photoErr } = await supabase
          .from('issue_photos')
          .select('*')
          .in('issue_id', ids);
        if (!photoErr && photoRows && photoRows.length) {
          const byIssue = new Map();
          for (const r of photoRows) {
            if (!byIssue.has(r.issue_id)) byIssue.set(r.issue_id, []);
            byIssue.get(r.issue_id).push(r.url);
          }
          mapped.forEach(m => { m.photos = byIssue.get(m.id) || []; });
        }
      }

      if (ids.length) {
        const { data: assignmentRows, error: assignmentErr } = await supabase
          .from('issue_contacts')
          .select('id, issue_id, contact_id, contacts(*)')
          .in('issue_id', ids);
        if (!assignmentErr && assignmentRows && assignmentRows.length) {
          const byIssue = new Map();
          assignmentRows.forEach(row => {
            if (!byIssue.has(row.issue_id)) byIssue.set(row.issue_id, []);
            const contact = row.contacts || null;
            const role = contact?.stakeholder_role_id ? stakeholderRoles.find(r => r.id === contact.stakeholder_role_id) : null;
            byIssue.get(row.issue_id).push({
              id: row.id,
              contactId: row.contact_id,
              contact,
              role
            });
          });
          mapped.forEach(m => { m.assignees = byIssue.get(m.id) || []; });
        }
      }

      setIssues(mapped);
    } catch (_) {}
  }, [stakeholderRoles]);

  useEffect(() => {
    if ((currentView === 'project' || currentView === 'people' || currentView === 'issueForm' || currentView === 'issueDetail') && selectedProjectId) {
      loadIssues(selectedProjectId);
    }
  }, [currentView, selectedProjectId, loadIssues]);

  // Safety: close any overlays when navigating or changing project to avoid blocking clicks
  useEffect(() => {
    try {
      setShowScanner(false);
      setFullscreenImage(null);
    } catch (_) {}
  }, [currentView, selectedProjectId]);

  const openWireDropByUid = useCallback(async (value) => {
    const raw = String(value || '').trim();
    if (!raw) {
      alert('No UID provided');
      return false;
    }
    if (!supabase) {
      alert('Supabase not configured');
      return false;
    }

    const uid = raw.toUpperCase();

    try {
      const { data: dropRow, error } = await supabase
        .from('wire_drops')
        .select('*')
        .eq('uid', uid)
        .single();
      if (error) throw error;

      let projectRecord = projects.find(p => p.id === dropRow.project_id);
      if (!projectRecord) {
        const { data: projectRow, error: projectErr } = await supabase
          .from('projects')
          .select('*')
          .eq('id', dropRow.project_id)
          .single();
        if (projectErr) throw projectErr;
        projectRecord = mapProject(projectRow);
        setProjects(prev => {
          const exists = prev.some(p => p.id === projectRecord.id);
          return exists ? prev : [projectRecord, ...prev];
        });
      }

      await loadWireDrops(dropRow.project_id);
      await loadIssues(dropRow.project_id);
      setSelectedProject(prev => (
        prev && prev.id === dropRow.project_id
          ? prev
          : projectRecord || prev
      ));
      setSelectedWireDrop({
        id: dropRow.id,
        uid: (dropRow.uid || '').toUpperCase(),
        name: dropRow.name,
        location: dropRow.location,
        type: dropRow.type || 'CAT6',
        prewirePhoto: dropRow.prewire_photo,
        installedPhoto: dropRow.installed_photo
      });
      setPendingSection(null);
      setCurrentView('wireDropDetail');
      setShowScanner(false);
      return true;
    } catch (err) {
      console.error('Failed to open wire drop by UID', err);
      alert(err.message || 'Wire drop not found');
      return false;
    }
  }, [projects, mapProject, loadWireDrops, loadIssues]);

  // Calculate project progress based on wire drops
  const calculateProjectProgress = (project) => {
    if (!project.wireDrops || project.wireDrops.length === 0) return 0;
    
    let totalProgress = 0;
    project.wireDrops.forEach(drop => {
      // Each drop can contribute up to 100% (50% for prewire, 50% for installed)
      if (drop.prewirePhoto) totalProgress += 50;
      if (drop.installedPhoto) totalProgress += 50;
    });
    
    return Math.round(totalProgress / project.wireDrops.length);
  };

  // Filter projects based on technician view
  const getFilteredProjects = () => {
    // For now, show all projects (assignment optional)
    return projects;
  };

  // Theme
  const theme = {
    dark: {
      // Backgrounds
      bg: 'bg-zinc-950',              // #09090b - Deep black
      bgSecondary: 'bg-zinc-900',     // #18181b - Elevated surface
      surface: 'bg-zinc-900',         // #18181b - Cards, modals
      surfaceHover: 'bg-zinc-800',    // #27272a - Hover state
      cardBg: 'bg-zinc-900',          // Card background
      
      // Borders
      border: 'border-zinc-800',      // #27272a - Default border
      borderHover: 'border-zinc-700', // #3f3f46 - Hover border
      
      // Text colors
      text: 'text-zinc-100',          // #f4f4f5 - Primary text
      textPrimary: 'text-zinc-100',   // #f4f4f5 - Primary text
      textSecondary: 'text-zinc-400', // #a1a1aa - Secondary text
      textTertiary: 'text-zinc-500',  // #71717a - Muted text
      
  // Interactive colors
      accent: 'bg-gradient-to-r from-purple-500 to-pink-500',
      accentText: 'text-purple-400',
      bgPrimary: 'bg-gradient-to-r from-purple-500 to-pink-500',
      textOnPrimary: 'text-white',
      textOnSecondary: 'text-zinc-200',
      success: 'bg-emerald-500',
      warning: 'bg-amber-500',
      danger: 'bg-red-500',
      info: 'bg-blue-500',
      textBlue: 'text-blue-400',
      
      // Component specific
      inputBg: 'bg-zinc-900',
      inputBorder: 'border-zinc-800 focus:border-purple-500',
      inputText: 'text-zinc-100 placeholder-zinc-500',
      
      // Shadows
      shadow: 'shadow-xl shadow-black/50',
      shadowHover: 'shadow-2xl shadow-black/60',
      
      // Legacy compatibility
      mutedBg: 'bg-zinc-800',
      mutedText: 'text-zinc-400'
    },
    light: {
      // Backgrounds  
      bg: 'bg-zinc-50',
      bgSecondary: 'bg-white',
      surface: 'bg-white',
      surfaceHover: 'bg-zinc-50',
      cardBg: 'bg-white',
      
      // Borders
      border: 'border-zinc-200',
      borderHover: 'border-zinc-300',
      
      // Text colors
      text: 'text-zinc-900',
      textPrimary: 'text-zinc-900',
      textSecondary: 'text-zinc-600',
      textTertiary: 'text-zinc-400',
      
  // Interactive colors
      accent: 'bg-gradient-to-r from-purple-500 to-pink-500',
      accentText: 'text-purple-600',
      bgPrimary: 'bg-gradient-to-r from-purple-500 to-pink-500',
      textOnPrimary: 'text-white',
      textOnSecondary: 'text-zinc-900',
      success: 'bg-emerald-500',
      warning: 'bg-amber-500',
      danger: 'bg-red-500',
      info: 'bg-blue-500',
      textBlue: 'text-blue-600',
      
      // Component specific
      inputBg: 'bg-white',
      inputBorder: 'border-zinc-300 focus:border-purple-500',
      inputText: 'text-zinc-900 placeholder-zinc-400',
      
      // Shadows
      shadow: 'shadow-lg shadow-black/10',
      shadowHover: 'shadow-xl shadow-black/15',
      
      // Legacy compatibility
      mutedBg: 'bg-zinc-200',
      mutedText: 'text-zinc-700'
    }
  };

  const t = darkMode ? theme.dark : theme.light;
  // Apply UI data-theme at document root so CSS variables take effect
  useEffect(() => {
    try {
      const el = document.documentElement;
      el.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    } catch (_) {}
  }, [darkMode]);

  // Time tracking functions
  const handleCheckIn = (projectId) => {
    const now = new Date();
    setActiveCheckIns(prev => ({
      ...prev,
      [projectId]: now
    }));
    
    const newLog = {
      id: Date.now(),
      projectId,
      technician: 'Current User', // Would come from auth
      checkIn: now.toISOString(),
      checkOut: null
    };
    
    setTimeLogs(prev => [...prev, newLog]);
    alert('Checked in successfully!');
  };

  const handleCheckOut = (projectId) => {
    if (!activeCheckIns[projectId]) {
      alert('No active check-in found!');
      return;
    }
    
    const checkInTime = new Date(activeCheckIns[projectId]);
    const checkOutTime = new Date();
    const hoursWorked = ((checkOutTime - checkInTime) / (1000 * 60 * 60)).toFixed(2);
    
    setTimeLogs(prev => prev.map(log => 
      log.projectId === projectId && !log.checkOut
        ? { ...log, checkOut: checkOutTime.toISOString() }
        : log
    ));
    
    setActiveCheckIns(prev => {
      const updated = { ...prev };
      delete updated[projectId];
      return updated;
    });
    
    alert(`Checked out! Hours worked: ${hoursWorked}`);
  };

  // Handle photo upload with camera option
  const handlePhotoCapture = (callback) => {
    // In a real app, this would trigger camera API
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment'; // Use 'user' for front camera
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const url = URL.createObjectURL(file);
        callback({ file, preview: url });
      }
    };
    input.click();
  };

  // Open links in new window
  const openLink = (url) => {
    const raw = typeof url === 'string' ? url.trim() : '';
    if (!raw) {
      alert('No URL configured');
      return;
    }
    const target = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    window.open(target, '_blank', 'noopener,noreferrer');
  };

  // Fullscreen Image Modal
  const FullscreenImageModal = () => {
    if (!fullscreenImage) return null;
    
    return (
      <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4" data-overlay="image-overlay">
        <div className="relative max-w-full max-h-full">
          <button 
            onClick={() => setFullscreenImage(null)}
            className="absolute top-4 right-4 p-2 bg-black/50 rounded-full text-white z-10"
          >
            <X size={24} />
          </button>
          <img 
            src={fullscreenImage} 
            alt="Fullscreen view" 
            className="max-w-full max-h-full object-contain"
          />
        </div>
      </div>
    );
  };

  // Wire Drop Form
  const WireDropForm = () => {
    const [formData, setFormData] = useState(() => ({
      id: selectedWireDrop?.id || '',
      uid: (selectedWireDrop?.uid || generateWireDropUid()).toUpperCase(),
      name: selectedWireDrop?.name || '',
      location: selectedWireDrop?.location || '',
      type: selectedWireDrop?.type || 'CAT6',
      prewirePhoto: selectedWireDrop?.prewirePhoto || null,
      installedPhoto: selectedWireDrop?.installedPhoto || null
    }));

    const [saveError, setSaveError] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
      if (selectedWireDrop) {
        setFormData({
          id: selectedWireDrop.id || '',
          uid: (selectedWireDrop.uid || generateWireDropUid()).toUpperCase(),
          name: selectedWireDrop.name || '',
          location: selectedWireDrop.location || '',
          type: selectedWireDrop.type || 'CAT6',
          prewirePhoto: selectedWireDrop.prewirePhoto || null,
          installedPhoto: selectedWireDrop.installedPhoto || null
        });
      } else {
        setFormData({
          id: '',
          uid: generateWireDropUid(),
          name: '',
          location: '',
          type: 'CAT6',
          prewirePhoto: null,
          installedPhoto: null
        });
      }
    }, [selectedWireDrop]);

    const handleSave = async () => {
      if (!formData.name.trim() || !formData.location.trim() || !formData.uid.trim()) {
        alert('Please fill in all required fields');
        return;
      }

      if (!supabase) { setSaveError('Supabase not configured'); return; }
      try {
        setSaving(true);
        setSaveError('');
        const normalizedUid = formData.uid.trim().toUpperCase();
        const payload = {
          project_id: selectedProject.id,
          uid: normalizedUid,
          name: formData.name.trim(),
          location: formData.location.trim(),
          type: formData.type,
          prewire_photo: formData.prewirePhoto,
          installed_photo: formData.installedPhoto,
        };

        if (selectedWireDrop?.id) {
          const { error } = await supabase
            .from('wire_drops')
            .update(payload)
            .eq('id', selectedWireDrop.id);
          if (error) {
            const message = String(error.message || '').toLowerCase();
            if (message.includes('duplicate')) {
              setSaveError('UID already exists. Please generate a new one.');
            } else {
              setSaveError(error.message);
            }
            return;
          }
          alert('Wire drop updated!');
        } else {
          const { data, error } = await supabase
            .from('wire_drops')
            .insert([payload])
            .select('*')
            .single();
          if (error) {
            const message = String(error.message || '').toLowerCase();
            if (message.includes('duplicate')) {
              setSaveError('UID already exists. Generate a new UID and try again.');
            } else {
              setSaveError(error.message);
            }
            return;
          }
          if (data) {
            setFormData(prev => ({ ...prev, id: data.id }));
          }
          alert('Wire drop added!');
        }

        await loadWireDrops(selectedProject.id);
        setCurrentView('wireDropList');
        setSelectedWireDrop(null);
      } catch (e) {
        setSaveError(e.message);
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className={`min-h-screen ui-bg relative z-10 pointer-events-auto`}>
        {/* Header */}
        <div className={`ui-surface ui-border px-4 py-3`}>
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentView('wireDropList')} className="ui-btn ui-btn--secondary p-2">
              <ArrowLeft size={24} />
            </button>
            <h1 className={`text-lg font-semibold ui-text`}>
              {selectedWireDrop ? 'Edit Wire Drop' : 'Add Wire Drop'}
            </h1>
            <button onClick={handleSave} disabled={saving} className={`ui-btn ui-btn--primary ${saving ? 'opacity-50 cursor-wait' : ''}`}>
              <Save size={20} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {saveError && <div className="text-red-400 text-sm">{saveError}</div>}
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            className={`w-full px-3 py-3 rounded-xl ui-surface ui-text ui-border`}
            placeholder="Wire Drop Name *"
          />
          
          <div>
            <label className={`text-xs ${t.textSecondary} block mb-1`}>UID</label>
            <div className={`w-full px-3 py-3 rounded-xl ui-surface ui-text ui-border text-sm`}>{formData.uid}</div>
          </div>
          
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({...formData, location: e.target.value})}
            className={`w-full px-3 py-3 rounded-xl ui-surface ui-text ui-border`}
            placeholder="Location *"
          />
          
          <div className="flex gap-2">
            <select
              value={formData.type}
              onChange={(e) => setFormData({...formData, type: e.target.value})}
              className={`flex-1 px-3 py-3 rounded-xl ui-surface ui-text ui-border`}
            >
              {(wireTypes.length ? wireTypes : ['CAT6','CAT6A','Fiber','Coax','Power']).map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={async () => {
                try {
                  const name = (prompt('New wire type name:') || '').trim()
                  if (!name) return
                  if (!supabase) { alert('Supabase not configured'); return }
                  const { error } = await supabase
                    .from('wire_types')
                    .insert([{ name, active: true }])
                  if (error && !String(error.message).includes('duplicate')) {
                    alert(`Failed to add type: ${error.message}`)
                    return
                  }
                  await loadWireTypes()
                  setFormData(prev => ({ ...prev, type: name }))
                } catch (e) {
                  alert(`Failed to add type: ${e.message}`)
                }
              }}
              className={`ui-btn ui-btn--secondary text-sm`}
            >
              Add Type
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Project Form for PM
  const ProjectForm = () => {
    const [formData, setFormData] = useState(
      selectedProject || {
        name: '',
        client: '',
        address: '',
        phase: 'Planning',
        startDate: '',
        endDate: '',
        wiringDiagramUrl: '',
        portalProposalUrl: '',
        oneDrivePhotos: '',
        oneDriveFiles: '',
        oneDriveProcurement: '',
        stakeholders: [],
        team: [],
        wireDrops: []
      }
    );

    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState('')

    const toDb = (f) => ({
      name: f.name,
      client: f.client || null,
      address: f.address || null,
      phase: f.phase || null,
      start_date: f.startDate || null,
      end_date: f.endDate || null,
      wiring_diagram_url: f.wiringDiagramUrl || null,
      portal_proposal_url: f.portalProposalUrl || null,
      one_drive_photos: f.oneDrivePhotos || null,
      one_drive_files: f.oneDriveFiles || null,
      one_drive_procurement: f.oneDriveProcurement || null,
    })

    const handleSave = async () => {
      try {
        setSaving(true)
        setSaveError('')

        if (!formData.name || !formData.wiringDiagramUrl || !formData.portalProposalUrl) {
          setSaveError('Please fill in required fields (Name, Wiring Diagram URL, Portal Proposal URL)')
          return
        }
        if (!supabase) {
          setSaveError('Supabase not configured')
          return
        }

        if (selectedProject?.id) {
          // Update
          const { data, error } = await supabase
            .from('projects')
            .update(toDb(formData))
            .eq('id', selectedProject.id)
            .select('*')
            .single()
          if (error) { setSaveError(error.message); return }
          const updated = mapProject(data)
          setProjects(prev => prev.map(p => p.id === updated.id ? updated : p))
          setSelectedProject(updated)
          alert('Project updated!')
          await loadProjects()
        } else {
          // Insert
          const { data, error } = await supabase
            .from('projects')
            .insert([toDb(formData)])
            .select('*')
            .single()
          if (error) { setSaveError(error.message); return }
          const created = mapProject(data)
          await applyDefaultStakeholders(created.id)
          await loadProjectStakeholders(created.id)
          setProjects(prev => [created, ...prev])
          setSelectedProject(created)
          alert('Project created!')
          await loadProjects()
        }

        setCurrentView('pmDashboard')
      } catch (e) {
        setSaveError(e.message)
      } finally {
        setSaving(false)
      }
    }

    return (
      <div className={`min-h-screen ${t.bg} relative z-10 pointer-events-auto`}>
        {/* Header */}
        <div className={`${t.bgSecondary} border-b ${t.border} px-4 py-3`}>
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentView('pmDashboard')} className="p-2 bg-black text-white rounded">
              <ArrowLeft size={24} />
            </button>
            <h1 className={`text-lg font-semibold ${t.text}`}>
              {selectedProject ? 'Edit Project' : 'New Project'}
            </h1>
            <button onClick={handleSave} disabled={saving} className="p-2 bg-black text-white rounded">
              <Save size={20} />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {saveError && (
            <div className="text-red-400 text-sm">{saveError}</div>
          )}
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            className={`w-full px-3 py-3 rounded-xl ${t.surface} ${t.text} border ${t.border} transition-all duration-300 focus:ring-2 focus:ring-purple-500/20`}
            placeholder="Project Name *"
          />
          
          <input
            type="text"
            value={formData.client}
            onChange={(e) => setFormData({...formData, client: e.target.value})}
            className={`w-full px-3 py-3 rounded-xl ${t.surface} ${t.text} border ${t.border} transition-all duration-300 focus:ring-2 focus:ring-purple-500/20`}
            placeholder="Client"
          />
          
          <input
            type="text"
            value={formData.address}
            onChange={(e) => setFormData({...formData, address: e.target.value})}
            className={`w-full px-3 py-3 rounded-xl ${t.surface} ${t.text} border ${t.border} transition-all duration-300 focus:ring-2 focus:ring-purple-500/20`}
            placeholder="Address"
          />

          <div className={`p-4 rounded-xl ${t.surface} border ${t.border}`}>
            <h3 className={`font-medium ${t.text} mb-3`}>Required Links</h3>
            <input
              type="url"
              value={formData.wiringDiagramUrl}
              onChange={(e) => setFormData({...formData, wiringDiagramUrl: e.target.value})}
              className={`w-full px-3 py-3 rounded-xl ${t.surfaceHover} ${t.text} border ${t.border} mb-3 transition-all duration-300 focus:ring-2 focus:ring-purple-500/20`}
              placeholder="Wiring Diagram URL (Lucid Chart) *"
            />
            <input
              type="url"
              value={formData.portalProposalUrl}
              onChange={(e) => setFormData({...formData, portalProposalUrl: e.target.value})}
              className={`w-full px-3 py-3 rounded-xl ${t.surfaceHover} ${t.text} border ${t.border} transition-all duration-300 focus:ring-2 focus:ring-purple-500/20`}
              placeholder="Portal Proposal URL *"
            />
          </div>

          <div className={`p-4 rounded-xl ${t.surface} border ${t.border}`}>
            <h3 className={`font-medium ${t.text} mb-3`}>OneDrive Links</h3>
            <input
              type="url"
              value={formData.oneDrivePhotos}
              onChange={(e) => setFormData({...formData, oneDrivePhotos: e.target.value})}
              className={`w-full px-3 py-3 rounded-xl ${t.surfaceHover} ${t.text} border ${t.border} mb-3 transition-all duration-300 focus:ring-2 focus:ring-purple-500/20`}
              placeholder="OneDrive Photos Folder URL"
            />
            <input
              type="url"
              value={formData.oneDriveFiles}
              onChange={(e) => setFormData({...formData, oneDriveFiles: e.target.value})}
              className={`w-full px-3 py-3 rounded-xl ${t.surfaceHover} ${t.text} border ${t.border} mb-3 transition-all duration-300 focus:ring-2 focus:ring-purple-500/20`}
              placeholder="OneDrive Files Folder URL"
            />
            <input
              type="url"
              value={formData.oneDriveProcurement}
              onChange={(e) => setFormData({...formData, oneDriveProcurement: e.target.value})}
              className={`w-full px-3 py-3 rounded-xl ${t.surfaceHover} ${t.text} border ${t.border} transition-all duration-300 focus:ring-2 focus:ring-purple-500/20`}
              placeholder="OneDrive Procurement Folder URL"
            />
          </div>
        </div>
      </div>
    );
  };

  // Technician Dashboard
  const TechnicianDashboard = () => (
    <div className={`min-h-screen ui-bg ui-text relative z-10 pointer-events-auto`}>
      {/* Header */}
  <div className={`ui-surface ui-text ui-border px-4 py-3`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="IS" className="h-5 w-auto" onError={(e)=>{e.currentTarget.style.display='none'}} />
            <h1 className={`text-lg font-semibold ${t.text}`}>Technician Dashboard</h1>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <span className={`hidden sm:block text-xs ${t.textSecondary}`}>Hi, {user.user_metadata?.full_name || user.email}</span>
            )}
            <button onClick={() => setUserRole('pm')} className="ui-btn ui-btn--secondary text-sm">
              Switch to PM
            </button>
            <button onClick={() => setDarkMode(!darkMode)} className="ui-btn ui-btn--secondary p-2">
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => setViewMyProjects(true)}
            className={`ui-btn ${viewMyProjects ? 'ui-btn--primary' : 'ui-btn--secondary'}`}
          >
            My Projects
          </button>
          <button 
            onClick={() => setViewMyProjects(false)}
            className={`ui-btn ${!viewMyProjects ? 'ui-btn--primary' : 'ui-btn--secondary'}`}
          >
            All Projects
          </button>
        </div>
      </div>

      {/* Calendar Widget (Microsoft Graph) */}
  <div className={`m-4 p-4 ui-card ui-border`} style={{marginBottom: '6rem'}}>
        <div className="flex items-center justify-between mb-3">
          <h2 className={`font-medium ${t.text}`}>Today's Schedule</h2>
          <button onClick={loadTodayEvents} className={`ui-btn ui-btn--secondary text-xs`}>
            <Calendar size={16} className="inline mr-1" /> Refresh
          </button>
        </div>
        {(!calendarReady) && (
          <div className="flex items-center justify-between mb-2">
            <div className={`text-xs ${t.textSecondary}`}>Connect your Microsoft Calendar</div>
            <button
              onClick={async()=>{
                await supabase.auth.signInWithOAuth({
                  provider: 'azure',
                  options: { scopes: 'openid profile email offline_access Calendars.Read Contacts.Read', redirectTo: `${window.location.origin}/auth/callback` }
                })
              }}
              className={`px-2 py-1 rounded ui-btn ui-btn--primary text-xs`}
            >
              Connect
            </button>
          </div>
        )}
        {eventsError && <div className="text-xs text-red-400 mb-2">{eventsError}</div>}
        <div className="space-y-2">
          {events.length === 0 ? (
            <div className={`text-sm ${t.textSecondary}`}>No events today</div>
          ) : (
            events.map(ev => (
              <div key={ev.id} className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${t.success}`}></div>
                <span className={`text-sm ${t.text}`}>{new Date(ev.start).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})} - {ev.subject}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Projects */}
  <div className="px-4 pb-32">
        <h2 className={`text-lg font-semibold ${t.text} mb-3`}>
          {viewMyProjects ? 'My projects' : 'All projects'}
        </h2>
        
        {getFilteredProjects().map((project) => {
          const progress = calculateProjectProgress(project);
          const isCheckedIn = activeCheckIns[project.id];
          
          return (
            <div key={project.id} className={`mb-3 ui-card ui-border overflow-hidden`}>
              {/* Progress Bar */}
              <div className="ui-progress">
                <div
                  className={`${progress > 70 ? 'ui-bg-success' : progress > 40 ? 'ui-bg-warning' : 'ui-bg-danger'} ui-progress__fill`}
                  style={{ width: `${progress}%` }}
                />
                <div className="ui-progress__label">
                  {project.name} - {progress}%
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="p-3 flex gap-2">
                <button 
                  onClick={() => {
                    setSelectedProject(project);
                    setCurrentView('project');
                  }}
                  className={`flex-1 ui-btn ui-btn--secondary text-xs sm:text-sm leading-tight`}
                >
                  OPEN
                </button>
                <button
                  onClick={() => {
                    setSelectedProject(project);
                    setPendingSection('issues');
                    setCurrentView('project');
                  }}
                  className={`flex-1 ui-btn ui-btn--secondary text-xs sm:text-sm leading-tight`}
                >
                  ISSUES
                </button>
                <button 
                  onClick={() => handleCheckIn(project.id)}
                  disabled={isCheckedIn}
                  className={`flex-1 ui-btn ${isCheckedIn ? 'ui-bg-success ui-onAccent' : 'ui-btn--secondary'} text-xs sm:text-sm leading-tight`}
                >
                  {isCheckedIn ? '✓ IN' : 'CHECK IN'}
                </button>
                <button 
                  onClick={() => handleCheckOut(project.id)}
                  disabled={!isCheckedIn}
                  className={`flex-1 ui-btn ui-btn--secondary text-xs sm:text-sm leading-tight ${!isCheckedIn ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  CHECK OUT
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Navigation */}
      <div className={`fixed bottom-0 left-0 right-0 px-3 py-2 flex gap-2 ui-border ui-surface`} style={{paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)'}}>
        <button 
          onClick={() => setCurrentView('people')}
          className={`flex-1 ui-btn ui-btn--secondary py-3 font-medium`}
        >
          <Users size={20} className="mx-auto mb-1" />
          People
        </button>
        <button 
          onClick={() => {
            const projectsForView = getFilteredProjects();
            if (projectsForView.length > 0) {
              setSelectedProject(projectsForView[0]);
              setPendingSection('wireDrops');
              setCurrentView('project');
            }
          }}
          className={`flex-1 ui-btn ui-btn--secondary py-3 font-medium`}
        >
          <Zap size={20} className="mx-auto mb-1" />
          Wire Drops
        </button>
        <button 
          onClick={() => setShowScanner(true)}
          className={`flex-1 ui-btn ui-btn--secondary py-3 font-medium`}
        >
          <QrCode size={20} className="mx-auto mb-1" />
          Scan Tag
        </button>
      </div>
    </div>
  );

  // Wire Drop List View (searchable)
  const WireDropListView = () => {
    // Use a local query to avoid re-mounts/blur on every keystroke; sync to global with debounce
    const [localQuery, setLocalQuery] = useState(searchQuery);
    const inputRef = useRef(null);
    const userInteractingRef = useRef(false);
    useEffect(() => {
      setLocalQuery(searchQuery);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => {
      const id = setTimeout(() => {
        if (localQuery !== searchQuery) setSearchQuery(localQuery);
      }, 150);
      return () => clearTimeout(id);
    }, [localQuery, searchQuery]);

    // Keep focus on the input while the user is typing, even if the list below re-renders
    useEffect(() => {
      if (!userInteractingRef.current) return;
      const el = inputRef.current;
      if (!el) return;
      if (document.activeElement !== el) {
        const pos = el.value.length;
        el.focus();
        try { el.setSelectionRange(pos, pos); } catch (_) {}
      }
    }, [localQuery]);

    const q = (localQuery || '').toLowerCase();
    const filteredDrops = selectedProject?.wireDrops.filter(drop => 
      drop.name.toLowerCase().includes(q) ||
      drop.location.toLowerCase().includes(q) ||
      drop.uid.toLowerCase().includes(q) ||
      drop.type.toLowerCase().includes(q)
    ) || [];

    return (
      <div className={`min-h-screen ui-bg relative z-10 pointer-events-auto`}>
        {/* Header */}
        <div className={`ui-surface ui-border px-4 py-3`}>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setCurrentView(userRole === 'pm' ? 'pmProjectDetail' : 'project')} className="ui-btn ui-btn--secondary p-2">
              <ArrowLeft size={24} />
            </button>
            <h1 className={`text-lg font-semibold ui-text`}>Wire Drops</h1>
            <button 
              onClick={() => {
                setSelectedWireDrop(null);
                setCurrentView('wireDropForm');
              }}
              className="ui-btn ui-btn--primary p-2"
            >
              <Plus size={24} />
            </button>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search size={20} className={`absolute left-3 top-3 ${t.textSecondary}`} />
            <input
              type="text"
              value={localQuery}
              onChange={(e) => {
                setLocalQuery(e.target.value);
                // Preserve focus across renders
                requestAnimationFrame(() => {
                  if (userInteractingRef.current) inputRef.current?.focus();
                });
              }}
              placeholder="Search by name, location, UID, or type..."
              className={`w-full pl-10 pr-4 py-3 rounded-lg ui-surface ui-text ui-border`}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              ref={inputRef}
              onFocus={() => { userInteractingRef.current = true; }}
              onBlur={() => { userInteractingRef.current = false; }}
              onKeyDown={(e) => e.stopPropagation()}
              onInputCapture={(e) => e.stopPropagation()}
              onKeyUp={(e) => e.stopPropagation()}
            />
          </div>
        </div>

        {/* Wire Drop List */}
        <div className="p-4">
          {filteredDrops.map(drop => {
            const prewireComplete = !!drop.prewirePhoto;
            const installComplete = !!drop.installedPhoto;
            const progress = (prewireComplete ? 50 : 0) + (installComplete ? 50 : 0);
            
            return (
              <button
                key={drop.id}
                onClick={() => {
                  setSelectedWireDrop(drop);
                  setCurrentView('wireDropDetail');
                }}
                className={`w-full mb-3 p-4 rounded-xl ui-surface ui-border text-left`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className={`font-medium ui-text`}>{drop.name}</p>
                    <p className={`text-xs ${t.textSecondary}`}>UID: {drop.uid}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedWireDrop(drop);
                        setCurrentView('wireDropForm');
                      }}
                      className={`p-1 ui-surface rounded ui-border`}
                    >
                      <Edit2 size={16} className={t.textSecondary} />
                    </button>
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      progress === 100 ? 'bg-green-600 text-white' :
                      progress === 50 ? 'bg-orange-600 text-white' :
                      'bg-gray-600 text-white'
                    }`}>
                      {progress}%
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className={`text-sm ${t.textSecondary}`}>{drop.location}</p>
                  <p className={`text-sm ${t.textSecondary}`}>{drop.type}</p>
                </div>
                <div className="flex gap-2 mt-2">
                  {prewireComplete && <span className="text-xs bg-yellow-600 text-white px-2 py-1 rounded">Prewired</span>}
                  {installComplete && <span className="text-xs bg-green-600 text-white px-2 py-1 rounded">Installed</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Wire Drop Detail View
  const WireDropDetailView = () => {
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [qrError, setQrError] = useState('');

    useEffect(() => {
      let cancelled = false;
      const generate = async () => {
        try {
          if (!selectedWireDrop?.uid) {
            setQrDataUrl('');
            return;
          }
          const dataUrl = await QRCode.toDataURL(selectedWireDrop.uid, { margin: 1, scale: 6 });
          if (!cancelled) {
            setQrDataUrl(dataUrl);
            setQrError('');
          }
        } catch (err) {
          if (!cancelled) {
            setQrError(err.message || 'Unable to generate QR code');
          }
        }
      };
      generate();
      return () => { cancelled = true; };
    }, [selectedWireDrop]);

    if (!selectedWireDrop) return null;

    const handlePrewirePhoto = async () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.capture = 'environment'
      input.onchange = async (e) => {
        let file = e.target.files?.[0]
        if (!file) return
        try {
          file = await compressImage(file)
          let url
          if (process.env.REACT_APP_USE_ONEDRIVE === '1' && selectedProject?.oneDrivePhotos) {
            const uidSeg = slugifySegment(selectedWireDrop.uid)
            const subPath = `wire_drops/${uidSeg}/prewire`
            if (!navigator.onLine) {
              // Queue offline
              await enqueueUpload({ rootUrl: selectedProject.oneDrivePhotos, subPath, filename: file.name, contentType: file.type, blob: file, update: { type: 'wire_drop', field: 'prewire_photo', id: selectedWireDrop.id } })
              url = URL.createObjectURL(file)
            } else {
              try {
                url = await graphUploadViaApi({ rootUrl: selectedProject.oneDrivePhotos, subPath, file })
              } catch (e) {
                const path = `projects/${selectedProject.id}/wire_drops/${uidSeg}/prewire-${Date.now()}`
                url = await uploadPublicImage(file, path)
              }
            }
          } else {
            const uidSeg = slugifySegment(selectedWireDrop.uid)
            const path = `projects/${selectedProject.id}/wire_drops/${uidSeg}/prewire-${Date.now()}`
            url = await uploadPublicImage(file, path)
          }
          await supabase.from('wire_drops').update({ prewire_photo: url }).eq('id', selectedWireDrop.id)
          await loadWireDrops(selectedProject.id)
          setSelectedWireDrop(prev => prev ? { ...prev, prewirePhoto: url } : prev)
        } catch (err) {
          alert(`Upload failed: ${err.message}`)
        }
      }
      input.click()
    };

    const handleInstalledPhoto = async () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.capture = 'environment'
      input.onchange = async (e) => {
        let file = e.target.files?.[0]
        if (!file) return
        try {
          file = await compressImage(file)
          let url
          if (process.env.REACT_APP_USE_ONEDRIVE === '1' && selectedProject?.oneDrivePhotos) {
            const uidSeg = slugifySegment(selectedWireDrop.uid)
            const subPath = `wire_drops/${uidSeg}/installed`
            if (!navigator.onLine) {
              await enqueueUpload({ rootUrl: selectedProject.oneDrivePhotos, subPath, filename: file.name, contentType: file.type, blob: file, update: { type: 'wire_drop', field: 'installed_photo', id: selectedWireDrop.id } })
              url = URL.createObjectURL(file)
            } else {
              try {
                url = await graphUploadViaApi({ rootUrl: selectedProject.oneDrivePhotos, subPath, file })
              } catch (e) {
                const path = `projects/${selectedProject.id}/wire_drops/${uidSeg}/installed-${Date.now()}`
                url = await uploadPublicImage(file, path)
              }
            }
          } else {
            const uidSeg = slugifySegment(selectedWireDrop.uid)
            const path = `projects/${selectedProject.id}/wire_drops/${uidSeg}/installed-${Date.now()}`
            url = await uploadPublicImage(file, path)
          }
          await supabase.from('wire_drops').update({ installed_photo: url }).eq('id', selectedWireDrop.id)
          await loadWireDrops(selectedProject.id)
          setSelectedWireDrop(prev => prev ? { ...prev, installedPhoto: url } : prev)
        } catch (err) {
          alert(`Upload failed: ${err.message}`)
        }
      }
      input.click()
    };

    return (
      <div className={`min-h-screen ui-bg relative z-10 pointer-events-auto`}>
        {/* Header */}
        <div className={`ui-surface ui-border px-4 py-3`}>
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentView('wireDropList')} className="ui-btn ui-btn--secondary p-2">
              <ArrowLeft size={24} />
            </button>
            <h1 className={`text-lg font-semibold ui-text`}>Wire Drop Detail</h1>
            <button 
              onClick={() => {
                setCurrentView('wireDropForm');
              }}
              className="ui-btn ui-btn--primary p-2"
            >
              <Edit2 size={20} />
            </button>
          </div>
        </div>

        <div className="p-4">
          {/* Wire Info */}
          <div className={`mb-4 p-4 rounded-xl ui-surface ui-border`}>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <p className={`text-xs ${t.textSecondary}`}>Name</p>
                <p className={`font-medium ${t.text}`}>{selectedWireDrop.name}</p>
              </div>
              <div>
                <p className={`text-xs ${t.textSecondary}`}>UID</p>
                <p className={`font-medium ${t.text}`}>{selectedWireDrop.uid}</p>
              </div>
              <div>
                <p className={`text-xs ${t.textSecondary}`}>Location</p>
                <p className={`font-medium ${t.text}`}>{selectedWireDrop.location}</p>
              </div>
              <div>
                <p className={`text-xs ${t.textSecondary}`}>Type</p>
                <p className={`font-medium ${t.text}`}>{selectedWireDrop.type}</p>
              </div>
            </div>
            
            {/* QR Code */}
            <div className="flex flex-col items-center gap-2">
              <div className="w-36 h-36 bg-white rounded-lg flex items-center justify-center p-2">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt={`QR for ${selectedWireDrop.uid}`} className="w-full h-full object-contain" />
                ) : (
                  <QrCode size={72} className="text-gray-800" />
                )}
              </div>
              {qrError && <span className="text-xs text-red-400">{qrError}</span>}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(selectedWireDrop.uid).catch(() => {});
                    alert('UID copied to clipboard');
                  }}
                  className={`ui-btn ui-btn--secondary text-xs`}
                >
                  Copy UID
                </button>
                <button
                  onClick={() => {
                    if (!qrDataUrl) return;
                    const link = document.createElement('a');
                    link.href = qrDataUrl;
                    link.download = `${selectedWireDrop.uid}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  disabled={!qrDataUrl}
                  className={`ui-btn ui-btn--secondary text-xs ${!qrDataUrl ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Download QR
                </button>
              </div>
            </div>
          </div>

          {/* Status Cards */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className={`p-4 rounded-xl ${selectedWireDrop.prewirePhoto ? 'bg-yellow-600' : 'ui-surface'} ui-border`}>
              <h3 className={`font-medium mb-2 ${selectedWireDrop.prewirePhoto ? 'text-white' : t.text}`}>
                Prewire {selectedWireDrop.prewirePhoto && '✓'}
              </h3>
              {selectedWireDrop.prewirePhoto ? (
                <div className="relative">
                  <img 
                    src={toThumb(selectedWireDrop.prewirePhoto)} 
                    alt="Prewire" 
                    className="w-full h-24 object-contain bg-black/20 rounded-lg mb-2 cursor-pointer" 
                    onClick={() => setFullscreenImage(selectedWireDrop.prewirePhoto)}
                    onError={(e) => { e.currentTarget.src = selectedWireDrop.prewirePhoto; }}
                  />
                  <button 
                    onClick={() => setFullscreenImage(selectedWireDrop.prewirePhoto)}
                    className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white"
                  >
                    <Maximize size={12} />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handlePrewirePhoto}
                  className={`w-full h-24 rounded-lg ui-surface flex items-center justify-center ui-border`}
                >
                  <Camera size={24} className={t.textTertiary} />
                </button>
              )}
              <p className={`text-xs ${selectedWireDrop.prewirePhoto ? 'text-white' : t.textSecondary}`}>
                {selectedWireDrop.prewirePhoto ? 'Photo confirmed' : 'Add photo to confirm'}
              </p>
            </div>
            
            <div className={`p-4 rounded-xl ${selectedWireDrop.installedPhoto ? 'bg-green-600' : 'ui-surface'} ui-border`}>
              <h3 className={`font-medium mb-2 ${selectedWireDrop.installedPhoto ? 'text-white' : t.text}`}>
                Installed {selectedWireDrop.installedPhoto && '✓'}
              </h3>
              {selectedWireDrop.installedPhoto ? (
                <div className="relative">
                  <img 
                    src={toThumb(selectedWireDrop.installedPhoto)} 
                    alt="Installed" 
                    className="w-full h-24 object-contain bg-black/20 rounded-lg mb-2 cursor-pointer" 
                    onClick={() => setFullscreenImage(selectedWireDrop.installedPhoto)}
                    onError={(e) => { e.currentTarget.src = selectedWireDrop.installedPhoto; }}
                  />
                  <button 
                    onClick={() => setFullscreenImage(selectedWireDrop.installedPhoto)}
                    className="absolute top-1 right-1 p-1 bg-black/50 rounded-full text-white"
                  >
                    <Maximize size={12} />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleInstalledPhoto}
                  className={`w-full h-24 rounded-lg ui-surface flex items-center justify-center ui-border`}
                >
                  <Camera size={24} className={t.textTertiary} />
                </button>
              )}
              <p className={`text-xs ${selectedWireDrop.installedPhoto ? 'text-white' : t.textSecondary}`}>
                {selectedWireDrop.installedPhoto ? 'Photo confirmed' : 'Add photo to confirm'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Issue Detail View
  const IssueDetailView = () => {
    const [editedIssue, setEditedIssue] = useState(
      selectedIssue || { id: '', title: '', status: 'open', notes: '', photos: [], assignees: [] }
    );
    const [photoErr, setPhotoErr] = useState('')
    const [saveErr, setSaveErr] = useState('')
    const [savingIssue, setSavingIssue] = useState(false)
    const stakeholderSet = useMemo(
      () => (selectedProject?.id && projectStakeholders[selectedProject.id]) || { internal: [], external: [] },
      [selectedProject?.id, projectStakeholders]
    )
    const [showIssueContactsPicker, setShowIssueContactsPicker] = useState(false)
    const [contactSelection, setContactSelection] = useState(new Set((selectedIssue?.assignees || []).map(assign => assign.contactId).filter(Boolean)))
    const [savingContacts, setSavingContacts] = useState(false)
    const [contactPickerError, setContactPickerError] = useState('')

    useEffect(() => {
      if (selectedIssue) {
        setEditedIssue(selectedIssue);
        setContactSelection(new Set((selectedIssue.assignees || []).map(assign => assign.contactId).filter(Boolean)));
      }
    }, [selectedIssue]);

    const projectContactOptions = useMemo(() => {
      const map = new Map();
      (stakeholderSet.external || []).forEach(entry => {
        if (entry.contact?.id) {
          const current = map.get(entry.contact.id) || { contact: entry.contact, roles: new Set() };
          if (entry.role?.name) current.roles.add(entry.role.name);
          map.set(entry.contact.id, current);
        }
      });
      (stakeholderSet.internal || []).forEach(entry => {
        if (entry.contact?.id) {
          const current = map.get(entry.contact.id) || { contact: entry.contact, roles: new Set() };
          if (entry.role?.name) current.roles.add(entry.role.name);
          map.set(entry.contact.id, current);
        }
      });
      return Array.from(map.values()).map(item => ({
        id: item.contact.id,
        contact: item.contact,
        roles: Array.from(item.roles)
      })).sort((a, b) => (a.contact.name || a.contact.email || '').localeCompare(b.contact.name || b.contact.email || ''));
    }, [stakeholderSet]);

    if (!selectedIssue) return null;

    const addIssuePhoto = async () => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.capture = 'environment'
      input.onchange = async (e) => {
        let file = e.target.files?.[0]
        if (!file) return
        try {
          file = await compressImage(file)
          setPhotoErr('')
          let url
          if (process.env.REACT_APP_USE_ONEDRIVE === '1' && selectedProject?.oneDrivePhotos) {
            const subPath = `issues/${editedIssue.id}`
            if (!navigator.onLine) {
              await enqueueUpload({ rootUrl: selectedProject.oneDrivePhotos, subPath, filename: file.name, contentType: file.type, blob: file, update: { type: 'issue_photo', issueId: editedIssue.id } })
              url = URL.createObjectURL(file)
            } else {
              try {
                url = await graphUploadViaApi({ rootUrl: selectedProject.oneDrivePhotos, subPath, file })
              } catch (e) {
                const path = `projects/${selectedProject.id}/issues/${editedIssue.id}/photo-${Date.now()}`
                url = await uploadPublicImage(file, path)
              }
            }
          } else {
            const path = `projects/${selectedProject.id}/issues/${editedIssue.id}/photo-${Date.now()}`
            url = await uploadPublicImage(file, path)
          }
          await supabase.from('issue_photos').insert([{ issue_id: editedIssue.id, url }])
          setIssues(prev => prev.map(i => i.id === editedIssue.id ? { ...i, photos: [...(i.photos||[]), url] } : i))
          setEditedIssue(prev => ({ ...prev, photos: [...(prev.photos||[]), url] }))
        } catch (err) {
          setPhotoErr(err.message)
        }
      }
      input.click()
    }

    const toggleContactSelection = (contactId) => {
      setContactSelection(prev => {
        const next = new Set(prev);
        if (next.has(contactId)) {
          next.delete(contactId);
        } else {
          next.add(contactId);
        }
        return next;
      });
    };

    const openContactPicker = () => {
      setContactPickerError('');
      setContactSelection(new Set((editedIssue.assignees || []).map(assign => assign.contactId).filter(Boolean)));
      setShowIssueContactsPicker(true);
    };

    const saveIssueContacts = async () => {
      if (!supabase || !selectedProject?.id) return;
      try {
        setSavingContacts(true);
        setContactPickerError('');
        const ids = Array.from(contactSelection);
        await supabase.from('issue_contacts').delete().eq('issue_id', editedIssue.id);
        let inserted = [];
        if (ids.length) {
          const rows = ids.map(contactId => ({
            project_id: selectedProject.id,
            issue_id: editedIssue.id,
            contact_id: contactId
          }));
          const { data, error } = await supabase.from('issue_contacts').insert(rows).select('id, contact_id');
          if (error) throw error;
          inserted = data || [];
        }

        const byContact = new Map();
        (stakeholderSet.external || []).forEach(entry => {
          if (entry.contact?.id && !byContact.has(entry.contact.id)) {
            byContact.set(entry.contact.id, { contact: entry.contact, role: entry.role });
          }
        });
        (stakeholderSet.internal || []).forEach(entry => {
          if (entry.contact?.id && !byContact.has(entry.contact.id)) {
            byContact.set(entry.contact.id, { contact: entry.contact, role: entry.role });
          }
        });

        const newAssignees = inserted.map(row => {
          const meta = byContact.get(row.contact_id) || { contact: allContacts.find(c => c.id === row.contact_id) || { id: row.contact_id }, role: null };
          return {
            id: row.id,
            contactId: row.contact_id,
            contact: meta.contact,
            role: meta.role || null
          };
        });

        setEditedIssue(prev => ({ ...prev, assignees: newAssignees }));
        setIssues(prev => prev.map(issue => issue.id === editedIssue.id ? { ...issue, assignees: newAssignees } : issue));
        setShowIssueContactsPicker(false);
      } catch (err) {
        setContactPickerError(err.message || 'Failed to update issue contacts');
      } finally {
        setSavingContacts(false);
      }
    };

    const persistIssue = async (updates, successMessage) => {
      if (!supabase) { setSaveErr('Supabase not configured'); return; }
      if (!editedIssue?.id) { setSaveErr('Issue missing identifier'); return; }
      try {
        setSavingIssue(true);
        setSaveErr('');
        const { error } = await supabase
          .from('issues')
          .update(updates)
          .eq('id', editedIssue.id);
        if (error) throw error;
        setEditedIssue(prev => ({ ...prev, ...updates }));
        if (selectedProject?.id) {
          await loadIssues(selectedProject.id);
        }
        alert(successMessage);
        setCurrentView('project');
      } catch (err) {
        setSaveErr(err.message || 'Unable to update issue');
      } finally {
        setSavingIssue(false);
      }
    };

    const saveIssue = async () => {
      await persistIssue({
        title: editedIssue.title,
        status: editedIssue.status,
        notes: editedIssue.notes
      }, 'Issue updated!');
    };

    const markResolved = async () => {
      await persistIssue({ status: 'resolved' }, 'Issue marked as resolved!');
    };

    return (
      <div className={`min-h-screen ${t.bg} relative z-10 pointer-events-auto`}>
        {/* Header */}
        <div className={`${t.bgSecondary} border-b ${t.border} px-4 py-3`}>
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentView('project')} className="p-2 bg-black text-white rounded">
              <ArrowLeft size={24} />
            </button>
            <h1 className={`text-lg font-semibold ${t.text}`}>Issue Detail</h1>
            <button onClick={saveIssue} disabled={savingIssue} className={`p-2 bg-black text-white rounded ${savingIssue ? 'opacity-50 cursor-wait' : ''}`}>
              Save
            </button>
          </div>
        </div>

        <div className="p-4">
          {saveErr && <div className="text-sm text-red-400 mb-3">{saveErr}</div>}
          {/* Issue Title */}
          <div className={`mb-4 p-4 rounded-xl ${t.surface} border ${t.border}`}>
            <input
              type="text"
              value={editedIssue.title}
              onChange={(e) => setEditedIssue({...editedIssue, title: e.target.value})}
              className={`w-full px-3 py-2 rounded-lg ${t.surfaceHover} ${t.text} border ${t.border} font-medium`}
            />
          </div>

          {/* Status */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <button
              onClick={() => setEditedIssue({...editedIssue, status: 'open'})}
              className={`py-3 rounded-lg ${editedIssue.status === 'open' ? 'bg-orange-600 text-white' : `${t.surface} ${t.text}`} font-medium`}
            >
              Open
            </button>
            <button
              onClick={() => setEditedIssue({...editedIssue, status: 'blocked'})}
              className={`py-3 rounded-lg ${editedIssue.status === 'blocked' ? 'bg-red-600 text-white' : `${t.surface} ${t.text}`} font-medium`}
            >
              Blocked
            </button>
            <button
              onClick={() => setEditedIssue({...editedIssue, status: 'resolved'})}
              className={`py-3 rounded-lg ${editedIssue.status === 'resolved' ? 'bg-green-600 text-white' : `${t.surface} ${t.text}`} font-medium`}
            >
              Resolved
            </button>
          </div>

          <div className={`mb-4 p-4 rounded-xl ${t.surface} border ${t.border}`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`font-medium ${t.text}`}>Assigned Stakeholders</h3>
              <button
                type="button"
                className={`px-3 py-1 text-xs rounded bg-black text-white ${projectContactOptions.length === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-800'}`}
                onClick={openContactPicker}
                disabled={projectContactOptions.length === 0}
              >
                Manage
              </button>
            </div>
            {projectContactOptions.length === 0 && (
              <p className={`text-xs ${t.textSecondary} mb-2`}>Add contacts to the project before assigning them to issues.</p>
            )}
            {editedIssue.assignees && editedIssue.assignees.length ? (
              <div className="space-y-2">
                {editedIssue.assignees.map(assign => (
                  <div key={assign.id} className={`text-sm ${t.text}`}>
                    <div className="font-medium">{assign.contact?.name || assign.contact?.email || 'Stakeholder'}</div>
                    <div className={`text-xs ${t.textSecondary}`}>
                      {assign.role?.name ? assign.role.name : '—'}
                      {assign.contact?.email ? ` · ${assign.contact.email}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className={`text-sm ${t.textSecondary}`}>No stakeholders tagged on this issue.</p>
            )}

            {showIssueContactsPicker && (
              <div className="mt-3 p-3 rounded-lg bg-gray-900 text-white border border-gray-700 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Select project contacts</h4>
                  <button type="button" className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700" onClick={() => setShowIssueContactsPicker(false)}>Close</button>
                </div>
                {contactPickerError && <div className="text-sm text-red-300">{contactPickerError}</div>}
                <div className="max-h-56 overflow-y-auto space-y-2">
                  {projectContactOptions.length === 0 ? (
                    <p className="text-xs text-gray-400">No project contacts yet.</p>
                  ) : (
                    projectContactOptions.map(option => (
                      <label key={option.id} className="flex items-start gap-2 bg-gray-800 rounded px-3 py-2 text-xs">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={contactSelection.has(option.id)}
                          onChange={() => toggleContactSelection(option.id)}
                        />
                        <span>
                          <span className="block text-sm font-medium text-white">{option.contact.name || option.contact.email || 'Contact'}</span>
                          <span className="text-gray-300">{option.roles.length ? option.roles.join(', ') : '—'}{option.contact.email ? ` · ${option.contact.email}` : ''}</span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
                <div className="flex justify-end gap-2 text-xs">
                  <button type="button" className="px-3 py-1 rounded bg-black text-white hover:bg-gray-800" onClick={() => setShowIssueContactsPicker(false)}>Cancel</button>
                  <button
                    type="button"
                    className={`px-3 py-1 rounded bg-black text-white ${savingContacts ? 'opacity-50 cursor-wait' : 'hover:bg-gray-800'}`}
                    onClick={saveIssueContacts}
                    disabled={savingContacts}
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className={`mb-4 p-4 rounded-xl ${t.surface} border ${t.border}`}>
            <h3 className={`font-medium ${t.text} mb-2`}>Notes</h3>
            <textarea
              value={editedIssue.notes}
              onChange={(e) => setEditedIssue({...editedIssue, notes: e.target.value})}
              className={`w-full px-3 py-2 rounded-lg ${t.surfaceHover} ${t.text} border ${t.border} h-32`}
              placeholder="Enter notes..."
            />
          </div>

          {/* Photos */}
          <div className={`mb-4 p-4 rounded-xl ${t.surface} border ${t.border}`}>
            <h3 className={`font-medium ${t.text} mb-2`}>Photos</h3>
            {photoErr && <div className="text-red-400 text-sm mb-2">{photoErr}</div>}
            <div className="flex gap-2 mb-3">
              <button onClick={addIssuePhoto} className={`px-3 py-2 rounded-lg ${t.accent} text-white text-sm`}>
                <Camera size={16} className="inline mr-1" /> Add Photo
              </button>
            </div>
            {(editedIssue.photos?.length>0) && (
              <div className="flex gap-2 overflow-x-auto">
                {editedIssue.photos.map((p, idx) => (
                  <img key={idx} src={toThumb(p)} alt={`issue-${idx}`} className="h-28 w-44 object-contain bg-black/20 rounded-lg cursor-pointer" onClick={() => setFullscreenImage(p)} onError={(e)=>{e.currentTarget.src=p}} />
                ))}
              </div>
            )}
          </div>

          {/* Action Button */}
          <button
            onClick={markResolved}
            disabled={editedIssue.status === 'resolved' || savingIssue}
            className={`w-full py-3 rounded-lg ${editedIssue.status === 'resolved' ? 'bg-gray-600' : 'bg-green-600'} text-white font-medium ${savingIssue ? 'opacity-50 cursor-wait' : ''}`}
          >
            {editedIssue.status === 'resolved' ? 'Already Resolved' : 'Mark as Resolved'}
          </button>
        </div>
      </div>
    );
  };

    const PeopleView = () => {
    const [form, setForm] = useState(getInitialContactForm());
    const [roleOptions, setRoleOptions] = useState([]);
    const [showAddContactForm, setShowAddContactForm] = useState(false);
    const [contactPicker, setContactPicker] = useState(null); // { category, role }
    const [pickerQuery, setPickerQuery] = useState('');
    const [pendingAssignment, setPendingAssignment] = useState(null);
    const [importingContacts, setImportingContacts] = useState(false);
  const [importError, setImportError] = useState('');

    // Persist Add Contact form state so it doesn't disappear when app loses focus
    const addContactStorageKey = useMemo(() => `people.addContact:${selectedProject?.id || 'global'}`, [selectedProject?.id]);

    // Hydrate saved Add Contact session (if any)
    useEffect(() => {
      try {
        const raw = localStorage.getItem(addContactStorageKey);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (saved && typeof saved === 'object') {
          if (saved.open) setShowAddContactForm(true);
          if (saved.form && typeof saved.form === 'object') {
            setForm(prev => ({ ...prev, ...saved.form }));
          }
        }
      } catch (_) {}
    }, [addContactStorageKey, setShowAddContactForm, setForm]);

    // Save Add Contact session while typing / toggling
    useEffect(() => {
      try {
        if (showAddContactForm) {
          localStorage.setItem(addContactStorageKey, JSON.stringify({ open: true, form }));
        } else {
          localStorage.removeItem(addContactStorageKey);
        }
      } catch (_) {}
    }, [showAddContactForm, form, addContactStorageKey]);
    const [addContactError, setAddContactError] = useState('');

    const projectId = selectedProject?.id;
    const stakeholderBundle = useMemo(
      () => (projectId && projectStakeholders[projectId]) || { internal: [], external: [] },
      [projectId, projectStakeholders]
    );


    // Role filtering is handled by StakeholderSlots and picker queries

    const assignmentsForRole = useCallback((role, category) => {
      const list = category === 'external' ? (stakeholderBundle.external || []) : (stakeholderBundle.internal || []);
      return list.filter(item => item.roleId === role.id);
    }, [stakeholderBundle]);

    const projectContactIds = useMemo(() => {
      const ids = new Set();
      (stakeholderBundle.external || []).forEach(entry => {
        if (entry.contact?.id) ids.add(entry.contact.id);
      });
      (stakeholderBundle.internal || []).forEach(entry => {
        if (entry.contact?.id) ids.add(entry.contact.id);
      });
      return ids;
    }, [stakeholderBundle]);

    useEffect(() => {
      const loadRoles = async () => {
        const { data, error } = await supabase
          .from('roles')
          .select('*')
          .eq('active', true)
          .order('sort_order', { ascending: true });
        if (!error) setRoleOptions((data || []).map(r => r.name));
      };
      loadRoles();
    }, []);

    // Ensure a new role string is saved globally and available in dropdowns
    const ensureRoleExists = useCallback(async (name) => {
      const roleName = (name || '').trim();
      if (!roleName || !supabase) return;
      const exists = roleOptions.some(opt => (opt || '').toLowerCase() === roleName.toLowerCase());
      if (!exists) {
        try {
          await supabase.from('roles').insert([{ name: roleName, active: true }]);
        } catch (_) {
          // ignore insert error (e.g., duplicates)
        }
        setRoleOptions(prev => {
          const next = [...prev, roleName];
          // de-dupe case-insensitively, then sort
          const deduped = [];
          const seen = new Set();
          next.forEach(n => {
            const key = (n || '').toLowerCase();
            if (!seen.has(key)) { seen.add(key); deduped.push(n); }
          });
          return deduped.sort((a, b) => (a || '').localeCompare(b || ''));
        });
      }
    }, [roleOptions, supabase]);

    const refreshStakeholders = useCallback(async () => {
      if (!projectId) return;
      console.log('refreshStakeholders: reloading stakeholders for project', projectId);
      await loadProjectStakeholders(projectId);
      console.log('refreshStakeholders: completed');
    }, [projectId, loadProjectStakeholders]);

    const assignInternal = useCallback(async (role, contactRecord) => {
      if (!projectId || !contactRecord?.id || !supabase) return;
      try {
        // Calculate the slot ID for this role
        const slotId = getSlotIdForRoleOnly('internal', role.name);
        console.log(`Assigning internal contact ${contactRecord.name} to role ${role.name} with slotId ${slotId}`);

        await supabase
          .from('project_internal_stakeholders')
          .upsert([
            {
              project_id: projectId,
              role_id: role.id,
              contact_id: contactRecord.id,
              is_primary: false
            }
          ], { onConflict: 'project_id,role_id' });

        await supabase
          .from('contacts')
          .update({ stakeholder_role_id: role.id, is_internal: true, is_primary: false })
          .eq('id', contactRecord.id);

        setAllContacts(prev => prev.map(c => (c.id === contactRecord.id ? { ...c, stakeholder_role_id: role.id, is_internal: true, is_primary: false } : c)));

        setContacts(prev => {
          const exists = prev.some(c => c.id === contactRecord.id);
          if (!exists) {
            const next = [...prev, { ...contactRecord, stakeholder_role_id: role.id, is_internal: true, is_primary: false }];
            next.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            return next;
          }
          return prev.map(c => c.id === contactRecord.id ? { ...c, stakeholder_role_id: role.id, is_internal: true, is_primary: false } : c);
        });

        await refreshStakeholders();
      } catch (err) {
        console.error('Failed to assign internal contact:', err);
        alert(err.message || 'Unable to assign contact');
      }
    }, [projectId, refreshStakeholders, getSlotIdForRoleOnly]);

    const assignExternal = useCallback(async (role, contactRecord) => {
      if (!projectId || !contactRecord?.id || !supabase) return;
      try {
        // Calculate the slot ID for this role
        const slotId = getSlotIdForRoleOnly('external', role.name);
        console.log(`Assigning external contact ${contactRecord.name} to role ${role.name} with slotId ${slotId}`);
        console.log('Role object:', role);
        console.log('Contact object:', contactRecord);

        // Ensure role has an ID - if not, it wasn't created properly
        if (!role.id) {
          console.error('Role missing ID - cannot assign contact');
          alert('Failed to create role. Please try again.');
          return;
        }

        const assignmentData = {
          project_id: projectId,
          contact_id: contactRecord.id,
          role_id: role.id,
          is_primary: false
        };
        console.log('Assignment data:', assignmentData);

        const { data: assignmentResult, error: assignmentError } = await supabase
          .from('project_external_stakeholders')
          .upsert([assignmentData], { onConflict: 'project_id,contact_id,role_id' })
          .select('*');
        
        if (assignmentError) {
          console.error('Assignment error:', assignmentError);
          throw assignmentError;
        }
        console.log('Assignment result:', assignmentResult);

        const { error: contactUpdateError } = await supabase
          .from('contacts')
          .update({ stakeholder_role_id: role.id, is_internal: false, is_primary: false })
          .eq('id', contactRecord.id);

        if (contactUpdateError) {
          console.error('Contact update error:', contactUpdateError);
          throw contactUpdateError;
        }

        setAllContacts(prev => prev.map(c => (c.id === contactRecord.id ? { ...c, stakeholder_role_id: role.id, is_internal: false, is_primary: false } : c)));
        setContacts(prev => {
          const exists = prev.some(c => c.id === contactRecord.id);
          if (!exists) {
            const next = [...prev, { ...contactRecord, stakeholder_role_id: role.id, is_internal: false, is_primary: false }];
            next.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            return next;
          }
          return prev.map(c => c.id === contactRecord.id ? { ...c, stakeholder_role_id: role.id, is_internal: false, is_primary: false } : c);
        });

        await refreshStakeholders();
      } catch (err) {
        console.error('Failed to assign external contact:', err);
        alert(err.message || 'Unable to assign contact');
      }
    }, [projectId, refreshStakeholders, getSlotIdForRoleOnly]);

    const handleSelectContact = async (contactId) => {
      if (!contactPicker) return;
      const contactRecord = allContacts.find(c => c.id === contactId);
      if (!contactRecord) return;

      console.log('handleSelectContact called with:', { contactId, contactPicker, contactRecord: contactRecord?.name });

      // Ensure we have a valid stakeholder role (id, name, category)
      let role = contactPicker.role || {};
      const category = contactPicker.category;
      const roleName = (role.name || '').trim();

      console.log('Role resolution:', { originalRole: role, category, roleName });

      // Try to resolve role by name if id is missing
      if (!role.id) {
        let match = stakeholderRoles.find(r => r.category === category && r.name.toLowerCase() === roleName.toLowerCase());
        
        if (!match && roleName) {
          // Create stakeholder role on-the-fly if not found
          console.log('Creating new stakeholder role:', { name: roleName, category });
          if (supabase) {
            try {
              // Try to create the role directly
              const { data: newRole, error: createError } = await supabase
                .from('stakeholder_roles')
                .insert([{ name: roleName, category }])
                .select('*')
                .single();
              
              if (createError) {
                console.error('Failed to create role:', createError);
                
                // If it's a unique constraint error, try to find the existing role
                if (createError.code === '23505' || createError.message?.includes('unique')) {
                  const { data: existingRole } = await supabase
                    .from('stakeholder_roles')
                    .select('*')
                    .eq('name', roleName)
                    .eq('category', category)
                    .single();
                  
                  if (existingRole) {
                    console.log('Found existing role after unique constraint:', existingRole);
                    match = existingRole;
                    setStakeholderRoles(prev => {
                      const exists = prev.some(r => r.id === existingRole.id);
                      return exists ? prev : [...prev, existingRole];
                    });
                  } else {
                    // Try creating with a modified name
                    const modifiedName = `${roleName} (${category.charAt(0).toUpperCase() + category.slice(1)})`;
                    const { data: modifiedRole, error: modifiedError } = await supabase
                      .from('stakeholder_roles')
                      .insert([{ name: modifiedName, category }])
                      .select('*')
                      .single();
                    
                    if (modifiedRole) {
                      console.log('Created role with modified name:', modifiedRole);
                      match = modifiedRole;
                      setStakeholderRoles(prev => [...prev, modifiedRole]);
                    } else {
                      console.error('Failed to create modified role:', modifiedError);
                      alert(`Failed to create role "${roleName}". Please try again with a different name.`);
                      return;
                    }
                  }
                } else {
                  alert(`Failed to create role "${roleName}". Error: ${createError.message}`);
                  return;
                }
              } else if (newRole) {
                console.log('Successfully created new role:', newRole);
                match = newRole;
                setStakeholderRoles(prev => [...prev, newRole]);
              }
            } catch (createError) {
              console.error('Error in role creation process:', createError);
              alert(`Failed to create role "${roleName}". Please try again.`);
              return;
            }
          }
        }
        
        if (match) {
          role = match;
          console.log('Resolved role to:', role);
        } else {
          alert(`Could not create role "${roleName}". Please try again.`);
          return;
        }
      }

      try {
        console.log('About to assign contact:', { role, category, contactRecord: contactRecord?.name });
        if (category === 'external') {
          await assignExternal(role, contactRecord);
        } else {
          await assignInternal(role, contactRecord);
        }
        console.log('Assignment completed successfully');
      } catch (err) {
        console.error('Assignment failed:', err);
        alert(err.message || 'Failed to assign contact');
      } finally {
        setContactPicker(null);
        setPickerQuery('');
      }
    };

    const availableContactsForPicker = useMemo(() => {
      if (!contactPicker) return [];
      const query = pickerQuery.trim().toLowerCase();
      const assignedIds = new Set(assignmentsForRole(contactPicker.role, contactPicker.category)
        .map(entry => (entry.contact?.id || entry.contactId))
        .filter(Boolean));
      return allContacts
        .filter(contact => !assignedIds.has(contact.id))
        .filter(contact => {
          if (!query) return true;
          const target = `${contact.name || ''} ${contact.email || ''} ${contact.company || ''}`.toLowerCase();
          return target.includes(query);
        })
        .sort((a, b) => {
          const aInProject = projectContactIds.has(a.id);
          const bInProject = projectContactIds.has(b.id);
          if (aInProject && !bInProject) return -1;
          if (!aInProject && bInProject) return 1;
          return (a.name || '').localeCompare(b.name || '');
        });
    }, [contactPicker, pickerQuery, allContacts, assignmentsForRole, projectContactIds]);

    const handleStartAddContact = () => {
      if (!contactPicker) return;
      setPendingAssignment(contactPicker);
      setShowAddContactForm(true);
      setForm(prev => ({ ...prev, role: contactPicker.role.name }));
      setContactPicker(null);
      setPickerQuery('');
    };

    const add = async () => {
      const first = form.firstName.trim();
      const last = form.lastName.trim();
      const email = form.email.trim();
      if (!first && !last && !email) {
        setAddContactError('Provide a name or email for the contact.');
        return;
      }
      if (!supabase) {
        setAddContactError('Supabase not configured');
        return;
      }
      try {
        const fullName = [first, last].filter(Boolean).join(' ').trim();
        const payload = {
          first_name: first || null,
          last_name: last || null,
          name: fullName || email || 'Contact',
          role: form.role || null,
          email: email || null,
          phone: form.phone.trim() || null,
          company: form.company.trim() || null,
          address: form.address.trim() || null,
          report: form.report
        };
        const { data, error } = await supabase.from('contacts').insert([payload]).select('*').single();
        if (error) throw error;

        setAllContacts(prev => {
          const next = [...prev, data];
          next.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          return next;
        });
        setContacts(prev => {
          const next = [...prev, data];
          next.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          return next;
        });

  setAddContactError('');
  setShowAddContactForm(false);
  try { localStorage.removeItem(addContactStorageKey); } catch (_) {}
  setForm(getInitialContactForm());

        // Ensure any free-typed role becomes a global role option
        if (payload.role) {
          try { await ensureRoleExists(payload.role); } catch (_) {}
        }

        if (pendingAssignment) {
          if (pendingAssignment.category === 'external') {
            await assignExternal(pendingAssignment.role, data);
          } else {
            await assignInternal(pendingAssignment.role, data);
          }
          setPendingAssignment(null);
        }
      } catch (err) {
        setAddContactError(err.message || 'Unable to create contact');
      }
    };

    const removeInternal = async (assignment) => {
      if (!projectId || !assignment?.id || !supabase) return;
      if (!window.confirm('Remove this internal stakeholder?')) return;
      const { error } = await supabase.from('project_internal_stakeholders').delete().eq('id', assignment.id);
      if (error) {
        alert(error.message);
        return;
      }
      await refreshStakeholders();
    };

    const removeExternal = async (assignment) => {
      if (!projectId || !assignment?.id || !supabase) return;
      if (!window.confirm('Remove this external stakeholder?')) return;
      const { error } = await supabase.from('project_external_stakeholders').delete().eq('id', assignment.id);
      if (error) {
        alert(error.message);
        return;
      }
      await refreshStakeholders();
    };

    const importFromMicrosoft = async () => {
      if (!projectId) { alert('Select a project first.'); return; }
      if (!supabase) { alert('Supabase not configured'); return; }
      try {
        setImportingContacts(true);
        setImportError('');
        const { data: sessionData } = await supabase.auth.getSession();
        const access = sessionData?.session?.provider_token;
        if (!access) {
          setImportingContacts(false);
          alert('Connect your Microsoft account to import contacts.');
          return;
        }

        const existingEmails = new Set(
          allContacts
            .map(c => (c.email || '').toLowerCase())
            .filter(Boolean)
        );

        let nextLink = 'https://graph.microsoft.com/v1.0/me/contacts?$top=200';
        const collected = [];
        while (nextLink && collected.length < 400) {
          const resp = await fetch(nextLink, {
            headers: { Authorization: `Bearer ${access}` }
          });
          if (!resp.ok) {
            const text = await resp.text();
            throw new Error(text || 'Failed to fetch contacts from Microsoft');
          }
          const json = await resp.json();
          const batch = Array.isArray(json.value) ? json.value : [];
          collected.push(...batch);
          nextLink = json['@odata.nextLink'] || null;
        }

        const payloads = [];
        const dedupe = new Set(existingEmails);

        collected.forEach(item => {
          const name = (item.displayName || '').trim();
          const email = (item.emailAddresses?.[0]?.address || '').trim();
          const emailKey = email.toLowerCase();
          if (!name && !email) return;
          if (email && dedupe.has(emailKey)) return;
          if (email) dedupe.add(emailKey);
          const phone = item.mobilePhone || item.businessPhones?.[0] || item.homePhones?.[0] || '';
          const role = item.jobTitle || '';
          const company = item.companyName || '';
          payloads.push({
            name: name || email || 'Contact',
            email: email || null,
            phone,
            role,
            company,
            report: false
          });
        });

        if (!payloads.length) {
          alert('No new contacts to import.');
          return;
        }

        const { data, error } = await supabase
          .from('contacts')
          .insert(payloads)
          .select('*');
        if (error) throw error;

        const inserted = data || [];
        if (inserted.length) {
          setAllContacts(prev => {
            const next = [...prev, ...inserted];
            next.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            return next;
          });
          setContacts(prev => {
            const next = [...prev, ...inserted];
            next.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            return next;
          });
          alert(`Imported ${inserted.length} contact${inserted.length === 1 ? '' : 's'} from Microsoft`);
        }
      } catch (err) {
        setImportError(err.message || 'Failed to import Microsoft contacts');
      } finally {
        setImportingContacts(false);
      }
    };

    const openPicker = (role, category) => {
      console.log('openPicker called with:', { role, category });
      setContactPicker({ role, category });
      setPickerQuery('');
      setPendingAssignment(null);
    };

    const closePicker = () => {
      setContactPicker(null);
      setPickerQuery('');
    };

    const ContactPicker = ({ role, category }) => (
      <div className={`mt-3 p-3 rounded-lg ${t.surface} border ${t.border} space-y-3`}>
        <div className="flex items-center justify-between">
          <h4 className={`text-sm font-semibold ${t.text}`}>Assign {role.name}</h4>
          <button 
            type="button" 
            className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition-colors" 
            onClick={closePicker}
          >
            Close
          </button>
        </div>
        <input
          value={pickerQuery}
          onChange={(e) => setPickerQuery(e.target.value)}
          placeholder="Search contacts..."
          className={`w-full px-3 py-2 rounded ${t.surfaceHover} ${t.text} border ${t.border} placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500`}
          autoFocus
        />
        <div className="max-h-48 overflow-y-auto space-y-1">
          {availableContactsForPicker.length === 0 ? (
            <p className={`text-xs ${t.textSecondary}`}>No matching contacts.</p>
          ) : (
            availableContactsForPicker.map(contact => (
              <button
                key={contact.id}
                type="button"
                onClick={() => handleSelectContact(contact.id)}
                className={`block w-full text-left px-3 py-2 text-sm rounded ${t.surfaceHover} hover:${t.surface} border ${t.border} transition-colors`}
              >
                <span className={`font-medium ${t.text}`}>{contact.name || 'Contact'}</span>
                {contact.email && <span className={`${t.textSecondary}`}> · {contact.email}</span>}
                {projectContactIds.has(contact.id) && (
                  <span className="text-xs bg-blue-600/20 text-blue-200 px-1 py-0.5 rounded ml-2">
                    In Project
                  </span>
                )}
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-between text-xs">
          <button 
            type="button" 
            className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors" 
            onClick={handleStartAddContact}
          >
            Add new contact
          </button>
          <span className={t.textSecondary}>Need someone new?</span>
        </div>
      </div>
    );

    // Legacy renderRoleGroup removed; StakeholderSlots handles grouped rendering

    return (
      <div className={`min-h-screen ui-bg relative z-10`}>
        <div className={`ui-surface ui-border px-4 py-3`}>
          <div className="flex items-center justify-between">
            <button 
              onClick={() => setCurrentView(selectedProject ? 'project' : 'dashboard')} 
              className="ui-btn ui-btn--secondary p-2"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className={`text-lg font-semibold ui-text`}>People</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={clearUnwantedCustomSlots}
                className="ui-btn ui-btn--secondary text-xs"
              >
                Reset Slots
              </button>
              <button
                onClick={importFromMicrosoft}
                disabled={importingContacts}
                className={`ui-btn ui-btn--secondary text-xs ${importingContacts ? 'opacity-60 cursor-wait' : ''}`}
              >
                {importingContacts ? 'Importing…' : 'Import Contacts'}
              </button>
              <button
                onClick={() => { setShowAddContactForm(true); setPendingAssignment(null); }}
                className="ui-btn ui-btn--primary text-xs"
              >
                New Contact
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {importError && <div className="text-sm text-red-400">{importError}</div>}

          {showAddContactForm && (
            <div className={`p-4 rounded-xl ${t.surface} border ${t.border} space-y-3`}>
              <h3 className={`font-semibold ${t.text}`}>Add Contact</h3>
              {addContactError && <div className="text-sm text-red-400">{addContactError}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input 
                  className={`px-3 py-2 rounded ${t.surfaceHover} ${t.text} border ${t.border}`} 
                  placeholder="First name" 
                  value={form.firstName} 
                  onChange={e => setForm({ ...form, firstName: e.target.value })} 
                />
                <input 
                  className={`px-3 py-2 rounded ${t.surfaceHover} ${t.text} border ${t.border}`} 
                  placeholder="Last name" 
                  value={form.lastName} 
                  onChange={e => setForm({ ...form, lastName: e.target.value })} 
                />
                <input 
                  className={`px-3 py-2 rounded ${t.surfaceHover} ${t.text} border ${t.border}`} 
                  placeholder="Email" 
                  type="email"
                  value={form.email} 
                  onChange={e => setForm({ ...form, email: e.target.value })} 
                />
                <input 
                  className={`px-3 py-2 rounded ${t.surfaceHover} ${t.text} border ${t.border}`} 
                  placeholder="Phone" 
                  type="tel"
                  value={form.phone} 
                  onChange={e => setForm({ ...form, phone: e.target.value })} 
                />
                <input 
                  className={`px-3 py-2 rounded ${t.surfaceHover} ${t.text} border ${t.border}`} 
                  placeholder="Company" 
                  value={form.company} 
                  onChange={e => setForm({ ...form, company: e.target.value })} 
                />
                <input 
                  className={`px-3 py-2 rounded ${t.surfaceHover} ${t.text} border ${t.border}`} 
                  placeholder="Address" 
                  value={form.address} 
                  onChange={e => setForm({ ...form, address: e.target.value })} 
                />
                <select 
                  className={`px-3 py-2 rounded ${t.surfaceHover} ${t.text} border ${t.border}`} 
                  value={form.role} 
                  onChange={e => setForm({ ...form, role: e.target.value })}
                >
                  <option value="">Select role</option>
                  {roleOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className={`px-3 py-2 rounded ${t.surface} ${t.text} border ${t.border} hover:${t.surfaceHover} transition-colors`}
                  onClick={async () => {
                    const name = (prompt('New role name:') || '').trim();
                    if (!name) return;
                    if (!supabase) return;
                    const { error } = await supabase.from('roles').insert([{ name, active: true }]);
                    if (error) {
                      alert(error.message);
                      return;
                    }
                    setRoleOptions(prev => [...new Set([...prev, name])]);
                    setForm(prev => ({ ...prev, role: name }));
                  }}
                >
                  + Add Role
                </button>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <input 
                  type="checkbox" 
                  id="report-checkbox" 
                  checked={form.report} 
                  onChange={e => setForm({ ...form, report: e.target.checked })} 
                  className="rounded"
                />
                <label htmlFor="report-checkbox" className={t.text}>Include on daily reports</label>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={add} 
                  className="ui-btn ui-btn--primary text-sm font-medium"
                >
                  Save Contact
                </button>
                <button 
                  onClick={() => { 
                    setShowAddContactForm(false); 
                    setPendingAssignment(null); 
                    try { localStorage.removeItem(addContactStorageKey); } catch (_) {}
                    setForm(getInitialContactForm()); 
                  }} 
                  className={`ui-btn ui-btn--secondary text-sm font-medium`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-6 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
            {!projectId ? (
              <div className={`p-6 rounded-xl ${t.surface} border ${t.border} text-center`}>
                <Users size={48} className={`${t.textSecondary} mx-auto mb-3`} />
                <h3 className={`text-lg font-semibold ${t.text} mb-2`}>No Project Selected</h3>
                <p className={`text-sm ${t.textSecondary} mb-4`}>
                  People are organized by project. Please select a project first to view and manage its team members and stakeholders.
                </p>
                <button 
                  onClick={() => setCurrentView(userRole === 'pm' ? 'pmDashboard' : 'dashboard')} 
                  className="ui-btn ui-btn--primary"
                >
                  Back to Dashboard
                </button>
              </div>
            ) : (
              <>
                {contactPicker && (
                  <ContactPicker role={contactPicker.role} category={contactPicker.category} />
                )}
                <section className="space-y-3">
                  <h2 className={`text-sm font-semibold uppercase tracking-wide ${t.textSecondary}`}>External Stakeholders</h2>
                  <StakeholderSlots
                    stakeholders={stakeholderBundle.external || []}
                    theme={t}
                    category="external"
                    customSlots={customSlots.external}
                    onAddPerson={(roleOrSlot) => {
                      console.log('External add person called with:', roleOrSlot);
                      
                      // If it's a role object (from "Add New Role"), use it directly
                      let role;
                      if (roleOrSlot.category) {
                        role = roleOrSlot;
                      } else {
                        // It's a slot, extract the role
                        if (roleOrSlot.isDynamic && roleOrSlot.roleId) {
                          role = stakeholderRoles.find(r => r.id === roleOrSlot.roleId);
                        }
                        if (!role) {
                          role = { id: null, name: roleOrSlot.title, category: 'external' };
                        }
                      }
                      
                      console.log('External role resolved to:', role);
                      openPicker(role, 'external');
                    }}
                    onRemovePerson={(assignment) => {
                      // assignment is the external stakeholder entry
                      removeExternal(assignment);
                    }}
                    onUpdateContact={async (updatedContact) => {
                      if (!supabase) return;
                      try {
                        const payload = {
                          name: ([updatedContact.first_name, updatedContact.last_name].filter(Boolean).join(' ') || updatedContact.name || '').trim() || null,
                          email: (updatedContact.email || '').trim() || null,
                          phone: (updatedContact.phone || '').trim() || null,
                          address: (updatedContact.address || '').trim() || null,
                          company: (updatedContact.company || '').trim() || null,
                          role: (updatedContact.role || '').trim() || null
                        };
                        await supabase.from('contacts').update(payload).eq('id', updatedContact.id);
                        setAllContacts(prev => prev.map(c => c.id === updatedContact.id ? { ...c, ...payload } : c));
                        await refreshStakeholders();
                        if (payload.role) { await ensureRoleExists(payload.role); }
                      } catch (err) {
                        alert(err.message || 'Unable to update contact');
                      }
                    }}
                    onAddCustomSlot={(slot) => {
                      setCustomSlots(prev => ({
                        ...prev,
                        external: [...prev.external, slot]
                      }));
                    }}
                    onRemoveCustomSlot={(slotId) => {
                      setCustomSlots(prev => ({
                        ...prev,
                        external: prev.external.filter(s => s.id !== slotId)
                      }));
                    }}
                  />
                </section>

                <section className="space-y-3">
                  <h2 className={`text-sm font-semibold uppercase tracking-wide ${t.textSecondary}`}>Internal Team</h2>
                  <StakeholderSlots
                    stakeholders={stakeholderBundle.internal || []}
                    theme={t}
                    category="internal"
                    customSlots={customSlots.internal}
                    onAddPerson={(roleOrSlot) => {
                      console.log('Internal add person called with:', roleOrSlot);
                      
                      // If it's a role object (from "Add New Role"), use it directly
                      let role;
                      if (roleOrSlot.category) {
                        role = roleOrSlot;
                      } else {
                        // It's a slot, extract the role
                        if (roleOrSlot.isDynamic && roleOrSlot.roleId) {
                          role = stakeholderRoles.find(r => r.id === roleOrSlot.roleId);
                        }
                        if (!role) {
                          role = { id: null, name: roleOrSlot.title, category: 'internal' };
                        }
                      }
                      
                      console.log('Internal role resolved to:', role);
                      openPicker(role, 'internal');
                    }}
                    onRemovePerson={(assignment) => {
                      removeInternal(assignment);
                    }}
                    onUpdateContact={async (updatedContact) => {
                      if (!supabase) return;
                      try {
                        const payload = {
                          name: ([updatedContact.first_name, updatedContact.last_name].filter(Boolean).join(' ') || updatedContact.name || '').trim() || null,
                          email: (updatedContact.email || '').trim() || null,
                          phone: (updatedContact.phone || '').trim() || null,
                          address: (updatedContact.address || '').trim() || null,
                          company: (updatedContact.company || '').trim() || null,
                          role: (updatedContact.role || '').trim() || null
                        };
                        await supabase.from('contacts').update(payload).eq('id', updatedContact.id);
                        setAllContacts(prev => prev.map(c => c.id === updatedContact.id ? { ...c, ...payload } : c));
                        await refreshStakeholders();
                        if (payload.role) { await ensureRoleExists(payload.role); }
                      } catch (err) {
                        alert(err.message || 'Unable to update contact');
                      }
                    }}
                    onAddCustomSlot={(slot) => {
                      setCustomSlots(prev => ({
                        ...prev,
                        internal: [...prev.internal, slot]
                      }));
                    }}
                    onRemoveCustomSlot={(slotId) => {
                      setCustomSlots(prev => ({
                        ...prev,
                        internal: prev.internal.filter(s => s.id !== slotId)
                      }));
                    }}
                  />
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };


// PM Dashboard
  const PMDashboard = () => (
    <div className={`min-h-screen ${t.bg} relative z-10`}>
      {/* Header */}
      <div className={`${t.bgSecondary} border-b ${t.border} px-4 py-3`}>
        <div className="flex items-center justify-between">
          <h1 className={`text-lg font-semibold ${t.text}`}>Project Manager Dashboard</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setUserRole('technician')} className="p-2 bg-black text-white text-sm rounded">
              Switch to Tech
            </button>
            <button onClick={() => setDarkMode(!darkMode)} className="p-2 bg-black text-white rounded">
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="p-4 grid grid-cols-2 gap-3">
        <div className={`p-4 rounded-xl ${t.surface} border ${t.border}`}>
          <p className={`text-xs ${t.textSecondary}`}>Active Projects</p>
          <p className={`text-2xl font-bold ${t.text}`}>{projects.length}</p>
        </div>
        <div className={`p-4 rounded-xl ${t.surface} border ${t.border}`}>
          <p className={`text-xs ${t.textSecondary}`}>Total Wire Drops</p>
          <p className={`text-2xl font-bold ${t.text}`}>
            {projects.reduce((sum, p) => sum + (p.wireDrops?.length || 0), 0)}
          </p>
        </div>
        <div className={`p-4 rounded-xl ${t.surface} border ${t.border}`}>
          <p className={`text-xs ${t.textSecondary}`}>Open Issues</p>
          <p className={`text-2xl font-bold ${t.text}`}>
            {issues.filter(i => i.status !== 'resolved').length}
          </p>
        </div>
        <div className={`p-4 rounded-xl ${t.surface} border ${t.border}`}>
          <p className={`text-xs ${t.textSecondary}`}>Team Members</p>
          <p className={`text-2xl font-bold ${t.text}`}>6</p>
        </div>
      </div>

      {/* Projects List */}
      <div className="px-4 pb-20">
        <div className="flex items-center justify-between mb-3">
          <h2 className={`text-lg font-semibold ${t.text}`}>Projects</h2>
          <button 
            onClick={() => {
              setSelectedProject(null);
              setCurrentView('projectForm');
            }}
            className="p-2 bg-black text-white rounded"
          >
            <Plus size={20} />
          </button>
        </div>
        
        {projects.map(project => {
          const progress = calculateProjectProgress(project);
          const openIssues = issues.filter(i => i.projectId === project.id && i.status !== 'resolved').length;
          
          return (
            <div key={project.id} className={`mb-3 p-4 rounded-xl ${t.surface} border ${t.border}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className={`font-medium ${t.text}`}>{project.name}</p>
                  <p className={`text-sm ${t.textSecondary}`}>{project.client}</p>
                  <p className={`text-xs ${t.textSecondary}`}>{project.address}</p>
                </div>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                  progress === 100 ? 'bg-green-600 text-white' :
                  progress > 50 ? 'bg-orange-600 text-white' :
                  'bg-red-600 text-white'
                }`}>
                  {progress}%
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="h-2 bg-gray-700 rounded-full mb-3">
                <div 
                  className={`h-full rounded-full ${
                    progress > 70 ? t.success : 
                    progress > 40 ? t.warning : 
                    t.danger
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              
              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className={`p-2 rounded-lg ${t.surfaceHover} text-center`}>
                  <p className={`text-xs ${t.textSecondary}`}>Wire Drops</p>
                  <p className={`font-medium ${t.text}`}>{project.wireDrops?.length || 0}</p>
                </div>
                <div className={`p-2 rounded-lg ${t.surfaceHover} text-center`}>
                  <p className={`text-xs ${t.textSecondary}`}>Issues</p>
                  <p className={`font-medium ${openIssues > 0 ? 'text-red-500' : t.text}`}>{openIssues}</p>
                </div>
                <div className={`p-2 rounded-lg ${t.surfaceHover} text-center`}>
                  <p className={`text-xs ${t.textSecondary}`}>Team</p>
                  <p className={`font-medium ${t.text}`}>{project.team?.length || 0}</p>
                </div>
              </div>
              
              {/* Actions */}
              <div className="grid grid-cols-3 gap-2">
                <button 
                  onClick={() => {
                    setSelectedProject(project);
                    setCurrentView('pmProjectDetail');
                  }}
                  className={`py-2 rounded-lg ${t.surfaceHover} ${t.text} text-sm hover:${t.accentText}`}
                >
                  <Edit2 size={16} className="inline mr-1" />
                  Edit
                </button>
                <button 
                  onClick={() => {
                    // Generate and download report
                    alert('Report generation would be implemented here');
                  }}
                  className={`py-2 rounded-lg ${t.surfaceHover} ${t.text} text-sm hover:${t.accentText}`}
                >
                  <BarChart size={16} className="inline mr-1" />
                  Report
                </button>
                <button 
                  onClick={() => openLink(project.oneDriveFiles)}
                  className={`py-2 rounded-lg ${t.surfaceHover} ${t.text} text-sm hover:${t.accentText}`}
                >
                  <FolderOpen size={16} className="inline mr-1" />
                  Files
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // PM Project Detail View
  const PMProjectDetail = () => {
    const [editableProject, setEditableProject] = useState(
      selectedProject || {
        id: '', name: '', client: '', address: '', phase: '',
        startDate: '', endDate: '', wiringDiagramUrl: '', portalProposalUrl: '',
        oneDrivePhotos: '', oneDriveFiles: '', oneDriveProcurement: '',
        stakeholders: [], team: [], wireDrops: []
      }
    );
    const [importingDrops, setImportingDrops] = useState(false);
    const [importSummary, setImportSummary] = useState(null);
    const [importError, setImportError] = useState('');

    if (!selectedProject) return null;

    const handleSave = () => {
      setProjects(prev => prev.map(p => p.id === editableProject.id ? editableProject : p));
      alert('Project updated!');
      setCurrentView('pmDashboard');
    };

    const sendWeeklyReport = () => {
      const recipients = (contacts || []).filter(c => c.report && c.email).map(c => c.email)
  if (!recipients.length) return alert('No report recipients configured in People')
      const subject = encodeURIComponent(`Project Report - ${editableProject?.name || ''} - ${new Date().toLocaleDateString()}`)
      const body = encodeURIComponent(`Summary for ${editableProject?.name || ''}\n\nOpen issues: ${(issues||[]).filter(i=>i.projectId===editableProject?.id && i.status!=='resolved').length}\n\nSent from Unicorn App`)
      window.location.href = `mailto:${recipients.join(',')}?subject=${subject}&body=${body}`
    };

    const handleImportWireDrops = () => {
      if (!editableProject?.id) {
        alert('Save the project before importing wire drops.');
        return;
      }
      if (!supabase) {
        setImportError('Supabase not configured');
        return;
      }
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.csv';
      input.onchange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
          setImportingDrops(true);
          setImportError('');
          setImportSummary(null);
          const text = await file.text();
          const rows = parseWireDropCsv(text);
          if (!rows.length) {
            setImportError('No data rows found in the CSV file.');
            return;
          }
          const results = { success: 0, failed: 0, errors: [] };
          for (let index = 0; index < rows.length; index++) {
            const record = rows[index];
            const pick = (...names) => {
              for (const name of names) {
                const value = record[name];
                if (value !== undefined && value !== null && String(value).trim() !== '') {
                  return String(value).trim();
                }
              }
              return '';
            };
            const payload = {
              project_id: editableProject.id,
              uid: generateWireDropUid(),
              name: pick('name', 'wire drop name', 'drop name') || `Drop ${results.success + results.failed + 1}`,
              location: pick('location', 'loc', 'room') || 'Unspecified',
              type: pick('type', 'wire type') || 'CAT6',
              prewire_photo: pick('prewire photo', 'prewire', 'prewire_photo') || null,
              installed_photo: pick('installed photo', 'installed', 'installed_photo') || null,
            };

            let attempts = 0;
            let inserted = false;
            while (attempts < 2 && !inserted) {
              try {
                const { error } = await supabase
                  .from('wire_drops')
                  .insert([payload]);
                if (error) throw error;
                results.success += 1;
                inserted = true;
              } catch (err) {
                const message = String(err.message || '').toLowerCase();
                if (message.includes('duplicate') && attempts === 0) {
                  payload.uid = generateWireDropUid();
                  attempts += 1;
                } else {
                  results.failed += 1;
                  results.errors.push({ row: index + 1, message: err.message });
                  inserted = true;
                }
              }
            }
          }
          await loadWireDrops(editableProject.id);
          setImportSummary(results);
        } catch (err) {
          setImportError(err.message || 'Failed to import wire drops');
        } finally {
          setImportingDrops(false);
          event.target.value = '';
        }
      };
      input.click();
    };

    return (
      <div className={`min-h-screen ${t.bg} relative z-10 pointer-events-auto`}>
        {/* Header */}
        <div className={`${t.bgSecondary} border-b ${t.border} px-4 py-3`}>
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentView('pmDashboard')} className="p-2 bg-black text-white rounded">
              <ArrowLeft size={24} />
            </button>
            <h1 className={`text-lg font-semibold ${t.text}`}>Project Details</h1>
            <button onClick={handleSave} className="p-2 bg-black text-white rounded">
              <Save size={20} />
            </button>
          </div>
        </div>

        <div className="p-4">
          {/* Project Info */}
          <div className={`mb-4 p-4 rounded-xl ${t.surface} border ${t.border}`}>
            <h3 className={`font-medium ${t.text} mb-3`}>Project Information</h3>
            <div className="space-y-2">
              <input
                type="text"
                value={editableProject.name}
                onChange={(e) => setEditableProject({...editableProject, name: e.target.value})}
                className={`w-full px-3 py-2 rounded-lg ${t.surfaceHover} ${t.text} border ${t.border}`}
                placeholder="Project Name"
              />
              <input
                type="text"
                value={editableProject.client}
                onChange={(e) => setEditableProject({...editableProject, client: e.target.value})}
                className={`w-full px-3 py-2 rounded-lg ${t.surfaceHover} ${t.text} border ${t.border}`}
                placeholder="Client"
              />
              <input
                type="text"
                value={editableProject.address}
                onChange={(e) => setEditableProject({...editableProject, address: e.target.value})}
                className={`w-full px-3 py-2 rounded-lg ${t.surfaceHover} ${t.text} border ${t.border}`}
                placeholder="Address"
              />
            </div>
          </div>

          {/* Core Links */}
          <div className={`mb-4 p-4 rounded-xl ${t.surface} border ${t.border}`}>
            <h3 className={`font-medium ${t.text} mb-3`}>Core Project Links</h3>
            <div className="space-y-3">
              <div>
                <label className={`text-sm ${t.textSecondary} block mb-1`}>Wiring Diagram (Lucid Chart)</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={editableProject.wiringDiagramUrl}
                    onChange={(e) => setEditableProject({...editableProject, wiringDiagramUrl: e.target.value})}
                    className={`flex-1 px-3 py-2 rounded-lg ${t.surfaceHover} ${t.text} border ${t.border}`}
                    placeholder="Lucid Chart URL"
                  />
                  <button 
                    onClick={() => openLink(editableProject.wiringDiagramUrl)}
                    className={`px-3 py-2 rounded-lg ${t.accent} text-white`}
                  >
                    <ExternalLink size={16} />
                  </button>
                </div>
              </div>
              <div>
                <label className={`text-sm ${t.textSecondary} block mb-1`}>Portal Proposal</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={editableProject.portalProposalUrl}
                    onChange={(e) => setEditableProject({...editableProject, portalProposalUrl: e.target.value})}
                    className={`flex-1 px-3 py-2 rounded-lg ${t.surfaceHover} ${t.text} border ${t.border}`}
                    placeholder="Portal Proposal URL"
                  />
                  <button 
                    onClick={() => openLink(editableProject.portalProposalUrl)}
                    className={`px-3 py-2 rounded-lg ${t.accent} text-white`}
                  >
                    <ExternalLink size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* OneDrive Integration */}
          <div className={`mb-4 p-4 rounded-xl ${t.surface} border ${t.border}`}>
            <h3 className={`font-medium ${t.text} mb-3`}>OneDrive Integration</h3>
            <div className="space-y-3">
              <div>
                <label className={`text-sm ${t.textSecondary} block mb-1`}>Photos Folder</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={editableProject.oneDrivePhotos}
                    onChange={(e) => setEditableProject({...editableProject, oneDrivePhotos: e.target.value})}
                    className={`flex-1 px-3 py-2 rounded-lg ${t.surfaceHover} ${t.text} border ${t.border}`}
                    placeholder="OneDrive Photos Folder URL"
                  />
                  <button 
                    onClick={() => openLink(editableProject.oneDrivePhotos)}
                    className={`px-3 py-2 rounded-lg ${t.accent} text-white`}
                  >
                    <ExternalLink size={16} />
                  </button>
                </div>
              </div>
              <div>
                <label className={`text-sm ${t.textSecondary} block mb-1`}>Files Folder</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={editableProject.oneDriveFiles}
                    onChange={(e) => setEditableProject({...editableProject, oneDriveFiles: e.target.value})}
                    className={`flex-1 px-3 py-2 rounded-lg ${t.surfaceHover} ${t.text} border ${t.border}`}
                    placeholder="OneDrive Files Folder URL"
                  />
                  <button 
                    onClick={() => openLink(editableProject.oneDriveFiles)}
                    className={`px-3 py-2 rounded-lg ${t.accent} text-white`}
                  >
                    <ExternalLink size={16} />
                  </button>
                </div>
              </div>
              <div>
                <label className={`text-sm ${t.textSecondary} block mb-1`}>Procurement Folder</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={editableProject.oneDriveProcurement}
                    onChange={(e) => setEditableProject({...editableProject, oneDriveProcurement: e.target.value})}
                    className={`flex-1 px-3 py-2 rounded-lg ${t.surfaceHover} ${t.text} border ${t.border}`}
                    placeholder="OneDrive Procurement Folder URL"
                  />
                  <button 
                    onClick={() => openLink(editableProject.oneDriveProcurement)}
                    className={`px-3 py-2 rounded-lg ${t.accent} text-white`}
                  >
                    <ExternalLink size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Wire Drops Management */}
          <div className={`mb-4 p-4 rounded-xl ${t.surface} border ${t.border}`}>
            <h3 className={`font-medium ${t.text} mb-3`}>Wire Drops ({editableProject.wireDrops?.length || 0})</h3>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={handleImportWireDrops}
                disabled={importingDrops}
                className={`py-2 rounded-lg ${t.surfaceHover} ${t.text} text-sm ${importingDrops ? 'opacity-50 cursor-wait' : ''}`}
              >
                <Upload size={16} className="inline mr-2" />
                {importingDrops ? 'Importing…' : 'Import CSV'}
              </button>
              <button 
                onClick={() => {
                  setSelectedProject(editableProject);
                  setCurrentView('wireDropList');
                }}
                className={`py-2 rounded-lg ${t.accent} text-white text-sm`}
              >
                <Zap size={16} className="inline mr-2" />
                Manage Drops
              </button>
            </div>
            {(importSummary || importError) && (
              <div className="mt-3 text-xs">
                {importError && <div className="text-red-400 mb-1">{importError}</div>}
                {importSummary && (
                  <div className={`${t.textSecondary}`}>
                    Imported {importSummary.success} drop{importSummary.success === 1 ? '' : 's'}{importSummary.failed ? `, ${importSummary.failed} failed` : ''}.
                    {importSummary.errors?.length ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer">View errors</summary>
                        <ul className="list-disc pl-4">
                          {importSummary.errors.slice(0, 5).map((err, idx) => (
                            <li key={idx}>{`Row ${err.row}: ${err.message}`}</li>
                          ))}
                          {importSummary.errors.length > 5 && <li>+ {importSummary.errors.length - 5} more</li>}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stakeholder Report */}
          <div className={`mb-4 p-4 rounded-xl ${t.surface} border ${t.border}`}>
            <h3 className={`font-medium ${t.text} mb-3`}>Stakeholder Report</h3>
            <p className={`text-sm ${t.textSecondary} mb-3`}>
              Weekly report will include project progress, open issues, and completed items.
            </p>
            <div className="space-y-2 mb-3">
              {editableProject.stakeholders?.map((email, idx) => (
                <div key={idx} className={`px-3 py-2 rounded-lg ${t.surfaceHover} text-sm ${t.text} flex items-center justify-between`}>
                  <div className="flex items-center">
                    <Mail size={14} className="inline mr-2" />
                    {email}
                  </div>
                  <button 
                    onClick={() => {
                      const updated = {...editableProject};
                      updated.stakeholders = updated.stakeholders.filter((_, i) => i !== idx);
                      setEditableProject(updated);
                    }}
                    className="text-red-500"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button 
              onClick={sendWeeklyReport}
              className={`w-full py-2 rounded-lg ${t.accent} text-white text-sm`}
            >
              <Send size={16} className="inline mr-2" />
              Send Weekly Report Now
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Project Detail View (Technician)
  const ProjectDetailView = () => {
    const [newTodo, setNewTodo] = useState('');
    const [todoError, setTodoError] = useState('');
    const [addingTodo, setAddingTodo] = useState(false);
    const [updatingTodoId, setUpdatingTodoId] = useState(null);
    const [deletingTodoId, setDeletingTodoId] = useState(null);
    const [showCompletedTodos, setShowCompletedTodos] = useState(true);
    const [wireDropQuery, setWireDropQuery] = useState('');

    const todos = selectedProject?.todos || [];
    const openTodos = todos.filter(todo => !todo.completed).length;
    const visibleTodos = todos.filter(todo => showCompletedTodos || !todo.completed);
    const totalTodos = todos.length;
    const projectId = selectedProject?.id;

    useEffect(() => {
      setShowCompletedTodos(true);
      setNewTodo('');
      setTodoError('');
      setWireDropQuery('');
    }, [projectId]);

    const handleAddTodo = async () => {
      const title = newTodo.trim();
      if (!title || !selectedProject) return;
      if (!supabase) {
        setTodoError('Supabase not configured');
        return;
      }
      try {
        setAddingTodo(true);
        setTodoError('');
        const { data, error } = await supabase
          .from('project_todos')
          .insert([{ project_id: selectedProject.id, title }])
          .select()
          .single();
        if (error) throw error;
        const added = {
          id: data.id,
          projectId: data.project_id,
          title: data.title,
          completed: !!data.is_complete,
          createdAt: data.created_at
        };
        updateProjectTodos(selectedProject.id, [...todos, added]);
        setNewTodo('');
      } catch (e) {
        setTodoError(e.message);
      } finally {
        setAddingTodo(false);
      }
    };

    const toggleTodoCompletion = async (todo) => {
      if (!supabase || !selectedProject) {
        setTodoError('Supabase not configured');
        return;
      }
      try {
        setUpdatingTodoId(todo.id);
        setTodoError('');
        const { error } = await supabase
          .from('project_todos')
          .update({ is_complete: !todo.completed })
          .eq('id', todo.id);
        if (error) throw error;
        const updated = todos.map(t => t.id === todo.id ? { ...t, completed: !todo.completed } : t);
        updateProjectTodos(selectedProject.id, updated);
      } catch (e) {
        setTodoError(e.message);
      } finally {
        setUpdatingTodoId(null);
      }
    };

    const handleDeleteTodo = async (todoId) => {
      if (!supabase || !selectedProject) {
        setTodoError('Supabase not configured');
        return;
      }
      try {
        setDeletingTodoId(todoId);
        setTodoError('');
        const { error } = await supabase
          .from('project_todos')
          .delete()
          .eq('id', todoId);
        if (error) throw error;
        const updated = todos.filter(t => t.id !== todoId);
        updateProjectTodos(selectedProject.id, updated);
      } catch (e) {
        setTodoError(e.message);
      } finally {
        setDeletingTodoId(null);
      }
    };

    return (
      <div className={`min-h-screen ui-bg relative z-10 pointer-events-auto`}>
        {/* Header */}
        <div className={`ui-surface ui-border px-4 py-3`}>
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentView('dashboard')} className={`ui-btn ui-btn--secondary px-3 py-2 flex items-center gap-2`}>
              <ArrowLeft size={18} />
              Back
            </button>
            <div className={`text-xs font-bold ${t.accentText}`}>
              INTELLIGENT<br/>SYSTEMS
            </div>
          </div>
        </div>

        {selectedProject && (
          <>
            {/* Project Progress */}
            <div className="p-4">
              <div className={`rounded-xl overflow-hidden ui-surface ui-border`}>
                <div className="relative h-14">
                  <div 
                    className={`absolute inset-0 pointer-events-none ${
                      calculateProjectProgress(selectedProject) > 70 ? t.success : 
                      calculateProjectProgress(selectedProject) > 40 ? t.warning : 
                      t.danger
                    } opacity-90`}
                    style={{ width: `${calculateProjectProgress(selectedProject)}%` }}
                  />
                  <div className={`absolute inset-0 flex items-center justify-center font-semibold ui-text pointer-events-none`}>
                    {selectedProject.name} - {calculateProjectProgress(selectedProject)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Sections */}
            <div className="px-4 pb-20">
              {/* Wiring Diagram */}
              <button
                type="button"
                onClick={() => openLink(selectedProject.wiringDiagramUrl)}
                className={`w-full mb-2 p-4 rounded-xl ui-surface ui-border flex items-center justify-between`}
              >
                <div className="flex items-center gap-3">
                  <FileText size={20} className={t.textSecondary} />
                  <span className={`font-medium ui-text`}>Wiring Diagram</span>
                </div>
                <ExternalLink size={20} className={t.textSecondary} />
              </button>

              {/* Portal Proposal */}
              <button
                type="button"
                onClick={() => openLink(selectedProject.portalProposalUrl)}
                className={`w-full mb-2 p-4 rounded-xl ui-surface ui-border flex items-center justify-between`}
              >
                <div className="flex items-center gap-3">
                  <FileText size={20} className={t.textSecondary} />
                  <span className={`font-medium ui-text`}>Portal Proposal</span>
                </div>
                <ExternalLink size={20} className={t.textSecondary} />
              </button>

              {/* Wire Drops */}
              <button 
                type="button"
                onClick={() => toggleSection('wireDrops')}
                className={`w-full mb-2 p-4 rounded-xl ui-surface ui-border flex items-center justify-between`}
              >
                <div className="flex items-center gap-3">
                  <Zap size={20} className={t.textSecondary} />
                  <span className={`font-medium ui-text`}>Wire Drops</span>
                  <span className={`px-2 py-1 rounded-full text-xs ${t.accent} text-white`}>
                    {selectedProject.wireDrops?.length || 0}
                  </span>
                </div>
                <ChevronRight size={20} className={`${t.textSecondary} transition-transform ${expandedSections.wireDrops ? 'rotate-90' : ''}`} />
              </button>

              {expandedSections.wireDrops && (
                <div className={`mb-2 p-4 rounded-xl ui-surface ui-border space-y-3`}>
                  {/* Wire Drops inline search */}
                  <div className="relative">
                    <Search size={18} className={`absolute left-3 top-3 ${t.textSecondary}`} />
                    <input
                      type="text"
                      value={wireDropQuery}
                      onChange={(e) => setWireDropQuery(e.target.value)}
                      placeholder="Search wire drops..."
                      className={`w-full pl-10 pr-3 py-2 rounded-lg ui-surface ui-text ui-border`}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </div>
                  {(!selectedProject.wireDrops || selectedProject.wireDrops.length === 0) && (
                    <p className={`text-sm ${t.textSecondary}`}>No wire drops yet. Add one below.</p>
                  )}
                  {(() => {
                    const drops = selectedProject.wireDrops || [];
                    const q = (wireDropQuery || '').toLowerCase();
                    const filtered = q
                      ? drops.filter(drop =>
                          (drop.name || '').toLowerCase().includes(q) ||
                          (drop.location || '').toLowerCase().includes(q) ||
                          (drop.uid || '').toLowerCase().includes(q) ||
                          (drop.type || '').toLowerCase().includes(q)
                        )
                      : drops;
                    if (drops.length > 0 && filtered.length === 0) {
                      return (
                        <p className={`text-sm ${t.textSecondary}`}>No matching wire drops.</p>
                      );
                    }
                    return filtered.map(drop => {
                    const prewireComplete = !!drop.prewirePhoto;
                    const installComplete = !!drop.installedPhoto;
                    const completion = (prewireComplete ? 50 : 0) + (installComplete ? 50 : 0);
                    return (
                      <div
                        key={drop.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedWireDrop(drop);
                          setCurrentView('wireDropDetail');
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedWireDrop(drop);
                            setCurrentView('wireDropDetail');
                          }
                        }}
                        className={`p-3 rounded-lg ${t.surfaceHover} cursor-pointer transition hover:${t.accentText}`}
                      >
                        <div className="flex items-center justify-between mb-2 gap-3">
                          <div>
                            <p className={`font-medium ${t.text}`}>{drop.name}</p>
                            <p className={`text-xs ${t.textSecondary}`}>{drop.location}</p>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full ${t.mutedBg} ${t.text}`}>{drop.uid}</span>
                        </div>
                        <div className={`flex items-center justify-between text-xs ${t.textSecondary}`}>
                          <div className="flex gap-2">
                            <span className={`px-2 py-0.5 rounded ${prewireComplete ? 'bg-green-600 text-white' : `${t.mutedBg} ${t.textSecondary}`}`}>Prewire</span>
                            <span className={`px-2 py-0.5 rounded ${installComplete ? 'bg-green-600 text-white' : `${t.mutedBg} ${t.textSecondary}`}`}>Install</span>
                          </div>
                          <span className={`font-semibold ${t.text}`}>{completion}%</span>
                        </div>
                      </div>
                    );
                    });
                  })()}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedWireDrop(null);
                        setCurrentView('wireDropForm');
                      }}
                      className={`flex-1 ui-btn ui-btn--primary text-sm`}
                    >
                      Add Wire Drop
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentView('wireDropList')}
                      className={`ui-btn ui-btn--secondary text-sm`}
                    >
                      Full List
                    </button>
                  </div>
                </div>
              )}

              {/* To-dos */}
              <button
                type="button"
                onClick={() => toggleSection('todos')}
                className={`w-full mb-2 p-4 rounded-xl ui-surface ui-border flex items-center justify-between`}
              >
                <div className="flex items-center gap-3">
                  <ListTodo size={20} className={t.textSecondary} />
                  <span className={`font-medium ui-text`}>To-do List</span>
                  {openTodos > 0 && (
                    <span className="px-2 py-0.5 bg-orange-500 text-white text-xs rounded-full">
                      {openTodos} open
                    </span>
                  )}
                </div>
                <ChevronRight size={20} className={`${t.textSecondary} transition-transform ${expandedSections.todos ? 'rotate-90' : ''}`} />
              </button>

              {expandedSections.todos && (
                <div className={`mb-2 p-4 rounded-xl ui-surface ui-border`}>
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="text"
                      value={newTodo}
                      onChange={(e) => setNewTodo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTodo();
                        }
                      }}
                      placeholder="Add a new task..."
                      className={`flex-1 px-3 py-2 rounded-lg ui-surface ui-text ui-border`}
                    />
                    <button
                      onClick={handleAddTodo}
                      disabled={addingTodo || !newTodo.trim()}
                      className={`p-2 ui-btn ui-btn--primary ${addingTodo || !newTodo.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-xs ${t.textSecondary}`}>
                      {totalTodos === 0 ? 'No tasks yet' : `${openTodos} open • ${totalTodos} total`}
                    </span>
                    {totalTodos > 0 && (
                      <button
                        onClick={() => setShowCompletedTodos(prev => !prev)}
                        className={`flex items-center gap-1 px-2 py-1 rounded ui-surface ui-text text-xs ui-border`}
                      >
                        {showCompletedTodos ? <EyeOff size={14} /> : <Eye size={14} />}
                        <span>{showCompletedTodos ? 'Hide completed' : 'Show completed'}</span>
                      </button>
                    )}
                  </div>
                  {todoError && <div className="text-xs text-red-400 mb-3">{todoError}</div>}
                  <div className="space-y-2">
                    {totalTodos === 0 ? (
                      <p className={`text-sm ${t.textSecondary}`}>No tasks yet. Add your first item above.</p>
                    ) : visibleTodos.length === 0 ? (
                      <p className={`text-sm ${t.textSecondary}`}>All tasks are complete. Great job!</p>
                    ) : (
                      visibleTodos.map(todo => (
                        <div
                          key={todo.id}
                          className={`flex items-center gap-3 px-3 py-2 rounded-lg ui-surface ui-border`}
                        >
                          <button
                            onClick={() => toggleTodoCompletion(todo)}
                            disabled={updatingTodoId === todo.id}
                            className={`p-1 rounded ${updatingTodoId === todo.id ? 'opacity-50 cursor-wait' : ''}`}
                          >
                            {todo.completed ? (
                              <CheckSquare size={18} className="text-green-400" />
                            ) : (
                              <Square size={18} className={t.textSecondary} />
                            )}
                          </button>
                          <span className={`flex-1 text-sm ${t.text} ${todo.completed ? 'line-through opacity-70' : ''}`}>
                            {todo.title}
                          </span>
                          <button
                            onClick={() => handleDeleteTodo(todo.id)}
                            disabled={deletingTodoId === todo.id}
                            className={`p-1 rounded ${deletingTodoId === todo.id ? 'opacity-50 cursor-wait' : ''}`}
                          >
                            <Trash2 size={16} className={t.textSecondary} />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Issues */}
              <button
                type="button"
                onClick={() => toggleSection('issues')}
                className={`w-full mb-2 p-4 rounded-xl ui-surface ui-border flex items-center justify-between`}
              >
                <div className="flex items-center gap-3">
                  <AlertCircle size={20} className={t.textSecondary} />
                  <span className={`font-medium ui-text`}>Issues</span>
                  {issues.filter(i => i.projectId === selectedProject.id && i.status !== 'resolved').length > 0 && (
                    <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                      {issues.filter(i => i.projectId === selectedProject.id && i.status !== 'resolved').length}
                    </span>
                  )}
                </div>
                <ChevronRight size={20} className={`${t.textSecondary} transition-transform ${expandedSections.issues ? 'rotate-90' : ''}`} />
              </button>
              
              {expandedSections.issues && (
                <div className={`mb-2 p-4 rounded-xl ui-surface ui-border`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowResolvedIssues(!showResolvedIssues)}
                        className={`text-sm ${t.textSecondary}`}
                      >
                        {showResolvedIssues ? <Eye size={16} /> : <EyeOff size={16} />}
                      </button>
                      <span className={`text-sm ${t.textSecondary}`}>
                        {showResolvedIssues ? 'Showing all' : 'Hiding resolved'}
                      </span>
                    </div>
                    <button 
                      onClick={() => setCurrentView('issueForm')}
                      className={`p-1 ui-btn ui-btn--secondary`}
                    >
                      <Plus size={20} />
                    </button>
                  </div>
                  
                  {issues
                    .filter(i => i.projectId === selectedProject.id)
                    .filter(i => showResolvedIssues || i.status !== 'resolved')
                    .map(issue => (
                      <div
                        key={issue.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          setSelectedIssue(issue);
                          setCurrentView('issueDetail');
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedIssue(issue);
                            setCurrentView('issueDetail');
                          }
                        }}
                        className={`w-full p-3 mb-2 rounded-lg ui-surface ui-border text-left cursor-pointer`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className={`font-medium ${t.text}`}>{issue.title}</p>
                            <p className={`text-xs ${t.textSecondary} mt-1`}>{issue.date}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded text-xs text-white capitalize ${
                              issue.status === 'blocked' ? t.danger :
                              issue.status === 'open' ? t.warning :
                              t.success
                            }`}>
                              {issue.status}
                            </span>
                            <ChevronRight size={16} className={t.textSecondary} />
                          </div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}

              {/* Files */}
              <div className="grid grid-cols-3 gap-2 mb-2">
                <button
                  onClick={() => openLink(selectedProject.oneDrivePhotos)}
                  className={`p-4 rounded-xl ui-surface ui-border flex flex-col items-center`}
                >
                  <Image size={20} className={`${t.textSecondary} mb-1`} />
                  <span className={`text-xs ${t.text}`}>Photos</span>
                </button>
                <button
                  onClick={() => openLink(selectedProject.oneDriveFiles)}
                  className={`p-4 rounded-xl ui-surface ui-border flex flex-col items-center`}
                >
                  <Folder size={20} className={`${t.textSecondary} mb-1`} />
                  <span className={`text-xs ${t.text}`}>Files</span>
                </button>
                <button
                  onClick={() => openLink(selectedProject.oneDriveProcurement)}
                  className={`p-4 rounded-xl ui-surface ui-border flex flex-col items-center`}
                >
                  <Package size={20} className={`${t.textSecondary} mb-1`} />
                  <span className={`text-xs ${t.text}`}>Procurement</span>
                </button>
              </div>

              {/* People */}
              <button
                onClick={() => setCurrentView('people')}
                className={`w-full mb-2 p-4 rounded-xl ui-surface ui-border flex items-center justify-between`}
              >
                <div className="flex items-center gap-3">
                  <Users size={20} className={t.textSecondary} />
                  <span className={`font-medium ui-text`}>People</span>
                </div>
                <ChevronRight size={20} className={t.textSecondary} />
              </button>
            </div>

            {/* Bottom Actions */}
            <div className={`fixed bottom-0 left-0 right-0 p-4 grid grid-cols-2 gap-2 ui-border ui-surface`}>
              <button 
                onClick={() => {
                  const query = prompt('Search for:');
                  if (query) {
                    setSearchQuery(query);
                    setCurrentView('wireDropList');
                  }
                }}
                className={`py-3 rounded-lg ui-btn ui-btn--secondary font-medium`}
              >
                Search
              </button>
              <button 
                onClick={() => setCurrentView('issueForm')}
                className={`py-3 rounded-lg ui-btn ui-btn--secondary font-medium`}
              >
                New Issue
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  // Issue Form (simplified)
  const IssueForm = () => {
    const initialIssueState = {
      title: '',
      status: 'open',
      notes: '',
      photos: []
    };
    const [newIssue, setNewIssue] = useState(() => ({ ...initialIssueState }));
    const [savingIssue, setSavingIssue] = useState(false);
    const [issueError, setIssueError] = useState('');
    const projectId = selectedProject?.id;

    const contactOptions = projectId
      ? contacts
          .filter(c => c.project_id === projectId)
          .map(contact => {
            const role = stakeholderRoles.find(r => r.id === contact.stakeholder_role_id) || null;
            return {
              contactId: contact.id,
              contact,
              role,
              isRequired: !!role?.auto_issue_default
            };
          })
          .sort((a, b) => {
            const roleA = a.role?.name || '';
            const roleB = b.role?.name || '';
            if (roleA === roleB) {
              return (a.contact.name || a.contact.email || '').localeCompare(b.contact.name || b.contact.email || '');
            }
            return roleA.localeCompare(roleB);
          })
      : [];

    const defaultContactIds = contactOptions
      .filter(option => option.isRequired && option.contactId)
      .map(option => option.contactId);

    const [selectedStakeholderContacts, setSelectedStakeholderContacts] = useState(defaultContactIds);

    useEffect(() => {
      setSelectedStakeholderContacts(defaultContactIds);
    }, [defaultContactIds]);

    const toggleStakeholderContact = (contactId, locked) => {
      if (locked) return;
      setSelectedStakeholderContacts(prev => (
        prev.includes(contactId)
          ? prev.filter(id => id !== contactId)
          : [...prev, contactId]
      ));
    };

    const formatStakeholderName = (option) => option.contact?.name || option.contact?.email || 'Stakeholder';

    const resetForm = () => {
      newIssue.photos.forEach(p => {
        try { URL.revokeObjectURL(p.preview); } catch (_) {}
      });
      setNewIssue({ ...initialIssueState });
      setSelectedStakeholderContacts(defaultContactIds);
    };

    const saveIssue = async () => {
      if (!newIssue.title.trim()) {
        alert('Please enter an issue title');
        return;
      }
      if (!selectedProject?.id) {
        alert('No project selected');
        return;
      }
      if (!supabase) {
        alert('Supabase not configured');
        return;
      }

      try {
        setSavingIssue(true);
        setIssueError('');

        const { data: inserted, error } = await supabase
          .from('issues')
          .insert([{
            project_id: selectedProject.id,
            title: newIssue.title.trim(),
            status: newIssue.status,
            notes: newIssue.notes
          }])
          .select()
          .single();

        if (error) throw error;

        const issueId = inserted.id;

        for (const photo of newIssue.photos) {
          try {
            let file = photo.file;
            if (!file) continue;
            try {
              file = await compressImage(file);
            } catch (_) {}

            let url;
            if (process.env.REACT_APP_USE_ONEDRIVE === '1' && selectedProject?.oneDrivePhotos) {
              const subPath = `issues/${issueId}`;
              if (!navigator.onLine) {
                await enqueueUpload({
                  rootUrl: selectedProject.oneDrivePhotos,
                  subPath,
                  filename: file.name,
                  contentType: file.type,
                  blob: file,
                  update: { type: 'issue_photo', issueId }
                });
                url = photo.preview;
              } else {
                try {
                  url = await graphUploadViaApi({ rootUrl: selectedProject.oneDrivePhotos, subPath, file });
                } catch (err) {
                  const path = `projects/${selectedProject.id}/issues/${issueId}/photo-${Date.now()}`;
                  url = await uploadPublicImage(file, path);
                }
              }
            } else {
              const path = `projects/${selectedProject.id}/issues/${issueId}/photo-${Date.now()}`;
              url = await uploadPublicImage(file, path);
            }

            if (url) {
              await supabase.from('issue_photos').insert([{ issue_id: issueId, url }]);
            }
          } catch (photoErr) {
            console.error('Failed to upload issue photo', photoErr);
          }
        }

        if (selectedStakeholderContacts.length) {
          try {
            const rows = selectedStakeholderContacts.map(contactId => ({
              project_id: selectedProject.id,
              issue_id: issueId,
              contact_id: contactId
            }));
            await supabase.from('issue_contacts').insert(rows);
          } catch (assignErr) {
            console.error('Failed to assign issue stakeholders', assignErr);
          }
        }

        await loadIssues(selectedProject.id);
        alert('Issue created!');
        resetForm();
        setCurrentView('project');
      } catch (err) {
        setIssueError(err.message || 'Failed to create issue');
      } finally {
        setSavingIssue(false);
      }
    };

    return (
      <div className={`min-h-screen ${t.bg} relative z-10 pointer-events-auto`}>
        {/* Header */}
        <div className={`${t.bgSecondary} border-b ${t.border} px-4 py-3`}>
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentView('project')} className="p-2 bg-black text-white rounded">
              <ArrowLeft size={24} />
            </button>
            <h1 className={`text-lg font-semibold ${t.text}`}>Log Issue</h1>
            <button onClick={saveIssue} disabled={savingIssue} className={`p-2 bg-black text-white rounded ${savingIssue ? 'opacity-50 cursor-wait' : ''}`}>
              <Save size={20} />
            </button>
          </div>
        </div>

        <div className="p-4">
          {issueError && <div className="mb-3 text-sm text-red-400">{issueError}</div>}
          <input
            type="text"
            value={newIssue.title}
            onChange={(e) => setNewIssue({...newIssue, title: e.target.value})}
            className={`w-full px-3 py-3 rounded-lg ${t.surface} ${t.text} border ${t.border} mb-4`}
            placeholder="Issue Title"
          />
          
          <div className="grid grid-cols-3 gap-2 mb-4">
            <button
              onClick={() => setNewIssue({...newIssue, status: 'open'})}
              className={`py-8 rounded-lg ${newIssue.status === 'open' ? 'bg-orange-600 text-white' : `${t.surface} ${t.text}`}`}
            >
              Open
            </button>
            <button
              onClick={() => setNewIssue({...newIssue, status: 'blocked'})}
              className={`py-8 rounded-lg ${newIssue.status === 'blocked' ? 'bg-red-600 text-white' : `${t.surface} ${t.text}`}`}
            >
              Blocked
            </button>
            <button
              onClick={() => handlePhotoCapture((photo) => {
                if (!photo) return;
                setNewIssue(prev => ({ ...prev, photos: [...prev.photos, photo] }));
              })}
              className={`py-8 rounded-lg ${t.surface} ${t.text}`}
            >
              <Camera size={32} className="mx-auto" />
            </button>
          </div>

          {/* Stakeholder notifications */}
          <div className={`mb-4 p-4 rounded-xl ${t.surface} border ${t.border}`}>
            <h3 className={`font-medium ${t.text} mb-2`}>Notify Stakeholders</h3>
            {contactOptions.length === 0 ? (
              <p className={`text-sm ${t.textSecondary}`}>Assign stakeholders in the People tab to include them here.</p>
            ) : (
              <div className="space-y-2">
                {contactOptions.map(option => {
                  const locked = option.isRequired;
                  const isSelected = selectedStakeholderContacts.includes(option.contactId);
                  return (
                    <label key={option.contactId} className={`flex items-center gap-3 text-sm ${locked ? 'opacity-80' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        disabled={locked}
                        onChange={() => toggleStakeholderContact(option.contactId, locked)}
                      />
                      <div className="flex flex-col">
                        <span className={t.text}>{formatStakeholderName(option)}</span>
                        <span className={`text-xs ${t.textSecondary}`}>
                          {option.role?.name || 'Stakeholder'}
                          {option.contact?.email ? ` · ${option.contact.email}` : ''}
                        </span>
                      </div>
                      {locked && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Required</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <textarea
            value={newIssue.notes}
            onChange={(e) => setNewIssue({...newIssue, notes: e.target.value})}
            className={`w-full px-3 py-3 rounded-lg ${t.surface} ${t.text} border ${t.border} h-32`}
            placeholder="Notes..."
          />

          {/* Show added photos */}
          {newIssue.photos.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {newIssue.photos.map((photo, idx) => (
                <div key={idx} className="relative">
                  <img 
                    src={photo.preview} 
                    alt={`New issue ${idx + 1}`} 
                    className="w-full h-24 object-cover rounded-lg cursor-pointer" 
                    onClick={() => setFullscreenImage(photo.preview)}
                  />
                  <button 
                    onClick={() => setFullscreenImage(photo.preview)}
                    className="absolute top-1 left-1 p-1 bg-black/50 rounded-full text-white"
                  >
                    <Maximize size={12} />
                  </button>
                  <button 
                    onClick={() => {
                      try { URL.revokeObjectURL(photo.preview); } catch (_) {}
                      setNewIssue(prev => ({
                        ...prev,
                        photos: prev.photos.filter((_, i) => i !== idx)
                      }));
                    }}
                    className="absolute top-1 right-1 p-1 bg-red-500 rounded-full"
                  >
                    <X size={12} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // QR Scanner
  const closeScanner = useCallback(() => setShowScanner(false), []);

  const QRScanner = ({ onScan, onClose }) => {
    const [manualUid, setManualUid] = useState('');
    const [scanError, setScanError] = useState('');
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const rafRef = useRef(null);
    const barcodeSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window;
    const detectorRef = useRef(null);

    useEffect(() => {
      if (!barcodeSupported || !onScan) return;
      let cancelled = false;
      const videoElement = videoRef.current;

      const start = async () => {
        try {
          const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          detectorRef.current = detector;
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (cancelled) {
            stream.getTracks().forEach(track => track.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }

          const detectFrame = async () => {
            if (!videoRef.current || !detectorRef.current) return;
            try {
              const codes = await detectorRef.current.detect(videoRef.current);
              if (codes.length) {
                const value = codes[0].rawValue;
                if (value) {
                  const success = await onScan(value);
                  if (success) {
                    onClose();
                    return;
                  }
                  setScanError('Wire drop not found for scanned code');
                }
              }
            } catch (_) {}
            rafRef.current = requestAnimationFrame(detectFrame);
          };

          detectFrame();
        } catch (err) {
          if (!cancelled) {
            setScanError(err.message || 'Unable to access camera for scanning');
          }
        }
      };

      start();

      return () => {
        cancelled = true;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (videoElement) videoElement.pause();
        if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      };
    }, [barcodeSupported, onScan, onClose]);

    const handleManualSubmit = async (event) => {
      event.preventDefault();
      const value = manualUid.trim();
      if (!value) {
        setScanError('Enter a UID to search');
        return;
      }
      const success = await onScan(value);
      if (success) {
        onClose();
      } else {
        setScanError('Wire drop not found for that UID');
      }
    };

    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" data-overlay="qr-overlay">
        <div className={`${t.surface} rounded-2xl p-6 max-w-md w-full space-y-4`}>
          <h2 className={`text-xl font-semibold ${t.text}`}>Scan Wire Drop</h2>
          {barcodeSupported ? (
            <div className={`relative rounded-xl overflow-hidden ${t.surfaceHover}`}>
              <video ref={videoRef} className="w-full h-64 object-cover" muted playsInline />
              <div className="absolute inset-0 border-2 border-dashed border-white/40 rounded-xl pointer-events-none"></div>
            </div>
          ) : (
            <div className={`h-48 ${t.surfaceHover} rounded-xl flex items-center justify-center text-center px-4 ${t.textSecondary}`}>
              Camera-based QR scanning isn&apos;t supported on this device. You can still enter a UID manually below.
            </div>
          )}
          <form onSubmit={handleManualSubmit} className="space-y-2">
            <label className={`text-xs ${t.textSecondary} block`}>Enter UID manually</label>
            <div className="flex gap-2">
              <input
                value={manualUid}
                onChange={(e) => {
                  setManualUid(e.target.value.toUpperCase());
                  setScanError('');
                }}
                placeholder="WD-..."
                className={`flex-1 px-3 py-2 rounded ${t.surfaceHover} ${t.text} border ${t.border}`}
              />
              <button type="submit" className={`px-3 py-2 rounded ${t.accent} text-white`}>Go</button>
            </div>
          </form>
          {scanError && <div className="text-sm text-red-400">{scanError}</div>}
          <button 
            onClick={onClose}
            className={`w-full py-3 rounded-lg ${t.surfaceHover} ${t.text}`}
          >
            Close
          </button>
        </div>
      </div>
    );
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  useEffect(() => {
    if (currentView === 'project' && pendingSection) {
      setExpandedSections(prev => ({ ...prev, [pendingSection]: true }));
      setPendingSection(null);
    }
  }, [currentView, pendingSection]);

  // Test read from Supabase (uses env table or input)

  const updateProjectTodos = useCallback((projectId, todos) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, todos } : p));
    setSelectedProject(prev => prev && prev.id === projectId ? { ...prev, todos } : prev);
  }, []);

  const loadTodos = useCallback(async (projectId) => {
    try {
      if (!supabase) return;
      const { data, error } = await supabase
        .from('project_todos')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
      if (error) return;
      const todos = (data || []).map(row => ({
        id: row.id,
        projectId: row.project_id,
        title: row.title,
        completed: !!row.is_complete,
        createdAt: row.created_at
      }));
      updateProjectTodos(projectId, todos);
    } catch (_) {}
  }, [updateProjectTodos]);

  useEffect(() => {
    if ((currentView === 'project' || currentView === 'pmProjectDetail') && selectedProjectId) {
      loadTodos(selectedProjectId);
    }
  }, [currentView, selectedProjectId, loadTodos]);

  // Defensive: on view/project changes, ensure no stray full-screen overlays can intercept clicks
  useEffect(() => {
    try {
      const nodes = document.querySelectorAll('.fixed.inset-0');
      nodes.forEach((el) => {
        const marker = el.getAttribute('data-overlay');
        if (!marker) {
          el.style.pointerEvents = 'none';
          if (!el.style.zIndex) el.style.zIndex = '0';
        }
      });
    } catch (_) {}
  }, [currentView, selectedProjectId]);

  // Main Render
  return (
    <>
      {userRole === 'technician' ? (
        <>
          {currentView === 'dashboard' && <TechnicianDashboard />}
          {currentView === 'project' && <ProjectDetailView />}
          {currentView === 'wireDropList' && <WireDropListView />}
          {currentView === 'wireDropDetail' && <WireDropDetailView />}
          {currentView === 'wireDropForm' && <WireDropForm />}
          {currentView === 'issueDetail' && <IssueDetailView />}
          {currentView === 'issueForm' && <IssueForm />}
          {currentView === 'people' && <PeopleView />}
        </>
      ) : (
        <>
          {currentView === 'dashboard' && <PMDashboard />}
          {currentView === 'pmDashboard' && <PMDashboard />}
          {currentView === 'pmProjectDetail' && <PMProjectDetail />}
          {currentView === 'projectForm' && <ProjectForm />}
          {currentView === 'wireDropList' && <WireDropListView />}
          {currentView === 'wireDropForm' && <WireDropForm />}
          {currentView === 'people' && <PeopleView />}
        </>
      )}
      {showScanner && <QRScanner onClose={closeScanner} onScan={openWireDropByUid} />}
      <FullscreenImageModal />
    </>
  );
};

export default App;
