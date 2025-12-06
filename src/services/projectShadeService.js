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

        // 1. Resolve Rooms
        // We reuse ensureRooms logic or basic lookup? 
        // For now, let's fetch existing rooms and match by name. 
        // If room doesn't exist, we should probably create it or warn?
        // Let's create them to be safe, similar to Equipment Service.

        // Fetch existing rooms
        const { data: existingRooms } = await supabase
            .from('project_rooms')
            .select('id, name')
            .eq('project_id', projectId);

        const roomMap = new Map();
        existingRooms?.forEach(r => roomMap.set(normalizeRoomName(r.name), r.id));

        // Identify new rooms
        const newRoomNames = new Set();
        rows.forEach(row => {
            const area = normalizeString(row.Area);
            if (area && !roomMap.has(normalizeRoomName(area))) {
                newRoomNames.add(area);
            }
        });

        if (newRoomNames.size > 0) {
            const { data: newRooms, error: roomError } = await supabase
                .from('project_rooms')
                .insert(Array.from(newRoomNames).map(name => ({
                    project_id: projectId,
                    name: name,
                    created_by: userId
                })))
                .select();

            if (roomError) throw roomError;
            newRooms?.forEach(r => roomMap.set(normalizeRoomName(r.name), r.id));
        }

        // 2. Build Shade Records
        const shadePayload = rows.map(row => {
            const name = normalizeString(row.Name);
            if (!name) return null;

            const area = normalizeString(row.Area);
            const roomId = roomMap.get(normalizeRoomName(area)) || null;

            return {
                project_id: projectId,
                room_id: roomId,
                name: name,
                // Use Line # or Name+Area as ID if Line # isn't clear in this CSV version
                // For now, we don't have a guaranteed stable ID in the CSV sample provided (no Line # column shown in previous turn).
                // We'll leave lutron_id null or use Name for now.
                lutron_id: name,

                // Quoted Specs
                quoted_width: normalizeString(row.Width),
                quoted_height: normalizeString(row.Height),
                mount_type: normalizeString(row['System Mount']),
                technology: normalizeString(row.Technology),
                product_type: normalizeString(row['Product Type']),
                model: normalizeString(row['Product Details']) || normalizeString(row.Product),

                // Initial Status
                m1_complete: false,
                m2_complete: false,
                approval_status: 'pending',
                design_review_status: 'pending',

                // Metadata
                created_by: userId,
                fabric_selection: normalizeString(row.Fabric) // Initial selection from quote
            };
        }).filter(Boolean);

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
            'System Mount': shade.mount_type,
            'Fabric': shade.fabric_selection,
            'Technology': shade.technology,
            // Status fields to help the user know what's changed
            'Status': shade.approval_status === 'approved' ? 'Approved' : 'Pending',
            'Field Verified': shade.m2_complete ? 'M2 Complete' : (shade.m1_complete ? 'M1 Complete' : 'No')
        }));
    }
};
