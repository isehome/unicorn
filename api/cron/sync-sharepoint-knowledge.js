/**
 * Sync SharePoint Knowledge Cron Job
 *
 * Runs nightly at 2 AM to sync documents from SharePoint to the knowledge base.
 * This is a placeholder for future Azure AI Search integration.
 *
 * Schedule: 0 2 * * * (2 AM daily)
 *
 * Future Implementation:
 * 1. Connect to SharePoint via Microsoft Graph API
 * 2. List files in the Unicorn/knowledge folder
 * 3. For each new/updated file:
 *    - Download or get direct URL
 *    - Create knowledge_documents record
 *    - Trigger processing (or use Azure AI Search indexer)
 * 4. Remove records for deleted files
 *
 * Azure AI Search Alternative:
 * Instead of processing files ourselves, we can:
 * 1. Set up Azure AI Search with SharePoint connector
 * 2. Azure automatically indexes and embeds documents
 * 3. This job just syncs metadata to our knowledge_documents table
 * 4. Search queries go to Azure instead of Supabase pgvector
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const JOB_NAME = 'sync-sharepoint-knowledge';

// SharePoint configuration (to be set in environment)
const SHAREPOINT_SITE_ID = process.env.SHAREPOINT_SITE_ID;
const SHAREPOINT_FOLDER_PATH = process.env.SHAREPOINT_KNOWLEDGE_FOLDER || 'Unicorn/knowledge';
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

module.exports = async (req, res) => {
    // Verify this is a legitimate cron request from Vercel
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
            console.warn('[Cron] Unauthorized request to sync-sharepoint-knowledge');
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
        // Check if SharePoint integration is configured
        if (!AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET || !SHAREPOINT_SITE_ID) {
            const message = 'SharePoint integration not configured. Set AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, and SHAREPOINT_SITE_ID environment variables.';
            console.log(`[Cron] ${message}`);

            await supabase
                .from('job_runs')
                .update({
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    stats: {
                        message,
                        configured: false
                    }
                })
                .eq('id', jobId);

            return res.status(200).json({
                success: true,
                jobId,
                message,
                configured: false
            });
        }

        // Get Microsoft Graph access token
        const accessToken = await getMicrosoftGraphToken();

        // List files in SharePoint knowledge folder
        const files = await listSharePointFiles(accessToken);

        console.log(`[Cron] Found ${files.length} files in SharePoint`);

        let filesAdded = 0;
        let filesUpdated = 0;
        let filesSkipped = 0;

        for (const file of files) {
            // Check if we already have this file
            const { data: existing } = await supabase
                .from('knowledge_documents')
                .select('id, updated_at')
                .eq('file_url', file.webUrl)
                .single();

            if (existing) {
                // Check if file was modified
                const fileModified = new Date(file.lastModifiedDateTime);
                const recordUpdated = new Date(existing.updated_at);

                if (fileModified > recordUpdated) {
                    // File was updated - mark for reprocessing
                    await supabase
                        .from('knowledge_documents')
                        .update({
                            status: 'processing',
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', existing.id);
                    filesUpdated++;
                } else {
                    filesSkipped++;
                }
                continue;
            }

            // Determine manufacturer from folder or filename
            const manufacturer = inferManufacturerFromPath(file.name, file.parentReference?.path);

            // Get or create manufacturer record
            let manufacturerId = null;
            if (manufacturer) {
                const { data: mfg } = await supabase
                    .from('knowledge_manufacturers')
                    .select('id')
                    .ilike('name', manufacturer)
                    .single();

                manufacturerId = mfg?.id;
            }

            // Create new knowledge document record
            const { error: insertError } = await supabase
                .from('knowledge_documents')
                .insert({
                    manufacturer_id: manufacturerId,
                    title: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
                    file_name: file.name,
                    file_type: getFileExtension(file.name),
                    file_size: file.size,
                    file_url: file.webUrl,
                    category: inferCategory(file.name),
                    status: 'processing', // Will be processed by knowledge-process job
                    tags: []
                });

            if (insertError) {
                console.warn(`[Cron] Failed to add file ${file.name}:`, insertError.message);
                continue;
            }

            filesAdded++;
        }

        // Update job run with success
        const stats = {
            files_found: files.length,
            files_added: filesAdded,
            files_updated: filesUpdated,
            files_skipped: filesSkipped
        };

        await supabase
            .from('job_runs')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString(),
                stats
            })
            .eq('id', jobId);

        console.log(`[Cron] ${JOB_NAME} completed:`, stats);

        return res.status(200).json({
            success: true,
            jobId,
            stats
        });

    } catch (error) {
        console.error(`[Cron] ${JOB_NAME} failed:`, error);

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
 * Get Microsoft Graph API access token using client credentials flow
 */
