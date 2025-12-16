import Papa from 'papaparse';
import { supabase } from '../lib/supabase';
import { normalizeRoomName } from '../utils/roomUtils';
import { fuzzyMatchService } from '../utils/fuzzyMatchService';

const HEADEND_KEYWORDS = ['network', 'head', 'equipment', 'rack', 'structured', 'mda', 'server'];

const equipmentKey = (item = {}) => {
  const partNumber = item.part_number?.trim().toLowerCase() || '';
  const room = item.room_id || null;
  const installSide = item.install_side || 'room_end';
  const name = item.name?.trim().toLowerCase() || '';
  return `${partNumber}|${room}|${installSide}|${name}`;
};

const normalizeString = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return String(value);
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeRoomKey = (name) => normalizeRoomName(normalizeString(name)) || 'unknown_room';

const toNumber = (value) => {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,%]/g, '').replace(/,/g, '').trim();
    if (!cleaned) return 0;
    const parsed = Number(cleaned);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const detectHeadend = (roomName) => {
  const value = normalizeString(roomName);
  if (!value) return false;
  const lower = value.toLowerCase();
  return HEADEND_KEYWORDS.some((keyword) => lower.includes(keyword));
};

const parseCsvFile = (file) =>
  new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => resolve(data),
      error: (error) => reject(error)
    });
  });

const ensureRooms = async (projectId, rows) => {
  // Get current authenticated user
  const { data: { user } } = await supabase.auth.getUser();

  const { data: existingRooms, error } = await supabase
    .from('project_rooms')
    .select('*')
    .eq('project_id', projectId);

  if (error) throw error;

  const roomMap = new Map();
  (existingRooms || []).forEach((room) => {
    roomMap.set(normalizeRoomKey(room.name), room);
  });

  const inserts = [];

  rows.forEach((row) => {
    const roomName = normalizeString(row.Area);
    if (!roomName) return;
    const key = normalizeRoomKey(roomName);
    if (roomMap.has(key)) return;

    const newRoom = {
      project_id: projectId,
      name: roomName,
      is_headend: detectHeadend(roomName),
      created_by: user?.id
    };

    inserts.push(newRoom);
    // Optimistically record the room to prevent duplicate inserts within this batch
    roomMap.set(key, { ...newRoom, id: null });
  });

  let insertedRooms = [];
  if (inserts.length > 0) {
    const { data, error: insertError } = await supabase
      .from('project_rooms')
      .insert(inserts)
      .select();

    if (insertError) throw insertError;
    insertedRooms = data || [];

    insertedRooms.forEach((room) => {
      roomMap.set(normalizeRoomKey(room.name), room);
    });
  }

  // Record aliases for variations found in the CSV so they can be matched to Lucid shapes later
  const aliasPayload = [];
  const seenAliases = new Set();

  rows.forEach((row) => {
    const roomName = normalizeString(row.Area);
    if (!roomName) return;

    const normalizedAlias = normalizeRoomName(roomName);
    if (!normalizedAlias) return;
    if (seenAliases.has(normalizedAlias)) return;

    const room = roomMap.get(normalizeRoomKey(roomName));
    if (!room?.id) return;

    const canonicalNormalized = normalizeRoomName(room.name);
    if (canonicalNormalized === normalizedAlias) return;

    seenAliases.add(normalizedAlias);
    aliasPayload.push({
      project_id: projectId,
      project_room_id: room.id,
      alias: roomName
    });
  });

  if (aliasPayload.length > 0) {
    const { error: aliasError } = await supabase
      .from('project_room_aliases')
      .upsert(aliasPayload, {
        onConflict: 'project_id, normalized_alias'
      });

    if (aliasError) {
      console.error('Failed to upsert project room aliases from CSV import:', aliasError);
    }
  }

  return { roomMap, insertedCount: insertedRooms.length || 0 };
};

const buildEquipmentRecords = (rows, roomMap, projectId, batchId, userId) => {
  const equipmentRecords = [];
  const laborMap = new Map();

  // Track instance numbers per room/part combination
  const instanceCounters = new Map();

  // Log first few rows for debugging
  if (rows.length > 0) {
    console.log('[CSV Import] First row sample:', rows[0]);
    console.log('[CSV Import] CSV columns:', Object.keys(rows[0]));
  }

  rows.forEach((row) => {
    const itemTypeRaw = normalizeString(row.ItemType);
    if (!itemTypeRaw) return;

    const areaQty = toNumber(row.AreaQty);
    if (!areaQty) return;

    const roomName = normalizeString(row.Area);
    if (!roomName) return;

    const room = roomMap.get(normalizeRoomKey(roomName)) || null;
    const manufacturer = normalizeString(row.Brand);
    const model = normalizeString(row['Model or Labor/Fee Name']);
    const partNumber = normalizeString(
      row.PartNumber ||
      row['Part Number'] ||
      row.part_number ||
      row['Part_Number'] ||
      model
    );
    const description = normalizeString(
      row.ShortDescription ??
      row['Short Description'] ??
      row.Description ??
      row['Description']
    );
    const supplier = normalizeString(row.Supplier);
    const itemType = itemTypeRaw.toLowerCase();

    if (itemType === 'labor') {
      const laborKey = [
        normalizeRoomKey(roomName),
        model?.toLowerCase() || 'general',
        description?.toLowerCase() || ''
      ].join('|');

      const existing = laborMap.get(laborKey) || {
        project_id: projectId,
        room_id: room?.id || null,
        labor_type: model || 'Labor',
        description: description || model || 'Labor',
        planned_hours: 0,
        hourly_rate: toNumber(row.SellPrice),
        csv_batch_id: batchId,
        created_by: userId,
        supplier: supplier || null  // STORE SUPPLIER for vendor matching
      };

      existing.planned_hours += areaQty;
      // Update supplier if not already set
      if (supplier && !existing.supplier) {
        existing.supplier = supplier;
      }
      laborMap.set(laborKey, existing);
      return;
    }

    const finalName = model || description || manufacturer || 'Unnamed Equipment';
    const installSide = room?.is_headend ? 'head_end' : 'room_end';
    const equipmentType =
      itemType === 'fee'
        ? 'fee'
        : itemType === 'service'
          ? 'service'
          : itemType === 'labor'
            ? 'labor'
            : 'part';

    // Generate parent group ID for all instances from this CSV line
    const parentGroupId = crypto.randomUUID();

    // Log instance creation for quantities > 1
    if (areaQty > 1) {
      console.log(`[Instance Splitting] Creating ${areaQty} instances for: ${finalName} in ${roomName}`);
    }

    // Create individual instances based on quantity
    // Each instance is a separate trackable piece of equipment
    for (let i = 1; i <= areaQty; i++) {
      // Track instance number per room/part combination
      const instanceKey = `${normalizeRoomKey(roomName)}|${partNumber || finalName}`;
      const currentCount = instanceCounters.get(instanceKey) || 0;
      const instanceNumber = currentCount + 1;
      instanceCounters.set(instanceKey, instanceNumber);

      // Generate instance name: "Room Name - Part Name N"
      const instanceName = `${roomName} - ${finalName} ${instanceNumber}`;

      equipmentRecords.push({
        project_id: projectId,
        catalog_id: null,
        name: instanceName,  // Use instance name as display name
        instance_number: instanceNumber,
        instance_name: instanceName,
        parent_import_group: parentGroupId,
        description: description || null,
        manufacturer: manufacturer || null,
        model: model || null,
        part_number: partNumber || null,
        room_id: room?.id || null,
        install_side: installSide,
        equipment_type: equipmentType,
        planned_quantity: 1,  // Always 1 per instance
        unit_of_measure: 'ea',
        unit_cost: toNumber(row.Cost),
        unit_price: toNumber(row.SellPrice),
        supplier: supplier || null,
        csv_batch_id: batchId,
        metadata: {},  // Empty JSONB for flexible data
        notes: null,
        is_active: true,
        created_by: userId
      });
    }
  });

  return {
    equipmentRecords,
    laborRecords: Array.from(laborMap.values())
  };
};

