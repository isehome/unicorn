/**
 * Enhanced Knowledge Scraper v2
 *
 * Improvements over v1:
 * - Scrapes both PDFs and web pages (converts to markdown)
 * - Deeper recursive crawling with smart link detection
 * - Better content extraction (removes nav, ads, footers)
 * - Rate limiting to avoid being blocked
 * - Caches visited URLs to avoid duplicates
 * - Supports scheduled manufacturer syncs
 */

require('dotenv').config();
const TurndownService = require('turndown');

// Lazy load puppeteer/chromium
let chromium = null;
const fs = require('fs');
const path = require('path');

// Azure credentials
const TENANT = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

// Configuration
const CONFIG = {
    MAX_DEPTH: 3,           // How deep to crawl from entry page
    MAX_PAGES: 50,          // Max pages per scrape session
    RATE_LIMIT_MS: 1500,    // Delay between requests
    PAGE_TIMEOUT: 20000,    // Page load timeout
    CONTENT_MIN_LENGTH: 200 // Min chars for a page to be considered useful
};

// ============== HELPERS ==============

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
    return Buffer.from(input, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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
    if (!resp.ok) throw new Error(`Token error: ${resp.status}`);
    return (await resp.json()).access_token;
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

async function uploadToSharePoint(token, driveId, parentId, filename, buffer, contentType) {
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
        throw new Error(`Upload failed: ${resp.status}`);
    }
    return await resp.json();
}

// ============== CONTENT EXTRACTION ==============

function initTurndown() {
    const turndown = new TurndownService({
        codeBlockStyle: 'fenced',
        headingStyle: 'atx',
        hr: '---',
        bulletListMarker: '-'
    });

    // Better table handling
    turndown.addRule('tables', {
        filter: 'table',
        replacement: function(content, node) {
            // Simple table to markdown
            const rows = node.querySelectorAll('tr');
            if (!rows.length) return content;

            let md = '\n';
            rows.forEach((row, i) => {
                const cells = row.querySelectorAll('td, th');
                const rowContent = Array.from(cells).map(c => c.textContent.trim()).join(' | ');
                md += `| ${rowContent} |\n`;
                if (i === 0) {
                    md += '|' + Array.from(cells).map(() => '---').join('|') + '|\n';
                }
            });
            return md + '\n';
        }
    });

    return turndown;
}

// Keywords that indicate documentation/support content
const DOC_KEYWORDS = [
    'support', 'download', 'manual', 'document', 'resource', 'guide',
    'specification', 'spec', 'datasheet', 'installation', 'setup',
    'faq', 'help', 'kb', 'knowledge', 'article', 'tutorial', 'how-to',
    'troubleshoot', 'firmware', 'software', 'driver', 'update'
];

// Patterns to exclude (navigation, login, etc.)
const EXCLUDE_PATTERNS = [
    /\/login/i, /\/signin/i, /\/register/i, /\/cart/i, /\/checkout/i,
    /\/account/i, /\/profile/i, /\/search\?/i, /\/contact/i,
    /facebook\.com/i, /twitter\.com/i, /linkedin\.com/i, /youtube\.com/i,
    /\.jpg$/i, /\.png$/i, /\.gif$/i, /\.svg$/i, /\.ico$/i,
    /mailto:/i, /tel:/i, /javascript:/i
];

function isDocumentationLink(url, text) {
    const urlLower = url.toLowerCase();
    const textLower = (text || '').toLowerCase();

    // Exclude certain patterns
    if (EXCLUDE_PATTERNS.some(p => p.test(url))) return false;

    // Include if it's a PDF
    if (urlLower.endsWith('.pdf') || urlLower.includes('.pdf?')) return true;

    // Include if URL or text contains doc keywords
    if (DOC_KEYWORDS.some(k => urlLower.includes(k) || textLower.includes(k))) return true;

    return false;
}

function scoreLink(url, text) {
    let score = 0;
    const combined = (url + ' ' + (text || '')).toLowerCase();

    // PDF gets high score
    if (combined.includes('.pdf')) score += 10;

    // Doc keywords boost score
    DOC_KEYWORDS.forEach(k => {
        if (combined.includes(k)) score += 2;
    });

    // Product-specific pages are valuable
    if (/product|model|series/i.test(combined)) score += 3;

    return score;
}

// ============== CRAWLER ==============