async function getMicrosoftGraphToken() {
    const tokenUrl = `https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`;

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            client_id: AZURE_CLIENT_ID,
            client_secret: AZURE_CLIENT_SECRET,
            scope: 'https://graph.microsoft.com/.default',
            grant_type: 'client_credentials'
        })
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get Graph token: ${error.error_description || response.status}`);
    }

    const data = await response.json();
    return data.access_token;
}

/**
 * List files in SharePoint knowledge folder
 */
async function listSharePointFiles(accessToken) {
    // Get the drive ID for the site
    const driveUrl = `https://graph.microsoft.com/v1.0/sites/${SHAREPOINT_SITE_ID}/drive`;
    const driveResponse = await fetch(driveUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!driveResponse.ok) {
        throw new Error(`Failed to get drive: ${driveResponse.status}`);
    }

    const drive = await driveResponse.json();

    // List files in the knowledge folder
    const folderPath = encodeURIComponent(SHAREPOINT_FOLDER_PATH);
    const filesUrl = `https://graph.microsoft.com/v1.0/drives/${drive.id}/root:/${folderPath}:/children`;

    const filesResponse = await fetch(filesUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!filesResponse.ok) {
        if (filesResponse.status === 404) {
            console.log(`[Cron] Knowledge folder not found: ${SHAREPOINT_FOLDER_PATH}`);
            return [];
        }
        throw new Error(`Failed to list files: ${filesResponse.status}`);
    }

    const filesData = await filesResponse.json();

    // Filter to only include supported file types
    const supportedExtensions = ['pdf', 'md', 'txt', 'docx'];
    const files = (filesData.value || []).filter(item => {
        if (item.folder) return false; // Skip folders
        const ext = getFileExtension(item.name);
        return supportedExtensions.includes(ext);
    });

    return files;
}

/**
 * Infer manufacturer from file path or name
 */
function inferManufacturerFromPath(fileName, folderPath) {
    const nameLower = fileName.toLowerCase();
    const pathLower = (folderPath || '').toLowerCase();

    const manufacturers = [
        'lutron', 'control4', 'ubiquiti', 'sonos', 'araknis',
        'josh', 'savant', 'crestron', 'apple', 'rti'
    ];

    for (const mfg of manufacturers) {
        if (nameLower.includes(mfg) || pathLower.includes(mfg)) {
            // Capitalize first letter
            return mfg.charAt(0).toUpperCase() + mfg.slice(1);
        }
    }

    return null;
}

/**
 * Get file extension from filename
 */
function getFileExtension(fileName) {
    const parts = fileName.split('.');
    if (parts.length < 2) return 'txt';
    return parts.pop().toLowerCase();
}

/**
 * Infer document category from filename
 */
function inferCategory(fileName) {
    const nameLower = fileName.toLowerCase();

    if (nameLower.includes('spec') || nameLower.includes('datasheet')) {
        return 'spec-sheet';
    }
    if (nameLower.includes('install') || nameLower.includes('setup')) {
        return 'installation-guide';
    }
    if (nameLower.includes('troubleshoot') || nameLower.includes('faq')) {
        return 'troubleshooting';
    }
    if (nameLower.includes('train')) {
        return 'training';
    }
    if (nameLower.includes('bulletin') || nameLower.includes('tech note')) {
        return 'technical-bulletin';
    }
    if (nameLower.includes('manual') || nameLower.includes('guide')) {
        return 'user-manual';
    }
    if (nameLower.includes('quick') || nameLower.includes('reference')) {
        return 'quick-reference';
    }

    return 'other';
}