const detectLutronCsv = (text) => {
  if (!text) return false;
  // New Lutron export has "Technology" and "Product" columns
  // Also check for "System Mount" to be sure
  return text.includes('Technology') && text.includes('Product') && text.includes('System Mount');
};

// Standard parser is sufficient for new Lutron CSV as it follows standard header format (Line 1)
// We don't need the specialized offset parser anymore for this file type.

const buildLutronEquipmentRecords = (rows, roomMap, projectId, batchId, userId) => {
  const equipmentRecords = [];

  rows.forEach((row) => {
    // 1. Basic Validation
    const name = normalizeString(row.Name);
    if (!name) return; // Skip empty rows

    const quantity = toNumber(row.Quantity);
    if (quantity <= 0) return;

    // 2. Room Resolving
    // "Area" column matches our standard "Area" column, so roomMap should work
    const roomName = normalizeString(row.Area);
    let roomId = null;
    if (roomName) {
      const roomKey = normalizeRoomKey(roomName);
      const room = roomMap.get(roomKey);
      roomId = room?.id || null;
    }

    // 3. Global Part / Identity Mapping
    // User Requirement: Combine Technology + Product for Global Part
    const technology = normalizeString(row.Technology) || '';
    const product = normalizeString(row.Product) || '';

    // e.g. "Sivoia QS Triathlon Standard Honeycomb"
    const partNumber = [technology, product].filter(Boolean).join(' ').trim();

    // Use "Product Details" as the specific model if available, else Product
    const model = normalizeString(row['Product Details']) || product;

    // 4. Metadata Extraction
    const systemMount = normalizeString(row['System Mount']); // Key field for Portals
    const fabric = normalizeString(row.Fabric);

    const metadata = {
      width: normalizeString(row.Width),
      height: normalizeString(row.Height),
      system_mount: systemMount, // Exposed in Portal
      fabric: fabric,            // Exposed in Portal link
      technology: technology,
      product_type: normalizeString(row['Product Type']),
      battery_powered: normalizeString(row['Battery Powered']),
      top_back_cover: normalizeString(row['Top Back Cover']),
      // Capture original values for potential round-tripping
      original_name: name,
      original_area: roomName,
    };

    const unitPrice = toNumber(row['List Price']);
    const category = normalizeString(row['Product Type']);

    // 5. Instance Creation
    for (let i = 1; i <= quantity; i++) {
      // Create a unique instance name
      // Use provided name if unique-ish, else append number
      const instanceName = quantity > 1 ? `${name} ${i}` : name;

      equipmentRecords.push({
        project_id: projectId,
        catalog_id: null,
        name: instanceName,
        instance_number: i,
        instance_name: instanceName,
        parent_import_group: crypto.randomUUID(),
        description: model, // Specific model/details as description
        manufacturer: 'Lutron',
        model: model,
        part_number: partNumber, // This links to Global Part "Technology Product"
        room_id: roomId,
        install_side: 'room_end',
        equipment_type: 'part', // Force to 'part' to satisfy DB constraint. Specific type is in metadata.product_type
        planned_quantity: 1,
        unit_of_measure: 'ea',
        unit_cost: 0,
        unit_price: unitPrice,
        supplier: 'Lutron',
        csv_batch_id: batchId,
        metadata: metadata,
        notes: null,
        is_active: true,
        created_by: userId,
        // New items are not ordered/delivered yet
        ordered_confirmed: false,
        delivered_confirmed: false
      });
    }
  });

  return { equipmentRecords, laborRecords: [] };
};

const resetPreviousImports = async (projectId) => {
  console.log('[REPLACE MODE] ========================================');
  console.log('[REPLACE MODE] Starting resetPreviousImports for project:', projectId);
  console.log('[REPLACE MODE] ========================================');

  // Step 1: Get ALL existing equipment that will be deleted in REPLACE mode
  const { data: existing, error } = await supabase
    .from('project_equipment')
    .select(`
      id,
      part_number,
      name,
      room_id,
      install_side,
      manufacturer,
      model
    `)
    .eq('project_id', projectId);

  if (error) throw error;

  const equipmentIds = (existing || []).map((row) => row.id);

  // Step 2: PRESERVE wire drop links before deletion
  let wireDropLinks = [];
  if (equipmentIds.length > 0) {
    console.log(`[Wire Drop Preservation] Found ${equipmentIds.length} equipment items to replace`);

    // Get all wire drop links for equipment being deleted
    const { data: links, error: linksError } = await supabase
      .from('wire_drop_equipment_links')
      .select(`
        *,
        equipment:project_equipment!inner(
          part_number,
          name,
          room_id,
          install_side,
          manufacturer,
          model
        )
      `)
      .in('project_equipment_id', equipmentIds);

    if (linksError) {
      console.error('[Wire Drop Preservation] Error fetching wire drop links:', linksError);
    } else {
      wireDropLinks = links || [];
      console.log(`[Wire Drop Preservation] Found ${wireDropLinks.length} wire drop links to preserve`);
    }

    // Delete child records (will cascade, but we're being explicit)
    await supabase
      .from('project_equipment_instances')
      .delete()
      .in('project_equipment_id', equipmentIds);

    await supabase
      .from('project_equipment_inventory')
      .delete()
      .in('project_equipment_id', equipmentIds);

    await supabase
      .from('wire_drop_equipment_links')
      .delete()
      .in('project_equipment_id', equipmentIds);
  }

  // Step 3: Delete ALL equipment in REPLACE mode (not just CSV imports)
  console.log('[Equipment Delete] Deleting ALL equipment for project:', projectId);
  const { data: deletedEquipment, error: equipmentDeleteError } = await supabase
    .from('project_equipment')
    .delete()
    .eq('project_id', projectId)
    .select();

  if (equipmentDeleteError) {
    console.error('[Equipment Delete] Error deleting equipment:', equipmentDeleteError);
    throw equipmentDeleteError;
  } else {
    console.log(`[Equipment Delete] Successfully deleted ${(deletedEquipment || []).length} equipment items`);
  }

  // Step 4: Return preserved wire drop links for re-linking
  return wireDropLinks;
};

const syncGlobalParts = async (equipmentItems = [], projectId = null, batchId = null) => {
  if (!supabase || !Array.isArray(equipmentItems) || equipmentItems.length === 0) return new Map();

  const uniqueParts = new Map();

  equipmentItems.forEach((item) => {
    const rawPart = item?.part_number?.trim();
    if (!rawPart) return;

    const key = rawPart.toLowerCase();
    if (!uniqueParts.has(key)) {
      uniqueParts.set(key, {
        item,
        trimmedPartNumber: rawPart,
      });
    }
  });

  const partIdMap = new Map();

  for (const { item, trimmedPartNumber } of uniqueParts.values()) {
    try {
      const { data, error } = await supabase.rpc('upsert_global_part', {
        p_part_number: trimmedPartNumber,
        p_name: item.name || null,
        p_description: item.description || null,
        p_manufacturer: item.manufacturer || null,
        p_model: item.model || null,
        p_category: item.equipment_type || null,
        p_unit: item.unit_of_measure || null
      });

      if (error) {
        console.error('Failed to upsert global part:', trimmedPartNumber, error);
        continue;
      }

      if (data) {
        partIdMap.set(trimmedPartNumber, data);
      }
    } catch (rpcError) {
      console.error('Failed to sync global part:', trimmedPartNumber, rpcError);
    }
  }

  if (partIdMap.size > 0 && projectId) {
    const updates = [];

    partIdMap.forEach((globalPartId, partNumber) => {
      const updateQuery = supabase
        .from('project_equipment')
        .update({ global_part_id: globalPartId })
        .eq('project_id', projectId)
        .eq('part_number', partNumber);

      if (batchId) {
        updateQuery.eq('csv_batch_id', batchId);
      }

      updates.push(
        updateQuery
          .then(({ error }) => {
            if (error) {
              console.error(
                'Failed to update project equipment with global part reference:',
                partNumber,
                error
              );
            }
          })
      );
    });

    if (updates.length > 0) {
      await Promise.all(updates);
    }
  }

  return partIdMap;
};

