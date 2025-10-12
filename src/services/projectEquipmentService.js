import Papa from 'papaparse';
import { supabase } from '../lib/supabase';
import { normalizeRoomName } from '../utils/roomUtils';

const HEADEND_KEYWORDS = ['network', 'head', 'equipment', 'rack', 'structured', 'mda', 'server'];

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
    const description = normalizeString(row.ShortDescription);
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
      part_number: model || null,
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

    if (options.replaceExisting !== false) {
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

    if (equipmentRecords.length > 0) {
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
      }
    }

    if (laborRecords.length > 0) {
      const { error: laborError } = await supabase
        .from('project_labor_budget')
        .insert(laborRecords);

      if (laborError) throw laborError;
    }

    await supabase
      .from('equipment_import_batches')
      .update({
        status: 'processed',
        processed_rows: insertedEquipment.length + laborRecords.length,
        completed_at: new Date().toISOString()
      })
      .eq('id', batchId);

    return {
      batchId,
      equipmentInserted: insertedEquipment.length,
      laborInserted: laborRecords.length,
      roomsCreated: insertedCount
    };
  },

  async fetchProjectEquipment(projectId) {
    const { data, error } = await supabase
      .from('project_equipment')
      .select('*, project_rooms(name, is_headend)')
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
  }
};
