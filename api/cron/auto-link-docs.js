/**
 * Auto-Link Documents Cron Job
 *
 * Runs nightly at 3 AM to automatically link knowledge base documents
 * to global_parts based on manufacturer, model, and part number matching.
 *
 * Schedule: 0 3 * * * (3 AM daily)
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JOB_NAME = 'auto-link-docs';

module.exports = async (req, res) => {
    // Verify this is a legitimate cron request from Vercel
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        // In development or if CRON_SECRET not set, allow manual triggers
        if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
            console.warn('[Cron] Unauthorized request to auto-link-docs');
            return res.status(401).json({ error: 'Unauthorized' });
        }
    }

    console.log(`[Cron] Starting ${JOB_NAME} job`);

    // Create job run record
    const { data: jobRun, error: jobError } = await supabase
        .from('job_runs')
        .insert({
            job_name: JOB_NAME,
            status: 'running',
            stats: {}
        })
        .select()
        .single();

    if (jobError) {
        console.error('[Cron] Failed to create job run:', jobError);
        return res.status(500).json({ error: 'Failed to start job', details: jobError.message });
    }

    const jobId = jobRun.id;

    try {
        // Get all ready knowledge documents
        const { data: docs, error: docsError } = await supabase
            .from('knowledge_documents')
            .select(`
                id,
                title,
                file_name,
                file_url,
                category,
                manufacturer:knowledge_manufacturers(id, name, slug)
            `)
            .eq('status', 'ready');

        if (docsError) throw docsError;

        // Get all global parts
        const { data: parts, error: partsError } = await supabase
            .from('global_parts')
            .select('id, part_number, name, manufacturer, model, category');

        if (partsError) throw partsError;

        console.log(`[Cron] Processing ${docs?.length || 0} documents against ${parts?.length || 0} parts`);

        let linksCreated = 0;
        let linksSkipped = 0;
        const matches = [];

        // Process each document
        for (const doc of docs || []) {
            const docMatches = matchDocToParts(doc, parts);

            for (const match of docMatches) {
                // Check if link already exists
                const { data: existing } = await supabase
                    .from('global_part_documents')
                    .select('id')
                    .eq('part_id', match.part.id)
                    .eq('knowledge_doc_id', doc.id)
                    .single();

                if (existing) {
                    linksSkipped++;
                    continue;
                }

                // Create the link
                const { error: insertError } = await supabase
                    .from('global_part_documents')
                    .insert({
                        part_id: match.part.id,
                        document_type: inferDocumentType(doc.title, doc.category),
                        label: doc.title,
                        url: doc.file_url,
                        source: 'auto-linked',
                        confidence: match.confidence,
                        matched_on: match.matchedOn,
                        knowledge_doc_id: doc.id
                    });

                if (insertError) {
                    console.warn(`[Cron] Failed to create link: ${insertError.message}`);
                    continue;
                }

                linksCreated++;
                matches.push({
                    doc: doc.title,
                    part: match.part.name || match.part.part_number,
                    confidence: match.confidence,
                    matchedOn: match.matchedOn
                });
            }
        }

        // Update job run with success
        const stats = {
            docs_processed: docs?.length || 0,
            parts_checked: parts?.length || 0,
            links_created: linksCreated,
            links_skipped: linksSkipped,
            matches: matches.slice(0, 50) // Keep first 50 for logging
        };

        await supabase
            .from('job_runs')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                stats
            })
            .eq('id', jobId);

        console.log(`[Cron] ${JOB_NAME} completed: ${linksCreated} links created, ${linksSkipped} skipped`);

        return res.status(200).json({
            success: true,
            jobId,
            stats
        });

    } catch (error) {
        console.error(`[Cron] ${JOB_NAME} failed:`, error);

        // Update job run with failure
        await supabase
            .from('job_runs')
            .update({
                status: 'failed',
                completed_at: new Date().toISOString(),
                error_message: error.message
            })
            .eq('id', jobId);

        return res.status(500).json({
            error: 'Job failed',
            jobId,
            details: error.message
        });
    }
};

/**
 * Match a document to parts based on various fields
 */
function matchDocToParts(doc, parts) {
    const matches = [];
    const docText = `${doc.title} ${doc.file_name}`.toLowerCase();
    const docManufacturer = doc.manufacturer?.name?.toLowerCase() || '';

    for (const part of parts) {
        let confidence = 0;
        let matchedOn = null;

        // Priority 1: Model number match (highest confidence)
        if (part.model && part.model.length > 2) {
            const modelLower = part.model.toLowerCase();
            if (docText.includes(modelLower)) {
                confidence = 0.95;
                matchedOn = 'model';
            }
        }

        // Priority 2: Part number match
        if (!matchedOn && part.part_number && part.part_number.length > 3) {
            const partNumLower = part.part_number.toLowerCase();
            if (docText.includes(partNumLower)) {
                confidence = 0.90;
                matchedOn = 'part_number';
            }
        }

        // Priority 3: Manufacturer match (if doc has manufacturer metadata)
        if (!matchedOn && docManufacturer && part.manufacturer) {
            const partMfgLower = part.manufacturer.toLowerCase();
            if (docManufacturer === partMfgLower || docManufacturer.includes(partMfgLower)) {
                // Lower confidence since many parts share a manufacturer
                confidence = 0.50;
                matchedOn = 'manufacturer';
            }
        }

        // Only include matches above threshold
        if (confidence >= 0.50) {
            matches.push({
                part,
                confidence,
                matchedOn
            });
        }
    }

    // Sort by confidence descending
    return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Infer document type from title and category
 */
function inferDocumentType(title, category) {
    const titleLower = title.toLowerCase();

    // Check category first
    if (category) {
        const categoryMap = {
            'spec-sheet': 'datasheet',
            'installation-guide': 'instruction',
            'troubleshooting': 'manual',
            'training': 'manual',
            'technical-bulletin': 'datasheet',
            'user-manual': 'manual',
            'quick-reference': 'instruction'
        };
        if (categoryMap[category]) {
            return categoryMap[category];
        }
    }

    // Fall back to title keywords
    if (titleLower.includes('spec') || titleLower.includes('datasheet') || titleLower.includes('data sheet')) {
        return 'datasheet';
    }
    if (titleLower.includes('install') || titleLower.includes('setup') || titleLower.includes('quick start')) {
        return 'instruction';
    }
    if (titleLower.includes('manual') || titleLower.includes('guide')) {
        return 'manual';
    }
    if (titleLower.includes('schematic') || titleLower.includes('wiring') || titleLower.includes('diagram')) {
        return 'schematic';
    }
    if (titleLower.includes('video') || titleLower.includes('tutorial')) {
        return 'video';
    }

    return 'other';
}
