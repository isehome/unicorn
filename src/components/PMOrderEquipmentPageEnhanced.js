import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import { supabase } from '../lib/supabase';
import { projectEquipmentService } from '../services/projectEquipmentService';
import { milestoneCacheService } from '../services/milestoneCacheService';
import { poGeneratorService } from '../services/poGeneratorService';
import { trackingService } from '../services/trackingService';
import Button from './ui/Button';
import POGenerationModal from './procurement/POGenerationModal';
import PODetailsModal from './procurement/PODetailsModal';
import {
  Package,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Loader,
  ShoppingCart,
  DollarSign,
  List,
  Grid,
  FileText,
  ChevronDown,
  ChevronRight,
  Truck,
  Building2,
  Calendar,
  DollarSign as DollarSignIcon
} from 'lucide-react';

const PMOrderEquipmentPageEnhanced = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];

  // State
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [equipment, setEquipment] = useState([]);
  const [vendorGroups, setVendorGroups] = useState({});
  const [vendorStats, setVendorStats] = useState({});

  // Tab state (removed viewMode - only Create POs view now)
  const [tab, setTab] = useState('prewire'); // 'prewire', 'trim', 'pos'

  // Active POs state
  const [purchaseOrders, setPurchaseOrders] = useState([]);

  // Messages
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Vendor expansion state
  const [expandedVendors, setExpandedVendors] = useState({});

  // PO Generation Modal state
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [selectedVendorForPO, setSelectedVendorForPO] = useState(null);

  // PO Details Modal state
  const [poDetailsModalOpen, setPoDetailsModalOpen] = useState(false);
  const [selectedPOId, setSelectedPOId] = useState(null);

  // Selected items for PO generation (checkbox-based selection)
  // Format: { itemId: { selected: boolean, quantity: number } }
  const [selectedItems, setSelectedItems] = useState({});

  // Map phase to milestone_stage
  const getMilestoneStage = (phase) => {
    return phase === 'prewire' ? 'prewire_prep' : 'trim_prep';
  };

  useEffect(() => {
    if (tab === 'prewire' || tab === 'trim') {
      loadEquipment();
    } else if (tab === 'pos') {
      loadPurchaseOrders();
    }
  }, [projectId, tab]);

  // No longer need to load vendor grouping - checkbox view uses equipment directly

  const loadEquipment = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await projectEquipmentService.fetchProjectEquipmentByPhase(projectId, tab);

      // Also load ALL purchase orders to check for items already in POs
      const { data: pos } = await supabase
        .from('purchase_orders')
        .select(`
          id,
          status,
          items:purchase_order_items(
            project_equipment_id,
            quantity_ordered
          )
        `)
        .eq('project_id', projectId);

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
        const remaining = Math.max(0, required - totalInPOs);

        return {
          ...item,
          quantity_required: required, // Normalize field name
          quantity_in_draft_pos: inDraft,
          quantity_ordered: inSubmitted, // This is the "actually ordered" amount
          in_any_po: totalInPOs > 0,
          quantity_needed: remaining,
          has_draft_po_only: inDraft > 0 && inSubmitted === 0 // Orange warning flag
        };
      });

      // Debug logging
      console.log('Loaded equipment data with PO status:', enriched);

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

  const loadVendorGrouping = async () => {
    try {
      const milestoneStage = getMilestoneStage(tab);
      const { grouped, stats } = await poGeneratorService.getEquipmentGroupedForPO(
        projectId,
        milestoneStage
      );

      // Check for existing POs for this milestone stage and supplier
      const { data: existingPOs } = await supabase
        .from('purchase_orders')
        .select('supplier_id, status')
        .eq('project_id', projectId)
        .eq('milestone_stage', milestoneStage);

      // Add PO status to each vendor group
      const enrichedGroups = Object.entries(grouped).reduce((acc, [key, group]) => {
        const vendorPOs = (existingPOs || []).filter(po => po.supplier_id === group.supplier?.id);
        const hasDraftPO = vendorPOs.some(po => po.status === 'draft');
        const hasSubmittedPO = vendorPOs.some(po => po.status === 'submitted');

        acc[key] = {
          ...group,
          hasDraftPO,
          hasSubmittedPO,
          poCount: vendorPOs.length
        };
        return acc;
      }, {});

      setVendorGroups(enrichedGroups);
      setVendorStats(stats);
    } catch (err) {
      console.error('Failed to load vendor grouping:', err);
      setError('Failed to group equipment by vendor');
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

  const toggleVendorExpansion = (vendorName) => {
    setExpandedVendors(prev => ({
      ...prev,
      [vendorName]: !prev[vendorName]
    }));
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

  // Select all available part numbers
  const handleSelectAllByPartNumber = (groupedEquipment) => {
    const availableGroups = groupedEquipment.filter(group => group.quantity_remaining > 0);
    const newSelection = {};
    availableGroups.forEach(group => {
      const partNumber = group.part_number || 'NO_PART_NUMBER';
      newSelection[partNumber] = {
        selected: true,
        quantity: group.quantity_remaining,
        group: group
      };
    });
    setSelectedItems(newSelection);
  };

  // Clear all selections
  const handleClearSelection = () => {
    setSelectedItems({});
  };

  // Legacy handlers (kept for backward compatibility)
  const handleItemSelection = (itemId, isChecked, defaultQuantity) => {
    setSelectedItems(prev => {
      if (isChecked) {
        return {
          ...prev,
          [itemId]: {
            selected: true,
            quantity: defaultQuantity
          }
        };
      } else {
        const { [itemId]: removed, ...rest } = prev;
        return rest;
      }
    });
  };

  const handleSelectedQuantityChange = (itemId, newQuantity) => {
    setSelectedItems(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        quantity: newQuantity
      }
    }));
  };

  // Generate POs from selected items (now works with part number groups)
  const handleGeneratePOsFromSelection = async (groupedEquipment) => {
    const selectedCount = Object.keys(selectedItems).length;
    if (selectedCount === 0) {
      setError('Please select at least one item to generate POs');
      setTimeout(() => setError(null), 3000);
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // Expand part number selections back to individual equipment items
      const expandedEquipment = [];
      Object.entries(selectedItems).forEach(([partNumber, selection]) => {
        const group = selection.group;
        const quantityToOrder = selection.quantity;

        // Distribute quantity across individual items in the group
        // For simplicity, we'll order from items proportionally based on their remaining quantity
        let remainingToOrder = quantityToOrder;

        group.items.forEach((item, index) => {
          const itemNeeded = item.quantity_needed || 0; // FIXED: Use new field name
          if (itemNeeded > 0 && remainingToOrder > 0) {
            const quantityForThisItem = Math.min(itemNeeded, remainingToOrder);
            expandedEquipment.push({
              ...item,
              quantity_to_order: quantityForThisItem
            });
            remainingToOrder -= quantityForThisItem;
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

      // Group by supplier
      const groupedBySupplier = {};
      expandedEquipment.forEach(item => {
        const supplierName = item.supplier || 'Unassigned';
        if (!groupedBySupplier[supplierName]) {
          groupedBySupplier[supplierName] = [];
        }
        groupedBySupplier[supplierName].push(item);
      });

      const supplierNames = Object.keys(groupedBySupplier);

      // Debug: Log grouped suppliers
      console.log('🔍 Grouped by supplier:', groupedBySupplier);

      // Filter out suppliers without supplier_id
      const validSuppliers = supplierNames.filter(name => {
        const items = groupedBySupplier[name];
        const hasValidSupplier = items[0].supplier_id != null;
        if (!hasValidSupplier) {
          console.warn(`⚠️ Supplier "${name}" has no supplier_id. Items:`, items);
        }
        return hasValidSupplier;
      });

      // Show preview confirmation
      const confirmMessage = `This will create ${validSuppliers.length} PO(s):\n\n` +
        validSuppliers.map(name => {
          const items = groupedBySupplier[name];
          const total = items.reduce((sum, item) => sum + (item.quantity_to_order * (item.unit_cost || 0)), 0);
          return `• ${name}: ${items.length} line items ($${total.toFixed(2)})`;
        }).join('\n') +
        (validSuppliers.length === 0 ? '\n⚠️ WARNING: No valid suppliers found. Items may be missing supplier_id.' : '') +
        `\n\nContinue?`;

      if (!window.confirm(confirmMessage)) {
        setSaving(false);
        return;
      }

      if (validSuppliers.length === 0) {
        setError('Cannot create POs: Selected items are missing supplier_id. Please ensure equipment is linked to suppliers in the database.');
        setSaving(false);
        return;
      }

      // Create POs for each supplier - CUSTOM IMPLEMENTATION for partial quantities
      const createdPOs = [];
      const failedSuppliers = [];

      for (const supplierName of validSuppliers) {
        const items = groupedBySupplier[supplierName];
        const supplier = items[0].supplier_id; // Already validated above

        try {
          // Step 1: Generate PO number
          const { data: poNumber, error: poNumberError } = await supabase
            .rpc('generate_po_number', { p_supplier_id: supplier });

          if (poNumberError) throw poNumberError;

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
            created_by: 'user',
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

      if (createdPOs.length > 0) {
        setSuccessMessage(`Successfully created ${createdPOs.length} purchase order(s)!`);
        setTimeout(() => setSuccessMessage(null), 5000);
      }

      if (failedSuppliers.length > 0) {
        setError(`Failed to create POs for: ${failedSuppliers.join(', ')}`);
        setTimeout(() => setError(null), 8000);
      }

      if (createdPOs.length === 0) {
        setError('No POs were created. Check console for details.');
        setTimeout(() => setError(null), 5000);
      }

      // Clear selections and reload
      setSelectedItems({});
      await loadEquipment();
      await loadPurchaseOrders();
    } catch (err) {
      console.error('Failed to generate POs:', err);
      setError(err.message || 'Failed to generate purchase orders');
      setTimeout(() => setError(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenPOModal = (csvName, groupData) => {
    // Filter out equipment that's already fully ordered
    const unorderedEquipment = groupData.equipment.filter(item => {
      const planned = item.planned_quantity || item.quantity || 0;
      const ordered = item.ordered_quantity || 0;
      return ordered < planned; // Only include if there's still quantity to order
    });

    if (unorderedEquipment.length === 0) {
      setError('All items from this vendor have already been ordered');
      setTimeout(() => setError(null), 3000);
      return;
    }

    // Warn if a PO already exists for this vendor in this phase
    if (groupData.hasDraftPO) {
      const phaseName = tab === 'prewire' ? 'Prewire' : 'Trim';
      if (!window.confirm(
        `A draft PO already exists for ${groupData.supplier?.name || csvName} in ${phaseName} phase.\n\n` +
        `Creating another PO will create a SECOND purchase order for this vendor in the same phase.\n\n` +
        `Are you sure you want to continue?`
      )) {
        return;
      }
    }

    if (groupData.hasSubmittedPO) {
      const phaseName = tab === 'prewire' ? 'Prewire' : 'Trim';
      if (!window.confirm(
        `A submitted PO already exists for ${groupData.supplier?.name || csvName} in ${phaseName} phase.\n\n` +
        `Creating another PO will create an ADDITIONAL purchase order for this vendor in the same phase.\n\n` +
        `This is usually only needed for split deliveries or additional items.\n\n` +
        `Are you sure you want to continue?`
      )) {
        return;
      }
    }

    setSelectedVendorForPO({
      csvName,
      supplierId: groupData.supplier?.id,
      supplierName: groupData.supplier?.name || csvName,
      equipment: unorderedEquipment,
      milestoneStage: getMilestoneStage(tab)
    });
    setPoModalOpen(true);
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

    // Reload equipment to reflect ordered quantities
    await loadEquipment();

    // Reload purchase orders list
    await loadPurchaseOrders();
  };


  const getItemStatus = (item) => {
    const planned = item.planned_quantity || 0;
    const ordered = item.ordered_quantity || 0;
    const received = item.received_quantity || 0;

    if (received >= planned && received > 0) {
      return { label: 'Received', color: 'text-green-600 dark:text-green-400', icon: CheckCircle };
    }
    if (ordered >= planned && ordered > 0) {
      return { label: 'Ordered', color: 'text-blue-600 dark:text-blue-400', icon: ShoppingCart };
    }
    if (ordered > 0 && ordered < planned) {
      return { label: 'Partial Order', color: 'text-yellow-600 dark:text-yellow-400', icon: AlertCircle };
    }
    return { label: 'Not Ordered', color: 'text-gray-500 dark:text-gray-400', icon: Package };
  };

  const calculateTotalCost = () => {
    return equipment.reduce((sum, item) => {
      const requiredQty = item.quantity_required || 0;
      const unitCost = item.unit_cost || 0;
      return sum + (requiredQty * unitCost);
    }, 0);
  };

  const calculateOrderedCost = () => {
    return equipment.reduce((sum, item) => {
      const orderedQty = item.quantity_ordered || 0;
      const unitCost = item.unit_cost || 0;
      return sum + (orderedQty * unitCost);
    }, 0);
  };

  const getMatchBadge = (groupData) => {
    const { matchStatus, matchConfidence } = groupData;

    if (matchStatus === 'matched') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs font-medium rounded">
          <CheckCircle className="w-3 h-3" />
          {Math.round(matchConfidence * 100)}% Match
        </span>
      );
    }

    if (matchStatus === 'needs_review') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 text-xs font-medium rounded">
          <AlertCircle className="w-3 h-3" />
          Review Needed
        </span>
      );
    }

    if (matchStatus === 'needs_creation') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium rounded">
          <Building2 className="w-3 h-3" />
          Will Create New
        </span>
      );
    }

    return null;
  };

  // Render functions

  const renderVendorView = () => {
    // Group equipment by part_number
    const groupedByPartNumber = equipment.reduce((acc, item) => {
      const partNumber = item.part_number || 'NO_PART_NUMBER';
      if (!acc[partNumber]) {
        acc[partNumber] = {
          part_number: item.part_number,
          name: item.name,
          supplier: item.supplier,
          supplier_id: item.supplier_id,
          unit_cost: item.unit_cost || 0,
          items: [], // Store all individual equipment items
          quantity_required: 0,
          quantity_in_draft_pos: 0,
          quantity_ordered: 0,
          quantity_needed: 0,
          has_draft_po_only: false
        };
      }

      // Aggregate quantities
      acc[partNumber].items.push(item);
      acc[partNumber].quantity_required += (item.quantity_required || 0);
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
    const availableGroups = groupedEquipment.filter(group => group.quantity_needed > 0);

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
                onClick={() => handleSelectAllByPartNumber(groupedEquipment)}
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
            <div className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border-2 border-violet-500">
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
            Available Equipment ({groupedEquipment.length} part numbers, {equipment.length} total items)
          </h3>
          <div className="space-y-2">
            {groupedEquipment.map((group) => renderCheckboxItem(group))}
          </div>
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

    return (
      <div
        key={partNumberKey}
        className={`p-4 rounded-lg border transition-all ${
          isDisabled
            ? 'bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700 opacity-50'
            : hasDraftOnly
            ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-400 dark:border-orange-600 border-2'
            : isSelected
            ? 'bg-violet-50 dark:bg-violet-900/20 border-violet-500 border-2'
            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-violet-300'
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
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Supplier: {group.supplier}
                  </p>
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
            <div className="grid grid-cols-4 gap-4 text-sm mb-2">
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Required</p>
                <p className="font-semibold text-gray-900 dark:text-white">{required}</p>
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
                <p className="text-xs text-gray-600 dark:text-gray-400">Needed</p>
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

            {/* Editable Quantity for Selected Items */}
            {isSelected && (
              <div className="mt-3 p-3 bg-white dark:bg-gray-900 rounded border border-violet-300">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Quantity to Order
                </label>
                <input
                  type="number"
                  min="1"
                  max={needed}
                  value={selectedQty}
                  onChange={(e) => handleSelectedQuantityChangeByPartNumber(partNumberKey, parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500"
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

  // Keep old vendor grouping view function stub for backwards compatibility
  const renderOldVendorView = () => {
    if (Object.keys(vendorGroups).length === 0) {
      return (
        <div style={sectionStyles.card} className="text-center py-8">
          <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p className="text-gray-500 dark:text-gray-400">
            No vendors found. Equipment may not have supplier information.
          </p>
        </div>
      );
    }

    const vendorEntries = Object.entries(vendorGroups);

    return (
      <div className="space-y-4">
        {/* Vendor Stats */}
        {vendorStats && (
          <div style={sectionStyles.card} className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">Total Vendors</p>
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {vendorStats.totalVendors || 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">Matched</p>
              <p className="text-xl font-bold text-green-600 dark:text-green-400">
                {vendorStats.matched || 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">Needs Review</p>
              <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">
                {vendorStats.needsReview || 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">New Vendors</p>
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {vendorStats.needsCreation || 0}
              </p>
            </div>
          </div>
        )}

        {/* Vendor Cards */}
        {vendorEntries.map(([csvName, groupData]) => {
          const isExpanded = expandedVendors[csvName];
          const supplierName = groupData.supplier?.name || csvName;

          // Check if all items from this vendor are already fully ordered
          const unorderedItems = groupData.equipment.filter(item => {
            const planned = item.planned_quantity || item.quantity || 0;
            const ordered = item.ordered_quantity || 0;
            return ordered < planned;
          });
          const allOrdered = unorderedItems.length === 0;

          return (
            <div
              key={csvName}
              style={sectionStyles.card}
              className={`border-l-4 ${allOrdered ? 'border-green-500 opacity-60' : 'border-violet-500'}`}
            >
              {/* Vendor Header */}
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleVendorExpansion(csvName)}
              >
                <div className="flex items-center gap-3 flex-1">
                  <div className={`p-2 rounded-lg ${allOrdered ? 'bg-green-100 dark:bg-green-900/30' : 'bg-violet-100 dark:bg-violet-900/30'}`}>
                    {allOrdered ? (
                      <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                    ) : (
                      <Building2 className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        {supplierName}
                      </h3>
                      {groupData.hasDraftPO && (
                        <span className="px-2 py-1 text-xs font-medium rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                          Draft PO Exists ({tab === 'prewire' ? 'Prewire' : 'Trim'})
                        </span>
                      )}
                      {groupData.hasSubmittedPO && (
                        <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                          PO Submitted ({tab === 'prewire' ? 'Prewire' : 'Trim'})
                        </span>
                      )}
                      {allOrdered && (
                        <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                          All Ordered
                        </span>
                      )}
                      {getMatchBadge(groupData)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mt-1">
                      <span>{groupData.equipment.length} items</span>
                      {!allOrdered && unorderedItems.length < groupData.equipment.length && (
                        <span className="text-yellow-600 dark:text-yellow-400">
                          ({unorderedItems.length} remaining)
                        </span>
                      )}
                      <span className="font-medium text-gray-900 dark:text-white">
                        ${groupData.totalCost.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!groupData.supplier?.id ? (
                    <div className="text-xs text-yellow-600 dark:text-yellow-400">
                      Supplier must be created first
                    </div>
                  ) : allOrdered ? (
                    <div className="text-xs text-green-600 dark:text-green-400 font-medium">
                      All items ordered
                    </div>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenPOModal(csvName, groupData);
                      }}
                    >
                      Generate PO
                    </Button>
                  )}
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Expanded Equipment List */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
                  {groupData.equipment.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm text-gray-900 dark:text-white">
                          {item.name || item.description}
                        </p>
                        {item.part_number && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Part #: {item.part_number}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-600 dark:text-gray-400">
                          Qty: {item.planned_quantity || item.quantity || 0}
                        </span>
                        <span className="font-medium text-gray-900 dark:text-white">
                          ${((item.planned_quantity || item.quantity || 0) * (item.unit_cost || 0)).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Bulk Generate Button */}
        {vendorEntries.length > 0 && (
          <div style={sectionStyles.card} className="bg-violet-50 dark:bg-violet-900/10">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Generate All Purchase Orders
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Create POs for all {vendorEntries.length} vendors in this milestone
                </p>
              </div>
              <Button
                variant="primary"
                icon={FileText}
                onClick={() => alert('Bulk PO generation coming soon!')}
              >
                Generate All POs
              </Button>
            </div>
          </div>
        )}
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

  const totalCost = calculateTotalCost();
  const orderedCost = calculateOrderedCost();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pb-20 transition-colors">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Order Equipment
          </h1>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-sm text-green-800 dark:text-green-200">{successMessage}</p>
          </div>
        )}

        {/* Tab Selector */}
        <div style={sectionStyles.card} className="mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setTab('prewire')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                tab === 'prewire'
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Prewire Prep
            </button>
            <button
              onClick={() => setTab('trim')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                tab === 'trim'
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Trim Prep
            </button>
            <button
              onClick={() => setTab('pos')}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                tab === 'pos'
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              Active POs
            </button>
          </div>
        </div>

        {/* Create POs View (for prewire/trim tabs) */}
        {(tab === 'prewire' || tab === 'trim') && (
          <>
            {/* Cost Summary */}
            <div style={sectionStyles.card} className="mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total Cost (Planned)</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    ${totalCost.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Ordered Cost</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    ${orderedCost.toFixed(2)}
                  </p>
                </div>
              </div>
              {totalCost > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600 dark:text-gray-400">Ordered</span>
                    <span className="text-gray-600 dark:text-gray-400">
                      {Math.round((orderedCost / totalCost) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-all"
                      style={{ width: `${(orderedCost / totalCost) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Content - Create POs View */}
            {renderVendorView()}
          </>
        )}

        {/* Active POs Tab Content */}
        {tab === 'pos' && (
          <div>
            <div style={sectionStyles.card} className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Purchase Orders ({purchaseOrders.length})
                </h2>
              </div>

              {purchaseOrders.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p className="text-gray-500 dark:text-gray-400">
                    No purchase orders yet. Create one from the Prewire or Trim tabs.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {purchaseOrders.map((po) => {
                    const isDraft = po.status === 'draft';
                    return (
                      <div
                        key={po.id}
                        style={sectionStyles.card}
                        className={`border-l-4 ${
                          isDraft
                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                            : 'border-violet-500'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              {isDraft && (
                                <span className="text-orange-600 dark:text-orange-400 text-base font-bold">⚠️</span>
                              )}
                              <h3 className="font-semibold text-gray-900 dark:text-white">
                                {po.po_number}
                              </h3>
                              <span className={`px-2 py-1 text-xs font-medium rounded ${
                                po.status === 'draft' ? 'bg-orange-100 dark:bg-orange-800 text-orange-700 dark:text-orange-300' :
                                po.status === 'submitted' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                                po.status === 'received' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' :
                                'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                              }`}>
                                {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                              </span>
                              <span className="px-2 py-1 text-xs font-medium rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300">
                                {po.milestone_stage === 'prewire_prep' ? 'Prewire' : 'Trim'}
                              </span>
                            </div>

                            {isDraft && (
                              <div className="mb-3 p-2 bg-orange-100 dark:bg-orange-900/30 rounded text-xs text-orange-800 dark:text-orange-200 font-medium">
                                ⚠️ Draft PO - Not yet submitted to supplier. Click to review and submit.
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
                                {po.order_date ? new Date(po.order_date).toLocaleDateString() : 'N/A'}
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
                            <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-800/50 rounded text-xs">
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
                                    // Copy to clipboard
                                    navigator.clipboard.writeText(t.tracking_number);
                                    // Open Google search in new tab
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
              )}
            </div>
          </div>
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
          loadPurchaseOrders();
          if (tab !== 'pos') {
            loadEquipment();
          }
        }}
        onDelete={(deletedPOId) => {
          setPurchaseOrders(prev => prev.filter(p => p.id !== deletedPOId));
          setPoDetailsModalOpen(false);
          setSelectedPOId(null);
          setSuccessMessage('Purchase order deleted successfully');
          setTimeout(() => setSuccessMessage(null), 3000);
          // Reload equipment to update ordered quantities
          if (tab !== 'pos') {
            loadEquipment();
          }
        }}
      />
    </div>
  );
};

export default PMOrderEquipmentPageEnhanced;
