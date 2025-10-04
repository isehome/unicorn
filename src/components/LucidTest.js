import React, { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { enhancedStyles } from '../styles/styleSystem';
import Button from './ui/Button';
import { fetchDocumentContents, extractShapes, extractDocumentIdFromUrl } from '../services/lucidApi';
import { 
  FileText, 
  Key, 
  Download, 
  ChevronDown, 
  ChevronRight, 
  Copy, 
  CheckCircle,
  AlertCircle,
  Loader,
  Link as LinkIcon
} from 'lucide-react';

const LucidTest = () => {
  const { mode } = useTheme();
  const sectionStyles = enhancedStyles.sections[mode];
  
  const [documentId, setDocumentId] = useState('');
  const [documentData, setDocumentData] = useState(null);
  const [shapes, setShapes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedPages, setExpandedPages] = useState({});
  const [expandedRawJson, setExpandedRawJson] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [filterDropsOnly, setFilterDropsOnly] = useState(true); // Default to showing wire drops only

  const handleUrlPaste = (e) => {
    const pastedText = e.clipboardData.getData('text');
    const extractedId = extractDocumentIdFromUrl(pastedText);
    if (extractedId) {
      setDocumentId(extractedId);
      e.preventDefault();
    }
  };

  const handleFetchDocument = async () => {
    if (!documentId.trim()) {
      setError('Please enter a document ID or URL');
      return;
    }

    setLoading(true);
    setError(null);
    setDocumentData(null);
    setShapes([]);
    setExpandedPages({});

    try {
      const data = await fetchDocumentContents(documentId.trim());
      setDocumentData(data);
      
      const extractedShapes = extractShapes(data);
      setShapes(extractedShapes);
      
      // Auto-expand first page if exists
      if (data.pages && data.pages.length > 0) {
        setExpandedPages({ [data.pages[0].id]: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const togglePageExpansion = (pageId) => {
    setExpandedPages(prev => ({
      ...prev,
      [pageId]: !prev[pageId]
    }));
  };

  const copyToClipboard = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getShapeColor = (shapeClass) => {
    const colors = {
      'TerminatorBlock': 'bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
      'ProcessBlock': 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300',
      'DecisionBlock': 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300',
      'DataBlock': 'bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300',
      'default': 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
    };
    return colors[shapeClass] || colors.default;
  };

  const groupShapesByPage = () => {
    const grouped = {};
    const filteredShapes = filterDropsOnly 
      ? shapes.filter(s => s.customData['IS Drop'] === 'True')
      : shapes;
      
    filteredShapes.forEach(shape => {
      if (!grouped[shape.pageId]) {
        grouped[shape.pageId] = {
          pageTitle: shape.pageTitle,
          shapes: []
        };
      }
      grouped[shape.pageId].shapes.push(shape);
    });
    return grouped;
  };

  const groupedShapes = documentData ? groupShapesByPage() : {};
  const dropCount = shapes.filter(s => s.customData['IS Drop'] === 'True').length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors pb-20">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Input Form */}
        <div style={sectionStyles.card} className="mb-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <LinkIcon className="w-4 h-4 inline mr-2" />
                Document ID or URL
              </label>
              <input
                type="text"
                placeholder="Enter Lucid document ID or paste full URL"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                onPaste={handleUrlPaste}
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-violet-500"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Paste a URL like: https://lucid.app/lucidchart/DOC-ID-HERE/edit
              </p>
            </div>

            <Button 
              variant="primary" 
              icon={Download}
              onClick={handleFetchDocument}
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Fetching Document...' : 'Fetch Document'}
            </Button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div style={sectionStyles.card} className="text-center py-12">
            <Loader className="w-8 h-8 animate-spin text-violet-500 dark:text-violet-300 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Loading document from Lucid API...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div style={sectionStyles.card} className="mb-6">
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-900 dark:text-red-200 mb-1">Error</h3>
                <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Success State - Document Info */}
        {documentData && !loading && (
          <>
            <div style={sectionStyles.card} className="mb-6">
              <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg mb-4">
                <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-green-900 dark:text-green-200 mb-1">Document Loaded Successfully</h3>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Found {documentData.pages?.length || 0} page(s) with {shapes.length} shape(s)
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Pages:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{documentData.pages?.length || 0}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Total Shapes:</span>
                  <span className="font-medium text-gray-900 dark:text-white">{shapes.length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Wire Drops (IS Drop = True):</span>
                  <span className="font-medium text-violet-600 dark:text-violet-400">{dropCount}</span>
                </div>
              </div>
            </div>

            {/* Shapes by Page */}
            <div style={sectionStyles.card} className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-violet-500 dark:text-violet-300" />
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Shapes by Page</h2>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={filterDropsOnly}
                    onChange={(e) => setFilterDropsOnly(e.target.checked)}
                    className="w-4 h-4 text-violet-600 border-gray-300 rounded focus:ring-violet-500"
                  />
                  <span className="text-gray-700 dark:text-gray-300">Show Wire Drops Only</span>
                </label>
              </div>

              <div className="space-y-3">
                {Object.entries(groupedShapes).map(([pageId, pageData]) => (
                  <div key={pageId} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => togglePageExpansion(pageId)}
                      className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {expandedPages[pageId] ? (
                          <ChevronDown className="w-4 h-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        )}
                        <span className="font-medium text-gray-900 dark:text-white">
                          {pageData.pageTitle || 'Untitled Page'}
                        </span>
                      </div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {pageData.shapes.length} shape{pageData.shapes.length !== 1 ? 's' : ''}
                      </span>
                    </button>

                    {expandedPages[pageId] && (
                      <div className="p-4 space-y-3 bg-white dark:bg-gray-900">
                        {pageData.shapes.map((shape) => (
                          <div
                            key={shape.id}
                            className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                          >
                            <div className="space-y-3">
                              {/* Shape Header */}
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className={`px-2 py-1 text-xs font-semibold rounded ${getShapeColor(shape.class)}`}>
                                      {shape.class}
                                    </span>
                                    {shape.text && (
                                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                                        "{shape.text}"
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Shape ID:</span>
                                    <code className="text-xs font-mono px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded">
                                      {shape.id}
                                    </code>
                                    <button
                                      onClick={() => copyToClipboard(shape.id, shape.id)}
                                      className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                      title="Copy Shape ID"
                                    >
                                      {copiedId === shape.id ? (
                                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                                      ) : (
                                        <Copy className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Position & Size Info - Only show if available */}
                              {(shape.position.x !== 0 || shape.position.y !== 0 || shape.size.width !== 0 || shape.size.height !== 0) ? (
                                <div className="grid grid-cols-2 gap-3 text-xs p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">Position:</span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      ({shape.position.x.toFixed(1)}, {shape.position.y.toFixed(1)})
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600 dark:text-gray-400">Size:</span>
                                    <span className="ml-2 text-gray-900 dark:text-white">
                                      {shape.size.width.toFixed(1)} × {shape.size.height.toFixed(1)}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-xs p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                                  <span className="text-yellow-700 dark:text-yellow-300">
                                    ⚠️ Position data not available in API response
                                  </span>
                                </div>
                              )}
                            </div>

                            {Object.keys(shape.customData).length > 0 && (
                              <div className="mt-3">
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Custom Data:</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {Object.entries(shape.customData).map(([key, value]) => {
                                    const isImportant = ['IS Drop', 'Wire Type', 'UID', 'Room Name', 'Drop Name'].includes(key);
                                    return (
                                      <div 
                                        key={key}
                                        className={`text-xs p-2 rounded ${
                                          isImportant
                                            ? 'bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800'
                                            : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'
                                        }`}
                                      >
                                        <span className="font-medium text-gray-600 dark:text-gray-400">{key}:</span>
                                        <span className="ml-2 text-gray-900 dark:text-white break-all">
                                          {value || <span className="text-gray-400 italic">(empty)</span>}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Raw JSON */}
            <div style={sectionStyles.card}>
              <button
                onClick={() => setExpandedRawJson(!expandedRawJson)}
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  {expandedRawJson ? (
                    <ChevronDown className="w-4 h-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-500" />
                  )}
                  <span className="font-medium text-gray-900 dark:text-white">Raw JSON Response</span>
                </div>
              </button>

              {expandedRawJson && (
                <div className="mt-4">
                  <div className="relative">
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(documentData, null, 2), 'json')}
                      className="absolute top-2 right-2 p-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors z-10"
                      title="Copy JSON"
                    >
                      {copiedId === 'json' ? (
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      )}
                    </button>
                    <pre className="p-4 bg-gray-900 dark:bg-black text-green-400 text-xs rounded-lg overflow-x-auto max-h-96">
                      {JSON.stringify(documentData, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Empty State */}
        {!documentData && !loading && !error && (
          <div style={sectionStyles.card} className="text-center py-12">
            <FileText className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Lucid Chart Wire Map Integration
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
              Enter your Lucid document ID and API key above to fetch wire map data and view shape IDs
              for integration with your wire drop database.
            </p>
            <div className="text-left max-w-md mx-auto space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <p>• Each shape has a unique ItemId that can link to wire_drops records</p>
              <p>• Shape customData can store wire drop metadata</p>
              <p>• Position data helps identify drop locations on the map</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LucidTest;