const restoreWireDropLinks = async (preservedLinks, newEquipment) => {
  if (!preservedLinks || preservedLinks.length === 0) {
    console.log('[Wire Drop Restoration] No wire drop links to restore');
    return { restored: 0, failed: 0, failures: [] };
  }

  console.log(`[Wire Drop Restoration] Attempting to restore ${preservedLinks.length} wire drop links...`);

  // Create a lookup map of new equipment by matching key
  const equipmentMap = new Map();
  newEquipment.forEach((item) => {
    // Create matching key: part_number|room_id|install_side|name
    const key = [
      (item.part_number || '').toLowerCase().trim(),
      item.room_id || 'null',
      item.install_side || 'room_end',
      (item.name || '').toLowerCase().trim()
    ].join('|');

    // Only store instance #1 for each unique part (for wire drop linking)
    // If no instance_number (old data), treat as instance 1
    const instanceNum = item.instance_number || 1;

    if (!equipmentMap.has(key) || instanceNum === 1) {
      equipmentMap.set(key, item);
    }
  });

  console.log(`[Wire Drop Restoration] Created lookup map with ${equipmentMap.size} equipment items`);

  const linkInserts = [];
  const failures = [];
  let restored = 0;
  let failed = 0;

  // Try to match each preserved link to new equipment
  preservedLinks.forEach((oldLink) => {
    const oldEquipment = oldLink.equipment;

    // Create matching key from old equipment
    const matchKey = [
      (oldEquipment.part_number || '').toLowerCase().trim(),
      oldEquipment.room_id || 'null',
      oldEquipment.install_side || 'room_end',
      (oldEquipment.name || '').toLowerCase().trim()
    ].join('|');

    const newMatch = equipmentMap.get(matchKey);

    if (newMatch) {
      // Found a match! Recreate the link with new equipment ID
      linkInserts.push({
        wire_drop_id: oldLink.wire_drop_id,
        project_equipment_id: newMatch.id,
        quantity: oldLink.quantity,
        notes: oldLink.notes,
        created_by: oldLink.created_by
      });
      restored++;
    } else {
      // No match found - equipment was removed from proposal
      failed++;
      failures.push({
        wire_drop_id: oldLink.wire_drop_id,
        old_equipment: {
          part_number: oldEquipment.part_number,
          name: oldEquipment.name,
          manufacturer: oldEquipment.manufacturer,
          model: oldEquipment.model
        },
        reason: 'Equipment no longer in proposal'
      });
      console.warn(
        `[Wire Drop Restoration] ⚠️ Could not restore link for wire drop ${oldLink.wire_drop_id}:`,
        `Equipment "${oldEquipment.name}" (${oldEquipment.part_number}) not found in new import`
      );
    }
  });

  // Insert restored links in batch
  if (linkInserts.length > 0) {
    try {
      const { error } = await supabase
        .from('wire_drop_equipment_links')
        .insert(linkInserts);

      if (error) {
        console.error('[Wire Drop Restoration] Error inserting wire drop links:', error);
        throw error;
      }

      console.log(`[Wire Drop Restoration] ✓ Successfully restored ${restored} wire drop links`);
    } catch (error) {
      console.error('[Wire Drop Restoration] Failed to restore wire drop links:', error);
      return { restored: 0, failed: preservedLinks.length, failures: [], error: error.message };
    }
  }

  if (failed > 0) {
    console.warn(`[Wire Drop Restoration] ⚠️ Failed to restore ${failed} links (equipment removed from proposal)`);
  }

  return { restored, failed, failures };
};

const matchAndCreateSuppliers = async (equipmentRecords, laborRecords = []) => {
  if ((!equipmentRecords || equipmentRecords.length === 0) && (!laborRecords || laborRecords.length === 0)) {
    console.log('[Vendor Matching] No equipment or labor records provided');
    return new Map();
  }

  // Extract unique supplier names from equipment AND labor
  const uniqueSuppliers = new Set();

  // Process equipment records
  equipmentRecords.forEach((item) => {
    const supplier = item.supplier?.trim();
    if (supplier) {
      uniqueSuppliers.add(supplier);
    } else {
      console.log('[Vendor Matching] ⚠️ Equipment item has no supplier:', {
        id: item.id,
        name: item.name,
        part_number: item.part_number,
        room: item.room_id
      });
    }
  });

  // Process labor records (they might have suppliers too!)
  laborRecords.forEach((item) => {
    const supplier = item.supplier?.trim();
    if (supplier) {
      uniqueSuppliers.add(supplier);
      console.log('[Vendor Matching] Found supplier in labor record:', supplier);
    }
  });

  if (uniqueSuppliers.size === 0) {
    console.warn('[Vendor Matching] No suppliers found in any equipment records!');
    return new Map();
  }

  const supplierMap = new Map(); // Maps CSV supplier name → supplier_id

  console.log(`[Vendor Matching] Processing ${uniqueSuppliers.size} unique vendors from CSV:`, Array.from(uniqueSuppliers));

  for (const csvSupplierName of uniqueSuppliers) {
    try {
      console.log(`[Vendor Matching] Processing: "${csvSupplierName}"`);

      // Use fuzzy matching to find or create supplier
      const matchResult = await fuzzyMatchService.matchSupplier(csvSupplierName, 0.7);
      console.log(`[Vendor Matching] Match result for "${csvSupplierName}":`, {
        matched: matchResult.matched,
        action: matchResult.action,
        confidence: matchResult.confidence,
        supplierId: matchResult.supplier?.id,
        supplierName: matchResult.supplier?.name
      });

      if (matchResult.matched && matchResult.supplier) {
        // Found a match! Link this CSV name to the existing supplier
        console.log(`[Vendor Matching] ✓ Matched "${csvSupplierName}" to "${matchResult.supplier.name}" (${(matchResult.confidence * 100).toFixed(0)}% confidence)`);
        supplierMap.set(csvSupplierName, matchResult.supplier.id);
      } else {
        // No match found - auto-create new supplier
        console.log(`[Vendor Matching] ➕ Creating new vendor: "${csvSupplierName}"`);
        const newSupplier = await fuzzyMatchService.createSupplierFromCSV(csvSupplierName);

        if (newSupplier && newSupplier.id) {
          console.log(`[Vendor Matching] ✓ Created vendor "${newSupplier.name}" (ID: ${newSupplier.id}) with short code: ${newSupplier.short_code}`);
          supplierMap.set(csvSupplierName, newSupplier.id);
        } else {
          console.warn(`[Vendor Matching] ⚠️ Failed to create vendor for "${csvSupplierName}"`, newSupplier);
        }
      }
    } catch (error) {
      console.error(`[Vendor Matching] ❌ Error processing vendor "${csvSupplierName}":`, error.message, error);
      // Continue processing other suppliers even if one fails
    }
  }

  console.log(`[Vendor Matching] Complete: Processed ${supplierMap.size}/${uniqueSuppliers.size} vendors`);
  return supplierMap;
};