async function createBrowser() {
    if (isLocal) {
        const localPuppeteer = require('puppeteer');
        return await localPuppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    } else {
        if (!chromium) chromium = require('@sparticuz/chromium');
        const puppeteer = require('puppeteer-core');
        return await puppeteer.launch({
            args: chromium.args,
            defaultViewport: { width: 1920, height: 1080 },
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
            ignoreHTTPSErrors: true
        });
    }
}

async function crawlSite(entryUrl, options = {}) {
    const { maxDepth = CONFIG.MAX_DEPTH, maxPages = CONFIG.MAX_PAGES } = options;

    const visited = new Set();
    const results = {
        pdfs: [],
        pages: [],
        errors: []
    };

    const browser = await createBrowser();
    const turndown = initTurndown();

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

        // Get base domain for same-site filtering
        const entryDomain = new URL(entryUrl).hostname;

        async function crawlPage(url, depth) {
            if (depth > maxDepth) return;
            if (visited.has(url)) return;
            if (visited.size >= maxPages) return;

            visited.add(url);
            console.log(`[Crawler] Depth ${depth}: ${url}`);

            try {
                await page.goto(url, {
                    waitUntil: 'domcontentloaded',
                    timeout: CONFIG.PAGE_TIMEOUT
                });

                // Wait for dynamic content
                await new Promise(r => setTimeout(r, 1500));

                // Extract all links
                const links = await page.evaluate(() => {
                    return Array.from(document.querySelectorAll('a[href]')).map(a => ({
                        href: a.href,
                        text: a.innerText.trim()
                    }));
                });

                // Categorize and filter links
                const docLinks = [];
                for (const link of links) {
                    try {
                        const linkUrl = new URL(link.href);

                        // Same domain only (or same parent domain)
                        if (!linkUrl.hostname.includes(entryDomain.split('.').slice(-2).join('.'))) continue;

                        // PDF?
                        if (link.href.toLowerCase().includes('.pdf')) {
                            if (!results.pdfs.find(p => p.href === link.href)) {
                                results.pdfs.push({
                                    href: link.href,
                                    text: link.text || link.href.split('/').pop(),
                                    type: 'pdf',
                                    depth
                                });
                            }
                            continue;
                        }

                        // Documentation page?
                        if (isDocumentationLink(link.href, link.text)) {
                            const score = scoreLink(link.href, link.text);
                            docLinks.push({ ...link, score, depth: depth + 1 });
                        }
                    } catch (e) {
                        // Invalid URL
                    }
                }

                // Extract page content if it looks useful
                const pageContent = await page.evaluate(() => {
                    // Remove clutter
                    ['nav', 'footer', 'header', 'script', 'style', 'noscript', 'iframe',
                     '.nav', '.footer', '.header', '.sidebar', '.menu', '.cookie', '.ad',
                     '#nav', '#footer', '#header', '#sidebar', '#menu'].forEach(sel => {
                        document.querySelectorAll(sel).forEach(el => el.remove());
                    });

                    // Get main content
                    const main = document.querySelector('main, article, .content, .main, #content, #main')
                              || document.body;

                    return {
                        title: document.title,
                        html: main.innerHTML,
                        text: main.innerText
                    };
                });

                // Save page if it has substantial content
                if (pageContent.text.length >= CONFIG.CONTENT_MIN_LENGTH) {
                    const markdown = turndown.turndown(pageContent.html);

                    // Only save if markdown conversion produced content
                    if (markdown.length >= CONFIG.CONTENT_MIN_LENGTH) {
                        results.pages.push({
                            url,
                            title: pageContent.title,
                            markdown,
                            depth,
                            type: 'page'
                        });
                    }
                }

                // Sort by score and crawl top links
                docLinks.sort((a, b) => b.score - a.score);
                const topLinks = docLinks.slice(0, 10); // Top 10 per page

                for (const link of topLinks) {
                    await new Promise(r => setTimeout(r, CONFIG.RATE_LIMIT_MS));
                    await crawlPage(link.href, link.depth);
                }

            } catch (err) {
                console.warn(`[Crawler] Error on ${url}: ${err.message}`);
                results.errors.push({ url, error: err.message });
            }
        }

        await crawlPage(entryUrl, 0);

    } finally {
        await browser.close();
    }

    return results;
}

// ============== MAIN HANDLER ==============

