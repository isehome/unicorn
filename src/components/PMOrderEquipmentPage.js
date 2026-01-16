import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useAppState } from '../contexts/AppStateContext';
import { enhancedStyles } from '../styles/styleSystem';
import { supabase } from '../lib/supabase';
import { projectEquipmentService } from '../services/projectEquipmentService';
import { milestoneCacheService } from '../services/milestoneCacheService';
import { poGeneratorService } from '../services/poGeneratorService';
import { trackingService } from '../services/trackingService';
import { supplierService } from '../services/supplierService';
import Button from './ui/Button';
import DateField from './ui/DateField';
import POGenerationModal from './procurement/POGenerationModal';
import PODetailsModal from './procurement/PODetailsModal';
import InventoryManager from './InventoryManager';
import SupplierManager from './procurement/SupplierManager';
import ProcurementProgressGauge from './procurement/ProcurementProgressGauge';
import {
  Package,
  CheckCircle,
  AlertCircle,
  Loader,
  FileText,
  Truck,
  Settings,
  Edit2,
  X
} from 'lucide-react';

const PMOrderEquipmentPageEnhanced = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { mode } = useTheme();
  const { user } = useAuth();
  const { publishState, registerActions, unregisterActions } = useAppState();
  const sectionStyles = enhancedStyles.sections[mode];

  // State
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [saving, setSaving] = useState(false);
  const [equipment, setEquipment] = useState([]);

  // Tab state (removed viewMode - only Create POs view now)
  const [tab, setTab] = useState('prewire'); // 'inventory', 'prewire', 'trim', 'pos', 'vendors'

  // Active POs state
  const [purchaseOrders, setPurchaseOrders] = useState([]);

  // Project default shipping address
  const [projectDefaultShippingId, setProjectDefaultShippingId] = useState(null);

  // Messages
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // PO Generation Modal state
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [selectedVendorForPO, setSelectedVendorForPO] = useState(null);

  // PO Details Modal state
  const [poDetailsModalOpen, setPoDetailsModalOpen] = useState(false);
  const [selectedPOId, setSelectedPOId] = useState(null);

  // Selected items for PO generation (checkbox-based selection)
  // Format: { itemId: { selected: boolean, quantity: number } }
  const [selectedItems, setSelectedItems] = useState({});

  // Receiving issues state
  const [receivingIssues, setReceivingIssues] = useState([]);
  const [openIssuesByPO, setOpenIssuesByPO] = useState({}); // Map PO number to issue count

  // Equipment editing state
  const [editingEquipmentId, setEditingEquipmentId] = useState(null);
  const [allSuppliers, setAllSuppliers] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);

  // Map phase to milestone_stage
  const getMilestoneStage = (phase) => {
    return phase === 'prewire' ? 'prewire_prep' : 'trim_prep';
  };

  // Load project info and default shipping address on mount
  useEffect(() => {
    loadProjectInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (tab === 'prewire' || tab === 'trim') {
      loadEquipment();
    } else if (tab === 'pos' || tab === 'issues') {
      loadPurchaseOrders();
      loadReceivingIssues();
    }
    // No data loading needed for 'inventory' tab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, tab]);

  // Also load issues on initial mount to show/hide Issues tab
  useEffect(() => {
    loadReceivingIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // No longer need to load vendor grouping - checkbox view uses equipment directly

  const loadProjectInfo = async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('projects')
        .select('id, name, project_number, default_shipping_address_id')
        .eq('id', projectId)
        .single();

      if (fetchError) {
        // If column doesn't exist yet (migration not run), just silently ignore
        if (fetchError.message?.includes('column') || fetchError.code === '42703') {
          console.log('Default shipping address column not yet available - migration may need to be run');
          return;
        }
        throw fetchError;
      }

      // Set project info for AI context
      setProject(data ? { id: data.id, name: data.name, projectNumber: data.project_number } : null);

      const defaultShippingId = data?.default_shipping_address_id || null;
      console.log('📦 Loaded project info:', data?.name, 'shipping:', defaultShippingId);
      setProjectDefaultShippingId(defaultShippingId);
    } catch (err) {
      console.error('Failed to load project info:', err);
    }
  };

  const loadEquipment = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await projectEquipmentService.fetchProjectEquipmentByPhase(projectId, tab);

      // Load purchase orders FILTERED BY MILESTONE to avoid cross-phase counting
      // This fixes the bug where prewire PO items were showing as ordered in trim tab
      const milestoneStage = getMilestoneStage(tab);
      const { data: pos } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          status,
          milestone_stage,
          items:purchase_order_items(
            project_equipment_id,
            quantity_ordered
          )
        `)
        .eq('project_id', projectId)
        .eq('milestone_stage', milestoneStage);

      // Create maps for draft and submitted PO quantities
      const draftPOMap = new Map();
      const submittedPOMap = new Map();

      (pos || []).forEach(po => {
        (po.items || []).forEach(item => {
          if (po.status === 'draft') {
            const existing = draftPOMap.get(item.project_equipment_id) || 0;
            draftPOMap.set(item.project_equipment_id, existing + (item.quantity_ordered || 0));
          } else if (['submitted', 'confirmed', 'partially_received', 'received'].includes(po.status)) {
            // All non-draft statuses count as "actually ordered"
            const existing = submittedPOMap.get(item.project_equipment_id) || 0;
            submittedPOMap.set(item.project_equipment_id, existing + (item.quantity_ordered || 0));
          }
        });
      });

      // Enrich equipment data with PO info and calculate remaining quantity
      const enriched = (data || []).map(item => {
        // Use quantity_required (NEW) or fallback to planned_quantity (OLD) for backward compatibility
        const required = item.quantity_required || item.planned_quantity || 0;
        const inDraft = draftPOMap.get(item.id) || 0;
        const inSubmitted = submittedPOMap.get(item.id) || 0;
        const totalInPOs = inDraft + inSubmitted;

        // Get inventory quantity from global_part
        const onHand = item.global_part?.quantity_on_hand || 0;

        // Calculate how much can come from inventory
        // This is what's still needed AFTER subtracting POs, limited by what's on hand
        const stillNeeded = Math.max(0, required - totalInPOs);
        const quantityFromInventory = Math.min(stillNeeded, onHand);

        // Calculate quantity needed from suppliers = what's left after inventory
        const remaining = Math.max(0, stillNeeded - quantityFromInventory);

        return {
          ...item,
          quantity_required: required, // Normalize field name
          quantity_on_hand: onHand, // Add inventory data
          quantity_from_inventory: quantityFromInventory, // NEW: Track what comes from inventory
          quantity_in_draft_pos: inDraft,
          quantity_ordered: inSubmitted, // This is the "actually ordered" amount
          in_any_po: totalInPOs > 0,
          quantity_needed: remaining, // What still needs to be ordered from suppliers
          has_draft_po_only: inDraft > 0 && inSubmitted === 0 // Orange warning flag
        };
      });

      // Debug logging
      console.log('[PMOrderEquipmentPage] Loaded equipment data with PO status:', enriched);
      console.log('[PMOrderEquipmentPage] Equipment quantities summary:',
        enriched.map(e => ({
          name: e.name,
          part_number: e.part_number,
          quantity_required: e.quantity_required,
          quantity_on_hand: e.quantity_on_hand,
          quantity_ordered: e.quantity_ordered,
          quantity_needed: e.quantity_needed
        }))
      );

      // Sort: prioritize items needing attention
      // 1. Items with draft POs only (orange - need submission)
      // 2. Items with no orders (need ordering)
      // 3. Items fully ordered (grey out)
      const sorted = enriched.sort((a, b) => {
        // Priority 1: Draft PO only (orange) - these need attention first!
        if (a.has_draft_po_only !== b.has_draft_po_only) {
          return a.has_draft_po_only ? -1 : 1;
        }
        // Priority 2: Has any orders
        const aHasOrders = (a.quantity_ordered || 0) > 0;
        const bHasOrders = (b.quantity_ordered || 0) > 0;
        if (aHasOrders !== bHasOrders) {
          return aHasOrders ? 1 : -1; // Items without orders first
        }
        // Otherwise sort by name
        return (a.name || '').localeCompare(b.name || '');
      });

      setEquipment(sorted);
    } catch (err) {
      console.error('Failed to load equipment:', err);
      setError('Failed to load equipment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadPurchaseOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const pos = await poGeneratorService.getProjectPOs(projectId);

      // Load tracking info for each PO
      const posWithTracking = await Promise.all(
        (pos || []).map(async (po) => {
          const tracking = await trackingService.getPOTracking(po.id);
          console.log(`PO ${po.po_number} has ${tracking.length} tracking numbers:`, tracking);
          return { ...po, tracking };
        })
      );

      console.log('Purchase orders with tracking:', posWithTracking);
      setPurchaseOrders(posWithTracking);
    } catch (err) {
      console.error('Failed to load purchase orders:', err);
      setError('Failed to load purchase orders');
    } finally {
      setLoading(false);
    }
  };

  // Load receiving issues for this project
  const loadReceivingIssues = async () => {
    try {
      const { data: issues, error: issuesError } = await supabase
        .from('issues')
        .select('id, title, status, created_at, priority')
        .eq('project_id', projectId)
        .like('title', 'Receiving Issue:%')
        .in('status', ['open', 'blocked'])
        .order('created_at', { ascending: false });

      if (issuesError) throw issuesError;

      setReceivingIssues(issues || []);

      // Build a map of PO numbers to issue counts
      const poIssueMap = {};
      (issues || []).forEach(issue => {
        // Extract PO number from title: "Receiving Issue: ... (PO XXXXX)"
        // PO number format can be "PO-00123" or just "00123" - extract the full value in parentheses
        const poMatch = issue.title.match(/\(PO\s+([^)]+)\)/);
        if (poMatch) {
          const poNumber = poMatch[1].trim();
          poIssueMap[poNumber] = (poIssueMap[poNumber] || 0) + 1;
        }
      });
      setOpenIssuesByPO(poIssueMap);
      console.log('[PMOrderEquipment] Loaded receiving issues:', issues?.length, 'Issues by PO:', poIssueMap);
    } catch (err) {
      console.error('Failed to load receiving issues:', err);
      setReceivingIssues([]);
      setOpenIssuesByPO({});
    }
  };

  // ══════════════════════════════════════════════════════════════
  // AI VOICE COPILOT INTEGRATION
  // ══════════════════════════════════════════════════════════════

  // Publish state for AI awareness
  useEffect(() => {
    // Calculate PO stats by status
    const poStats = {
      draft: purchaseOrders.filter(po => po.status === 'draft').length,
      submitted: purchaseOrders.filter(po => po.status === 'submitted').length,
      confirmed: purchaseOrders.filter(po => po.status === 'confirmed').length,
      partiallyReceived: purchaseOrders.filter(po => po.status === 'partially_received').length,
      received: purchaseOrders.filter(po => po.status === 'received').length,
      total: purchaseOrders.length
    };

    // Calculate equipment stats
    const equipmentStats = {
      total: equipment.length,
      needsOrdering: equipment.filter(e => e.quantity_needed > 0).length,
      inDraftPO: equipment.filter(e => e.has_draft_po_only).length,
      fullyOrdered: equipment.filter(e => e.quantity_needed === 0 && e.quantity_ordered > 0).length
    };

    publishState({
      view: 'procurement',
      project: project ? { id: project.id, name: project.name, projectNumber: project.projectNumber } : { id: projectId },
      currentTab: tab,
      purchaseOrderStats: poStats,
      equipmentStats: equipmentStats,
      openReceivingIssues: receivingIssues.length,
      recentPOs: purchaseOrders.slice(0, 5).map(po => ({
        id: po.id,
        poNumber: po.po_number,
        status: po.status,
        supplierName: po.supplier?.name || po.supplier_name,
        totalAmount: po.total_amount
      })),
      hint: `Procurement page for project. Current tab: ${tab}. Shows equipment to order, active POs, and vendor management. Can create POs, filter by status, view vendor details.`
    });
  }, [publishState, project, projectId, tab, purchaseOrders, equipment, receivingIssues]);

  // Register actions for AI
  useEffect(() => {
    const actions = {
      create_po: async ({ vendorName }) => {
        // Find equipment for this vendor that needs ordering
        const vendorEquipment = equipment.filter(e =>
          e.quantity_needed > 0 &&
          (e.supplier?.toLowerCase().includes(vendorName?.toLowerCase() || '') ||
           e.global_part?.supplier?.name?.toLowerCase().includes(vendorName?.toLowerCase() || ''))
        );

        if (vendorEquipment.length === 0) {
          return { success: false, error: `No equipment needing orders found for vendor "${vendorName}"` };
        }

        // Select all items for this vendor
        const newSelections = {};
        vendorEquipment.forEach(item => {
          newSelections[item.part_number] = {
            selected: true,
            quantity: item.quantity_needed,
            group: { supplier: item.supplier_id ? { id: item.supplier_id, name: item.supplier } : null }
          };
        });
        setSelectedItems(newSelections);
        setPoModalOpen(true);
        return {
          success: true,
          message: `Opening PO creation for ${vendorEquipment.length} item(s) from ${vendorName}`,
          itemCount: vendorEquipment.length
        };
      },

      filter_by_status: async ({ status }) => {
        // Navigate to POs tab and let user see filtered results
        const validStatuses = ['draft', 'submitted', 'confirmed', 'partially_received', 'received', 'cancelled'];
        if (!validStatuses.includes(status?.toLowerCase())) {
          return { success: false, error: `Invalid status. Valid options: ${validStatuses.join(', ')}` };
        }
        setTab('pos');
        return {
          success: true,
          message: `Showing POs tab. Filter for "${status}" status.`,
          matchingCount: purchaseOrders.filter(po => po.status === status?.toLowerCase()).length
        };
      },

      open_po: async ({ poNumber }) => {
        const po = purchaseOrders.find(p =>
          p.po_number?.toLowerCase().includes(poNumber?.toLowerCase() || '')
        );
        if (po) {
          setSelectedPOId(po.id);
          setPoDetailsModalOpen(true);
          return { success: true, message: `Opening PO ${po.po_number}` };
        }
        return { success: false, error: `Purchase order "${poNumber}" not found` };
      },

      search_pos: async ({ query }) => {
        const matchingPOs = purchaseOrders.filter(po => {
          const poMatch = po.po_number?.toLowerCase().includes(query?.toLowerCase() || '');
          const supplierMatch = po.supplier?.name?.toLowerCase().includes(query?.toLowerCase() || '') ||
                               po.supplier_name?.toLowerCase().includes(query?.toLowerCase() || '');
          return poMatch || supplierMatch;
        });

        if (matchingPOs.length > 0) {
          setTab('pos');
          return {
            success: true,
            message: `Found ${matchingPOs.length} purchase order(s) matching "${query}"`,
            results: matchingPOs.map(po => ({
              poNumber: po.po_number,
              supplier: po.supplier?.name || po.supplier_name,
              status: po.status,
              total: po.total_amount
            }))
          };
        }
        return { success: false, error: `No purchase orders found matching "${query}"` };
      },

      view_vendor: async ({ vendorName }) => {
        setTab('vendors');
        return { success: true, message: `Showing vendors tab. Search for "${vendorName}" to view details.` };
      },

      switch_tab: async ({ tabName }) => {
        const validTabs = ['inventory', 'prewire', 'trim', 'pos', 'vendors', 'issues'];
        if (validTabs.includes(tabName?.toLowerCase())) {
          setTab(tabName.toLowerCase());
          return { success: true, message: `Switched to ${tabName} tab` };
        }
        return { success: false, error: `Invalid tab. Valid options: ${validTabs.join(', ')}` };
      },

      list_draft_pos: async () => {
        const draftPOs = purchaseOrders.filter(po => po.status === 'draft');
        return {
          success: true,
          purchaseOrders: draftPOs.map(po => ({
            poNumber: po.po_number,
            supplier: po.supplier?.name || po.supplier_name,
            totalAmount: po.total_amount,
            itemCount: po.items?.length || 0
          })),
          count: draftPOs.length,
          message: draftPOs.length > 0
            ? `Found ${draftPOs.length} draft PO(s) awaiting submission`
            : 'No draft POs found'
        };
      },

      list_items_needing_order: async () => {
        const needsOrdering = equipment.filter(e => e.quantity_needed > 0);
        return {
          success: true,
          items: needsOrdering.slice(0, 10).map(e => ({
            name: e.name,
            partNumber: e.part_number,
            quantityNeeded: e.quantity_needed,
            supplier: e.supplier
          })),
          count: needsOrdering.length,
          message: needsOrdering.length > 0
            ? `Found ${needsOrdering.length} item(s) needing orders`
            : 'All equipment has been ordered'
        };
      },

      view_receiving_issues: async () => {
        if (receivingIssues.length === 0) {
          return { success: true, message: 'No open receiving issues' };
        }
        setTab('issues');
        return {
          success: true,
          message: `Showing ${receivingIssues.length} open receiving issue(s)`,
          issues: receivingIssues.map(i => ({
            title: i.title,
            status: i.status,
            priority: i.priority
          }))
        };
      }
    };

    registerActions(actions);
    return () => unregisterActions(Object.keys(actions));
  }, [registerActions, unregisterActions, purchaseOrders, equipment, receivingIssues, tab]);

  // Load all suppliers for the edit dropdown
  const loadAllSuppliers = async () => {
    if (allSuppliers.length > 0) return; // Already loaded
    try {
      setLoadingSuppliers(true);
      const suppliers = await supplierService.getAllSuppliers(true); // Only active suppliers
      setAllSuppliers(suppliers);
    } catch (err) {
      console.error('Failed to load suppliers:', err);
    } finally {
      setLoadingSuppliers(false);
    }
  };

  // Update equipment supplier
  const handleUpdateEquipmentSupplier = async (equipmentIds, supplierId, supplierName) => {
    try {
      setSaving(true);
      setError(null);

      // Update all equipment items with this part number
      for (const equipmentId of equipmentIds) {
        await projectEquipmentService.updateEquipment(equipmentId, {
          supplier_id: supplierId,
          supplier: supplierName // Also update the text field
        });
      }

      setSuccessMessage(`Supplier updated to "${supplierName}" for ${equipmentIds.length} item(s)`);
      setTimeout(() => setSuccessMessage(null), 3000);

      // Close the edit dropdown
      setEditingEquipmentId(null);

      // Reload equipment to show updated data
      await loadEquipment();
    } catch (err) {
      console.error('Failed to update equipment supplier:', err);
      setError(err.message || 'Failed to update supplier');
      setTimeout(() => setError(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  // Handle checkbox selection by part number
  const handleItemSelectionByPartNumber = (partNumber, isChecked, defaultQuantity, group) => {
    setSelectedItems(prev => {
      if (isChecked) {
        return {
          ...prev,
          [partNumber]: {
            selected: true,
            quantity: defaultQuantity,
            group: group // Store the group for later PO generation
          }
        };
      } else {
        const { [partNumber]: removed, ...rest } = prev;
        return rest;
      }
    });
  };

  // Handle quantity change by part number
  const handleSelectedQuantityChangeByPartNumber = (partNumber, newQuantity) => {
    setSelectedItems(prev => ({
      ...prev,
      [partNumber]: {
        ...prev[partNumber],
        quantity: newQuantity
      }
    }));
  };

  // Select all available part numbers (both supplier and inventory items)
  const handleSelectAllByPartNumber = (groups) => {
    const newSelection = {};
    groups.forEach(group => {
      // For inventory groups, use quantity_needed (which was set to quantity_from_inventory)
      // For supplier groups, use quantity_needed
      const quantityToOrder = group.quantity_needed || group.quantity_from_inventory || 0;
      if (quantityToOrder > 0) {
        const partNumber = group.part_number || 'NO_PART_NUMBER';
        newSelection[partNumber] = {
          selected: true,
          quantity: quantityToOrder,
          group: group
        };
      }
    });
    setSelectedItems(newSelection);
  };

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedItems({});
  };

  // Generate POs from selected items (now works with part number groups)
  const handleGeneratePOsFromSelection = async (groupedEquipment) => {
    console.log('🚀 handleGeneratePOsFromSelection called');
    console.log('📋 Selected items:', selectedItems);
    console.log('📋 Selected count:', Object.keys(selectedItems).length);

    const selectedCount = Object.keys(selectedItems).length;
    if (selectedCount === 0) {
      console.log('❌ No items selected');
      setError('Please select at least one item to generate POs');
      setTimeout(() => setError(null), 3000);
      return;
    }

    try {
      setSaving(true);
      setError(null);
      console.log('✅ Starting PO generation process...');

      // Expand part number selections back to individual equipment items
      const expandedEquipment = [];
      Object.entries(selectedItems).forEach(([partNumber, selection]) => {
        const group = selection.group;
        const quantityToOrder = selection.quantity;
        // Check if this is an inventory group - check flag first, then name for backward compat
        const isInventoryGroup = group.isInventory ||
          group.is_internal_inventory === true ||
          group.supplier === 'Internal Inventory';
        // Also check if items have inventory available (in case group wasn't marked correctly)
        const hasInventoryAvailable = group.quantity_from_inventory > 0 ||
          group.items?.some(item => item.quantity_from_inventory > 0);
        const shouldUseInventory = isInventoryGroup || (hasInventoryAvailable && group.quantity_needed === 0);

        console.log(`📦 Processing group: ${partNumber}, isInventory: ${isInventoryGroup}, shouldUseInventory: ${shouldUseInventory}, quantityToOrder: ${quantityToOrder}`);
        console.log(`📦 Group details:`, { supplier: group.supplier, isInventory: group.isInventory, hasInventoryAvailable, itemCount: group.items?.length });

        // Distribute quantity across individual items in the group
        // For simplicity, we'll order from items proportionally based on their remaining quantity
        let remainingToOrder = quantityToOrder;

        group.items.forEach((item, index) => {
          // For inventory items, use quantity_from_inventory; for supplier items, use quantity_needed
          // If shouldUseInventory is true, prefer inventory even if group wasn't explicitly marked
          const itemNeeded = shouldUseInventory
            ? (item.quantity_from_inventory || item.quantity_needed || 1) // Default to 1 for inventory items
            : (item.quantity_needed || 0);

          console.log(`  📦 Item ${index}: ${item.name}, itemNeeded: ${itemNeeded}, quantity_from_inventory: ${item.quantity_from_inventory}, quantity_needed: ${item.quantity_needed}`);

          if (itemNeeded > 0 && remainingToOrder > 0) {
            const quantityForThisItem = Math.min(itemNeeded, remainingToOrder);
            expandedEquipment.push({
              ...item,
              quantity_to_order: quantityForThisItem,
              // Preserve inventory flag for later filtering
              supplier: shouldUseInventory ? 'Internal Inventory' : item.supplier,
              quantity_from_inventory: shouldUseInventory ? quantityForThisItem : 0
            });
            remainingToOrder -= quantityForThisItem;
            console.log(`  ✅ Added item with quantity_to_order: ${quantityForThisItem}`);
          } else {
            console.log(`  ❌ Skipped item: itemNeeded=${itemNeeded}, remainingToOrder=${remainingToOrder}`);
          }
        });
      });

      // Debug: Log expanded equipment
      console.log('🔍 Expanded equipment for PO generation:', expandedEquipment);

      if (expandedEquipment.length === 0) {
        setError('No items available to order. Please check that items have quantity needed.');
        setSaving(false);
        return;
      }

      // Separate inventory items from supplier items
      // Note: Check quantity_from_inventory since isInventory flag only exists on grouped items, not expanded items
      const inventoryItems = expandedEquipment.filter(item =>
        (item.quantity_from_inventory > 0) || item.supplier === 'Internal Inventory'
      );
      const supplierItems = expandedEquipment.filter(item =>
        !(item.quantity_from_inventory > 0) && item.supplier !== 'Internal Inventory'
      );

      console.log('🔍 Inventory items count:', inventoryItems.length);
      console.log('🔍 Inventory items details:', inventoryItems.map(i => ({
        id: i.id,
        name: i.name,
        supplier: i.supplier,
        quantity_from_inventory: i.quantity_from_inventory,
        quantity_to_order: i.quantity_to_order
      })));
      console.log('🔍 Supplier items:', supplierItems);

      // Group supplier items by supplier
      const groupedBySupplier = {};
      supplierItems.forEach(item => {
        const supplierName = item.supplier || 'Unassigned';
        if (!groupedBySupplier[supplierName]) {
          groupedBySupplier[supplierName] = [];
        }
        groupedBySupplier[supplierName].push(item);
      });

      const supplierNames = Object.keys(groupedBySupplier);
      const failedSuppliers = [];

      // Debug: Log grouped suppliers
      console.log('🔍 Grouped by supplier:', groupedBySupplier);

      // Filter out suppliers without supplier_id
      const validSuppliers = supplierNames.filter(name => {
        const items = groupedBySupplier[name];
        const hasValidSupplier = items[0].supplier_id != null;
        if (!hasValidSupplier) {
          console.warn(`⚠️ Supplier "${name}" has no supplier_id. Items:`, items);
          // Add to failed suppliers list immediately for visibility
          failedSuppliers.push(`${name} (Missing supplier record)`);
        }
        return hasValidSupplier;
      });

      // Build confirmation message
      let confirmMessage = '';
      const poCount = validSuppliers.length + (inventoryItems.length > 0 ? 1 : 0);

      confirmMessage += `This will create ${poCount} PO(s):\n\n`;

      // List supplier POs
      validSuppliers.forEach(name => {
        const items = groupedBySupplier[name];
        const total = items.reduce((sum, item) => sum + (item.quantity_to_order * (item.unit_cost || 0)), 0);
        confirmMessage += `• ${name}: ${items.length} line items ($${total.toFixed(2)})\n`;
      });

      // List inventory PO
      if (inventoryItems.length > 0) {
        const total = inventoryItems.reduce((sum, item) => sum + (item.quantity_to_order * (item.unit_cost || 0)), 0);
        confirmMessage += `• Internal Inventory: ${inventoryItems.length} line items ($${total.toFixed(2)})\n`;
      }

      if (validSuppliers.length === 0 && inventoryItems.length === 0) {
        confirmMessage += '\n⚠️ WARNING: No valid items found to order.';
      }

      confirmMessage += '\n\nContinue?';

      if (!window.confirm(confirmMessage)) {
        setSaving(false);
        return;
      }

      if (validSuppliers.length === 0 && inventoryItems.length === 0) {
        const missingSupplierNames = supplierNames.filter(name => !validSuppliers.includes(name));
        let errorMsg = 'Cannot create POs: No valid items selected.';

        if (missingSupplierNames.length > 0) {
          errorMsg += ` The following items have no assigned supplier: ${missingSupplierNames.join(', ')}. Please go to "Manage Vendors" to fix this.`;
        } else {
          errorMsg += ' Please ensure equipment is linked to suppliers or has inventory available.';
        }

        setError(errorMsg);
        setSaving(false);
        return;
      }

      // Create POs for each supplier - CUSTOM IMPLEMENTATION for partial quantities
      const createdPOs = [];

      for (const supplierName of validSuppliers) {
        const items = groupedBySupplier[supplierName];
        const supplier = items[0].supplier_id; // Already validated above

        try {
          // Step 1: Generate PO number (includes project name prefix)
          const { data: poNumber, error: poNumberError } = await supabase
            .rpc('generate_po_number', {
              p_supplier_id: supplier,
              p_project_id: projectId
            });

          if (poNumberError) {
            console.error('PO number generation failed:', poNumberError);
            throw poNumberError;
          }

          // Step 2: Calculate totals using quantity_to_order
          const subtotal = items.reduce((sum, item) => {
            return sum + ((item.unit_cost || 0) * item.quantity_to_order);
          }, 0);

          // Step 3: Get milestone dates for delivery calculation
          const { data: milestone } = await supabase
            .from('project_milestones')
            .select('target_date')
            .eq('project_id', projectId)
            .eq('milestone_type', getMilestoneStage(tab))
            .single();

          let requestedDeliveryDate = null;
          if (milestone?.target_date) {
            const targetDate = new Date(milestone.target_date);
            targetDate.setDate(targetDate.getDate() - 14);
            requestedDeliveryDate = targetDate.toISOString().split('T')[0];
          }

          // Step 4: Create PO record
          console.log('📦 Creating PO with shipping address:', projectDefaultShippingId);
          const poRecord = {
            project_id: projectId,
            supplier_id: supplier,
            po_number: poNumber,
            milestone_stage: getMilestoneStage(tab),
            status: 'draft',
            order_date: new Date().toISOString().split('T')[0],
            requested_delivery_date: requestedDeliveryDate,
            subtotal: subtotal,
            tax_amount: 0,
            shipping_cost: 0,
            total_amount: subtotal,
            shipping_address_id: projectDefaultShippingId, // Auto-populate default shipping address
            created_by: user?.id,
            internal_notes: `PO created from Create POs view`
          };

          const { data: newPO, error: createError } = await supabase
            .from('purchase_orders')
            .insert([poRecord])
            .select()
            .single();

          if (createError) throw createError;

          // Step 5: Create PO line items using quantity_to_order
          const lineItems = items.map((item, index) => ({
            po_id: newPO.id,
            project_equipment_id: item.id,
            line_number: index + 1,
            quantity_ordered: item.quantity_to_order, // USE OUR CUSTOM QUANTITY
            unit_cost: item.unit_cost || 0,
            notes: item.notes || null
          }));

          const { data: createdItems, error: itemsError } = await supabase
            .from('purchase_order_items')
            .insert(lineItems)
            .select();

          if (itemsError) throw itemsError;

          createdPOs.push({
            po: newPO,
            items: createdItems,
            supplier: supplierName
          });

          console.log(`✅ Created PO ${poNumber} for ${supplierName} with ${items.length} items`);
        } catch (err) {
          console.error(`❌ Failed to create PO for ${supplierName}:`, err);
          failedSuppliers.push(`${supplierName} (${err.message})`);
        }
      }

      // Create Internal Inventory PO for inventory items that were selected
      // Using inline logic to avoid hot-reload issues with service imports
      if (inventoryItems.length > 0) {
        try {
          console.log('[PMOrderEquipment] Creating Internal Inventory PO for', inventoryItems.length, 'items');

          // Step 1: Find internal inventory supplier by flag (preferred) or name (backward compat)
          let { data: inventorySupplier, error: supplierError } = await supabase
            .from('suppliers')
            .select('*')
            .eq('is_internal_inventory', true)
            .maybeSingle();

          if (supplierError && supplierError.code !== 'PGRST116') {
            throw supplierError;
          }

          // Fall back to name match for backward compatibility (before migration)
          if (!inventorySupplier) {
            const { data: byName, error: nameError } = await supabase
              .from('suppliers')
              .select('*')
              .eq('name', 'Internal Inventory')
              .maybeSingle();

            if (nameError && nameError.code !== 'PGRST116') {
              throw nameError;
            }
            inventorySupplier = byName;
          }

          // Create if doesn't exist
          if (!inventorySupplier) {
            const { data: newSupplier, error: createSupplierError } = await supabase
              .from('suppliers')
              .insert([{
                name: 'Internal Inventory',
                short_code: 'INV',
                contact_name: 'Warehouse',
                email: 'inventory@internal',
                is_active: true,
                is_internal_inventory: true,
                notes: 'System-generated supplier for internal inventory pulls'
              }])
              .select()
              .single();

            if (createSupplierError) throw createSupplierError;
            inventorySupplier = newSupplier;
          }

          console.log('[PMOrderEquipment] Using inventory supplier:', inventorySupplier.id);

          // Step 2: Generate PO number
          const { data: poNumber, error: poNumberError } = await supabase
            .rpc('generate_po_number', {
              p_supplier_id: inventorySupplier.id,
              p_project_id: projectId
            });

          if (poNumberError) {
            console.error('PO number generation failed:', poNumberError);
            throw poNumberError;
          }

          console.log('[PMOrderEquipment] Generated inventory PO number:', poNumber);

          // Step 3: Calculate totals
          const subtotal = inventoryItems.reduce((sum, item) => {
            return sum + ((item.unit_cost || 0) * item.quantity_to_order);
          }, 0);

          // Step 4: Create PO record
          const poRecord = {
            project_id: projectId,
            supplier_id: inventorySupplier.id,
            po_number: poNumber,
            milestone_stage: getMilestoneStage(tab),
            status: 'draft',
            order_date: new Date().toISOString().split('T')[0],
            subtotal: subtotal,
            tax_amount: 0,
            shipping_cost: 0,
            total_amount: subtotal,
            created_by: user?.id,
            internal_notes: 'Inventory pull from warehouse'
          };

          const { data: newPO, error: createError } = await supabase
            .from('purchase_orders')
            .insert([poRecord])
            .select()
            .single();

          if (createError) throw createError;

          // Step 5: Create line items
          const lineItems = inventoryItems.map((item, index) => ({
            po_id: newPO.id,
            project_equipment_id: item.id,
            line_number: index + 1,
            quantity_ordered: item.quantity_to_order,
            unit_cost: item.unit_cost || 0,
            notes: `From warehouse inventory: ${item.quantity_to_order} units`
          }));

          const { error: itemsError } = await supabase
            .from('purchase_order_items')
            .insert(lineItems);

          if (itemsError) throw itemsError;

          // Internal Inventory PO is now created as DRAFT (same as vendor POs)
          // PM must manually review and submit, which will trigger inventory decrement
          console.log('[PMOrderEquipment] ✅ Created Internal Inventory PO as draft:', poNumber);
          createdPOs.push({
            po: { ...newPO, po_number: poNumber },
            items: inventoryItems,
            supplier: 'Internal Inventory'
          });
        } catch (invErr) {
          console.error('[PMOrderEquipment] Failed to generate inventory PO:', invErr);
          failedSuppliers.push(`Internal Inventory (${invErr.message})`);
        }
      }

      // Show results
      if (createdPOs.length > 0) {
        setSuccessMessage(`Successfully created ${createdPOs.length} purchase order(s)!`);
        setTimeout(() => setSuccessMessage(null), 5000);

        // Invalidate milestone cache so gauges refresh with new data
        milestoneCacheService.invalidate(projectId);
        console.log('✅ Invalidated milestone cache for project:', projectId);
      }

      if (failedSuppliers.length > 0) {
        setError(`Failed to create POs for: ${failedSuppliers.join(', ')}`);
        setTimeout(() => setError(null), 8000);
      }

      if (createdPOs.length === 0 && failedSuppliers.length === 0) {
        setError('No POs were created. Check console for details.');
        setTimeout(() => setError(null), 5000);
      }

      // Clear selections and reload
      console.log('✅ PO generation complete, clearing selections and reloading...');
      setSelectedItems({});
      await loadEquipment();
      await loadPurchaseOrders();
      console.log('✅ Data reloaded successfully');
    } catch (err) {
      console.error('❌ Failed to generate POs:', err);
      console.error('Error details:', JSON.stringify(err, null, 2));
      setError(err.message || 'Failed to generate purchase orders');
      setTimeout(() => setError(null), 5000);
    } finally {
      setSaving(false);
      console.log('🏁 PO generation process finished');
    }
  };

  const handleClosePOModal = () => {
    setPoModalOpen(false);
    setSelectedVendorForPO(null);
  };

  const handlePOSuccess = async (result) => {
    setSuccessMessage(`Purchase Order ${result.po.po_number} created successfully!`);
    setTimeout(() => setSuccessMessage(null), 5000);

    // Close the modal first
    handleClosePOModal();

    // Invalidate milestone cache so gauges refresh with new data
    milestoneCacheService.invalidate(projectId);

    // Reload equipment to reflect ordered quantities
    await loadEquipment();

    // Reload purchase orders list
    await loadPurchaseOrders();
  };

  // Render functions

  const renderVendorView = () => {
    // Group equipment by part_number AND source (supplier vs inventory)
    const groupedByPartNumber = equipment.reduce((acc, item) => {
      const partNumber = item.part_number || 'NO_PART_NUMBER';

      // Create supplier group
      if (!acc[partNumber]) {
        acc[partNumber] = {
          part_number: item.part_number,
          name: item.name,
          supplier: item.supplier,
          supplier_id: item.supplier_id,
          unit_cost: item.unit_cost || 0,
          items: [], // Store all individual equipment items
          quantity_required: 0,
          quantity_on_hand: item.quantity_on_hand || 0, // From global_part (same for all items with this part number)
          quantity_from_inventory: 0, // NEW: Track inventory allocation
          quantity_in_draft_pos: 0,
          quantity_ordered: 0,
          quantity_needed: 0,
          has_draft_po_only: false
        };
      }

      // Aggregate quantities
      acc[partNumber].items.push(item);
      acc[partNumber].quantity_required += (item.quantity_required || 0);
      acc[partNumber].quantity_from_inventory += (item.quantity_from_inventory || 0);
      acc[partNumber].quantity_in_draft_pos += (item.quantity_in_draft_pos || 0);
      acc[partNumber].quantity_ordered += (item.quantity_ordered || 0);
      acc[partNumber].quantity_needed += (item.quantity_needed || 0);

      // If ANY location has draft PO only, mark the group
      if (item.has_draft_po_only) {
        acc[partNumber].has_draft_po_only = true;
      }

      return acc;
    }, {});

    const groupedEquipment = Object.values(groupedByPartNumber);

    // Split into supplier items and inventory items
    const supplierGroups = groupedEquipment.filter(group => group.quantity_needed > 0);
    const inventoryGroups = groupedEquipment
      .filter(group => group.quantity_from_inventory > 0)
      .map(group => ({
        ...group,
        supplier: 'Internal Inventory',
        supplier_id: 'inventory', // Special marker for inventory
        isInventory: true,
        quantity_needed: group.quantity_from_inventory, // For inventory, "needed" = what comes from inventory
        // Copy items but ensure each item has quantity_from_inventory set
        // This allows the expansion loop to find items to include
        items: group.items.map((item, idx) => ({
          ...item,
          // Distribute the inventory quantity across items (first item gets all for simplicity)
          quantity_from_inventory: idx === 0 ? group.quantity_from_inventory : 0
        }))
      }));

    // Combine both for display
    const availableGroups = [...supplierGroups, ...inventoryGroups];

    const selectedCount = Object.keys(selectedItems).length;
    const selectedTotal = Object.keys(selectedItems).reduce((sum, partNumber) => {
      const group = groupedEquipment.find(g => (g.part_number || 'NO_PART_NUMBER') === partNumber);
      if (!group) return sum;
      const qty = selectedItems[partNumber].quantity;
      return sum + (qty * (group.unit_cost || 0));
    }, 0);

    if (equipment.length === 0) {
      return (
        <div style={sectionStyles.card} className="text-center py-8">
          <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p className="text-gray-500 dark:text-gray-400">
            No equipment found for this phase
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {/* Selection Controls */}
        <div style={sectionStyles.card} className="bg-violet-50 dark:bg-violet-900/10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Select Items to Order
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Choose which items to include in purchase orders. System will automatically group by vendor.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleSelectAllByPartNumber(availableGroups)}
                disabled={availableGroups.length === 0}
              >
                Select All ({availableGroups.length})
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleClearSelection}
                disabled={selectedCount === 0}
              >
                Clear
              </Button>
            </div>
          </div>

          {selectedCount > 0 && (
            <div className="flex items-center justify-between p-4 bg-white dark:bg-zinc-800 rounded-lg border-2 border-violet-500">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {selectedCount} part number{selectedCount !== 1 ? 's' : ''} selected
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Total: ${selectedTotal.toFixed(2)}
                </p>
              </div>
              <Button
                variant="primary"
                icon={FileText}
                onClick={() => handleGeneratePOsFromSelection(groupedEquipment)}
                disabled={saving}
              >
                {saving ? 'Generating...' : 'Generate POs'}
              </Button>
            </div>
          )}
        </div>

        {/* Equipment List with Checkboxes - Grouped by Part Number */}
        <div style={sectionStyles.card}>
          <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
            Available Equipment ({availableGroups.length} available, {groupedEquipment.length} total part numbers)
          </h3>
          <div className="space-y-2">
            {availableGroups.map((group) => renderCheckboxItem(group))}
          </div>

          {/* Show greyed out items that are fully ordered */}
          {groupedEquipment.filter(g => g.quantity_needed === 0 && g.quantity_from_inventory === 0).length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Fully Ordered ({groupedEquipment.filter(g => g.quantity_needed === 0 && g.quantity_from_inventory === 0).length})
              </h4>
              <div className="space-y-2">
                {groupedEquipment
                  .filter(g => g.quantity_needed === 0 && g.quantity_from_inventory === 0)
                  .map((group) => renderCheckboxItem(group))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render equipment item with checkbox for PO generation (now grouped by part number)
  const renderCheckboxItem = (group) => {
    const required = group.quantity_required || 0;
    const needed = group.quantity_needed || 0;
    const inDraft = group.quantity_in_draft_pos || 0;
    const ordered = group.quantity_ordered || 0;
    const hasDraftOnly = group.has_draft_po_only;
    const partNumberKey = group.part_number || 'NO_PART_NUMBER';
    const isSelected = selectedItems[partNumberKey]?.selected || false;
    const selectedQty = selectedItems[partNumberKey]?.quantity || needed;
    const isDisabled = needed === 0;
    const locationCount = group.items?.length || 0;
    const hasMissingSupplier = !group.supplier_id && !group.isInventory;

    return (
      <div
        key={partNumberKey}
        className={`p-4 rounded-lg border transition-all ${isDisabled
          ? 'bg-gray-50 dark:bg-zinc-800/30 border-gray-200 dark:border-gray-700 opacity-50'
          : hasDraftOnly
            ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-400 dark:border-orange-600 border-2'
            : isSelected
              ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-500 border-2'
              : 'bg-white dark:bg-zinc-800 border-gray-200 dark:border-gray-700 hover:border-violet-300'
          }`}
      >
        <div className="flex items-start gap-4">
          {/* Checkbox */}
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => handleItemSelectionByPartNumber(partNumberKey, e.target.checked, needed, group)}
            disabled={isDisabled}
            className="mt-1 w-5 h-5 rounded border-gray-300 text-violet-600 focus:ring-violet-500 disabled:opacity-50"
          />

          {/* Item Details */}
          <div className="flex-1">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h4 className="font-semibold text-gray-900 dark:text-white">
                  {group.name || 'Unnamed Item'}
                </h4>
                {group.part_number && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Part #: {group.part_number}
                  </p>
                )}
                {group.supplier && (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Supplier: {group.supplier}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        loadAllSuppliers();
                        setEditingEquipmentId(partNumberKey + '_edit');
                      }}
                      className="p-1 text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 rounded"
                      title="Change supplier"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {/* Inline supplier editor when editing existing supplier */}
                {editingEquipmentId === partNumberKey + '_edit' && (
                  <div className="mt-2 p-2 bg-violet-50 dark:bg-violet-900/20 border border-violet-300 dark:border-violet-600 rounded-lg">
                    <label className="block text-xs font-medium text-violet-900 dark:text-violet-100 mb-1">
                      Change supplier:
                    </label>
                    <div className="flex gap-2">
                      <select
                        className="flex-1 px-3 py-2 text-sm border border-violet-300 dark:border-violet-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500"
                        defaultValue={group.supplier_id || ''}
                        onChange={(e) => {
                          const selectedSupplier = allSuppliers.find(s => s.id === e.target.value);
                          if (selectedSupplier) {
                            const equipmentIds = group.items.map(item => item.id);
                            handleUpdateEquipmentSupplier(equipmentIds, selectedSupplier.id, selectedSupplier.name);
                          }
                        }}
                        disabled={saving || loadingSuppliers}
                      >
                        <option value="" disabled>
                          {loadingSuppliers ? 'Loading suppliers...' : '-- Select Supplier --'}
                        </option>
                        {allSuppliers.map(supplier => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.name} ({supplier.short_code})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setEditingEquipmentId(null)}
                        className="px-3 py-2 text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-800 rounded-lg"
                        title="Cancel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Used in {locationCount} location{locationCount !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  ${((group.unit_cost || 0) * needed).toFixed(2)}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  ${(group.unit_cost || 0).toFixed(2)} each
                </p>
              </div>
            </div>

            {/* Quantity Info */}
            <div className="grid grid-cols-5 gap-4 text-sm mb-2">
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Required</p>
                <p className="font-semibold text-gray-900 dark:text-white">{required}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: '#94AF32' }}>On Hand</p>
                <p className="font-semibold" style={{ color: '#94AF32' }}>{group.quantity_on_hand || 0}</p>
              </div>
              {inDraft > 0 && (
                <div>
                  <p className="text-xs text-orange-600 dark:text-orange-400">In Draft PO</p>
                  <p className="font-semibold text-orange-700 dark:text-orange-300">{inDraft}</p>
                </div>
              )}
              {ordered > 0 && (
                <div>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Ordered</p>
                  <p className="font-semibold text-blue-700 dark:text-blue-300">{ordered}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">To Order</p>
                <p className={`font-semibold ${needed > 0 ? 'text-violet-700 dark:text-violet-300' : 'text-gray-500'}`}>
                  {needed}
                </p>
              </div>
            </div>

            {/* Warning Banner for Draft PO */}
            {hasDraftOnly && (
              <div className="mb-3 p-3 bg-orange-100 dark:bg-orange-900/30 border border-orange-400 dark:border-orange-600 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-orange-700 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-orange-900 dark:text-orange-100">
                      ⚠️ In Draft PO - Not Yet Submitted
                    </p>
                    <p className="text-xs text-orange-800 dark:text-orange-200 mt-1">
                      {inDraft} units are in a draft PO. Go to <strong>Active POs</strong> tab to submit the PO, or this part will remain in "needs ordering" status.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Warning Banner for Missing Supplier - with inline edit */}
            {hasMissingSupplier && (
              <div className="mb-3 p-3 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-700 dark:text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                      ⚠️ Missing Supplier Information
                    </p>
                    {editingEquipmentId === partNumberKey ? (
                      <div className="mt-2">
                        <label className="block text-xs font-medium text-red-900 dark:text-red-100 mb-1">
                          Select a supplier:
                        </label>
                        <div className="flex gap-2">
                          <select
                            className="flex-1 px-3 py-2 text-sm border border-red-300 dark:border-red-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-red-500"
                            defaultValue=""
                            onChange={(e) => {
                              const selectedSupplier = allSuppliers.find(s => s.id === e.target.value);
                              if (selectedSupplier) {
                                const equipmentIds = group.items.map(item => item.id);
                                handleUpdateEquipmentSupplier(equipmentIds, selectedSupplier.id, selectedSupplier.name);
                              }
                            }}
                            disabled={saving || loadingSuppliers}
                          >
                            <option value="" disabled>
                              {loadingSuppliers ? 'Loading suppliers...' : '-- Select Supplier --'}
                            </option>
                            {allSuppliers.map(supplier => (
                              <option key={supplier.id} value={supplier.id}>
                                {supplier.name} ({supplier.short_code})
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => setEditingEquipmentId(null)}
                            className="px-3 py-2 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800 rounded-lg"
                            title="Cancel"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-red-800 dark:text-red-200">
                          This item has no supplier assigned. Assign a supplier to generate a PO.
                        </p>
                        <button
                          onClick={() => {
                            loadAllSuppliers();
                            setEditingEquipmentId(partNumberKey);
                          }}
                          className="ml-2 px-3 py-1 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1"
                        >
                          <Edit2 className="w-3 h-3" />
                          Assign Supplier
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Editable Quantity for Selected Items */}
            {isSelected && (
              <div className="mt-3 p-3 bg-white dark:bg-zinc-900 rounded border border-violet-300">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Quantity to Order
                </label>
                <input
                  type="number"
                  min="1"
                  max={needed}
                  value={selectedQty}
                  onChange={(e) => handleSelectedQuantityChangeByPartNumber(partNumberKey, parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Max: {needed} (still needed across all locations)
                </p>
              </div>
            )}

            {/* Status Messages */}
            {isDisabled && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                ✓ All quantities accounted for in POs
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 pb-20 transition-colors">
      <div className="max-w-7xl mx-auto px-4 py-6">
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

        {/* Tab Selector - Ordered by procurement workflow */}
        <div style={sectionStyles.card} className="mb-6">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setTab('inventory')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${tab === 'inventory'
                ? 'bg-violet-600 text-white'
                : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
            >
              <Package className="w-4 h-4" />
              Inventory
            </button>
            <button
              onClick={() => setTab('prewire')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${tab === 'prewire'
                ? 'bg-violet-600 text-white'
                : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
            >
              Prewire Prep
            </button>
            <button
              onClick={() => setTab('trim')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${tab === 'trim'
                ? 'bg-violet-600 text-white'
                : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
            >
              Trim Prep
            </button>
            <button
              onClick={() => setTab('pos')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${tab === 'pos'
                ? 'bg-violet-600 text-white'
                : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
            >
              Active POs
            </button>
            <button
              onClick={() => setTab('vendors')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${tab === 'vendors'
                ? 'bg-violet-600 text-white'
                : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
            >
              <Settings className="w-4 h-4" />
              Vendors
            </button>
            {/* Issues tab - only visible when there are open receiving issues */}
            {receivingIssues.length > 0 && (
              <button
                onClick={() => setTab('issues')}
                className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${tab === 'issues'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 border-2 border-red-500'
                  }`}
              >
                <AlertCircle className="w-4 h-4" />
                Issues ({receivingIssues.length})
              </button>
            )}
          </div>
        </div>

        {/* Create POs View (for prewire/trim tabs) */}
        {(tab === 'prewire' || tab === 'trim') && (
          <>
            {/* Procurement Progress Gauge */}
            <div className="mb-6">
              <ProcurementProgressGauge
                equipment={equipment}
                phaseName={tab === 'prewire' ? 'Prewire' : 'Trim'}
              />
            </div>

            {/* Content - Create POs View */}
            {renderVendorView()}
          </>
        )}

        {/* Inventory Tab Content */}
        {tab === 'inventory' && (
          <InventoryManager projectId={projectId} />
        )}

        {/* Active POs Tab Content */}
        {tab === 'pos' && (
          <div>
            {purchaseOrders.length === 0 ? (
              <div style={sectionStyles.card} className="text-center py-12">
                <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-gray-500 dark:text-gray-400">
                  No purchase orders yet. Create one from the Prewire or Trim tabs.
                </p>
              </div>
            ) : (
              <>
                {/* PENDING POs Section (Drafts) */}
                {(() => {
                  const pendingPOs = purchaseOrders.filter(po => po.status === 'draft');
                  return pendingPOs.length > 0 && (
                    <div style={sectionStyles.card} className="mb-6">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="text-amber-600 dark:text-amber-400 text-lg font-bold">⚠️</div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                          Pending POs ({pendingPOs.length})
                        </h2>
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          - Draft orders not yet submitted
                        </span>
                      </div>

                      <div className="space-y-3">
                        {pendingPOs.map((po) => (
                          <div
                            key={po.id}
                            style={sectionStyles.card}
                            className="border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h3 className="font-semibold text-gray-900 dark:text-white">
                                    {po.po_number}
                                  </h3>
                                  <span className="px-2 py-1 text-xs font-medium rounded bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-300">
                                    Draft
                                  </span>
                                  <span className="px-2 py-1 text-xs font-medium rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                                    {po.milestone_stage === 'prewire_prep' ? 'Prewire' : 'Trim'}
                                  </span>
                                </div>

                                <div className="mb-3 p-2 bg-amber-100 dark:bg-amber-900/30 rounded text-xs text-amber-800 dark:text-amber-200 font-medium">
                                  ⚠️ Draft PO - Not yet submitted to supplier. Click to review and submit.
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                  <div>
                                    <p className="text-gray-600 dark:text-gray-400 text-xs">Supplier</p>
                                    <p className="font-medium text-gray-900 dark:text-white">
                                      {po.supplier?.name || 'Unknown'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-gray-600 dark:text-gray-400 text-xs">Order Date</p>
                                    <p className="font-medium text-gray-900 dark:text-white">
                                      {po.order_date ? <DateField date={po.order_date} variant="inline" /> : 'N/A'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-gray-600 dark:text-gray-400 text-xs">Items</p>
                                    <p className="font-medium text-gray-900 dark:text-white">
                                      {po.itemCount || 0}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-gray-600 dark:text-gray-400 text-xs">Total</p>
                                    <p className="font-medium text-gray-900 dark:text-white">
                                      ${(po.total_amount || 0).toFixed(2)}
                                    </p>
                                  </div>
                                </div>

                                {po.internal_notes && (
                                  <div className="mt-3 p-2 bg-gray-50 dark:bg-zinc-800/50 rounded text-xs">
                                    <p className="text-gray-600 dark:text-gray-400">
                                      <strong>Notes:</strong> {po.internal_notes}
                                    </p>
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-col gap-2 ml-4">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedPOId(po.id);
                                    setPoDetailsModalOpen(true);
                                  }}
                                >
                                  View Details
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* SUBMITTED POs Section */}
                {(() => {
                  const submittedPOs = purchaseOrders.filter(po => po.status !== 'draft');
                  return submittedPOs.length > 0 && (
                    <div style={sectionStyles.card} className="mb-6">
                      <div className="flex items-center gap-2 mb-4">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                          Submitted POs ({submittedPOs.length})
                        </h2>
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          - Orders sent to suppliers
                        </span>
                      </div>

                      <div className="space-y-3">
                        {submittedPOs.map((po) => {
                          // Check if this PO has open issues - match using full PO number
                          const hasOpenIssues = po.po_number && openIssuesByPO[po.po_number] > 0;
                          const issueCount = hasOpenIssues ? openIssuesByPO[po.po_number] : 0;

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
                            className={`border-l-4 ${hasOpenIssues ? 'border-l-red-500 bg-red-50 dark:bg-red-900/10' : 'border-violet-500'}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h3 className="font-semibold text-gray-900 dark:text-white">
                                    {po.po_number}
                                  </h3>
                                  <span
                                    className={`px-2 py-1 text-xs font-medium rounded ${po.status === 'submitted' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                                      po.status === 'confirmed' ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300' :
                                        'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300'
                                    }`}
                                    style={po.status === 'received' ? { backgroundColor: 'rgba(148, 175, 50, 0.15)', color: '#94AF32' } : {}}
                                  >
                                    {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                                  </span>
                                  <span className="px-2 py-1 text-xs font-medium rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                                    {po.milestone_stage === 'prewire_prep' ? 'Prewire' : 'Trim'}
                                  </span>
                                  {hasOpenIssues && (
                                    <span className="px-2 py-1 text-xs font-medium rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 flex items-center gap-1">
                                      <AlertCircle className="w-3 h-3" />
                                      {issueCount} Issue{issueCount > 1 ? 's' : ''}
                                    </span>
                                  )}
                                </div>

                                {/* Issue warning banner */}
                                {hasOpenIssues && (
                                  <div className="mb-3 p-2 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-600 rounded text-xs text-red-800 dark:text-red-200 flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    <span>This PO has {issueCount} open receiving issue{issueCount > 1 ? 's' : ''} that need attention.</span>
                                  </div>
                                )}

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                  <div>
                                    <p className="text-gray-600 dark:text-gray-400 text-xs">Supplier</p>
                                    <p className="font-medium text-gray-900 dark:text-white">
                                      {po.supplier?.name || 'Unknown'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-gray-600 dark:text-gray-400 text-xs">Order Date</p>
                                    <p className="font-medium text-gray-900 dark:text-white">
                                      {po.order_date ? <DateField date={po.order_date} variant="inline" /> : 'N/A'}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-gray-600 dark:text-gray-400 text-xs">Items</p>
                                    <p className="font-medium text-gray-900 dark:text-white">
                                      {po.itemCount || 0}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-gray-600 dark:text-gray-400 text-xs">Total</p>
                                    <p className="font-medium text-gray-900 dark:text-white">
                                      ${(po.total_amount || 0).toFixed(2)}
                                    </p>
                                  </div>
                                </div>

                                {po.internal_notes && (
                                  <div className="mt-3 p-2 bg-gray-50 dark:bg-zinc-800/50 rounded text-xs">
                                    <p className="text-gray-600 dark:text-gray-400">
                                      <strong>Notes:</strong> {po.internal_notes}
                                    </p>
                                  </div>
                                )}

                                {/* Tracking Info */}
                                {po.tracking && po.tracking.length > 0 && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {po.tracking.map((t) => (
                                      <button
                                        key={t.id}
                                        onClick={() => {
                                          navigator.clipboard.writeText(t.tracking_number);
                                          window.open(`https://www.google.com/search?q=${encodeURIComponent(t.tracking_number)}`, '_blank');
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors cursor-pointer"
                                        title="Click to copy and search tracking number"
                                      >
                                        <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                        <span className="font-mono text-xs font-semibold text-blue-900 dark:text-blue-100">
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

                              <div className="flex flex-col gap-2 ml-4">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedPOId(po.id);
                                    setPoDetailsModalOpen(true);
                                  }}
                                >
                                  View Details
                                </Button>
                              </div>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* Issues Tab Content */}
        {tab === 'issues' && (
          <div>
            <div style={sectionStyles.card} className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Receiving Issues ({receivingIssues.length})
                </h2>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                These are open issues reported during parts receiving. Each issue is linked to a PO and needs attention before the PO can be considered fully received.
              </p>

              {receivingIssues.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3" style={{ color: '#94AF32' }} />
                  <p className="text-gray-600 dark:text-gray-400">
                    No open receiving issues. Great job!
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {receivingIssues.map((issue) => {
                    // Extract PO number from title - match full PO number format
                    const poMatch = issue.title.match(/\(PO\s+([^)]+)\)/);
                    const poNumber = poMatch ? poMatch[1].trim() : null;
                    const linkedPO = poNumber ? purchaseOrders.find(po => po.po_number === poNumber) : null;

                    return (
                      <div
                        key={issue.id}
                        className="p-4 border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 rounded-lg"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900 dark:text-white">
                              {issue.title}
                            </h3>
                            <div className="flex items-center gap-4 mt-2 text-sm">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                issue.status === 'blocked'
                                  ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                  : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                              }`}>
                                {issue.status}
                              </span>
                              <span className="text-gray-600 dark:text-gray-400">
                                Created: {new Date(issue.created_at).toLocaleDateString()}
                              </span>
                              {linkedPO && (
                                <span className="text-gray-600 dark:text-gray-400">
                                  Supplier: {linkedPO.supplier?.name || 'Unknown'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {linkedPO && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setSelectedPOId(linkedPO.id);
                                  setPoDetailsModalOpen(true);
                                }}
                              >
                                View PO
                              </Button>
                            )}
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => navigate(`/project/${projectId}/issues/${issue.id}`)}
                            >
                              View Issue
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Vendors Tab Content */}
        {tab === 'vendors' && (
          <SupplierManager />
        )}
      </div>

      {/* PO Generation Modal */}
      {selectedVendorForPO && (
        <POGenerationModal
          isOpen={poModalOpen}
          onClose={handleClosePOModal}
          projectId={projectId}
          supplierId={selectedVendorForPO.supplierId}
          supplierName={selectedVendorForPO.supplierName}
          milestoneStage={selectedVendorForPO.milestoneStage}
          equipmentItems={selectedVendorForPO.equipment}
          onSuccess={handlePOSuccess}
          projectDefaultShippingId={projectDefaultShippingId}
        />
      )}

      {/* PO Details Modal */}
      <PODetailsModal
        isOpen={poDetailsModalOpen}
        onClose={() => {
          setPoDetailsModalOpen(false);
          setSelectedPOId(null);
        }}
        poId={selectedPOId}
        onUpdate={() => {
          console.log('[PMOrderEquipmentPage] onUpdate callback triggered - reloading POs and equipment');
          loadPurchaseOrders();
          // Always reload equipment to update gauges, regardless of current tab
          loadEquipment();
          // Invalidate milestone cache so gauges refresh with new data
          milestoneCacheService.invalidate(projectId);
        }}
        onDelete={(deletedPOId) => {
          setPurchaseOrders(prev => prev.filter(p => p.id !== deletedPOId));
          setPoDetailsModalOpen(false);
          setSelectedPOId(null);
          setSuccessMessage('Purchase order deleted successfully');
          setTimeout(() => setSuccessMessage(null), 3000);
          // Always reload equipment to update ordered quantities and gauges
          loadEquipment();
          // Invalidate milestone cache so gauges refresh with new data
          milestoneCacheService.invalidate(projectId);
        }}
      />
    </div>
  );
};

export default PMOrderEquipmentPageEnhanced;
