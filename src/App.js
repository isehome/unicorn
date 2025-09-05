import React, { useState, useRef, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { 
  Camera, ArrowLeft, Calendar, FileText, Users, Plus,
  Moon, Sun, Upload,
  Zap, AlertCircle, QrCode,
  Folder, Image, X, ChevronRight, Edit2,
  Search, Eye, EyeOff,
  Package, Mail, Phone, UserPlus, FolderOpen,
  BarChart, Send, Save, ExternalLink, Maximize
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
  const [expandedSections, setExpandedSections] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMyProjects, setViewMyProjects] = useState(true);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  // Supabase test state (non-invasive)
  const [showTest, setShowTest] = useState(false);
  const [testTable, setTestTable] = useState(process.env.REACT_APP_SUPABASE_TABLE || '');
  const [testData, setTestData] = useState(null);
  const [testError, setTestError] = useState('');
  const [testBusy, setTestBusy] = useState(false);
  
  // Time tracking state
  const [, setTimeLogs] = useState([]);
  const [activeCheckIns, setActiveCheckIns] = useState({});
  
  // Projects state (now loaded from Supabase)
  const [projects, setProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState('');
  // Wire types lookup
  const [wireTypes, setWireTypes] = useState([]);
  const [wireTypesLoading, setWireTypesLoading] = useState(false);

  // Map DB row (snake_case) to UI shape (camelCase)
  const mapProject = (row) => ({
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
    wireDrops: [] // loaded later per project
  });

  const loadProjects = async () => {
    try {
      setProjectsLoading(true);
      setProjectsError('');
      if (!supabase) {
        setProjectsError('Supabase not configured.');
        return;
      }
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        setProjectsError(error.message);
        return;
      }
      setProjects((data || []).map(mapProject));
    } catch (e) {
      setProjectsError(e.message);
    } finally {
      setProjectsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
    // eslint-disable-next-line
  }, []);

  const loadWireTypes = async () => {
    try {
      setWireTypesLoading(true);
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
    } finally {
      setWireTypesLoading(false);
    }
  };

  useEffect(() => { loadWireTypes(); }, []);

  // Issues state (now loaded from Supabase)
  const [issues, setIssues] = useState([]);

  // Contacts/People state
  const [contacts] = useState([
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
    // For now, show all projects (assignment optional)
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
    const [formData, setFormData] = useState(
      selectedWireDrop || {
        id: '',
        uid: '',
        name: '',
        location: '',
        type: 'CAT6',
        prewirePhoto: null,
        installedPhoto: null
      }
    );

    const [saveError, setSaveError] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
      if (!formData.name || !formData.location || !formData.uid) {
        alert('Please fill in all required fields');
        return;
      }

      if (!supabase) { setSaveError('Supabase not configured'); return; }
      try {
        setSaving(true);
        setSaveError('');
        const payload = {
          project_id: selectedProject.id,
          uid: formData.uid,
          name: formData.name,
          location: formData.location,
          type: formData.type,
          prewire_photo: formData.prewirePhoto,
          installed_photo: formData.installedPhoto,
        };

        if (selectedWireDrop?.id) {
          const { error } = await supabase
            .from('wire_drops')
            .update(payload)
            .eq('id', selectedWireDrop.id);
          if (error) { setSaveError(error.message); return; }
          alert('Wire drop updated!');
        } else {
          const { error } = await supabase
            .from('wire_drops')
            .insert([payload]);
          if (error) { setSaveError(error.message); return; }
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
      <div className={`min-h-screen ${t.bg}`}>
        {/* Header */}
        <div className={`${t.bgSecondary} border-b ${t.border} px-4 py-3`}>
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentView('wireDropList')} className={`p-2 ${t.text}`}>
              <ArrowLeft size={24} />
            </button>
            <h1 className={`text-lg font-semibold ${t.text}`}>
              {selectedWireDrop ? 'Edit Wire Drop' : 'Add Wire Drop'}
            </h1>
            <button onClick={handleSave} disabled={saving} className={`p-2 ${t.accentText}`}>
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
            className={`w-full px-3 py-3 rounded-lg ${t.surface} ${t.text} border ${t.border}`}
            placeholder="Wire Drop Name *"
          />
          
          <input
            type="text"
            value={formData.uid}
            onChange={(e) => setFormData({...formData, uid: e.target.value})}
            className={`w-full px-3 py-3 rounded-lg ${t.surface} ${t.text} border ${t.border}`}
            placeholder="UID *"
          />
          
          <input
            type="text"
            value={formData.location}
            onChange={(e) => setFormData({...formData, location: e.target.value})}
            className={`w-full px-3 py-3 rounded-lg ${t.surface} ${t.text} border ${t.border}`}
            placeholder="Location *"
          />
          
          <select
            value={formData.type}
            onChange={(e) => setFormData({...formData, type: e.target.value})}
            className={`w-full px-3 py-3 rounded-lg ${t.surface} ${t.text} border ${t.border}`}
          >
            {(wireTypes.length ? wireTypes : ['CAT6','CAT6A','Fiber','Coax','Power']).map(opt => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
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
      <div className={`min-h-screen ${t.bg}`}>
        {/* Header */}
        <div className={`${t.bgSecondary} border-b ${t.border} px-4 py-3`}>
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentView('pmDashboard')} className={`p-2 ${t.text}`}>
              <ArrowLeft size={24} />
            </button>
            <h1 className={`text-lg font-semibold ${t.text}`}>
              {selectedProject ? 'Edit Project' : 'New Project'}
            </h1>
            <button onClick={handleSave} disabled={saving} className={`p-2 ${t.accentText}`}>
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
            className={`w-full px-3 py-3 rounded-lg ${t.surface} ${t.text} border ${t.border}`}
            placeholder="Project Name *"
          />
          
          <input
            type="text"
            value={formData.client}
            onChange={(e) => setFormData({...formData, client: e.target.value})}
            className={`w-full px-3 py-3 rounded-lg ${t.surface} ${t.text} border ${t.border}`}
            placeholder="Client"
          />
          
          <input
            type="text"
            value={formData.address}
            onChange={(e) => setFormData({...formData, address: e.target.value})}
            className={`w-full px-3 py-3 rounded-lg ${t.surface} ${t.text} border ${t.border}`}
            placeholder="Address"
          />

          <div className={`p-4 rounded-xl ${t.surface} border ${t.border}`}>
            <h3 className={`font-medium ${t.text} mb-3`}>Required Links</h3>
            <input
              type="url"
              value={formData.wiringDiagramUrl}
              onChange={(e) => setFormData({...formData, wiringDiagramUrl: e.target.value})}
              className={`w-full px-3 py-3 rounded-lg ${t.surfaceHover} ${t.text} border ${t.border} mb-3`}
              placeholder="Wiring Diagram URL (Lucid Chart) *"
            />
            <input
              type="url"
              value={formData.portalProposalUrl}
              onChange={(e) => setFormData({...formData, portalProposalUrl: e.target.value})}
              className={`w-full px-3 py-3 rounded-lg ${t.surfaceHover} ${t.text} border ${t.border}`}
              placeholder="Portal Proposal URL *"
            />
          </div>

          <div className={`p-4 rounded-xl ${t.surface} border ${t.border}`}>
            <h3 className={`font-medium ${t.text} mb-3`}>OneDrive Links</h3>
            <input
              type="url"
              value={formData.oneDrivePhotos}
              onChange={(e) => setFormData({...formData, oneDrivePhotos: e.target.value})}
              className={`w-full px-3 py-3 rounded-lg ${t.surfaceHover} ${t.text} border ${t.border} mb-3`}
              placeholder="OneDrive Photos Folder URL"
            />
            <input
              type="url"
              value={formData.oneDriveFiles}
              onChange={(e) => setFormData({...formData, oneDriveFiles: e.target.value})}
              className={`w-full px-3 py-3 rounded-lg ${t.surfaceHover} ${t.text} border ${t.border} mb-3`}
              placeholder="OneDrive Files Folder URL"
            />
            <input
              type="url"
              value={formData.oneDriveProcurement}
              onChange={(e) => setFormData({...formData, oneDriveProcurement: e.target.value})}
              className={`w-full px-3 py-3 rounded-lg ${t.surfaceHover} ${t.text} border ${t.border}`}
              placeholder="OneDrive Procurement Folder URL"
            />
          </div>
        </div>
      </div>
    );
  };

  // Technician Dashboard
  const TechnicianDashboard = () => (
    <div className={`min-h-screen ${t.bg}`}>
      {/* Header */}
      <div className={`${t.bgSecondary} border-b ${t.border} px-4 py-3`}>
        <div className="flex items-center justify-between mb-3">
          <h1 className={`text-lg font-semibold ${t.text}`}>Technician Dashboard</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setUserRole('pm')} className={`p-2 ${t.accentText} text-sm`}>
              Switch to PM
            </button>
            <button onClick={() => setDarkMode(!darkMode)} className={`p-2 ${t.text}`}>
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => setViewMyProjects(true)}
            className={`px-4 py-2 rounded-lg border ${t.border} ${viewMyProjects ? `${t.accent} text-white` : t.text} font-medium`}
          >
            My Projects
          </button>
          <button 
            onClick={() => setViewMyProjects(false)}
            className={`px-4 py-2 rounded-lg border ${t.border} ${!viewMyProjects ? `${t.accent} text-white` : t.text} font-medium`}
          >
            All Projects
          </button>
        </div>
      </div>

      {/* Calendar Widget */}
      <div className={`m-4 p-4 rounded-xl ${t.surface} border ${t.border}`}>
        <div className="flex items-center justify-between mb-3">
          <h2 className={`font-medium ${t.text}`}>Today's Schedule</h2>
          <Calendar size={18} className={t.textSecondary} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${t.success}`}></div>
            <span className={`text-sm ${t.text}`}>9:00 AM - Smith Residence</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${t.warning}`}></div>
            <span className={`text-sm ${t.text}`}>2:00 PM - Office Complex QC</span>
          </div>
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
            <div key={project.id} className={`mb-3 rounded-xl ${t.surface} border ${t.border} overflow-hidden`}>
              {/* Progress Bar */}
              <div className="relative h-14">
                <div 
                  className={`absolute inset-0 ${
                    progress > 70 ? t.success : 
                    progress > 40 ? t.warning : 
                    t.danger
                  } opacity-90`}
                  style={{ width: `${progress}%` }}
                ></div>
                <div className={`absolute inset-0 flex items-center justify-center font-semibold ${t.text}`}>
                  {project.name} - {progress}%
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="p-3 grid grid-cols-3 gap-2">
                <button 
                  onClick={() => {
                    setSelectedProject(project);
                    setCurrentView('project');
                  }}
                  className={`py-3 rounded-lg ${t.surfaceHover} ${t.text} font-medium`}
                >
                  OPEN
                </button>
                <button 
                  onClick={() => handleCheckIn(project.id)}
                  disabled={isCheckedIn}
                  className={`py-3 rounded-lg ${isCheckedIn ? 'bg-green-700' : t.surfaceHover} ${t.text} font-medium`}
                >
                  {isCheckedIn ? '✓ Checked In' : 'Check In'}
                </button>
                <button 
                  onClick={() => handleCheckOut(project.id)}
                  disabled={!isCheckedIn}
                  className={`py-3 rounded-lg ${!isCheckedIn ? 'opacity-50' : t.surfaceHover} ${t.text} font-medium`}
                >
                  Check Out
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Navigation */}
      <div className={`fixed bottom-0 left-0 right-0 p-4 grid grid-cols-3 gap-2 border-t ${t.border} ${t.bgSecondary}`}>
        <button 
          onClick={() => setCurrentView('people')}
          className={`py-4 rounded-lg ${t.surfaceHover} ${t.text} font-medium`}
        >
          <Users size={20} className="mx-auto mb-1" />
          People
        </button>
        <button 
          onClick={() => {
            if (getFilteredProjects().length > 0) {
              setSelectedProject(getFilteredProjects()[0]);
              setCurrentView('wireDropList');
            }
          }}
          className={`py-4 rounded-lg ${t.surfaceHover} ${t.text} font-medium`}
        >
          <Zap size={20} className="mx-auto mb-1" />
          Wire Drops
        </button>
        <button 
          onClick={() => setShowScanner(true)}
          className={`py-4 rounded-lg ${t.surfaceHover} ${t.text} font-medium`}
        >
          <QrCode size={20} className="mx-auto mb-1" />
          Scan Tag
        </button>
      </div>
    </div>
  );

  // Wire Drop List View (searchable)
  const WireDropListView = () => {
    const filteredDrops = selectedProject?.wireDrops.filter(drop => 
      drop.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      drop.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      drop.uid.toLowerCase().includes(searchQuery.toLowerCase()) ||
      drop.type.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

    return (
      <div className={`min-h-screen ${t.bg}`}>
        {/* Header */}
        <div className={`${t.bgSecondary} border-b ${t.border} px-4 py-3`}>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setCurrentView(userRole === 'pm' ? 'pmProjectDetail' : 'project')} className={`p-2 ${t.text}`}>
              <ArrowLeft size={24} />
            </button>
            <h1 className={`text-lg font-semibold ${t.text}`}>Wire Drops</h1>
            <button 
              onClick={() => {
                setSelectedWireDrop(null);
                setCurrentView('wireDropForm');
              }}
              className={`p-2 ${t.text}`}
            >
              <Plus size={24} />
            </button>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search size={20} className={`absolute left-3 top-3 ${t.textSecondary}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, location, UID, or type..."
              className={`w-full pl-10 pr-4 py-3 rounded-lg ${t.surface} ${t.text} border ${t.border}`}
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
                className={`w-full mb-3 p-4 rounded-xl ${t.surface} border ${t.border} text-left`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className={`font-medium ${t.text}`}>{drop.name}</p>
                    <p className={`text-xs ${t.textSecondary}`}>UID: {drop.uid}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedWireDrop(drop);
                        setCurrentView('wireDropForm');
                      }}
                      className={`p-1 ${t.surfaceHover} rounded`}
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
    if (!selectedWireDrop) return null;

    const handlePrewirePhoto = () => {
      handlePhotoCapture((url) => {
        const updatedProjects = projects.map(p => {
          if (p.id === selectedProject.id) {
            return {
              ...p,
              wireDrops: p.wireDrops.map(d => 
                d.id === selectedWireDrop.id ? { ...d, prewirePhoto: url } : d
              )
            };
          }
          return p;
        });
        setProjects(updatedProjects);
        setSelectedWireDrop({ ...selectedWireDrop, prewirePhoto: url });
      });
    };

    const handleInstalledPhoto = () => {
      handlePhotoCapture((url) => {
        const updatedProjects = projects.map(p => {
          if (p.id === selectedProject.id) {
            return {
              ...p,
              wireDrops: p.wireDrops.map(d => 
                d.id === selectedWireDrop.id ? { ...d, installedPhoto: url } : d
              )
            };
          }
          return p;
        });
        setProjects(updatedProjects);
        setSelectedWireDrop({ ...selectedWireDrop, installedPhoto: url });
      });
    };

    return (
      <div className={`min-h-screen ${t.bg}`}>
        {/* Header */}
        <div className={`${t.bgSecondary} border-b ${t.border} px-4 py-3`}>
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentView('wireDropList')} className={`p-2 ${t.text}`}>
              <ArrowLeft size={24} />
            </button>
            <h1 className={`text-lg font-semibold ${t.text}`}>Wire Drop Detail</h1>
            <button 
              onClick={() => {
                setCurrentView('wireDropForm');
              }}
              className={`p-2 ${t.text}`}
            >
              <Edit2 size={20} />
            </button>
          </div>
        </div>

        <div className="p-4">
          {/* Wire Info */}
          <div className={`mb-4 p-4 rounded-xl ${t.surface} border ${t.border}`}>
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
            <div className="flex justify-center">
              <div className="w-32 h-32 bg-white rounded-lg flex items-center justify-center">
                <QrCode size={60} className="text-gray-800" />
              </div>
            </div>
          </div>

          {/* Status Cards */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className={`p-4 rounded-xl ${selectedWireDrop.prewirePhoto ? 'bg-yellow-600' : t.surface} border ${t.border}`}>
              <h3 className={`font-medium mb-2 ${selectedWireDrop.prewirePhoto ? 'text-white' : t.text}`}>
                Prewire {selectedWireDrop.prewirePhoto && '✓'}
              </h3>
              {selectedWireDrop.prewirePhoto ? (
                <div className="relative">
                  <img 
                    src={selectedWireDrop.prewirePhoto} 
                    alt="Prewire" 
                    className="w-full h-24 object-cover rounded-lg mb-2 cursor-pointer" 
                    onClick={() => setFullscreenImage(selectedWireDrop.prewirePhoto)}
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
                  className={`w-full h-24 rounded-lg ${t.surfaceHover} flex items-center justify-center`}
                >
                  <Camera size={24} className={t.textTertiary} />
                </button>
              )}
              <p className={`text-xs ${selectedWireDrop.prewirePhoto ? 'text-white' : t.textSecondary}`}>
                {selectedWireDrop.prewirePhoto ? 'Photo confirmed' : 'Add photo to confirm'}
              </p>
            </div>
            
            <div className={`p-4 rounded-xl ${selectedWireDrop.installedPhoto ? 'bg-green-600' : t.surface} border ${t.border}`}>
              <h3 className={`font-medium mb-2 ${selectedWireDrop.installedPhoto ? 'text-white' : t.text}`}>
                Installed {selectedWireDrop.installedPhoto && '✓'}
              </h3>
              {selectedWireDrop.installedPhoto ? (
                <div className="relative">
                  <img 
                    src={selectedWireDrop.installedPhoto} 
                    alt="Installed" 
                    className="w-full h-24 object-cover rounded-lg mb-2 cursor-pointer" 
                    onClick={() => setFullscreenImage(selectedWireDrop.installedPhoto)}
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
                  className={`w-full h-24 rounded-lg ${t.surfaceHover} flex items-center justify-center`}
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
    if (!selectedIssue) return null;

    const [editedIssue, setEditedIssue] = useState(selectedIssue);

    const saveIssue = () => {
      setIssues(prev => prev.map(i => i.id === editedIssue.id ? editedIssue : i));
      alert('Issue updated!');
      setCurrentView('project');
    };

    const markResolved = () => {
      const updated = { ...editedIssue, status: 'resolved' };
      setIssues(prev => prev.map(i => i.id === updated.id ? updated : i));
      alert('Issue marked as resolved!');
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
            <h1 className={`text-lg font-semibold ${t.text}`}>Issue Detail</h1>
            <button onClick={saveIssue} className={`p-2 ${t.accentText}`}>
              Save
            </button>
          </div>
        </div>

        <div className="p-4">
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
            <button 
              onClick={() => handlePhotoCapture((url) => {
                setEditedIssue({...editedIssue, photos: [...(editedIssue.photos || []), url]});
              })}
              className={`w-full py-3 rounded-lg ${t.surfaceHover} ${t.text} mb-3`}
            >
              <Camera size={20} className="inline mr-2" />
              Add Photo
            </button>
            {editedIssue.photos?.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {editedIssue.photos.map((photo, idx) => (
                  <div key={idx} className="relative">
                    <img 
                      src={photo} 
                      alt={`Issue ${idx + 1}`} 
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
                        setEditedIssue({
                          ...editedIssue, 
                          photos: editedIssue.photos.filter((_, i) => i !== idx)
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

          {/* Action Button */}
          <button
            onClick={markResolved}
            disabled={editedIssue.status === 'resolved'}
            className={`w-full py-3 rounded-lg ${editedIssue.status === 'resolved' ? 'bg-gray-600' : 'bg-green-600'} text-white font-medium`}
          >
            {editedIssue.status === 'resolved' ? 'Already Resolved' : 'Mark as Resolved'}
          </button>
        </div>
      </div>
    );
  };

  // People/Contacts View
  const PeopleView = () => (
    <div className={`min-h-screen ${t.bg}`}>
      {/* Header */}
      <div className={`${t.bgSecondary} border-b ${t.border} px-4 py-3`}>
        <div className="flex items-center justify-between">
          <button onClick={() => setCurrentView('dashboard')} className={`p-2 ${t.text}`}>
            <ArrowLeft size={24} />
          </button>
          <h1 className={`text-lg font-semibold ${t.text}`}>People</h1>
          <button className={`p-2 ${t.text}`}>
            <UserPlus size={20} />
          </button>
        </div>
      </div>

      <div className="p-4">
        {contacts.map(contact => (
          <div key={contact.id} className={`mb-3 p-4 rounded-xl ${t.surface} border ${t.border}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`font-medium ${t.text}`}>{contact.name}</p>
                <p className={`text-sm ${t.accentText}`}>{contact.role}</p>
                <p className={`text-xs ${t.textSecondary} mt-1`}>{contact.company}</p>
              </div>
              <div className="text-right">
                <a 
                  href={`mailto:${contact.email}`} 
                  className={`text-xs ${t.textSecondary} block hover:${t.accentText}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Mail size={14} className="inline mr-1" />
                  {contact.email}
                </a>
                <a 
                  href={`tel:${contact.phone}`} 
                  className={`text-xs ${t.textSecondary} block mt-1 hover:${t.accentText}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Phone size={14} className="inline mr-1" />
                  {contact.phone}
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // PM Dashboard
  const PMDashboard = () => (
    <div className={`min-h-screen ${t.bg}`}>
      {/* Header */}
      <div className={`${t.bgSecondary} border-b ${t.border} px-4 py-3`}>
        <div className="flex items-center justify-between">
          <h1 className={`text-lg font-semibold ${t.text}`}>Project Manager Dashboard</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setUserRole('technician')} className={`p-2 ${t.accentText} text-sm`}>
              Switch to Tech
            </button>
            <button onClick={() => setDarkMode(!darkMode)} className={`p-2 ${t.text}`}>
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
            className={`p-2 ${t.accentText}`}
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
    if (!selectedProject) return null;

    const [editableProject, setEditableProject] = useState(selectedProject);

    const handleSave = () => {
      setProjects(prev => prev.map(p => p.id === editableProject.id ? editableProject : p));
      alert('Project updated!');
      setCurrentView('pmDashboard');
    };

    const sendWeeklyReport = () => {
      alert(`Weekly report sent to: ${editableProject.stakeholders?.join(', ')}`);
    };

    return (
      <div className={`min-h-screen ${t.bg}`}>
        {/* Header */}
        <div className={`${t.bgSecondary} border-b ${t.border} px-4 py-3`}>
          <div className="flex items-center justify-between">
            <button onClick={() => setCurrentView('pmDashboard')} className={`p-2 ${t.text}`}>
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

  // Issue Form (simplified)
  const IssueForm = () => {
    const [newIssue, setNewIssue] = useState({
      title: '',
      status: 'open',
      notes: '',
      photos: []
    });

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

  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Test read from Supabase (uses env table or input)
  const runSupabaseTest = async () => {
    try {
      setTestBusy(true)
      setTestError('')
      setTestData(null)
      if (!supabase) {
        setTestError('Supabase env vars missing. Add REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY to .env and restart dev server.')
        return
      }
      const table = (testTable || '').trim()
      if (!table) {
        setTestError('Enter a table name to query')
        return
      }
      const { data, error } = await supabase.from(table).select('*').limit(5)
      if (error) {
        setTestError(error.message)
        return
      }
      setTestData(data)
    } catch (e) {
      setTestError(e.message)
    } finally {
      setTestBusy(false)
    }
  }

  // Load wire drops for a project when viewing it
  const loadWireDrops = async (projectId) => {
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
        uid: row.uid,
        name: row.name,
        location: row.location,
        type: row.type || 'CAT6',
        prewirePhoto: row.prewire_photo,
        installedPhoto: row.installed_photo,
      }));
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, wireDrops: drops } : p));
      setSelectedProject(prev => prev && prev.id === projectId ? { ...prev, wireDrops: drops } : prev);
    } catch (_) {}
  };

  useEffect(() => {
    if (currentView === 'project' && selectedProject && (!selectedProject.wireDrops || selectedProject.wireDrops.length === 0)) {
      loadWireDrops(selectedProject.id);
    }
    // eslint-disable-next-line
  }, [currentView, selectedProject?.id]);

  // Load issues for a project when viewing it (with photos)
  const loadIssues = async (projectId) => {
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
        photos: []
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

      setIssues(mapped);
    } catch (_) {}
  };

  useEffect(() => {
    if (currentView === 'project' && selectedProject) {
      loadIssues(selectedProject.id);
    }
    // eslint-disable-next-line
  }, [currentView, selectedProject?.id]);

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
      {/* Small floating Supabase test widget (local-only helper) */}
      <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 60 }}>
        {!showTest ? (
          <button onClick={() => setShowTest(true)} className={`px-3 py-2 rounded-lg ${t.accent} text-white text-sm`}>
            Test Supabase
          </button>
        ) : (
          <div className={`w-[320px] p-3 rounded-lg ${t.surface} border ${t.border}`}>
            <div className="flex items-center justify-between mb-2">
              <div className={`${t.text} text-sm font-medium`}>Supabase Test</div>
              <button onClick={() => setShowTest(false)} className={`${t.textSecondary}`}>✕</button>
            </div>
            <input
              value={testTable}
              onChange={e => setTestTable(e.target.value)}
              placeholder="table name (e.g., items)"
              className={`w-full mb-2 px-2 py-1 rounded border ${t.border} ${t.surfaceHover} ${t.text}`}
            />
            <button disabled={testBusy} onClick={runSupabaseTest} className={`w-full mb-2 px-2 py-1 rounded ${t.accent} text-white text-sm`}>
              {testBusy ? 'Running…' : 'Fetch 5 rows'}
            </button>
            {testError && (
              <div className="text-red-400 text-xs mb-2">Error: {testError}</div>
            )}
            {testData && (
              <pre className={`${t.text} text-[10px] max-h-40 overflow-auto`}>{JSON.stringify(testData, null, 2)}</pre>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default App;