module.exports = async (req, res) => {
    // CORS
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(200).end();
    }
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { action } = req.body;

    try {
        // ------------------------------------------------------------------
        // ACTION: CRAWL - Deep crawl a site for documentation
        // ------------------------------------------------------------------
        if (action === 'crawl') {
            const { url, maxDepth, maxPages } = req.body;
            if (!url) return res.status(400).json({ error: 'Missing url' });

            console.log(`[Scraper v2] Starting crawl: ${url}`);

            const results = await crawlSite(url, {
                maxDepth: maxDepth || CONFIG.MAX_DEPTH,
                maxPages: maxPages || CONFIG.MAX_PAGES
            });

            return res.status(200).json({
                success: true,
                stats: {
                    pagesVisited: results.pdfs.length + results.pages.length + results.errors.length,
                    pdfsFound: results.pdfs.length,
                    pagesExtracted: results.pages.length,
                    errors: results.errors.length
                },
                pdfs: results.pdfs.map(p => ({
                    url: p.href,
                    title: p.text || p.href.split('/').pop(),
                    type: 'pdf'
                })),
                pages: results.pages.map(p => ({
                    url: p.url,
                    title: p.title,
                    content: p.markdown,  // Include full content for import
                    type: 'page'
                })),
                errors: results.errors
            });
        }

        // ------------------------------------------------------------------
        // ACTION: IMPORT - Import crawled content to SharePoint
        // ------------------------------------------------------------------
        if (action === 'import') {
            const { items, manufacturerName, libraryUrl } = req.body;

            if (!items || !items.length) return res.status(400).json({ error: 'No items to import' });
            if (!libraryUrl) return res.status(400).json({ error: 'Missing libraryUrl' });

            const token = await getAppToken();

            // Resolve SharePoint library
            let driveId, rootId;
            const urlMatch = libraryUrl.match(/\/sites\/([^/]+)\/([^/?]+)/);
            if (urlMatch) {
                const [, siteName, libraryName] = urlMatch;
                const siteHost = new URL(libraryUrl).hostname;
                const site = await graph(token, `/sites/${siteHost}:/sites/${siteName}`);
                const drives = await graph(token, `/sites/${site.id}/drives`);
                const drive = drives.value.find(d => d.name === libraryName);
                if (!drive) throw new Error(`Library "${libraryName}" not found`);
                driveId = drive.id;
                rootId = drive.root.id;
            } else {
                throw new Error('Invalid library URL format');
            }

            // Create manufacturer folder
            const folderName = (manufacturerName || 'General').replace(/[^a-zA-Z0-9-_ ]/g, '');
            const folderId = await ensureFolderPath(token, driveId, rootId, [folderName]);

            const results = { success: [], failed: [] };

            for (const item of items) {
                try {
                    let buffer, filename, contentType;

                    if (item.type === 'pdf') {
                        // Download PDF
                        const resp = await fetch(item.href || item.url);
                        if (!resp.ok) throw new Error('Download failed');
                        buffer = Buffer.from(await resp.arrayBuffer());
                        filename = (item.href || item.url).split('/').pop().split('?')[0];
                        if (!filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';
                        filename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
                        contentType = 'application/pdf';
                    } else {
                        // Web page - create markdown
                        const title = item.title || 'Web Page';
                        const content = `---
title: "${title}"
source: ${item.url}
scraped: ${new Date().toISOString()}
manufacturer: ${manufacturerName || 'General'}
---

# ${title}

${item.markdown || item.content || ''}

---
*Source: [${item.url}](${item.url})*
`;
                        buffer = Buffer.from(content, 'utf8');
                        filename = title.replace(/[^a-zA-Z0-9-_ ]/g, '_').slice(0, 100) + '.md';
                        contentType = 'text/markdown';
                    }

                    const uploaded = await uploadToSharePoint(token, driveId, folderId, filename, buffer, contentType);
                    results.success.push({
                        filename,
                        title: item.title || filename,
                        type: item.type,
                        sourceUrl: item.url || item.href,
                        webUrl: uploaded.webUrl,
                        size: buffer.length
                    });

                    // Rate limit uploads
                    await new Promise(r => setTimeout(r, 500));

                } catch (err) {
                    results.failed.push({
                        url: item.url || item.href,
                        error: err.message
                    });
                }
            }

            return res.status(200).json({
                success: true,
                imported: results.success,  // Array of imported items
                failed: results.failed,     // Array of failed items
                stats: {
                    importedCount: results.success.length,
                    failedCount: results.failed.length
                }
            });
        }

        return res.status(400).json({ error: 'Unknown action' });

    } catch (err) {
        console.error('[Scraper v2 Error]', err);
        return res.status(500).json({ error: err.message });
    }
};
