import { supabase } from '../lib/supabase';
import Papa from 'papaparse';

// Helper to normalize strings
const normalizeString = (str) => {
    if (!str) return null;
    return String(str).trim();
};

const normalizeRoomName = (name) => {
    if (!name) return '';
    return name.toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, ' ') // Replace non-alphanumeric with space
        .replace(/\s+/g, ' ')        // Collapse multiple spaces
        .trim();
};

const detectLutronCsv = (text) => {
    if (!text) return false;
    return text.includes('Technology') && text.includes('Product') && text.includes('System Mount');
};

const parseCsvFile = (file) => {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: ({ data }) => resolve(data),
            error: (error) => reject(error)
        });
    });
};

export const projectShadeService = {

    /**
     * Import a Lutron CSV into project_shades table.
     * @param {string} projectId 
     * @param {File} file 
     * @param {string} userId - UUID from MSAL (useAuth)
     */
    async importShadeCsv(projectId, file, userId) {
        if (!projectId || !file) throw new Error('Project and file are required');
        if (!userId) throw new Error('User ID is required for audit trail');

        const fileText = await file.text();
        if (!detectLutronCsv(fileText)) {
            throw new Error('Invalid Lutron CSV format. Missing required columns (Technology, Product, System Mount).');
        }

        const rows = await parseCsvFile(file);
        if (!rows.length) throw new Error('CSV file is empty');

        // 1. Resolve Rooms using Gemini AI
        const { data: existingRooms } = await supabase
            .from('project_rooms')
            .select('id, name')
            .eq('project_id', projectId);

        const projectRoomsList = existingRooms || [];
        const uniqueImportAreas = [...new Set(rows.map(r => normalizeString(r.Area)).filter(Boolean))];

        let roomMap = new Map(); // Normalized Name -> ID
        projectRoomsList.forEach(r => roomMap.set(normalizeRoomName(r.name), r.id));

        // Call Gemini API for matching
        try {
            const response = await fetch('/api/match-rooms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    importedAreas: uniqueImportAreas,
                    projectRooms: projectRoomsList
                })
            });

            if (response.ok) {
                const { mappings, newRooms } = await response.json();

                // Apply mappings
                Object.entries(mappings).forEach(([importName, roomId]) => {
                    const normalizedImport = normalizeRoomName(importName);
                    if (roomId) roomMap.set(normalizedImport, roomId);
                });

                // Create new rooms
                if (newRooms && newRooms.length > 0) {
                    const { data: createdRooms, error: roomError } = await supabase
                        .from('project_rooms')
                        .insert(newRooms.map(name => ({
                            project_id: projectId,
                            name: name,
                            created_by: userId
                        })))
                        .select();

                    if (!roomError && createdRooms) {
                        createdRooms.forEach(r => roomMap.set(normalizeRoomName(r.name), r.id));
                        // Also map the original import name to this new room if it was in the newRooms list logic
                        // But Gemini returns "Standardized Name", so we rely on the loop below to match by standard name 
                        // or we might need to be smarter. For now, we trust Gemini's "newRooms" are the names we want to use.
                        // We also need to map the *Imported* name to this new *Created* room ID.
                        // Since Gemini gave us "newRooms" as a list of strings, we assume the Import Area maps to one of these strings.
                        // We'll simplisticly assume if the normalized import name matches normalized new room name, it's a hit.
                    }
                }
            } else {
                console.warn('Gemini Room Match failed, falling back to exact match');
            }
        } catch (e) {
            console.error('Error calling match-rooms:', e);
            // Fallback: Proceed with existing map (exact matches only)
        }

        // 2. Create Import Batch
        const { data: batchData, error: batchError } = await supabase
            .from('project_shade_batches')
            .insert([{
                project_id: projectId,
                original_filename: file.name,
                original_headers: rows.meta?.fields || Object.keys(rows[0]),
                created_by: userId
            }])
            .select()
            .single();

        if (batchError) throw batchError;
        const batchId = batchData.id;

        // 3. Build Shade Records
        const shadePayload = [];

        for (const row of rows) {
            const name = normalizeString(row.Name);
            if (!name) continue;

            const area = normalizeString(row.Area);

            // Try explicit map first (from Gemini), then normalized exact match
            let roomId = null;

            // Check Gemini Mapping result (we need to have stored the "Import Name" -> ID map better above)
            // Re-refining the map logic locally:
            // The map above `roomMap` keys are `normalizeRoomName(name)`.
            // So we normalize the current row's area and check.
            const normArea = normalizeRoomName(area);
            roomId = roomMap.get(normArea);

            // If still null, maybe it was a "New Room" that we created but didn't map back explicitly
            // (e.g. Import "Living Rm" -> AI says create "Living Room" -> We created "Living Room")
            // We need to ensure we find "Living Room"'s ID for "Living Rm".
            // Since we added created rooms to `roomMap` under `normalizeRoomName("Living Room")`,
            // checking `normalizeRoomName("Living Rm")` might fail if they differ.
            // We'll rely on Gemini to have returned a mapping if it matched an existing room.
            // For new rooms, we might miss the link if we don't do a second pass.
            // IMPROVEMENT: If roomId is null, check if any room in map has fuzzy similarity or just rely on manual fix later.
            // For now, we leave it null or assign to "Unassigned".

            shadePayload.push({
                project_id: projectId,
                room_id: roomId,
                shade_batch_id: batchId,
                name: name,
                lutron_id: name,

                // Quoted Specs
                quoted_width: normalizeString(row.Width),
                quoted_height: normalizeString(row.Height),
                mount_type: normalizeString(row['System Mount']) || normalizeString(row['Mounting']),
                technology: normalizeString(row.Technology) || normalizeString(row.System),
                product_type: normalizeString(row['Product Type']),
                model: normalizeString(row['Product Details']) || normalizeString(row.Product),

                // Original Data for Round Trip
                original_csv_row: row,

                // Initial Status
                m1_complete: false,
                m2_complete: false,
                approval_status: 'pending',
                design_review_status: 'pending',

                // Metadata
                created_by: userId,
                fabric_selection: normalizeString(row.Fabric)
            });
        }

        if (shadePayload.length === 0) return { inserted: 0 };

        const { data, error } = await supabase
            .from('project_shades')
            .insert(shadePayload)
            .select();

        if (error) throw error;

        return { inserted: data.length };
    },

    /**
     * Fetch shades for a project, grouped by Room (handled by UI grouping usually)
     */
    async getShades(projectId) {
        const { data, error } = await supabase
            .from('project_shades')
            .select(`
            *,
            room:project_rooms(name)
        `)
            .eq('project_id', projectId)
            .order('name');

        if (error) throw error;
        return data;
    },

    /**
     * Send shades to Design Review
     */
    async sendToDesignReview(projectId, designerId, userId) {
        if (!projectId || !designerId) throw new Error('Project and Designer required');

        // Update all pending shades to 'sent'
        // Also assign the designer
        const { error } = await supabase
            .from('project_shades')
            .update({
                designer_stakeholder_id: designerId,
                design_review_status: 'sent',
                updated_at: new Date().toISOString()
            })
            .eq('project_id', projectId)
            .eq('design_review_status', 'pending'); // Only update pending ones

        if (error) throw error;
        // Logic for email notification would go here or trigger a cloud function
    },

    /**
     * Update field measurements for a shade (M1 or M2)
     * @param {string} shadeId
     * @param {Object} measurements - Measurement data
     * @param {string} userId
     * @param {string} set - 'm1' or 'm2'
     */
    async updateMeasurements(shadeId, measurements, userId, set = 'm1') {
        if (!userId) throw new Error('User ID required');
        if (!['m1', 'm2'].includes(set)) throw new Error('Invalid measurement set');

        const prefix = set; // 'm1' or 'm2'

        // Build update object dynamically based on set prefix
        const updates = {
            [`${prefix}_width`]: measurements.width,
            [`${prefix}_height`]: measurements.height,
            [`${prefix}_measure_width_top`]: measurements.widthTop,
            [`${prefix}_measure_width_middle`]: measurements.widthMiddle,
            [`${prefix}_measure_width_bottom`]: measurements.widthBottom,
            [`${prefix}_measure_height_left`]: measurements.heightLeft,
            [`${prefix}_measure_height_center`]: measurements.heightCenter,
            [`${prefix}_measure_height_right`]: measurements.heightRight,
            [`${prefix}_mount_depth`]: measurements.mountDepth,
            // Verified Mount Type
            [`${prefix}_mount_type`]: measurements.mountType,
            [`${prefix}_obstruction_notes`]: measurements.notes,
            [`${prefix}_photos`]: measurements.photos, // Array of URLs specific to this measurement set

            // Pocket Dimensions
            [`${prefix}_pocket_width`]: measurements.pocketWidth,
            [`${prefix}_pocket_height`]: measurements.pocketHeight,
            [`${prefix}_pocket_depth`]: measurements.pocketDepth,

            // Mark as complete for this set
            [`${prefix}_complete`]: true,
            [`${prefix}_date`]: new Date().toISOString(),
            [`${prefix}_by`]: userId,

            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('project_shades')
            .update(updates)
            .eq('id', shadeId);

        if (error) throw error;
    },

    /**
     * Designer approves or rejects a shade
     */
    async updateApproval(shadeId, status, changes, userId) {
        if (!userId) throw new Error('User ID required');

        const payload = {
            approval_status: status,
            approved_at: new Date().toISOString(),
            approved_by: userId, // Metadata: "Steve B" or "Designer Name"
            updated_at: new Date().toISOString()
        };

        if (changes.fabric) payload.fabric_selection = changes.fabric;
        if (changes.notes) payload.designer_notes = changes.notes;

        const { error } = await supabase
            .from('project_shades')
            .update(payload)
            .eq('id', shadeId);

        if (error) throw error;
    },

    /**
     * Generate CSV data for export (Round-Trip)
     * Formats it exactly like the Lutron import but with updated values
     */
    async getExportData(projectId) {
        const { data: shades, error } = await supabase
            .from('project_shades')
            .select('*, room:project_rooms(name)')
            .eq('project_id', projectId);

        if (error) throw error;

        // Map back to CSV format
        return shades.map(shade => ({
            'Area': shade.room?.name,
            'Name': shade.name,
            'Quantity': 1, // Shades are always 1:1 in this system
            'List Price': 0, // We don't track updated pricing yet
            'Product Type': shade.product_type,
            'Product': shade.model, // Rough mapping
            'Product Details': shade.model,
            // Prioritize M2 (Verified 2) -> M1 (Verified 1) -> Quoted
            'Width': shade.m2_width || shade.m1_width || shade.quoted_width,
            'Height': shade.m2_height || shade.m1_height || shade.quoted_height,
            'System Mount': shade.m2_mount_type || shade.m1_mount_type || shade.mount_type,
            'Fabric': shade.fabric_selection,
            'Technology': shade.technology,
            // Status fields to help the user know what's changed
            'Status': shade.approval_status === 'approved' ? 'Approved' : 'Pending',
            'Field Verified': shade.m2_complete ? 'M2 Complete' : (shade.m1_complete ? 'M1 Complete' : 'No')
        }));
    }
};
