import React, { useState, useRef, useEffect } from 'react';
import { 
  Camera, ArrowLeft, Calendar, FileText, Users, Plus, Check,
  Moon, Sun, Trash2, Download, Upload, ChevronDown,
  Clock, Zap, AlertCircle, Home, QrCode, MoreVertical,
  MapPin, Folder, Image, X, ChevronRight, Edit2, Bell,
  Search, Filter, LogIn, LogOut, CheckCircle, Eye, EyeOff,
  Package, Mail, Phone, Building, UserPlus, FolderOpen,
  Settings, BarChart, Send, Save, ExternalLink, Maximize
} from 'lucide-react';

const App = () => {
  const [darkMode, setDarkMode] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [userRole, setUserRole] = useState('technician'); // 'technician' or 'pm'
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [selectedWireDrop, setSelectedWireDrop] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [showResolvedIssues, setShowResolvedIssues] = useState(false);
  const [editableProject, setEditableProject] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMyProjects, setViewMyProjects] = useState(true);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const fileInputRef = useRef(null);
  const photoInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  
  // Wire Drop Form State - moved outside conditional rendering
  const [wireDropFormData, setWireDropFormData] = useState({
    id: '',
    uid: '',
    name: '',
    location: '',
    type: 'CAT6',
    prewirePhoto: null,
    installedPhoto: null
  });

  // Project Form State - moved outside conditional rendering
  const [projectFormData, setProjectFormData] = useState({
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
  });

  // Initialize form data when selections change
  useEffect(() => {
    if (selectedWireDrop) {
      setWireDropFormData(selectedWireDrop);
    } else {
      setWireDropFormData({
        id: '',
        uid: '',
        name: '',
        location: '',
        type: 'CAT6',
        prewirePhoto: null,
        installedPhoto: null
      });
    }
  }, [selectedWireDrop]);

  useEffect(() => {
    if (selectedProject && currentView === 'projectForm') {
      setProjectFormData(selectedProject);
    } else if (!selectedProject && currentView === 'projectForm') {
      setProjectFormData({
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
      });
    }
  }, [selectedProject, currentView]);
  
  // Time tracking state
  const [timeLogs, setTimeLogs] = useState([]);
  const [activeCheckIns, setActiveCheckIns] = useState({});
  
  // Projects state with wire drops
  const [projects, setProjects] = useState([
    {
      id: '1',
      name: 'Smith Residence',
      client: 'John Smith',
      address: '123 Main St, Austin, TX',
      phase: 'Install',
      startDate: '2025-01-15',
      endDate: '2025-02-28',
      team: ['John Tech', 'Mike Engineer'],
      assignedTechnician: 'Current User', // For filtering
      // Three separate OneDrive links
      oneDrivePhotos: 'https://onedrive.live.com/smith-residence/photos',
      oneDriveFiles: 'https://onedrive.live.com/smith-residence/files',
      oneDriveProcurement: 'https://onedrive.live.com/smith-residence/procurement',
      // New required fields for PM
      wiringDiagramUrl: 'https://lucid.app/lucidchart/f0e89b19-d72d-4ab1-8cb9-2712dbca4bc1/edit?invitationId=inv_e5d63790-ba70-4d38-981a-a706a7c2ed13',
      portalProposalUrl: 'https://portal.company.com/proposals/smith-residence-2025',
      wireDrops: [
        { id: 'W001', uid: 'SM-LR-001', name: 'Living Room TV', location: 'Living Room - North Wall', type: 'CAT6', prewirePhoto: null, installedPhoto: null },
        { id: 'W002', uid: 'SM-MB-001', name: 'Master BR AP', location: 'Master Bedroom - Ceiling', type: 'CAT6', prewirePhoto: 'https://picsum.photos/400/300?random=1', installedPhoto: null },
        { id: 'W003', uid: 'SM-KT-001', name: 'Kitchen Display', location: 'Kitchen - Island', type: 'CAT6', prewirePhoto: 'https://picsum.photos/400/300?random=2', installedPhoto: 'https://picsum.photos/400/300?random=3' },
        { id: 'W004', uid: 'SM-OF-001', name: 'Office Desk', location: 'Home Office', type: 'CAT6', prewirePhoto: null, installedPhoto: null },
        { id: 'W005', uid: 'SM-GR-001', name: 'Garage Camera', location: 'Garage', type: 'CAT6', prewirePhoto: 'https://picsum.photos/400/300?random=4', installedPhoto: null }
      ],
      issues: [],
      files: [],
      photos: [],
      stakeholders: ['john.smith@email.com', 'sarah.pm@company.com']
    },
    {
      id: '2',
      name: 'Office Complex',
      client: 'ABC Corp',
      address: '456 Business Ave, Austin, TX',
      phase: 'Planning',
      startDate: '2025-02-01',
      endDate: '2025-03-15',
      team: ['Jane Tech', 'Bob Engineer'],
      assignedTechnician: 'Jane Tech',
      oneDrivePhotos: 'https://onedrive.live.com/office-complex/photos',
      oneDriveFiles: 'https://onedrive.live.com/office-complex/files',
      oneDriveProcurement: 'https://onedrive.live.com/office-complex/procurement',
      wiringDiagramUrl: 'https://lucid.app/lucidchart/office-complex-diagram',
      portalProposalUrl: 'https://portal.company.com/proposals/office-complex-2025',
      wireDrops: [
        { id: 'O001', uid: 'OC-LB-001', name: 'Lobby Camera', location: 'Main Lobby', type: 'CAT6', prewirePhoto: null, installedPhoto: null },
        { id: 'O002', uid: 'OC-CR-001', name: 'Conference Room AP', location: 'Conference Room A', type: 'CAT6', prewirePhoto: null, installedPhoto: null }
      ],
      issues: [],
      files: [],
      photos: [],
      stakeholders: ['contact@abccorp.com', 'sarah.pm@company.com']
    }
  ]);

  // Issues state
  const [issues, setIssues] = useState([
    { id: 'I001', projectId: '1', title: 'Wall blocking at entry', status: 'blocked', date: '2025-01-20', notes: 'Need to reroute through ceiling', photos: [] },
    { id: 'I002', projectId: '1', title: 'Missing CAT6 spool', status: 'open', date: '2025-01-19', notes: 'Order placed, arriving tomorrow', photos: [] },
    { id: 'I003', projectId: '1', title: 'Conduit too small', status: 'resolved', date: '2025-01-17', notes: 'Replaced with 1.5" conduit', photos: [] }
  ]);

  // Contacts/People state
  const [contacts, setContacts] = useState([
    { id: 'C001', name: 'John Smith', role: 'Client', email: 'john.smith@email.com', phone: '512-555-0100', company: 'Residence' },
    { id: 'C002', name: 'Sarah Johnson', role: 'Project Manager', email: 'sarah.pm@company.com', phone: '512-555-0101', company: 'Intelligent Systems' },
    { id: 'C003', name: 'Mike Engineer', role: 'Lead Technician', email: 'mike@company.com', phone: '512-555-0102', company: 'Intelligent Systems' }
  ]);

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
    if (userRole === 'pm') return projects;
    if (viewMyProjects) {
      return projects.filter(p => p.assignedTechnician === 'Current User');
    }
    return projects;
  };

  // Theme
  const theme = {
    dark: {
      bg: 'bg-black',
      bgSecondary: 'bg-gray-900',
      surface: 'bg-gray-900',
      surfaceHover: 'bg-gray-800',
      border: 'border-gray-800',
      text: 'text-white',
      textSecondary: 'text-gray-400',
      textTertiary: 'text-gray-500',
      accent: 'bg-blue-500',
      accentText: 'text-blue-500',
      success: 'bg-green-600',
      warning: 'bg-orange-600',
      danger: 'bg-red-600'
    },
    light: {
      bg: 'bg-gray-50',
      bgSecondary: 'bg-white',
      surface: 'bg-white',
      surfaceHover: 'bg-gray-50',
      border: 'border-gray-200',
      text: 'text-gray-900',
      textSecondary: 'text-gray-600',
      textTertiary: 'text-gray-400',
      accent: 'bg-blue-500',
      accentText: 'text-blue-500',
      success: 'bg-green-500',
      warning: 'bg-orange-500',
      danger: 'bg-red-500'
    }
  };

  const t = darkMode ? theme.dark : theme.light;

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
        callback(url);
      }
    };
    input.click();
  };

  // Open links in new window
  const openLink = (url) => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      alert('No URL configured');
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Fullscreen Image Modal
  const FullscreenImageModal = () => {
    if (!fullscreenImage) return null;
    
    return (
      <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
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
    const handleSave = () => {
      if (!wireDropFormData.name || !wireDropFormData.location || !wireDropFormData.uid) {
        alert('Please fill in all required fields');
        return;
      }

      setProjects(prev => prev.map(p => {
        if (p.id === selectedProject.id) {
          if (selectedWireDrop) {
            // Edit existing
            return {
              ...p,
              wireDrops: p.wireDrops.map(w => w.id === selectedWireDrop.id ? wireDropFormData : w)
            };
          } else {
            // Add new
            const newDrop = { ...wireDropFormData, id: 'W' + Date.now() };
            return {
              ...p,
              wireDrops: [...(p.wireDrops || []), newDrop]
            };
          }
        }
        return p;
      }));

      alert(selectedWireDrop ? 'Wire drop updated!' : 'Wire drop added!');
      setCurrentView('wireDropList');
      setSelectedWireDrop(null);
    };

    return (
      <div className={`min-h-screen ${t.bg}`}>
        {/* Header */}
        <div className={`${t.bgSecondary} border-b ${t.border} px-4 py-3`}>
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentView('wireDropList')} className={`p-2 ${t.text}`}>
              <ArrowLeft size={24} />
            </button>
            <h1 className={`text-lg font-semibold ${t.text}`}>Project Details</h1>
            <button onClick={handleSave} className={`p-2 ${t.accentText}`}>
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
                onClick={() => {
                  // Import wire drops functionality would go here
                  alert('Wire drops import functionality would be implemented here');
                }}
                className={`py-2 rounded-lg ${t.surfaceHover} ${t.text} text-sm`}
              >
                <Upload size={16} className="inline mr-2" />
                Import CSV
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
  const ProjectDetailView = () => (
    <div className={`min-h-screen ${t.bg}`}>
      {/* Header */}
      <div className={`${t.bgSecondary} border-b ${t.border} px-4 py-3`}>
        <div className="flex items-center justify-between">
          <button onClick={() => setCurrentView('dashboard')} className={`px-4 py-2 rounded-lg border ${t.border} ${t.text} font-medium flex items-center gap-2`}>
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
            <div className={`rounded-xl overflow-hidden ${t.surface} border ${t.border}`}>
              <div className="relative h-14">
                <div 
                  className={`absolute inset-0 ${
                    calculateProjectProgress(selectedProject) > 70 ? t.success : 
                    calculateProjectProgress(selectedProject) > 40 ? t.warning : 
                    t.danger
                  } opacity-90`}
                  style={{ width: `${calculateProjectProgress(selectedProject)}%` }}
                />
                <div className={`absolute inset-0 flex items-center justify-center font-semibold ${t.text}`}>
                  {selectedProject.name} - {calculateProjectProgress(selectedProject)}%
                </div>
              </div>
            </div>
          </div>

          {/* Sections */}
          <div className="px-4 pb-20">
            {/* Wiring Diagram */}
            <button
              onClick={() => openLink(selectedProject.wiringDiagramUrl)}
              className={`w-full mb-2 p-4 rounded-xl ${t.surface} border ${t.border} flex items-center justify-between`}
            >
              <div className="flex items-center gap-3">
                <FileText size={20} className={t.textSecondary} />
                <span className={`font-medium ${t.text}`}>Wiring Diagram</span>
              </div>
              <ExternalLink size={20} className={t.textSecondary} />
            </button>

            {/* Portal Proposal */}
            <button
              onClick={() => openLink(selectedProject.portalProposalUrl)}
              className={`w-full mb-2 p-4 rounded-xl ${t.surface} border ${t.border} flex items-center justify-between`}
            >
              <div className="flex items-center gap-3">
                <FileText size={20} className={t.textSecondary} />
                <span className={`font-medium ${t.text}`}>Portal Proposal</span>
              </div>
              <ExternalLink size={20} className={t.textSecondary} />
            </button>

            {/* Wire Drops */}
            <button
              onClick={() => setCurrentView('wireDropList')}
              className={`w-full mb-2 p-4 rounded-xl ${t.surface} border ${t.border} flex items-center justify-between`}
            >
              <div className="flex items-center gap-3">
                <Zap size={20} className={t.textSecondary} />
                <span className={`font-medium ${t.text}`}>Wire Drops</span>
                <span className={`px-2 py-1 rounded-full text-xs ${t.accent} text-white`}>
                  {selectedProject.wireDrops?.length || 0}
                </span>
              </div>
              <ChevronRight size={20} className={t.textSecondary} />
            </button>

            {/* Issues */}
            <button
              onClick={() => toggleSection('issues')}
              className={`w-full mb-2 p-4 rounded-xl ${t.surface} border ${t.border} flex items-center justify-between`}
            >
              <div className="flex items-center gap-3">
                <AlertCircle size={20} className={t.textSecondary} />
                <span className={`font-medium ${t.text}`}>Issues</span>
                {issues.filter(i => i.projectId === selectedProject.id && i.status !== 'resolved').length > 0 && (
                  <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                    {issues.filter(i => i.projectId === selectedProject.id && i.status !== 'resolved').length}
                  </span>
                )}
              </div>
              <ChevronRight size={20} className={`${t.textSecondary} transition-transform ${expandedSections.issues ? 'rotate-90' : ''}`} />
            </button>
            
            {expandedSections.issues && (
              <div className={`mb-2 p-4 rounded-xl ${t.surface} border ${t.border}`}>
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
                    className={`p-1 ${t.accentText}`}
                  >
                    <Plus size={20} />
                  </button>
                </div>
                
                {issues
                  .filter(i => i.projectId === selectedProject.id)
                  .filter(i => showResolvedIssues || i.status !== 'resolved')
                  .map(issue => (
                    <button
                      key={issue.id}
                      onClick={() => {
                        setSelectedIssue(issue);
                        setCurrentView('issueDetail');
                      }}
                      className={`w-full p-3 mb-2 rounded-lg ${t.surfaceHover} text-left`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className={`font-medium ${t.text}`}>{issue.title}</p>
                          <p className={`text-xs ${t.textSecondary} mt-1`}>{issue.date}</p>
                        </div>
                        <span className={`px-2 py-1 rounded text-xs text-white ${
                          issue.status === 'blocked' ? t.danger :
                          issue.status === 'open' ? t.warning :
                          t.success
                        }`}>
                          {issue.status}
                        </span>
                      </div>
                    </button>
                  ))
                }
              </div>
            )}

            {/* Files */}
            <div className="grid grid-cols-3 gap-2 mb-2">
              <button
                onClick={() => openLink(selectedProject.oneDrivePhotos)}
                className={`p-4 rounded-xl ${t.surface} border ${t.border} flex flex-col items-center`}
              >
                <Image size={20} className={`${t.textSecondary} mb-1`} />
                <span className={`text-xs ${t.text}`}>Photos</span>
              </button>
              <button
                onClick={() => openLink(selectedProject.oneDriveFiles)}
                className={`p-4 rounded-xl ${t.surface} border ${t.border} flex flex-col items-center`}
              >
                <Folder size={20} className={`${t.textSecondary} mb-1`} />
                <span className={`text-xs ${t.text}`}>Files</span>
              </button>
              <button
                onClick={() => openLink(selectedProject.oneDriveProcurement)}
                className={`p-4 rounded-xl ${t.surface} border ${t.border} flex flex-col items-center`}
              >
                <Package size={20} className={`${t.textSecondary} mb-1`} />
                <span className={`text-xs ${t.text}`}>Procurement</span>
              </button>
            </div>

            {/* People */}
            <button
              onClick={() => setCurrentView('people')}
              className={`w-full mb-2 p-4 rounded-xl ${t.surface} border ${t.border} flex items-center justify-between`}
            >
              <div className="flex items-center gap-3">
                <Users size={20} className={t.textSecondary} />
                <span className={`font-medium ${t.text}`}>Team & Contacts</span>
              </div>
              <ChevronRight size={20} className={t.textSecondary} />
            </button>
          </div>

          {/* Bottom Actions */}
          <div className={`fixed bottom-0 left-0 right-0 p-4 grid grid-cols-2 gap-2 border-t ${t.border} ${t.bgSecondary}`}>
            <button 
              onClick={() => {
                const query = prompt('Search for:');
                if (query) {
                  setSearchQuery(query);
                  setCurrentView('wireDropList');
                }
              }}
              className={`py-3 rounded-lg ${t.surfaceHover} ${t.text} font-medium`}
            >
              Search
            </button>
            <button 
              onClick={() => setCurrentView('issueForm')}
              className={`py-3 rounded-lg ${t.surfaceHover} ${t.text} font-medium`}
            >
              New Issue
            </button>
          </div>
        </>
      )}
    </div>
  );

  // Issue Form State - moved outside
  const [newIssue, setNewIssue] = useState({
    title: '',
    status: 'open',
    notes: '',
    photos: []
  });

  // Issue Form (simplified)
  const IssueForm = () => {
    const saveIssue = () => {
      if (!newIssue.title.trim()) {
        alert('Please enter an issue title');
        return;
      }

      const issue = {
        id: 'I' + Date.now(),
        projectId: selectedProject.id,
        date: new Date().toLocaleDateString(),
        ...newIssue
      };
      setIssues(prev => [...prev, issue]);
      alert('Issue created!');
      setNewIssue({ title: '', status: 'open', notes: '', photos: [] }); // Reset form
      setCurrentView('project');
    };

    return (
      <div className={`min-h-screen ${t.bg}`}>
        {/* Header */}
        <div className={`${t.bgSecondary} border-b ${t.border} px-4 py-3`}>
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentView('project')} className={`p-2 ${t.text}`}>
              <ArrowLeft size={24} />
            </button>
            <h1 className={`text-lg font-semibold ${t.text}`}>Log Issue</h1>
            <button onClick={saveIssue} className={`p-2 ${t.accentText}`}>
              <Save size={20} />
            </button>
          </div>
        </div>

        <div className="p-4">
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
              onClick={() => handlePhotoCapture((url) => {
                setNewIssue({...newIssue, photos: [...newIssue.photos, url]});
              })}
              className={`py-8 rounded-lg ${t.surface} ${t.text}`}
            >
              <Camera size={32} className="mx-auto" />
            </button>
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
                    src={photo} 
                    alt={`New issue ${idx + 1}`} 
                    className="w-full h-24 object-cover rounded-lg cursor-pointer" 
                    onClick={() => setFullscreenImage(photo)}
                  />
                  <button 
                    onClick={() => setFullscreenImage(photo)}
                    className="absolute top-1 left-1 p-1 bg-black/50 rounded-full text-white"
                  >
                    <Maximize size={12} />
                  </button>
                  <button 
                    onClick={() => {
                      setNewIssue({
                        ...newIssue, 
                        photos: newIssue.photos.filter((_, i) => i !== idx)
                      });
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
  const QRScanner = () => (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className={`${t.surface} rounded-2xl p-6 max-w-sm w-full`}>
        <h2 className={`text-xl font-semibold ${t.text} mb-4`}>Scan QR Code</h2>
        <div className={`h-64 ${t.surfaceHover} rounded-xl flex items-center justify-center mb-4`}>
          <QrCode size={80} className={t.textSecondary} />
        </div>
        <p className={`text-center ${t.textSecondary} mb-4`}>Position QR code within frame</p>
        <button 
          onClick={() => setShowScanner(false)}
          className={`w-full py-3 rounded-lg ${t.accent} text-white font-medium`}
        >
          Close Scanner
        </button>
      </div>
    </div>
  );

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
        </>
      )}
      {showScanner && <QRScanner />}
      <FullscreenImageModal />
    </>
  );
};

export default App;