const linkEquipmentToSuppliers = async (equipmentRecords, supplierMap, projectId) => {
  if (!supplierMap || supplierMap.size === 0) {
    console.log('[Vendor Linking] No vendor mappings to apply');
    return 0;
  }

  const updates = [];
  let linkedCount = 0;

  equipmentRecords.forEach((item) => {
    const csvSupplierName = item.supplier?.trim();
    if (!csvSupplierName) return;

    const supplierId = supplierMap.get(csvSupplierName);
    if (!supplierId) return;

    if (item.id) {
      // Item already exists - add to update queue
      updates.push(
        supabase
          .from('project_equipment')
          .update({ supplier_id: supplierId })
          .eq('id', item.id)
      );
      linkedCount++;
    }
  });

  if (updates.length > 0) {
    console.log(`[Vendor Linking] Linking ${updates.length} equipment items to vendors...`);
    await Promise.all(updates);
    console.log(`[Vendor Linking] ✓ Linked ${linkedCount} items to vendors`);
  }

  return linkedCount;
};

export const projectEquipmentService = {
  async importCsv(projectId, file, options = {}) {
    if (!projectId || !file) throw new Error('Project and file are required');

    // Get current authenticated user
    const { data: { user } } = await supabase.auth.getUser();

    let parsedRows;
    let isLutron = false;
    let roomMap;
    let equipmentRecords = [];
    let laborRecords = [];
    let insertedCount = 0;

    // Read the file as text to detect format
    const fileText = await file.text();

    if (detectLutronCsv(fileText)) {
      console.log('[Import] Detected Lutron CSV format (New Version)');
      isLutron = true;
      // The new Lutron CSV is just a standard CSV, we just needed to detect it to switch building logic
      parsedRows = await parseCsvFile(file);
    } else {
      console.log('[Import] Using standard CSV parser');
      parsedRows = await parseCsvFile(file);
    }

    if (!Array.isArray(parsedRows) || parsedRows.length === 0) {
      throw new Error('CSV file did not contain any rows');
    }

    const filename = normalizeString(file.name) || 'equipment-upload.csv';
    const totalRows = parsedRows.length;

    const { data: batch, error: batchError } = await supabase
      .from('equipment_import_batches')
      .insert({
        project_id: projectId,
        filename,
        total_rows: totalRows,
        processed_rows: 0,
        status: 'pending',
        raw_payload: null,
        created_by: user?.id
      })
      .select()
      .single();

    if (batchError) throw batchError;

    const batchId = batch.id;

    // Support 3 modes: replace, merge (update), append (add all as new)
    const mode = options.mode || (options.replaceExisting === false ? 'merge' : 'replace');

    // Preserve wire drop links before deletion (REPLACE mode only)
    let preservedWireDropLinks = [];
    if (mode === 'replace') {
      preservedWireDropLinks = await resetPreviousImports(projectId);
    }

    if (isLutron) {
      // Lutron Import
      // 1. Ensure Rooms (since new CSV has "Area")
      const lutronResult = await ensureRooms(projectId, parsedRows);
      roomMap = lutronResult.roomMap;
      insertedCount = lutronResult.insertedCount;

      // 2. Build Records
      const built = buildLutronEquipmentRecords(
        parsedRows,
        roomMap, // Use the assigned roomMap
        projectId,
        batchId,
        user?.id
      );
      equipmentRecords = built.equipmentRecords;
      laborRecords = built.laborRecords;
    } else {
      // Standard Import
      const roomResult = await ensureRooms(projectId, parsedRows);
      roomMap = roomResult.roomMap;
      insertedCount = roomResult.insertedCount;

      const built = buildEquipmentRecords(
        parsedRows,
        roomMap,
        projectId,
        batchId,
        user?.id
      );
      equipmentRecords = built.equipmentRecords;
      laborRecords = built.laborRecords;
    }

    let insertedEquipment = [];
    let updatedEquipment = 0;

    if (equipmentRecords.length > 0) {
      if (mode === 'replace' || mode === 'append') {
        // REPLACE: Delete everything and insert fresh
        // APPEND: Just insert everything as new (no deletion)
        // Check authentication status
        const { data: { session } } = await supabase.auth.getSession();
        console.log('[Auth Check] Session exists:', !!session);
        console.log('[Auth Check] User role:', session?.user?.role || 'anon');
        console.log('[Auth Check] User ID:', session?.user?.id || 'none');

        const { data: inserted, error: equipmentError } = await supabase
          .from('project_equipment')
          .insert(equipmentRecords)
          .select();

        if (equipmentError) {
          console.error('[Equipment Insert] Error:', equipmentError);
          throw equipmentError;
        }

        insertedEquipment = inserted || [];

        if (insertedEquipment.length > 0) {
          const inventoryPayload = insertedEquipment.map((item) => ({
            project_equipment_id: item.id,
            warehouse: 'fl',
            quantity_on_hand: 0,
            quantity_assigned: 0,
            needs_order: false,
            rma_required: false,
            notes: null
          }));

          if (inventoryPayload.length > 0) {
            await supabase.from('project_equipment_inventory').insert(inventoryPayload);
          }

          await syncGlobalParts(insertedEquipment, projectId, batchId);

          // NEW: Match and link suppliers (from both equipment AND labor records)
          const supplierMap = await matchAndCreateSuppliers(insertedEquipment, laborRecords);
          await linkEquipmentToSuppliers(insertedEquipment, supplierMap, projectId);

          // NEW: Restore wire drop links after equipment insertion (REPLACE mode only)
          if (mode === 'replace' && preservedWireDropLinks.length > 0) {
            const restorationResult = await restoreWireDropLinks(preservedWireDropLinks, insertedEquipment);
            console.log('[Wire Drop Restoration] Summary:', restorationResult);
          }
        }
      } else {
        const { data: existingEquipment, error: existingError } = await supabase
          .from('project_equipment')
          .select(`
            id,
            part_number,
            room_id,
            install_side,
            project_id,
            name,
            ordered_quantity,
            received_quantity,
            received_date,
            ordered_confirmed,
            ordered_confirmed_at,
            ordered_confirmed_by,
            delivered_confirmed,
            delivered_confirmed_at,
            delivered_confirmed_by
          `)
          .eq('project_id', projectId);

        if (existingError) throw existingError;

        const equipmentMap = new Map();
        (existingEquipment || []).forEach((item) => {
          equipmentMap.set(equipmentKey(item), item);
        });

        const insertPayload = [];
        const updatePayload = [];

        equipmentRecords.forEach((record) => {
          const key = equipmentKey(record);
          const existing = equipmentMap.get(key);
          if (existing) {
            // Preserve PO-related fields that should NOT be overwritten during import
            const preservedFields = {
              ordered_quantity: existing.ordered_quantity,
              received_quantity: existing.received_quantity,
              received_date: existing.received_date,
              ordered_confirmed: existing.ordered_confirmed,
              ordered_confirmed_at: existing.ordered_confirmed_at,
              ordered_confirmed_by: existing.ordered_confirmed_by,
              delivered_confirmed: existing.delivered_confirmed,
              delivered_confirmed_at: existing.delivered_confirmed_at,
              delivered_confirmed_by: existing.delivered_confirmed_by
            };

            updatePayload.push({
              ...existing,
              ...record,
              ...preservedFields,  // Override with preserved values
              id: existing.id,
              csv_batch_id: batchId
            });
          } else {
            insertPayload.push(record);
          }
        });

        if (insertPayload.length > 0) {
          const { data: inserted, error: insertError } = await supabase
            .from('project_equipment')
            .insert(insertPayload)
            .select();

          if (insertError) throw insertError;

          insertedEquipment = inserted || [];

          if (insertedEquipment.length > 0) {
            const inventoryPayload = insertedEquipment.map((item) => ({
              project_equipment_id: item.id,
              warehouse: 'fl',
              quantity_on_hand: 0,
              quantity_assigned: 0,
              needs_order: false,
              rma_required: false,
              notes: null
            }));

            if (inventoryPayload.length > 0) {
              await supabase.from('project_equipment_inventory').insert(inventoryPayload);
            }
          }
        }

        let updatedRecords = [];
        if (updatePayload.length > 0) {
          const { data: updatedData, error: updateError } = await supabase
            .from('project_equipment')
            .upsert(updatePayload, { onConflict: 'id' })
            .select();

          if (updateError) throw updateError;

          updatedRecords = updatedData || [];
          updatedEquipment = updatedRecords.length;
        }

        const recordsForSync = [...insertedEquipment, ...(updatedRecords || [])];
        if (recordsForSync.length > 0) {
          await syncGlobalParts(recordsForSync, projectId);

          // NEW: Match and link suppliers for both inserted and updated items (including labor records)
          const supplierMap = await matchAndCreateSuppliers(recordsForSync, laborRecords);
          await linkEquipmentToSuppliers(recordsForSync, supplierMap, projectId);
        }
      }
    }

    let laborInserted = 0;
    let laborUpdated = 0;

    if (laborRecords.length > 0) {
      if (mode === 'replace' || mode === 'append') {
        console.log(`[Labor Budget] Processing ${laborRecords.length} labor records in ${mode.toUpperCase()} mode`);

        // Fetch existing labor records to check for conflicts
        const { data: existingLabor, error: fetchError } = await supabase
          .from('project_labor_budget')
          .select('id, labor_type, room_id')
          .eq('project_id', projectId);

        if (fetchError) {
          console.error('[Labor Budget] Error fetching existing records:', fetchError);
          throw fetchError;
        }

        console.log(`[Labor Budget] Found ${(existingLabor || []).length} existing labor records`);

        // Create a map of existing labor records
        const existingMap = new Map();
        (existingLabor || []).forEach((labor) => {
          const key = `${labor.labor_type || ''}|${labor.room_id || 'null'}`;
          existingMap.set(key, labor);
        });

        // Separate into updates vs inserts
        const toInsert = [];
        const toUpdate = [];

        laborRecords.forEach((record) => {
          const key = `${record.labor_type || ''}|${record.room_id || 'null'}`;
          const existing = existingMap.get(key);

          if (existing) {
            // Update existing record
            toUpdate.push({
              ...record,
              id: existing.id
            });
          } else {
            // Insert new record
            toInsert.push(record);
          }
        });

        console.log(`[Labor Budget] Inserting ${toInsert.length} new, updating ${toUpdate.length} existing`);

        // Insert new records
        if (toInsert.length > 0) {
          const { error: insertError } = await supabase
            .from('project_labor_budget')
            .insert(toInsert);

          if (insertError) {
            console.error('[Labor Budget] Insert error:', insertError);
            throw insertError;
          }
          laborInserted = toInsert.length;
        }

        // Update existing records
        if (toUpdate.length > 0) {
          const { error: updateError } = await supabase
            .from('project_labor_budget')
            .upsert(toUpdate, { onConflict: 'id' });

          if (updateError) {
            console.error('[Labor Budget] Update error:', updateError);
            throw updateError;
          }
          laborUpdated = toUpdate.length;
        }
      } else {
        const { data: existingLabor, error: existingLaborError } = await supabase
          .from('project_labor_budget')
          .select('id, labor_type, room_id, project_id')
          .eq('project_id', projectId);

        if (existingLaborError) throw existingLaborError;

        const laborMap = new Map();
        (existingLabor || []).forEach((row) => {
          const key = `${row.labor_type || ''}|${row.room_id || 'null'}`;
          laborMap.set(key, row);
        });

        const laborInsertPayload = [];
        const laborUpdatePayload = [];

        laborRecords.forEach((record) => {
          const key = `${record.labor_type || ''}|${record.room_id || 'null'}`;
          const existing = laborMap.get(key);
          if (existing) {
            laborUpdatePayload.push({
              ...existing,
              ...record,
              id: existing.id,
              csv_batch_id: batchId
            });
          } else {
            laborInsertPayload.push(record);
          }
        });

        if (laborInsertPayload.length > 0) {
          const { error: laborInsertError } = await supabase
            .from('project_labor_budget')
            .insert(laborInsertPayload);

          if (laborInsertError) throw laborInsertError;
          laborInserted = laborInsertPayload.length;
        }

        if (laborUpdatePayload.length > 0) {
          const { error: laborUpdateError } = await supabase
            .from('project_labor_budget')
            .upsert(laborUpdatePayload, { onConflict: 'id' });

          if (laborUpdateError) throw laborUpdateError;
          laborUpdated = laborUpdatePayload.length;
        }
      }
    }

    await supabase
      .from('equipment_import_batches')
      .update({
        status: 'processed',
        processed_rows: insertedEquipment.length + updatedEquipment + laborInserted + laborUpdated,
        completed_at: new Date().toISOString()
      })
      .eq('id', batchId);

    return {
      batchId,
      equipmentInserted: insertedEquipment.length,
      equipmentUpdated: updatedEquipment,
      laborInserted,
      laborUpdated,
      roomsCreated: insertedCount
    };
  },

  async fetchProjectEquipment(projectId) {
    const { data, error } = await supabase
      .from('project_equipment')
      .select(`
        id,
        project_id,
        catalog_id,
        global_part_id,
        name,
        description,
        manufacturer,
        model,
        part_number,
        room_id,
        install_side,
        equipment_type,
        planned_quantity,
        ordered_quantity,
        received_quantity,
        received_date,
        unit_of_measure,
        unit_cost,
        unit_price,
        supplier,
        supplier_id,
        csv_batch_id,
        notes,
        is_active,
        ordered_confirmed,
        ordered_confirmed_at,
        ordered_confirmed_by,
        delivered_confirmed,
        delivered_confirmed_at,
        delivered_confirmed_by,
        installed,
        installed_at,
        installed_by,
        created_at,
        created_by,
        updated_at,
        homekit_qr_url,
        homekit_qr_sharepoint_drive_id,
        homekit_qr_sharepoint_item_id,
        unifi_client_mac,
        unifi_last_ip,
        unifi_last_seen,
        unifi_data,
        project_rooms(name, is_headend),
        global_part:global_part_id (
          id,
          part_number,
          name,
          manufacturer,
          model,
          description,
          is_wire_drop_visible,
          is_inventory_item,
          required_for_prewire,
          quantity_on_hand,
          reorder_point,
          warehouse_location,
          schematic_url,
          install_manual_urls,
          technical_manual_urls
        )
      `)
      .eq('project_id', projectId)
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async fetchProjectEquipmentByPhase(projectId, phase = 'all') {
    const { data, error } = await supabase
      .from('project_equipment')
      .select(`
        id,
        project_id,
        catalog_id,
        global_part_id,
        name,
        description,
        manufacturer,
        model,
        part_number,
        room_id,
        install_side,
        equipment_type,
        planned_quantity,
        ordered_quantity,
        received_quantity,
        received_date,
        unit_of_measure,
        unit_cost,
        unit_price,
        supplier,
        supplier_id,
        csv_batch_id,
        notes,
        is_active,
        ordered_confirmed,
        ordered_confirmed_at,
        ordered_confirmed_by,
        delivered_confirmed,
        delivered_confirmed_at,
        delivered_confirmed_by,
        installed,
        installed_at,
        installed_by,
        created_at,
        created_by,
        updated_at,
        project_rooms(name, is_headend),
        global_part:global_part_id (
          id,
          part_number,
          name,
          manufacturer,
          model,
          description,
          is_wire_drop_visible,
          is_inventory_item,
          required_for_prewire,
          quantity_on_hand,
          reorder_point,
          warehouse_location,
          schematic_url,
          install_manual_urls,
          technical_manual_urls
        )
      `)
      .eq('project_id', projectId)
      .order('name', { ascending: true });

    if (error) throw error;

    const equipment = data || [];

    // Filter by phase if specified
    if (phase === 'prewire') {
      return equipment.filter(item => item.global_part?.required_for_prewire === true);
    } else if (phase === 'trim') {
      return equipment.filter(item => item.global_part?.required_for_prewire !== true);
    }

    return equipment;
  },

  categorizeEquipmentByPhase(equipment = []) {
    const prewire = [];
    const trim = [];

    equipment.forEach(item => {
      if (item.global_part?.required_for_prewire === true) {
        prewire.push(item);
      } else {
        trim.push(item);
      }
    });

    return { prewire, trim };
  },

  getPhaseStats(equipment = []) {
    const { prewire, trim } = this.categorizeEquipmentByPhase(equipment);

    const calculateStats = (items) => {
      const total = items.length;
      const ordered = items.filter(item => item.ordered_confirmed).length;
      const delivered = items.filter(item => item.delivered_confirmed).length;
      const totalQuantity = items.reduce((sum, item) => sum + (item.planned_quantity || 0), 0);

      return {
        total,
        ordered,
        delivered,
        onsite: delivered, // Keep for backwards compatibility
        totalQuantity,
        orderedPercentage: total > 0 ? Math.round((ordered / total) * 100) : 0,
        deliveredPercentage: total > 0 ? Math.round((delivered / total) * 100) : 0,
        onsitePercentage: total > 0 ? Math.round((delivered / total) * 100) : 0 // Keep for backwards compatibility
      };
    };

    return {
      prewire: calculateStats(prewire),
      trim: calculateStats(trim),
      all: calculateStats(equipment)
    };
  },

  async fetchProjectLabor(projectId) {
    const { data, error } = await supabase
      .from('project_labor_budget')
      .select('*, project_rooms(name, is_headend)')
      .eq('project_id', projectId)
      .order('labor_type', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async fetchRooms(projectId) {
    const { data, error } = await supabase
      .from('project_rooms')
      .select('*')
      .eq('project_id', projectId)
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async updateProcurementStatus(equipmentId, { ordered, onsite, delivered, userId } = {}) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!equipmentId) throw new Error('Equipment ID is required');

    // Use passed userId (from MSAL auth context) - supabase.auth.getUser() won't work with MSAL
    const validUserId = userId && typeof userId === 'string' && userId.trim() ? userId.trim() : null;

    console.log('[projectEquipmentService] updateProcurementStatus called:', {
      equipmentId,
      delivered,
      passedUserId: userId,
      validUserId,
      userIdType: typeof userId
    });

    const updates = {};

    if (typeof ordered === 'boolean') {
      updates.ordered_confirmed = ordered;
      updates.ordered_confirmed_at = ordered ? new Date().toISOString() : null;
      updates.ordered_confirmed_by = ordered ? validUserId : null;
    }

    // Handle delivered status (formerly called "onsite")
    const deliveredValue = delivered ?? onsite;
    if (typeof deliveredValue === 'boolean') {
      updates.delivered_confirmed = deliveredValue;
      updates.delivered_confirmed_at = deliveredValue ? new Date().toISOString() : null;
      updates.delivered_confirmed_by = deliveredValue ? validUserId : null;
    }

    if (Object.keys(updates).length === 0) {
      return null;
    }

    console.log('[projectEquipmentService] Sending updates to database:', updates);

    const { data, error } = await supabase
      .from('project_equipment')
      .update(updates)
      .eq('id', equipmentId)
      .select(`
        *,
        project_rooms(name, is_headend),
        global_part:global_part_id (
          id,
          part_number,
          name,
          manufacturer,
          model,
          description,
          is_wire_drop_visible,
          schematic_url,
          install_manual_urls,
          technical_manual_urls
        )
      `)
      .maybeSingle();

    console.log('[projectEquipmentService] Database response:', {
      success: !error,
      delivered_confirmed: data?.delivered_confirmed,
      delivered_confirmed_by: data?.delivered_confirmed_by,
      delivered_confirmed_at: data?.delivered_confirmed_at
    });

    if (error) {
      console.error('Failed to update procurement status:', error);
      throw new Error(error.message || 'Failed to update procurement status');
    }

    if (!data) {
      throw new Error('Equipment not found or update failed');
    }

    return data;
  },

  /**
   * Update ordered or received quantities for equipment
   * @param {string} equipmentId - The equipment item ID
   * @param {object} options - { orderedQty, receivedQty, userId }
   */
  async updateProcurementQuantities(equipmentId, { orderedQty, receivedQty, userId } = {}) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!equipmentId) throw new Error('Equipment ID is required');

    // Use passed userId (from MSAL auth context) - supabase.auth.getUser() won't work with MSAL
    const validUserId = userId && typeof userId === 'string' && userId.trim() ? userId.trim() : null;

    // First, get current equipment to validate
    const { data: current, error: fetchError } = await supabase
      .from('project_equipment')
      .select('id, planned_quantity, ordered_quantity, received_quantity')
      .eq('id', equipmentId)
      .single();

    if (fetchError) throw new Error('Failed to fetch equipment: ' + fetchError.message);
    if (!current) throw new Error('Equipment not found');

    const updates = {};

    // Update ordered quantity
    if (typeof orderedQty === 'number' && orderedQty >= 0) {
      updates.ordered_quantity = orderedQty;
      updates.ordered_confirmed_by = validUserId;
      updates.ordered_confirmed_at = orderedQty > 0 ? new Date().toISOString() : null;
    }

    // Update received quantity (with validation)
    // NOTE: This only tracks receiving shipments at office/warehouse.
    // "Delivered" status is manually set by technicians when they move items to job site.
    if (typeof receivedQty === 'number' && receivedQty >= 0) {
      const orderedAmount = current.ordered_quantity || 0;

      // Cannot receive items that haven't been ordered
      if (receivedQty > 0 && orderedAmount === 0) {
        throw new Error(
          'Cannot receive items that have not been ordered. Please create a PO first.'
        );
      }

      // Cannot receive more than ordered
      if (receivedQty > orderedAmount) {
        throw new Error(
          `Cannot receive ${receivedQty} units. Only ${orderedAmount} units were ordered.`
        );
      }

      updates.received_quantity = receivedQty;
      // Track who received the shipment and when
      updates.received_by = validUserId;
      updates.received_date = receivedQty > 0 ? new Date().toISOString() : null;
    }

    if (Object.keys(updates).length === 0) {
      return current;
    }

    const { data, error } = await supabase
      .from('project_equipment')
      .update(updates)
      .eq('id', equipmentId)
      .select()
      .single();

    if (error) {
      console.error('Failed to update procurement quantities:', error);
      throw new Error(error.message || 'Failed to update procurement quantities');
    }

    return data;
  },

  /**
   * Bulk receive all ordered items for a project phase
   * @param {string} projectId - The project ID
   * @param {string} phase - 'prewire' or 'trim'
   */
  async receiveAllForPhase(projectId, phase = 'prewire') {
    if (!supabase) throw new Error('Supabase not configured');
    if (!projectId) throw new Error('Project ID is required');

    // Get all equipment for this phase that has been ordered but not fully received
    const { data: equipment, error: fetchError } = await supabase
      .from('project_equipment')
      .select(`
        id,
        planned_quantity,
        ordered_quantity,
        received_quantity,
        global_part:global_part_id (required_for_prewire)
      `)
      .eq('project_id', projectId)
      .neq('equipment_type', 'Labor')
      .gt('ordered_quantity', 0);

    if (fetchError) throw new Error('Failed to fetch equipment: ' + fetchError.message);

    // Filter to correct phase
    const itemsToReceive = (equipment || []).filter(item => {
      const isPrewire = item.global_part?.required_for_prewire === true;
      const phaseMatches = phase === 'prewire' ? isPrewire : !isPrewire;
      const notFullyReceived = (item.received_quantity || 0) < (item.ordered_quantity || 0);
      return phaseMatches && notFullyReceived;
    });

    if (itemsToReceive.length === 0) {
      return { updated: 0, message: 'No items to receive' };
    }

    // Get current authenticated user
    const { data: { user } } = await supabase.auth.getUser();

    // Update all items to received_quantity = ordered_quantity
    // NOTE: This only marks items as received at office/warehouse.
    // "Delivered" status is manually set by technicians when they move items to job site.
    const updates = itemsToReceive.map(item => ({
      id: item.id,
      received_quantity: item.ordered_quantity,
      received_date: new Date().toISOString(),
      received_by: user?.id
    }));

    const { data, error } = await supabase
      .from('project_equipment')
      .upsert(updates, { onConflict: 'id' })
      .select();

    if (error) {
      console.error('Failed to bulk receive items:', error);
      throw new Error(error.message || 'Failed to bulk receive items');
    }

    return {
      updated: data?.length || 0,
      message: `Successfully received ${data?.length || 0} items for ${phase} phase`
    };
  },

  /**
   * Upload HomeKit QR code photo for equipment
   * @param {string} equipmentId - Equipment UUID
   * @param {File} file - Image file
   * @returns {Promise<object>} Updated equipment record
   */
  async uploadHomeKitQRPhoto(equipmentId, file) {
    try {
      // Get equipment to determine project ID
      const { data: equipment, error: equipmentError } = await supabase
        .from('project_equipment')
        .select('project_id, homekit_qr_sharepoint_drive_id, homekit_qr_sharepoint_item_id')
        .eq('id', equipmentId)
        .single();

      if (equipmentError) throw equipmentError;
      if (!equipment || !equipment.project_id) {
        throw new Error('Equipment not found or project ID missing');
      }

      const { sharePointStorageService } = await import('./sharePointStorageService');

      if (equipment.homekit_qr_sharepoint_drive_id && equipment.homekit_qr_sharepoint_item_id) {
        try {
          await sharePointStorageService.deleteFile(
            equipment.homekit_qr_sharepoint_drive_id,
            equipment.homekit_qr_sharepoint_item_id
          );
        } catch (deleteError) {
          console.warn('Failed to delete existing HomeKit QR photo:', deleteError);
        }
      }

      // Upload to SharePoint
      const uploadResult = await sharePointStorageService.uploadHomeKitQRPhoto(
        equipment.project_id,
        equipmentId,
        file
      );

      console.log('HomeKit QR uploaded successfully to SharePoint:', uploadResult.url);
      console.log('SharePoint metadata:', {
        driveId: uploadResult.driveId,
        itemId: uploadResult.itemId
      });

      // Update equipment with HomeKit QR URL and metadata
      const { data, error } = await supabase
        .from('project_equipment')
        .update({
          homekit_qr_url: uploadResult.url,
          homekit_qr_sharepoint_drive_id: uploadResult.driveId,
          homekit_qr_sharepoint_item_id: uploadResult.itemId
        })
        .eq('id', equipmentId)
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Failed to upload HomeKit QR photo:', error);
      throw error;
    }
  },

  /**
   * Remove HomeKit QR code photo from equipment
   * @param {string} equipmentId - Equipment UUID
   * @returns {Promise<object>} Updated equipment record
   */
  async removeHomeKitQRPhoto(equipmentId) {
    try {
      const { data: equipment, error: equipmentError } = await supabase
        .from('project_equipment')
        .select('homekit_qr_sharepoint_drive_id, homekit_qr_sharepoint_item_id')
        .eq('id', equipmentId)
        .single();

      if (equipmentError) throw equipmentError;

      if (equipment?.homekit_qr_sharepoint_drive_id && equipment?.homekit_qr_sharepoint_item_id) {
        try {
          const { sharePointStorageService } = await import('./sharePointStorageService');
          await sharePointStorageService.deleteFile(
            equipment.homekit_qr_sharepoint_drive_id,
            equipment.homekit_qr_sharepoint_item_id
          );
        } catch (deleteError) {
          console.warn('Failed to delete HomeKit QR photo from SharePoint:', deleteError);
        }
      }

      const { data, error } = await supabase
        .from('project_equipment')
        .update({
          homekit_qr_url: null,
          homekit_qr_sharepoint_drive_id: null,
          homekit_qr_sharepoint_item_id: null
        })
        .eq('id', equipmentId)
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Failed to remove HomeKit QR photo:', error);
      throw error;
    }
  },

  /**
   * Add a single part/equipment item to a project
   * Runs through the same logic as CSV import: creates project_equipment,
   * syncs to global_parts, and matches/creates supplier
   *
   * @param {string} projectId - Project UUID
   * @param {object} partData - Part data object
   * @param {string} partData.name - Part name (required)
   * @param {string} [partData.part_number] - Part number (enables global_parts sync)
   * @param {string} [partData.description] - Description
   * @param {string} [partData.manufacturer] - Manufacturer
   * @param {string} [partData.model] - Model
   * @param {string} [partData.supplier] - Supplier name (enables supplier matching)
   * @param {number} [partData.unit_cost] - Unit cost (default: 0)
   * @param {number} [partData.unit_price] - Unit price (default: 0)
   * @param {number} [partData.quantity] - Quantity (default: 1)
   * @param {string} [partData.room_id] - Room UUID (optional)
   * @param {string} [partData.install_side] - 'head_end' | 'room_end' | 'both' | 'unspecified'
   * @param {string} [partData.equipment_type] - 'part' | 'labor' | 'service' | 'fee' | 'other'
   * @param {string} [partData.unit_of_measure] - Unit (default: 'ea')
   * @param {string} [partData.notes] - Notes
   * @returns {Promise<object>} Created equipment record with all linked data
   */
  async addSinglePart(projectId, partData) {
    if (!projectId) throw new Error('Project ID is required');
    if (!partData?.name) throw new Error('Part name is required');

    // Get current authenticated user
    const { data: { user } } = await supabase.auth.getUser();

    // Build equipment record (same logic as buildEquipmentRecords but for single item)
    const equipmentRecord = {
      project_id: projectId,
      room_id: partData.room_id || null,
      name: normalizeString(partData.name),
      description: normalizeString(partData.description) || null,
      manufacturer: normalizeString(partData.manufacturer) || null,
      model: normalizeString(partData.model) || null,
      part_number: normalizeString(partData.part_number) || null,
      install_side: partData.install_side || 'room_end',
      equipment_type: partData.equipment_type || 'part',
      planned_quantity: partData.quantity || 1,
      unit_of_measure: partData.unit_of_measure || 'ea',
      unit_cost: toNumber(partData.unit_cost),
      unit_price: toNumber(partData.unit_price),
      supplier: normalizeString(partData.supplier) || null,
      notes: normalizeString(partData.notes) || null,
      is_active: true,
      metadata: {},
      created_by: user?.id,
      // No csv_batch_id since this is a manual addition
      csv_batch_id: null
    };

    console.log('[addSinglePart] Creating equipment record:', equipmentRecord);

    // Step 1: Insert into project_equipment
    const { data: inserted, error: insertError } = await supabase
      .from('project_equipment')
      .insert([equipmentRecord])
      .select()
      .single();

    if (insertError) {
      console.error('[addSinglePart] Failed to insert equipment:', insertError);
      throw new Error(insertError.message || 'Failed to create equipment');
    }

    console.log('[addSinglePart] Equipment created with ID:', inserted.id);

    // Step 2: Create inventory record
    const { error: inventoryError } = await supabase
      .from('project_equipment_inventory')
      .insert({
        project_equipment_id: inserted.id,
        warehouse: 'fl',
        quantity_on_hand: 0,
        quantity_assigned: 0,
        needs_order: false,
        rma_required: false
      });

    if (inventoryError) {
      console.warn('[addSinglePart] Failed to create inventory record:', inventoryError);
      // Don't throw - inventory record is not critical
    }

    // Step 3: Sync to global_parts if part_number provided
    if (inserted.part_number) {
      console.log('[addSinglePart] Syncing to global_parts...');
      await syncGlobalParts([inserted], projectId, null);
    }

    // Step 4: Match and link supplier if supplier name provided
    if (inserted.supplier) {
      console.log('[addSinglePart] Matching supplier...');
      const supplierMap = await matchAndCreateSuppliers([inserted]);
      if (supplierMap.size > 0) {
        await linkEquipmentToSuppliers([inserted], supplierMap, projectId);
      }
    }

    // Step 5: Fetch the complete record with all linked data
    const { data: completeRecord, error: fetchError } = await supabase
      .from('project_equipment')
      .select(`
        *,
        project_rooms(name, is_headend),
        global_part:global_part_id (
          id,
          part_number,
          name,
          manufacturer,
          model,
          is_wire_drop_visible,
          is_inventory_item,
          required_for_prewire
        ),
        suppliers:supplier_id (
          id,
          name,
          short_code
        )
      `)
      .eq('id', inserted.id)
      .single();

    if (fetchError) {
      console.warn('[addSinglePart] Failed to fetch complete record:', fetchError);
      return inserted; // Return basic record if full fetch fails
    }

    console.log('[addSinglePart] Successfully created equipment:', completeRecord.id);
    return completeRecord;
  },

  /**
   * Update an existing equipment record
   * @param {string} equipmentId - Equipment UUID
   * @param {object} updates - Fields to update
   * @returns {Promise<object>} Updated equipment record
   */
  async updateEquipment(equipmentId, updates) {
    if (!equipmentId) throw new Error('Equipment ID is required');

    // Normalize string fields
    const cleanUpdates = {};

    if (updates.name !== undefined) cleanUpdates.name = normalizeString(updates.name);
    if (updates.description !== undefined) cleanUpdates.description = normalizeString(updates.description);
    if (updates.manufacturer !== undefined) cleanUpdates.manufacturer = normalizeString(updates.manufacturer);
    if (updates.model !== undefined) cleanUpdates.model = normalizeString(updates.model);
    if (updates.part_number !== undefined) cleanUpdates.part_number = normalizeString(updates.part_number);
    if (updates.supplier !== undefined) cleanUpdates.supplier = normalizeString(updates.supplier);
    if (updates.notes !== undefined) cleanUpdates.notes = normalizeString(updates.notes);
    if (updates.unit_cost !== undefined) cleanUpdates.unit_cost = toNumber(updates.unit_cost);
    if (updates.unit_price !== undefined) cleanUpdates.unit_price = toNumber(updates.unit_price);
    if (updates.planned_quantity !== undefined) cleanUpdates.planned_quantity = toNumber(updates.planned_quantity);
    if (updates.room_id !== undefined) cleanUpdates.room_id = updates.room_id || null;
    if (updates.install_side !== undefined) cleanUpdates.install_side = updates.install_side;
    if (updates.equipment_type !== undefined) cleanUpdates.equipment_type = updates.equipment_type;
    if (updates.unit_of_measure !== undefined) cleanUpdates.unit_of_measure = updates.unit_of_measure;
    if (updates.supplier_id !== undefined) cleanUpdates.supplier_id = updates.supplier_id || null;

    cleanUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('project_equipment')
      .update(cleanUpdates)
      .eq('id', equipmentId)
      .select(`
        *,
        project_rooms(name, is_headend),
        global_part:global_part_id (id, part_number, name),
        suppliers:supplier_id (id, name, short_code)
      `)
      .single();

    if (error) {
      console.error('[updateEquipment] Failed:', error);
      throw new Error(error.message || 'Failed to update equipment');
    }

    // If part_number changed, re-sync to global_parts
    if (cleanUpdates.part_number && data.project_id) {
      await syncGlobalParts([data], data.project_id, null);
    }

    // If supplier changed, re-match
    if (cleanUpdates.supplier && data.project_id) {
      const supplierMap = await matchAndCreateSuppliers([data]);
      if (supplierMap.size > 0) {
        await linkEquipmentToSuppliers([data], supplierMap, data.project_id);
      }
    }

    return data;
  },

  /**
   * Reassign equipment to a different room
   * This will unlink from any wire drops since equipment is being moved
   * @param {string} equipmentId - The equipment item ID
   * @param {string} newRoomId - The new room ID to assign to
   * @param {string} userId - Current user ID (optional)
   * @returns {object} Updated equipment with new room data
   */
  async reassignEquipmentRoom(equipmentId, newRoomId, userId = null) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!equipmentId) throw new Error('Equipment ID is required');
    if (!newRoomId) throw new Error('New room ID is required');

    // Ensure userId is valid or null
    const validUserId = userId && typeof userId === 'string' && userId.trim() ? userId.trim() : null;

    try {
      // First, unlink from any wire drops (equipment is being moved to a different room)
      const { data: existingLinks, error: linksError } = await supabase
        .from('wire_drop_equipment_links')
        .select('id')
        .eq('project_equipment_id', equipmentId);

      if (linksError) {
        console.warn('[reassignEquipmentRoom] Error fetching wire drop links:', linksError);
      }

      const hadWireDropLinks = existingLinks && existingLinks.length > 0;

      if (hadWireDropLinks) {
        const { error: deleteError } = await supabase
          .from('wire_drop_equipment_links')
          .delete()
          .eq('project_equipment_id', equipmentId);

        if (deleteError) {
          console.error('[reassignEquipmentRoom] Failed to unlink wire drops:', deleteError);
          throw new Error('Failed to unlink equipment from wire drops');
        }
        console.log(`[reassignEquipmentRoom] Unlinked ${existingLinks.length} wire drop connections`);
      }

      // Update room assignment and reset installed status
      const updates = {
        room_id: newRoomId,
        installed: false,
        installed_at: null,
        installed_by: null,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('project_equipment')
        .update(updates)
        .eq('id', equipmentId)
        .select(`
          *,
          project_rooms(id, name, is_headend),
          global_part:global_part_id (id, part_number, name, manufacturer, model, description, is_wire_drop_visible)
        `)
        .single();

      if (error) {
        console.error('[reassignEquipmentRoom] Failed to update room:', error);
        throw new Error(error.message || 'Failed to reassign equipment room');
      }

      console.log(`[reassignEquipmentRoom] Equipment ${equipmentId} reassigned to room ${newRoomId}`, {
        hadWireDropLinks,
        newRoomName: data.project_rooms?.name
      });

      return {
        ...data,
        wireDropsUnlinked: hadWireDropLinks ? existingLinks.length : 0
      };
    } catch (error) {
      console.error('[reassignEquipmentRoom] Error:', error);
      throw error;
    }
  }
};
