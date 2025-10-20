import Papa from 'papaparse';
import { supabase } from '../lib/supabase';
import { normalizeRoomName } from '../utils/roomUtils';

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
  const { data: existing, error } = await supabase
    .from('project_equipment')
    .select('id')
    .eq('project_id', projectId)
    .not('csv_batch_id', 'is', null);

  if (error) throw error;

  const equipmentIds = (existing || []).map((row) => row.id);

  if (equipmentIds.length > 0) {
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

  await supabase
    .from('project_equipment')
    .delete()
    .eq('project_id', projectId)
    .not('csv_batch_id', 'is', null);

  await supabase
    .from('project_labor_budget')
    .delete()
    .eq('project_id', projectId)
    .not('csv_batch_id', 'is', null);
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

    if (mode === 'replace') {
      await resetPreviousImports(projectId);
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
        const { data: inserted, error: equipmentError } = await supabase
          .from('project_equipment')
          .insert(equipmentRecords)
          .select();

        if (equipmentError) throw equipmentError;

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
        }
      }
    }

    let laborInserted = 0;
    let laborUpdated = 0;

    if (laborRecords.length > 0) {
      if (mode === 'replace') {
        const { error: laborError } = await supabase
          .from('project_labor_budget')
          .insert(laborRecords);

        if (laborError) throw laborError;
        laborInserted = laborRecords.length;
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
          resource_links,
          attributes
        )
      `)
      .eq('project_id', projectId)
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
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
      .single();

    if (error) {
      console.error('Failed to update procurement status:', error);
      throw new Error(error.message || 'Failed to update procurement status');
    }

    return data;
  }
};
