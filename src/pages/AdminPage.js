/**
 * AdminPage.js
 * Admin page for user management, skills, and system configuration
 *
 * Features:
 * - User management with role assignment
 * - Role levels: technician, manager, director, admin, owner
 * - Global skills management (CRUD operations)
 * - Employee skills assignment with proficiency levels
 * - First-time setup for owner
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings, Users, Award, X,
  Loader2, CheckCircle, AlertCircle,
  GraduationCap, Star, Sparkles, Shield, UserCog, Crown, Briefcase,
  Wrench, Mail, UserPlus, UserX, ArrowLeft, ToggleLeft, ToggleRight,
  Link2, Link2Off, BookOpen, Bot, Zap, ExternalLink, Upload, FileSpreadsheet,
  ArrowRight, RefreshCw, AlertTriangle, Bug, Building2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useAppState } from '../contexts/AppStateContext';
import { enhancedStyles } from '../styles/styleSystem';
import Button from '../components/ui/Button';
import { quickbooksService } from '../services/quickbooksService';
import SystemAccountSettings from '../components/Admin/SystemAccountSettings';
import AITrainingTab from '../components/Admin/AITrainingTab';
import BugTodosTab from '../components/Admin/BugTodosTab';
import SkillsManager from '../components/Admin/SkillsManager';
import CompanySettingsManager from '../components/procurement/CompanySettingsManager';

// Role definitions with hierarchy
const USER_ROLES = [
  { id: 'technician', label: 'Technician', icon: Wrench, color: '#64748B', level: 20, description: 'Field technician - can view and update assigned tickets' },
  { id: 'manager', label: 'Manager', icon: Briefcase, color: '#3B82F6', level: 40, description: 'Project manager - can assign tickets and manage schedules' },
  { id: 'director', label: 'Director', icon: UserCog, color: '#8B5CF6', level: 60, description: 'Department director - can manage managers and view reports' },
  { id: 'admin', label: 'Admin', icon: Shield, color: '#F59E0B', level: 80, description: 'System admin - can manage users and system settings' },
  { id: 'owner', label: 'Owner', icon: Crown, color: '#10B981', level: 100, description: 'Owner - full access including billing and ownership transfer' }
];

// Default technology categories (fallback if DB table doesn't exist yet)
// These define types of work for service tickets and employee skills
const DEFAULT_TECHNOLOGY_CATEGORIES = [
  { id: 'network', name: 'network', label: 'Network', color: '#3B82F6' },
  { id: 'av', name: 'av', label: 'Audio/Video', color: '#8B5CF6' },
  { id: 'shades', name: 'shades', label: 'Shades', color: '#F59E0B' },
  { id: 'control', name: 'control', label: 'Control Systems', color: '#10B981' },
  { id: 'wiring', name: 'wiring', label: 'Wiring', color: '#EF4444' },
  { id: 'installation', name: 'installation', label: 'Installation', color: '#EC4899' },
  { id: 'maintenance', name: 'maintenance', label: 'Maintenance', color: '#6366F1' },
  { id: 'general', name: 'general', label: 'General', color: '#64748B' }
];

// Proficiency levels
const PROFICIENCY_LEVELS = [
  { id: 'training', label: 'Training', icon: GraduationCap, color: '#F59E0B', description: 'Currently learning' },
  { id: 'proficient', label: 'Proficient', icon: CheckCircle, color: '#3B82F6', description: 'Can work independently' },
  { id: 'expert', label: 'Expert', icon: Star, color: '#10B981', description: 'Can train others' }
];

/**
 * Get role level for comparison
 */
const getRoleLevel = (roleId) => {
  const role = USER_ROLES.find(r => r.id === roleId);
  return role?.level || 0;
};

/**
 * Check if current user can manage target user
 */
const canManageUser = (currentUserRole, targetUserRole) => {
  const currentLevel = getRoleLevel(currentUserRole);
  const targetLevel = getRoleLevel(targetUserRole);
  // Owner can manage everyone, others can only manage lower levels
  if (currentUserRole === 'owner') return true;
  return currentLevel > targetLevel;
};

/**
 * Local fallback for parsing contacts when AI API fails
 */
const parseContactsLocally = (contacts) => {
  return contacts.map(contact => {
    const result = { ...contact };

    // Parse name into first/last
    if (contact.name && !contact.first_name && !contact.last_name) {
      const nameParts = contact.name.trim().split(/\s+/);
      if (nameParts.length >= 2) {
        // Check if it looks like a company
        const companyKeywords = ['llc', 'inc', 'corp', 'corporation', 'university', 'college', 'company', 'co.', 'ltd', 'group', 'services', 'solutions', 'associates', 'partners'];
        const lowerName = contact.name.toLowerCase();
        const isCompany = companyKeywords.some(kw => lowerName.includes(kw));

        if (isCompany) {
          result.is_company = true;
          result.company = contact.name;
          result.first_name = '';
          result.last_name = '';
        } else {
          result.first_name = nameParts[0];
          result.last_name = nameParts.slice(1).join(' ');
          result.is_company = false;
        }
      } else {
        result.first_name = contact.name;
        result.last_name = '';
        result.is_company = false;
      }
    }

    // Extract phone from "Phone:xxx Mobile:xxx" format
    if (contact.phone) {
      let phone = contact.phone;

      // Extract first phone number
      const phoneMatch = phone.match(/(?:Phone:|Tel:)?\s*\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/i);
      if (phoneMatch) {
        result.phone = `(${phoneMatch[1]}) ${phoneMatch[2]}-${phoneMatch[3]}`;
      } else {
        // Try to extract any 10-digit number
        const digits = phone.replace(/\D/g, '');
        if (digits.length >= 10) {
          const d = digits.slice(0, 10);
          result.phone = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
        }
      }
    }

    return result;
  });
};

/**
 * AdminPage Component
 */
