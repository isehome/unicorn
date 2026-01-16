/**
 * PartsReceivingPageNew.js
 *
 * ACTIVE COMPONENT - Currently loaded by route: /projects/:projectId/receiving
 * Route location: src/App.js
 *
 * Purpose: Manage receiving of parts/equipment from purchase orders
 * - Displays outstanding and completed purchase orders
 * - Allows receiving individual line items or full POs
 * - Auto-completes prep milestones (prewire_prep/trim_prep) when all items are ordered & received
 * - Filters by phase (prewire/trim/all)
 *
 * Related files:
 * - PartsReceivingPage.js (DEPRECATED - DO NOT USE)
 *
 * Last updated: 2025-01-24
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useAppState } from '../contexts/AppStateContext';
import { enhancedStyles } from '../styles/styleSystem';
import { milestoneService } from '../services/milestoneService';
import { milestoneCacheService } from '../services/milestoneCacheService';
import { supabase } from '../lib/supabase';
import Button from './ui/Button';
import DateField from './ui/DateField';
import {
  CheckCircle,
  Loader,
  PackageCheck,
  ChevronDown,
  ChevronRight,
  Truck,
  AlertTriangle,
  Blinds
} from 'lucide-react';

const PartsReceivingPageNew = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { mode } = useTheme();
  const { user, acquireToken } = useAuth();
  const { publishState, registerActions, unregisterActions } = useAppState();
  const sectionStyles = enhancedStyles.sections[mode];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [expandedPOs, setExpandedPOs] = useState(new Set());
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [phaseFilter, setPhaseFilter] = useState('all'); // 'all', 'prewire', 'trim'
  const [issueModal, setIssueModal] = useState({ isOpen: false, poInfo: null });
  const [issueDescription, setIssueDescription] = useState('');
  const [selectedPartId, setSelectedPartId] = useState(''); // Optional part reference for issue
  const [submittingIssue, setSubmittingIssue] = useState(false);
  const [openIssuesByPO, setOpenIssuesByPO] = useState({}); // Track open issues by PO number

  // Shade receiving state
  const [shades, setShades] = useState([]);
  const [shadesExpanded, setShadesExpanded] = useState(true);
  const [savingShadeId, setSavingShadeId] = useState(null);

  useEffect(() => {
    if (projectId) {
      loadPurchaseOrders();
      loadShades();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]); // Load functions are defined below and stable

  // ══════════════════════════════════════════════════════════════
  // AI VOICE COPILOT INTEGRATION
  // ══════════════════════════════════════════════════════════════

  // Publish state for AI awareness
  useEffect(() => {
    // Calculate stats
    const pendingPOs = purchaseOrders.filter(po => {
      const items = po.items || [];
      const totalOrdered = items.reduce((sum, item) => sum + (item.quantity_ordered || 0), 0);
      const totalReceived = items.reduce((sum, item) => sum + (item.quantity_received || 0), 0);
      return totalReceived < totalOrdered;
    });
    const completedPOs = purchaseOrders.filter(po => {
      const items = po.items || [];
      const totalOrdered = items.reduce((sum, item) => sum + (item.quantity_ordered || 0), 0);
      const totalReceived = items.reduce((sum, item) => sum + (item.quantity_received || 0), 0);
      return totalOrdered > 0 && totalReceived >= totalOrdered;
    });
    const pendingShades = shades.filter(s => !s.received);
    const receivedShades = shades.filter(s => s.received);

    publishState({
      view: 'parts-receiving',
      project: { id: projectId },
      phaseFilter: phaseFilter,
      stats: {
        totalPOs: purchaseOrders.length,
        pendingPOs: pendingPOs.length,
        completedPOs: completedPOs.length,
        totalShades: shades.length,
        pendingShades: pendingShades.length,
        receivedShades: receivedShades.length,
        openIssues: Object.values(openIssuesByPO).reduce((sum, issues) => sum + issues.length, 0)
      },
      pendingPOList: pendingPOs.slice(0, 10).map(po => ({
        id: po.id,
        poNumber: po.po_number,
        supplier: po.supplier?.name,
        itemCount: po.items?.length || 0
      })),
      hint: 'Parts receiving page. Shows purchase orders and shades awaiting receipt. Can filter by phase (prewire/trim), mark items received, report issues.'
    });
  }, [publishState, projectId, purchaseOrders, shades, phaseFilter, openIssuesByPO]);

  // Register actions for AI
  useEffect(() => {
    const actions = {
      search_parts: async ({ query }) => {
        // Find POs or items matching the query
        const matchingPOs = purchaseOrders.filter(po => {
          const poMatch = po.po_number?.toLowerCase().includes(query?.toLowerCase() || '');
          const supplierMatch = po.supplier?.name?.toLowerCase().includes(query?.toLowerCase() || '');
          const itemMatch = (po.items || []).some(item =>
            item.equipment?.part_number?.toLowerCase().includes(query?.toLowerCase() || '') ||
            item.equipment?.name?.toLowerCase().includes(query?.toLowerCase() || '')
          );
          return poMatch || supplierMatch || itemMatch;
        });

        if (matchingPOs.length > 0) {
          // Expand matching POs
          setExpandedPOs(prev => {
            const next = new Set(prev);
            matchingPOs.forEach(po => next.add(po.id));
            return next;
          });
          return {
            success: true,
            message: `Found ${matchingPOs.length} purchase order(s) matching "${query}"`,
            results: matchingPOs.map(po => ({ poNumber: po.po_number, supplier: po.supplier?.name }))
          };
        }
        return { success: false, error: `No purchase orders found matching "${query}"` };
      },

      mark_received: async ({ poNumber }) => {
        const po = purchaseOrders.find(p =>
          p.po_number?.toLowerCase() === poNumber?.toLowerCase()
        );
        if (po) {
          await handleReceiveAllPO(po);
          return { success: true, message: `Marked PO ${po.po_number} as fully received` };
        }
        return { success: false, error: `Purchase order "${poNumber}" not found` };
      },

      scan_barcode: async () => {
        // This would typically open a barcode scanner
        // For now, return instructions
        return {
          success: true,
          message: 'Barcode scanning is available through the device camera. Look for items by part number or PO number.'
        };
      },

      view_pending: async () => {
        // Collapse completed, expand pending
        const pendingPOs = purchaseOrders.filter(po => {
          const items = po.items || [];
          const totalOrdered = items.reduce((sum, item) => sum + (item.quantity_ordered || 0), 0);
          const totalReceived = items.reduce((sum, item) => sum + (item.quantity_received || 0), 0);
          return totalReceived < totalOrdered;
        });
        setExpandedPOs(new Set(pendingPOs.map(po => po.id)));
        return {
          success: true,
          message: `Showing ${pendingPOs.length} pending purchase order(s)`
        };
      },

      view_received: async () => {
        // Collapse pending, expand completed
        const completedPOs = purchaseOrders.filter(po => {
          const items = po.items || [];
          const totalOrdered = items.reduce((sum, item) => sum + (item.quantity_ordered || 0), 0);
          const totalReceived = items.reduce((sum, item) => sum + (item.quantity_received || 0), 0);
          return totalOrdered > 0 && totalReceived >= totalOrdered;
        });
        setExpandedPOs(new Set(completedPOs.map(po => po.id)));
        return {
          success: true,
          message: `Showing ${completedPOs.length} completed purchase order(s)`
        };
      },

      filter_phase: async ({ phase }) => {
        if (['all', 'prewire', 'trim'].includes(phase?.toLowerCase())) {
          setPhaseFilter(phase.toLowerCase());
          return { success: true, message: `Filtering by ${phase === 'all' ? 'all items' : phase + ' items'}` };
        }
        return { success: false, error: 'Invalid phase. Use: all, prewire, or trim' };
      },

      receive_all_shades: async () => {
        const unreceived = shades.filter(s => !s.received);
        if (unreceived.length === 0) {
          return { success: false, error: 'All shades are already received' };
        }
        await handleReceiveAllShades();
        return { success: true, message: `Marked ${unreceived.length} shades as received` };
      },

      toggle_shades_section: async () => {
        setShadesExpanded(prev => !prev);
        return { success: true, message: shadesExpanded ? 'Collapsed shades section' : 'Expanded shades section' };
      },

      list_pending_pos: async () => {
        const pendingPOs = purchaseOrders.filter(po => {
          const items = po.items || [];
          const totalOrdered = items.reduce((sum, item) => sum + (item.quantity_ordered || 0), 0);
          const totalReceived = items.reduce((sum, item) => sum + (item.quantity_received || 0), 0);
          return totalReceived < totalOrdered;
        });
        return {
          success: true,
          purchaseOrders: pendingPOs.map(po => ({
            poNumber: po.po_number,
            supplier: po.supplier?.name,
            itemCount: po.items?.length || 0
          })),
          count: pendingPOs.length
        };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerActions, unregisterActions, purchaseOrders, shades, phaseFilter, shadesExpanded]); // Handler functions are stable

  // Load shades that are ordered (for receiving)
  const loadShades = async () => {
    try {
      const { data, error } = await supabase
        .from('project_shades')
        .select(`
          *,
          room:rooms(name),
          shade_batch:project_shade_batches(original_filename)
        `)
        .eq('project_id', projectId)
        .eq('ordered', true)
        .order('room_id', { ascending: true })
        .order('shade_name', { ascending: true });

      if (error) throw error;
      setShades(data || []);
    } catch (err) {
      console.error('Failed to load shades:', err);
    }
  };

  // Mark shade as received
  const handleShadeReceived = async (shadeId, received) => {
    if (!user?.id) {
      setError('You must be logged in to receive shades.');
      return;
    }

    try {
      setSavingShadeId(shadeId);
      setError(null);

      const updateData = {
        received,
        received_at: received ? new Date().toISOString() : null,
        received_by: received ? user.id : null
      };

      const { error: updateError } = await supabase
        .from('project_shades')
        .update(updateData)
        .eq('id', shadeId);

      if (updateError) throw updateError;

      // Update local state
      setShades(prev => prev.map(s =>
        s.id === shadeId ? { ...s, ...updateData } : s
      ));

      setSuccessMessage(received ? 'Shade marked as received' : 'Shade marked as not received');
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      console.error('Failed to update shade:', err);
      setError(err.message || 'Failed to update shade');
    } finally {
      setSavingShadeId(null);
    }
  };

  // Receive all shades at once
  const handleReceiveAllShades = async () => {
    const unreceived = shades.filter(s => !s.received);
    if (unreceived.length === 0) return;

    if (!window.confirm(`Mark all ${unreceived.length} shades as received?`)) return;

    if (!user?.id) {
      setError('You must be logged in to receive shades.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('project_shades')
        .update({
          received: true,
          received_at: now,
          received_by: user.id
        })
        .eq('project_id', projectId)
        .eq('ordered', true)
        .eq('received', false);

      if (updateError) throw updateError;

      // Reload shades
      await loadShades();

      setSuccessMessage(`${unreceived.length} shades marked as received`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to receive all shades:', err);
      setError(err.message || 'Failed to receive shades');
    } finally {
      setSaving(false);
    }
  };

  const loadPurchaseOrders = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get all POs for this project with tracking info
      // Only show POs that have been submitted (exclude draft and cancelled)
      const { data: pos, error: poError } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          supplier:suppliers(name),
          items:purchase_order_items(
            *,
            equipment:project_equipment(
              id,
              name,
              part_number,
              description,
              planned_quantity,
              ordered_quantity,
              received_quantity,
              global_part:global_part_id(required_for_prewire)
            )
          ),
          tracking:shipment_tracking(
            id,
            tracking_number,
            carrier,
            carrier_service,
            status
          )
        `)
        .eq('project_id', projectId)
        .in('status', ['submitted', 'confirmed', 'partially_received', 'received'])
        .order('order_date', { ascending: false });

      if (poError) throw poError;

      setPurchaseOrders(pos || []);

      // Query for open receiving issues for this project
      // Issues created from receiving have titles like "Receiving Issue: ... (PO XXXXX)"
      const { data: openIssues } = await supabase
        .from('issues')
        .select('id, title, status')
        .eq('project_id', projectId)
        .like('title', 'Receiving Issue:%')
        .in('status', ['open', 'blocked']);

      // Map issues to their PO numbers
      const issuesByPO = {};
      (openIssues || []).forEach(issue => {
        // Extract PO number from title: "Receiving Issue: ... (PO XXXXX)"
        const match = issue.title.match(/\(PO\s+([^)]+)\)/);
        if (match) {
          const poNum = match[1];
          if (!issuesByPO[poNum]) issuesByPO[poNum] = [];
          issuesByPO[poNum].push(issue);
        }
      });
      setOpenIssuesByPO(issuesByPO);

      // Auto-expand outstanding POs
      const outstanding = (pos || []).filter(po => {
        const hasUnreceived = (po.items || []).some(item =>
          (item.quantity_received || 0) < (item.quantity_ordered || 0)
        );
        return hasUnreceived && po.status !== 'received';
      });
      setExpandedPOs(new Set(outstanding.map(po => po.id)));

    } catch (err) {
      console.error('Failed to load purchase orders:', err);
      setError('Failed to load purchase orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const togglePO = (poId) => {
    setExpandedPOs(prev => {
      const next = new Set(prev);
      if (next.has(poId)) {
        next.delete(poId);
      } else {
        next.add(poId);
      }
      return next;
    });
  };

  const handleUpdateReceived = async (lineItemId, projectEquipmentId, newQuantity) => {
    console.log('🚨 [PartsReceiving] handleUpdateReceived CALLED:', { lineItemId, projectEquipmentId, newQuantity, projectId });

    // CRITICAL: User must be authenticated - never allow updates without a real user
    if (!user?.id) {
      setError('You must be logged in to receive parts. Please refresh and try again.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Update purchase_order_items.quantity_received and track who received it
      const { error: updateError } = await supabase
        .from('purchase_order_items')
        .update({
          quantity_received: newQuantity,
          received_by: user.id,
          received_at: new Date().toISOString()
        })
        .eq('id', lineItemId);

      if (updateError) throw updateError;

      // Recalculate total received_quantity for project_equipment
      // Sum up all quantity_received from all PO line items for this equipment
      const { data: allItems, error: sumError } = await supabase
        .from('purchase_order_items')
        .select('quantity_received')
        .eq('project_equipment_id', projectEquipmentId);

      if (sumError) throw sumError;

      const totalReceived = (allItems || []).reduce(
        (sum, item) => sum + (item.quantity_received || 0),
        0
      );

      console.log('[PartsReceiving] Calculated total received for equipment:', { projectEquipmentId, totalReceived });

      // Get current equipment to check if this is first receipt
      const { data: currentEquip } = await supabase
        .from('project_equipment')
        .select('received_date')
        .eq('id', projectEquipmentId)
        .single();

      // Update project_equipment.received_quantity and track who received it
      // Only set received_date on FIRST receipt (preserve original date)
      const equipUpdate = {
        received_quantity: totalReceived,
        received_by: user.id
      };

      // Only set received_date if this is the first time receiving (no existing date)
      if (!currentEquip?.received_date && totalReceived > 0) {
        equipUpdate.received_date = new Date().toISOString();
      }

      const { error: equipError } = await supabase
        .from('project_equipment')
        .update(equipUpdate)
        .eq('id', projectEquipmentId);

      if (equipError) throw equipError;

      console.log('[PartsReceiving] ✅ Equipment receiving updated, now reloading POs...');

      // Reload data
      await loadPurchaseOrders();

      // Invalidate milestone cache to trigger recalculation
      milestoneCacheService.invalidate(projectId);
      console.log('[PartsReceiving] Invalidated milestone cache');

      // Check and auto-complete prep milestones if all items are received
      console.log('🚨 [PartsReceiving] About to call autoCompletePrepMilestones for project:', projectId);
      try {
        const result = await milestoneService.autoCompletePrepMilestones(projectId);
        console.log('🚨 [PartsReceiving] ✅ autoCompletePrepMilestones completed successfully:', result);
      } catch (milestoneErr) {
        console.error('🚨 [PartsReceiving] ❌ Failed to auto-complete prep milestones:', milestoneErr);
        console.error('🚨 [PartsReceiving] Error stack:', milestoneErr.stack);
        // Don't throw - receiving succeeded
      }

      setSuccessMessage('Received quantity updated');
      setTimeout(() => setSuccessMessage(null), 2000);

    } catch (err) {
      console.error('🚨 [PartsReceiving] ❌ Failed to update received quantity:', err);
      setError(err.message || 'Failed to update quantity');
    } finally {
      setSaving(false);
      console.log('[PartsReceiving] handleUpdateReceived FINISHED');
    }
  };

  const handleReceiveAllPO = async (po) => {
    if (!window.confirm(`Mark all items in PO ${po.po_number} as fully received?`)) return;

    // CRITICAL: User must be authenticated - never allow updates without a real user
    if (!user?.id) {
      setError('You must be logged in to receive parts. Please refresh and try again.');
      return;
    }

    console.log('🚨 [PartsReceiving] handleReceiveAllPO CALLED:', { poNumber: po.po_number, itemCount: po.items?.length, projectId });

    try {
      setSaving(true);
      setError(null);

      // Update all line items in this PO - do database updates directly to avoid nested setSaving calls
      console.log('[PartsReceiving] Processing all items in PO...');
      for (const item of po.items) {
        const lineItemId = item.id;
        const projectEquipmentId = item.project_equipment_id;
        const newQuantity = item.quantity_ordered;

        // Update purchase_order_items.quantity_received
        const { error: updateError } = await supabase
          .from('purchase_order_items')
          .update({
            quantity_received: newQuantity,
            received_by: user.id,
            received_at: new Date().toISOString()
          })
          .eq('id', lineItemId);

        if (updateError) throw updateError;

        // Recalculate total for equipment
        const { data: allItems, error: sumError } = await supabase
          .from('purchase_order_items')
          .select('quantity_received')
          .eq('project_equipment_id', projectEquipmentId);

        if (sumError) throw sumError;

        const totalReceived = (allItems || []).reduce(
          (sum, i) => sum + (i.quantity_received || 0),
          0
        );

        // Get current equipment to check if this is first receipt
        const { data: currentEquip } = await supabase
          .from('project_equipment')
          .select('received_date')
          .eq('id', projectEquipmentId)
          .single();

        // Update project_equipment - only set date on first receipt
        const equipUpdate = {
          received_quantity: totalReceived,
          received_by: user.id
        };

        if (!currentEquip?.received_date && totalReceived > 0) {
          equipUpdate.received_date = new Date().toISOString();
        }

        const { error: equipError } = await supabase
          .from('project_equipment')
          .update(equipUpdate)
          .eq('id', projectEquipmentId);

        if (equipError) throw equipError;
      }

      console.log('[PartsReceiving] All PO items processed');

      // Reload data once after all updates
      await loadPurchaseOrders();

      // Invalidate milestone cache
      milestoneCacheService.invalidate(projectId);

      // Check and auto-complete prep milestones if all items are received
      console.log('🚨 [PartsReceiving] About to call autoCompletePrepMilestones for full PO receive, project:', projectId);
      try {
        const result = await milestoneService.autoCompletePrepMilestones(projectId);
        console.log('🚨 [PartsReceiving] ✅ autoCompletePrepMilestones for full PO completed successfully:', result);
      } catch (milestoneErr) {
        console.error('🚨 [PartsReceiving] ❌ Failed to auto-complete prep milestones for full PO:', milestoneErr);
        console.error('🚨 [PartsReceiving] Error stack:', milestoneErr.stack);
        // Don't throw - receiving succeeded
      }

      setSuccessMessage(`PO ${po.po_number} fully received`);
      setTimeout(() => setSuccessMessage(null), 3000);

    } catch (err) {
      console.error('🚨 [PartsReceiving] ❌ Failed to receive all PO items:', err);
      setError(err.message || 'Failed to receive all items');
    } finally {
      setSaving(false);
      console.log('[PartsReceiving] handleReceiveAllPO FINISHED');
    }
  };

  const filterPOs = (pos) => {
    if (phaseFilter === 'all') return pos;

    return pos.map(po => {
      const filteredItems = (po.items || []).filter(item => {
        if (phaseFilter === 'prewire') {
          return item.equipment?.global_part?.required_for_prewire === true;
        } else {
          return item.equipment?.global_part?.required_for_prewire !== true;
        }
      });

      return filteredItems.length > 0 ? { ...po, items: filteredItems } : null;
    }).filter(Boolean);
  };

  const getPOStatus = (po) => {
    const items = po.items || [];
    if (items.length === 0) return { label: 'No Items', color: 'text-gray-500', percent: 0 };

    const totalOrdered = items.reduce((sum, item) => sum + (item.quantity_ordered || 0), 0);
    const totalReceived = items.reduce((sum, item) => sum + (item.quantity_received || 0), 0);

    const percent = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;

    if (percent === 100) {
      return { label: 'Fully Received', color: '', style: { color: '#94AF32' }, percent };
    } else if (percent > 0) {
      return { label: `${percent}% Received`, color: 'text-yellow-600 dark:text-yellow-400', percent };
    } else {
      return { label: 'Not Received', color: 'text-blue-600 dark:text-blue-400', percent };
    }
  };

  // Handler to open issue modal - now at PO level with optional part selection
  const handleReportIssue = (po) => {
    setIssueDescription('');
    setSelectedPartId('');
    setIssueModal({ isOpen: true, poInfo: po });
  };

  // Handler to submit issue - creates issue on PO and emails the person who entered the order
  const handleSubmitIssue = async () => {
    if (!issueDescription.trim() || !issueModal.poInfo) return;

    // CRITICAL: User must be authenticated - never allow issues without a real user
    if (!user?.id) {
      setError('You must be logged in to report issues. Please refresh and try again.');
      return;
    }

    try {
      setSubmittingIssue(true);
      const po = issueModal.poInfo;

      // Create an issue linked to the PO
      // Title = "Receiving Issue: [user's description]" (truncated if needed)
      // Keep PO reference at end for issue tracking/filtering
      const truncatedDesc = issueDescription.trim().length > 80
        ? issueDescription.trim().substring(0, 80) + '...'
        : issueDescription.trim();
      const issueTitle = `Receiving Issue: ${truncatedDesc} (PO ${po.po_number})`;

      // Build issue body - include part info if a specific part was selected
      let issueBody = `**Receiving Issue Details**\n\n` +
        `**PO Number:** ${po.po_number}\n` +
        `**Supplier:** ${po.supplier?.name || 'N/A'}\n`;

      // If a specific part was selected, include its details
      if (selectedPartId) {
        const selectedItem = (po.items || []).find(item => item.id === selectedPartId);
        if (selectedItem) {
          const equipment = selectedItem.equipment || {};
          issueBody += `**Part Number:** ${equipment.part_number || 'N/A'}\n` +
            `**Part Name:** ${equipment.name || equipment.description || 'N/A'}\n` +
            `**Quantity Ordered:** ${selectedItem.quantity_ordered || 0}\n` +
            `**Quantity Received:** ${selectedItem.quantity_received || 0}\n`;
        }
      }

      issueBody += `\n**Reported by:** ${user.full_name || user.email}`;

      // Insert issue into issues table (correct table name)
      const { data: issue, error: issueError } = await supabase
        .from('issues')
        .insert({
          project_id: projectId,
          title: issueTitle,
          description: issueBody,
          priority: 'medium',
          status: 'open',
          created_by: user.id
        })
        .select()
        .single();

      if (issueError) throw issueError;

      // Add the user's description as the first comment on the issue
      if (issue?.id && issueDescription.trim()) {
        try {
          await supabase
            .from('issue_comments')
            .insert({
              issue_id: issue.id,
              text: issueDescription.trim(),
              author_id: user.id
            });
        } catch (commentErr) {
          console.warn('Failed to add initial comment:', commentErr);
          // Don't block on comment failure
        }
      }

      // Auto-tag the "Orders" team as a stakeholder on this issue and notify them
      if (issue?.id) {
        try {
          console.log('[PartsReceiving] Looking for Orders stakeholder for project:', projectId);

          // Find the Orders role stakeholder for this project
          // Use select('*') and filter in code - the ilike filter may be causing 400 errors
          const { data: allStakeholders, error: stakeholderError } = await supabase
            .from('project_stakeholders_detailed')
            .select('*')
            .eq('project_id', projectId);

          // Filter for "order" role in code
          const ordersStakeholder = (allStakeholders || []).find(s =>
            s.role_name && s.role_name.toLowerCase().includes('order')
          );

          if (stakeholderError) {
            console.error('[PartsReceiving] Error finding Orders stakeholder:', stakeholderError);
          }

          console.log('[PartsReceiving] All stakeholders for project:', allStakeholders);
          console.log('[PartsReceiving] Orders stakeholder found:', ordersStakeholder);

          if (ordersStakeholder?.assignment_id) {
            console.log('[PartsReceiving] Tagging stakeholder on issue:', {
              issueId: issue.id,
              stakeholderId: ordersStakeholder.assignment_id,
              stakeholderName: ordersStakeholder.contact_name,
              stakeholderEmail: ordersStakeholder.email
            });

            // Tag the stakeholder
            const { error: tagError } = await supabase
              .from('issue_stakeholder_tags')
              .insert({
                issue_id: issue.id,
                project_stakeholder_id: ordersStakeholder.assignment_id,
                tag_type: 'assigned'
              });

            if (tagError) {
              console.error('[PartsReceiving] Error inserting stakeholder tag:', tagError);
            } else {
              console.log('[PartsReceiving] Successfully tagged Orders stakeholder on issue');
            }

            // Send email notification using the standard notifyStakeholderAdded function
            // This sends from the authenticated user's email (sendAsUser: true)
            if (ordersStakeholder.email) {
              try {
                const { notifyStakeholderAdded } = await import('../services/issueNotificationService');

                // Get project name for context
                const { data: project } = await supabase
                  .from('projects')
                  .select('name')
                  .eq('id', projectId)
                  .single();

                // Acquire auth token to send email as current user
                // This is REQUIRED for sendAsUser: true to work
                console.log('[PartsReceiving] Acquiring Graph token for email notification...');
                const graphToken = await acquireToken();

                if (!graphToken) {
                  console.error('[PartsReceiving] Failed to acquire Graph token - email will not be sent as user');
                }

                console.log('[PartsReceiving] Graph token acquired:', graphToken ? 'YES' : 'NO');

                const issueUrl = `${window.location.origin}/project/${projectId}/issues/${issue.id}`;
                const issueContext = {
                  id: issue.id,
                  title: issueTitle,
                  project_id: projectId
                };
                const projectInfo = { name: project?.name };
                const actorInfo = {
                  name: user.full_name || user.email,
                  email: user.email
                };

                console.log('[PartsReceiving] Sending stakeholder notification:', {
                  to: ordersStakeholder.email,
                  actor: actorInfo.name,
                  issue: issueTitle,
                  hasToken: !!graphToken
                });

                await notifyStakeholderAdded(
                  {
                    issue: issueContext,
                    project: projectInfo,
                    stakeholder: ordersStakeholder,
                    actor: actorInfo,
                    issueUrl
                  },
                  { authToken: graphToken }
                );

                console.log('[PartsReceiving] Notification request completed for:', ordersStakeholder.email);
              } catch (emailErr) {
                console.error('[PartsReceiving] Failed to send email to orders stakeholder:', emailErr);
                // Don't block on email failure
              }
            }
          } else {
            console.warn('[PartsReceiving] No Orders stakeholder found for project. Skipping auto-tag.');
          }
        } catch (tagErr) {
          console.warn('Failed to auto-tag orders stakeholder:', tagErr);
          // Don't block on tagging failure
        }
      }

      // Update the PO to flag it has issues
      if (po?.id) {
        await supabase
          .from('purchase_orders')
          .update({
            has_receiving_issues: true,
            notes: po.notes
              ? `${po.notes}\n\n[RECEIVING ISSUE] ${new Date().toLocaleDateString()}: ${issueDescription}`
              : `[RECEIVING ISSUE] ${new Date().toLocaleDateString()}: ${issueDescription}`
          })
          .eq('id', po.id);

        // Send email to the person who created the PO
        if (po.created_by) {
          // Use profiles table (not users)
          const { data: creator } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', po.created_by)
            .single();

          if (creator?.email) {
            // Use the notification service to send email
            try {
              const { sendNotificationEmail, wrapEmailHtml } = await import('../services/issueNotificationService');

              // Get part info for email if a part was selected
              let partInfo = 'General PO Issue';
              if (selectedPartId) {
                const selectedItem = (po.items || []).find(item => item.id === selectedPartId);
                if (selectedItem) {
                  const equipment = selectedItem.equipment || {};
                  partInfo = equipment.part_number || equipment.name || 'Selected Part';
                }
              }

              const emailHtml = wrapEmailHtml(`
                <h2 style="color: #dc2626; margin-bottom: 16px;">⚠️ Receiving Issue Reported</h2>
                <p>A receiving issue has been reported for a purchase order you created:</p>
                <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 16px 0;">
                  <p style="margin: 0 0 8px 0;"><strong>PO Number:</strong> ${po.po_number}</p>
                  <p style="margin: 0 0 8px 0;"><strong>Supplier:</strong> ${po.supplier?.name || 'N/A'}</p>
                  ${selectedPartId ? `<p style="margin: 0 0 8px 0;"><strong>Related Part:</strong> ${partInfo}</p>` : ''}
                  <p style="margin: 0;"><strong>Issue:</strong> ${issueDescription}</p>
                </div>
                <p><strong>Reported by:</strong> ${user.full_name || user.email}</p>
                <p style="color: #666; font-size: 14px;">Please review this issue and take appropriate action.</p>
              `);

              await sendNotificationEmail({
                to: creator.email,
                subject: `[Receiving Issue] PO ${po.po_number}${selectedPartId ? ` - ${partInfo}` : ''}`,
                html: emailHtml,
                text: `Receiving Issue: PO ${po.po_number}, Issue: ${issueDescription}`
              });
            } catch (emailErr) {
              console.warn('Failed to send notification email:', emailErr);
              // Don't block on email failure
            }
          }
        }
      }

      setSuccessMessage('Issue reported successfully. The PO creator has been notified.');
      setTimeout(() => setSuccessMessage(null), 5000);
      setIssueModal({ isOpen: false, poInfo: null });
      setIssueDescription('');
      setSelectedPartId('');

      // Reload POs to show updated status
      await loadPurchaseOrders();

    } catch (err) {
      console.error('Failed to report issue:', err);
      setError(err.message || 'Failed to report issue');
    } finally {
      setSubmittingIssue(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  const filteredPOs = filterPOs(purchaseOrders);
  const outstandingPOs = filteredPOs.filter(po => getPOStatus(po).percent < 100);
  const completedPOs = filteredPOs.filter(po => getPOStatus(po).percent === 100);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 pb-20 transition-colors">
      <div className="w-full px-4 py-6">
        {/* Error/Success Messages */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-4 rounded-lg border" style={{ backgroundColor: 'rgba(148, 175, 50, 0.1)', borderColor: 'rgba(148, 175, 50, 0.3)' }}>
            <p className="text-sm" style={{ color: '#94AF32' }}>{successMessage}</p>
          </div>
        )}

        {/* Total Issues Badge */}
        {(() => {
          const totalIssues = Object.values(openIssuesByPO).reduce((sum, issues) => sum + issues.length, 0);
          if (totalIssues === 0) return null;
          return (
            <button
              onClick={() => navigate(`/issues?project=${projectId}&search=${encodeURIComponent('Receiving Issue:')}`)}
              className="mb-4 w-full flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                <span className="font-medium text-red-800 dark:text-red-200">
                  {totalIssues} Open Receiving Issue{totalIssues > 1 ? 's' : ''}
                </span>
              </div>
              <span className="text-sm text-red-600 dark:text-red-400">View All →</span>
            </button>
          );
        })()}

        {/* Phase Filter */}
        <div style={sectionStyles.card} className="mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setPhaseFilter('all')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors min-h-[44px] ${
                phaseFilter === 'all'
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              All Items
            </button>
            <button
              onClick={() => setPhaseFilter('prewire')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors min-h-[44px] ${
                phaseFilter === 'prewire'
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Prewire Only
            </button>
            <button
              onClick={() => setPhaseFilter('trim')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors min-h-[44px] ${
                phaseFilter === 'trim'
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Trim Only
            </button>
          </div>
        </div>

        {/* Outstanding POs */}
        {outstandingPOs.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
              Outstanding Purchase Orders ({outstandingPOs.length})
            </h2>

            <div className="space-y-3">
              {outstandingPOs.map((po) => {
                const status = getPOStatus(po);
                const isExpanded = expandedPOs.has(po.id);
                const hasOpenIssues = openIssuesByPO[po.po_number]?.length > 0;
                const openIssueCount = openIssuesByPO[po.po_number]?.length || 0;

                return (
                  <div
                    key={po.id}
                    style={{
                      ...sectionStyles.card,
                      ...(hasOpenIssues ? {
                        borderColor: '#dc2626',
                        borderWidth: '2px',
                        boxShadow: '0 0 0 1px rgba(220, 38, 38, 0.3)'
                      } : {})
                    }}
                    className="overflow-hidden"
                  >
                    {/* PO Header */}
                    <button
                      onClick={() => togglePO(po.id)}
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {po.po_number}
                          </h3>
                          <span className={`text-xs font-medium ${status.color}`} style={status.style || {}}>
                            {status.label}
                          </span>
                          {hasOpenIssues && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/issues?project=${projectId}&search=${encodeURIComponent(`PO ${po.po_number}`)}`);
                              }}
                              className="flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium rounded-full hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                              title="View issues for this PO"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              {openIssueCount} Issue{openIssueCount > 1 ? 's' : ''}
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                          {po.supplier?.name} • Ordered: <DateField date={po.order_date} variant="inline" />
                        </p>
                        {/* Tracking Info */}
                        {po.tracking && po.tracking.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                            {po.tracking.map((t) => (
                              <button
                                key={t.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(t.tracking_number);
                                  window.open(`https://www.google.com/search?q=${encodeURIComponent(t.tracking_number)}`, '_blank');
                                }}
                                className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                                title="Click to copy and search tracking number"
                              >
                                <Truck className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                <span className="font-mono text-xs text-blue-900 dark:text-blue-100">
                                  {t.tracking_number}
                                </span>
                                <span className="text-xs text-blue-700 dark:text-blue-300">
                                  ({t.carrier})
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      )}
                    </button>

                    {/* PO Line Items (Expanded) */}
                    {isExpanded && (
                      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                        {/* Primary Actions: Receive Full PO + Report Issue */}
                        <div className="mb-4">
                          <div className="flex gap-2">
                            <Button
                              variant="primary"
                              icon={PackageCheck}
                              onClick={() => handleReceiveAllPO(po)}
                              disabled={saving || status.percent === 100}
                              className="flex-1"
                            >
                              {status.percent === 100 ? 'Fully Received' : 'Receive Full PO'}
                            </Button>
                            <Button
                              variant="danger"
                              icon={AlertTriangle}
                              onClick={() => handleReportIssue(po)}
                              disabled={saving}
                            >
                              Report Issue
                            </Button>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                            Click to receive all items at ordered quantities. Edit individual items below for partial receives.
                          </p>
                        </div>

                        {/* Line Items for Exceptions */}
                        <div className="space-y-3">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Adjust Individual Items (Optional)
                          </p>
                          {(po.items || []).map((item) => (
                            <LineItem
                              key={item.id}
                              item={item}
                              onUpdate={handleUpdateReceived}
                              saving={saving}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Shade Receiving Section */}
        {shades.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setShadesExpanded(!shadesExpanded)}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 mb-3 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Blinds className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Shades ({shades.filter(s => s.received).length}/{shades.length} Received)
                </h2>
              </div>
              {shadesExpanded ? (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {shadesExpanded && (
              <div style={sectionStyles.card} className="overflow-hidden">
                {/* Receive All Button */}
                {shades.some(s => !s.received) && (
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <Button
                      variant="primary"
                      icon={PackageCheck}
                      onClick={handleReceiveAllShades}
                      disabled={saving}
                      className="w-full"
                    >
                      Receive All Shades ({shades.filter(s => !s.received).length} remaining)
                    </Button>
                  </div>
                )}

                {/* Shade List */}
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {shades.map((shade) => {
                    const isSaving = savingShadeId === shade.id;
                    return (
                      <div
                        key={shade.id}
                        className="p-4 flex items-center justify-between"
                        style={shade.received ? { backgroundColor: 'rgba(148, 175, 50, 0.1)' } : {}}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-medium text-gray-900 dark:text-white text-sm truncate">
                              {shade.shade_name || 'Unnamed Shade'}
                            </h4>
                            {shade.received && (
                              <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#94AF32' }} />
                            )}
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {shade.room?.name || 'No Room'} • {shade.technology || 'Unknown'}
                            {shade.ordered_width && shade.ordered_height && (
                              <> • {shade.ordered_width}" × {shade.ordered_height}"</>
                            )}
                          </p>
                          {shade.shade_batch?.original_filename && (
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                              From: {shade.shade_batch.original_filename}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleShadeReceived(shade.id, !shade.received)}
                          disabled={isSaving || saving}
                          className={`ml-3 px-4 py-2 rounded-lg text-sm font-medium min-h-[44px] min-w-[100px] transition-colors ${
                            shade.received
                              ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                              : 'text-white'
                          } disabled:opacity-50`}
                          style={!shade.received ? { backgroundColor: '#94AF32' } : {}}
                        >
                          {isSaving ? (
                            <Loader className="w-4 h-4 animate-spin mx-auto" />
                          ) : shade.received ? (
                            'Undo'
                          ) : (
                            'Receive'
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Completed POs */}
        {completedPOs.length > 0 && (
          <div>
            <button
              onClick={() => {
                // Toggle all completed POs
                const allExpanded = completedPOs.every(po => expandedPOs.has(po.id));
                setExpandedPOs(prev => {
                  const next = new Set(prev);
                  completedPOs.forEach(po => {
                    if (allExpanded) {
                      next.delete(po.id);
                    } else {
                      next.add(po.id);
                    }
                  });
                  return next;
                });
              }}
              className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 mb-3 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                ✓ Completed POs ({completedPOs.length})
              </h2>
              <ChevronDown className="w-5 h-5 text-gray-400" />
            </button>

            <div className="space-y-3">
              {completedPOs.map((po) => {
                const isExpanded = expandedPOs.has(po.id);
                const hasOpenIssues = openIssuesByPO[po.po_number]?.length > 0;
                const openIssueCount = openIssuesByPO[po.po_number]?.length || 0;

                return (
                  <div
                    key={po.id}
                    style={{
                      ...sectionStyles.card,
                      ...(hasOpenIssues ? {
                        borderColor: '#dc2626',
                        borderWidth: '2px',
                        boxShadow: '0 0 0 1px rgba(220, 38, 38, 0.3)'
                      } : {})
                    }}
                    className={`overflow-hidden ${hasOpenIssues ? '' : 'opacity-75'}`}
                  >
                    <button
                      onClick={() => togglePO(po.id)}
                      className="w-full flex items-center justify-between p-4 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white">
                            {po.po_number}
                          </h3>
                          {hasOpenIssues && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/issues?project=${projectId}&search=${encodeURIComponent(`PO ${po.po_number}`)}`);
                              }}
                              className="flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium rounded-full hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                              title="View issues for this PO"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              {openIssueCount} Issue{openIssueCount > 1 ? 's' : ''}
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {po.supplier?.name}
                        </p>
                        {/* Tracking Info */}
                        {po.tracking && po.tracking.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                            {po.tracking.map((t) => (
                              <button
                                key={t.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(t.tracking_number);
                                  window.open(`https://www.google.com/search?q=${encodeURIComponent(t.tracking_number)}`, '_blank');
                                }}
                                className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                                title="Click to copy and search tracking number"
                              >
                                <Truck className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                <span className="font-mono text-xs text-blue-900 dark:text-blue-100">
                                  {t.tracking_number}
                                </span>
                                <span className="text-xs text-blue-700 dark:text-blue-300">
                                  ({t.carrier})
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <CheckCircle className="w-5 h-5" style={{ color: '#94AF32' }} />
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                        <div className="space-y-3">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Items (Click "Adjust Quantity" to make changes)
                          </p>
                          {(po.items || []).map((item) => (
                            <LineItem
                              key={item.id}
                              item={item}
                              onUpdate={handleUpdateReceived}
                              saving={saving}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredPOs.length === 0 && shades.length === 0 && (
          <div style={sectionStyles.card} className="text-center py-12">
            <Truck className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Nothing to Receive
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              No purchase orders or ordered shades to receive
            </p>
            <Button
              variant="primary"
              onClick={() => navigate(`/projects/${projectId}/order-equipment`)}
            >
              Go to Order Equipment
            </Button>
          </div>
        )}
      </div>

      {/* Issue Report Modal */}
      {issueModal.isOpen && issueModal.poInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setIssueModal({ isOpen: false, poInfo: null }); setSelectedPartId(''); }}>
          <div
            className="bg-white dark:bg-zinc-800 rounded-xl shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Report Issue</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  PO {issueModal.poInfo.po_number} • {issueModal.poInfo.supplier?.name || 'Unknown Supplier'}
                </p>
              </div>
            </div>

            {/* Optional Part Selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Related part (optional)
              </label>
              <select
                value={selectedPartId}
                onChange={(e) => setSelectedPartId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500 focus:border-red-500"
                style={{ fontSize: '16px' }}
              >
                <option value="">General PO issue (no specific part)</option>
                {(issueModal.poInfo.items || []).map((item) => {
                  const eq = item.equipment || {};
                  const label = eq.part_number
                    ? `${eq.part_number} - ${eq.name || eq.description || 'Unknown'}`
                    : eq.name || eq.description || 'Unknown Part';
                  return (
                    <option key={item.id} value={item.id}>
                      {label} (Ord: {item.quantity_ordered}, Rcv: {item.quantity_received || 0})
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Describe the issue
              </label>
              <textarea
                value={issueDescription}
                onChange={(e) => setIssueDescription(e.target.value)}
                placeholder="e.g., Missing items, wrong part received, damaged packaging, quantity mismatch..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-red-500 focus:border-red-500"
                style={{ fontSize: '16px' }}
                rows={4}
                autoFocus
              />
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              This will flag the PO and notify the person who created the order via email.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => { setIssueModal({ isOpen: false, poInfo: null }); setSelectedPartId(''); }}
                disabled={submittingIssue}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitIssue}
                disabled={submittingIssue || !issueDescription.trim()}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]"
              >
                {submittingIssue ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    Report Issue
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Line Item Component
const LineItem = ({ item, onUpdate, saving }) => {
  const [quantity, setQuantity] = useState(item.quantity_received || 0);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // Prevent double-save on mobile

  // Use a ref to store the quantity to save - refs persist across re-renders
  // and don't have the async state update issues
  const quantityRef = React.useRef(item.quantity_received || 0);

  const ordered = item.quantity_ordered || 0;
  const received = item.quantity_received || 0;
  const equipment = item.equipment || {};
  const phase = equipment.global_part?.required_for_prewire ? 'Prewire' : 'Trim';

  const handleStartEdit = () => {
    setQuantity(received);
    quantityRef.current = received;
    setIsEditing(true);
  };

  const handleStartReceive = () => {
    // Pre-fill with ordered quantity for easy receiving
    setQuantity(ordered);
    quantityRef.current = ordered;
    setIsEditing(true);
  };

  const handleCancel = () => {
    setQuantity(received);
    quantityRef.current = received;
    setIsEditing(false);
  };

  const handleSave = async () => {
    // Prevent double-save from touch + click events
    if (isSaving) {
      console.log('[LineItem] handleSave skipped - already saving');
      return;
    }

    // Use the ref value which is always current
    const quantityToSave = quantityRef.current;

    console.log('[LineItem] handleSave called:', { quantityToSave, received, quantity, refValue: quantityRef.current });

    if (quantityToSave !== received) {
      // Warn if decreasing quantity
      if (quantityToSave < received) {
        const confirmed = window.confirm(
          `You are decreasing the received quantity from ${received} to ${quantityToSave}.\n\n` +
          `This will UNDO a previous receiving action. Are you sure this is correct?`
        );
        if (!confirmed) {
          handleCancel();
          return;
        }
      }

      // Warn if mismatch with ordered quantity
      if (quantityToSave !== ordered && quantityToSave > 0) {
        const confirmed = window.confirm(
          `⚠️ QUANTITY MISMATCH DETECTED\n\n` +
          `Ordered: ${ordered}\n` +
          `Receiving: ${quantityToSave}\n\n` +
          `This discrepancy will be flagged. Continue with receiving ${quantityToSave} units?`
        );
        if (!confirmed) {
          handleCancel();
          return;
        }
      }

      setIsSaving(true);
      try {
        await onUpdate(item.id, item.project_equipment_id, quantityToSave);
      } finally {
        setIsSaving(false);
      }
    }
    setIsEditing(false);
  };

  const isFullyReceived = received >= ordered;
  const hasBeenReceived = received > 0;
  const hasMismatch = hasBeenReceived && received !== ordered;
  const needsToReceive = !hasBeenReceived;

  return (
    <div className={`border rounded-lg p-3 ${
      isFullyReceived && !hasMismatch
        ? 'border-[#94AF32]/30 bg-[#94AF32]/10'
        : hasMismatch
        ? 'border-yellow-300 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20'
        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-800'
    }`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 dark:text-white text-sm">
            {equipment.part_number || 'N/A'}
            {isFullyReceived && !hasMismatch && (
              <span className="ml-2" style={{ color: '#94AF32' }}>✓</span>
            )}
            {hasMismatch && (
              <span className="ml-2 text-yellow-600 dark:text-yellow-400" title="Quantity mismatch">⚠️</span>
            )}
          </h4>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {equipment.name || equipment.description || 'No description'}
          </p>
        </div>
        <span className="px-2 py-0.5 text-xs font-medium bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded">
          {phase}
        </span>
      </div>

      {hasMismatch && (
        <div className="mb-2 p-2 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-600 rounded text-xs text-yellow-800 dark:text-yellow-200">
          ⚠️ Mismatch: Ordered {ordered}, Received {received}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Ordered
          </label>
          <div className="text-lg font-semibold text-gray-900 dark:text-white">
            {ordered}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Receiving
          </label>
          {isEditing ? (
            <div className="flex gap-1">
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                value={quantity}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10) || 0;
                  setQuantity(val);
                  quantityRef.current = val;
                }}
                className="w-full px-2 py-1 text-lg rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                min="0"
                style={{ fontSize: '16px' }} // Prevents iOS zoom on focus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.target.blur();
                    handleSave();
                  }
                  if (e.key === 'Escape') handleCancel();
                }}
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || isSaving}
                className="px-3 py-1 text-white rounded text-sm font-bold min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation select-none"
                style={{ backgroundColor: '#94AF32', WebkitTapHighlightColor: 'transparent' }}
                title="Save"
              >
                {isSaving ? '...' : 'OK'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={saving || isSaving}
                className="px-3 py-1 bg-gray-400 hover:bg-gray-500 active:bg-gray-600 text-white rounded text-xs min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation select-none"
                style={{ WebkitTapHighlightColor: 'transparent' }}
                title="Cancel"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {received}
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      {!isEditing && (
        <div className="flex gap-2">
          {needsToReceive ? (
            <button
              type="button"
              onClick={handleStartReceive}
              disabled={saving}
              className="flex-1 px-3 py-3 text-sm font-medium bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded transition-colors disabled:opacity-50 touch-manipulation min-h-[44px] select-none"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              Receive Line Item
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartEdit}
              disabled={saving}
              className="flex-1 px-3 py-3 text-sm font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded hover:bg-yellow-200 dark:hover:bg-yellow-900/50 active:bg-yellow-300 transition-colors disabled:opacity-50 touch-manipulation min-h-[44px] select-none"
              style={{ WebkitTapHighlightColor: 'transparent' }}
            >
              Adjust Quantity
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PartsReceivingPageNew;
