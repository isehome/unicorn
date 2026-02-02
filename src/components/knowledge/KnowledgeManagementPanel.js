import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { enhancedStyles } from '../../styles/styleSystem';
import {
    BookOpen,
    Upload,
    Trash2,
    Search,
    FileText,
    Building2,
    Plus,
    CheckCircle,
    AlertCircle,
    Loader2,
    ChevronDown,
    ChevronRight,
    ExternalLink,
    Globe
} from 'lucide-react';
import Button from '../ui/Button';
import * as knowledgeService from '../../services/knowledgeService';
import { supabase } from '../../lib/supabase';

const KnowledgeManagementPanel = () => {
    const { mode } = useTheme();
    const sectionStyles = enhancedStyles.sections[mode];

    // State
    const [manufacturers, setManufacturers] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [selectedManufacturer, setSelectedManufacturer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // UI State
    const [showAddManufacturer, setShowAddManufacturer] = useState(false);
    const [showUploadForm, setShowUploadForm] = useState(false);
    const [expandedDocs, setExpandedDocs] = useState(new Set());

    // Form State
    const [newManufacturer, setNewManufacturer] = useState({ name: '', description: '' });
    const [uploadFile, setUploadFile] = useState(null);
    const [uploadMetadata, setUploadMetadata] = useState({
        title: '',
        category: 'other',
        description: '',
        manufacturerId: null
    });
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');

    // Scraper State
    const [showScraperForm, setShowScraperForm] = useState(false);
    const [scrapeStep, setScrapeStep] = useState('config'); // config, review, processing, complete
    const [scrapeConfig, setScrapeConfig] = useState({
        url: '',
        manufacturerId: '',
        maxDepth: 3,
        maxPages: 50
    });
    const [scanning, setScanning] = useState(false);
    const [scrapedFiles, setScrapedFiles] = useState([]);
    const [crawlStats, setCrawlStats] = useState({ pagesVisited: 0, pdfsFound: 0, pagesExtracted: 0 });
    const [importStats, setImportStats] = useState({ current: 0, total: 0, success: 0, failed: 0 });

    // Scraper Handlers - Using v2 deep crawler
    const handleScanSite = async (e) => {
        e.preventDefault();
        console.log('[Scraper v2] Starting deep crawl for:', scrapeConfig.url);
        try {
            setScanning(true);
            setError(null);

            // Normalize URL
            let targetUrl = scrapeConfig.url.trim();
            if (!/^https?:\/\//i.test(targetUrl)) {
                targetUrl = 'https://' + targetUrl;
            }
            console.log('[Scraper v2] Normalized URL:', targetUrl);

            // Use v2 deep crawler
            const result = await knowledgeService.crawlSite({
                url: targetUrl,
                maxDepth: scrapeConfig.maxDepth,
                maxPages: scrapeConfig.maxPages
            });

            console.log('[Scraper v2] Crawl Result:', result);

            // Update crawl stats
            setCrawlStats({
                pagesVisited: result.stats?.pagesVisited || 0,
                pdfsFound: result.pdfs?.length || 0,
                pagesExtracted: result.pages?.length || 0
            });

            // Map results for selection - combine PDFs and pages
            const pdfFiles = (result.pdfs || []).map(pdf => ({
                url: pdf.url,
                title: pdf.title || pdf.url.split('/').pop(),
                type: 'pdf',
                selected: true
            }));

            const pageFiles = (result.pages || []).map(page => ({
                url: page.url,
                title: page.title || 'Web Page',
                type: 'page',
                content: page.content, // Extracted markdown content
                wordCount: page.content ? page.content.split(/\s+/).length : 0,
                selected: page.content && page.content.length > 200 // Auto-select pages with substantial content
            }));

            const files = [...pdfFiles, ...pageFiles];

            setScrapedFiles(files);
            setScrapeStep('review');
        } catch (err) {
            console.error('[Scraper v2] Crawl Failed:', err);
            setError(`Crawl failed: ${err.message}`);
        } finally {
            setScanning(false);
        }
    };

    const handleImportSelected = async () => {
        const selected = scrapedFiles.filter(f => f.selected);
        if (selected.length === 0) return;

        setScrapeStep('processing');
        setImportStats({ current: 0, total: selected.length, success: 0, failed: 0 });

        const mfg = manufacturers.find(m => m.id === scrapeConfig.manufacturerId);
        const mfgName = mfg ? mfg.name : 'General';
        // SharePoint Knowledge library URL
        const libraryUrl = 'https://isehome.sharepoint.com/sites/Unicorn/Knowledge';

        try {
            setUploadProgress(`Importing ${selected.length} items to SharePoint...`);

            // Format items for v2 batch import
            const items = selected.map(file => ({
                url: file.url,
                title: file.title,
                type: file.type,
                content: file.content // For pages, include extracted content
            }));

            // Use v2 batch import
            const result = await knowledgeService.importCrawledItems({
                items,
                manufacturerName: mfgName,
                libraryUrl
            });

            console.log('[Scraper v2] Import result:', result);

            // Create document records in Supabase for each imported item
            let successCount = 0;
            let failedCount = 0;

            for (const imported of result.imported || []) {
                try {
                    setImportStats(prev => ({ ...prev, current: prev.current + 1 }));
                    setUploadProgress(`Creating record ${successCount + failedCount + 1} of ${result.imported.length}...`);

                    await knowledgeService.createDocument({
                        manufacturerId: scrapeConfig.manufacturerId || null,
                        title: imported.title || imported.filename,
                        fileName: imported.filename,
                        fileType: imported.type === 'page' ? 'md' : 'pdf',
                        fileSize: imported.size || 0,
                        fileUrl: imported.webUrl,
                        category: imported.type === 'page' ? 'user-manual' : 'spec-sheet',
                        description: `Scraped from ${imported.sourceUrl}`,
                        tags: ['scraped', imported.type]
                    });

                    successCount++;
                } catch (err) {
                    console.error('Failed to create document record:', err);
                    failedCount++;
                }
            }

            setImportStats({
                current: selected.length,
                total: selected.length,
                success: successCount,
                failed: failedCount + (result.failed?.length || 0)
            });

        } catch (err) {
            console.error('[Scraper v2] Import failed:', err);
            setError(`Import failed: ${err.message}`);
            setImportStats(prev => ({ ...prev, failed: prev.total }));
        }

        setScrapeStep('complete');
        loadData(); // Refresh list
    };

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState(null);
    const [searching, setSearching] = useState(false);

    // Load data
    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const [mfgs, docs] = await Promise.all([
                knowledgeService.getManufacturers(),
                knowledgeService.getDocuments(selectedManufacturer)
            ]);

            setManufacturers(mfgs);
            setDocuments(docs);
        } catch (err) {
            console.error('Failed to load knowledge data:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [selectedManufacturer]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Add manufacturer
    const handleAddManufacturer = async (e) => {
        e.preventDefault();
        if (!newManufacturer.name.trim()) return;

        try {
            await knowledgeService.createManufacturer(newManufacturer);
            setNewManufacturer({ name: '', description: '' });
            setShowAddManufacturer(false);
            await loadData();
        } catch (err) {
            setError(err.message);
        }
    };

    // Delete manufacturer
    const handleDeleteManufacturer = async (id) => {
        if (!window.confirm('Delete this manufacturer? Documents will keep their content but lose the manufacturer tag.')) {
            return;
        }

        try {
            await knowledgeService.deleteManufacturer(id);
            if (selectedManufacturer === id) {
                setSelectedManufacturer(null);
            }
            await loadData();
        } catch (err) {
            setError(err.message);
        }
    };

    // Handle file selection
    const handleFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            setUploadFile(file);
            // Auto-fill title from filename
            if (!uploadMetadata.title) {
                setUploadMetadata(prev => ({
                    ...prev,
                    title: file.name.replace(/\.[^/.]+$/, '')
                }));
            }
        }
    };

    // Upload document
    const handleUpload = async (e) => {
        e.preventDefault();
        if (!uploadFile) {
            setError('Please select a file');
            return;
        }

        try {
            setUploading(true);
            setUploadProgress('Uploading file...');

            const result = await knowledgeService.uploadAndProcessDocument(
                uploadFile,
                {
                    ...uploadMetadata,
                    manufacturerId: uploadMetadata.manufacturerId || selectedManufacturer
                },
                supabase
            );

            setUploadProgress('Processing document...');

            // If it's a PDF, we need to process it with the text
            const fileType = uploadFile.name.split('.').pop().toLowerCase();
            if (fileType === 'pdf') {
                // For PDFs, we need the user to provide the text or process on server
                setUploadProgress('PDF uploaded. Processing may take a moment...');
                await knowledgeService.processDocument(result.document.id);
            }

            // Reset form
            setUploadFile(null);
            setUploadMetadata({ title: '', category: 'other', description: '', manufacturerId: null });
            setShowUploadForm(false);
            setUploadProgress('');
            await loadData();
        } catch (err) {
            console.error('Upload failed:', err);
            setError(err.message);
        } finally {
            setUploading(false);
            setUploadProgress('');
        }
    };

    // Delete document
    const handleDeleteDocument = async (id) => {
        if (!window.confirm('Delete this document and all its content?')) {
            return;
        }

        try {
            await knowledgeService.deleteDocument(id);
            await loadData();
        } catch (err) {
            setError(err.message);
        }
    };

    // Search
    const handleSearch = async (e) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        try {
            setSearching(true);
            const results = await knowledgeService.searchKnowledge({
                query: searchQuery,
                manufacturerId: selectedManufacturer,
                limit: 10
            });
            setSearchResults(results);
        } catch (err) {
            setError(err.message);
        } finally {
            setSearching(false);
        }
    };

    // Get status badge
    const getStatusBadge = (status) => {
        switch (status) {
            case 'ready':
                return (
                    <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                        style={{ backgroundColor: 'rgba(148, 175, 50, 0.1)', color: '#94AF32' }}
                    >
                        <CheckCircle size={12} /> Ready
                    </span>
                );
            case 'processing':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                        <Loader2 size={12} className="animate-spin" /> Processing
                    </span>
                );
            case 'error':
                return (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        <AlertCircle size={12} /> Error
                    </span>
                );
            default:
                return null;
        }
    };

    // Category options
    const categories = [
        { value: 'spec-sheet', label: 'Spec Sheet' },
        { value: 'installation-guide', label: 'Installation Guide' },
        { value: 'troubleshooting', label: 'Troubleshooting' },
        { value: 'training', label: 'Training' },
        { value: 'technical-bulletin', label: 'Technical Bulletin' },
        { value: 'user-manual', label: 'User Manual' },
        { value: 'quick-reference', label: 'Quick Reference' },
        { value: 'other', label: 'Other' }
    ];

    return (
        <div className="space-y-4">
            {/* Header */}
            <section className="rounded-2xl border p-4" style={sectionStyles.card}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <BookOpen className="text-violet-500" size={24} />
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Knowledge Base</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Upload technical documentation for AI-powered search
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={() => setShowUploadForm(true)}
                        icon={Upload}
                        size="sm"
                    >
                        Upload Document
                    </Button>
                </div>

                {/* Error display */}
                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                        <div className="flex items-start gap-2">
                            <AlertCircle size={16} className="text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-xs text-red-800 dark:text-red-200">{error}</p>
                                <button
                                    onClick={() => setError(null)}
                                    className="text-xs text-red-600 dark:text-red-400 underline mt-1"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Search */}
                <form onSubmit={handleSearch} className="flex gap-2">
                    <div className="flex-1 relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search knowledge base..."
                            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100"
                        />
                    </div>
                    <Button type="submit" disabled={searching} size="sm">
                        {searching ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
                    </Button>
                </form>
            </section>

            {/* Search Results */}
            {searchResults && (
                <section className="rounded-2xl border p-4" style={sectionStyles.card}>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            Search Results ({searchResults.resultCount})
                        </h3>
                        <button
                            onClick={() => setSearchResults(null)}
                            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        >
                            Clear
                        </button>
                    </div>
                    {searchResults.results?.length > 0 ? (
                        <div className="space-y-3">
                            {searchResults.results.map((result, i) => (
                                <div
                                    key={result.chunkId || i}
                                    className="p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                            {result.documentTitle}
                                        </span>
                                        <span className="text-xs text-violet-600 dark:text-violet-400">
                                            {result.relevanceScore || Math.round(result.similarity * 100)}% match
                                        </span>
                                    </div>
                                    {result.manufacturer && (
                                        <span className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">
                                            {result.manufacturer}
                                        </span>
                                    )}
                                    <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-3">
                                        {result.content}
                                    </p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No results found</p>
                    )}
                </section>
            )}

            {/* Manufacturers */}
            <section className="rounded-2xl border p-4" style={sectionStyles.card}>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Building2 size={16} />
                        Manufacturers
                    </h3>
                    <button
                        onClick={() => setShowAddManufacturer(!showAddManufacturer)}
                        className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                    >
                        <Plus size={14} /> Add
                    </button>
                </div>

                {/* Add Manufacturer Form */}
                {showAddManufacturer && (
                    <form onSubmit={handleAddManufacturer} className="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-zinc-800/50 space-y-2">
                        <input
                            type="text"
                            value={newManufacturer.name}
                            onChange={(e) => setNewManufacturer(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="Manufacturer name"
                            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-800"
                        />
                        <input
                            type="text"
                            value={newManufacturer.description}
                            onChange={(e) => setNewManufacturer(prev => ({ ...prev, description: e.target.value }))}
                            placeholder="Description (optional)"
                            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-800"
                        />
                        <div className="flex gap-2">
                            <Button type="submit" size="sm">Add</Button>
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => setShowAddManufacturer(false)}
                            >
                                Cancel
                            </Button>
                        </div>
                    </form>
                )}

                {/* Manufacturer List */}
                {loading ? (
                    <div className="flex items-center justify-center py-4">
                        <Loader2 size={20} className="animate-spin text-violet-500" />
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => setSelectedManufacturer(null)}
                            className={`px-3 py-1.5 text-xs rounded-full transition ${selectedManufacturer === null
                                ? 'bg-violet-500 text-white'
                                : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'
                                }`}
                        >
                            All
                        </button>
                        {manufacturers.map(mfg => (
                            <div key={mfg.id} className="group relative">
                                <button
                                    onClick={() => setSelectedManufacturer(mfg.id)}
                                    className={`px-3 py-1.5 text-xs rounded-full transition ${selectedManufacturer === mfg.id
                                        ? 'bg-violet-500 text-white'
                                        : 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700'
                                        }`}
                                >
                                    {mfg.name}
                                </button>
                                <button
                                    onClick={() => handleDeleteManufacturer(mfg.id)}
                                    className="absolute -top-1 -right-1 hidden group-hover:flex w-4 h-4 items-center justify-center rounded-full bg-red-500 text-white text-xs"
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Documents */}
            <section className="rounded-2xl border p-4" style={sectionStyles.card}>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-3">
                    <FileText size={16} />
                    Documents ({documents.length})
                </h3>

                {documents.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                        No documents uploaded yet. Click "Upload Document" to add your first one.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {documents.map(doc => (
                            <div
                                key={doc.id}
                                className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                            >
                                <div
                                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/50"
                                    onClick={() => setExpandedDocs(prev => {
                                        const next = new Set(prev);
                                        if (next.has(doc.id)) {
                                            next.delete(doc.id);
                                        } else {
                                            next.add(doc.id);
                                        }
                                        return next;
                                    })}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        {expandedDocs.has(doc.id) ? (
                                            <ChevronDown size={16} className="text-gray-400 flex-shrink-0" />
                                        ) : (
                                            <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
                                        )}
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                                {doc.title}
                                            </p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                {doc.manufacturer?.name || 'General'} • {doc.file_type?.toUpperCase()} • {doc.chunk_count} chunks
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {getStatusBadge(doc.status)}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteDocument(doc.id);
                                            }}
                                            className="p-1.5 text-gray-400 hover:text-red-500 transition"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded details */}
                                {expandedDocs.has(doc.id) && (
                                    <div className="px-3 pb-3 pt-0 border-t border-gray-100 dark:border-gray-800">
                                        <div className="grid grid-cols-2 gap-2 text-xs mt-2">
                                            <div>
                                                <span className="text-gray-500 dark:text-gray-400">Category:</span>
                                                <span className="ml-2 text-gray-900 dark:text-gray-100">
                                                    {categories.find(c => c.value === doc.category)?.label || doc.category}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-gray-500 dark:text-gray-400">File:</span>
                                                <span className="ml-2 text-gray-900 dark:text-gray-100">{doc.file_name}</span>
                                            </div>
                                            {doc.description && (
                                                <div className="col-span-2">
                                                    <span className="text-gray-500 dark:text-gray-400">Description:</span>
                                                    <p className="text-gray-900 dark:text-gray-100 mt-1">{doc.description}</p>
                                                </div>
                                            )}
                                            {doc.error_message && (
                                                <div className="col-span-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-red-700 dark:text-red-300">
                                                    Error: {doc.error_message}
                                                </div>
                                            )}
                                            {doc.file_url && (
                                                <div className="col-span-2">
                                                    <a
                                                        href={doc.file_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400 hover:underline"
                                                    >
                                                        <ExternalLink size={12} /> View Original
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Scrapers Section */}
            <section className="rounded-2xl border p-4" style={sectionStyles.card}>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Globe size={16} />
                        Site Scraper
                    </h3>
                    {!showScraperForm && (
                        <button
                            onClick={() => setShowScraperForm(true)}
                            className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1"
                        >
                            <Plus size={14} /> New Scrape
                        </button>
                    )}
                </div>

                {showScraperForm && (
                    <div className="mb-4 p-4 rounded-lg bg-gray-50 dark:bg-zinc-800/50 space-y-4">
                        {/* Step 1: Configuration */}
                        {scrapeStep === 'config' && (
                            <form onSubmit={handleScanSite} className="space-y-3">
                                {/* Error Display */}
                                {error && (
                                    <div className="p-3 bg-red-100 border border-red-300 text-red-800 rounded text-xs mb-2">
                                        <strong>Error:</strong> {error}
                                        <br />
                                        <span className="opacity-75">Check browser console for details.</span>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Target URL</label>
                                        <input
                                            type="url"
                                            required
                                            value={scrapeConfig.url}
                                            onChange={e => setScrapeConfig(prev => ({ ...prev, url: e.target.value }))}
                                            placeholder="https://example.com/support"
                                            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-800"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Manufacturer</label>
                                        <select
                                            value={scrapeConfig.manufacturerId || ''}
                                            onChange={e => setScrapeConfig(prev => ({ ...prev, manufacturerId: e.target.value || null }))}
                                            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-800"
                                        >
                                            <option value="">General</option>
                                            {manufacturers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Crawl Depth</label>
                                        <select
                                            value={scrapeConfig.maxDepth}
                                            onChange={e => setScrapeConfig(prev => ({ ...prev, maxDepth: parseInt(e.target.value) }))}
                                            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-800"
                                        >
                                            <option value={1}>Shallow (1 level)</option>
                                            <option value={2}>Medium (2 levels)</option>
                                            <option value={3}>Deep (3 levels)</option>
                                            <option value={5}>Very Deep (5 levels)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Max Pages</label>
                                        <select
                                            value={scrapeConfig.maxPages}
                                            onChange={e => setScrapeConfig(prev => ({ ...prev, maxPages: parseInt(e.target.value) }))}
                                            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-800"
                                        >
                                            <option value={10}>10 pages</option>
                                            <option value={25}>25 pages</option>
                                            <option value={50}>50 pages</option>
                                            <option value={100}>100 pages</option>
                                        </select>
                                    </div>
                                </div>

                                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                    Deep crawler extracts both PDFs and web page content. Higher depth/pages = longer crawl time.
                                </p>

                                <div className="flex justify-end gap-2 pt-2">
                                    <Button type="button" variant="secondary" size="sm" onClick={() => setShowScraperForm(false)}>Cancel</Button>
                                    <Button type="submit" size="sm" disabled={scanning} onClick={handleScanSite}>
                                        {scanning ? <Loader2 size={14} className="animate-spin mr-1" /> : <Search size={14} className="mr-1" />}
                                        {scanning ? 'Crawling...' : 'Start Crawl'}
                                    </Button>
                                </div>
                            </form>
                        )}

                        {/* Step 2: Review */}
                        {scrapeStep === 'review' && (
                            <div className="space-y-3">
                                {/* Stats summary */}
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-medium">
                                        Found {scrapedFiles.filter(f => f.type === 'pdf').length} PDFs, {scrapedFiles.filter(f => f.type === 'page').length} pages
                                    </div>
                                    <div className="space-x-2 text-xs">
                                        <button onClick={() => setScrapedFiles(prev => prev.map(f => ({ ...f, selected: true })))} className="text-violet-600 hover:underline">Select All</button>
                                        <button onClick={() => setScrapedFiles(prev => prev.map(f => ({ ...f, selected: false })))} className="text-violet-600 hover:underline">Deselect All</button>
                                    </div>
                                </div>

                                {/* Crawl stats */}
                                <div className="flex gap-4 text-[10px] text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-zinc-800 rounded-lg px-3 py-2">
                                    <span>Pages visited: {crawlStats.pagesVisited}</span>
                                    <span>PDFs found: {crawlStats.pdfsFound}</span>
                                    <span>Content extracted: {crawlStats.pagesExtracted}</span>
                                </div>

                                {/* File list with type indicators */}
                                <div className="max-h-60 overflow-y-auto border rounded-lg bg-white dark:bg-zinc-900 p-2 space-y-1">
                                    {scrapedFiles.map((file, idx) => (
                                        <label key={idx} className="flex items-start gap-2 p-2 hover:bg-gray-50 dark:hover:bg-zinc-800 rounded cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={file.selected}
                                                onChange={() => {
                                                    const newFiles = [...scrapedFiles];
                                                    newFiles[idx].selected = !newFiles[idx].selected;
                                                    setScrapedFiles(newFiles);
                                                }}
                                                className="mt-1"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                                        file.type === 'pdf'
                                                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                    }`}>
                                                        {file.type === 'pdf' ? 'PDF' : 'PAGE'}
                                                    </span>
                                                    <span className="text-xs font-medium truncate">{file.title || 'Untitled'}</span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] text-gray-500 truncate flex-1" title={file.url}>{file.url}</span>
                                                    {file.wordCount > 0 && (
                                                        <span className="text-[10px] text-gray-400">{file.wordCount} words</span>
                                                    )}
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </div>

                                <div className="flex justify-between items-center pt-2">
                                    <span className="text-xs text-gray-500">
                                        {scrapedFiles.filter(f => f.selected).length} selected
                                    </span>
                                    <div className="flex gap-2">
                                        <Button variant="secondary" size="sm" onClick={() => setScrapeStep('config')}>Back</Button>
                                        <Button
                                            size="sm"
                                            onClick={handleImportSelected}
                                            disabled={scrapedFiles.filter(f => f.selected).length === 0}
                                        >
                                            Import Selected
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Processing */}
                        {scrapeStep === 'processing' && (
                            <div className="space-y-4 text-center py-4">
                                <Loader2 size={32} className="animate-spin mx-auto text-violet-500" />
                                <div>
                                    <h4 className="text-sm font-medium">Importing Documents...</h4>
                                    <p className="text-xs text-gray-500 mt-1">{uploadProgress}</p>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                                    <div
                                        className="bg-violet-600 h-2.5 rounded-full transition-all duration-300"
                                        style={{ width: `${(importStats.current / importStats.total) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        )}

                        {/* Step 4: Complete */}
                        {scrapeStep === 'complete' && (
                            <div className="space-y-4 text-center py-4">
                                <CheckCircle size={32} className="mx-auto" style={{ color: '#94AF32' }} />
                                <div>
                                    <h4 className="text-sm font-medium">Import Complete!</h4>
                                    <p className="text-xs text-gray-500 mt-1">
                                        Successfully imported {importStats.success} documents.
                                        {importStats.failed > 0 && ` (${importStats.failed} failed)`}
                                    </p>
                                </div>
                                <Button size="sm" onClick={() => {
                                    setShowScraperForm(false);
                                    setScrapeStep('config');
                                    loadData();
                                }}>Done</Button>
                            </div>
                        )}
                    </div>
                )}
            </section>
            {/* Upload Modal */}
            {showUploadForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl max-w-md w-full p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                            Upload Document
                        </h3>

                        <form onSubmit={handleUpload} className="space-y-4">
                            {/* File Input */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    File
                                </label>
                                <input
                                    type="file"
                                    accept=".pdf,.md,.txt,.docx"
                                    onChange={handleFileSelect}
                                    className="w-full text-sm text-gray-500 dark:text-gray-400
                                        file:mr-4 file:py-2 file:px-4
                                        file:rounded-full file:border-0
                                        file:text-sm file:font-semibold
                                        file:bg-violet-50 file:text-violet-700
                                        dark:file:bg-violet-900/30 dark:file:text-violet-300
                                        hover:file:bg-violet-100 dark:hover:file:bg-violet-900/50"
                                />
                                {uploadFile && (
                                    <p className="mt-1 text-xs text-gray-500">
                                        Selected: {uploadFile.name} ({Math.round(uploadFile.size / 1024)} KB)
                                    </p>
                                )}
                            </div>

                            {/* Title */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Title
                                </label>
                                <input
                                    type="text"
                                    value={uploadMetadata.title}
                                    onChange={(e) => setUploadMetadata(prev => ({ ...prev, title: e.target.value }))}
                                    placeholder="Document title"
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-800"
                                />
                            </div>

                            {/* Manufacturer */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Manufacturer
                                </label>
                                <select
                                    value={uploadMetadata.manufacturerId || ''}
                                    onChange={(e) => setUploadMetadata(prev => ({ ...prev, manufacturerId: e.target.value || null }))}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-800"
                                >
                                    <option value="">General (no manufacturer)</option>
                                    {manufacturers.map(mfg => (
                                        <option key={mfg.id} value={mfg.id}>{mfg.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Category */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Category
                                </label>
                                <select
                                    value={uploadMetadata.category}
                                    onChange={(e) => setUploadMetadata(prev => ({ ...prev, category: e.target.value }))}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-800"
                                >
                                    {categories.map(cat => (
                                        <option key={cat.value} value={cat.value}>{cat.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Description */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Description (optional)
                                </label>
                                <textarea
                                    value={uploadMetadata.description}
                                    onChange={(e) => setUploadMetadata(prev => ({ ...prev, description: e.target.value }))}
                                    placeholder="Brief description of the document"
                                    rows={2}
                                    className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-800 resize-none"
                                />
                            </div>

                            {/* Progress */}
                            {uploadProgress && (
                                <div className="flex items-center gap-2 text-sm text-violet-600 dark:text-violet-400">
                                    <Loader2 size={16} className="animate-spin" />
                                    {uploadProgress}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3 pt-2">
                                <Button
                                    type="submit"
                                    disabled={!uploadFile || uploading}
                                    className="flex-1"
                                >
                                    {uploading ? 'Uploading...' : 'Upload'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() => {
                                        setShowUploadForm(false);
                                        setUploadFile(null);
                                        setUploadMetadata({ title: '', category: 'other', description: '', manufacturerId: null });
                                    }}
                                    disabled={uploading}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default KnowledgeManagementPanel;
