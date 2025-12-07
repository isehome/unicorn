import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Upload,
    Download,
    Ruler,
    CheckCircle,
    AlertTriangle,
    ChevronRight,
    ChevronDown,
    Search,
    Filter,
    Settings
} from 'lucide-react';
import Papa from 'papaparse';
import { useTheme } from '../../contexts/ThemeContext';
import { enhancedStyles } from '../../styles/styleSystem';
import { useAuth } from '../../contexts/AuthContext';
import { projectStakeholdersService, projectsService } from '../../services/supabaseService';
import { projectShadeService } from '../../services/projectShadeService';
import { notifyShadeReviewRequest } from '../../services/issueNotificationService';
import { shadePublicAccessService } from '../../services/shadePublicAccessService';
import { supabase } from '../../lib/supabase'; // Needed for direct updates if service method missing
import Button from '../ui/Button';
import ShadeMeasurementModal from './ShadeMeasurementModal';
import { brandColors, stakeholderColors } from '../../styles/styleSystem';

const ShadeManager = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const { theme, mode } = useTheme();
    const { user, acquireToken } = useAuth(); // MSAL User
    const palette = theme.palette;

    const [shades, setShades] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [importing, setImporting] = useState(false);
    const [project, setProject] = useState(null);

    // Designer Review State
    const [designers, setDesigners] = useState([]);
    const [isDesignerOpen, setIsDesignerOpen] = useState(false);
    const [selectedDesignerId, setSelectedDesignerId] = useState(null);
    const [sendingReview, setSendingReview] = useState(false);
    const [showControls, setShowControls] = useState(false);

    // Filtering & Search
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // all, pending, verified, approved

    // Component State
    const [expandedRooms, setExpandedRooms] = useState(new Set());
    const [selectedShade, setSelectedShade] = useState(null);
    const [showMeasureModal, setShowMeasureModal] = useState(false);

    // Fetch Designers (Project Team)
    useEffect(() => {
        const fetchDesigners = async () => {
            try {
                // Use the same service as IssueDetail to ensure consistency
                const { internal, external } = await projectStakeholdersService.getForProject(projectId);

                // Map and combine exactly like IssueDetail.js
                const internalMapped = (internal || []).map(p => ({ ...p, category: 'internal' }));
                const externalMapped = (external || []).map(p => ({ ...p, category: 'external' }));

                // Deduplicate
                const stakeholderMap = new Map();
                [...internalMapped, ...externalMapped].forEach(stakeholder => {
                    // Use assignment_id as the key identifier if available
                    if (stakeholder.assignment_id || stakeholder.id) {
                        const displayKey = `${stakeholder.contact_name || ''}_${stakeholder.role_name || ''}_${stakeholder.category || ''}`;
                        if (!stakeholderMap.has(displayKey)) {
                            stakeholderMap.set(displayKey, stakeholder);
                        }
                    }
                });

                const combined = Array.from(stakeholderMap.values());
                setDesigners(combined);

                // Pre-select if one is already assigned
                if (shades.length > 0 && shades[0].designer_stakeholder_id) {
                    setSelectedDesignerId(shades[0].designer_stakeholder_id);
                }
            } catch (e) {
                console.error("Failed to fetch project stakeholders", e);
            }
        };
        if (projectId) fetchDesigners();
    }, [projectId, shades]);

    // Fetch Project Info (for email notifications)
    useEffect(() => {
        const fetchProject = async () => {
            try {
                const projectData = await projectsService.getById(projectId);
                setProject(projectData);
            } catch (e) {
                console.error("Failed to fetch project info", e);
            }
        };
        if (projectId) fetchProject();
    }, [projectId]);

    const handleDesignerChange = async (newId) => {
        setSelectedDesignerId(newId);
        try {
            // Automatically assign this designer to the project shades
            await projectShadeService.assignProjectDesigner(projectId, newId);
            // Optionally reload to confirm (though we updated local state optimistically technically via setSelectedDesignerId)
            loadShades();
        } catch (e) {
            console.error('Failed to assign designer', e);
            alert('Failed to save designer assignment: ' + e.message);
        }
    };

    const handleSendToReview = async () => {
        if (!selectedDesignerId) return;
        setSendingReview(true);
        try {
            // Find the selected designer stakeholder
            const selectedDesigner = designers.find(d =>
                (d.assignment_id === selectedDesignerId) || (d.id === selectedDesignerId)
            );

            console.log('[ShadeManager] handleSendToReview:', {
                selectedDesignerId,
                designersCount: designers.length,
                selectedDesigner,
                hasEmail: !!selectedDesigner?.email,
                projectName: project?.name
            });

            if (!selectedDesigner?.email) {
                throw new Error('Selected designer does not have an email address. Please ensure this stakeholder has an email in their contact record.');
            }

            // Update database status
            await projectShadeService.sendToDesignReview(projectId, selectedDesignerId, user.id);

            // Generate portal link for the stakeholder
            console.log('[ShadeManager] Generating portal link...');
            const linkResult = await shadePublicAccessService.ensureLink({
                projectId,
                stakeholderId: selectedDesignerId,
                stakeholder: selectedDesigner
            });

            let portalUrl = null;
            let otp = null;
            if (linkResult.token) {
                // New link was created
                portalUrl = shadePublicAccessService.buildPortalUrl(linkResult.token);
                otp = linkResult.otp;
                console.log('[ShadeManager] New portal link created:', { portalUrl, hasOtp: !!otp });
            } else if (linkResult.linkExists) {
                // Link already exists - we can't reconstruct the URL since token is hashed
                // For existing links, we'd need to regenerate or store the token differently
                console.log('[ShadeManager] Portal link already exists, regenerating...');
                const regenerated = await shadePublicAccessService.ensureLink({
                    projectId,
                    stakeholderId: selectedDesignerId,
                    stakeholder: selectedDesigner,
                    forceRegenerate: true
                });
                if (regenerated.token) {
                    portalUrl = shadePublicAccessService.buildPortalUrl(regenerated.token);
                    otp = regenerated.otp;
                }
            }

            // Send email notification
            console.log('[ShadeManager] Acquiring token for email...');
            const graphToken = await acquireToken();
            console.log('[ShadeManager] Token acquired, sending notification with portal URL:', portalUrl);

            await notifyShadeReviewRequest(
                {
                    project: project,
                    stakeholder: selectedDesigner,
                    actor: { name: user?.name || user?.displayName || 'Your project team' },
                    shadePortalUrl: portalUrl,
                    otp: otp
                },
                { authToken: graphToken }
            );

            console.log('[ShadeManager] Notification sent successfully');
            alert('Review request sent to designer!');
            loadShades();
        } catch (e) {
            console.error('Send review failed:', e);
            alert('Failed to send review: ' + e.message);
        } finally {
            setSendingReview(false);
        }
    };

    const loadShades = useCallback(async () => {
        try {
            setLoading(true);
            const data = await projectShadeService.getShades(projectId);
            setShades(data || []);

            // Auto-expand all rooms initially
            const allRooms = new Set(data.map(s => s.room?.name || 'Unassigned'));
            setExpandedRooms(allRooms);
        } catch (err) {
            console.error('Failed to load shades:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    useEffect(() => {
        loadShades();
    }, [loadShades]);

    const handleFileUpload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            setImporting(true);
            setError(null);

            if (!user?.id) throw new Error('You must be logged in to import shades.');

            const result = await projectShadeService.importShadeCsv(projectId, file, user.id);
            alert(`Successfully imported ${result.inserted} shades!`);
            await loadShades();
        } catch (err) {
            console.error('Import failed:', err);
            setError(err.message);
        } finally {
            setImporting(false);
            // Reset input
            event.target.value = '';
        }
    };

    const handleExport = async () => {
        try {
            const data = await projectShadeService.getExportData(projectId);
            if (!data || data.length === 0) {
                alert('No shades to export');
                return;
            }

            // Convert to CSV
            // Convert to CSV
            const csv = Papa.unparse(data);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `Lutron_Order_Export_${new Date().toISOString().slice(0, 10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error('Export failed:', err);
            alert('Failed to export CSV: ' + err.message);
        }
    };

    const handleOpenMeasurement = (shade) => {
        setSelectedShade(shade);
        setShowMeasureModal(true);
    };

    const handleMeasurementSave = async (measurements, set = 'm1') => {
        try {
            if (!user?.id) throw new Error('User required');
            await projectShadeService.updateMeasurements(selectedShade.id, measurements, user.id, set);
            setShowMeasureModal(false);
            // setSelectedShade(null); // Removed as per instruction
            loadShades(); // Refresh list to show updated status
        } catch (err) {
            console.error('Failed to save measurements:', err);
            alert('Failed to save: ' + err.message);
        }
    };

    // Helper to calculate Delta
    const getDelta = (s) => {
        if (!s.m1_width || !s.m2_width) return null;
        const w1 = parseFloat(s.m1_width);
        const w2 = parseFloat(s.m2_width);
        const h1 = parseFloat(s.m1_height);
        const h2 = parseFloat(s.m2_height);

        if (isNaN(w1) || isNaN(w2) || isNaN(h1) || isNaN(h2)) return null;

        const wDelta = Math.abs(w1 - w2);
        const hDelta = Math.abs(h1 - h2);
        return Math.max(wDelta, hDelta);
    };

    // Grouping Logic
    const groupedShades = useMemo(() => {
        const filtered = shades.filter(shade => {
            const matchSearch = (shade.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (shade.room?.name || '').toLowerCase().includes(searchQuery.toLowerCase());

            if (!matchSearch) return false;

            if (statusFilter === 'verified') return shade.field_verified;
            if (statusFilter === 'approved') return shade.approval_status === 'approved';
            if (statusFilter === 'pending') return !shade.field_verified || shade.approval_status !== 'approved';

            return true;
        });

        const groups = {};
        filtered.forEach(shade => {
            const roomName = shade.room?.name || 'Unassigned';
            if (!groups[roomName]) groups[roomName] = [];
            groups[roomName].push(shade);
        });

        // Sort rooms alphabetically
        return Object.keys(groups).sort().reduce((acc, key) => {
            acc[key] = groups[key];
            return acc;
        }, {});
    }, [shades, searchQuery, statusFilter]);

    // Dynamic Mount Options
    const availableMountTypes = useMemo(() => {
        const types = new Set(['Inside', 'Outside', 'Side']); // Defaults
        shades.forEach(s => {
            // Add any existing values from the database to the list
            if (s.mount_type && s.mount_type.trim()) types.add(s.mount_type.trim());
            if (s.m1_mount_type && s.m1_mount_type.trim()) types.add(s.m1_mount_type.trim());
            if (s.m2_mount_type && s.m2_mount_type.trim()) types.add(s.m2_mount_type.trim());
        });
        return Array.from(types).sort();
    }, [shades]);

    const toggleRoom = (roomName) => {
        setExpandedRooms(prev => {
            const next = new Set(prev);
            if (next.has(roomName)) next.delete(roomName);
            else next.add(roomName);
            return next;
        });
    };

    const getStatusBadge = (shade) => {
        // 1. Approved (Green)
        if (shade.approval_status === 'approved') {
            return (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1"
                    style={{ backgroundColor: 'rgba(148, 175, 50, 0.15)', color: brandColors.success }}>
                    <CheckCircle size={12} /> Approved
                </span>
            );
        }
        // 2. Field Verified (Blue)
        if (shade.field_verified) {
            return (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1"
                    style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6' }}>
                    <Ruler size={12} /> Verified
                </span>
            );
        }
        // 3. Draft/Quote (Yellow)
        return (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1"
                style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B' }}>
                <AlertTriangle size={12} /> Quote
            </span>
        );
    };

    return (
        <div className={`min-h-screen pb-20 ${mode === 'dark' ? 'bg-zinc-900' : 'bg-zinc-50'}`}>
            <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

                {/* Controls (Collapsible) */}
                <div className={`rounded-xl border ${mode === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                    <button
                        onClick={() => setShowControls(!showControls)}
                        className={`w-full flex items-center justify-between p-4 transition-colors ${mode === 'dark' ? 'hover:bg-zinc-700' : 'hover:bg-zinc-50'}`}
                    >
                        <div className="flex items-center gap-2">
                            <Settings size={18} className="text-zinc-500" />
                            <span className={`font-semibold ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-800'}`}>
                                Project Actions & Settings
                            </span>
                        </div>
                        {showControls ? <ChevronDown size={18} className="text-zinc-400" /> : <ChevronRight size={18} className="text-zinc-400" />}
                    </button>

                    {showControls && (
                        <div className="p-4 border-t border-zinc-100 dark:border-zinc-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="flex flex-col sm:flex-row gap-3 items-end sm:items-center w-full sm:w-auto">
                                {/* Designer Selection */}
                                <div className="flex items-center gap-2 relative">
                                    {/* Custom Dropdown Trigger - Match Button 'sm' height (py-1.5 is small, py-2.5 is md)
                                         Button sm: px-3 py-1.5 text-sm.
                                         We'll use standard h-9 or py-1.5 to match. 
                                     */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setIsDesignerOpen(!isDesignerOpen)}
                                            className={`flex items-center justify-between gap-3 px-3 py-1.5 min-w-[16rem] h-[34px] rounded-lg border text-sm transition-colors ${mode === 'dark' ? 'bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-700' : 'bg-white border-zinc-300 text-zinc-900 hover:bg-zinc-50'
                                                }`}
                                        >
                                            {(() => {
                                                // Find selected using assignment_id or id
                                                const selected = designers.find(d => (d.assignment_id === selectedDesignerId) || (d.id === selectedDesignerId));
                                                if (selected) {
                                                    const isInternal = selected.category === 'internal';
                                                    const color = isInternal ? stakeholderColors.internal.text : stakeholderColors.external.text;
                                                    return (
                                                        <span className="flex items-center gap-2 truncate">
                                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                                                            <span className="font-medium">{selected.contact_name}</span>
                                                        </span>
                                                    );
                                                }
                                                return <span className="text-zinc-500">Select Designer</span>;
                                            })()}
                                            <ChevronDown size={16} className={`text-zinc-400 transition-transform ${isDesignerOpen ? 'rotate-180' : ''}`} />
                                        </button>

                                        {/* Dropdown Menu */}
                                        {isDesignerOpen && (
                                            <>
                                                <div className="fixed inset-0 z-10" onClick={() => setIsDesignerOpen(false)} />
                                                <div className={`absolute top-full left-0 mt-2 w-72 max-h-80 overflow-y-auto rounded-xl shadow-xl border z-20 ${mode === 'dark' ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-zinc-200'
                                                    }`}>
                                                    <div className="p-2 space-y-1">
                                                        {designers.map(d => {
                                                            const isInternal = d.category === 'internal';
                                                            const borderColor = isInternal ? stakeholderColors.internal.border : stakeholderColors.external.border;
                                                            const dotColor = isInternal ? stakeholderColors.internal.text : stakeholderColors.external.text;
                                                            // Allow matching by assignment_id or id
                                                            const idValue = d.assignment_id || d.id;
                                                            const isSelected = idValue === selectedDesignerId;

                                                            return (
                                                                <button
                                                                    key={idValue}
                                                                    onClick={() => {
                                                                        handleDesignerChange(idValue);
                                                                        setIsDesignerOpen(false);
                                                                    }}
                                                                    className={`w-full text-left p-3 rounded-lg border flex items-center justify-between group transition-all ${isSelected
                                                                        ? (mode === 'dark' ? 'bg-violet-900/20 border-violet-500/50' : 'bg-violet-50 border-violet-200')
                                                                        : (mode === 'dark' ? 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700' : 'bg-white border-zinc-200 hover:bg-zinc-50')
                                                                        }`}
                                                                    style={{ borderLeftWidth: '4px', borderLeftColor: borderColor }}
                                                                >
                                                                    <div className="flex flex-col gap-0.5">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
                                                                            <span className={`font-semibold text-sm ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>
                                                                                {d.contact_name}
                                                                            </span>
                                                                        </div>
                                                                        <span className="text-xs text-zinc-500 ml-4">
                                                                            {d.role_name || d.stakeholder_slot?.slot_name || 'Stakeholder'}
                                                                        </span>
                                                                    </div>
                                                                    {isSelected && <CheckCircle size={14} className="text-violet-500" />}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        disabled={!selectedDesignerId || sendingReview}
                                        onClick={handleSendToReview}
                                    >
                                        {sendingReview ? 'Sending...' : 'Send Review Link'}
                                    </Button>
                                </div>

                                <div className="h-6 w-px bg-zinc-300 dark:bg-zinc-700 mx-2 hidden sm:block"></div>

                                <Button variant="secondary" size="sm" icon={Upload} onClick={() => document.getElementById('csv-upload').click()} disabled={importing}>
                                    {importing ? 'Importing...' : 'Import Quote'}
                                </Button>
                                <input
                                    id="csv-upload"
                                    type="file"
                                    accept=".csv"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                />
                                <Button variant="secondary" size="sm" icon={Download} onClick={handleExport}>
                                    Export Order
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Filters */}
                <div className={`p-4 rounded-xl border flex flex-col sm:flex-row gap-4 ${mode === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-200'
                    }`}>
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 text-zinc-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search shades or rooms..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className={`w-full pl-10 pr-4 py-2 rounded-lg border focus:ring-2 focus:ring-violet-500 focus:outline-none ${mode === 'dark' ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-zinc-50 border-zinc-300 text-zinc-900'
                                }`}
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        className={`px-4 py-2 rounded-lg border focus:ring-2 focus:ring-violet-500 focus:outline-none ${mode === 'dark' ? 'bg-zinc-900 border-zinc-700 text-zinc-100' : 'bg-white border-zinc-300 text-zinc-900'
                            }`}
                    >
                        <option value="all">All Status</option>
                        <option value="pending">Pending Action</option>
                        <option value="verified">Field Verified</option>
                        <option value="approved">Approved</option>
                    </select>
                </div>

                {/* Content */}
                <div className="space-y-4">
                    {Object.entries(groupedShades).map(([roomName, roomShades]) => {
                        const isExpanded = expandedRooms.has(roomName);
                        return (
                            <div key={roomName} className={`rounded-xl border overflow-hidden ${mode === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-zinc-200'
                                }`}>
                                <button
                                    onClick={() => toggleRoom(roomName)}
                                    className={`w-full flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className={`font-semibold ${mode === 'dark' ? 'text-zinc-100' : 'text-zinc-900'}`}>
                                            {roomName}
                                        </span>
                                        <span className={`px-2 py-0.5 rounded-full text-xs ${mode === 'dark' ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-100 text-zinc-600'
                                            }`}>
                                            {roomShades.length}
                                        </span>
                                    </div>
                                    {isExpanded ? <ChevronDown size={20} className="text-zinc-400" /> : <ChevronRight size={20} className="text-zinc-400" />}
                                </button>

                                {isExpanded && (
                                    <div className="border-t border-zinc-200 dark:border-zinc-700">
                                        {roomShades.map(shade => (
                                            <div key={shade.id}
                                                onClick={() => handleOpenMeasurement(shade)}
                                                className="p-4 border-b last:border-b-0 border-zinc-100 dark:border-zinc-700/50 hover:bg-zinc-50 dark:hover:bg-zinc-700/30 cursor-pointer transition-colors grid grid-cols-12 gap-4 items-center"
                                            >
                                                {/* Info Col */}
                                                <div className="col-span-5 sm:col-span-4">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`font-medium ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-800'}`}>
                                                            {shade.name}
                                                        </span>
                                                        {getStatusBadge(shade)}
                                                    </div>
                                                    <div className={`text-sm ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>
                                                        {shade.technology} • {shade.model}
                                                    </div>
                                                    {shade.fabric_selection && (
                                                        <div className="mt-1 text-xs">
                                                            <a
                                                                href={`https://www.lutronfabrics.com/textile-search?search_api_views_fulltext=${encodeURIComponent(shade.fabric_selection)}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-violet-600 hover:underline inline-flex items-center gap-1"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                Fabric: {shade.fabric_selection}
                                                            </a>
                                                        </div>
                                                    )}
                                                    <div className="mt-1 text-xs text-zinc-400">
                                                        Quote: {shade.quoted_width}" x {shade.quoted_height}"
                                                    </div>
                                                </div>

                                                {/* M1 Status */}
                                                <div className="col-span-2 text-center">
                                                    <div className="text-xs uppercase text-zinc-400 font-semibold mb-1">M1</div>
                                                    {shade.m1_complete ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs"
                                                            style={{ backgroundColor: 'rgba(148, 175, 50, 0.15)', color: brandColors.success }}>
                                                            <CheckCircle size={12} /> Done
                                                        </span>
                                                    ) : (
                                                        <span className="text-zinc-300 text-xs">-</span>
                                                    )}
                                                </div>

                                                {/* M2 Status */}
                                                <div className="col-span-2 text-center">
                                                    <div className="text-xs uppercase text-zinc-400 font-semibold mb-1">M2</div>
                                                    {shade.m2_complete ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs"
                                                            style={{ backgroundColor: 'rgba(148, 175, 50, 0.15)', color: brandColors.success }}>
                                                            <CheckCircle size={12} /> Done
                                                        </span>
                                                    ) : (
                                                        <span className="text-zinc-300 text-xs">-</span>
                                                    )}
                                                </div>

                                                {/* Delta */}
                                                <div className="col-span-2 text-center">
                                                    <div className="text-xs uppercase text-zinc-400 font-semibold mb-1">Delta</div>
                                                    {(() => {
                                                        const delta = getDelta(shade);
                                                        if (delta === null) return <span className="text-zinc-300 text-xs">-</span>;
                                                        const isHigh = delta > 0.125;
                                                        // Use brand success color for low delta (good state)
                                                        const successStyle = { backgroundColor: 'rgba(148, 175, 50, 0.15)', color: brandColors.success };
                                                        const dangerStyle = { backgroundColor: 'rgba(239, 68, 68, 0.15)', color: '#EF4444' };

                                                        return (
                                                            <span className="px-2 py-1 rounded text-xs font-bold"
                                                                style={isHigh ? dangerStyle : successStyle}>
                                                                {delta.toFixed(3)}"
                                                            </span>
                                                        );
                                                    })()}
                                                </div>

                                                <div className="col-span-1 flex justify-end">
                                                    <ChevronRight size={16} className="text-zinc-300" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {Object.keys(groupedShades).length === 0 && !loading && (
                        <div className="text-center py-12 text-zinc-400">
                            No shades found. Import a CSV to get started.
                        </div>
                    )}
                </div>
            </div>

            {/* Measurement Modal */}
            {selectedShade && (
                <ShadeMeasurementModal
                    isOpen={showMeasureModal}
                    onClose={() => setShowMeasureModal(false)}
                    shade={selectedShade}
                    onSave={handleMeasurementSave}
                    currentUser={user}
                    availableMountTypes={availableMountTypes}
                />
            )}
        </div>
    );
};

export default ShadeManager;
