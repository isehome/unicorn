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
    ExternalLink
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
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
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
                            className={`px-3 py-1.5 text-xs rounded-full transition ${
                                selectedManufacturer === null
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
                                    className={`px-3 py-1.5 text-xs rounded-full transition ${
                                        selectedManufacturer === mfg.id
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
