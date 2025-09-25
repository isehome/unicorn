import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import Button from './ui/Button';
import {
  ArrowLeft, Users, Phone, Mail, Building, Trash2, Loader,
  Search, CheckSquare, Square, Plus, AlertTriangle, Zap, FolderOpen,
  ExternalLink, Camera, FileText, Map, ClipboardList, Settings,
  Edit, Check, X, ChevronRight, ListTodo, Eye, EyeOff, Image, Folder,
  Package, Maximize
} from 'lucide-react';

// Import your services
import { 
  projectsService, 
  projectStakeholdersService, 
  contactsService,
  stakeholderRolesService,
  issuesService
} from '../services/supabaseService';

const ProjectDetailView = () => {
  const { id } = useParams();
  const { mode } = useTheme();
  const navigate = useNavigate();

  // State management
  const [project, setProject] = useState(null);
  const [stakeholders, setStakeholders] = useState({ internal: [], external: [] });
  const [todos, setTodos] = useState([]);
  const [issues, setIssues] = useState([]);
  const [wireDrops, setWireDrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // UI State
  const [expandedSections, setExpandedSections] = useState({});
  const [showCompletedTodos, setShowCompletedTodos] = useState(true);
  const [showResolvedIssues, setShowResolvedIssues] = useState(false);
  const [wireDropQuery, setWireDropQuery] = useState('');

  // Form states
  const [newTodo, setNewTodo] = useState('');
  const [todoError, setTodoError] = useState('');
  const [addingTodo, setAddingTodo] = useState(false);
  const [updatingTodoId, setUpdatingTodoId] = useState(null);
  const [deletingTodoId, setDeletingTodoId] = useState(null);

  // Theme styles (simplified for now)
  const isDark = mode === 'dark';
  const styles = {
    bg: isDark ? 'bg-gray-900' : 'bg-gray-50',
    surface: isDark ? 'bg-gray-800' : 'bg-white',
    border: isDark ? 'border-gray-700' : 'border-gray-200',
    text: isDark ? 'text-white' : 'text-gray-900',
    textSecondary: isDark ? 'text-gray-400' : 'text-gray-600',
    accent: 'bg-violet-600',
    accentText: 'text-violet-600',
    success: 'bg-green-600',
    warning: 'bg-orange-600',
    danger: 'bg-red-600'
  };

  // Load project data
  useEffect(() => {
    loadProjectData();
  }, [id]);

  const loadProjectData = async () => {
    try {
      setLoading(true);
      
      // Load project with stakeholders
      const projectData = await projectsService.getWithStakeholders(id);
      setProject(projectData);
      setStakeholders(projectData.stakeholders || { internal: [], external: [] });

      // Load issues
      const issueData = await issuesService.getAll(id);
      setIssues(issueData);

      // Mock data for todos and wire drops (replace with actual API calls)
      setTodos([
        { id: '1', title: 'Complete wiring diagram review', completed: false, projectId: id },
        { id: '2', title: 'Schedule inspection appointment', completed: true, projectId: id },
        { id: '3', title: 'Order remaining materials', completed: false, projectId: id }
      ]);

      setWireDrops([
        { id: '1', name: 'Living Room - Main TV', location: 'Living Room', type: 'CAT6', uid: 'WD-LR001', prewirePhoto: null, installedPhoto: null },
        { id: '2', name: 'Kitchen - Island Outlet', location: 'Kitchen', type: 'CAT6', uid: 'WD-KT001', prewirePhoto: 'photo1.jpg', installedPhoto: null },
        { id: '3', name: 'Office - Desk Setup', location: 'Home Office', type: 'CAT6A', uid: 'WD-OF001', prewirePhoto: 'photo2.jpg', installedPhoto: 'photo3.jpg' }
      ]);

    } catch (err) {
      console.error('Error loading project:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Project progress calculation
  const calculateProjectProgress = useCallback((project) => {
    if (!project) return 0;
    // Simple calculation - replace with your logic
    const completedTodos = todos.filter(t => t.completed).length;
    const totalTodos = todos.length;
    const resolvedIssues = issues.filter(i => i.status === 'resolved').length;
    const totalIssues = issues.length;
    
    const todoProgress = totalTodos > 0 ? (completedTodos / totalTodos) * 50 : 50;
    const issueProgress = totalIssues > 0 ? (resolvedIssues / totalIssues) * 50 : 50;
    
    return Math.round(todoProgress + issueProgress);
  }, [todos, issues]);

  // Section toggle
  const toggleSection = (section) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Todo management
  const handleAddTodo = async () => {
    const title = newTodo.trim();
    if (!title || !project) return;

    try {
      setAddingTodo(true);
      setTodoError('');
      
      // Mock API call - replace with actual API
      const newTodoItem = {
        id: Date.now().toString(),
        title,
        completed: false,
        projectId: project.id,
        createdAt: new Date().toISOString()
      };
      
      setTodos(prev => [...prev, newTodoItem]);
      setNewTodo('');
    } catch (e) {
      setTodoError(e.message);
    } finally {
      setAddingTodo(false);
    }
  };

  const toggleTodoCompletion = async (todo) => {
    try {
      setUpdatingTodoId(todo.id);
      setTodoError('');
      
      // Mock API call - replace with actual API
      setTodos(prev => prev.map(t => 
        t.id === todo.id ? { ...t, completed: !t.completed } : t
      ));
    } catch (e) {
      setTodoError(e.message);
    } finally {
      setUpdatingTodoId(null);
    }
  };

  const handleDeleteTodo = async (todoId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    
    try {
      setDeletingTodoId(todoId);
      setTodoError('');
      
      // Mock API call - replace with actual API
      setTodos(prev => prev.filter(t => t.id !== todoId));
    } catch (e) {
      setTodoError(e.message);
    } finally {
      setDeletingTodoId(null);
    }
  };

  // Utility functions
  const openLink = (url) => {
    if (url && url !== '#') {
      window.open(url, '_blank');
    } else {
      alert('Link not configured');
    }
  };

  // Filter logic
  const projectTodos = todos.filter(todo => todo.projectId === project?.id);
  const openTodos = projectTodos.filter(todo => !todo.completed).length;
  const visibleTodos = projectTodos.filter(todo => showCompletedTodos || !todo.completed);
  const totalTodos = projectTodos.length;

  const projectIssues = issues.filter(i => i.project_id === project?.id);
  const visibleIssues = projectIssues.filter(i => showResolvedIssues || i.status !== 'resolved');
  const openIssues = projectIssues.filter(i => i.status !== 'resolved').length;

  // Wire drop filtering
  const filteredWireDrops = wireDrops.filter(drop => {
    if (!wireDropQuery) return true;
    const query = wireDropQuery.toLowerCase();
    return (drop.name || '').toLowerCase().includes(query) ||
           (drop.location || '').toLowerCase().includes(query) ||
           (drop.uid || '').toLowerCase().includes(query) ||
           (drop.type || '').toLowerCase().includes(query);
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || 'Project not found'}</p>
          <Button onClick={() => navigate(-1)} icon={ArrowLeft}>
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const progress = calculateProjectProgress(project);

  return (
    <div className={`min-h-screen ${styles.bg} relative z-10`}>
      {/* Header */}
      <div className={`${styles.surface} ${styles.border} border-b px-4 py-3`}>
        <div className="flex items-center justify-between">
          <button 
            onClick={() => navigate(-1)} 
            className={`p-2 ${styles.surface} ${styles.text} rounded hover:bg-gray-100 dark:hover:bg-gray-700`}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="text-xs font-bold text-violet-600">
            INTELLIGENT<br/>SYSTEMS
          </div>
        </div>
      </div>

      {/* Project Progress Bar */}
      <div className="p-4">
        <div className={`rounded-xl overflow-hidden ${styles.surface} ${styles.border} border`}>
          <div className="relative h-14">
            <div 
              className={`absolute inset-0 ${
                progress > 70 ? styles.success :
                progress > 40 ? styles.warning :
                styles.danger
              } opacity-90`}
              style={{ width: `${progress}%` }}
            />
            <div className={`absolute inset-0 flex items-center justify-center font-semibold ${styles.text}`}>
              {project.name} - {progress}%
            </div>
          </div>
        </div>
      </div>

      {/* Content Sections */}
      <div className="px-4 pb-20">
        {/* Quick Links */}
        <button
          onClick={() => openLink(project.wiring_diagram_url)}
          className={`w-full mb-2 p-4 rounded-xl ${styles.surface} ${styles.border} border flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750`}
        >
          <div className="flex items-center gap-3">
            <FileText size={20} className={styles.textSecondary} />
            <span className={`font-medium ${styles.text}`}>Wiring Diagram</span>
          </div>
          <ExternalLink size={20} className={styles.textSecondary} />
        </button>

        <button
          onClick={() => openLink(project.portal_proposal_url)}
          className={`w-full mb-2 p-4 rounded-xl ${styles.surface} ${styles.border} border flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-750`}
        >
          <div className="flex items-center gap-3">
            <FileText size={20} className={styles.textSecondary} />
            <span className={`font-medium ${styles.text}`}>Portal Proposal</span>
          </div>
          <ExternalLink size={20} className={styles.textSecondary} />
        </button>

        {/* Wire Drops Section */}
        <button
          onClick={() => toggleSection('wireDrops')}
          className={`w-full mb-2 p-4 rounded-xl ${styles.surface} ${styles.border} border flex items-center justify-between`}
        >
          <div className="flex items-center gap-3">
            <Zap size={20} className={styles.textSecondary} />
            <span className={`font-medium ${styles.text}`}>Wire Drops</span>
            <span className={`px-2 py-1 rounded-full text-xs ${styles.accent} text-white`}>
              {wireDrops.length}
            </span>
          </div>
          <ChevronRight 
            size={20} 
            className={`${styles.textSecondary} transition-transform ${expandedSections.wireDrops ? 'rotate-90' : ''}`} 
          />
        </button>

        {expandedSections.wireDrops && (
          <div className={`mb-2 p-4 rounded-xl ${styles.surface} ${styles.border} border space-y-3`}>
            {/* Search */}
            <div className="relative">
              <Search size={18} className={`absolute left-3 top-3 ${styles.textSecondary}`} />
              <input
                type="text"
                value={wireDropQuery}
                onChange={(e) => setWireDropQuery(e.target.value)}
                placeholder="Search wire drops..."
                className={`w-full pl-10 pr-3 py-2 rounded-lg ${styles.surface} ${styles.text} ${styles.border} border`}
              />
            </div>

            {/* Wire Drop List */}
            {filteredWireDrops.length === 0 ? (
              <p className={`text-sm ${styles.textSecondary}`}>
                {wireDropQuery ? 'No matching wire drops.' : 'No wire drops yet.'}
              </p>
            ) : (
              filteredWireDrops.map(drop => {
                const prewireComplete = !!drop.prewirePhoto;
                const installComplete = !!drop.installedPhoto;
                const completion = (prewireComplete ? 50 : 0) + (installComplete ? 50 : 0);
                
                return (
                  <div
                    key={drop.id}
                    className={`p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 cursor-pointer transition`}
                  >
                    <div className="flex items-center justify-between mb-2 gap-3">
                      <div>
                        <p className={`font-medium ${styles.text}`}>{drop.name}</p>
                        <p className={`text-xs ${styles.textSecondary}`}>{drop.location}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-700 ${styles.text}`}>
                        {drop.uid}
                      </span>
                    </div>
                    <div className={`flex items-center justify-between text-xs ${styles.textSecondary}`}>
                      <div className="flex gap-2">
                        <span className={`px-2 py-0.5 rounded ${prewireComplete ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}>
                          Prewire
                        </span>
                        <span className={`px-2 py-0.5 rounded ${installComplete ? 'bg-green-600 text-white' : 'bg-gray-100 dark:bg-gray-700'}`}>
                          Install
                        </span>
                      </div>
                      <span className={`font-semibold ${styles.text}`}>{completion}%</span>
                    </div>
                  </div>
                );
              })
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-3">
              <Button variant="primary" size="sm" icon={Plus} className="flex-1">
                Add Wire Drop
              </Button>
              <Button variant="secondary" size="sm">
                Full List
              </Button>
            </div>
          </div>
        )}

        {/* To-dos Section */}
        <button
          onClick={() => toggleSection('todos')}
          className={`w-full mb-2 p-4 rounded-xl ${styles.surface} ${styles.border} border flex items-center justify-between`}
        >
          <div className="flex items-center gap-3">
            <ListTodo size={20} className={styles.textSecondary} />
            <span className={`font-medium ${styles.text}`}>To-do List</span>
            {openTodos > 0 && (
              <span className="px-2 py-0.5 bg-orange-500 text-white text-xs rounded-full">
                {openTodos} open
              </span>
            )}
          </div>
          <ChevronRight 
            size={20} 
            className={`${styles.textSecondary} transition-transform ${expandedSections.todos ? 'rotate-90' : ''}`} 
          />
        </button>

        {expandedSections.todos && (
          <div className={`mb-2 p-4 rounded-xl ${styles.surface} ${styles.border} border`}>
            {/* Add Todo */}
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
                className={`flex-1 px-3 py-2 rounded-lg ${styles.surface} ${styles.text} ${styles.border} border`}
              />
              <button
                onClick={handleAddTodo}
                disabled={addingTodo || !newTodo.trim()}
                className={`p-2 ${styles.accent} text-white rounded ${addingTodo || !newTodo.trim() ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Plus size={20} />
              </button>
            </div>

            {/* Todo Stats and Toggle */}
            <div className="flex items-center justify-between mb-3">
              <span className={`text-xs ${styles.textSecondary}`}>
                {totalTodos === 0 ? 'No tasks yet' : `${openTodos} open • ${totalTodos} total`}
              </span>
              {totalTodos > 0 && (
                <button
                  onClick={() => setShowCompletedTodos(prev => !prev)}
                  className={`flex items-center gap-1 px-2 py-1 rounded ${styles.surface} ${styles.text} text-xs ${styles.border} border`}
                >
                  {showCompletedTodos ? <EyeOff size={14} /> : <Eye size={14} />}
                  <span>{showCompletedTodos ? 'Hide completed' : 'Show completed'}</span>
                </button>
              )}
            </div>

            {todoError && <div className="text-xs text-red-400 mb-3">{todoError}</div>}

            {/* Todo List */}
            <div className="space-y-2">
              {totalTodos === 0 ? (
                <p className={`text-sm ${styles.textSecondary}`}>No tasks yet. Add your first item above.</p>
              ) : visibleTodos.length === 0 ? (
                <p className={`text-sm ${styles.textSecondary}`}>All tasks are complete. Great job!</p>
              ) : (
                visibleTodos.map(todo => (
                  <div
                    key={todo.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg ${styles.surface} ${styles.border} border`}
                  >
                    <button
                      onClick={() => toggleTodoCompletion(todo)}
                      disabled={updatingTodoId === todo.id}
                      className={`p-1 rounded ${updatingTodoId === todo.id ? 'opacity-50 cursor-wait' : ''}`}
                    >
                      {todo.completed ? (
                        <CheckSquare size={18} className="text-green-400" />
                      ) : (
                        <Square size={18} className={styles.textSecondary} />
                      )}
                    </button>
                    <span className={`flex-1 text-sm ${styles.text} ${todo.completed ? 'line-through opacity-70' : ''}`}>
                      {todo.title}
                    </span>
                    <button
                      onClick={() => handleDeleteTodo(todo.id)}
                      disabled={deletingTodoId === todo.id}
                      className={`p-1 rounded ${deletingTodoId === todo.id ? 'opacity-50 cursor-wait' : ''}`}
                    >
                      <Trash2 size={16} className={styles.textSecondary} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Issues Section */}
        <button
          onClick={() => toggleSection('issues')}
          className={`w-full mb-2 p-4 rounded-xl ${styles.surface} ${styles.border} border flex items-center justify-between`}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle size={20} className={styles.textSecondary} />
            <span className={`font-medium ${styles.text}`}>Issues</span>
            {openIssues > 0 && (
              <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full">
                {openIssues}
              </span>
            )}
          </div>
          <ChevronRight 
            size={20} 
            className={`${styles.textSecondary} transition-transform ${expandedSections.issues ? 'rotate-90' : ''}`} 
          />
        </button>

        {expandedSections.issues && (
          <div className={`mb-2 p-4 rounded-xl ${styles.surface} ${styles.border} border`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowResolvedIssues(!showResolvedIssues)}
                  className={`text-sm ${styles.textSecondary}`}
                >
                  {showResolvedIssues ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <span className={`text-sm ${styles.textSecondary}`}>
                  {showResolvedIssues ? 'Showing all' : 'Hiding resolved'}
                </span>
              </div>
              <button
                onClick={() => navigate(`/project/${id}/issues/new`)}
                className={`p-1 ${styles.accent} text-white rounded`}
              >
                <Plus size={20} />
              </button>
            </div>

            {visibleIssues.length === 0 ? (
              <p className={`text-sm ${styles.textSecondary}`}>No issues to display.</p>
            ) : (
              visibleIssues.map(issue => (
                <div
                  key={issue.id}
                  onClick={() => navigate(`/project/${id}/issues/${issue.id}`)}
                  className={`w-full p-3 mb-2 rounded-lg ${styles.surface} ${styles.border} border text-left cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-750`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className={`font-medium ${styles.text}`}>{issue.title}</p>
                      <p className={`text-xs ${styles.textSecondary} mt-1`}>
                        {new Date(issue.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs text-white capitalize ${
                        issue.status === 'blocked' ? styles.danger :
                        issue.status === 'open' ? styles.warning :
                        styles.success
                      }`}>
                        {issue.status}
                      </span>
                      <ChevronRight size={16} className={styles.textSecondary} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* People Section */}
        <button
          onClick={() => toggleSection('people')}
          className={`w-full mb-2 p-4 rounded-xl ${styles.surface} ${styles.border} border flex items-center justify-between`}
        >
          <div className="flex items-center gap-3">
            <Users size={20} className={styles.textSecondary} />
            <span className={`font-medium ${styles.text}`}>People</span>
            <span className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
              {stakeholders.internal.length + stakeholders.external.length}
            </span>
          </div>
          <ChevronRight 
            size={20} 
            className={`${styles.textSecondary} transition-transform ${expandedSections.people ? 'rotate-90' : ''}`} 
          />
        </button>

        {expandedSections.people && (
          <div className={`mb-2 p-4 rounded-xl ${styles.surface} ${styles.border} border space-y-3`}>
            {/* Internal Stakeholders */}
            {stakeholders.internal.length > 0 && (
              <div>
                <h4 className={`text-sm font-medium ${styles.text} mb-2`}>Internal Team</h4>
                {stakeholders.internal.map(person => (
                  <div key={person.assignment_id} className="flex items-center gap-3 p-2">
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${styles.text}`}>{person.contact_name}</p>
                      <p className={`text-xs ${styles.textSecondary}`}>{person.role_name}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* External Stakeholders */}
            {stakeholders.external.length > 0 && (
              <div>
                <h4 className={`text-sm font-medium ${styles.text} mb-2`}>External Stakeholders</h4>
                {stakeholders.external.map(person => (
                  <div key={person.assignment_id} className="flex items-center gap-3 p-2">
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${styles.text}`}>{person.contact_name}</p>
                      <p className={`text-xs ${styles.textSecondary}`}>{person.role_name}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button variant="primary" size="sm" icon={Plus} className="w-full">
              Add Stakeholder
            </Button>
          </div>
        )}

        {/* OneDrive Files */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          <button
            onClick={() => openLink(project.one_drive_photos)}
            className={`p-4 rounded-xl ${styles.surface} ${styles.border} border flex flex-col items-center hover:bg-gray-50 dark:hover:bg-gray-750`}
          >
            <Image size={20} className={`${styles.textSecondary} mb-1`} />
            <span className={`text-xs ${styles.text}`}>Photos</span>
          </button>
          <button
            onClick={() => openLink(project.one_drive_files)}
            className={`p-4 rounded-xl ${styles.surface} ${styles.border} border flex flex-col items-center hover:bg-gray-50 dark:hover:bg-gray-750`}
          >
            <Folder size={20} className={`${styles.textSecondary} mb-1`} />
            <span className={`text-xs ${styles.text}`}>Files</span>
          </button>
          <button
            onClick={() => openLink(project.one_drive_procurement)}
            className={`p-4 rounded-xl ${styles.surface} ${styles.border} border flex flex-col items-center hover:bg-gray-50 dark:hover:bg-gray-750`}
          >
            <Package size={20} className={`${styles.textSecondary} mb-1`} />
            <span className={`text-xs ${styles.text}`}>Procurement</span>
          </button>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className={`fixed bottom-0 left-0 right-0 p-4 grid grid-cols-2 gap-2 ${styles.surface} ${styles.border} border-t`}>
        <button
          onClick={() => {
            const query = prompt('Search for:');
            if (query) {
              navigate(`/wire-drops?search=${encodeURIComponent(query)}`);
            }
          }}
          className={`py-3 rounded-lg ${styles.surface} ${styles.text} ${styles.border} border font-medium hover:bg-gray-50 dark:hover:bg-gray-750`}
        >
          Search
        </button>
        <button
          onClick={() => navigate(`/project/${id}/issues/new`)}
          className={`py-3 rounded-lg ${styles.surface} ${styles.text} ${styles.border} border font-medium hover:bg-gray-50 dark:hover:bg-gray-750`}
        >
          New Issue
        </button>
      </div>
    </div>
  );
};

export default ProjectDetailView;