const AdminPage = () => {
  const { mode } = useTheme();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { publishState, registerActions, unregisterActions } = useAppState();
  const sectionStyles = enhancedStyles.sections[mode];

  // Tab state
  const [activeTab, setActiveTab] = useState('users');

  // Current user role
  const [currentUserRole, setCurrentUserRole] = useState(null);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Users state
  const [users, setUsers] = useState([]);

  // Skills state
  const [globalSkills, setGlobalSkills] = useState([]);
  const [employeeSkills, setEmployeeSkills] = useState([]);
  const [skillCategories, setSkillCategories] = useState(DEFAULT_TECHNOLOGY_CATEGORIES);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [saving, setSaving] = useState(false);

  // Employee skills modal
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [employeeSkillsModal, setEmployeeSkillsModal] = useState(false);


  // Feature flags state
  const [featureFlags, setFeatureFlags] = useState([]);
  const [userFeatureFlags, setUserFeatureFlags] = useState({});
  const [roleFeatureFlags, setRoleFeatureFlags] = useState({});
  const [selectedUserForFeatures, setSelectedUserForFeatures] = useState(null);

  // QuickBooks state
  const [qboStatus, setQboStatus] = useState({ connected: false, loading: true });
  const [qboConnecting, setQboConnecting] = useState(false);

  // First-time setup state
  const [showFirstTimeSetup, setShowFirstTimeSetup] = useState(false);
  const [systemInitialized, setSystemInitialized] = useState(true);

  // CSV Import state
  const [csvData, setCsvData] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [fieldMapping, setFieldMapping] = useState({});
  const [importPreview, setImportPreview] = useState([]);
  const [importStep, setImportStep] = useState('upload'); // upload, map, preview, ai-processing, importing, done
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, skipped: 0, errors: [] });
  const [duplicateHandling, setDuplicateHandling] = useState('skip'); // skip, merge, create
  const [useAIProcessing, setUseAIProcessing] = useState(true); // AI helps parse names, phones, detect companies
  const [aiProcessedData, setAiProcessedData] = useState([]); // Data after AI processing

  // Available contact fields for mapping (matches contacts table schema)
  const CONTACT_FIELDS = [
    { key: 'name', label: 'Name', required: true },
    { key: 'first_name', label: 'First Name', required: false },
    { key: 'last_name', label: 'Last Name', required: false },
    { key: 'email', label: 'Email', required: false },
    { key: 'phone', label: 'Phone', required: false },
    { key: 'company', label: 'Company', required: false },
    { key: 'role', label: 'Role/Title', required: false },
    { key: 'address', label: 'Full Address', required: false },
    { key: 'address1', label: 'Address Line 1', required: false },
    { key: 'address2', label: 'Address Line 2', required: false },
    { key: 'city', label: 'City', required: false },
    { key: 'state', label: 'State', required: false },
    { key: 'zip', label: 'ZIP Code', required: false }
  ];

  /**
   * Check current user's authorization
   */
  const checkAuthorization = useCallback(async () => {
    if (!user?.email) return;

    try {
      // Get current user's profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('email', user.email)
        .single();

      if (profileError) {
        // Check if this is the first-time setup user
        if (user.email === 'stephe@isehome.com') {
          setShowFirstTimeSetup(true);
          setIsAuthorized(true);
          setCurrentUserRole('owner');
          return;
        }
        throw profileError;
      }

      const role = profile?.role || 'technician';
      setCurrentUserRole(role);

      // Only admin, director, and owner can access admin page
      const level = getRoleLevel(role);
      setIsAuthorized(level >= getRoleLevel('director'));

      // Check if system is initialized
      const { data: settings } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'system_initialized')
        .single();

      setSystemInitialized(!!settings);

      // Show first-time setup if owner hasn't been set up
      if (!settings && user.email === 'stephe@isehome.com') {
        setShowFirstTimeSetup(true);
      }

    } catch (err) {
      console.error('[AdminPage] Auth check failed:', err);
      // Default: check if it's the owner email for first-time setup
      if (user.email === 'stephe@isehome.com') {
        setShowFirstTimeSetup(true);
        setIsAuthorized(true);
        setCurrentUserRole('owner');
      }
    }
  }, [user?.email]);

  /**
   * Load all data
   */
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load users (profiles)
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');

      if (usersError && usersError.code !== 'PGRST116') throw usersError;
      setUsers(usersData || []);

      // Load skill categories from database (unified skills system)
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('skill_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (categoriesError && categoriesError.code !== 'PGRST116') {
        console.log('[AdminPage] Skill categories table may not exist yet, using defaults');
      }
      // Use DB categories if available, otherwise use defaults
      if (categoriesData && categoriesData.length > 0) {
        setSkillCategories(categoriesData);
      } else {
        setSkillCategories(DEFAULT_TECHNOLOGY_CATEGORIES);
      }

      // Load global skills
      const { data: skillsData, error: skillsError } = await supabase
        .from('global_skills')
        .select('*')
        .order('category')
        .order('sort_order');

      if (skillsError && skillsError.code !== 'PGRST116') {
        console.log('[AdminPage] Skills table may not exist yet');
      }
      setGlobalSkills(skillsData || []);

      // Load employee skills
      const { data: empSkillsData, error: empSkillsError } = await supabase
        .from('employee_skills')
        .select(`
          *,
          skill:global_skills(id, name, category)
        `);

      if (empSkillsError && empSkillsError.code !== 'PGRST116') {
        console.log('[AdminPage] Employee skills table may not exist yet');
      }
      setEmployeeSkills(empSkillsData || []);

      // Load feature flags
      const { data: flagsData, error: flagsError } = await supabase
        .from('feature_flags')
        .select('*')
        .eq('is_active', true)
        .order('category')
        .order('sort_order');

      if (flagsError && flagsError.code !== 'PGRST116') {
        console.log('[AdminPage] Feature flags table may not exist yet');
      }
      setFeatureFlags(flagsData || []);

      // Load role feature flags
      const { data: roleFlags, error: roleFlagsError } = await supabase
        .from('role_feature_flags')
        .select('*');

      if (!roleFlagsError && roleFlags) {
        const flagsByRole = {};
        roleFlags.forEach(rf => {
          if (!flagsByRole[rf.role]) flagsByRole[rf.role] = {};
          flagsByRole[rf.role][rf.feature_flag_id] = rf.enabled;
        });
        setRoleFeatureFlags(flagsByRole);
      }

      // Load user feature flags
      const { data: userFlags, error: userFlagsError } = await supabase
        .from('user_feature_flags')
        .select('*');

      if (!userFlagsError && userFlags) {
        const flagsByUser = {};
        userFlags.forEach(uf => {
          if (!flagsByUser[uf.user_id]) flagsByUser[uf.user_id] = {};
          flagsByUser[uf.user_id][uf.feature_flag_id] = { enabled: uf.enabled, id: uf.id };
        });
        setUserFeatureFlags(flagsByUser);
      }

    } catch (err) {
      console.error('[AdminPage] Load failed:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthorization();
  }, [checkAuthorization]);

  useEffect(() => {
    if (isAuthorized) {
      loadData();
    }
  }, [isAuthorized, loadData]);

  // Publish state to AppStateContext for Voice AI
  useEffect(() => {
    const enabledFeatureCount = featureFlags.filter(f => {
      // Check if any role has this feature enabled
      return USER_ROLES.some(role => roleFeatureFlags[role.id]?.[f.id] === true);
    }).length;

    publishState({
      view: 'admin',
      activeTab,
      userCount: users.length,
      activeUsers: users.filter(u => u.is_active !== false).length,
      skillCount: globalSkills.length,
      featureFlagsCount: featureFlags.length,
      enabledFeatureCount,
      qboConnected: qboStatus.connected,
      hint: `Admin panel - ${activeTab} tab. ${users.length} users, ${globalSkills.length} skills, ${featureFlags.length} feature flags configured.`
    });
  }, [activeTab, users, globalSkills, featureFlags, roleFeatureFlags, qboStatus.connected, publishState]);

  // Feature flag management functions
  const handleToggleRoleFeature = useCallback(async (role, flagId, currentEnabled) => {
    try {
      setSaving(true);
      const newEnabled = !currentEnabled;

      // Upsert role feature flag
      const { error } = await supabase
        .from('role_feature_flags')
        .upsert({
          role,
          feature_flag_id: flagId,
          enabled: newEnabled
        }, {
          onConflict: 'role,feature_flag_id'
        });

      if (error) throw error;

      // Update local state
      setRoleFeatureFlags(prev => ({
        ...prev,
        [role]: {
          ...(prev[role] || {}),
          [flagId]: newEnabled
        }
      }));

      setSuccess(`Feature ${newEnabled ? 'enabled' : 'disabled'} for ${role}s`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('[AdminPage] Toggle role feature failed:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, []);

  // Register actions for Voice AI
  useEffect(() => {
    const actions = {
      switch_tab: async ({ tab }) => {
        const validTabs = ['users', 'skills', 'employee-skills', 'features', 'integrations', 'import', 'ai-training', 'bug-todos'];
        if (!validTabs.includes(tab)) {
          return { success: false, error: `Invalid tab. Valid tabs are: ${validTabs.join(', ')}` };
        }
        setActiveTab(tab);
        return { success: true, message: `Switched to ${tab} tab` };
      },
      search_users: async ({ query }) => {
        if (!query) {
          return {
            success: true,
            users: users.map(u => ({
              id: u.id,
              name: u.full_name,
              email: u.email,
              role: u.role,
              isActive: u.is_active !== false
            }))
          };
        }
        const filtered = users.filter(u =>
          u.full_name?.toLowerCase().includes(query.toLowerCase()) ||
          u.email?.toLowerCase().includes(query.toLowerCase())
        );
        return {
          success: true,
          users: filtered.map(u => ({
            id: u.id,
            name: u.full_name,
            email: u.email,
            role: u.role,
            isActive: u.is_active !== false
          })),
          message: `Found ${filtered.length} users matching "${query}"`
        };
      },
      list_users: async () => {
        return {
          success: true,
          users: users.map(u => ({
            id: u.id,
            name: u.full_name,
            email: u.email,
            role: u.role,
            isActive: u.is_active !== false
          })),
          message: `${users.length} total users`
        };
      },
      list_skills: async () => {
        return {
          success: true,
          skills: globalSkills.map(s => ({
            id: s.id,
            name: s.name,
            category: s.category,
            description: s.description
          })),
          message: `${globalSkills.length} skills configured`
        };
      },
      list_feature_flags: async () => {
        return {
          success: true,
          features: featureFlags.map(f => ({
            id: f.id,
            key: f.flag_key,
            name: f.name,
            category: f.category,
            description: f.description
          })),
          message: `${featureFlags.length} feature flags configured`
        };
      },
      toggle_feature_for_role: async ({ flagId, role }) => {
        if (!flagId || !role) {
          return { success: false, error: 'flagId and role are required' };
        }
        const flag = featureFlags.find(f => f.id === flagId || f.flag_key === flagId);
        if (!flag) {
          return { success: false, error: 'Feature flag not found' };
        }
        const validRole = USER_ROLES.find(r => r.id === role);
        if (!validRole) {
          return { success: false, error: `Invalid role. Valid roles are: ${USER_ROLES.map(r => r.id).join(', ')}` };
        }
        const currentEnabled = roleFeatureFlags[role]?.[flag.id] || false;
        await handleToggleRoleFeature(role, flag.id, currentEnabled);
        return { success: true, message: `Feature "${flag.name}" ${!currentEnabled ? 'enabled' : 'disabled'} for ${role}` };
      },
      manage_skills: async () => {
        setActiveTab('skills');
        return { success: true, message: 'Navigated to skills management tab' };
      },
      view_integrations: async () => {
        setActiveTab('integrations');
        return { success: true, message: 'Navigated to integrations tab' };
      },
      refresh_data: async () => {
        await loadData();
        return { success: true, message: 'Admin data refreshed' };
      },
      get_user_by_email: async ({ email }) => {
        if (!email) {
          return { success: false, error: 'Email is required' };
        }
        const foundUser = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
        if (!foundUser) {
          return { success: false, error: `No user found with email "${email}"` };
        }
        return {
          success: true,
          user: {
            id: foundUser.id,
            name: foundUser.full_name,
            email: foundUser.email,
            role: foundUser.role,
            isActive: foundUser.is_active !== false
          }
        };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [users, globalSkills, featureFlags, roleFeatureFlags, handleToggleRoleFeature, loadData, registerActions, unregisterActions]);

  // Load QuickBooks connection status
  useEffect(() => {
    const loadQboStatus = async () => {
      try {
        const status = await quickbooksService.getConnectionStatus();
        setQboStatus({ ...status, loading: false });
      } catch (err) {
        console.error('[AdminPage] Failed to load QBO status:', err);
        setQboStatus({ connected: false, loading: false, error: err.message });
      }
    };
    if (isAuthorized) {
      loadQboStatus();
    }

    // Check for QBO callback query params
    const params = new URLSearchParams(window.location.search);
    if (params.get('qbo_connected') === 'true') {
      loadQboStatus();
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('qbo_error')) {
      setQboStatus(prev => ({ ...prev, error: params.get('qbo_error') }));
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [isAuthorized]);

  // Handle QBO connect
  const handleQboConnect = async () => {
    try {
      setQboConnecting(true);
      await quickbooksService.initiateOAuth();
    } catch (err) {
      console.error('[AdminPage] QBO connect failed:', err);
      setQboStatus(prev => ({ ...prev, error: err.message }));
      setQboConnecting(false);
    }
  };

  // Handle QBO disconnect
  const handleQboDisconnect = async () => {
    if (!window.confirm('Disconnect QuickBooks? You will need to reconnect to export invoices.')) return;
    try {
      await quickbooksService.disconnect();
      setQboStatus({ connected: false, loading: false });
      setSuccess('QuickBooks disconnected successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('[AdminPage] QBO disconnect failed:', err);
      setQboStatus(prev => ({ ...prev, error: err.message }));
    }
  };

  /**
   * Handle first-time setup
   */
  const handleFirstTimeSetup = async () => {
    if (!user?.email) return;

    try {
      setSaving(true);
      setError(null);

      // Create or update profile as owner
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email,
          full_name: user.displayName || user.name || user.email.split('@')[0],
          role: 'owner',
          is_active: true,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        });

      if (profileError) throw profileError;

      // Mark system as initialized
      const { error: settingsError } = await supabase
        .from('system_settings')
        .upsert({
          key: 'system_initialized',
          value: {
            initialized_at: new Date().toISOString(),
            initialized_by: user.email,
            version: '1.0'
          }
        }, {
          onConflict: 'key'
        });

      if (settingsError) throw settingsError;

      setShowFirstTimeSetup(false);
      setSystemInitialized(true);
      setSuccess('System initialized successfully! You are now the owner.');
      await loadData();

    } catch (err) {
      console.error('[AdminPage] First-time setup failed:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Update user role
   */
  const handleUpdateUserRole = async (userId, newRole) => {
    try {
      setSaving(true);
      setError(null);

      const { error } = await supabase
        .from('profiles')
        .update({
          role: newRole,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) throw error;

      setSuccess('User role updated successfully');
      setTimeout(() => setSuccess(null), 3000);
      await loadData();

    } catch (err) {
      console.error('[AdminPage] Update role failed:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  /**
   * Toggle user active status
   */
  const handleToggleUserActive = async (userId, isActive) => {
    try {
      setSaving(true);
      setError(null);

      const { error } = await supabase
        .from('profiles')
        .update({
          is_active: isActive,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) throw error;

      setSuccess(`User ${isActive ? 'activated' : 'deactivated'} successfully`);
      setTimeout(() => setSuccess(null), 3000);
      await loadData();

    } catch (err) {
      console.error('[AdminPage] Toggle active failed:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAssignSkill = async (employeeId, skillId, proficiencyLevel) => {
    try {
      setSaving(true);

      const existing = employeeSkills.find(
        es => es.employee_id === employeeId && es.skill_id === skillId
      );

      if (existing) {
        const { error } = await supabase
          .from('employee_skills')
          .update({ proficiency_level: proficiencyLevel })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('employee_skills')
          .insert({
            employee_id: employeeId,
            skill_id: skillId,
            proficiency_level: proficiencyLevel
          });

        if (error) throw error;
      }

      await loadData();
    } catch (err) {
      console.error('[AdminPage] Assign skill failed:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveEmployeeSkill = async (employeeSkillId) => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('employee_skills')
        .delete()
        .eq('id', employeeSkillId);

      if (error) throw error;
      await loadData();
    } catch (err) {
      console.error('[AdminPage] Remove employee skill failed:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const getEmployeeSkills = (employeeId) => {
    return employeeSkills.filter(es => es.employee_id === employeeId);
  };

  // Build skills grouped by category using dynamic categories
  const skillsByCategory = skillCategories.map(cat => ({
    ...cat,
    id: cat.name || cat.id, // Use name as ID for matching with skills
    skills: globalSkills.filter(s => s.category === (cat.name || cat.id))
  }));

  const handleToggleUserFeature = async (userId, flagId, currentEnabled, existingId) => {
    try {
      setSaving(true);
      const newEnabled = !currentEnabled;

      if (existingId) {
        // Update existing
        const { error } = await supabase
          .from('user_feature_flags')
          .update({ enabled: newEnabled })
          .eq('id', existingId);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('user_feature_flags')
          .insert({
            user_id: userId,
            feature_flag_id: flagId,
            enabled: newEnabled,
            enabled_by: user?.id
          });

        if (error) throw error;
      }

      await loadData();
      setSuccess(`Feature ${newEnabled ? 'enabled' : 'disabled'} for user`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('[AdminPage] Toggle user feature failed:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveUserFeatureOverride = async (existingId) => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from('user_feature_flags')
        .delete()
        .eq('id', existingId);

      if (error) throw error;

      await loadData();
      setSuccess('User override removed (using role default)');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('[AdminPage] Remove user override failed:', err);
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Group features by category
  const featuresByCategory = featureFlags.reduce((acc, flag) => {
    if (!acc[flag.category]) acc[flag.category] = [];
    acc[flag.category].push(flag);
    return acc;
  }, {});

  const categoryLabels = {
    ai: { label: 'AI Features', icon: Bot, color: '#8B5CF6' },
    integrations: { label: 'Integrations', icon: Link2, color: '#3B82F6' },
    ui: { label: 'User Interface', icon: Zap, color: '#10B981' },
    admin: { label: 'Admin Features', icon: Shield, color: '#F59E0B' },
    general: { label: 'General', icon: Settings, color: '#64748B' }
  };

  // First-time setup screen
  if (showFirstTimeSetup && !systemInitialized) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-zinc-800 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto mb-4">
            <Crown size={32} className="text-violet-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Welcome, Owner!</h1>
          <p className="text-zinc-400 mb-6">
            This is the first-time setup for your system. Click below to initialize your account as the system owner.
          </p>
          <div className="p-4 bg-zinc-700/50 rounded-lg mb-6 text-left">
            <div className="flex items-center gap-2 mb-2">
              <Mail size={16} className="text-zinc-400" />
              <span className="text-zinc-300">{user?.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-violet-400" />
              <span className="text-violet-400">Owner (Full Access)</span>
            </div>
          </div>
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg mb-4 text-red-400 text-sm">
              {error}
            </div>
          )}
          <Button
            onClick={handleFirstTimeSetup}
            disabled={saving}
            className="w-full"
          >
            {saving ? 'Initializing...' : 'Initialize System'}
          </Button>
        </div>
      </div>
    );
  }

  // Unauthorized access
  if (!loading && !isAuthorized) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-zinc-800 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} className="text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-zinc-400 mb-6">
            You don't have permission to access the admin panel. Contact your system administrator for access.
          </p>
          <Button onClick={() => navigate('/settings')} variant="secondary">
            <ArrowLeft size={16} className="mr-2" />
            Back to Settings
          </Button>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 pb-24 flex items-center justify-center min-h-[50vh]">
        <div className="flex items-center gap-3 text-gray-500">
          <Loader2 size={24} className="animate-spin" />
          <span>Loading admin data...</span>
        </div>
      </div>
    );
  }

  /**
   * Render Users Tab
   */
  const renderUsersTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">User Management</h2>
        <span className="text-sm text-zinc-500">{users.length} users</span>
      </div>

      {/* Role Legend */}
      <div className="p-3 bg-zinc-700/30 rounded-lg">
        <div className="text-xs text-zinc-500 mb-2">Role Hierarchy (highest to lowest)</div>
        <div className="flex flex-wrap gap-2">
          {USER_ROLES.slice().reverse().map(role => (
            <div
              key={role.id}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs"
              style={{ backgroundColor: `${role.color}20`, color: role.color }}
            >
              <role.icon size={12} />
              <span>{role.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Users List */}
      <div className="space-y-3">
        {users.map(usr => {
          const role = USER_ROLES.find(r => r.id === usr.role) || USER_ROLES[0];
          const canEdit = canManageUser(currentUserRole, usr.role) && usr.email !== user?.email;
          const isCurrentUser = usr.email === user?.email;
          const empSkills = getEmployeeSkills(usr.id);

          return (
            <div
              key={usr.id}
              className={`rounded-xl border p-4 ${usr.is_active === false ? 'opacity-60' : ''}`}
              style={sectionStyles.card}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-medium ${usr.is_active === false ? 'grayscale' : ''}`}
                    style={{ backgroundColor: usr.avatar_color || role.color }}
                  >
                    {(usr.full_name || usr.email || 'U')[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900 dark:text-white">
                        {usr.full_name || usr.email}
                      </h3>
                      {isCurrentUser && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">
                          You
                        </span>
                      )}
                      {usr.is_active === false && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                          Inactive
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-500">{usr.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-xs"
                        style={{ backgroundColor: `${role.color}20`, color: role.color }}
                      >
                        <role.icon size={12} />
                        <span>{role.label}</span>
                      </div>
                      {empSkills.length > 0 && (
                        <span className="text-xs text-zinc-500">
                          {empSkills.length} skill{empSkills.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {canEdit && (
                  <div className="flex items-center gap-2">
                    {/* Role selector */}
                    <select
                      value={usr.role || 'technician'}
                      onChange={(e) => handleUpdateUserRole(usr.id, e.target.value)}
                      disabled={saving}
                      className="px-2 py-1 bg-zinc-700 border border-zinc-600 rounded text-sm text-white focus:outline-none focus:border-zinc-500"
                    >
                      {USER_ROLES.filter(r => getRoleLevel(currentUserRole) > r.level || currentUserRole === 'owner').map(r => (
                        <option key={r.id} value={r.id}>{r.label}</option>
                      ))}
                    </select>

                    {/* Toggle active */}
                    <button
                      onClick={() => handleToggleUserActive(usr.id, !usr.is_active)}
                      disabled={saving}
                      className={`p-2 rounded-lg transition-colors ${
                        usr.is_active
                          ? 'hover:bg-red-500/20 text-red-400'
                          : 'hover:bg-green-500/20 text-green-400'
                      }`}
                      title={usr.is_active ? 'Deactivate user' : 'Activate user'}
                    >
                      {usr.is_active ? <UserX size={16} /> : <UserPlus size={16} />}
                    </button>
                  </div>
                )}
              </div>

              {/* User's current skills */}
              {empSkills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {empSkills.slice(0, 5).map(es => {
                    const level = PROFICIENCY_LEVELS.find(l => l.id === es.proficiency_level);
                    return (
                      <span
                        key={es.id}
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `${level?.color}20`,
                          color: level?.color
                        }}
                      >
                        {es.skill?.name}
                      </span>
                    );
                  })}
                  {empSkills.length > 5 && (
                    <span className="text-xs text-zinc-500">+{empSkills.length - 5} more</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  /**
   * Render Skills Tab - Uses new 3-level hierarchy component
   * Categories are now managed within SkillsManager
   */
  const renderSkillsTab = () => (
    <SkillsManager
      onSuccess={(msg) => {
        setSuccess(msg);
        setTimeout(() => setSuccess(null), 3000);
      }}
      onError={(msg) => setError(msg)}
    />
  );

  /**
   * Render Employee Skills Tab
   */
  const renderEmployeeSkillsTab = () => (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Employee Skills</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Assign skills and proficiency levels to team members.
      </p>

      <div className="grid gap-4">
        {users.filter(u => u.is_active !== false).map(employee => {
          const empSkills = getEmployeeSkills(employee.id);
          const role = USER_ROLES.find(r => r.id === employee.role) || USER_ROLES[0];

          return (
            <div key={employee.id} className="rounded-xl border p-4" style={sectionStyles.card}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                    style={{ backgroundColor: employee.avatar_color || role.color }}
                  >
                    {(employee.full_name || employee.email || 'U')[0].toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">
                      {employee.full_name || employee.email}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {role.label} • {empSkills.length} skills
                    </p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Award}
                  onClick={() => {
                    setSelectedEmployee(employee);
                    setEmployeeSkillsModal(true);
                  }}
                >
                  Manage Skills
                </Button>
              </div>

              {empSkills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {empSkills.map(es => {
                    const level = PROFICIENCY_LEVELS.find(l => l.id === es.proficiency_level);
                    return (
                      <div
                        key={es.id}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs"
                        style={{ backgroundColor: `${level?.color}20`, color: level?.color }}
                      >
                        {level && <level.icon size={12} />}
                        <span>{es.skill?.name}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  /**
   * Render Features Tab
   */
  const renderFeaturesTab = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Feature Flags</h2>
        <p className="text-sm text-zinc-500">Enable or disable features for each role. User-specific overrides can be set in the Users tab.</p>
      </div>

      {featureFlags.length === 0 ? (
        <div className="text-center py-8 text-zinc-500">
          <ToggleLeft size={32} className="mx-auto mb-2 opacity-50" />
          <p>No feature flags configured. Run the migration to add features.</p>
        </div>
      ) : (
        <>
          {/* Role matrix header */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-zinc-400 w-64">Feature</th>
                  {USER_ROLES.map(role => (
                    <th key={role.id} className="text-center py-3 px-2 text-sm font-medium" style={{ color: role.color }}>
                      <div className="flex items-center justify-center gap-1">
                        <role.icon size={14} />
                        <span className="hidden sm:inline">{role.label}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(featuresByCategory).map(([category, flags]) => {
                  const catInfo = categoryLabels[category] || categoryLabels.general;
                  const CatIcon = catInfo.icon;

                  return (
                    <React.Fragment key={category}>
                      {/* Category header */}
                      <tr className="bg-zinc-800/50">
                        <td colSpan={USER_ROLES.length + 1} className="py-2 px-4">
                          <div className="flex items-center gap-2">
                            <CatIcon size={14} style={{ color: catInfo.color }} />
                            <span className="text-sm font-medium" style={{ color: catInfo.color }}>{catInfo.label}</span>
                          </div>
                        </td>
                      </tr>

                      {/* Feature rows */}
                      {flags.map(flag => (
                        <tr key={flag.id} className="border-b border-zinc-700/50 hover:bg-zinc-800/30">
                          <td className="py-3 px-4">
                            <div className="text-sm text-white">{flag.label}</div>
                            {flag.description && (
                              <div className="text-xs text-zinc-500">{flag.description}</div>
                            )}
                          </td>
                          {USER_ROLES.map(role => {
                            const enabled = roleFeatureFlags[role.id]?.[flag.id] ?? flag.default_enabled;
                            return (
                              <td key={role.id} className="text-center py-3 px-2">
                                <button
                                  onClick={() => handleToggleRoleFeature(role.id, flag.id, enabled)}
                                  disabled={saving}
                                  className="p-1 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {enabled ? (
                                    <ToggleRight size={24} className="text-green-500" />
                                  ) : (
                                    <ToggleLeft size={24} className="text-zinc-500" />
                                  )}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* User-specific overrides section */}
          <div className="mt-8">
            <h3 className="text-md font-semibold text-gray-900 dark:text-white mb-3">User-Specific Overrides</h3>
            <p className="text-sm text-zinc-500 mb-4">Override feature settings for individual users (takes priority over role settings).</p>

            <div className="mb-4">
              <select
                value={selectedUserForFeatures?.id || ''}
                onChange={(e) => {
                  const selectedUser = users.find(u => u.id === e.target.value);
                  setSelectedUserForFeatures(selectedUser || null);
                }}
                className="px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white w-full max-w-md"
              >
                <option value="">Select a user to manage...</option>
                {users.filter(u => u.is_active !== false).map(usr => (
                  <option key={usr.id} value={usr.id}>
                    {usr.full_name || usr.email} ({usr.role || 'technician'})
                  </option>
                ))}
              </select>
            </div>

            {selectedUserForFeatures && (
              <div className="rounded-xl border p-4" style={sectionStyles.card}>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                    style={{ backgroundColor: selectedUserForFeatures.avatar_color || '#8B5CF6' }}
                  >
                    {(selectedUserForFeatures.full_name || selectedUserForFeatures.email || 'U')[0].toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-medium text-white">{selectedUserForFeatures.full_name || selectedUserForFeatures.email}</h4>
                    <p className="text-xs text-zinc-500">Role: {selectedUserForFeatures.role || 'technician'}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {featureFlags.map(flag => {
                    const userOverride = userFeatureFlags[selectedUserForFeatures.id]?.[flag.id];
                    const roleDefault = roleFeatureFlags[selectedUserForFeatures.role || 'technician']?.[flag.id] ?? flag.default_enabled;
                    const currentValue = userOverride?.enabled ?? roleDefault;

                    return (
                      <div
                        key={flag.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-zinc-700/30"
                      >
                        <div className="flex-1">
                          <div className="text-sm text-white">{flag.label}</div>
                          <div className="text-xs text-zinc-500">
                            Role default: {roleDefault ? 'Enabled' : 'Disabled'}
                            {userOverride && (
                              <span className="ml-2 text-violet-400">(User override active)</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleUserFeature(
                              selectedUserForFeatures.id,
                              flag.id,
                              currentValue,
                              userOverride?.id
                            )}
                            disabled={saving}
                            className="p-1 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {currentValue ? (
                              <ToggleRight size={24} className="text-green-500" />
                            ) : (
                              <ToggleLeft size={24} className="text-zinc-500" />
                            )}
                          </button>
                          {userOverride && (
                            <button
                              onClick={() => handleRemoveUserFeatureOverride(userOverride.id)}
                              disabled={saving}
                              className="p-1 rounded-lg hover:bg-zinc-600 text-zinc-400 hover:text-white"
                              title="Remove override (use role default)"
                            >
                              <X size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  /**
   * CSV Import Handlers
   */
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const parseCSV = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      setError('CSV must have at least a header row and one data row');
      return;
    }

    // Detect delimiter (comma, semicolon, or tab) - check first few lines
    let delimiter = ',';
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i];
      // Count potential delimiters
      const commas = (line.match(/,/g) || []).length;
      const tabs = (line.match(/\t/g) || []).length;
      const semis = (line.match(/;/g) || []).length;

      if (tabs > commas && tabs > semis && tabs >= 2) {
        delimiter = '\t';
        break;
      } else if (semis > commas && semis > tabs && semis >= 2) {
        delimiter = ';';
        break;
      } else if (commas >= 2) {
        delimiter = ',';
        break;
      }
    }

    // Parse a single row - handle quoted values properly
    const parseRow = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++; // Skip escaped quote
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === delimiter && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim()); // Don't forget last field
      return result;
    };

    // Find the actual header row by looking for rows with multiple columns
    // that look like headers (contain words like name, email, phone, etc.)
    const headerKeywords = ['name', 'email', 'phone', 'company', 'address', 'mobile', 'customer', 'contact', 'first', 'last'];
    let headerRowIndex = 0;

    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const parsed = parseRow(lines[i]);
      const nonEmptyCols = parsed.filter(col => col.trim()).length;

      // Check if this row has multiple columns with header-like text
      if (nonEmptyCols >= 2) {
        const lowerRow = parsed.join(' ').toLowerCase();
        const matchCount = headerKeywords.filter(kw => lowerRow.includes(kw)).length;

        // If we find a row with 2+ columns and contains header keywords, use it
        if (matchCount >= 2) {
          headerRowIndex = i;
          console.log('[AdminPage] Found header row at index:', i, 'row:', parsed);
          break;
        }
      }
    }

    const headers = parseRow(lines[headerRowIndex]);
    console.log('[AdminPage] CSV headers detected:', headers, 'delimiter:', delimiter, 'headerRow:', headerRowIndex);
    setCsvHeaders(headers);

    // Parse data rows starting after the header row
    const data = [];
    for (let i = headerRowIndex + 1; i < lines.length; i++) {
      const values = parseRow(lines[i]);
      const row = {};
      values.forEach((val, idx) => {
        if (idx < headers.length && headers[idx]) {
          row[headers[idx]] = val;
        }
      });
      // Only add rows that have at least one non-empty value
      if (Object.values(row).some(v => v && v.trim())) {
        data.push(row);
      }
    }
    console.log('[AdminPage] CSV parsed:', data.length, 'rows starting from line', headerRowIndex + 2, ', sample:', data[0]);

    setCsvData(data);

    // Auto-map fields by matching header names with common variations
    // Priority: exact matches > specific patterns > includes patterns
    const headerAliases = {
      // Name - prefer "full name" alone over "customer full name" (which is company in QuickBooks)
      name: ['name', 'full name', 'fullname', 'contact name', 'client name', 'display name'],
      first_name: ['first name', 'firstname', 'first', 'given name'],
      last_name: ['last name', 'lastname', 'last', 'surname', 'family name'],
      email: ['email', 'email address', 'e-mail', 'mail'],
      phone: ['phone', 'phone number', 'phone numbers', 'telephone', 'tel', 'mobile', 'cell', 'primary phone', 'work phone'],
      // Company - "customer full name" in QuickBooks is typically the company/customer, not a person's name
      company: ['company', 'company name', 'organization', 'org', 'business', 'business name', 'employer', 'customer full name', 'customer name'],
      role: ['role', 'title', 'job title', 'position', 'job', 'occupation'],
      // Address - prefer billing address over shipping (typically more permanent)
      address: ['address', 'full address', 'street address', 'mailing address', 'bill address', 'billing address', 'ship address', 'shipping address', 'service address'],
      address1: ['address 1', 'address1', 'street', 'street 1', 'address line 1'],
      address2: ['address 2', 'address2', 'street 2', 'apt', 'suite', 'unit', 'address line 2'],
      city: ['city', 'town'],
      state: ['state', 'province', 'region', 'st'],
      zip: ['zip', 'zip code', 'zipcode', 'postal', 'postal code', 'postcode']
    };

    const autoMapping = {};

    // Exclusion rules: if header contains these words, don't map to certain fields
    const exclusionRules = {
      name: ['address', 'street', 'city', 'state', 'zip', 'postal', 'bill', 'ship'],
      first_name: ['address', 'street', 'city', 'state', 'zip', 'postal', 'bill', 'ship'],
      last_name: ['address', 'street', 'city', 'state', 'zip', 'postal', 'bill', 'ship'],
      company: ['address', 'street', 'city', 'state', 'zip', 'postal'],
    };

    // Check if header should be excluded from a field
    const shouldExclude = (fieldKey, lowerHeader) => {
      const exclusions = exclusionRules[fieldKey];
      if (!exclusions) return false;
      return exclusions.some(excl => lowerHeader.includes(excl));
    };

    // First pass: exact matches only (highest priority)
    headers.forEach(header => {
      const lowerHeader = header.toLowerCase().trim();
      Object.entries(headerAliases).forEach(([fieldKey, aliases]) => {
        if (!autoMapping[fieldKey] && aliases.some(alias => lowerHeader === alias)) {
          autoMapping[fieldKey] = header;
        }
      });
    });

    // Second pass: includes matches for remaining fields (with exclusion rules)
    headers.forEach(header => {
      const lowerHeader = header.toLowerCase().trim();
      Object.entries(headerAliases).forEach(([fieldKey, aliases]) => {
        if (!autoMapping[fieldKey] &&
            !shouldExclude(fieldKey, lowerHeader) &&
            aliases.some(alias => lowerHeader.includes(alias))) {
          autoMapping[fieldKey] = header;
        }
      });
    });

    console.log('[AdminPage] Auto-mapping:', autoMapping, 'Headers:', headers);
    setFieldMapping(autoMapping);
    setImportStep('map');
  };

  const handleMappingChange = (fieldKey, csvHeader) => {
    setFieldMapping(prev => ({
      ...prev,
      [fieldKey]: csvHeader || null
    }));
  };

  const generatePreview = async () => {
    // Map CSV data to contact fields first
    const mappedData = csvData.map(row => {
      const mapped = {};
      Object.entries(fieldMapping).forEach(([fieldKey, csvHeader]) => {
        if (csvHeader) {
          mapped[fieldKey] = row[csvHeader] || '';
        }
      });
      return mapped;
    });

    // Debug: log first mapped contact to verify address is captured
    if (mappedData.length > 0) {
      console.log('[AdminPage] Field mapping:', fieldMapping);
      console.log('[AdminPage] First mapped contact:', mappedData[0]);
      console.log('[AdminPage] Address value:', mappedData[0]?.address);
    }

    if (useAIProcessing) {
      // Use AI to parse and clean the data
      setImportStep('ai-processing');
      try {
        console.log('[AdminPage] Sending', mappedData.length, 'contacts to AI for processing');
        const response = await fetch('/api/ai/parse-contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contacts: mappedData })
        });

        // Check if response is OK before trying to parse JSON
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[AdminPage] AI API error:', response.status, errorText);
          throw new Error(`API returned ${response.status}`);
        }

        const result = await response.json();

        if (result.success && result.contacts) {
          console.log('[AdminPage] AI processed', result.contacts.length, 'contacts');
          setAiProcessedData(result.contacts);
          setImportPreview(result.contacts.slice(0, 5));
        } else {
          console.error('[AdminPage] AI processing failed:', result.error);
          // Fall back to local parsing instead of showing error
          console.log('[AdminPage] Falling back to local parsing');
          const localParsed = parseContactsLocally(mappedData);
          setAiProcessedData(localParsed);
          setImportPreview(localParsed.slice(0, 5));
        }
      } catch (err) {
        console.error('[AdminPage] AI processing error:', err);
        // Fall back to local parsing instead of showing error
        console.log('[AdminPage] Falling back to local parsing due to error');
        const localParsed = parseContactsLocally(mappedData);
        setAiProcessedData(localParsed);
        setImportPreview(localParsed.slice(0, 5));
      }
    } else {
      setAiProcessedData(mappedData);
      setImportPreview(mappedData.slice(0, 5));
    }

    setImportStep('preview');
  };

  // Pre-fetch all existing contacts for fast in-memory duplicate checking
  const fetchAllExistingContacts = async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, name, email, phone, company');
    if (error) {
      console.error('[AdminPage] Failed to fetch existing contacts:', error);
      return [];
    }
    return data || [];
  };

  // Fast in-memory duplicate check
  const checkDuplicateInMemory = (contact, existingContacts) => {
    // Check by email first (most reliable)
    if (contact.email) {
      const emailLower = contact.email.toLowerCase();
      const match = existingContacts.find(c => c.email?.toLowerCase() === emailLower);
      if (match) return match;
    }

    // Then check by phone (last 7 digits)
    if (contact.phone) {
      const normalizedPhone = contact.phone.replace(/\D/g, '');
      if (normalizedPhone.length >= 7) {
        const last7 = normalizedPhone.slice(-7);
        const match = existingContacts.find(c => {
          if (!c.phone) return false;
          const existingLast7 = c.phone.replace(/\D/g, '').slice(-7);
          return existingLast7 === last7;
        });
        if (match) return match;
      }
    }

    return null;
  };

  const runImport = async () => {
    // Use AI-processed data if available, otherwise map from CSV
    const dataToImport = aiProcessedData.length > 0 ? aiProcessedData : csvData.map(row => {
      const mapped = {};
      Object.entries(fieldMapping).forEach(([fieldKey, csvHeader]) => {
        if (csvHeader && row[csvHeader]) {
          mapped[fieldKey] = row[csvHeader];
        }
      });
      return mapped;
    });

    // Debug: log first contact being imported to verify address
    if (dataToImport.length > 0) {
      console.log('[AdminPage] First contact to import:', dataToImport[0]);
      console.log('[AdminPage] Address being imported:', dataToImport[0]?.address);
    }

    setImportStep('importing');
    setImportProgress({ current: 0, total: dataToImport.length, skipped: 0, errors: [] });

    const errors = [];
    let skipped = 0;

    // Pre-fetch existing contacts for fast in-memory duplicate checking
    console.log('[AdminPage] Fetching existing contacts for duplicate checking...');
    const existingContacts = await fetchAllExistingContacts();
    console.log('[AdminPage] Found', existingContacts.length, 'existing contacts');

    // Prepare all contacts first (validation + cleaning)
    const validColumns = ['name', 'full_name', 'first_name', 'last_name', 'email', 'phone', 'company', 'role',
                         'address', 'address1', 'address2', 'city', 'state', 'zip', 'notes',
                         'is_internal', 'is_active'];

    const contactsToInsert = [];
    const contactsToMerge = [];

    // Helper to detect if a string looks like an address (not a name)
    const looksLikeAddress = (str) => {
      if (!str) return false;
      // Check for common address patterns
      return (
        /^\d+\s/.test(str) ||  // Starts with number like "100 Main St"
        /\d{5}/.test(str) ||   // Contains 5-digit zip code
        /\b(street|st\.|ave|avenue|drive|dr\.|road|rd\.|lane|ln\.|blvd|court|ct\.|way|place|pl\.|highway|hwy)\b/i.test(str) ||
        /\b(fl|in|ca|tx|ny|oh|pa|il|ga|nc)\s+\d{4,5}/i.test(str) ||  // State + zip
        /,\s*(fl|in|ca|tx|ny|oh|pa|il|usa|united states)\s*$/i.test(str) ||  // Ends with state/country
        /\bpo\s*box\b/i.test(str)  // PO Box
      );
    };

    for (let i = 0; i < dataToImport.length; i++) {
      const contact = { ...dataToImport[i] };

      // Derive name from available fields if not directly set
      if (!contact.name) {
        if (contact.first_name || contact.last_name) {
          contact.name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
        } else if (contact.company && !looksLikeAddress(contact.company)) {
          // Only use company as name if it doesn't look like an address
          contact.name = contact.company;
        }
      }

      // Validate that the derived name doesn't look like an address
      if (contact.name && looksLikeAddress(contact.name)) {
        console.warn('[AdminPage] Row', i + 2, ': Name looks like address, clearing:', contact.name.substring(0, 50));
        contact.name = null;
      }

      // Skip if still no name after derivation
      if (!contact.name) {
        if (!contact.email && !contact.phone) {
          errors.push({ row: i + 2, error: 'No valid name found (address detected in name field)' });
          skipped++;
          continue;
        }
        // Use email prefix as name (before @), properly capitalized
        if (contact.email) {
          const emailPrefix = contact.email.split('@')[0].replace(/[._-]/g, ' ');
          contact.name = emailPrefix.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        } else {
          contact.name = contact.phone || 'Unknown Contact';
        }
      }

      // Filter to only valid database columns
      const cleanContact = {};
      validColumns.forEach(col => {
        if (contact[col] !== undefined && contact[col] !== null && contact[col] !== '') {
          cleanContact[col] = contact[col];
        }
      });

      // Ensure full_name is set
      if (!cleanContact.full_name) {
        cleanContact.full_name = cleanContact.name;
      }

      // Fast in-memory duplicate check
      const existing = checkDuplicateInMemory(contact, existingContacts);

      if (existing) {
        if (duplicateHandling === 'skip') {
          skipped++;
        } else if (duplicateHandling === 'merge') {
          contactsToMerge.push({ row: i + 2, cleanContact, existingId: existing.id, existing });
        } else if (duplicateHandling === 'create') {
          contactsToInsert.push({ row: i + 2, cleanContact });
        }
      } else {
        contactsToInsert.push({ row: i + 2, cleanContact });
      }

      // Update progress during preparation phase
      if (i % 50 === 0) {
        const currentSkipped = skipped;
        const currentErrors = [...errors];
        setImportProgress(prev => ({ ...prev, current: i + 1, skipped: currentSkipped, errors: currentErrors }));
      }
    }

    console.log('[AdminPage] Prepared:', contactsToInsert.length, 'to insert,', contactsToMerge.length, 'to merge,', skipped, 'skipped');

    // Batch insert new contacts (in chunks of 50)
    const BATCH_SIZE = 50;
    for (let i = 0; i < contactsToInsert.length; i += BATCH_SIZE) {
      const batch = contactsToInsert.slice(i, i + BATCH_SIZE);
      const contactsData = batch.map(b => b.cleanContact);

      const { error } = await supabase.from('contacts').insert(contactsData);
      if (error) {
        console.error('[AdminPage] Batch insert error:', error.message);
        // On batch error, try individual inserts to identify problematic rows
        for (const item of batch) {
          const { error: singleError } = await supabase.from('contacts').insert([item.cleanContact]);
          if (singleError) {
            console.error('[AdminPage] Insert error for row', item.row, ':', singleError.message);
            errors.push({ row: item.row, error: `Insert failed: ${singleError.message}` });
          }
        }
      }

      const currentSkipped = skipped;
      const currentErrors = [...errors];
      setImportProgress(prev => ({
        ...prev,
        current: dataToImport.length - contactsToMerge.length + Math.min(i + BATCH_SIZE, contactsToInsert.length),
        skipped: currentSkipped,
        errors: currentErrors
      }));
    }

    // Process merges individually (need to update specific fields)
    for (const { row, cleanContact, existingId, existing } of contactsToMerge) {
      const updates = {};
      Object.entries(cleanContact).forEach(([key, value]) => {
        if (value && !existing[key]) {
          updates[key] = value;
        }
      });

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from('contacts')
          .update(updates)
          .eq('id', existingId);
        if (error) {
          console.error('[AdminPage] Merge error for row', row, ':', error.message);
          errors.push({ row, error: `Merge failed: ${error.message}` });
        }
      } else {
        skipped++;
      }
    }

    setImportProgress({ current: dataToImport.length, total: dataToImport.length, skipped, errors });
    setImportStep('done');
  };

  const resetImport = () => {
    setCsvData([]);
    setCsvHeaders([]);
    setFieldMapping({});
    setImportPreview([]);
    setImportStep('upload');
    setImportProgress({ current: 0, total: 0, skipped: 0, errors: [] });
    setAiProcessedData([]);
  };

  /**
   * Render Import Tab
   */
  const renderImportTab = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Import Contacts</h2>
        <p className="text-sm text-zinc-500">Import contacts from CSV file with duplicate detection and field mapping.</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        {['upload', 'map', 'ai-processing', 'preview', 'importing', 'done'].map((step, idx) => (
          <React.Fragment key={step}>
            <div className={`flex items-center gap-1 ${
              importStep === step ? 'text-violet-600 font-medium' :
              ['upload', 'map', 'ai-processing', 'preview', 'importing', 'done'].indexOf(importStep) > idx ? 'text-green-600' : 'text-zinc-400'
            }`}>
              {['upload', 'map', 'ai-processing', 'preview', 'importing', 'done'].indexOf(importStep) > idx ? (
                <CheckCircle size={16} />
              ) : importStep === step && step === 'ai-processing' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <span className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs">
                  {idx + 1}
                </span>
              )}
              <span className="capitalize">{step === 'ai-processing' ? 'AI Parse' : step}</span>
            </div>
            {idx < 5 && <ArrowRight size={14} className="text-zinc-300" />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 1: Upload */}
      {importStep === 'upload' && (
        <div className="rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-600 p-8 text-center">
          <FileSpreadsheet size={48} className="mx-auto mb-4 text-zinc-400" />
          <h3 className="font-medium text-zinc-700 dark:text-zinc-300 mb-2">Upload CSV File</h3>
          <p className="text-sm text-zinc-500 mb-4">Select a CSV file containing contact information</p>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-violet-500 text-white rounded-lg cursor-pointer hover:bg-violet-600 transition-colors">
            <Upload size={16} />
            Choose File
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
          </label>
          <p className="text-xs text-zinc-400 mt-4">
            CSV should have headers in the first row. Supported fields: Name, Email, Phone, Company, Role, Address, Notes
          </p>
        </div>
      )}

      {/* Step 2: Map Fields */}
      {importStep === 'map' && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              <strong>{csvData.length}</strong> records found. Map your CSV columns to contact fields below.
            </p>
          </div>

          <div className="grid gap-3">
            {CONTACT_FIELDS.map(field => (
              <div key={field.key} className="flex items-center gap-4">
                <div className="w-32 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </div>
                <ArrowRight size={16} className="text-zinc-400" />
                <select
                  value={fieldMapping[field.key] || ''}
                  onChange={(e) => handleMappingChange(field.key, e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-sm"
                >
                  <option value="">-- Don't import --</option>
                  {csvHeaders.map(header => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Duplicate Handling */}
          <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
            <h4 className="font-medium text-sm mb-3">Duplicate Handling</h4>
            <div className="flex gap-4">
              {[
                { id: 'skip', label: 'Skip duplicates', desc: 'Keep existing, ignore new' },
                { id: 'merge', label: 'Merge', desc: 'Fill empty fields only' },
                { id: 'create', label: 'Create new', desc: 'Allow duplicates' }
              ].map(opt => (
                <label key={opt.id} className={`flex-1 p-3 rounded-lg border cursor-pointer transition-colors ${
                  duplicateHandling === opt.id
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                    : 'border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                }`}>
                  <input
                    type="radio"
                    name="duplicateHandling"
                    value={opt.id}
                    checked={duplicateHandling === opt.id}
                    onChange={(e) => setDuplicateHandling(e.target.value)}
                    className="sr-only"
                  />
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-zinc-500">{opt.desc}</div>
                </label>
              ))}
            </div>
          </div>

          {/* AI Processing Toggle */}
          <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-900/10 dark:to-blue-900/10">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={useAIProcessing}
                onChange={(e) => setUseAIProcessing(e.target.checked)}
                className="w-5 h-5 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-violet-500" />
                  <span className="font-medium text-sm">AI-Assisted Import</span>
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Use Gemini AI to parse names (first/last), extract phone numbers from complex formats,
                  and identify companies vs. people
                </p>
              </div>
            </label>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={resetImport}>
              <X size={16} />
              Cancel
            </Button>
            <Button onClick={generatePreview} disabled={!fieldMapping.name}>
              {useAIProcessing ? <Sparkles size={16} /> : <ArrowRight size={16} />}
              {useAIProcessing ? 'Process with AI' : 'Preview Import'}
            </Button>
          </div>
        </div>
      )}

      {/* Step: AI Processing */}
      {importStep === 'ai-processing' && (
        <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 p-8 text-center">
          <Loader2 size={48} className="mx-auto mb-4 text-violet-500 animate-spin" />
          <h3 className="font-medium text-violet-700 dark:text-violet-300 mb-2">AI Processing Contacts</h3>
          <p className="text-sm text-violet-600 dark:text-violet-400">
            Gemini is parsing names, phone numbers, and identifying contact types...
          </p>
          <p className="text-xs text-zinc-500 mt-4">
            Processing {csvData.length} contacts in batches
          </p>
        </div>
      )}

      {/* Step 3: Preview */}
      {importStep === 'preview' && (
        <div className="space-y-4">
          <div className={`p-4 rounded-lg border ${
            useAIProcessing && aiProcessedData.length > 0
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
          }`}>
            <p className={`text-sm ${
              useAIProcessing && aiProcessedData.length > 0
                ? 'text-green-700 dark:text-green-300'
                : 'text-amber-700 dark:text-amber-300'
            }`}>
              {useAIProcessing && aiProcessedData.length > 0 ? (
                <>
                  <Sparkles size={14} className="inline mr-1" />
                  AI processed <strong>{aiProcessedData.length}</strong> contacts. Preview below shows parsed data.
                </>
              ) : (
                <>Preview of first 5 records. Ready to import <strong>{csvData.length}</strong> contacts.</>
              )}
            </p>
          </div>

          <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-700 rounded-lg">
            <table className="min-w-max w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
                  <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Name</th>
                  <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">First</th>
                  <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Last</th>
                  <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Email</th>
                  <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Phone</th>
                  <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Company</th>
                  <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Address</th>
                  <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Role</th>
                  <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Notes</th>
                  {useAIProcessing && <th className="text-left p-2 font-medium text-zinc-600 dark:text-zinc-400 whitespace-nowrap">Type</th>}
                </tr>
              </thead>
              <tbody>
                {importPreview.map((row, idx) => (
                  <tr key={idx} className="border-b border-zinc-100 dark:border-zinc-800">
                    <td className="p-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{row.name || '-'}</td>
                    <td className="p-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{row.first_name || '-'}</td>
                    <td className="p-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{row.last_name || '-'}</td>
                    <td className="p-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{row.email || '-'}</td>
                    <td className="p-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{row.phone || '-'}</td>
                    <td className="p-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{row.company || '-'}</td>
                    <td className="p-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap max-w-xs truncate" title={row.address || row.address1 || ''}>{row.address || row.address1 || '-'}</td>
                    <td className="p-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap">{row.role || '-'}</td>
                    <td className="p-2 text-zinc-700 dark:text-zinc-300 whitespace-nowrap max-w-xs truncate" title={row.notes || ''}>{row.notes || '-'}</td>
                    {useAIProcessing && (
                      <td className="p-2 whitespace-nowrap">
                        {row.is_company ? (
                          <span className="px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">Company</span>
                        ) : (
                          <span className="px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Person</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setImportStep('map')}>
              <ArrowLeft size={16} />
              Back
            </Button>
            <Button onClick={runImport}>
              <Upload size={16} />
              Import Contacts
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Importing */}
      {importStep === 'importing' && (
        <div className="space-y-4 text-center py-8">
          <Loader2 size={48} className="mx-auto animate-spin text-violet-500" />
          <h3 className="font-medium text-lg">Importing contacts...</h3>
          <div className="w-full max-w-md mx-auto">
            <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 transition-all duration-300"
                style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
              />
            </div>
            <p className="text-sm text-zinc-500 mt-2">
              {importProgress.current} of {importProgress.total} processed
              {importProgress.skipped > 0 && ` (${importProgress.skipped} skipped)`}
            </p>
          </div>
        </div>
      )}

      {/* Step 5: Done */}
      {importStep === 'done' && (
        <div className="space-y-4 text-center py-8">
          <CheckCircle size={48} className="mx-auto text-green-500" />
          <h3 className="font-medium text-lg">Import Complete!</h3>
          <p className="text-zinc-600 dark:text-zinc-400">
            Processed {importProgress.total} records.
            {importProgress.skipped > 0 && ` ${importProgress.skipped} skipped.`}
            {importProgress.errors.length > 0 && ` ${importProgress.errors.length} errors.`}
          </p>

          {importProgress.errors.length > 0 && (
            <div className="text-left max-w-md mx-auto p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <h4 className="font-medium text-red-700 dark:text-red-300 mb-2 flex items-center gap-2">
                <AlertTriangle size={16} />
                Errors
              </h4>
              <ul className="text-sm text-red-600 dark:text-red-400 space-y-1">
                {importProgress.errors.slice(0, 5).map((err, idx) => (
                  <li key={idx}>Row {err.row}: {err.error}</li>
                ))}
                {importProgress.errors.length > 5 && (
                  <li>...and {importProgress.errors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          <Button onClick={resetImport}>
            <RefreshCw size={16} />
            Import More
          </Button>
        </div>
      )}
    </div>
  );

  /**
   * Render Integrations Tab
   */
  const renderIntegrationsTab = () => (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Integrations</h2>
        <p className="text-sm text-zinc-500">Connect external services and manage system integrations.</p>
      </div>

      {/* Knowledge Base */}
      <div className="rounded-xl border p-4" style={sectionStyles.card}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <BookOpen size={24} className="text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white">Knowledge Base</h3>
              <p className="text-sm text-zinc-500">Upload and manage technical documentation for AI-powered search</p>
            </div>
          </div>
          <Button
            onClick={() => navigate('/settings/knowledge')}
            variant="secondary"
            size="sm"
            icon={ExternalLink}
          >
            Manage
          </Button>
        </div>
      </div>

      {/* QuickBooks Integration */}
      <div className="rounded-xl border p-4 space-y-4" style={sectionStyles.card}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <Link2 size={24} className="text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white">QuickBooks Online</h3>
            <p className="text-sm text-zinc-500">Connect to QuickBooks to export service invoices.</p>
          </div>
        </div>

        {qboStatus.loading ? (
          <div className="flex items-center gap-2 text-gray-500 p-3">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Checking connection...</span>
          </div>
        ) : qboStatus.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <CheckCircle size={20} className="text-green-600 dark:text-green-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  Connected to QuickBooks
                </p>
                {qboStatus.companyName && (
                  <p className="text-xs text-green-700 dark:text-green-300">
                    Company: {qboStatus.companyName}
                  </p>
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={Link2Off}
                onClick={handleQboDisconnect}
              >
                Disconnect
              </Button>
            </div>
            {qboStatus.needsRefresh && (
              <p className="text-xs text-amber-500">
                Note: Token will auto-refresh on next API call.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-zinc-700/50 border border-gray-200 dark:border-zinc-600">
              <Link2Off size={20} className="text-gray-400" />
              <div className="flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Not connected
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Connect to export service tickets as invoices to QuickBooks.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                icon={Link2}
                onClick={handleQboConnect}
                disabled={qboConnecting}
              >
                {qboConnecting ? 'Connecting...' : 'Connect'}
              </Button>
            </div>
            {qboStatus.error && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400">
                  {qboStatus.error}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* System Account Integration */}
      <SystemAccountSettings mode={mode} />
    </div>
  );

  /**
   * Employee Skills Modal
   */
  const renderEmployeeSkillsModal = () => {
    if (!employeeSkillsModal || !selectedEmployee) return null;

    const empSkills = getEmployeeSkills(selectedEmployee.id);
    const role = USER_ROLES.find(r => r.id === selectedEmployee.role) || USER_ROLES[0];

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-zinc-800 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-xl">
          <div className="p-4 border-b border-gray-200 dark:border-zinc-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                style={{ backgroundColor: selectedEmployee.avatar_color || role.color }}
              >
                {(selectedEmployee.full_name || selectedEmployee.email || 'U')[0].toUpperCase()}
              </div>
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-white">
                  {selectedEmployee.full_name || selectedEmployee.email}
                </h2>
                <p className="text-xs text-gray-500">Manage Skills</p>
              </div>
            </div>
            <button
              onClick={() => {
                setEmployeeSkillsModal(false);
                setSelectedEmployee(null);
              }}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700"
            >
              <X size={20} className="text-gray-500" />
            </button>
          </div>

          <div className="p-4 overflow-y-auto max-h-[60vh]">
            <div className="flex gap-4 mb-4 p-3 bg-gray-50 dark:bg-zinc-700/50 rounded-lg">
              {PROFICIENCY_LEVELS.map(level => (
                <div key={level.id} className="flex items-center gap-2">
                  <level.icon size={14} style={{ color: level.color }} />
                  <span className="text-xs text-gray-600 dark:text-gray-300">{level.label}</span>
                </div>
              ))}
            </div>

            {skillsByCategory.map(category => (
              <div key={category.id} className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: category.color }} />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{category.label}</span>
                </div>

                <div className="space-y-2">
                  {category.skills.map(skill => {
                    const empSkill = empSkills.find(es => es.skill_id === skill.id);

                    return (
                      <div
                        key={skill.id}
                        className="flex items-center justify-between p-2 rounded-lg border border-gray-200 dark:border-zinc-600"
                      >
                        <span className="text-sm text-gray-900 dark:text-white">{skill.name}</span>

                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            {PROFICIENCY_LEVELS.map(level => {
                              const isActive = empSkill?.proficiency_level === level.id;
                              return (
                                <button
                                  key={level.id}
                                  onClick={() => handleAssignSkill(selectedEmployee.id, skill.id, level.id)}
                                  className="p-1.5 rounded-lg transition-colors"
                                  style={{
                                    backgroundColor: isActive ? level.color : `${level.color}20`,
                                    color: isActive ? '#fff' : level.color
                                  }}
                                  title={`${level.label}: ${level.description}`}
                                >
                                  <level.icon size={14} />
                                </button>
                              );
                            })}
                          </div>

                          {empSkill && (
                            <button
                              onClick={() => handleRemoveEmployeeSkill(empSkill.id)}
                              className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500"
                              title="Remove skill"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-gray-200 dark:border-zinc-700 flex justify-end">
            <Button onClick={() => { setEmployeeSkillsModal(false); setSelectedEmployee(null); }}>
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto px-4 pb-24 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/settings')}
            className="p-2 rounded-lg hover:bg-zinc-700/50 transition-colors"
          >
            <ArrowLeft size={20} className="text-zinc-400" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
            <Settings size={20} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Admin</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">System configuration and team management</p>
          </div>
        </div>
        {currentUserRole && (
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm"
            style={{
              backgroundColor: `${USER_ROLES.find(r => r.id === currentUserRole)?.color}20`,
              color: USER_ROLES.find(r => r.id === currentUserRole)?.color
            }}
          >
            {React.createElement(USER_ROLES.find(r => r.id === currentUserRole)?.icon || Shield, { size: 14 })}
            <span>{USER_ROLES.find(r => r.id === currentUserRole)?.label}</span>
          </div>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <AlertCircle size={16} className="text-red-500" />
          <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">
            <X size={14} />
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <CheckCircle size={16} className="text-green-500" />
          <span className="text-sm text-green-700 dark:text-green-300">{success}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'users'
              ? 'bg-violet-500 text-white'
              : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-600'
          }`}
        >
          <Users size={16} />
          Users
        </button>
        <button
          onClick={() => setActiveTab('skills')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'skills'
              ? 'bg-violet-500 text-white'
              : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-600'
          }`}
        >
          <Award size={16} />
          Skills
        </button>
        <button
          onClick={() => setActiveTab('employee-skills')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'employee-skills'
              ? 'bg-violet-500 text-white'
              : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-600'
          }`}
        >
          <UserCog size={16} />
          Employee Skills
        </button>
        <button
          onClick={() => setActiveTab('features')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'features'
              ? 'bg-violet-500 text-white'
              : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-600'
          }`}
        >
          <Zap size={16} />
          Features
        </button>
        <button
          onClick={() => setActiveTab('integrations')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'integrations'
              ? 'bg-violet-500 text-white'
              : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-600'
          }`}
        >
          <Link2 size={16} />
          Integrations
        </button>
        <button
          onClick={() => setActiveTab('import')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'import'
              ? 'bg-violet-500 text-white'
              : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-600'
          }`}
        >
          <Upload size={16} />
          Import
        </button>
        <button
          onClick={() => setActiveTab('ai-training')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'ai-training'
              ? 'bg-purple-500 text-white'
              : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-600'
          }`}
        >
          <Bot size={16} />
          AI Training
        </button>
        <button
          onClick={() => setActiveTab('bug-todos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'bug-todos'
              ? 'bg-red-500 text-white'
              : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-600'
          }`}
        >
          <Bug size={16} />
          Bug Todos
        </button>
        <button
          onClick={() => setActiveTab('company')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'company'
              ? 'bg-violet-500 text-white'
              : 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-600'
          }`}
        >
          <Building2 size={16} />
          Company
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'users' && renderUsersTab()}
      {activeTab === 'skills' && renderSkillsTab()}
      {activeTab === 'employee-skills' && renderEmployeeSkillsTab()}
      {activeTab === 'features' && renderFeaturesTab()}
      {activeTab === 'integrations' && renderIntegrationsTab()}
      {activeTab === 'import' && renderImportTab()}
      {activeTab === 'ai-training' && <AITrainingTab />}
      {activeTab === 'bug-todos' && <BugTodosTab />}
      {activeTab === 'company' && (
        <div className="mt-6 p-6 rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Company Settings</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Manage company information, logo, and contact details</p>
            </div>
          </div>
          <CompanySettingsManager />
        </div>
      )}

      {/* Modals */}
      {renderEmployeeSkillsModal()}
    </div>
  );
};

export default AdminPage;
