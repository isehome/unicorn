import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft, Ruler, Camera, CheckCircle, Lock, ExternalLink,
    MessageSquare, Send, Info, Loader2, Plus, ChevronDown, ChevronRight,
    AlertTriangle, UserCheck
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePhotoViewer } from '../photos/PhotoViewerProvider';
import Button from '../ui/Button';
import CachedSharePointImage from '../CachedSharePointImage';
import { shadePhotoService } from '../../services/shadePhotoService';
import { projectStakeholdersService } from '../../services/supabaseService';
import { projectShadeService } from '../../services/projectShadeService';
import { shadePublicAccessService } from '../../services/shadePublicAccessService';
import { notifyShadeReviewRequest } from '../../services/issueNotificationService';
import { supabase } from '../../lib/supabase';
import { brandColors } from '../../styles/styleSystem';

// Headrail style options
const HEADRAIL_STYLES = ['Pocket', 'Fascia', 'Fascia + Top Back Cover', 'Top Back Cover'];
const MOUNT_TYPES = ['Inside', 'Outside'];

const ShadeDetailPage = () => {
    const { projectId, shadeId } = useParams();
    const navigate = useNavigate();
    const { mode } = useTheme();
    const { user, acquireToken } = useAuth();
    const { openPhotoViewer, closePhotoViewer, updatePhotoViewerOptions } = usePhotoViewer();

    // Loading states
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [photoLoading, setPhotoLoading] = useState(null);
    const [saving, setSaving] = useState(false);

    // Data
    const [shade, setShade] = useState(null);
    const [photos, setPhotos] = useState([]);
    const [error, setError] = useState(null);
    const [rooms, setRooms] = useState([]);
    const [project, setProject] = useState(null);

    // Headrail info modal state
    const [showHeadrailInfo, setShowHeadrailInfo] = useState(false);

    // Header field states
    const [headerMountType, setHeaderMountType] = useState('');
    const [headerHeadrailStyle, setHeaderHeadrailStyle] = useState('');

    // Shared shade-level fields
    const [pocketWidth, setPocketWidth] = useState('');
    const [pocketHeight, setPocketHeight] = useState('');
    const [pocketDepth, setPocketDepth] = useState('');
    const [installationNotes, setInstallationNotes] = useState('');
    const [orderedWidth, setOrderedWidth] = useState('');
    const [orderedHeight, setOrderedHeight] = useState('');
    const [orderedDepth, setOrderedDepth] = useState('');
    const [dimensionsValidated, setDimensionsValidated] = useState(false);

    // Debounce timers
    const installationNotesTimerRef = useRef(null);
    const pocketTimerRef = useRef(null);
    const orderedWidthTimerRef = useRef(null);
    const orderedHeightTimerRef = useRef(null);
    const orderedDepthTimerRef = useRef(null);

    // Design Review state
    const [designReviewExpanded, setDesignReviewExpanded] = useState(false);
    const [designers, setDesigners] = useState([]);
    const [selectedDesignerId, setSelectedDesignerId] = useState(null);
    const [sendingReview, setSendingReview] = useState(false);

    // Comments state (inside design review)
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);

    // Measurement tab state
    const [activeTab, setActiveTab] = useState('m1');

    // Measurement form - 3 widths (top, middle, bottom), 1 height, mount depth
    const [formData, setFormData] = useState({
        widthTop: '',
        widthMiddle: '',
        widthBottom: '',
        height: '',
        mountDepth: '',
        obstructionNotes: ''
    });

    // Blinding logic
    const isM1Blind = shade?.m1_complete && shade?.m1_by !== user?.id;
    const isM2Blind = shade?.m2_complete && shade?.m2_by !== user?.id;

    // Auto-calculate final dimensions from M1 and M2
    const calculatedDimensions = useMemo(() => {
        if (!shade) return { width: null, height: null, widthStatus: 'pending', heightStatus: 'pending' };

        // Gather all width measurements
        const m1Widths = [
            shade.m1_measure_width_top,
            shade.m1_measure_width_middle,
            shade.m1_measure_width_bottom
        ].filter(v => v && !isNaN(parseFloat(v))).map(v => parseFloat(v));

        const m2Widths = [
            shade.m2_measure_width_top,
            shade.m2_measure_width_middle,
            shade.m2_measure_width_bottom
        ].filter(v => v && !isNaN(parseFloat(v))).map(v => parseFloat(v));

        const allWidths = [...m1Widths, ...m2Widths];

        // Height measurements
        const m1Height = shade.m1_height ? parseFloat(shade.m1_height) : null;
        const m2Height = shade.m2_height ? parseFloat(shade.m2_height) : null;
        const heights = [m1Height, m2Height].filter(v => v !== null && !isNaN(v));

        // Calculate width
        let calculatedWidth = null;
        let widthStatus = 'pending';

        if (allWidths.length >= 6) {
            const minWidth = Math.min(...allWidths);
            const maxWidth = Math.max(...allWidths);
            const allSame = allWidths.every(w => w === allWidths[0]);

            if (allSame) {
                calculatedWidth = allWidths[0];
                widthStatus = 'exact'; // GREEN
            } else {
                calculatedWidth = minWidth; // Use shortest for safety
                widthStatus = 'review'; // AMBER - needs manual review
            }
        } else if (allWidths.length > 0) {
            calculatedWidth = Math.min(...allWidths);
            widthStatus = 'partial'; // Not enough data
        }

        // Calculate height
        let calculatedHeight = null;
        let heightStatus = 'pending';

        if (heights.length === 2) {
            if (m1Height === m2Height) {
                calculatedHeight = m1Height;
                heightStatus = 'exact'; // GREEN
            } else {
                calculatedHeight = Math.min(m1Height, m2Height); // Use shortest
                heightStatus = 'review'; // AMBER
            }
        } else if (heights.length === 1) {
            calculatedHeight = heights[0];
            heightStatus = 'partial';
        }

        return {
            width: calculatedWidth,
            height: calculatedHeight,
            widthStatus,
            heightStatus
        };
    }, [shade]);

    // Load shade data
    const loadShade = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error: fetchError } = await supabase
                .from('project_shades')
                .select(`
                    *,
                    room:project_rooms(id, name)
                `)
                .eq('id', shadeId)
                .single();

            if (fetchError) throw fetchError;
            setShade(data);

            // Initialize form fields
            setHeaderMountType(data.mount_type || '');
            setHeaderHeadrailStyle(data.headrail_style || '');
            setPocketWidth(data.pocket_width || '');
            setPocketHeight(data.pocket_height || '');
            setPocketDepth(data.pocket_depth || '');
            setInstallationNotes(data.install_instructions || '');
            setOrderedWidth(data.ordered_width || '');
            setOrderedHeight(data.ordered_height || '');
            setOrderedDepth(data.ordered_depth || '');
            setDimensionsValidated(data.dimensions_validated || false);
            setSelectedDesignerId(data.designer_stakeholder_id || null);

            // Determine default tab
            if (data.m1_complete && !data.m2_complete) {
                setActiveTab('m2');
            }

            // Initialize measurement form
            const set = data.m1_complete && !data.m2_complete ? 'm2' : 'm1';
            setFormData({
                widthTop: data?.[`${set}_measure_width_top`] || '',
                widthMiddle: data?.[`${set}_measure_width_middle`] || '',
                widthBottom: data?.[`${set}_measure_width_bottom`] || '',
                height: data?.[`${set}_height`] || data?.[`${set}_measure_height_center`] || '',
                mountDepth: data?.[`${set}_mount_depth`] || '',
                obstructionNotes: data?.[`${set}_obstruction_notes`] || ''
            });

        } catch (err) {
            console.error('[ShadeDetailPage] Failed to load shade:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [shadeId]);

    // Load photos
    const loadPhotos = useCallback(async () => {
        try {
            const allPhotos = await shadePhotoService.getPhotos(shadeId);
            setPhotos(allPhotos);
        } catch (err) {
            console.error('[ShadeDetailPage] Failed to load photos:', err);
        }
    }, [shadeId]);

    // Load rooms
    const loadRooms = useCallback(async () => {
        try {
            const { data, error: fetchError } = await supabase
                .from('project_rooms')
                .select('id, name')
                .eq('project_id', projectId)
                .order('name');
            if (fetchError) throw fetchError;
            setRooms(data || []);
        } catch (err) {
            console.error('[ShadeDetailPage] Failed to load rooms:', err);
        }
    }, [projectId]);

    // Load project info
    const loadProject = useCallback(async () => {
        try {
            const { data, error: fetchError } = await supabase
                .from('projects')
                .select('id, name')
                .eq('id', projectId)
                .single();
            if (fetchError) throw fetchError;
            setProject(data);
        } catch (err) {
            console.error('[ShadeDetailPage] Failed to load project:', err);
        }
    }, [projectId]);

    // Load designers (stakeholders)
    const loadDesigners = useCallback(async () => {
        try {
            const { internal, external } = await projectStakeholdersService.getForProject(projectId);
            const internalMapped = (internal || []).map(p => ({ ...p, category: 'internal' }));
            const externalMapped = (external || []).map(p => ({ ...p, category: 'external' }));

            // Deduplicate
            const stakeholderMap = new Map();
            [...internalMapped, ...externalMapped].forEach(stakeholder => {
                if (stakeholder.assignment_id || stakeholder.id) {
                    const displayKey = `${stakeholder.contact_name || ''}_${stakeholder.role_name || ''}_${stakeholder.category || ''}`;
                    if (!stakeholderMap.has(displayKey)) {
                        stakeholderMap.set(displayKey, stakeholder);
                    }
                }
            });

            setDesigners(Array.from(stakeholderMap.values()));
        } catch (e) {
            console.error('[ShadeDetailPage] Failed to fetch stakeholders:', e);
        }
    }, [projectId]);

    // Load comments
    const loadComments = useCallback(async () => {
        if (!designReviewExpanded) return;
        setLoadingComments(true);
        try {
            const { data, error: fetchError } = await supabase
                .from('shade_comments')
                .select('*')
                .eq('shade_id', shadeId)
                .order('created_at', { ascending: true });
            if (fetchError) throw fetchError;
            setComments(data || []);
        } catch (err) {
            console.error('[ShadeDetailPage] Failed to load comments:', err);
        } finally {
            setLoadingComments(false);
        }
    }, [shadeId, designReviewExpanded]);

    useEffect(() => {
        loadShade();
        loadPhotos();
        loadRooms();
        loadProject();
        loadDesigners();
    }, [loadShade, loadPhotos, loadRooms, loadProject, loadDesigners]);

    useEffect(() => {
        if (designReviewExpanded) {
            loadComments();
        }
    }, [designReviewExpanded, loadComments]);

    // Track pending saves for flush on unmount
    const pendingSavesRef = useRef(new Map());

    // Flush all pending saves immediately (for unmount or blur)
    const flushPendingSaves = useCallback(async () => {
        const saves = Array.from(pendingSavesRef.current.entries());
        if (saves.length === 0) return;

        console.log('[ShadeDetailPage] Flushing pending saves:', saves.map(s => s[0]));
        pendingSavesRef.current.clear();

        try {
            const updates = {};
            saves.forEach(([field, value]) => {
                updates[field] = value;
            });
            updates.updated_at = new Date().toISOString();

            await supabase
                .from('project_shades')
                .update(updates)
                .eq('id', shadeId);

            console.log('[ShadeDetailPage] Flushed saves successfully');
        } catch (err) {
            console.error('[ShadeDetailPage] Flush save failed:', err);
        }
    }, [shadeId]);

    // Handle beforeunload to save pending changes when browser navigates away
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            const saves = Array.from(pendingSavesRef.current.entries());
            if (saves.length > 0) {
                // Try to save synchronously using sendBeacon if available
                const updates = {};
                saves.forEach(([field, value]) => {
                    updates[field] = value;
                });
                updates.updated_at = new Date().toISOString();

                // Use sendBeacon for reliable save on page unload
                if (navigator.sendBeacon) {
                    const url = `${process.env.REACT_APP_SUPABASE_URL}/rest/v1/project_shades?id=eq.${shadeId}`;
                    const headers = {
                        'apikey': process.env.REACT_APP_SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    };
                    const blob = new Blob([JSON.stringify(updates)], { type: 'application/json' });
                    // Note: sendBeacon doesn't support custom headers well, so this is best-effort
                    navigator.sendBeacon(url, blob);
                }

                // Also show warning if there are unsaved changes
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [shadeId]);

    // Cleanup timers and flush saves on unmount (React navigation)
    useEffect(() => {
        return () => {
            // Clear all timers
            if (installationNotesTimerRef.current) clearTimeout(installationNotesTimerRef.current);
            if (pocketTimerRef.current) clearTimeout(pocketTimerRef.current);
            if (orderedWidthTimerRef.current) clearTimeout(orderedWidthTimerRef.current);
            if (orderedHeightTimerRef.current) clearTimeout(orderedHeightTimerRef.current);
            if (orderedDepthTimerRef.current) clearTimeout(orderedDepthTimerRef.current);
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

            // Flush any pending saves immediately on unmount
            // Note: This uses a synchronous approach since async doesn't work reliably in cleanup
            const saves = Array.from(pendingSavesRef.current.entries());
            if (saves.length > 0 && shadeId) {
                const updates = {};
                saves.forEach(([field, value]) => {
                    updates[field] = value;
                });
                updates.updated_at = new Date().toISOString();

                // Fire and forget - best effort save on unmount
                supabase
                    .from('project_shades')
                    .update(updates)
                    .eq('id', shadeId)
                    .then(() => console.log('[ShadeDetailPage] Unmount save completed'))
                    .catch(err => console.error('[ShadeDetailPage] Unmount save failed:', err));
            }
        };
    }, [shadeId]);

    // Handle tab change - reload form data for new measurement set
    useEffect(() => {
        if (shade && (activeTab === 'm1' || activeTab === 'm2')) {
            setFormData({
                widthTop: shade?.[`${activeTab}_measure_width_top`] || '',
                widthMiddle: shade?.[`${activeTab}_measure_width_middle`] || '',
                widthBottom: shade?.[`${activeTab}_measure_width_bottom`] || '',
                height: shade?.[`${activeTab}_height`] || shade?.[`${activeTab}_measure_height_center`] || '',
                mountDepth: shade?.[`${activeTab}_mount_depth`] || '',
                obstructionNotes: shade?.[`${activeTab}_obstruction_notes`] || ''
            });
        }
    }, [shade, activeTab]);

    // Debounce timer for auto-save
    const autoSaveTimerRef = useRef(null);

    // Auto-save shade-level field
    const autoSaveShadeField = useCallback(async (field, value) => {
        if (!shadeId) return;
        setSaving(true);
        try {
            await supabase
                .from('project_shades')
                .update({ [field]: value, updated_at: new Date().toISOString() })
                .eq('id', shadeId);
            console.log(`[ShadeDetailPage] Auto-saved ${field}`);
        } catch (err) {
            console.error(`[ShadeDetailPage] Auto-save failed for ${field}:`, err);
        } finally {
            setSaving(false);
        }
    }, [shadeId]);

    // Auto-save measurement field (debounced with pending tracking)
    const autoSaveMeasurementField = useCallback((field, value) => {
        if (!shadeId) return;

        const fieldMapping = {
            'widthTop': `${activeTab}_measure_width_top`,
            'widthMiddle': `${activeTab}_measure_width_middle`,
            'widthBottom': `${activeTab}_measure_width_bottom`,
            'height': `${activeTab}_height`,
            'mountDepth': `${activeTab}_mount_depth`,
            'obstructionNotes': `${activeTab}_obstruction_notes`
        };

        const dbColumn = fieldMapping[field];
        if (!dbColumn) return;

        // Track as pending save
        pendingSavesRef.current.set(dbColumn, value);

        if (autoSaveTimerRef.current) {
            clearTimeout(autoSaveTimerRef.current);
        }

        autoSaveTimerRef.current = setTimeout(async () => {
            pendingSavesRef.current.delete(dbColumn);
            setSaving(true);
            try {
                await supabase
                    .from('project_shades')
                    .update({ [dbColumn]: value, updated_at: new Date().toISOString() })
                    .eq('id', shadeId);

                // Reload shade to update calculated dimensions
                await loadShade();
            } catch (err) {
                console.error(`[ShadeDetailPage] Auto-save failed for ${field}:`, err);
            } finally {
                setSaving(false);
            }
        }, 500);
    }, [shadeId, activeTab, loadShade]);

    const handleMeasurementChange = useCallback((field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        autoSaveMeasurementField(field, value);
    }, [autoSaveMeasurementField]);

    // Room assignment handler
    const handleRoomChange = async (roomId) => {
        const newRoomId = roomId || null;
        setSaving(true);
        try {
            await supabase
                .from('project_shades')
                .update({ room_id: newRoomId, updated_at: new Date().toISOString() })
                .eq('id', shadeId);
            setShade(prev => ({
                ...prev,
                room_id: newRoomId,
                room: rooms.find(r => r.id === newRoomId) || null
            }));
        } catch (err) {
            console.error('[ShadeDetailPage] Failed to update room:', err);
        } finally {
            setSaving(false);
        }
    };

    // Header field handlers
    const handleHeaderMountTypeChange = (value) => {
        setHeaderMountType(value);
        autoSaveShadeField('mount_type', value);
    };

    const handleHeaderHeadrailStyleChange = (value) => {
        setHeaderHeadrailStyle(value);
        autoSaveShadeField('headrail_style', value);
    };

    // Pocket field handlers (debounced with pending tracking)
    const handlePocketChange = useCallback((field, value) => {
        if (field === 'width') setPocketWidth(value);
        if (field === 'height') setPocketHeight(value);
        if (field === 'depth') setPocketDepth(value);

        const dbField = `pocket_${field}`;
        pendingSavesRef.current.set(dbField, value);

        if (pocketTimerRef.current) clearTimeout(pocketTimerRef.current);
        pocketTimerRef.current = setTimeout(() => {
            pendingSavesRef.current.delete(dbField);
            autoSaveShadeField(dbField, value);
        }, 500);
    }, [autoSaveShadeField]);

    // Installation notes handler (debounced with pending tracking)
    const handleInstallationNotesChange = useCallback((value) => {
        setInstallationNotes(value);
        pendingSavesRef.current.set('install_instructions', value);

        if (installationNotesTimerRef.current) clearTimeout(installationNotesTimerRef.current);
        installationNotesTimerRef.current = setTimeout(() => {
            pendingSavesRef.current.delete('install_instructions');
            autoSaveShadeField('install_instructions', value);
        }, 500);
    }, [autoSaveShadeField]);

    // Final dimension handlers (debounced with pending tracking)
    const handleOrderedWidthChange = useCallback((value) => {
        setOrderedWidth(value);
        pendingSavesRef.current.set('ordered_width', value);

        if (orderedWidthTimerRef.current) clearTimeout(orderedWidthTimerRef.current);
        orderedWidthTimerRef.current = setTimeout(() => {
            pendingSavesRef.current.delete('ordered_width');
            autoSaveShadeField('ordered_width', value);
        }, 500);
    }, [autoSaveShadeField]);

    const handleOrderedHeightChange = useCallback((value) => {
        setOrderedHeight(value);
        pendingSavesRef.current.set('ordered_height', value);

        if (orderedHeightTimerRef.current) clearTimeout(orderedHeightTimerRef.current);
        orderedHeightTimerRef.current = setTimeout(() => {
            pendingSavesRef.current.delete('ordered_height');
            autoSaveShadeField('ordered_height', value);
        }, 500);
    }, [autoSaveShadeField]);

    const handleOrderedDepthChange = useCallback((value) => {
        setOrderedDepth(value);
        pendingSavesRef.current.set('ordered_depth', value);

        if (orderedDepthTimerRef.current) clearTimeout(orderedDepthTimerRef.current);
        orderedDepthTimerRef.current = setTimeout(() => {
            pendingSavesRef.current.delete('ordered_depth');
            autoSaveShadeField('ordered_depth', value);
        }, 500);
    }, [autoSaveShadeField]);

    // Validate dimensions
    const handleValidateDimensions = async () => {
        if (!orderedWidth || !orderedHeight) {
            alert('Please enter both width and height before validating.');
            return;
        }
        setSaving(true);
        try {
            await supabase
                .from('project_shades')
                .update({
                    dimensions_validated: true,
                    dimensions_validated_at: new Date().toISOString(),
                    dimensions_validated_by: user?.id,
                    updated_at: new Date().toISOString()
                })
                .eq('id', shadeId);
            setDimensionsValidated(true);
            setShade(prev => ({ ...prev, dimensions_validated: true }));
        } catch (err) {
            console.error('[ShadeDetailPage] Failed to validate dimensions:', err);
            alert('Failed to validate dimensions');
        } finally {
            setSaving(false);
        }
    };

    // Apply calculated dimension
    const applyCalculatedWidth = () => {
        if (calculatedDimensions.width) {
            handleOrderedWidthChange(calculatedDimensions.width.toString());
        }
    };

    const applyCalculatedHeight = () => {
        if (calculatedDimensions.height) {
            handleOrderedHeightChange(calculatedDimensions.height.toString());
        }
    };

    // Photo upload
    const handlePhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setUploading(true);
            const newPhoto = await shadePhotoService.uploadPhoto({
                shadeId,
                projectId,
                measurementSet: 'install', // Mark as install photo
                file,
                user: { id: user?.id, name: user?.name || user?.displayName }
            });

            setPhotos(prev => [...prev, newPhoto]);
        } catch (err) {
            console.error('[ShadeDetailPage] Upload failed:', err);
            alert('Failed to upload photo: ' + err.message);
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    // Photo viewer handlers
    const openPhotoFullscreen = (photo) => {
        const payload = shadePhotoService.buildPhotoViewerPayload(photo);
        openPhotoViewer(payload, {
            canEdit: true,
            replaceMode: 'file',
            loading: photoLoading === photo.id,
            onReplace: (file) => handleReplacePhoto(photo.id, file),
            onDelete: () => handleDeletePhoto(photo.id)
        });
    };

    const handleReplacePhoto = async (photoId, file) => {
        try {
            setPhotoLoading(photoId);
            updatePhotoViewerOptions({ loading: true });

            const updatedPhoto = await shadePhotoService.replacePhoto(photoId, file, {
                id: user?.id,
                name: user?.name || user?.displayName
            });

            setPhotos(prev => prev.map(p => p.id === photoId ? updatedPhoto : p));

            const payload = shadePhotoService.buildPhotoViewerPayload(updatedPhoto);
            openPhotoViewer(payload, {
                canEdit: true,
                replaceMode: 'file',
                loading: false,
                onReplace: (newFile) => handleReplacePhoto(photoId, newFile),
                onDelete: () => handleDeletePhoto(photoId)
            });
        } catch (err) {
            console.error('[ShadeDetailPage] Replace failed:', err);
            alert('Failed to replace photo: ' + err.message);
        } finally {
            setPhotoLoading(null);
            updatePhotoViewerOptions({ loading: false });
        }
    };

    const handleDeletePhoto = async (photoId) => {
        const confirmed = window.confirm('Delete this photo?');
        if (!confirmed) return;

        try {
            setPhotoLoading(photoId);
            updatePhotoViewerOptions({ loading: true });

            await shadePhotoService.deletePhoto(photoId, { id: user?.id });
            setPhotos(prev => prev.filter(p => p.id !== photoId));
            closePhotoViewer();
        } catch (err) {
            console.error('[ShadeDetailPage] Delete failed:', err);
            alert('Failed to delete photo: ' + err.message);
        } finally {
            setPhotoLoading(null);
            updatePhotoViewerOptions({ loading: false });
        }
    };

    // Mark/unmark measurement complete
    const [markingComplete, setMarkingComplete] = useState(false);

    const handleMarkComplete = async () => {
        const isCurrentlyComplete = shade?.[`${activeTab}_complete`];

        try {
            setMarkingComplete(true);

            const updates = isCurrentlyComplete
                ? {
                    [`${activeTab}_complete`]: false,
                    [`${activeTab}_date`]: null,
                    [`${activeTab}_by`]: null,
                    updated_at: new Date().toISOString()
                }
                : {
                    [`${activeTab}_complete`]: true,
                    [`${activeTab}_date`]: new Date().toISOString(),
                    [`${activeTab}_by`]: user?.id,
                    updated_at: new Date().toISOString()
                };

            const { error } = await supabase
                .from('project_shades')
                .update(updates)
                .eq('id', shadeId);

            if (error) throw error;

            await loadShade();
        } catch (err) {
            console.error('[ShadeDetailPage] Mark complete failed:', err);
            alert('Failed to update: ' + err.message);
        } finally {
            setMarkingComplete(false);
        }
    };

    // Design Review - Send to designer
    const handleDesignerChange = async (newId) => {
        setSelectedDesignerId(newId);
        try {
            await supabase
                .from('project_shades')
                .update({ designer_stakeholder_id: newId, updated_at: new Date().toISOString() })
                .eq('id', shadeId);
        } catch (e) {
            console.error('Failed to assign designer:', e);
        }
    };

    const handleSendToReview = async () => {
        if (!selectedDesignerId) {
            alert('Please select a designer first.');
            return;
        }
        setSendingReview(true);
        try {
            const selectedDesigner = designers.find(d =>
                (d.assignment_id === selectedDesignerId) || (d.id === selectedDesignerId)
            );

            if (!selectedDesigner?.email) {
                throw new Error('Selected designer does not have an email address.');
            }

            // Update status
            await projectShadeService.sendToDesignReview(projectId, selectedDesignerId, user.id);

            // Generate portal link
            let portalUrl = null;
            let otp = null;

            try {
                const linkResult = await shadePublicAccessService.ensureLink({
                    projectId,
                    stakeholderId: selectedDesignerId,
                    stakeholder: selectedDesigner,
                    forceRegenerate: true
                });

                if (linkResult.token) {
                    portalUrl = shadePublicAccessService.buildPortalUrl(linkResult.token);
                    otp = linkResult.otp;
                }
            } catch (linkError) {
                console.error('[ShadeDetailPage] Failed to generate portal link:', linkError);
            }

            // Send email
            const graphToken = await acquireToken();
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

            alert('Review request sent to designer!');
            await loadShade();
        } catch (e) {
            console.error('Send review failed:', e);
            alert('Failed to send review: ' + e.message);
        } finally {
            setSendingReview(false);
        }
    };

    // Submit comment
    const handleSubmitComment = async () => {
        if (!newComment.trim() || submittingComment) return;
        setSubmittingComment(true);
        try {
            const { data, error: insertError } = await supabase
                .from('shade_comments')
                .insert([{
                    shade_id: shadeId,
                    project_id: projectId,
                    comment_text: newComment.trim(),
                    is_internal: true,
                    author_id: user?.id,
                    author_name: user?.name || user?.displayName || 'Staff',
                    author_email: user?.email
                }])
                .select()
                .single();
            if (insertError) throw insertError;
            setComments(prev => [...prev, data]);
            setNewComment('');
        } catch (err) {
            console.error('[ShadeDetailPage] Failed to add comment:', err);
            alert('Failed to add comment: ' + err.message);
        } finally {
            setSubmittingComment(false);
        }
    };

    // Loading state
    if (loading) {
        return (
            <div className={`min-h-screen flex items-center justify-center ${mode === 'dark' ? 'bg-zinc-900' : 'bg-zinc-50'}`}>
                <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className={`min-h-screen flex flex-col items-center justify-center gap-4 ${mode === 'dark' ? 'bg-zinc-900' : 'bg-zinc-50'}`}>
                <p className="text-red-500">{error}</p>
                <Button variant="secondary" onClick={() => navigate(-1)}>Go Back</Button>
            </div>
        );
    }

    const showBlinded = (activeTab === 'm1' && isM1Blind) || (activeTab === 'm2' && isM2Blind);

    // Get status color for calculated dimensions
    const getStatusColor = (status) => {
        if (status === 'exact') return brandColors.success; // Green
        if (status === 'review') return '#F59E0B'; // Amber
        return '#6B7280'; // Gray for pending/partial
    };

    const getStatusBg = (status, isDark) => {
        if (status === 'exact') return isDark ? 'bg-green-900/30' : 'bg-green-50';
        if (status === 'review') return isDark ? 'bg-amber-900/30' : 'bg-amber-50';
        return isDark ? 'bg-zinc-800' : 'bg-zinc-100';
    };

    return (
        <div className={`min-h-screen ${mode === 'dark' ? 'bg-zinc-900' : 'bg-zinc-50'}`}>
            {/* Fixed Header */}
            <div className={`sticky top-0 z-10 border-b ${mode === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'}`}>
                <div className="max-w-4xl mx-auto px-4 py-3">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate(`/projects/${projectId}/shades`)}
                            className={`p-2 rounded-lg transition-colors ${mode === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div className="flex-1 min-w-0">
                            <h1 className={`text-lg font-semibold truncate ${mode === 'dark' ? 'text-zinc-100' : 'text-zinc-900'}`}>
                                {shade?.shade_name || shade?.name}
                            </h1>
                            <div className="flex items-center gap-2">
                                <select
                                    value={shade?.room_id || ''}
                                    onChange={(e) => handleRoomChange(e.target.value)}
                                    className={`text-sm px-2 py-0.5 rounded border ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-zinc-300' : 'bg-white border-zinc-300 text-zinc-700'}`}
                                    style={{ fontSize: '14px' }}
                                >
                                    <option value="">Unassigned</option>
                                    {rooms.map(room => (
                                        <option key={room.id} value={room.id}>{room.name}</option>
                                    ))}
                                </select>
                                <span className={`text-sm ${mode === 'dark' ? 'text-zinc-400' : 'text-zinc-500'}`}>•</span>
                                <span className="text-sm text-violet-500">{shade?.technology}</span>
                            </div>
                        </div>
                        {saving && (
                            <div className={`text-xs px-2 py-1 rounded flex-shrink-0 flex items-center gap-1 ${mode === 'dark' ? 'bg-zinc-700 text-zinc-300' : 'bg-zinc-200 text-zinc-600'}`}>
                                <Loader2 size={12} className="animate-spin" />
                                Saving
                            </div>
                        )}
                        {dimensionsValidated && (
                            <div className="text-xs px-2 py-1 rounded flex-shrink-0 flex items-center gap-1" style={{ backgroundColor: 'rgba(148, 175, 50, 0.15)', color: brandColors.success }}>
                                <CheckCircle size={12} />
                                Validated
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="max-w-4xl mx-auto px-4 py-4 space-y-4 pb-8">

                {/* Section 1: Quoted Specs */}
                <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-blue-50/50 border-blue-100'}`}>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                        <div>
                            <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-1">Quoted Width</span>
                            <span className={`font-medium ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>{shade?.quoted_width || '-'}"</span>
                        </div>
                        <div>
                            <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-1">Quoted Height</span>
                            <span className={`font-medium ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-900'}`}>{shade?.quoted_height || '-'}"</span>
                        </div>
                        <div className="col-span-2">
                            <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-1">Fabric</span>
                            {shade?.fabric_selection ? (
                                <a
                                    href={`https://www.lutronfabrics.com/us/en/search/results?q=${encodeURIComponent(shade.fabric_selection)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`font-medium hover:underline flex items-center gap-1 ${mode === 'dark' ? 'text-violet-400' : 'text-violet-600'}`}
                                >
                                    {shade.fabric_selection}
                                    <ExternalLink size={12} />
                                </a>
                            ) : (
                                <span className="text-zinc-400">Not Selected</span>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <span className="text-xs text-zinc-400 uppercase tracking-wider block mb-1">Mount Type</span>
                            <select
                                value={headerMountType}
                                onChange={(e) => handleHeaderMountTypeChange(e.target.value)}
                                className={`w-full px-3 py-2 rounded-lg border text-sm ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-white border-zinc-300 text-zinc-900'}`}
                                style={{ fontSize: '16px' }}
                            >
                                <option value="">Select...</option>
                                {MOUNT_TYPES.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-xs text-zinc-400 uppercase tracking-wider">Headrail</span>
                                <button
                                    type="button"
                                    onClick={() => setShowHeadrailInfo(true)}
                                    className="p-0.5 rounded-full text-zinc-400 hover:text-zinc-600"
                                >
                                    <Info size={14} />
                                </button>
                            </div>
                            <select
                                value={headerHeadrailStyle}
                                onChange={(e) => handleHeaderHeadrailStyleChange(e.target.value)}
                                className={`w-full px-3 py-2 rounded-lg border text-sm ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-white border-zinc-300 text-zinc-900'}`}
                                style={{ fontSize: '16px' }}
                            >
                                <option value="">Select...</option>
                                {HEADRAIL_STYLES.map(style => (
                                    <option key={style} value={style}>{style}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Section 2: Pocket Dimensions (shade-level) */}
                <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-zinc-50 border-zinc-200'}`}>
                    <h4 className={`text-sm font-semibold mb-3 ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>Pocket Dimensions</h4>
                    <div className="grid grid-cols-3 gap-3">
                        <InputField label="Width" value={pocketWidth} onChange={(v) => handlePocketChange('width', v)} mode={mode} />
                        <InputField label="Height" value={pocketHeight} onChange={(v) => handlePocketChange('height', v)} mode={mode} />
                        <InputField label="Depth" value={pocketDepth} onChange={(v) => handlePocketChange('depth', v)} mode={mode} />
                    </div>
                </div>

                {/* Section 3: Installation Notes (shade-level) */}
                <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-zinc-50 border-zinc-200'}`}>
                    <h4 className={`text-sm font-semibold mb-3 ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>Installation Notes</h4>
                    <textarea
                        value={installationNotes}
                        onChange={e => handleInstallationNotesChange(e.target.value)}
                        rows={2}
                        placeholder="General installation notes, special instructions..."
                        className={`w-full px-3 py-2 rounded-lg border ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-zinc-100' : 'bg-white border-zinc-300 text-zinc-900'}`}
                        style={{ fontSize: '16px' }}
                    />
                </div>

                {/* Section 4: Install Photos */}
                <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                    <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>
                        <Camera size={16} /> Install Photos
                    </h4>
                    <div className="space-y-3">
                        {photos.length > 0 && (
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                {photos.map((photo) => (
                                    <button
                                        key={photo.id}
                                        onClick={() => openPhotoFullscreen(photo)}
                                        className={`relative aspect-square rounded-lg overflow-hidden border transition-all hover:ring-2 hover:ring-violet-500 ${mode === 'dark' ? 'bg-zinc-800 border-zinc-700' : 'bg-zinc-100 border-zinc-200'}`}
                                    >
                                        <CachedSharePointImage
                                            sharePointUrl={photo.photo_url}
                                            sharePointDriveId={photo.sharepoint_drive_id}
                                            sharePointItemId={photo.sharepoint_item_id}
                                            displayType="thumbnail"
                                            className="w-full h-full object-cover"
                                            alt={photo.file_name || 'Photo'}
                                        />
                                        {photoLoading === photo.id && (
                                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                <Loader2 className="w-5 h-5 animate-spin text-white" />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                        <label className={`flex items-center justify-center gap-2 w-full p-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${mode === 'dark' ? 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800' : 'border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50'}`}>
                            {uploading ? (
                                <>
                                    <Loader2 size={18} className="animate-spin text-violet-500" />
                                    <span className="text-sm text-zinc-500">Uploading...</span>
                                </>
                            ) : (
                                <>
                                    <Plus size={18} className="text-zinc-400" />
                                    <span className="text-sm text-zinc-500">Add Photo</span>
                                </>
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={handlePhotoUpload}
                                disabled={uploading}
                            />
                        </label>
                    </div>
                </div>

                {/* Section 5: Measurement Tabs (M1/M2) */}
                <div className={`rounded-xl border overflow-hidden ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                    {/* Tab Headers */}
                    <div className={`flex border-b ${mode === 'dark' ? 'border-zinc-700' : 'border-zinc-200'}`}>
                        <button
                            onClick={() => setActiveTab('m1')}
                            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'm1'
                                ? 'border-violet-500 text-violet-500'
                                : 'border-transparent text-zinc-500'
                            }`}
                        >
                            <span className="flex items-center justify-center gap-1">
                                Measure 1
                                {shade?.m1_complete && <CheckCircle size={14} style={{ color: brandColors.success }} />}
                                {isM1Blind && <Lock size={14} className="text-zinc-400" />}
                            </span>
                        </button>
                        <button
                            onClick={() => setActiveTab('m2')}
                            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'm2'
                                ? 'border-violet-500 text-violet-500'
                                : 'border-transparent text-zinc-500'
                            }`}
                        >
                            <span className="flex items-center justify-center gap-1">
                                Measure 2
                                {shade?.m2_complete && <CheckCircle size={14} style={{ color: brandColors.success }} />}
                                {isM2Blind && <Lock size={14} className="text-zinc-400" />}
                            </span>
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="p-4">
                        {showBlinded ? (
                            <div className="py-8 text-center">
                                <Lock size={32} className="mx-auto text-zinc-300 mb-2" />
                                <p className="text-zinc-500 text-sm">Data masked for blind verification</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Width measurements */}
                                <div>
                                    <p className={`text-xs uppercase font-medium mb-2 ${mode === 'dark' ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                        Rough Opening Width
                                    </p>
                                    <div className="grid grid-cols-3 gap-3">
                                        <InputField label="Top" value={formData.widthTop} onChange={(v) => handleMeasurementChange('widthTop', v)} mode={mode} />
                                        <InputField label="Middle" value={formData.widthMiddle} onChange={(v) => handleMeasurementChange('widthMiddle', v)} mode={mode} />
                                        <InputField label="Bottom" value={formData.widthBottom} onChange={(v) => handleMeasurementChange('widthBottom', v)} mode={mode} />
                                    </div>
                                </div>

                                {/* Height and Mount Depth */}
                                <div className="grid grid-cols-2 gap-3">
                                    <InputField label="Height" value={formData.height} onChange={(v) => handleMeasurementChange('height', v)} mode={mode} />
                                    <InputField label="Mount Depth" value={formData.mountDepth} onChange={(v) => handleMeasurementChange('mountDepth', v)} mode={mode} />
                                </div>

                                {/* Obstruction Notes */}
                                <div>
                                    <label className="block text-xs font-medium mb-1 text-zinc-500">Obstruction Notes</label>
                                    <textarea
                                        value={formData.obstructionNotes}
                                        onChange={e => handleMeasurementChange('obstructionNotes', e.target.value)}
                                        rows={2}
                                        placeholder="Note any obstructions, wiring, or issues..."
                                        className={`w-full px-3 py-2 rounded-lg border ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-zinc-100' : 'bg-white border-zinc-300 text-zinc-900'}`}
                                        style={{ fontSize: '16px' }}
                                    />
                                </div>

                                {/* Mark Complete Button */}
                                <button
                                    onClick={handleMarkComplete}
                                    disabled={markingComplete}
                                    className={`w-full mt-4 py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                                        shade?.[`${activeTab}_complete`]
                                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
                                            : 'bg-violet-500 hover:bg-violet-600 text-white'
                                    } ${markingComplete ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                    {markingComplete ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                        <CheckCircle size={18} />
                                    )}
                                    {shade?.[`${activeTab}_complete`]
                                        ? `${activeTab === 'm1' ? 'M1' : 'M2'} Complete (tap to undo)`
                                        : `Mark ${activeTab === 'm1' ? 'M1' : 'M2'} Complete`
                                    }
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Section 6: Final Ordered Dimensions (with auto-calculation) */}
                <div className={`p-4 rounded-xl border ${mode === 'dark' ? 'bg-violet-900/10 border-violet-800/30' : 'bg-violet-50 border-violet-100'}`}>
                    <h4 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${mode === 'dark' ? 'text-violet-300' : 'text-violet-700'}`}>
                        <Ruler size={16} /> Final Ordered Dimensions
                    </h4>

                    {/* Auto-calculated suggestions */}
                    {(calculatedDimensions.width || calculatedDimensions.height) && (
                        <div className={`mb-4 p-3 rounded-lg ${mode === 'dark' ? 'bg-zinc-800' : 'bg-white'}`}>
                            <p className="text-xs text-zinc-500 uppercase font-medium mb-2">Auto-Calculated from M1 & M2</p>
                            <div className="flex flex-wrap gap-3">
                                {calculatedDimensions.width && (
                                    <button
                                        onClick={applyCalculatedWidth}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${getStatusBg(calculatedDimensions.widthStatus, mode === 'dark')}`}
                                        style={{ borderColor: getStatusColor(calculatedDimensions.widthStatus) }}
                                    >
                                        <span className="text-xs text-zinc-500">Width:</span>
                                        <span className="font-semibold" style={{ color: getStatusColor(calculatedDimensions.widthStatus) }}>
                                            {calculatedDimensions.width}"
                                        </span>
                                        {calculatedDimensions.widthStatus === 'exact' && <CheckCircle size={14} style={{ color: brandColors.success }} />}
                                        {calculatedDimensions.widthStatus === 'review' && <AlertTriangle size={14} className="text-amber-500" />}
                                        <span className="text-xs text-zinc-400">Click to apply</span>
                                    </button>
                                )}
                                {calculatedDimensions.height && (
                                    <button
                                        onClick={applyCalculatedHeight}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${getStatusBg(calculatedDimensions.heightStatus, mode === 'dark')}`}
                                        style={{ borderColor: getStatusColor(calculatedDimensions.heightStatus) }}
                                    >
                                        <span className="text-xs text-zinc-500">Height:</span>
                                        <span className="font-semibold" style={{ color: getStatusColor(calculatedDimensions.heightStatus) }}>
                                            {calculatedDimensions.height}"
                                        </span>
                                        {calculatedDimensions.heightStatus === 'exact' && <CheckCircle size={14} style={{ color: brandColors.success }} />}
                                        {calculatedDimensions.heightStatus === 'review' && <AlertTriangle size={14} className="text-amber-500" />}
                                        <span className="text-xs text-zinc-400">Click to apply</span>
                                    </button>
                                )}
                            </div>
                            {(calculatedDimensions.widthStatus === 'review' || calculatedDimensions.heightStatus === 'review') && (
                                <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                                    <AlertTriangle size={12} />
                                    Measurements differ between M1 and M2 - manual review recommended
                                </p>
                            )}
                        </div>
                    )}

                    {/* Manual input fields */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        <InputField label="Width" value={orderedWidth} onChange={handleOrderedWidthChange} mode={mode} highlight />
                        <InputField label="Height" value={orderedHeight} onChange={handleOrderedHeightChange} mode={mode} highlight />
                        <InputField label="Depth" value={orderedDepth} onChange={handleOrderedDepthChange} mode={mode} highlight />
                    </div>

                    {/* Validate button */}
                    <button
                        onClick={handleValidateDimensions}
                        disabled={!orderedWidth || !orderedHeight || dimensionsValidated}
                        className={`w-full py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                            dimensionsValidated
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                : 'bg-violet-500 hover:bg-violet-600 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                        }`}
                    >
                        <CheckCircle size={18} />
                        {dimensionsValidated ? 'Dimensions Validated' : 'Validate Dimensions for Order'}
                    </button>
                </div>

                {/* Section 7: Design Review (Collapsible - at bottom) */}
                <div className={`rounded-xl border overflow-hidden ${mode === 'dark' ? 'bg-zinc-800/50 border-zinc-700' : 'bg-white border-zinc-200'}`}>
                    <button
                        onClick={() => setDesignReviewExpanded(!designReviewExpanded)}
                        className={`w-full p-4 flex items-center justify-between transition-colors ${mode === 'dark' ? 'hover:bg-zinc-800' : 'hover:bg-zinc-50'}`}
                    >
                        <div className="flex items-center gap-2">
                            <UserCheck size={16} className="text-zinc-400" />
                            <span className={`text-sm font-semibold ${mode === 'dark' ? 'text-zinc-200' : 'text-zinc-700'}`}>
                                Design Review
                            </span>
                            {shade?.design_review_status === 'sent' && (
                                <span className="px-1.5 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">Pending</span>
                            )}
                            {shade?.design_review_status === 'approved' && (
                                <span className="px-1.5 py-0.5 text-xs rounded-full" style={{ backgroundColor: 'rgba(148, 175, 50, 0.15)', color: brandColors.success }}>Approved</span>
                            )}
                            {comments.length > 0 && (
                                <span className="px-1.5 py-0.5 text-xs rounded-full bg-violet-100 text-violet-600">{comments.length}</span>
                            )}
                        </div>
                        {designReviewExpanded ? <ChevronDown size={18} className="text-zinc-400" /> : <ChevronRight size={18} className="text-zinc-400" />}
                    </button>

                    {designReviewExpanded && (
                        <div className={`p-4 pt-0 space-y-4 border-t ${mode === 'dark' ? 'border-zinc-700' : 'border-zinc-200'}`}>
                            {/* Designer Selection */}
                            <div>
                                <label className="block text-xs font-medium mb-2 text-zinc-500">Designer Stakeholder</label>
                                <select
                                    value={selectedDesignerId || ''}
                                    onChange={(e) => handleDesignerChange(e.target.value || null)}
                                    className={`w-full px-3 py-2 rounded-lg border ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-white border-zinc-300 text-zinc-900'}`}
                                    style={{ fontSize: '16px' }}
                                >
                                    <option value="">Select Designer...</option>
                                    {designers.map(d => {
                                        const id = d.assignment_id || d.id;
                                        const isInternal = d.category === 'internal';
                                        return (
                                            <option key={id} value={id}>
                                                {d.contact_name} ({d.role_name}) - {isInternal ? 'Internal' : 'External'}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>

                            {/* Send for Review Button */}
                            <Button
                                variant="primary"
                                icon={Send}
                                onClick={handleSendToReview}
                                disabled={!selectedDesignerId || sendingReview}
                                className="w-full"
                            >
                                {sendingReview ? 'Sending...' : 'Send for Design Review'}
                            </Button>

                            {/* Comments Section */}
                            <div className={`pt-4 border-t ${mode === 'dark' ? 'border-zinc-700' : 'border-zinc-200'}`}>
                                <div className="flex items-center gap-2 mb-3">
                                    <MessageSquare size={14} className="text-zinc-400" />
                                    <span className="text-xs font-semibold text-zinc-500">Comments</span>
                                </div>

                                {loadingComments ? (
                                    <div className="py-4 text-center text-zinc-400">Loading...</div>
                                ) : comments.length === 0 ? (
                                    <div className="py-4 text-center text-zinc-400 text-sm">No comments yet</div>
                                ) : (
                                    <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                                        {comments.map(comment => (
                                            <div
                                                key={comment.id}
                                                className={`p-2 rounded-lg text-sm ${comment.is_internal === false
                                                    ? 'bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-500/30'
                                                    : mode === 'dark' ? 'bg-zinc-900' : 'bg-zinc-50'
                                                }`}
                                            >
                                                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                                                    <span>{comment.author_name}</span>
                                                    <span>{new Date(comment.created_at).toLocaleDateString()}</span>
                                                </div>
                                                <p className={mode === 'dark' ? 'text-zinc-300' : 'text-zinc-600'}>{comment.comment_text}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Add Comment */}
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        placeholder="Add a comment..."
                                        className={`flex-1 px-3 py-2 rounded-lg border ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-zinc-100' : 'bg-white border-zinc-300 text-zinc-900'}`}
                                        style={{ fontSize: '16px' }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                handleSubmitComment();
                                            }
                                        }}
                                    />
                                    <button
                                        onClick={handleSubmitComment}
                                        disabled={!newComment.trim() || submittingComment}
                                        className="px-3 py-2 bg-violet-500 text-white rounded-lg disabled:opacity-50"
                                    >
                                        <Send size={16} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Headrail Style Info Modal */}
            {showHeadrailInfo && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowHeadrailInfo(false)}
                >
                    <div
                        className={`relative max-w-2xl w-full rounded-2xl shadow-xl overflow-hidden ${mode === 'dark' ? 'bg-zinc-900' : 'bg-white'}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={`flex items-center justify-between p-4 border-b ${mode === 'dark' ? 'border-zinc-700' : 'border-zinc-200'}`}>
                            <h3 className={`text-lg font-semibold ${mode === 'dark' ? 'text-zinc-100' : 'text-zinc-900'}`}>
                                Headrail Style Options
                            </h3>
                            <button
                                onClick={() => setShowHeadrailInfo(false)}
                                className={`p-2 rounded-full transition-colors ${mode === 'dark' ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
                            >
                                <ArrowLeft size={20} />
                            </button>
                        </div>
                        <div className="p-4 max-h-[70vh] overflow-y-auto">
                            <img
                                src="/images/headrail-styles.png"
                                alt="Headrail Style Options"
                                className="w-full h-auto max-h-[65vh] object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Reusable input field component
const InputField = ({ label, value, onChange, mode, highlight }) => (
    <div>
        <label className="block text-xs font-medium mb-1 text-zinc-500">{label}</label>
        <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={e => onChange(e.target.value)}
            className={`w-full px-3 py-2 rounded-lg border text-sm ${highlight
                ? 'font-semibold border-violet-300 dark:border-violet-600'
                : ''
            } ${mode === 'dark' ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-white border-zinc-300 text-zinc-900'}`}
            style={{ fontSize: '16px' }}
        />
    </div>
);

export default ShadeDetailPage;
