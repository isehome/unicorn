require('dotenv').config();
const { requireAuth } = require('./_authMiddleware');
const puppeteer = require('puppeteer-core');
// const fetch = require('node-fetch'); // Native fetch is available in Node 18+
// Lazy load chromium to avoid initialization errors locally
let chromium = null;

// Shared utility for Azure token (reused from graph-upload.js logic)
// In a real app, this should be a shared utility file.
const TENANT = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

// Helper to find local Chrome on macOS/Windows
const fs = require('fs');
const path = require('path');

function getLocalChromePath() {
    const paths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

const isLocal = !!getLocalChromePath();

function b64Url(input) {
    return Buffer.from(input, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function getAppToken() {
    const body = new URLSearchParams();
    body.set('client_id', CLIENT_ID);
    body.set('client_secret', CLIENT_SECRET);
    body.set('grant_type', 'client_credentials');
    body.set('scope', 'https://graph.microsoft.com/.default');

    const resp = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Token error: ${resp.status} ${text}`);
    }
    const json = await resp.json();
    return json.access_token;
}

async function graph(token, url, options = {}) {
    const resp = await fetch(`https://graph.microsoft.com/v1.0${url}`, {
        ...options,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Graph ${url} ${resp.status}: ${text}`);
    }
    return resp.json();
}

async function ensureFolderPath(token, driveId, parentId, parts) {
    let currentId = parentId;
    for (const name of parts) {
        if (!name) continue;
        const list = await graph(token, `/drives/${driveId}/items/${currentId}/children?$select=id,name`);
        const found = (list.value || []).find(ch => ch.name === name);
        if (found) {
            currentId = found.id;
            continue;
        }
        const created = await graph(token, `/drives/${driveId}/items/${currentId}/children`, {
            method: 'POST',
            body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' })
        });
        currentId = created.id;
    }
    return currentId;
}

async function uploadBufferToItem(token, driveId, parentId, filename, buffer, contentType) {
    const session = await graph(token, `/drives/${driveId}/items/${parentId}:/${encodeURIComponent(filename)}:/createUploadSession`, {
        method: 'POST',
        body: JSON.stringify({ '@microsoft.graph.conflictBehavior': 'replace' })
    });
    const resp = await fetch(session.uploadUrl, {
        method: 'PUT',
        headers: {
            'Content-Length': buffer.length.toString(),
            'Content-Range': `bytes 0-${buffer.length - 1}/${buffer.length}`,
            'Content-Type': contentType || 'application/octet-stream'
        },
        body: buffer
    });
    if (!resp.ok && resp.status !== 201 && resp.status !== 200) {
        const text = await resp.text();
        throw new Error(`Upload failed: ${resp.status} ${text}`);
    }
    return await resp.json();
}

/**
 * Main Handler
 */
module.exports = async (req, res) => {
    console.log('[API] scrape-knowledge invoked', req.body.action);
    // CORS
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return res.status(200).end();
    }

    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Auth required for knowledge endpoints
    const user = await requireAuth(req, res);
    if (!user) return;

    const { action } = req.body;

    try {
        // ------------------------------------------------------------------
        // ACTION: SCAN (Find PDFs)
        // ------------------------------------------------------------------
        if (action === 'scan') {
            console.log('[API] Starting Scan Action. Is Local?', isLocal);
            const { url, username, password } = req.body;
            if (!url) return res.status(400).json({ error: 'Missing url' });

            let browser;
            if (isLocal) {
                console.log('[API] Running in Local Mode (Full Puppeteer)');
                // Use the full package we just installed which has its own Chrome
                const localPuppeteer = require('puppeteer');
                browser = await localPuppeteer.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });
            } else {
                console.log('[API] Running in Cloud Mode (Puppeteer Core + Chromium)');
                if (!chromium) {
                    chromium = require('@sparticuz/chromium');
                }
                const executablePath = await chromium.executablePath();
                browser = await puppeteer.launch({
                    args: chromium.args,
                    defaultViewport: { width: 1920, height: 1080 },
                    executablePath,
                    headless: chromium.headless,
                    ignoreHTTPSErrors: true,
                });
            }
            console.log('[API] Puppeteer Launched');

            try {
                const page = await browser.newPage();

                // Helper: Scrape a single page for PDFs and potential "Hub" links
                const scrapePage = async (targetUrl) => {
                    console.log(`[Scraper] Visiting: ${targetUrl}`);
                    try {
                        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }); // Faster timeout

                        // Wait a bit for JS to render links (crucial for modern sites like Sonos)
                        await new Promise(r => setTimeout(r, 2000));

                        // 1. Get PDFs
                        const pdfs = await page.$$eval('a', anchors => {
                            return anchors
                                .map(a => ({ href: a.href, text: a.innerText.trim() }))
                                .filter(link => {
                                    const h = link.href.toLowerCase();
                                    return h.endsWith('.pdf') || h.includes('pdf?'); // Catch .pdf?v=1
                                });
                        });

                        // 2. Get "Discovery" links (Support, Downloads, Manuals)
                        // Only relevant if we are on the main page
                        const hubs = await page.$$eval('a', anchors => {
                            const keywords = ['support', 'download', 'manual', 'document', 'resource', 'library'];
                            return anchors
                                .map(a => ({ href: a.href, text: a.innerText.trim() }))
                                .filter(link => {
                                    const txt = link.text.toLowerCase();
                                    const href = link.href.toLowerCase();
                                    // Must contain a keyword, not be a PDF, and belong to same domain
                                    return keywords.some(k => txt.includes(k) || href.includes(k))
                                        && !href.endsWith('.pdf')
                                        && href.startsWith('http');
                                });
                        });

                        return { pdfs, hubs };
                    } catch (e) {
                        console.warn(`[Scraper] Failed to scan ${targetUrl}: ${e.message}`);
                        return { pdfs: [], hubs: [] };
                    }
                };

                // --- Step 1: Login (if provided) ---
                if (username && password) {
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    const emailInput = await page.$('input[type="email"], input[name*="user"], input[name*="login"]');
                    const passInput = await page.$('input[type="password"]');
                    const submitBtn = await page.$('button[type="submit"], input[type="submit"]');

                    if (emailInput && passInput) {
                        await emailInput.type(username);
                        await passInput.type(password);
                        if (submitBtn) {
                            await Promise.all([
                                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => { }),
                                submitBtn.click()
                            ]);
                        }
                    }
                }

                // --- Step 2: Main Scan ---
                let allPdfs = [];
                const initialResult = await scrapePage(url);
                allPdfs = [...initialResult.pdfs];

                // --- Step 3: Deep Scan (heuristic) ---
                // If we didn't find many PDFs, visit the "Support"/"Download" pages found on the main page.
                // Limit to top 2 to avoid timeout.
                if (initialResult.hubs.length > 0) {
                    // Prioritize specific keywords
                    const priorityFn = (link) => {
                        const s = link.text.toLowerCase() + link.href;
                        if (s.includes('manual')) return 3;
                        if (s.includes('download')) return 2;
                        if (s.includes('support')) return 1;
                        return 0;
                    };

                    const sortedHubs = initialResult.hubs
                        .sort((a, b) => priorityFn(b) - priorityFn(a))
                        .slice(0, 2); // Visit top 2

                    // Dedupe against already visited
                    const targets = sortedHubs.filter(h => h.href !== url);

                    for (const hub of targets) {
                        const hubResult = await scrapePage(hub.href);
                        allPdfs = [...allPdfs, ...hubResult.pdfs];
                    }
                }

                await browser.close();

                // Deduplicate
                const uniquePdfs = Array.from(new Map(allPdfs.map(item => [item.href, item])).values());

                return res.status(200).json({
                    success: true,
                    count: uniquePdfs.length,
                    links: uniquePdfs,
                    scanned: [url, ...initialResult.hubs.slice(0, 2).map(h => h.href)]
                });

            } catch (err) {
                await browser.close();
                throw err;
            }
        }

        // ------------------------------------------------------------------
        // ACTION: PROCESS_FILE (Download & Upload)
        // ------------------------------------------------------------------
        if (action === 'process_file') {
            const { fileUrl, manufacturerName, rootUrl } = req.body; // rootUrl is SharePoint root

            if (!fileUrl) return res.status(400).json({ error: 'Missing fileUrl' });
            if (!rootUrl) return res.status(400).json({ error: 'Missing rootUrl for SharePoint' });

            console.log(`[Scraper] Processing: ${fileUrl}`);

            // 1. Download File
            const fileResp = await fetch(fileUrl);
            if (!fileResp.ok) throw new Error(`Failed to download file: ${fileResp.statusText}`);

            const buffer = await fileResp.buffer();
            const contentType = fileResp.headers.get('content-type');

            // Extract filename from URL
            let filename = fileUrl.split('/').pop().split('#')[0].split('?')[0];
            if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';
            // Sanitize
            filename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');

            // 2. Upload to SharePoint
            if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) {
                throw new Error('Server missing Azure credentials');
            }

            const token = await getAppToken();

            // Resolve SharePoint Drive - handle both sharing links and direct library URLs
            let driveId, parentId;

            if (rootUrl.includes('/sites/') && !rootUrl.includes('/:')) {
                // Direct library URL format: https://tenant.sharepoint.com/sites/SiteName/LibraryName
                // Extract site and library name
                const urlMatch = rootUrl.match(/\/sites\/([^/]+)\/([^/?]+)/);
                if (!urlMatch) throw new Error('Invalid SharePoint URL format');

                const [, siteName, libraryName] = urlMatch;
                const siteHost = new URL(rootUrl).hostname;

                // Get the site
                const site = await graph(token, `/sites/${siteHost}:/sites/${siteName}`);

                // Get the drive (library) by name
                const drives = await graph(token, `/sites/${site.id}/drives`);
                const drive = drives.value.find(d => d.name === libraryName || d.webUrl?.includes(`/${libraryName}`));

                if (!drive) throw new Error(`Library "${libraryName}" not found`);

                driveId = drive.id;
                parentId = drive.root.id; // Root of the library
            } else {
                // Sharing link format - use the original resolution method
                const encoded = 'u!' + b64Url(rootUrl);
                const driveItem = await graph(token, `/shares/${encoded}/driveItem?$select=id,webUrl,parentReference`);
                driveId = driveItem.parentReference.driveId;
                parentId = driveItem.id;
            }

            // Target Folder: "Knowledge/{ManufacturerName}"
            // Note: The parentId comes from the "Knowledge" folder link if provided as rootUrl,
            // but the rootUrl we are passing "sites/Unicorn" resolves to the *site drive* root.
            // If the user wants it in "Knowledge" specifically:
            // 1. If we resolve the site root, we should path it 'Knowledge/Manufacturer'.
            // 2. If we resolve a specific folder link, we should just append 'Manufacturer'.

            // Current approach passes site root. So we build the full path.
            const subPath = manufacturerName || 'General';
            const finalParentId = await ensureFolderPath(token, driveId, parentId, subPath.split('/'));

            // Upload
            const item = await uploadBufferToItem(token, driveId, finalParentId, filename, buffer, contentType);

            // Create Share Link (for viewing)
            let webUrl = item.webUrl;
            try {
                const embedLink = await graph(token, `/drives/${driveId}/items/${item.id}/createLink`, {
                    method: 'POST',
                    body: JSON.stringify({ type: 'embed', scope: 'organization' })
                });
                if (embedLink.link?.webUrl) webUrl = embedLink.link.webUrl;
            } catch (e) {
                console.warn('Failed to create embed link, using webUrl');
            }

            return res.status(200).json({
                success: true,
                filename,
                webUrl,
                size: item.size
            });
        }

        // ------------------------------------------------------------------
        // ACTION: PROCESS_PAGE (Convert Web Page to Markdown & Upload)
        // ------------------------------------------------------------------
        if (action === 'process_page') {
            const { url, manufacturerName, rootUrl } = req.body;

            if (!url) return res.status(400).json({ error: 'Missing url' });
            if (!rootUrl) return res.status(400).json({ error: 'Missing rootUrl' });

            // Launch Browser (Copy of Scan logic for robustness)
            let browser;
            if (isLocal) {
                const localPuppeteer = require('puppeteer');
                browser = await localPuppeteer.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });
            } else {
                if (!chromium) chromium = require('@sparticuz/chromium');
                browser = await puppeteer.launch({
                    args: chromium.args,
                    defaultViewport: { width: 1920, height: 1080 },
                    executablePath: await chromium.executablePath(),
                    headless: chromium.headless,
                    ignoreHTTPSErrors: true,
                });
            }

            try {
                const page = await browser.newPage();
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                // Wait for content
                await new Promise(r => setTimeout(r, 2000));

                // Extract Main Content
                const contentHtml = await page.evaluate(() => {
                    // Remove obvious clutter BEFORE selecting main to avoid selecting a wrapper that contains the clutter
                    const clutterSelectors = ['nav', 'footer', 'script', 'style', 'noscript', 'iframe', '.ad', '.advertisement', '#cookie-banner', '.cookie-consent'];
                    clutterSelectors.forEach(sel => {
                        document.querySelectorAll(sel).forEach(el => el.remove());
                    });

                    // Try to find the "meat" of the page
                    const main = document.querySelector('main') || document.querySelector('article') || document.querySelector('#content') || document.body;
                    return main.innerHTML;
                });

                await browser.close();

                // Convert to Markdown
                const TurndownService = require('turndown');
                const turndownService = new TurndownService({
                    codeBlockStyle: 'fenced',
                    headingStyle: 'atx',
                    hr: '---'
                });
                // Remove images for now to keep text clean, or keep them? Keep them, they might have useful alt text.
                // turndownService.remove('img'); 

                const markdown = turndownService.turndown(contentHtml);
                const title = (url.split('/').pop() || 'web-page').split('?')[0].replace(/[^a-zA-Z0-9-_]/g, '_');
                const filename = `${title}.md`;

                // Add Frontmatter/Header
                const finalContent = `---
source: ${url}
date: ${new Date().toISOString()}
---

# Web Capture: ${url}

${markdown}`;

                // Upload to SharePoint
                if (!TENANT || !CLIENT_ID || !CLIENT_SECRET) throw new Error('Server missing Azure credentials');
                const token = await getAppToken();

                // Resolve SharePoint Drive - handle both sharing links and direct library URLs
                let driveId, parentId;

                if (rootUrl.includes('/sites/') && !rootUrl.includes('/:')) {
                    // Direct library URL format
                    const urlMatch = rootUrl.match(/\/sites\/([^/]+)\/([^/?]+)/);
                    if (!urlMatch) throw new Error('Invalid SharePoint URL format');

                    const [, siteName, libraryName] = urlMatch;
                    const siteHost = new URL(rootUrl).hostname;

                    const site = await graph(token, `/sites/${siteHost}:/sites/${siteName}`);
                    const drives = await graph(token, `/sites/${site.id}/drives`);
                    const drive = drives.value.find(d => d.name === libraryName || d.webUrl?.includes(`/${libraryName}`));

                    if (!drive) throw new Error(`Library "${libraryName}" not found`);

                    driveId = drive.id;
                    parentId = drive.root.id;
                } else {
                    // Sharing link format
                    const encoded = 'u!' + b64Url(rootUrl);
                    const driveItem = await graph(token, `/shares/${encoded}/driveItem?$select=id,webUrl,parentReference`);
                    driveId = driveItem.parentReference.driveId;
                    parentId = driveItem.id;
                }

                const subPath = manufacturerName || 'General';
                const finalParentId = await ensureFolderPath(token, driveId, parentId, subPath.split('/'));

                const buffer = Buffer.from(finalContent, 'utf8');
                const item = await uploadBufferToItem(token, driveId, finalParentId, filename, buffer, 'text/markdown');

                return res.status(200).json({
                    success: true,
                    filename,
                    webUrl: item.webUrl,
                    size: item.size
                });

            } catch (err) {
                if (browser) await browser.close();
                throw err;
            }
        }

    } catch (err) {
        console.error('[Scraper Error]', err);
        return res.status(500).json({ error: err.message });
    }
};
