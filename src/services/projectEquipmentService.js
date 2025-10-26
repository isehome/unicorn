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
      created_by: null
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

const buildEquipmentRecords = (rows, roomMap, projectId, batchId) => {
  const equipmentRecords = [];
  const laborMap = new Map();

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
        created_by: null
      };

      existing.planned_hours += areaQty;
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

    equipmentRecords.push({
      project_id: projectId,
      catalog_id: null,
      name: finalName,
      description: description || null,
      manufacturer: manufacturer || null,
      model: model || null,
      part_number: partNumber || null,
      room_id: room?.id || null,
      install_side: installSide,
      equipment_type: equipmentType,
      planned_quantity: areaQty,
      unit_of_measure: 'ea',
      unit_cost: toNumber(row.Cost),
      unit_price: toNumber(row.SellPrice),
      supplier: supplier || null,
      csv_batch_id: batchId,
      notes: null,
      is_active: true,
      created_by: null
    });
  });

  return {
    equipmentRecords,
    laborRecords: Array.from(laborMap.values())
  };
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

    equipmentMap.set(key, item);
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

const matchAndCreateSuppliers = async (equipmentRecords) => {
  if (!equipmentRecords || equipmentRecords.length === 0) return new Map();

  // Extract unique supplier names from equipment
  const uniqueSuppliers = new Set();
  equipmentRecords.forEach((item) => {
    const supplier = item.supplier?.trim();
    if (supplier) {
      uniqueSuppliers.add(supplier);
    }
  });

  if (uniqueSuppliers.size === 0) return new Map();

  const supplierMap = new Map(); // Maps CSV supplier name → supplier_id

  console.log(`[Vendor Matching] Processing ${uniqueSuppliers.size} unique vendors from CSV...`);

  for (const csvSupplierName of uniqueSuppliers) {
    try {
      // Use fuzzy matching to find or create supplier
      const matchResult = await fuzzyMatchService.matchSupplier(csvSupplierName, 0.7);

      if (matchResult.matched && matchResult.supplier) {
        // Found a match! Link this CSV name to the existing supplier
        console.log(`[Vendor Matching] ✓ Matched "${csvSupplierName}" to "${matchResult.supplier.name}" (${(matchResult.confidence * 100).toFixed(0)}% confidence)`);
        supplierMap.set(csvSupplierName, matchResult.supplier.id);
      } else {
        // No match found - auto-create new supplier
        console.log(`[Vendor Matching] ➕ Creating new vendor: "${csvSupplierName}"`);
        const newSupplier = await fuzzyMatchService.createSupplierFromCSV(csvSupplierName);

        if (newSupplier && newSupplier.id) {
          console.log(`[Vendor Matching] ✓ Created vendor "${newSupplier.name}" with short code: ${newSupplier.short_code}`);
          supplierMap.set(csvSupplierName, newSupplier.id);
        } else {
          console.warn(`[Vendor Matching] ⚠️ Failed to create vendor for "${csvSupplierName}"`);
        }
      }
    } catch (error) {
      console.error(`[Vendor Matching] ❌ Error processing vendor "${csvSupplierName}":`, error);
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

    const parsedRows = await parseCsvFile(file);
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
        created_by: options.userId || null
      })
      .select()
      .single();

    if (batchError) throw batchError;

    const batchId = batch.id;

    const mode = options.mode === 'merge' || options.replaceExisting === false ? 'merge' : 'replace';

    // Preserve wire drop links before deletion (REPLACE mode only)
    let preservedWireDropLinks = [];
    if (mode === 'replace') {
      preservedWireDropLinks = await resetPreviousImports(projectId);
    }

    const { roomMap, insertedCount } = await ensureRooms(projectId, parsedRows);
    const { equipmentRecords, laborRecords } = buildEquipmentRecords(
      parsedRows,
      roomMap,
      projectId,
      batchId
    );

    let insertedEquipment = [];
    let updatedEquipment = 0;

    if (equipmentRecords.length > 0) {
      if (mode === 'replace') {
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

          // NEW: Match and link suppliers
          const supplierMap = await matchAndCreateSuppliers(insertedEquipment);
          await linkEquipmentToSuppliers(insertedEquipment, supplierMap, projectId);

          // NEW: Restore wire drop links after equipment insertion (REPLACE mode only)
          if (preservedWireDropLinks.length > 0) {
            const restorationResult = await restoreWireDropLinks(preservedWireDropLinks, insertedEquipment);
            console.log('[Wire Drop Restoration] Summary:', restorationResult);
          }
        }
      } else {
        const { data: existingEquipment, error: existingError } = await supabase
          .from('project_equipment')
          .select('id, part_number, room_id, install_side, project_id, name')
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
            updatePayload.push({
              ...existing,
              ...record,
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

          // NEW: Match and link suppliers for both inserted and updated items
          const supplierMap = await matchAndCreateSuppliers(recordsForSync);
          await linkEquipmentToSuppliers(recordsForSync, supplierMap, projectId);
        }
      }
    }

    let laborInserted = 0;
    let laborUpdated = 0;

    if (laborRecords.length > 0) {
      if (mode === 'replace') {
        console.log(`[Labor Budget] Processing ${laborRecords.length} labor records in REPLACE mode`);

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
        unit_of_measure,
        unit_cost,
        unit_price,
        supplier,
        csv_batch_id,
        notes,
        is_active,
        ordered_confirmed,
        ordered_confirmed_at,
        ordered_confirmed_by,
        onsite_confirmed,
        onsite_confirmed_at,
        onsite_confirmed_by,
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
          is_wire_drop_visible,
          is_inventory_item,
          required_for_prewire
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
        unit_of_measure,
        unit_cost,
        unit_price,
        supplier,
        csv_batch_id,
        notes,
        is_active,
        ordered_confirmed,
        ordered_confirmed_at,
        ordered_confirmed_by,
        onsite_confirmed,
        onsite_confirmed_at,
        onsite_confirmed_by,
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
          is_wire_drop_visible,
          is_inventory_item,
          required_for_prewire
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
      const onsite = items.filter(item => item.onsite_confirmed).length;
      const totalQuantity = items.reduce((sum, item) => sum + (item.planned_quantity || 0), 0);
      
      return {
        total,
        ordered,
        onsite,
        totalQuantity,
        orderedPercentage: total > 0 ? Math.round((ordered / total) * 100) : 0,
        onsitePercentage: total > 0 ? Math.round((onsite / total) * 100) : 0
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

  async updateProcurementStatus(equipmentId, { ordered, onsite, userId } = {}) {
    if (!supabase) throw new Error('Supabase not configured');
    if (!equipmentId) throw new Error('Equipment ID is required');

    const updates = {};

    if (typeof ordered === 'boolean') {
      updates.ordered_confirmed = ordered;
      updates.ordered_confirmed_at = ordered ? new Date().toISOString() : null;
      updates.ordered_confirmed_by = ordered ? userId || null : null;
    }

    if (typeof onsite === 'boolean') {
      updates.onsite_confirmed = onsite;
      updates.onsite_confirmed_at = onsite ? new Date().toISOString() : null;
      updates.onsite_confirmed_by = onsite ? userId || null : null;
    }

    if (Object.keys(updates).length === 0) {
      return null;
    }

    const { data, error } = await supabase
      .from('project_equipment')
      .update(updates)
      .eq('id', equipmentId)
      .select()
      .maybeSingle();

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
      updates.ordered_confirmed_by = userId || null;
      updates.ordered_confirmed_at = orderedQty > 0 ? new Date().toISOString() : null;
    }

    // Update received quantity (with validation)
    if (typeof receivedQty === 'number' && receivedQty >= 0) {
      const maxAllowed = Math.max(
        current.ordered_quantity || 0,
        current.planned_quantity || 0
      );

      if (receivedQty > maxAllowed) {
        throw new Error(
          `Cannot receive ${receivedQty} units. Maximum allowed is ${maxAllowed} ` +
          `(ordered: ${current.ordered_quantity || 0}, planned: ${current.planned_quantity || 0})`
        );
      }

      updates.received_quantity = receivedQty;
      updates.onsite_confirmed_by = userId || null;
      updates.onsite_confirmed_at = receivedQty > 0 ? new Date().toISOString() : null;
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

    // Update all items to received_quantity = ordered_quantity
    const updates = itemsToReceive.map(item => ({
      id: item.id,
      received_quantity: item.ordered_quantity,
      onsite_confirmed_at: new Date().toISOString()
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
  }
};
